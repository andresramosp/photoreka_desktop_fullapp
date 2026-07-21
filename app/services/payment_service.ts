import Stripe from 'stripe'
import stripeConfig from '#config/stripe'
import Payment from '#models/payment'
import User from '#models/user'
import UsageService, { getDefaultUsageByTier, UsageTier } from '#services/usage_service'
import GeoRecoveryPaymentService from '#services/geo_recovery_payment_service'
import {
  type PhotoPackage,
  type CreditStep,
  type PaymentCatalog,
  type PaymentCatalogItem,
  parsePaymentCatalogItem,
  tryParsePaymentCatalogItem,
} from '../payment_products.js'

export interface PromotionInfo {
  percentOff: number | null
  amountOff: number | null
  currency: string | null
  name: string | null
}

let stripeClient: Stripe | null = null
let catalogCache: { expiresAt: number; catalog: PaymentCatalog } | null = null
let promotionCache: { expiresAt: number; promotion: PromotionInfo | null } | null = null

const CATALOG_CACHE_TTL_MS = 60_000
const PROMOTION_CACHE_TTL_MS = 300_000

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(stripeConfig.secretKey, { apiVersion: '2026-03-25.dahlia' })
  }
  return stripeClient
}

export default class PaymentService {
  // ─── Catálogo ─────────────────────────────────────────────────────────────

  static async getCatalog(): Promise<PaymentCatalog> {
    if (catalogCache && catalogCache.expiresAt > Date.now()) {
      return catalogCache.catalog
    }

    const stripe = getStripe()
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100,
    })

    const seenProductIds = new Set<string>()
    const items = prices.data
      .map((price) =>
        tryParsePaymentCatalogItem(price, {
          requireActive: true,
          currency: stripeConfig.catalogCurrency,
        })
      )
      .filter((item): item is PaymentCatalogItem => item !== null)
      .filter((item) => {
        if (seenProductIds.has(item.stripeProductId)) return false
        seenProductIds.add(item.stripeProductId)
        return true
      })
      .sort(sortCatalogItems)

    const catalog = {
      photoPackages: items.filter((item): item is PhotoPackage => item.type === 'photo_package'),
      creditSteps: items.filter((item): item is CreditStep => item.type === 'credits'),
    }

    catalogCache = {
      expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
      catalog,
    }

    return catalog
  }

  static async getPhotoPackages(): Promise<PhotoPackage[]> {
    const catalog = await this.getCatalog()
    return catalog.photoPackages
  }

  static async getCreditSteps(): Promise<CreditStep[]> {
    const catalog = await this.getCatalog()
    return catalog.creditSteps
  }

  static async getPromotion(): Promise<PromotionInfo | null> {
    const couponId = stripeConfig.promotionCouponId
    if (!couponId) return null

    if (promotionCache && promotionCache.expiresAt > Date.now()) {
      return promotionCache.promotion
    }

    try {
      const stripe = getStripe()
      const coupon = await stripe.coupons.retrieve(couponId)
      const promotion: PromotionInfo | null = coupon.valid
        ? {
            percentOff: coupon.percent_off ?? null,
            amountOff: coupon.amount_off ?? null,
            currency: coupon.currency ?? null,
            name: coupon.name ?? null,
          }
        : null
      promotionCache = { expiresAt: Date.now() + PROMOTION_CACHE_TTL_MS, promotion }
      return promotion
    } catch {
      return null
    }
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────

  static async createCheckoutSession(
    userId: number,
    type: 'photo_package' | 'credits',
    stripePriceId: string
  ): Promise<{ url: string }> {
    const stripe = getStripe()
    const item = await this.getCatalogItemForCheckout(stripePriceId, type)
    const analyzedPhotosGranted = item.type === 'photo_package' ? item.photos : 0

    const user = await User.findOrFail(userId)
    const stripeCustomerId = await this.ensureStripeCustomer(user)

    // Crear registro de pago pendiente
    const payment = await Payment.create({
      userId,
      userEmailSnapshot: user.email,
      stripeCustomerId,
      type,
      packageId: item.id,
      stripePriceId: item.stripePriceId,
      stripeProductId: item.stripeProductId,
      productName: item.name,
      analyzedPhotosGranted,
      creditsGranted: item.credits,
      amountEur: item.priceEur,
      status: 'pending',
    })

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: item.stripePriceId,
          quantity: 1,
        },
      ],
      client_reference_id: String(userId),
      metadata: {
        userId: String(userId),
        paymentId: String(payment.id),
        type,
        stripeCustomerId,
        stripePriceId: item.stripePriceId,
        stripeProductId: item.stripeProductId,
      },
      payment_intent_data: {
        metadata: {
          userId: String(userId),
          paymentId: String(payment.id),
          type,
          stripeCustomerId,
          stripePriceId: item.stripePriceId,
          stripeProductId: item.stripeProductId,
        },
      },
      success_url: appendSessionId(stripeConfig.successUrl),
      cancel_url: stripeConfig.cancelUrl,
      // Descuento automático global. Se aplica si STRIPE_PROMOTION_COUPON_ID está configurado.
      // Para aplicar un cupón específico por producto, usuario o campaña:
      //   discounts: [{ coupon: 'coupon_id_especifico' }]
      // Para permitir que el usuario ingrese un código promo manualmente:
      //   allow_promotion_codes: true  (no se puede combinar con discounts[])
      ...(stripeConfig.promotionCouponId
        ? { discounts: [{ coupon: stripeConfig.promotionCouponId }] }
        : {}),
    })

    // Guardar el session ID de Stripe
    payment.stripeSessionId = session.id
    await payment.save()

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    return { url: session.url }
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  static async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    const stripe = getStripe()

    const event = stripe.webhooks.constructEvent(rawBody, signature, stripeConfig.webhookSecret)

    const geoRecoveryPaymentService = new GeoRecoveryPaymentService()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.type !== 'geo_recovery') {
          await this.handleCheckoutCompleted(session)
        }
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.type !== 'geo_recovery') {
          await this.handleCheckoutExpired(session)
        }
        break
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        if (pi.metadata?.type === 'geo_recovery') {
          await geoRecoveryPaymentService.handlePaymentIntentSucceeded(pi)
        }
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        if (pi.metadata?.type === 'geo_recovery') {
          await geoRecoveryPaymentService.handlePaymentIntentFailed(pi)
        }
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await this.handleRefund(charge)
        break
      }
    }
  }

  private static async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const paymentId = Number(session.metadata?.paymentId)
    const payment = paymentId
      ? await Payment.find(paymentId)
      : await Payment.query().where('stripe_session_id', session.id).first()

    if (!payment) return

    // Idempotencia: si ya está completado, no hacer nada
    if (payment.status === 'completed') return

    const stripeCustomerId = getStripeCustomerId(session.customer)
    if (stripeCustomerId) {
      if (payment.stripeCustomerId && payment.stripeCustomerId !== stripeCustomerId) {
        console.warn(
          '[PaymentService] Stripe customer mismatch for payment:',
          payment.id,
          payment.stripeCustomerId,
          stripeCustomerId
        )
      } else {
        payment.stripeCustomerId = stripeCustomerId
      }

      if (payment.userId) {
        await this.attachStripeCustomerToUser(payment.userId, stripeCustomerId)
      }
    }

    payment.stripePaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null

    // Use the actual charged amount (after discounts) from Stripe, in euros
    if (session.amount_total != null) {
      payment.amountEur = session.amount_total / 100
    }

    payment.status = 'completed'
    await payment.save()

    // Provisionar al usuario
    await this.provisionPayment(payment)
  }

  private static async handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
    const paymentId = Number(session.metadata?.paymentId)
    const payment = paymentId
      ? await Payment.find(paymentId)
      : await Payment.query().where('stripe_session_id', session.id).first()

    if (!payment || payment.status !== 'pending') return

    payment.status = 'failed'
    await payment.save()
  }

  private static async handleRefund(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id

    if (!paymentIntentId) return

    const payment = await Payment.query()
      .where('stripe_payment_intent_id', paymentIntentId)
      .where('status', 'completed')
      .first()

    if (!payment) return

    payment.status = 'refunded'
    await payment.save()

    // Revertir provisioning
    await this.deprovisionPayment(payment)
  }

  // ─── Provisioning ────────────────────────────────────────────────────────

  private static async provisionPayment(payment: Payment): Promise<void> {
    const user = await User.findOrFail(payment.userId)
    const usage = user.usage || getDefaultUsageByTier(UsageTier.BASIC)

    usage.analyzedPhotosLimit += payment.analyzedPhotosGranted
    usage.creditsAvailable += payment.creditsGranted

    await UsageService.updateUsage(user.id, usage)
  }

  private static async deprovisionPayment(payment: Payment): Promise<void> {
    const user = await User.findOrFail(payment.userId)
    const usage = user.usage
    if (!usage) return

    usage.analyzedPhotosLimit = Math.max(
      0,
      usage.analyzedPhotosLimit - payment.analyzedPhotosGranted
    )
    usage.creditsAvailable = Math.max(0, usage.creditsAvailable - payment.creditsGranted)

    await UsageService.updateUsage(user.id, usage)
  }

  // ─── Historial ────────────────────────────────────────────────────────────

  static async getHistory(userId: number): Promise<Payment[]> {
    return Payment.query().where('userId', userId).orderBy('created_at', 'desc').limit(50)
  }

  // ─── Verificar estado de sesión ──────────────────────────────────────────

  static async verifySession(sessionId: string, userId: number): Promise<Payment | null> {
    return Payment.query().where('stripe_session_id', sessionId).where('user_id', userId).first()
  }

  private static async ensureStripeCustomer(user: User): Promise<string> {
    const stripe = getStripe()

    if (user.stripeCustomerId) {
      const customer = await this.retrieveActiveStripeCustomer(user.stripeCustomerId)
      if (customer) {
        await this.syncStripeCustomer(customer.id, user)
        return customer.id
      }

      user.stripeCustomerId = null
    }

    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: user.name || undefined,
        metadata: buildUserCustomerMetadata(user.id),
      },
      {
        idempotencyKey: `photoreka-user-${user.id}-stripe-customer`,
      }
    )

    user.stripeCustomerId = customer.id
    await user.save()

    return customer.id
  }

  private static async retrieveActiveStripeCustomer(
    stripeCustomerId: string
  ): Promise<Stripe.Customer | null> {
    const stripe = getStripe()

    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)

      if ('deleted' in customer && customer.deleted) return null

      return customer
    } catch (error) {
      if ((error as { type?: string }).type === 'StripeInvalidRequestError') return null

      throw error
    }
  }

  private static async syncStripeCustomer(stripeCustomerId: string, user: User): Promise<void> {
    const stripe = getStripe()

    await stripe.customers.update(stripeCustomerId, {
      email: user.email,
      name: user.name || undefined,
      metadata: buildUserCustomerMetadata(user.id),
    })
  }

  private static async attachStripeCustomerToUser(
    userId: number,
    stripeCustomerId: string
  ): Promise<void> {
    const user = await User.find(userId)
    if (!user) return

    if (!user.stripeCustomerId) {
      user.stripeCustomerId = stripeCustomerId
      await user.save()
      return
    }

    if (user.stripeCustomerId !== stripeCustomerId) {
      console.warn(
        '[PaymentService] Stripe customer mismatch for user:',
        userId,
        user.stripeCustomerId,
        stripeCustomerId
      )
    }
  }

  private static async getCatalogItemForCheckout(
    stripePriceId: string,
    expectedType: 'photo_package' | 'credits'
  ): Promise<PaymentCatalogItem> {
    const stripe = getStripe()

    let price: Stripe.Price

    try {
      price = await stripe.prices.retrieve(stripePriceId, {
        expand: ['product'],
      })
    } catch (error) {
      if ((error as { type?: string }).type === 'StripeInvalidRequestError') {
        throw new Error(`Unknown ${expectedType} price: ${stripePriceId}`)
      }

      throw error
    }

    const item = parsePaymentCatalogItem(price, {
      requireActive: true,
      currency: stripeConfig.catalogCurrency,
    })

    if (item.type !== expectedType) {
      throw new Error(`Unknown ${expectedType} price: ${stripePriceId}`)
    }

    return item
  }
}

function sortCatalogItems(a: PaymentCatalogItem, b: PaymentCatalogItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  if (a.priceEur !== b.priceEur) return a.priceEur - b.priceEur
  return a.name.localeCompare(b.name)
}

function appendSessionId(successUrl: string): string {
  const separator = successUrl.includes('?') ? '&' : '?'
  return `${successUrl}${separator}session_id={CHECKOUT_SESSION_ID}`
}

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null
  if (typeof customer === 'string') return customer
  return customer.id
}

function buildUserCustomerMetadata(userId: number): Stripe.MetadataParam {
  return {
    photorekaUserId: String(userId),
  }
}
