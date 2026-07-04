// @ts-nocheck

import Photo from '#models/photo'
import fs from 'fs/promises'

import ModelsService from './models_service.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import path from 'path'
import sharp from 'sharp'
import QueryService from './query_service.js'
import withCostWS from '../decorators/withCostWs.js'
import ScoringService from './scoring_service.js'
import { withCache } from '../decorators/withCache.js'
import redis from '@adonisjs/redis/services/main'

import PhotoManager from '../managers/photo_manager.js'
import {
  MESSAGE_IMAGE_SEARC_INSIGHTS,
  MESSAGE_SEARCH_MODEL_CREATIVE,
  MESSAGE_SEARCH_MODEL_CREATIVE_SCORED_IMAGE,
  MESSAGE_SEARCH_MODEL_REFINED_ADAPTIVE_IMAGE,
  MESSAGE_SEARCH_MODEL_STRICT,
} from '../utils/prompts/insights.js'
import pLimit from 'p-limit'
import DescriptionChunk from '#models/descriptionChunk'
import VectorService from './vector_service.js'
import Tag from '#models/tag'
import { getUploadPath } from '../utils/dataPath.js'
import PhotoImageService from './photo_image_service.js'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { MediaResolution } from '@google/genai'
import { createRequire } from 'module'
import { EmbeddingStoreService } from './embeddings_store_service.js'
import { hashNumberIds } from '../utils/cache_key.js'

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
  withInsights?: boolean
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
  public modelsService: ModelsService = null
  public costTracker: CostTracker
  public photoManager: PhotoManager = null
  public queryService: QueryService = null
  public scoringService: ScoringService = null
  public vectorService: VectorService = null

  constructor() {
    this.costTracker = new CostTracker('search')
    this.modelsService = createTrackedModelsService(new ModelsService(), this.costTracker)
    this.photoManager = new PhotoManager()
    this.queryService = new QueryService()
    this.queryService.modelsService = this.modelsService
    this.scoringService = new ScoringService()
    // Use the cost-tracked ModelsService inside scoring so the LLM logic-inference
    // (LogicInferenceService via getGeminiResponse) token cost is recorded on this
    // search's CostTracker and later charged under the SEARCH_PRECISE margin.
    this.scoringService.modelsService = this.modelsService
    this.vectorService = new VectorService()
  }

  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * Versión síncrona/paginada de searchSemantic.
   * Devuelve solo la página correspondiente a la iteración solicitada.
   * Opcionalmente puede añadir insights si withInsights es true.
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
      withInsights = false,
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
    const { compact_query: compactQuery, cost: compactCost } =
      modeConfig.thresholds.image !== null
        ? await this.queryService.compactQuery(query)
        : { compact_query: null, cost: 0 }
    const { structuredResult, useImage, expansionCost } = await this.queryService.structureQuery(
      query,
      modeConfig
    )
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

    let modelCosts = []

    if (withInsights && paginatedPhotos.length > 0) {
      const batchSize = 1
      let photoBatches = []

      for (let i = 0; i < paginatedPhotos.length; i += batchSize) {
        photoBatches.push(paginatedPhotos.slice(i, i + batchSize))
      }

      const batchPromises = photoBatches.map(async (batch) => {
        const { modelResult, modelCost } = await this.processBatchInsightsImage(
          batch,
          structuredResult,
          searchMode
        )

        modelCosts.push(modelCost)

        return batch.map((scoredPhoto, idx) => {
          const result = modelResult[idx]
          const reasoning = result?.reasoning || ''
          const highMatch = result?.high_match

          return {
            ...scoredPhoto,
            photo: {
              ...scoredPhoto.photo,
              highMatch,
              reasoning,
            },
          }
        })
      })

      const batchResults = await Promise.all(batchPromises)
      paginatedPhotos = batchResults.flat()
    }

    return {
      type: 'search-matches',
      data: {
        hasMore,
        results: {
          [iteration]: paginatedPhotos,
        },
        cost: {
          expansionCost,
          compactCost,
          modelCosts: modelCosts.length > 0 ? modelCosts : undefined,
        },
        iteration,
        structuredResult,
        requireSource: withInsights ? { useImage } : undefined,
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
      withInsights = false,
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

    let modelCosts = []

    // Si se solicitan insights, procesamos las fotos con el modelo
    if (withInsights && paginatedPhotos.length > 0) {
      const batchSize = 1
      let photoBatches = []

      for (let i = 0; i < paginatedPhotos.length; i += batchSize) {
        photoBatches.push(paginatedPhotos.slice(i, i + batchSize))
      }

      // Crear un structuredResult basado en los tags
      const structuredResult = {
        original: `Tags: ${included.join(', ')}${excluded.length > 0 ? ` (excluding: ${excluded.join(', ')})` : ''}`,
      }

      const batchPromises = photoBatches.map(async (batch) => {
        const { modelResult, modelCost } = await this.processBatchInsightsImage(
          batch,
          structuredResult,
          searchMode
        )

        modelCosts.push(modelCost)

        return batch.map((scoredPhoto, idx) => {
          const result = modelResult[idx]
          const reasoning = result?.reasoning || ''
          const matchScore = result?.matchScore

          return {
            ...scoredPhoto,
            photo: {
              ...scoredPhoto.photo,
              matchScore,
              reasoning,
            },
          }
        })
      })

      const batchResults = await Promise.all(batchPromises)
      paginatedPhotos = batchResults.flat()
    }

    return {
      type: 'search-matches',
      data: {
        hasMore,
        results: {
          [iteration]: paginatedPhotos,
        },
        cost: modelCosts.length > 0 ? { modelCosts } : undefined,
        iteration: iteration,
        requireSource: withInsights ? { useImage: true } : undefined,
      },
    }
  }

  @withCache({
    provider: 'redis',
    ttl: 60 * 60 * 24 * 7,
    key: (batch, structuredResult, searchMode) => {
      const photoIds = batch.map((item) => item.photo?.id || item.id).sort((a, b) => a - b)
      return `processBatchInsightsImage:${searchMode}:${JSON.stringify(structuredResult)}:${hashNumberIds(photoIds)}`
    },
  })
  public async processBatchInsightsImage(
    batch: any[],
    structuredResult: any,
    searchMode: SearchMode
  ) {
    const searchModelMessage = MESSAGE_IMAGE_SEARC_INSIGHTS

    const imagesPayload = await this.generateImagesPayload(batch.map((cp) => cp.photo))

    const defaultResults = batch.map(() => ({
      matchScore: null,
      reasoning: null,
    }))

    let modelResult = []
    let modelCost = 0

    if (imagesPayload.length) {
      const response = await this.modelsService.getGeminiResponse(
        searchModelMessage(),
        [
          {
            type: 'text',
            text: JSON.stringify({ query: structuredResult.original }),
          },
          ...imagesPayload,
        ],
        'gemini-2.5-flash-lite',
        {
          temperature: 0.7,
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        },
        false
        // null,
        // 0.7,
        // false
      )

      modelResult = response.result || []
      modelCost = response.cost || 0
    }

    const combinedResults = defaultResults.map((defaultResult, i) => ({
      ...defaultResult,
      ...modelResult[i],
    }))

    return {
      modelResult: combinedResults,
      modelCost,
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

  public async generateImagesPayload(photos: Photo[]) {
    const validImages: any[] = []

    for (const photo of photos) {
      try {
        const base64 = await PhotoImageService.getInstance().getImageBase64FromR2(photo.name, false)

        validImages.push({
          base64,
        })
      } catch (error) {
        console.warn(`No se pudo obtener la imagen ${photo.name} desde R2`, error)
      }
    }

    const payload = validImages.map(({ base64 }) => ({
      inlineData: {
        mimeType: 'image/png',
        data: base64,
      },
    }))

    // Limpiar validImages para liberar memoria
    validImages.forEach((img) => (img.base64 = ''))
    validImages.length = 0

    return payload
    // return validImages.map(({ base64 }) => ({
    //   type: 'image_url',
    //   image_url: {
    //     url: `data:image/jpeg;base64,${base64}`,
    //     detail: 'low',
    //   },
    // }))
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

    // Normalizar tags a minúsculas para comparación
    const normalizedIncluded = includedTags.map((t) => t.toLowerCase().trim())
    const normalizedExcluded = excludedTags.map((t) => t.toLowerCase().trim())

    // Query base: obtener todas las fotos del usuario con sus tags
    const photosWithTags = await db
      .from('photos')
      .select('photos.id as photo_id', 'tags.id as tag_id', 'tags.name as tag_name')
      .innerJoin('tags_photos', 'photos.id', 'tags_photos.photo_id')
      .innerJoin('tags', 'tags_photos.tag_id', 'tags.id')
      .where('photos.user_id', userId)
      .whereNull('photos.deleted_at')

    // Agrupar tags por foto
    const photoTagsMap = new Map<
      number,
      { photoId: number; tags: Array<{ id: number; name: string }> }
    >()

    for (const row of photosWithTags) {
      if (!photoTagsMap.has(row.photo_id)) {
        photoTagsMap.set(row.photo_id, {
          photoId: row.photo_id,
          tags: [],
        })
      }
      photoTagsMap.get(row.photo_id)!.tags.push({
        id: row.tag_id,
        name: row.tag_name,
      })
    }

    // ========== PASO 1: IDENTIFICAR TAGS QUE MATCHEAN POR STRING (GLOBALMENTE) ==========

    // Obtener todos los tags únicos del usuario
    const allUserTags = Array.from(
      new Map(
        Array.from(photoTagsMap.values())
          .flatMap((p) => p.tags)
          .map((t) => [t.id, t])
      ).values()
    )

    // Identificar qué tags del usuario matchean por string (para excluirlos de búsqueda semántica)
    const tagsMatchedByString = new Set<number>()

    for (const searchTag of normalizedIncluded) {
      const singularSearchTag = pluralize.singular(searchTag)
      const regex = new RegExp(
        `\\b${singularSearchTag.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`,
        'i'
      )

      for (const tag of allUserTags) {
        const singularTagName = pluralize.singular(tag.name.toLowerCase())
        if (regex.test(singularTagName)) {
          tagsMatchedByString.add(tag.id)
        }
      }
    }

    // ========== PASO 2: BÚSQUEDA SEMÁNTICA (EXCLUYE TAGS MATCHED POR STRING) ==========

    const photoSemanticMatches = new Map<
      number,
      Array<{ searchTag: string; matchedTag: string; proximity: number }>
    >()

    if (semantic && normalizedIncluded.length > 0) {
      const vectorService = new VectorService()

      // Obtener todos los tag IDs del usuario EXCLUYENDO los que ya matchearon por string
      const allUserTagIds = Array.from(
        new Set(Array.from(photoTagsMap.values()).flatMap((p) => p.tags.map((t) => t.id)))
      )
      const tagIdsForSemanticSearch = allUserTagIds.filter((id) => !tagsMatchedByString.has(id))

      // Obtener todos los photo IDs del usuario para filtrar
      const userPhotoIds = Array.from(photoTagsMap.keys())

      if (tagIdsForSemanticSearch.length > 0) {
        // Calcular embeddings para todos los términos de búsqueda
        const termEmbeddings = await EmbeddingStoreService.getTextEmbeddings(normalizedIncluded)

        // Buscar tags similares en paralelo para todos los términos de búsqueda
        const semanticSearchPromises = normalizedIncluded.map(async (searchTag, i) => {
          try {
            const embedding = termEmbeddings[i]

            if (!embedding) {
              console.warn(`No se pudo obtener embedding para "${searchTag}"`)
              return { searchTag, results: [] }
            }

            const similarTagPhotos = await vectorService.findSimilarTagToEmbedding(
              embedding,
              0.75,
              100,
              'cosine_similarity',
              tagIdsForSemanticSearch,
              undefined,
              undefined,
              [],
              userPhotoIds,
              false
            )

            return { searchTag, results: similarTagPhotos }
          } catch (error) {
            console.error(`Error buscando tags similares para "${searchTag}":`, error)
            return { searchTag, results: [] }
          }
        })

        const semanticSearchResults = await Promise.all(semanticSearchPromises)

        // Agrupar resultados por foto
        for (const { searchTag, results } of semanticSearchResults) {
          for (const tagPhoto of results) {
            const photoId = tagPhoto.photo_id

            if (!photoSemanticMatches.has(photoId)) {
              photoSemanticMatches.set(photoId, [])
            }

            // Verificar que este tag no haya matcheado por string
            const photoData = photoTagsMap.get(photoId)
            if (photoData) {
              const tagInPhoto = photoData.tags.find((t) => t.id === tagPhoto.tag_id)
              if (tagInPhoto && !tagsMatchedByString.has(tagInPhoto.id)) {
                photoSemanticMatches.get(photoId)!.push({
                  searchTag,
                  matchedTag: tagPhoto.name,
                  proximity: tagPhoto.proximity,
                })
              }
            }
          }
        }
      }
    }

    // ========== PASO 3: CONSTRUCCIÓN FINAL DE RESULTADOS ==========

    const results: Array<{
      photoId: number
      matchedIncluded: string[]
      matchedExcluded: string[]
      semanticMatches?: Array<{ searchTag: string; matchedTag: string; proximity: number }>
    }> = []

    for (const [photoId, { tags }] of photoTagsMap.entries()) {
      // Analizar matches por string en esta foto
      const matchedIncluded: string[] = []
      const matchedExcluded: string[] = []
      const matchesBySearchTag = new Map<string, string[]>()

      // Inicializar mapa para cada tag de búsqueda
      for (const searchTag of normalizedIncluded) {
        matchesBySearchTag.set(searchTag, [])
      }

      // Buscar tags que matchearon por string en esta foto
      for (const tag of tags) {
        if (tagsMatchedByString.has(tag.id)) {
          const tagNameLower = tag.name.toLowerCase()
          matchedIncluded.push(tagNameLower)

          // Determinar a qué searchTag corresponde
          for (const searchTag of normalizedIncluded) {
            const singularSearchTag = pluralize.singular(searchTag)
            const singularTagName = pluralize.singular(tagNameLower)
            const regex = new RegExp(
              `\\b${singularSearchTag.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`,
              'i'
            )
            if (regex.test(singularTagName)) {
              matchesBySearchTag.get(searchTag)!.push(tagNameLower)
            }
          }
        }
      }

      // Buscar tags excluidos en esta foto
      for (const tag of tags) {
        const tagNameLower = tag.name.toLowerCase()
        const singularTagName = pluralize.singular(tagNameLower)

        for (const searchTag of normalizedExcluded) {
          const singularSearchTag = pluralize.singular(searchTag)
          const regex = new RegExp(
            `\\b${singularSearchTag.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&')}\\b`,
            'i'
          )
          if (regex.test(singularTagName)) {
            matchedExcluded.push(tagNameLower)
            break
          }
        }
      }

      // Si tiene tags excluidos, saltamos esta foto
      if (matchedExcluded.length > 0) {
        continue
      }

      // Obtener matches semánticos para esta foto
      const semanticMatch = photoSemanticMatches.get(photoId)

      // Verificar si cumple con el modo AND/OR
      let shouldInclude = normalizedIncluded.length === 0 // Si no hay incluidos, todas califican

      if (normalizedIncluded.length > 0) {
        if (mode === 'AND') {
          // TODOS los tags de búsqueda deben tener match (string O semántico)
          shouldInclude = normalizedIncluded.every((searchTag) => {
            const hasStringMatch = matchesBySearchTag.get(searchTag)!.length > 0
            const hasSemanticMatch =
              semanticMatch?.some((sm) => sm.searchTag === searchTag) || false
            return hasStringMatch || hasSemanticMatch
          })
        } else {
          // AL MENOS UNO de los tags de búsqueda debe tener match (string O semántico)
          shouldInclude = normalizedIncluded.some((searchTag) => {
            const hasStringMatch = matchesBySearchTag.get(searchTag)!.length > 0
            const hasSemanticMatch =
              semanticMatch?.some((sm) => sm.searchTag === searchTag) || false
            return hasStringMatch || hasSemanticMatch
          })
        }
      }

      if (shouldInclude) {
        // Combinar tags matched por string y semántica
        const allMatchedTags = [...matchedIncluded]
        if (semanticMatch) {
          allMatchedTags.push(...semanticMatch.map((sm) => sm.matchedTag))
        }

        results.push({
          photoId,
          matchedIncluded: [...new Set(allMatchedTags)],
          matchedExcluded: [],
        })
      }
    }

    return {
      results: typeof limit === 'number' ? results.slice(0, limit) : results,
      totalCount: results.length,
    }
  }
}
