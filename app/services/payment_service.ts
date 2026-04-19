import Stripe from 'stripe'
import stripeConfig from '#config/stripe'
import Payment from '#models/payment'
import User from '#models/user'
import UsageService from '#services/usage_service'
import {
  getPhotoPackage,
  getCreditStep,
  photoPackages,
  creditSteps,
  type PhotoPackage,
  type CreditStep,
} from '../payment_packages.js'

let _stripe: Stripe | null = null

function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2025-04-30.basil' })
  }
  return _stripe
}

export default class PaymentService {
  // ─── Catálogo ─────────────────────────────────────────────────────────────

  static getPhotoPackages(): PhotoPackage[] {
    return photoPackages
  }

  static getCreditSteps(): CreditStep[] {
    return creditSteps
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────

  static async createCheckoutSession(
    userId: number,
    type: 'photo_package' | 'credits',
    itemId: string
  ): Promise<{ url: string }> {
    const stripe = getStripe()

    let name: string
    let description: string
    let priceEur: number
    let photosGranted = 0
    let analyzedPhotosGranted = 0
    let creditsGranted = 0

    if (type === 'photo_package') {
      const pkg = getPhotoPackage(itemId)
      if (!pkg) throw new Error(`Unknown photo package: ${itemId}`)
      name = `${pkg.name} — ${pkg.photos.toLocaleString()} photos`
      description = `${pkg.photos.toLocaleString()} photos + ${pkg.credits.toLocaleString()} credits`
      priceEur = pkg.priceEur
      photosGranted = pkg.photos
      analyzedPhotosGranted = pkg.analyzedPhotos
      creditsGranted = pkg.credits
    } else {
      const step = getCreditStep(itemId)
      if (!step) throw new Error(`Unknown credit step: ${itemId}`)
      name = `${step.credits.toLocaleString()} credits`
      description = step.description
      priceEur = step.priceEur
      creditsGranted = step.credits
    }

    // Crear registro de pago pendiente
    const payment = await Payment.create({
      userId,
      type,
      packageId: itemId,
      photosGranted,
      analyzedPhotosGranted,
      creditsGranted,
      amountEur: priceEur,
      status: 'pending',
    })

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name,
              description,
            },
            unit_amount: Math.round(priceEur * 100), // Stripe usa céntimos
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(userId),
        paymentId: String(payment.id),
      },
      success_url: `${stripeConfig.successUrl}&session_id={CHECKOUT_SESSION_ID}`,
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
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await this.handleRefund(charge)
        break
      }
    }
  }

  private static async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const paymentId = Number(session.metadata?.paymentId)
    if (!paymentId) return

    const payment = await Payment.find(paymentId)
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

    usage.photosLimit += payment.photosGranted
    usage.analyzedPhotosLimit += payment.analyzedPhotosGranted
    usage.creditsAvailable += payment.creditsGranted

    await UsageService.updateUsage(user.id, usage)
  }

  private static async deprovisionPayment(payment: Payment): Promise<void> {
    const user = await User.findOrFail(payment.userId)
    const usage = user.usage
    if (!usage) return

    usage.photosLimit = Math.max(0, usage.photosLimit - payment.photosGranted)
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
}
