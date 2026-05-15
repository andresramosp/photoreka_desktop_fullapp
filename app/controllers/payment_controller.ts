import type { HttpContext } from '@adonisjs/core/http'
import PaymentService from '#services/payment_service'

export default class PaymentController {
  /**
   * Listar paquetes y credit steps disponibles
   * GET /api/payments/packages
   */
  async packages({ response }: HttpContext) {
    return response.json({
      photoPackages: await PaymentService.getPhotoPackages(),
      creditSteps: await PaymentService.getCreditSteps(),
    })
  }

  /**
   * Crear sesión de Stripe Checkout
   * POST /api/payments/checkout
   * Body: { type: 'photo_package' | 'credits', itemId: string }
   * itemId debe ser el Stripe Price ID devuelto por GET /api/payments/packages
   */
  async checkout({ auth, request, response }: HttpContext) {
    try {
      const user = auth.use('api').user! as any
      const { type, itemId } = request.only(['type', 'itemId'])

      if (!type || !itemId) {
        return response.status(400).json({
          error: 'Missing required fields: type, itemId',
        })
      }

      if (type !== 'photo_package' && type !== 'credits') {
        return response.status(400).json({
          error: 'type must be "photo_package" or "credits"',
        })
      }

      const { url } = await PaymentService.createCheckoutSession(user.id, type, itemId)

      return response.json({ url })
    } catch (error: any) {
      const message = error?.message || 'Failed to create checkout session'

      if (message.startsWith('Unknown') || message.includes('Stripe metadata')) {
        return response.status(400).json({ error: message })
      }

      console.error('[PaymentController] checkout error:', error)
      return response.status(500).json({ error: 'Failed to create checkout session' })
    }
  }

  /**
   * Webhook de Stripe — SIN auth middleware, verificación por firma
   * POST /api/payments/webhook
   */
  async webhook({ request, response }: HttpContext) {
    const signature = request.header('stripe-signature')
    if (!signature) {
      return response.status(400).json({ error: 'Missing stripe-signature header' })
    }

    try {
      const rawBody = request.raw()
      if (!rawBody) {
        return response.status(400).json({ error: 'Empty request body' })
      }

      await PaymentService.handleWebhookEvent(Buffer.from(rawBody), signature)
      return response.json({ received: true })
    } catch (error: any) {
      console.error('[PaymentController] webhook error:', error?.message)
      return response.status(400).json({ error: 'Webhook verification failed' })
    }
  }

  /**
   * Historial de compras del usuario
   * GET /api/payments/history
   */
  async history({ auth, response }: HttpContext) {
    try {
      const user = auth.use('api').user! as any
      const payments = await PaymentService.getHistory(user.id)

      return response.json({ data: payments })
    } catch (error) {
      return response.status(500).json({ error: 'Failed to retrieve payment history' })
    }
  }

  /**
   * Verificar estado de una sesión de pago (para el redirect de éxito)
   * GET /api/payments/verify?session_id=xxx
   */
  async verify({ auth, request, response }: HttpContext) {
    try {
      const user = auth.use('api').user! as any
      const sessionId = request.input('session_id')

      if (!sessionId) {
        return response.status(400).json({ error: 'Missing session_id parameter' })
      }

      const payment = await PaymentService.verifySession(sessionId, user.id)

      if (!payment) {
        return response.status(404).json({ error: 'Payment session not found' })
      }

      return response.json({
        data: {
          status: payment.status,
          type: payment.type,
          packageId: payment.packageId,
          stripePriceId: payment.stripePriceId,
          stripeProductId: payment.stripeProductId,
          productName: payment.productName,
          photosGranted: payment.photosGranted,
          analyzedPhotosGranted: payment.analyzedPhotosGranted,
          creditsGranted: payment.creditsGranted,
          amountEur: payment.amountEur,
        },
      })
    } catch (error) {
      return response.status(500).json({ error: 'Failed to verify payment session' })
    }
  }
}
