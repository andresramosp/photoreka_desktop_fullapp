import type { HttpContext } from '@adonisjs/core/http'
import AiLocationInferenceService from '#services/ai_location_inference_service'
import { CloudFunctionError, creditMargin, startLocationInference } from '#desktop/cloud_functions'

export default class AiLocationInferenceController {
  public async summary({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const service = new AiLocationInferenceService()
      const jobId = typeof request.qs().jobId === 'string' ? request.qs().jobId : undefined
      // Escritorio: la estimación de créditos usa el margen vigente en el servicio de la nube.
      const margin = await creditMargin(user.id, 'GEO_INFERENCE')
      return response.ok(await service.getSummary(user.id, margin, jobId))
    } catch (error: any) {
      console.error('[AiLocationInferenceController] summary error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  public async start({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const service = new AiLocationInferenceService()

      const rawLimit = request.body()?.limit
      const limit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.floor(rawLimit) : undefined
      const photos = await service.getPhotosWithoutLocation(user.id)
      const effectiveCount = limit !== undefined ? Math.min(limit, photos.length) : photos.length

      // Escritorio: la nube comprueba los créditos con su margen y da el pase del trabajo; cada
      // llamada al modelo se cobra allí.
      let ticket
      try {
        ticket = await startLocationInference(
          user.id,
          AiLocationInferenceService.estimateRawEur(effectiveCount)
        )
      } catch (error) {
        if (error instanceof CloudFunctionError && error.status === 402) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
        throw error
      }

      const job = await service.start(user.id, ticket, limit)
      return response.accepted({
        success: true,
        job,
        message: 'AI location inference started. You will be notified when it completes.',
      })
    } catch (error: any) {
      if (error.message?.includes('already running')) {
        return response.conflict({ error: error.message })
      }
      if (error.message?.includes('no photos')) {
        return response.badRequest({ error: error.message })
      }
      console.error('[AiLocationInferenceController] start error:', error)
      return response.internalServerError({ error: error.message })
    }
  }
}
