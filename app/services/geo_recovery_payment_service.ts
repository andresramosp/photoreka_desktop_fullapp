/**
 * GeoRecoveryPaymentService
 *
 * Handles Stripe Payment Element for the anonymous geo-recovery one-shot product.
 * Pricing: €0.005 per photo, minimum charge of €0.50 (Stripe minimum).
 *
 * Unlike the main PaymentService this flow is fully anonymous â€” no user ID.
 * Payment records are stored in geo_recovery_payments (separate table).
 *
 * Flow:
 *   1. createPaymentIntent  â€” frontend calls before showing the embedded card form
 *   2. Stripe confirms in browser (no page redirect)
 *   3. confirmPaymentIntent â€” frontend calls after Stripe confirms; marks session as paid
 *   4. Webhook (payment_intent.succeeded) â€” idempotently captures email, marks paid
 */

import Stripe from 'stripe'
import stripeConfig from '#config/stripe'
import GeoRecoveryPayment from '#models/geo_recovery_payment'
import GeoRecoverySessionService from '#services/geo_recovery_session_service'

/** Price per photo in EUR. */
export const PRICE_PER_PHOTO_EUR = 0.5
/** Stripe minimum charge in EUR. */
export const MIN_CHARGE_EUR = 0.5

let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(stripeConfig.secretKey, { apiVersion: '2026-03-25.dahlia' })
  }
  return stripeClient
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getExpandedCharge(paymentIntent: Stripe.PaymentIntent): Stripe.Charge | null {
  const latestCharge = paymentIntent.latest_charge
  if (!latestCharge || typeof latestCharge === 'string') return null
  return latestCharge
}

function getExpandedPaymentMethod(
  paymentIntent: Stripe.PaymentIntent
): Stripe.PaymentMethod | null {
  const paymentMethod = paymentIntent.payment_method
  if (!paymentMethod || typeof paymentMethod === 'string') return null
  return paymentMethod
}

function getExpandedCustomer(paymentIntent: Stripe.PaymentIntent): Stripe.Customer | null {
  const customer = paymentIntent.customer
  if (!customer || typeof customer === 'string' || customer.deleted) return null
  return customer
}

function getCustomerId(paymentIntent: Stripe.PaymentIntent): string | null {
  const charge = getExpandedCharge(paymentIntent)
  if (charge?.customer) {
    if (typeof charge.customer === 'string') return charge.customer
    if (!charge.customer.deleted) return charge.customer.id
  }

  if (paymentIntent.customer) {
    if (typeof paymentIntent.customer === 'string') return paymentIntent.customer
    if (!paymentIntent.customer.deleted) return paymentIntent.customer.id
  }

  return null
}

function getCustomerEmail(
  paymentIntent: Stripe.PaymentIntent,
  fallbackEmail?: string | null
): string | null {
  const explicitEmail = normalizeEmail(fallbackEmail)
  if (explicitEmail) return explicitEmail

  const charge = getExpandedCharge(paymentIntent)
  const chargeEmail = normalizeEmail(charge?.billing_details?.email)
  if (chargeEmail) return chargeEmail

  const paymentMethod = getExpandedPaymentMethod(paymentIntent)
  const paymentMethodEmail = normalizeEmail(paymentMethod?.billing_details?.email)
  if (paymentMethodEmail) return paymentMethodEmail

  const receiptEmail = normalizeEmail(paymentIntent.receipt_email)
  if (receiptEmail) return receiptEmail

  return normalizeEmail(getExpandedCustomer(paymentIntent)?.email)
}

/** Compute the charge amount in integer euro-cents. */
export function computeAmountCents(photoCount: number): number {
  const minChargeCents = MIN_CHARGE_EUR * 100
  const photoCostCents = Math.round(photoCount * PRICE_PER_PHOTO_EUR * 100)
  return Math.max(minChargeCents, photoCostCents)
}

export default class GeoRecoveryPaymentService {
  private sessionService = new GeoRecoverySessionService()

  /**
   * Creates a Stripe PaymentIntent for the given geo-recovery session.
   * Returns the client_secret so the frontend can mount the Payment Element.
   * Photos have NOT been uploaded to R2 yet â€” photoCount comes from the client.
   */
  async createPaymentIntent(
    geoSessionId: string,
    photoCount: number
  ): Promise<{
    clientSecret: string
    pricePerPhotoEur: number
    minChargeEur: number
    amountEur: number
  }> {
    const amountCents = computeAmountCents(photoCount)
    const amountEur = amountCents / 100

    const stripe = getStripe()

    // Pending DB record created before calling Stripe (webhook idempotency anchor)
    const record = await GeoRecoveryPayment.create({
      sessionId: geoSessionId,
      photoCount,
      amountEur,
      status: 'pending',
      customerEmail: null,
      stripeCustomerId: null,
    })

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      // Card-only: the Payment Element won't trigger a page redirect.
      payment_method_types: ['card'],
      metadata: {
        type: 'geo_recovery',
        geoSessionId,
        paymentId: String(record.id),
        photoCount: String(photoCount),
      },
    })

    record.stripePaymentIntentId = paymentIntent.id
    await record.save()

    return {
      clientSecret: paymentIntent.client_secret!,
      pricePerPhotoEur: PRICE_PER_PHOTO_EUR,
      minChargeEur: MIN_CHARGE_EUR,
      amountEur,
    }
  }

  /**
   * Called by the frontend immediately after stripe.confirmPayment() succeeds,
   * before uploading files. Verifies the PaymentIntent with Stripe and marks
   * the Redis session as paid so the subsequent /start call is unblocked.
   *
   * The webhook (payment_intent.succeeded) will also call this path idempotently.
   */
  async confirmPaymentIntent(
    stripePaymentIntentId: string,
    geoSessionId: string,
    customerEmail?: string
  ): Promise<boolean> {
    const stripe = getStripe()

    let paymentIntent: Stripe.PaymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId)
    } catch (error) {
      console.warn('[GeoRecoveryPaymentService] Could not retrieve PaymentIntent:', error)
      return false
    }

    if (paymentIntent.status !== 'succeeded') return false

    // Ensure the intent belongs to this geo-recovery session
    if (paymentIntent.metadata?.geoSessionId !== geoSessionId) {
      console.warn('[GeoRecoveryPaymentService] geoSessionId mismatch on confirm')
      return false
    }

    await this.handlePaymentIntentSucceeded(paymentIntent, { customerEmail })
    return true
  }

  /**
   * Called from the Stripe webhook when payment_intent.succeeded fires.
   * Idempotent â€” safe to call multiple times.
   */
  async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    options?: { customerEmail?: string }
  ): Promise<void> {
    const paymentId = Number(paymentIntent.metadata?.paymentId)
    const record = paymentId
      ? await GeoRecoveryPayment.find(paymentId)
      : await GeoRecoveryPayment.query().where('stripe_payment_intent_id', paymentIntent.id).first()

    if (!record) {
      console.warn(
        '[GeoRecoveryPaymentService] No payment record for PaymentIntent:',
        paymentIntent.id
      )
      return
    }

    const wasCompleted = record.status === 'completed'

    // Expand all likely email sources because Payment Element card flows don't
    // consistently populate charge.billing_details.email.
    const stripe = getStripe()
    try {
      const expanded = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ['latest_charge', 'payment_method', 'customer'],
      })

      const customerEmail = getCustomerEmail(expanded, options?.customerEmail)
      if (customerEmail) {
        record.customerEmail = customerEmail
      }

      const customerId = getCustomerId(expanded)
      if (customerId) {
        record.stripeCustomerId = customerId
      }

      paymentIntent = expanded
    } catch (err) {
      console.warn('[GeoRecoveryPaymentService] Could not expand latest_charge:', err)

      const fallbackEmail = getCustomerEmail(paymentIntent, options?.customerEmail)
      if (fallbackEmail) {
        record.customerEmail = fallbackEmail
      }

      const fallbackCustomerId = getCustomerId(paymentIntent)
      if (fallbackCustomerId) {
        record.stripeCustomerId = fallbackCustomerId
      }
    }

    record.amountEur = paymentIntent.amount / 100
    record.status = 'completed'
    await record.save()

    if (!wasCompleted) {
      await this.markSessionPaid(record.sessionId)
    }
  }

  /**
   * Called from the Stripe webhook when payment_intent.payment_failed fires.
   */
  async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const paymentId = Number(paymentIntent.metadata?.paymentId)
    const record = paymentId
      ? await GeoRecoveryPayment.find(paymentId)
      : await GeoRecoveryPayment.query().where('stripe_payment_intent_id', paymentIntent.id).first()

    if (!record || record.status !== 'pending') return

    record.status = 'failed'
    await record.save()
  }

  private async markSessionPaid(geoSessionId: string): Promise<void> {
    const state = await this.sessionService.load(geoSessionId)
    if (!state) {
      console.warn('[GeoRecoveryPaymentService] Could not load session to mark paid:', geoSessionId)
      return
    }
    state.paid = true
    await this.sessionService.save(state)
  }
}
