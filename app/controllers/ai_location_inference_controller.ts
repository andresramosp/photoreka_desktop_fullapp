import type { HttpContext } from '@adonisjs/core/http'
import AiLocationInferenceService from '#services/ai_location_inference_service'
import CreditService from '#services/credit_service'

export default class AiLocationInferenceController {
  public async summary({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const service = new AiLocationInferenceService()
      const jobId = typeof request.qs().jobId === 'string' ? request.qs().jobId : undefined

      return response.ok(await service.getSummary(user.id, jobId))
    } catch (error: any) {
      console.error('[AiLocationInferenceController] summary error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // public async estimateCredits({ request, response }: HttpContext) {
  //   const count = Number(request.qs().count ?? 0)
  //   const rawRange = AiLocationInferenceService.estimateRawEurRange(count)
  //   return response.ok({
  //     photoCount: Math.max(0, Math.floor(count)),
  //     estimatedCredits: AiLocationInferenceService.estimateCreditsRange(count),
  //     estimatedRawEur: rawRange,
  //   })
  // }

  public async start({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const service = new AiLocationInferenceService()

      const rawLimit = request.body()?.limit
      const limit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.floor(rawLimit) : undefined

      const photos = await service.getPhotosWithoutLocation(user.id)
      const effectiveCount = limit !== undefined ? Math.min(limit, photos.length) : photos.length
      const estimatedCredits = AiLocationInferenceService.estimateCredits(effectiveCount)
      const hasCredits = await CreditService.canAfford(user.id, estimatedCredits)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const job = await service.start(user.id, limit)
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
