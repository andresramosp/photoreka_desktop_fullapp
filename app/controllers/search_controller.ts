import type { HttpContext } from '@adonisjs/core/http'

import SearchTextService from '#services/search_text_service'
import SearchPhotoService from '#services/search_photo_service'
import UserCostService from '#services/user_cost_service'
import CreditService, {
  SEARCH_PRECISE_MIN_CREDITS,
  CLIP_CROP_CREDITS,
  PHOTO_SIMILARITY_RESULT_CREDITS,
  PHOTO_SIMILARITY_MIN_CREDITS,
  SEARCH_INSIGHTS_MIN_CREDITS,
} from '#services/credit_service'
import FreeShotsService, { FREE_DAILY_SHOTS } from '#services/free_shots_service'
import type { FreeShotCategory } from '#services/free_shots_service'
import { SEARCH_MODE_CONFIGURATION } from '#services/search_text_service'
import type { SearchMode } from '#services/search_text_service'

export default class SearchController {
  private getSearchCategory(withInsights: boolean, isPrecise: boolean): FreeShotCategory {
    return withInsights ? 'SEARCH_INSIGHTS' : isPrecise ? 'SEARCH_PRECISE' : 'SEARCH'
  }

  private getSearchMinCredits(withInsights: boolean, isPrecise: boolean): number {
    return withInsights ? SEARCH_INSIGHTS_MIN_CREDITS : isPrecise ? SEARCH_PRECISE_MIN_CREDITS : 1
  }

  /**
   * Handle the upload of multiple photos
   */

  public async searchSemanticSync({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user!
    try {
      const searchService = new SearchTextService()
      const query = request.body()
      const searchMode = query.options.searchMode as SearchMode
      const isPrecise = SEARCH_MODE_CONFIGURATION[searchMode]?.refineMode !== 'none'
      const withInsights = !!query.options.withInsights

      // Insights searches run an LLM per request (and again on every pagination), so
      // they are billed under a dedicated category whose free bag is 0 (see
      // FREE_DAILY_SHOTS): tryConsumeFreeBag always returns false, so the user is
      // charged credits and the daily free quota is never consumed.
      const searchCategory = this.getSearchCategory(withInsights, isPrecise)

      // Pagination requests (cursor present) continue an already-billed search,
      // so they must not consume free shots, run affordability checks, or charge credits.
      const isPagination = !!query.options.cursor

      let freeShot: boolean | 'exhausted' = false
      if (!isPagination) {
        const minCredits = this.getSearchMinCredits(withInsights, isPrecise)
        // Credits first: the free bag only kicks in once the user can't afford it.
        freeShot = await FreeShotsService.tryConsumeFreeBag(user.id, searchCategory, minCredits)

        if (freeShot === 'exhausted') {
          return response.status(402).json({
            code: 'QUOTA_EXHAUSTED',
            category: searchCategory,
            dailyLimit: FREE_DAILY_SHOTS[searchCategory],
          })
        }

        if (!freeShot) {
          const hasCredits = await CreditService.canAfford(user.id, minCredits)
          if (!hasCredits) {
            return response.status(402).json({
              message: 'No credits remaining. Please purchase more credits to continue.',
              code: 'INSUFFICIENT_CREDITS',
            })
          }
        }

        // Precise mode no longer charges a fixed GPU credit upfront. Its real cost —
        // the LLM micro-batched NLI (LogicInferenceService via gemini-2.5-flash-lite) —
        // is tracked on searchService.costTracker and charged post-search below under
        // the SEARCH_PRECISE margin (COST_MULTIPLIERS = 2). The canAfford gate above
        // (SEARCH_PRECISE_MIN_CREDITS) already ensures the user has a non-empty wallet.
      } else if (withInsights) {
        // Insights pagination keeps running an LLM on every page, so it stays billable
        // even when a cursor is present. The free bag is always 0 for insights, so we
        // only verify the user can still afford to continue (the actual cost is charged
        // post-search from the cost tracker below).
        const hasCredits = await CreditService.canAfford(user.id, SEARCH_INSIGHTS_MIN_CREDITS)
        if (!hasCredits) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
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

      // Insights searches compute an LLM per page, so their pagination must be billed too.
      if (!isPagination || withInsights) {
        UserCostService.recordFromTracker(user.id, searchService.costTracker, undefined, {
          free: freeShot === true,
          billingCategory: searchCategory,
        }).catch(() => {})

        const summary = searchService.costTracker.getSummary()
        if (!freeShot && summary.totalCostInEur > 0) {
          CreditService.charge(user.id, summary.totalCostInEur, searchCategory).catch(() => {})
        }
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

      const searchService = new SearchTextService()

      const query = request.body()
      const searchMode = query.options.searchMode as SearchMode
      const isPrecise = SEARCH_MODE_CONFIGURATION[searchMode]?.refineMode !== 'none'
      const withInsights = !!query.options.withInsights

      // Insights searches run an LLM per request (and again on every pagination), so
      // they are billed under a dedicated category whose free bag is 0 (see
      // FREE_DAILY_SHOTS): tryConsumeFreeBag always returns false, so the user is
      // charged credits and the daily free quota is never consumed.
      const searchCategory = this.getSearchCategory(withInsights, isPrecise)

      // Pagination requests (cursor present) continue an already-billed search,
      // so they must not consume free shots, run affordability checks, or charge credits.
      const isPagination = !!query.options.cursor

      let freeShot: boolean | 'exhausted' = false
      if (!isPagination) {
        const minCredits = this.getSearchMinCredits(withInsights, isPrecise)
        // Credits first: the free bag only kicks in once the user can't afford it.
        freeShot = await FreeShotsService.tryConsumeFreeBag(user.id, searchCategory, minCredits)

        if (freeShot === 'exhausted') {
          return response.status(402).json({
            code: 'QUOTA_EXHAUSTED',
            category: searchCategory,
            dailyLimit: FREE_DAILY_SHOTS[searchCategory],
          })
        }

        if (!freeShot) {
          const hasCredits = await CreditService.canAfford(user.id, minCredits)
          if (!hasCredits) {
            return response.status(402).json({
              message: 'No credits remaining. Please purchase more credits to continue.',
              code: 'INSUFFICIENT_CREDITS',
            })
          }
        }

        // Precise mode no longer charges a fixed GPU credit upfront. Its real cost —
        // the LLM micro-batched NLI (LogicInferenceService via gemini-2.5-flash-lite) —
        // is tracked on searchService.costTracker and charged post-search below under
        // the SEARCH_PRECISE margin (COST_MULTIPLIERS = 2). The canAfford gate above
        // (SEARCH_PRECISE_MIN_CREDITS) already ensures the user has a non-empty wallet.
      } else if (withInsights) {
        // Insights pagination keeps running an LLM on every page, so it stays billable
        // even when a cursor is present. The free bag is always 0 for insights, so we
        // only verify the user can still afford to continue (the actual cost is charged
        // post-search from the cost tracker below).
        const hasCredits = await CreditService.canAfford(user.id, SEARCH_INSIGHTS_MIN_CREDITS)
        if (!hasCredits) {
          return response.status(402).json({
            message: 'No credits remaining. Please purchase more credits to continue.',
            code: 'INSUFFICIENT_CREDITS',
          })
        }
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

      // Insights searches compute an LLM per page, so their pagination must be billed too.
      if (!isPagination || withInsights) {
        UserCostService.recordFromTracker(user.id, searchService.costTracker, undefined, {
          free: freeShot === true,
          billingCategory: searchCategory,
        }).catch(() => {})

        const summary = searchService.costTracker.getSummary()
        if (!freeShot && summary.totalCostInEur > 0) {
          CreditService.charge(user.id, summary.totalCostInEur, searchCategory).catch(() => {})
        }
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

      // This endpoint only reads from the database (and reuses cached embeddings when
      // semantic matching is enabled), so it carries no billable cost: it's free.
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

      // Credits first: the free bag only kicks in once the user can't afford it.
      const freeShot = await FreeShotsService.tryConsumeFreeBag(
        user.id,
        'SEARCH_BY_PHOTO',
        totalFixedCredits
      )

      if (freeShot === 'exhausted') {
        return response.status(402).json({
          code: 'QUOTA_EXHAUSTED',
          category: 'SEARCH_BY_PHOTO',
          dailyLimit: FREE_DAILY_SHOTS['SEARCH_BY_PHOTO'],
        })
      }

      if (!freeShot && totalFixedCredits > 0) {
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
          free: freeShot,
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
            free: freeShot,
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
