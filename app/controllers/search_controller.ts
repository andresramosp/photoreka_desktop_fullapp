import type { HttpContext } from '@adonisjs/core/http'

import ws from '#services/ws'
import SearchTextService from '#services/search_text_service'
import SearchPhotoService from '#services/search_photo_service'
import UserCostService from '#services/user_cost_service'
import CreditService, { PRECISE_GPU_CREDITS, CLIP_CROP_CREDITS } from '#services/credit_service'

export default class SearchController {
  /**
   * Handle the upload of multiple photos
   */

  public async searchSemanticSync({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user!
    try {
      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const searchService = new SearchTextService()
      const query = request.body()

      // Charge GPU credits upfront for precise mode (non-cursor requests)
      if (!query.options.cursor && query.options.searchMode === 'precise') {
        const charged = await CreditService.tryChargeFixed(user.id, PRECISE_GPU_CREDITS)
        if (!charged) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
        UserCostService.record(
          user.id,
          'search',
          CreditService.creditsToEstimatedEur(PRECISE_GPU_CREDITS),
          1,
          {
            task: 'gpu_precise_search',
            metadata: { fixedCharge: true, credits: PRECISE_GPU_CREDITS },
          }
        ).catch(() => {})
      }

      const result = await searchService.searchSemanticSync(query.description, user.id, {
        searchMode: query.options.searchMode,
        pageSize: query.options.pageSize,
        iteration: query.options.iteration,
        minMatchScore: query.options.minMatchScore,
        minResults: query.options.minResults,
        collections: query.options.collections,
        visualAspects: query.options.visualAspects,
        artisticScores: query.options.artisticScores,
        withInsights: query.options.withInsights || false,
        cursor: query.options.cursor,
        source: query.options.source || null,
        searchId: query.options.searchId || null,
        lightweight: query.options.lightweight || false,
      })

      UserCostService.recordFromTracker(user.id, searchService.costTracker).catch(() => {})

      const summary = searchService.costTracker.getSummary()
      if (summary.totalCostInEur > 0) {
        CreditService.charge(user.id, summary.totalCostInEur, 'SEARCH').catch(() => {})
      }

      return response.ok(result)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async searchSemanticStream({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user!
    try {
      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const searchService = new SearchTextService()
      const query = request.body()

      // Charge GPU credits upfront for precise mode
      if (query.options.searchMode === 'precise') {
        const charged = await CreditService.tryChargeFixed(user.id, PRECISE_GPU_CREDITS)
        if (!charged) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
        UserCostService.record(
          user.id,
          'search',
          CreditService.creditsToEstimatedEur(PRECISE_GPU_CREDITS),
          1,
          {
            task: 'gpu_precise_search',
            metadata: { fixedCharge: true, credits: PRECISE_GPU_CREDITS },
          }
        ).catch(() => {})
      }

      const stream = searchService.searchSemanticStream(query.description, user.id, {
        searchMode: query.options.searchMode,
        pageSize: query.options.pageSize,
        iteration: query.options.iteration,
        minMatchScore: query.options.minMatchScore,
        minResults: query.options.minResults,
        collections: query.options.collections,
        visualAspects: query.options.visualAspects,
        artisticScores: query.options.artisticScores,
      })

      for await (const result of stream) {
        ws.io?.to(user.id.toString()).emit(result.type, result.data)
      }

      UserCostService.recordFromTracker(user.id, searchService.costTracker).catch(() => {})

      const summary = searchService.costTracker.getSummary()
      if (summary.totalCostInEur > 0) {
        CreditService.charge(user.id, summary.totalCostInEur, 'SEARCH').catch(() => {})
      }

      return response.ok({ message: 'Search process initiated' })
    } catch (error) {
      console.error('Error fetching photos:', error)
      ws.io?.to(user.id.toString()).emit('searchError', { message: 'Error fetching photos' })
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async searchByTagsSync({ response, request, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!

      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const searchService = new SearchTextService()

      const query = request.body()

      // Charge GPU credits upfront for precise mode (non-cursor requests)
      if (!query.options.cursor && query.options.searchMode === 'precise') {
        const charged = await CreditService.tryChargeFixed(user.id, PRECISE_GPU_CREDITS)
        if (!charged) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
        UserCostService.record(
          user.id,
          'search',
          CreditService.creditsToEstimatedEur(PRECISE_GPU_CREDITS),
          1,
          {
            task: 'gpu_precise_search',
            metadata: { fixedCharge: true, credits: PRECISE_GPU_CREDITS },
          }
        ).catch(() => {})
      }

      const result = await searchService.searchByTagsSync(
        {
          included: query.included,
          excluded: query.excluded,
          pageSize: query.options.pageSize,
          iteration: query.options.iteration,
          searchMode: query.options.searchMode,
          collections: query.options.collections,
          visualAspects: query.options.visualAspects,
          artisticScores: query.options.artisticScores,
          cursor: query.options.cursor,
          withInsights: query.options.withInsights || false,
        },
        user.id
      )

      UserCostService.recordFromTracker(user.id, searchService.costTracker).catch(() => {})

      const summary = searchService.costTracker.getSummary()
      if (summary.totalCostInEur > 0) {
        CreditService.charge(user.id, summary.totalCostInEur, 'SEARCH').catch(() => {})
      }

      return response.ok(result)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async searchByTagsDirect({ response, request, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!

      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const searchService = new SearchTextService()

      const { included = [], excluded = [], mode = 'AND', semantic = false, limit } = request.body()
      const parsedLimit = Number(limit)
      const normalizedLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null

      const { results, totalCount } = await searchService.searchByTagsDirect(
        included,
        excluded,
        user.id,
        mode,
        semantic,
        normalizedLimit
      )

      UserCostService.recordFromTracker(user.id, searchService.costTracker).catch(() => {})

      const summary = searchService.costTracker.getSummary()
      if (summary.totalCostInEur > 0) {
        CreditService.charge(user.id, summary.totalCostInEur, 'SEARCH').catch(() => {})
      }

      response.header('X-Total-Count', totalCount.toString())
      response.header('Access-Control-Expose-Headers', 'X-Total-Count')

      return response.ok(results)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async searchByPhotos({ response, request, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const searchService = new SearchPhotoService()

      const query: any = request.body()

      // CLIP crop embedding requires a GPU call — charge upfront
      if (query.criteria === 'embedding' && query.cropRegion) {
        const charged = await CreditService.tryChargeFixed(user.id, CLIP_CROP_CREDITS)
        if (!charged) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
        UserCostService.record(
          user.id,
          'search',
          CreditService.creditsToEstimatedEur(CLIP_CROP_CREDITS),
          1,
          {
            task: 'clip_crop_embedding',
            metadata: { fixedCharge: true, credits: CLIP_CROP_CREDITS },
          }
        ).catch(() => {})
      }

      const result = await searchService.searchByPhotos(query, user.id)

      return response.ok(result)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async getSearchRefs({ response, params }: HttpContext) {
    try {
      const { searchId } = params

      if (!searchId) {
        return response.badRequest({ message: 'searchId is required' })
      }

      const searchService = new SearchTextService()
      const result = await searchService.getSearchRefsFromRedis(searchId)

      if (!result) {
        return response.notFound({ message: 'Search references not found or expired' })
      }

      return response.ok(result)
    } catch (error) {
      console.error('Error fetching search refs:', error)
      return response.internalServerError({ message: 'Error fetching search refs' })
    }
  }
}
