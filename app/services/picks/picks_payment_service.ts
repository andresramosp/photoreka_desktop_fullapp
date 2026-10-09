/**
 * Stripe Payment Element flow for Photoreka Picks (anonymous, no user id).
 *
 *   1. createPaymentIntent: the checkout opens; quotes the current photo count
 *   2. Stripe confirms in the browser (card only, no redirect)
 *   3. confirmPaymentIntent: the browser reports success; we verify with Stripe
 *   4. Webhook payment_intent.succeeded: same handler, idempotent, covers a closed tab
 *
 * A confirmed payment freezes the photo cap at the paid count and starts judging.
 */

import Stripe from 'stripe'
import { DateTime } from 'luxon'
import stripeConfig from '#config/stripe'
import { computePicksAmountCents } from '#config/picks'
import PicksPayment from '#models/picks/picks_payment'
import PicksSession from '#models/picks/picks_session'
import PicksJudgeService from '#services/picks/picks_judge_service'

let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  stripeClient ??= new Stripe(stripeConfig.secretKey, { apiVersion: '2026-03-25.dahlia' })
  return stripeClient
}

function normalizeEmail(email: unknown): string | null {
  return typeof email === 'string' && email.trim() ? email.trim() : null
}

function emailFrom(pi: Stripe.PaymentIntent, explicit?: string | null): string | null {
  const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null
  const method = typeof pi.payment_method === 'object' ? pi.payment_method : null
  return (
    normalizeEmail(explicit) ??
    normalizeEmail(charge?.billing_details?.email) ??
    normalizeEmail(method?.billing_details?.email) ??
    normalizeEmail(pi.receipt_email)
  )
}

function customerIdFrom(pi: Stripe.PaymentIntent): string | null {
  const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null
  const customer = charge?.customer ?? pi.customer
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.deleted ? null : customer.id
}

export default class PicksPaymentService {
  private judge = new PicksJudgeService()

  async createPaymentIntent(session: PicksSession, photoCount: number) {
    const amountCents = computePicksAmountCents(photoCount)

    session.orderedCount = photoCount
    await session.save()

    const record = await PicksPayment.create({
      sessionId: session.id,
      photoCount,
      amountEur: amountCents / 100,
      status: 'pending',
    })

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      // Card only: the Payment Element never redirects away from the page.
      payment_method_types: ['card'],
      metadata: {
        type: 'picks',
        picksSessionId: session.id,
        paymentId: String(record.id),
        photoCount: String(photoCount),
      },
    })

    record.stripePaymentIntentId = paymentIntent.id
    await record.save()

    return { clientSecret: paymentIntent.client_secret!, amountEur: amountCents / 100 }
  }

  /** Called by the browser right after stripe.confirmPayment() succeeds. */
  async confirmPaymentIntent(
    session: PicksSession,
    stripePaymentIntentId: string,
    customerEmail?: string | null
  ): Promise<boolean> {
    let paymentIntent: Stripe.PaymentIntent
    try {
      paymentIntent = await getStripe().paymentIntents.retrieve(stripePaymentIntentId)
    } catch {
      return false
    }
    if (paymentIntent.status !== 'succeeded') return false
    if (paymentIntent.metadata?.picksSessionId !== session.id) return false

    await this.handlePaymentIntentSucceeded(paymentIntent, customerEmail)
    return true
  }

  /** Webhook and browser confirmation both land here; safe to run twice. */
  async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    explicitEmail?: string | null
  ): Promise<void> {
    const record = await PicksPayment.findBy('stripe_payment_intent_id', paymentIntent.id)
    if (!record) {
      console.warn('[PicksPayment] No payment record for PaymentIntent', paymentIntent.id)
      return
    }

    let expanded = paymentIntent
    try {
      expanded = await getStripe().paymentIntents.retrieve(paymentIntent.id, {
        expand: ['latest_charge', 'payment_method'],
      })
    } catch (error) {
      console.warn('[PicksPayment] Could not expand PaymentIntent', error)
    }

    const email = emailFrom(expanded, explicitEmail)
    record.customerEmail = email ?? record.customerEmail
    record.stripeCustomerId = customerIdFrom(expanded) ?? record.stripeCustomerId
    record.amountEur = expanded.amount / 100
    record.status = 'completed'
    await record.save()

    const session = await PicksSession.find(record.sessionId)
    if (!session) return
    if (!session.paidAt) {
      session.paidAt = DateTime.now()
      session.paidCount = record.photoCount
      session.status = 'processing'
    }
    session.customerEmail = email ?? session.customerEmail
    await session.save()

    await this.judge.start(session.id)
  }

  async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    await PicksPayment.query()
      .where('stripe_payment_intent_id', paymentIntent.id)
      .where('status', 'pending')
      .update({ status: 'failed' })
  }
}
