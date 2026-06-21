import type { HttpContext } from '@adonisjs/core/http'

import SearchTextService from '#services/search_text_service'
import SearchPhotoService from '#services/search_photo_service'
import UserCostService from '#services/user_cost_service'
import CreditService, {
  PRECISE_GPU_CREDITS,
  CLIP_CROP_CREDITS,
  PHOTO_SIMILARITY_RESULT_CREDITS,
  PHOTO_SIMILARITY_MIN_CREDITS,
} from '#services/credit_service'
import { SEARCH_MODE_CONFIGURATION } from '#services/search_text_service'
import type { SearchMode } from '#services/search_text_service'

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
      const searchMode = query.options.searchMode as SearchMode

      // Charge GPU credits upfront for modes that use entailment refinement (non-cursor requests)
      if (!query.options.cursor && SEARCH_MODE_CONFIGURATION[searchMode]?.refineMode !== 'none') {
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
      const searchMode = query.options.searchMode as SearchMode

      // Charge GPU credits upfront for modes that use entailment refinement (non-cursor requests)
      if (!query.options.cursor && SEARCH_MODE_CONFIGURATION[searchMode]?.refineMode !== 'none') {
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
      const resultLength = Number(query.resultLength)
      const billableResults =
        Number.isFinite(resultLength) && resultLength > 0 ? Math.ceil(resultLength) : 1
      const calculatedPhotoSimilarityCredits = billableResults * PHOTO_SIMILARITY_RESULT_CREDITS
      const photoSimilarityCredits =
        Math.round(
          Math.max(calculatedPhotoSimilarityCredits, PHOTO_SIMILARITY_MIN_CREDITS) * 10000
        ) / 10000
      const clipCropCredits =
        query.criteria === 'embedding' && query.cropRegion ? CLIP_CROP_CREDITS : 0
      const totalFixedCredits = photoSimilarityCredits + clipCropCredits

      if (totalFixedCredits > 0) {
        const charged = await CreditService.tryChargeFixed(user.id, totalFixedCredits)
        if (!charged) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
      }

      UserCostService.record(
        user.id,
        'search',
        CreditService.creditsToEstimatedEur(photoSimilarityCredits),
        billableResults,
        {
          task: 'photo_similarity_search',
          metadata: {
            fixedCharge: true,
            credits: photoSimilarityCredits,
            criteria: query.criteria,
            resultLength: query.resultLength,
            creditsPerResult: PHOTO_SIMILARITY_RESULT_CREDITS,
            minimumCredits: PHOTO_SIMILARITY_MIN_CREDITS,
          },
        }
      ).catch(() => {})

      // CLIP crop embedding requires a GPU call, charged in addition to the per-result search cost
      if (clipCropCredits > 0) {
        UserCostService.record(
          user.id,
          'search',
          CreditService.creditsToEstimatedEur(clipCropCredits),
          1,
          {
            task: 'clip_crop_embedding',
            metadata: { fixedCharge: true, credits: clipCropCredits },
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
