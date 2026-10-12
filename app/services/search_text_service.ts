// @ts-nocheck

import Photo from '#models/photo'
import fs from 'fs/promises'

import type { SearchTicket } from '#desktop/cloud_functions'
import path from 'path'
import sharp from 'sharp'
import QueryService from './query_service.js'
import withCostWS from '../decorators/withCostWs.js'
import ScoringService from './scoring_service.js'
import redis from '@adonisjs/redis/services/main'

import PhotoManager from '../managers/photo_manager.js'
import pLimit from 'p-limit'
import DescriptionChunk from '#models/descriptionChunk'
import VectorService from './vector_service.js'
import Tag from '#models/tag'
import { getUploadPath } from '../utils/dataPath.js'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { createRequire } from 'module'
import { EmbeddingStoreService } from './embeddings_store_service.js'

const require = createRequire(import.meta.url)
const pluralize = require('pluralize')

export type SearchMode = 'precise' | 'adaptive' | 'broad'
export type SearchType = 'semantic' | 'tags'

export type RefineMode = 'entailment' | 'neutral' | 'none'

export interface SearchScoreWeights {
  tag: number
  desc: number
  fullQueryDesc: number
  notes: number
  image: number
  nuances: number
}

export interface SearchThresholds {
  tag: number | null
  descSegment: number | null
  descFullQuery: number | null
  notes: number | null
  image: number | null
  nuances: number | null
}

/**
 * How the final ranking is computed from the per-channel scores:
 * - 'blend': totalScore is the weighted sum of every channel (tags/desc/notes/nuances + image).
 *   Text and image both shape the order. Used by broad/adaptive.
 * - 'gateThenRank': the text channels (entailment) only decide *admission* — a photo qualifies if
 *   any text channel matched OR CLIP cleared its threshold — but they contribute nothing to the
 *   order. Ranking is driven purely by imageScore (CLIP). This keeps precise strict about what
 *   counts as a match while letting CLIP decide how prominently the object appears, so a moto on a
 *   distant t-shirt sinks below a moto that fills the frame instead of riding a strong tag match up.
 */
export type ImageRankingStrategy = 'blend' | 'gateThenRank'

export interface SearchModeConfig {
  thresholds: SearchThresholds
  refineMode: RefineMode
  queryStructurePrompt: 'standard' | 'implicit_only'
  forceVisualAspects: boolean
  scoreWeights: SearchScoreWeights
  thresholdWeights: SearchScoreWeights
  imageRanking: ImageRankingStrategy
}

export const SEARCH_MODE_CONFIGURATION: Record<SearchMode, SearchModeConfig> = {
  broad: {
    thresholds: {
      tag: 0.55,
      descSegment: null,
      descFullQuery: null,
      notes: null,
      image: 0.15,
      nuances: null,
    },
    refineMode: 'none',
    queryStructurePrompt: 'standard',
    forceVisualAspects: false,
    imageRanking: 'blend',
    // scoreWeights: contribution added to totalScore when a channel matches.
    // In broad, tags are only a small corroboration bonus; CLIP remains the main scorer.
    scoreWeights: {
      tag: 0.15,
      desc: 0,
      fullQueryDesc: 0,
      notes: 0,
      image: 1.5,
      nuances: 0,
    },
    // thresholdWeights: contribution added to the excellent/good/fair label baseline.
    // tag: 0 means broad tags can boost ranking without making CLIP-only matches look worse.
    // image: 1 preserves the previous CLIP-led label baseline while image score still gets x1.5.
    thresholdWeights: {
      tag: 0,
      desc: 0,
      fullQueryDesc: 0,
      notes: 0,
      image: 1,
      nuances: 0,
    },
  },
  adaptive: {
    thresholds: {
      tag: 0.17,
      descSegment: 0.2,
      descFullQuery: 0.25,
      notes: 0.5,
      image: 0.2,
      nuances: 0.35,
    },
    refineMode: 'none',
    queryStructurePrompt: 'implicit_only',
    forceVisualAspects: true,
    imageRanking: 'blend',
    // scoreWeights: adaptive channel contributions. Text channels add full score; CLIP uses x1.5.
    scoreWeights: {
      tag: 1,
      desc: 1,
      fullQueryDesc: 1,
      notes: 1,
      image: 1.5,
      nuances: 1,
    },
    // thresholdWeights: label baseline. fullQueryDesc: 0.25 preserves the old +0.25 threshold bump.
    // notes and nuances remain score bonuses only, matching the previous threshold behavior.
    thresholdWeights: {
      tag: 1,
      desc: 1,
      fullQueryDesc: 0.25,
      notes: 0,
      image: 1,
      nuances: 0,
    },
  },
  precise: {
    thresholds: {
      tag: 0.2,
      descSegment: 0.35,
      descFullQuery: 0.4,
      notes: 0.55,
      image: 0.4,
      nuances: null,
    },
    refineMode: 'entailment',
    queryStructurePrompt: 'standard',
    forceVisualAspects: false,
    // imageRanking: 'gateThenRank' — entailment on tags/desc decides ONLY whether a photo qualifies;
    // the final order is CLIP-only. See finalizeScores. Because of this, the text scoreWeights below
    // are not summed into the ranking (they're overridden), so they stay at 0. imageScore keeps its
    // x1.5 because finalizeScores multiplies imageScore by scoreWeights.image when it rebuilds the
    // totalScore in gateThenRank mode.
    imageRanking: 'gateThenRank',
    scoreWeights: {
      tag: 0,
      desc: 0,
      fullQueryDesc: 0,
      notes: 0,
      image: 1.5,
      nuances: 0,
    },
    // thresholdWeights: label baseline is image-led, mirroring `broad`, since ranking is CLIP-only.
    thresholdWeights: {
      tag: 0,
      desc: 0,
      fullQueryDesc: 0,
      notes: 0,
      image: 1,
      nuances: 0,
    },
  },
}

export type SearchOptions = {
  searchMode: SearchMode
  iteration: number
  pageSize: number
  minMatchScore?: number
  userId?: number
  maxPageAttempts?: number
  minResults?: number
  collections?: string[]
  visualAspects?: string[]
  artisticScores?: Record<string, { value: number; operator: string }>
  cursor?: string
  source?: string
  searchId?: string
  /** When provided, restricts the search pool to only these photo IDs (after collection/aspect filters). */
  candidateIds?: number[]
  /** When true, returns only scoring data (id, labelScore, totalScore) without fetching full photo models. */
  lightweight?: boolean
}

export type SearchTagsOptions = SearchOptions & {
  included: string[]
  excluded: string[]
}

export default class SearchTextService {
  public photoManager: PhotoManager = null
  public queryService: QueryService = null
  public scoringService: ScoringService = null
  public vectorService: VectorService = null

  /**
   * @param searchTicket búsqueda en curso en la nube: los pasos con modelo de lenguaje
   *   (reducir y estructurar la consulta, inferencia lógica) se cobran a ella. Sin pase (usuario
   *   sin créditos), la búsqueda es básica: la consulta entera, sin modelo de lenguaje.
   */
  constructor(private searchTicket: SearchTicket | null = null) {
    this.photoManager = new PhotoManager()
    this.queryService = new QueryService()
    this.queryService.searchTicket = searchTicket
    this.scoringService = new ScoringService()
    this.scoringService.searchTicket = searchTicket
    this.vectorService = new VectorService()
  }

  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  /** Consulta sin estructurar: la frase entera como único segmento, para tags, descripciones y CLIP. */
  private basicStructuredQuery(query: string, modeConfig: SearchModeConfig) {
    return {
      original: query,
      positive_segments: [query],
      nuances_segments: [],
      no_prefix: query,
      include_visual_aspects: modeConfig.forceVisualAspects,
    }
  }

  /**
   * Versión síncrona/paginada de searchSemantic.
   * Devuelve solo la página correspondiente a la iteración solicitada.
   */
  public async searchSemanticSync(
    query: string,
    userId: string | number,
    options: SearchOptions = {
      searchMode: 'precise',
      pageSize: 18,
      iteration: 1,
    }
  ) {
    const {
      searchMode = 'precise',
      pageSize = 18,
      iteration = 1,
      collections,
      visualAspects,
      artisticScores,
      cursor,
      source,
      searchId,
      candidateIds,
      lightweight = false,
    } = options

    const rawPhotoIds = await this.photoManager.getPhotosIdsForSearch(
      userId?.toString(),
      collections && collections.length > 0 ? collections : undefined,
      visualAspects && visualAspects.length > 0 ? visualAspects : undefined,
      artisticScores && Object.keys(artisticScores).length > 0 ? artisticScores : undefined,
      source || undefined
    )
    const photoIds =
      candidateIds && candidateIds.length > 0
        ? rawPhotoIds.filter((id) => (candidateIds as number[]).includes(id))
        : rawPhotoIds

    const modeConfig = SEARCH_MODE_CONFIGURATION[searchMode]
    const { compact_query: compactQuery } =
      this.searchTicket && modeConfig.thresholds.image !== null
        ? await this.queryService.compactQuery(query)
        : { compact_query: null }
    const { structuredResult } = this.searchTicket
      ? await this.queryService.structureQuery(query, modeConfig)
      : { structuredResult: this.basicStructuredQuery(query, modeConfig) }
    if (compactQuery) {
      structuredResult.compact_query = compactQuery
    }

    // Guardar refs en Redis si hay searchId
    if (searchId) {
      await this.saveSearchRefsToRedis(searchId, structuredResult)
    }

    const embeddingScoredPhotos = await this.scoringService.getScoredPhotosByTagsAndDesc(
      photoIds,
      structuredResult,
      searchMode,
      userId?.toString()
    )

    let paginatedPhotos
    let hasMore

    if (lightweight) {
      // Lightweight mode: return only scoring data without DB fetch
      const pageSlice = embeddingScoredPhotos.slice(0, pageSize)
      hasMore = pageSize < embeddingScoredPhotos.length
      paginatedPhotos = pageSlice.map((scoredPhoto) => ({
        photo: {
          id: scoredPhoto.id,
          labelScore: scoredPhoto.labelScore,
          totalScore: scoredPhoto.totalScore,
          imageScore: scoredPhoto.imageScore,
          tagScore: scoredPhoto.tagScore,
          descScore: scoredPhoto.descScore,
        },
      }))
    } else {
      ;({ paginatedPhotos, hasMore } = await this.getPaginatedPhotosByCursor(
        embeddingScoredPhotos,
        pageSize,
        cursor
      ))
    }

    return {
      type: 'search-matches',
      data: {
        hasMore,
        results: {
          [iteration]: paginatedPhotos,
        },
        iteration,
        structuredResult,
        // Sin créditos (sin pase): la web avisa de que la consulta se usó tal cual.
        basicSearch: !this.searchTicket,
      },
    }
  }

  public async searchByTagsSync(options: SearchTagsOptions, userId: string | number) {
    const {
      included,
      excluded,
      iteration,
      pageSize,
      searchMode,
      collections,
      visualAspects,
      artisticScores,
      cursor,
    } = options

    const photoIds = await this.photoManager.getPhotosIdsForSearch(
      userId?.toString(),
      collections && collections.length > 0 ? collections : undefined,
      visualAspects && visualAspects.length > 0 ? visualAspects : undefined,
      artisticScores && Object.keys(artisticScores).length > 0 ? artisticScores : undefined
    )

    let embeddingScoredPhotos = await this.scoringService.getScoredPhotosByTags(
      photoIds,
      included,
      excluded,
      searchMode,
      userId?.toString()
    )

    let { paginatedPhotos, hasMore } = await this.getPaginatedPhotosByCursor(
      embeddingScoredPhotos,
      pageSize,
      cursor
    )

    return {
      type: 'search-matches',
      data: {
        hasMore,
        results: {
          [iteration]: paginatedPhotos,
        },
        iteration: iteration,
      },
    }
  }

  //   public async processBatchInsightsDesc(
  //   batch: any[],
  //   structuredResult: any,
  //   searchMode: SearchMode
  // ) {
  //   const searchModelMessage =
  //     searchMode == 'curation' ? MESSAGE_SEARCH_MODEL_CREATIVE(true) : MESSAGE_SEARCH_MODEL_STRICT()
  //   const photosWithChunks = []
  //   const defaultResultsMap: { [key: string]: any } = {}

  //   // Prellenamos defaultResultsMap para todas las fotos
  //   for (const batchedPhoto of batch) {
  //     defaultResultsMap[batchedPhoto.photo.tempID] = {
  //       id: batchedPhoto.photo.tempID,
  //       isInsight: false,
  //       reasoning: null,
  //     }
  //   }

  //   // Procesamos cada foto: si se obtienen chunks se añaden a la colección para el modelo
  //   for (const batchedPhoto of batch) {
  //     const descChunks = await this.scoringService.getNearChunksFromDesc(
  //       batchedPhoto.photo,
  //       structuredResult.no_prefix,
  //       0.1
  //     )
  //     const chunkedDesc = descChunks.map((dc) => dc.text_chunk).join(' ... ')
  //     if (chunkedDesc) {
  //       photosWithChunks.push({
  //         id: batchedPhoto.photo.tempID,
  //         description: chunkedDesc,
  //         visual_accents: batchedPhoto.photo.descriptions.visual_accents,
  //       })
  //     }
  //   }

  //   // Llamamos al modelo con las fotos que tienen chunks
  //   let modelResponse
  //   if (photosWithChunks.length) {
  //     modelResponse = await this.modelsService.getGPTResponse(
  //       searchModelMessage,
  //       JSON.stringify({
  //         query: structuredResult.original,
  //         collection: photosWithChunks,
  //       }),
  //       'gpt-4o', //deepseek-chat
  //       null,
  //       1.1,
  //       false
  //     )
  //   }

  //   // Sobreescribimos defaultResultsMap con los resultados que devuelve el modelo
  //   const modelResults = modelResponse ? modelResponse.result : []
  //   for (const result of modelResults) {
  //     defaultResultsMap[result.id] = result
  //   }

  //   const combinedResults = batch.map(
  //     (batchedPhoto) => defaultResultsMap[batchedPhoto.photo.tempID]
  //   )

  //   return {
  //     modelResult: combinedResults,
  //     modelCost: modelResponse ? modelResponse.cost : 0,
  //   }
  // }

  // AUXILIARES //

  private async getPaginatedPhotosByPage(embeddingScoredPhotos, pageSize, currentIteration) {
    const offset = (currentIteration - 1) * pageSize
    const pageSlice = embeddingScoredPhotos.slice(offset, offset + pageSize)
    const hasMore = offset + pageSize < embeddingScoredPhotos.length

    const pagePhotoModels = await Photo.query()
      .whereIn(
        'id',
        pageSlice.map((p) => p.id)
      )
      .preload('tags', (q) => q.preload('tag'))
    const photoMap = new Map(pagePhotoModels.map((p) => [p.id, p]))

    const paginatedPhotos = pageSlice.map((scoredPhoto) => {
      const photo = photoMap.get(scoredPhoto.id)
      return {
        photo: {
          id: photo.id,
          thumbnailName: photo.thumbnailName,
          name: photo.name,
          descriptions: photo?.descriptions,
          tags: photo?.tags,
          originalUrl: photo?.originalUrl,
          thumbnailUrl: photo?.thumbnailUrl,
          ...scoredPhoto,
          //matchingTags: scoredPhoto.matchingTags ? scoredPhoto.matchingTags.map((t) => t.name) : [],
        },
      }
    })

    return { hasMore, paginatedPhotos }
  }

  private async getPaginatedPhotosByCursor(embeddingScoredPhotos, pageSize, cursor?: string) {
    let pageSlice
    let hasMore

    if (!cursor) {
      // First page: return first pageSize elements
      pageSlice = embeddingScoredPhotos.slice(0, pageSize)
      hasMore = pageSize < embeddingScoredPhotos.length
    } else {
      // Subsequent pages: find cursor index and return following elements
      const cursorIndex = embeddingScoredPhotos.findIndex((photo) => photo.id === cursor)

      if (cursorIndex === -1) {
        // Cursor not found, start from beginning
        pageSlice = embeddingScoredPhotos.slice(0, pageSize)
        hasMore = pageSize < embeddingScoredPhotos.length
      } else {
        // Return elements after the cursor
        const startIndex = cursorIndex + 1
        pageSlice = embeddingScoredPhotos.slice(startIndex, startIndex + pageSize)
        hasMore = startIndex + pageSize < embeddingScoredPhotos.length
      }
    }

    const pagePhotoModels = await Photo.query()
      .whereIn(
        'id',
        pageSlice.map((p) => p.id)
      )
      .preload('tags', (q) => q.preload('tag'))
    const photoMap = new Map(pagePhotoModels.map((p) => [p.id, p]))

    const paginatedPhotos = pageSlice.map((scoredPhoto) => {
      const photo = photoMap.get(scoredPhoto.id)
      return {
        photo: {
          id: photo.id,
          thumbnailName: photo.thumbnailName,
          name: photo.name,
          descriptions: photo?.descriptions,
          tags: photo?.tags,
          originalUrl: photo?.originalUrl,
          thumbnailUrl: photo?.thumbnailUrl,
          originalFileName: photo?.originalFileName,
          ...scoredPhoto,
          //matchingTags: scoredPhoto.matchingTags ? scoredPhoto.matchingTags.map((t) => t.name) : [],
        },
      }
    })

    return { hasMore, paginatedPhotos }
  }

  /**
   * Extrae los nuances_segments del structuredResult para guardarlos como referencias
   */
  private extractRefsFromStructuredResult(structuredResult: any): string[] {
    if (!structuredResult) {
      return []
    }

    const segments = [...structuredResult.nuances_segments, ...structuredResult.positive_segments]

    // Asegurarse de que sea un array y filtrar valores vacíos
    return Array.isArray(segments)
      ? segments.filter((segment) => segment && typeof segment === 'string')
      : []
  }

  /**
   * Guarda las referencias (nuances_segments) en Redis para un searchId dado
   */
  private async saveSearchRefsToRedis(searchId: string, structuredResult: any): Promise<void> {
    try {
      const refs = this.extractRefsFromStructuredResult(structuredResult)

      await redis.set(
        `search:refs:${searchId}`,
        JSON.stringify({
          refs,
          createdAt: Date.now(),
        }),
        'EX',
        30 // TTL de 30 segundos
      )
    } catch (err) {
      // Importante: esto NUNCA debe romper la búsqueda
      console.warn('[saveSearchRefsToRedis] Failed to store refs in redis', err)
    }
  }

  /**
   * Obtiene las referencias guardadas en Redis para un searchId dado
   */
  public async getSearchRefsFromRedis(
    searchId: string
  ): Promise<{ refs: string[]; createdAt: number } | null> {
    try {
      const data = await redis.get(`search:refs:${searchId}`)

      if (!data) {
        return null
      }

      return JSON.parse(data)
    } catch (err) {
      console.warn('[getSearchRefsFromRedis] Failed to retrieve refs from redis', err)
      return null
    }
  }

  /**
   * Búsqueda simple por tags usando comparación directa de strings
   * Matchea si el tag buscado está contenido en el tag de la foto (perro -> perro grande)
   * pero no al revés (perro grande NO matchea con perro)
   */
  // @withCache({
  //   provider: 'redis',
  //   ttl: 60 * 60 * 12,
  //   key: (
  //     includedTags: string[],
  //     excludedTags: string[],
  //     userId: string | number,
  //     mode: 'AND' | 'OR' = 'AND',
  //     semantic: boolean = false,
  //     limit?: number | null
  //   ) => {
  //     const normalize = (arr: string[] = []) =>
  //       arr
  //         .map((t) => t.toLowerCase().trim())
  //         .filter(Boolean)
  //         .sort()
  //     const included = normalize(includedTags)
  //     const excluded = normalize(excludedTags)
  //     const lim = typeof limit === 'number' ? limit : 'all'
  //     return `searchByTagsDirect:${userId}:${mode}:${semantic ? '1' : '0'}:${lim}:${JSON.stringify(included)}:${JSON.stringify(excluded)}`
  //   },
  // })
  public async searchByTagsDirect(
    includedTags: string[],
    excludedTags: string[],
    userId: string | number,
    mode: 'AND' | 'OR' = 'AND',
    semantic: boolean = false,
    limit?: number | null
  ) {
    const db = await import('@adonisjs/lucid/services/db').then((mod) => mod.default)

    const includedTerms = [...new Set(includedTags.map((t) => t.toLowerCase().trim()))]
    const excludedTerms = excludedTags.map((t) => t.toLowerCase().trim())

    const termRegex = (term: string) =>
      new RegExp(
        `\\b${pluralize.singular(term).replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`,
        'i'
      )
    const includedRegexes = includedTerms.map(termRegex)
    const excludedRegexes = excludedTerms.map(termRegex)

    // Se resuelve a nivel de tag distinto del usuario (miles) y no de par foto-tag
    // (millones en catálogos grandes); luego SQL devuelve solo las fotos que cumplen.
    const userTags: Array<{ id: number; name: string }> =
      includedTerms.length > 0 || excludedTerms.length > 0
        ? await db
            .from('tags')
            .select('id', 'name')
            .whereIn(
              'id',
              db
                .from('tags_photos')
                .join('photos', 'photos.id', 'tags_photos.photo_id')
                .where('photos.user_id', userId)
                .whereNull('photos.deleted_at')
                .select('tags_photos.tag_id')
            )
        : []

    const tagNames = new Map<number, string>()
    // tag id -> índices de los términos buscados que satisface
    const termsByTag = new Map<number, Set<number>>()
    const addTermMatch = (tagId: number, termIndex: number) => {
      if (!termsByTag.has(tagId)) termsByTag.set(tagId, new Set())
      termsByTag.get(tagId)!.add(termIndex)
    }
    const excludedTagIds: number[] = []

    for (const tag of userTags) {
      const name = tag.name.toLowerCase()
      const singularName = pluralize.singular(name)
      tagNames.set(tag.id, name)
      includedRegexes.forEach((regex, i) => {
        if (regex.test(singularName)) addTermMatch(tag.id, i)
      })
      if (excludedRegexes.some((regex) => regex.test(singularName))) {
        excludedTagIds.push(tag.id)
      }
    }

    // La semántica solo se aplica a los tags que no matchearon ya por string.
    if (semantic && includedTerms.length > 0) {
      const candidateTagIds = userTags.filter((t) => !termsByTag.has(t.id)).map((t) => t.id)

      if (candidateTagIds.length > 0) {
        const termEmbeddings = await EmbeddingStoreService.getTextEmbeddings(includedTerms)

        await Promise.all(
          includedTerms.map(async (term, i) => {
            const embedding = termEmbeddings[i]
            if (!embedding) {
              console.warn(`No se pudo obtener embedding para "${term}"`)
              return
            }
            const { rows } = await db.rawQuery(
              `SELECT id FROM tags WHERE id = ANY(?) AND 1 - (embedding <=> ?) >= ?`,
              [candidateTagIds, `[${embedding.join(',')}]`, 0.75]
            )
            for (const row of rows) addTermMatch(row.id, i)
          })
        )
      }
    }

    const includedTagIds = [...termsByTag.keys()]
    if (includedTerms.length > 0 && includedTagIds.length === 0) {
      return { results: [], totalCount: 0 }
    }

    const photoQuery = db
      .from('tags_photos as tp')
      .join('photos as p', 'p.id', 'tp.photo_id')
      .where('p.user_id', userId)
      .whereNull('p.deleted_at')
      .groupBy('tp.photo_id')
      .select('tp.photo_id')

    if (includedTagIds.length > 0) {
      photoQuery
        .whereRaw('tp.tag_id = ANY(?)', [includedTagIds])
        .select(db.raw('array_agg(DISTINCT tp.tag_id) AS tag_ids'))
    }
    if (excludedTagIds.length > 0) {
      photoQuery.whereRaw(
        'NOT EXISTS (SELECT 1 FROM tags_photos ex WHERE ex.photo_id = tp.photo_id AND ex.tag_id = ANY(?))',
        [excludedTagIds]
      )
    }

    const rows: Array<{ photo_id: number; tag_ids?: number[] }> = await photoQuery

    const results: Array<{
      photoId: number
      /** Tags DE LA FOTO que matchearon; es lo que se pinta en las cards. */
      matchedIncluded: string[]
      /** Tags BUSCADOS que la foto satisface; es la medida de relevancia. */
      matchedSearchTags: string[]
      matchedExcluded: string[]
    }> = []

    for (const row of rows) {
      const tagIds = row.tag_ids ?? []
      const satisfiedTerms = new Set<number>()
      for (const tagId of tagIds) {
        for (const termIndex of termsByTag.get(tagId)!) satisfiedTerms.add(termIndex)
      }
      // Un tag buscado cuenta una vez aunque la foto tenga varios tags que lo satisfagan,
      // para que los sinónimos no inflen la relevancia.
      const matchedSearchTags = includedTerms.filter((_, i) => satisfiedTerms.has(i))

      if (mode === 'AND' && matchedSearchTags.length < includedTerms.length) continue

      results.push({
        photoId: row.photo_id,
        matchedIncluded: [...new Set(tagIds.map((id) => tagNames.get(id)!))],
        matchedSearchTags,
        matchedExcluded: [],
      })
    }

    return {
      results: typeof limit === 'number' ? results.slice(0, limit) : results,
      totalCount: results.length,
    }
  }
}
