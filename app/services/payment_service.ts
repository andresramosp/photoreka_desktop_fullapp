import Stripe from 'stripe'
import stripeConfig from '#config/stripe'
import Payment from '#models/payment'
import User from '#models/user'
import UsageService from '#services/usage_service'
import {
  type PhotoPackage,
  type CreditStep,
  type PaymentCatalog,
  type PaymentCatalogItem,
  parsePaymentCatalogItem,
  tryParsePaymentCatalogItem,
} from '../payment_products.js'

let _stripe: Stripe | null = null
let catalogCache: { expiresAt: number; catalog: PaymentCatalog } | null = null

const CATALOG_CACHE_TTL_MS = 60_000

function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2025-04-30.basil' })
  }
  return _stripe
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

    const items = prices.data
      .map((price) =>
        tryParsePaymentCatalogItem(price, {
          requireActive: true,
          currency: stripeConfig.catalogCurrency,
        })
      )
      .filter((item): item is PaymentCatalogItem => item !== null)
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
    return (await this.getCatalog()).photoPackages
  }

  static async getCreditSteps(): Promise<CreditStep[]> {
    return (await this.getCatalog()).creditSteps
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

    // Crear registro de pago pendiente
    const user = await User.findOrFail(userId)
    const payment = await Payment.create({
      userId,
      userEmailSnapshot: user.email,
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
        stripePriceId: item.stripePriceId,
        stripeProductId: item.stripeProductId,
      },
      payment_intent_data: {
        metadata: {
          userId: String(userId),
          paymentId: String(payment.id),
          type,
          stripePriceId: item.stripePriceId,
          stripeProductId: item.stripeProductId,
        },
      },
      success_url: appendSessionId(stripeConfig.successUrl),
      cancel_url: stripeConfig.cancelUrl,
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

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await this.handleCheckoutCompleted(session)
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        await this.handleCheckoutExpired(session)
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

    payment.stripePaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null
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
    const usage = user.usage || {
      photosLimit: 0,
      analyzedPhotosLimit: 0,
      creditsAvailable: 0,
      creditsUsed: 0,
      analyzedPhotosUsed: 0,
    }

    usage.photosLimit += payment.analyzedPhotosGranted
    usage.analyzedPhotosLimit += payment.analyzedPhotosGranted
    usage.creditsAvailable += payment.creditsGranted

    await UsageService.updateUsage(user.id, usage)
  }

  private static async deprovisionPayment(payment: Payment): Promise<void> {
    const user = await User.findOrFail(payment.userId)
    const usage = user.usage
    if (!usage) return

    usage.photosLimit = Math.max(0, usage.photosLimit - payment.analyzedPhotosGranted)
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
