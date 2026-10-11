import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

import SearchTextService from '#services/search_text_service'
import SearchPhotoService from '#services/search_photo_service'
import { SEARCH_MODE_CONFIGURATION } from '#services/search_text_service'
import type { SearchMode } from '#services/search_text_service'
import {
  cloudAccount,
  CloudFunctionError,
  startSearch,
  type SearchCategory,
} from '#desktop/cloud_functions'
import CloudAccountService from '#desktop/services/cloud_account_service'

/**
 * Escritorio: las búsquedas con modelo de lenguaje se cobran en la cuenta de la nube. Al empezar,
 * la nube aplica los tiros gratis y comprueba los créditos con las reglas de la web, y cada paso
 * con modelo se cobra allí por su coste. Lo que se calcula solo en local (búsqueda por foto,
 * búsqueda directa por tags) es gratis.
 */
export default class SearchController {
  private getSearchCategory(withInsights: boolean, isPrecise: boolean): SearchCategory {
    return withInsights ? 'SEARCH_INSIGHTS' : isPrecise ? 'SEARCH_PRECISE' : 'SEARCH'
  }

  /**
   * Empieza la búsqueda en la nube. Devuelve el SearchTextService ya asociado a ella, o null si la
   * nube la rechaza (sin créditos o sin tiros gratis), en cuyo caso la respuesta ya está enviada.
   */
  private async begin(response: HttpContext['response'], userId: number, options: any) {
    const isPrecise = SEARCH_MODE_CONFIGURATION[options.searchMode as SearchMode]?.refineMode !== 'none'
    const category = this.getSearchCategory(!!options.withInsights, isPrecise)
    try {
      const { ticket, account } = await startSearch(userId, category, !!options.cursor)
      await CloudAccountService.saveAccount(account)
      return new SearchTextService(ticket)
    } catch (error) {
      if (error instanceof CloudFunctionError && error.status === 402) {
        response.status(402).json(error.data)
        return null
      }
      throw error
    }
  }

  /** Tras la búsqueda, los créditos que quedan se copian de la nube sin hacer esperar al usuario. */
  private refreshAccount(userId: number) {
    cloudAccount(userId)
      .then((account) => CloudAccountService.saveAccount(account))
      .catch((error) => logger.warn(`[cloud] no se pudo refrescar la cuenta: ${error.message}`))
  }

  public async searchSemanticSync({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user!
    try {
      const query = request.body()
      const searchService = await this.begin(response, user.id, query.options)
      if (!searchService) return

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
      this.refreshAccount(user.id)
      return response.ok(result)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async searchByTagsSync({ response, request, auth }: HttpContext) {
    const user = auth.use('api').user!
    try {
      const query = request.body()
      const searchService = await this.begin(response, user.id, query.options)
      if (!searchService) return

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
      this.refreshAccount(user.id)
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
      const result = await searchService.searchByPhotos(request.body() as any, user.id)
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
