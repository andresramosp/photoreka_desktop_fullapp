import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import CloudAccountService, { CloudAuthError } from '../services/cloud_account_service.js'

/**
 * Sustituye a #controllers/payment_controller en el escritorio (mapa "imports" de package.json).
 * Los pagos son de la cuenta de la nube: cada ruta se reenvía a la API de la nube con la sesión
 * del usuario, que crea el pago en Stripe y lo acredita con su webhook. El pago se abre en el
 * navegador del sistema y Stripe vuelve a /desktop-payment, que solo pide volver a la app.
 */
export default class DesktopPaymentController {
  async packages({ response }: HttpContext) {
    return relay(response, () => CloudAccountService.forward(null, '/api/payments/packages'))
  }

  async checkout({ auth, request, response }: HttpContext) {
    const userId = auth.use('api').user!.id
    const { type, itemId } = request.only(['type', 'itemId'])
    return relay(response, () =>
      CloudAccountService.forward(userId, '/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ type, itemId, returnTo: 'desktop' }),
      })
    )
  }

  async history({ auth, response }: HttpContext) {
    const userId = auth.use('api').user!.id
    return relay(response, () => CloudAccountService.forward(userId, '/api/payments/history'))
  }

  async verify({ auth, request, response }: HttpContext) {
    const userId = auth.use('api').user!.id
    const sessionId = String(request.input('session_id') ?? '')
    return relay(response, async () => {
      const result = await CloudAccountService.forward(
        userId,
        `/api/payments/verify?session_id=${encodeURIComponent(sessionId)}`
      )
      // Con el pago acreditado, la copia local de la cuota y los créditos se pone al día ya,
      // sin esperar a la sincronización periódica.
      if (result.status === 200 && result.body?.data?.status === 'completed') {
        await CloudAccountService.refresh(userId).catch((error) => logger.warn(`[cloud] no se pudo refrescar la cuenta tras el pago: ${error.message}`))
      }
      return result
    })
  }

  /** Stripe avisa a la nube, nunca a la app local. */
  async webhook({ response }: HttpContext) {
    return response.notFound({ error: 'Payments are confirmed by Photoreka cloud' })
  }
}

async function relay(
  response: HttpContext['response'],
  request: () => Promise<{ status: number; body: any }>
) {
  try {
    const { status, body } = await request()
    return response.status(status).json(body)
  } catch (error) {
    if (error instanceof CloudAuthError) {
      return response.unauthorized({ error: 'Your Photoreka session has expired. Sign in again.' })
    }
    logger.warn(`[cloud] pago: ${(error as Error).message}`)
    return response.status(502).json({ error: 'Could not reach Photoreka. Check your connection.' })
  }
}
