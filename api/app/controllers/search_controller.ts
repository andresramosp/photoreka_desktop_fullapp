import crypto from 'node:crypto'
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
  type SearchTicket,
} from '#desktop/cloud_functions'
import CloudAccountService from '#desktop/services/cloud_account_service'

/**
 * Escritorio: las búsquedas con modelo de lenguaje se cobran en la cuenta de la nube. Al empezar,
 * la nube comprueba los créditos: con ellos, cada paso con modelo se cobra allí por su coste; sin
 * ellos, la búsqueda normal es básica (sin modelo de lenguaje ni coste) y la precisa se rechaza.
 * Lo que se calcula solo en local (búsqueda por foto, búsqueda directa por tags) es gratis. Sin
 * insights.
 */
/**
 * Pases pagados de las búsquedas recientes, por usuario y contenido de la búsqueda (sin cursor ni
 * página): las páginas siguientes los presentan para que la nube no las vuelva a cobrar.
 */
const PAID_SEARCH_TTL_MS = 55 * 60 * 1000
const paidSearches = new Map<string, { ticket: SearchTicket; at: number }>()

function searchKey(userId: number, body: any) {
  const { cursor, iteration, searchId, ...options } = body?.options ?? {}
  const content = JSON.stringify({ ...body, options })
  return `${userId}:${crypto.createHash('sha256').update(content).digest('hex')}`
}

function rememberPaidSearch(key: string, ticket: SearchTicket) {
  const now = Date.now()
  for (const [k, entry] of paidSearches) if (now - entry.at > PAID_SEARCH_TTL_MS) paidSearches.delete(k)
  paidSearches.set(key, { ticket, at: now })
}

function paidSearchFor(key: string) {
  const entry = paidSearches.get(key)
  return entry && Date.now() - entry.at <= PAID_SEARCH_TTL_MS ? entry.ticket : null
}

export default class SearchController {
  /**
   * Empieza la búsqueda en la nube. Devuelve el SearchTextService asociado a ella (sin pase si es
   * básica), o null si la nube la rechaza, en cuyo caso la respuesta ya está enviada.
   */
  private async begin(response: HttpContext['response'], userId: number, body: any) {
    const options = body.options ?? {}
    const isPrecise = SEARCH_MODE_CONFIGURATION[options.searchMode as SearchMode]?.refineMode !== 'none'
    const category: SearchCategory = isPrecise ? 'SEARCH_PRECISE' : 'SEARCH'
    const key = searchKey(userId, body)
    try {
      const { ticket, billable, account } = await startSearch(userId, category, options.cursor ? paidSearchFor(key) : null)
      if (ticket && billable) rememberPaidSearch(key, ticket)
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
      const searchService = await this.begin(response, user.id, query)
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
      const searchService = await this.begin(response, user.id, query)
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
