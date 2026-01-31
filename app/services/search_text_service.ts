// @ts-nocheck

import Photo from '#models/photo'
import fs from 'fs/promises'

import ModelsService from './models_service.js'
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

export type SearchMode = 'precise' | 'adaptive' | 'broad' | 'curation'
export type SearchType = 'semantic' | 'tags'

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
  artisticScores?: string[]
  cursor?: string
  source?: string
  withInsights?: boolean
  searchId?: string
}

export type SearchTagsOptions = SearchOptions & {
  included: string[]
  excluded: string[]
}

export default class SearchTextService {
  public modelsService: ModelsService = null
  public photoManager: PhotoManager = null
  public queryService: QueryService = null
  public scoringService: ScoringService = null
  public vectorService: VectorService = null

  constructor() {
    this.modelsService = new ModelsService()
    this.photoManager = new PhotoManager()
    this.queryService = new QueryService()
    this.scoringService = new ScoringService()
    this.vectorService = new VectorService()
  }

  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  public async *searchSemanticStream(
    query: string,
    userId: string | number,
    options: SearchOptions = {
      searchMode: 'precise',
      pageSize: 18,
      iteration: 1,
    }
  ) {
    let {
      searchMode,
      pageSize,
      iteration,
      minMatchScore,
      maxPageAttempts = 6,
      minResults,
      collections,
      visualAspects,
      artisticScores,
    } = options

    const photoIds = await this.photoManager.getPhotosIdsForSearch(
      userId?.toString(),
      collections && collections.length > 0 ? collections : undefined,
      visualAspects && visualAspects.length > 0 ? visualAspects : undefined,
      artisticScores && artisticScores.length > 0 ? artisticScores : undefined
    )

    const { structuredResult, useImage, expansionCost } = await this.queryService.structureQuery(
      query,
      searchMode
    )

    let photosResult = []
    let modelCosts = []
    let attempts = 0

    let embeddingScoredPhotos = await this.scoringService.getScoredPhotosByTagsAndDesc(
      photoIds,
      structuredResult,
      // searchMode == 'curation' ? 'broad' : searchMode,
      searchMode,
      userId?.toString()
    )

    do {
      const { paginatedPhotos, hasMore } = await this.getPaginatedPhotosByPage(
        embeddingScoredPhotos,
        pageSize,
        iteration
      )

      yield {
        type: searchMode !== 'curation' ? 'search-matches' : 'curation-matches',
        data: {
          hasMore,
          results: {
            [iteration]: paginatedPhotos,
          },
          cost: { expansionCost },
          iteration: iteration,
          structuredResult,
        },
      }

      if (searchMode !== 'curation') {
        return
      }

      const batchSize = 1

      let photoBatches = []
      for (let i = 0; i < paginatedPhotos.length; i += batchSize) {
        photoBatches.push(paginatedPhotos.slice(i, i + batchSize))
      }

      const batchPromises = photoBatches.map(async (batch, index) => {
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
            score: scoredPhoto.tagScore || scoredPhoto.score,
            matchScore,
            reasoning,
          }
        })
      })

      const batchResults = await Promise.all(batchPromises)
      photosResult = photosResult.concat(...batchResults.flat())

      iteration++
      attempts++

      yield {
        type: 'insights',
        data: {
          results: { [iteration - 1]: photosResult },
          hasMore,
          finished: !(
            attempts < maxPageAttempts &&
            photosResult.filter((p) => p.matchScore >= minMatchScore).length === 0
          ),
          cost: { expansionCost, modelCosts },
          iteration: iteration - 1,
          structuredResult,
          requireSource: { useImage },
        },
      }

      if (attempts >= maxPageAttempts || paginatedPhotos.length === 0) {
        yield {
          type: 'maxPageAttempts',
        }
        return
      }

      await this.sleep(750)
    } while (
      attempts < maxPageAttempts &&
      photosResult.filter((p) => p.matchScore >= minMatchScore).length < minResults
    )
  }

  /**
   * Versión síncrona/paginada de searchSemantic, sin soporte para 'curation'.
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
      searchId, // 👈 nuevo
    } = options

    if (searchMode === 'curation') {
      throw new Error('searchSemanticSync no soporta el modo curation')
    }

    const photoIds = await this.photoManager.getPhotosIdsForSearch(
      userId?.toString(),
      collections && collections.length > 0 ? collections : undefined,
      visualAspects && visualAspects.length > 0 ? visualAspects : undefined,
      artisticScores && artisticScores.length > 0 ? artisticScores : undefined,
      source || undefined
    )

    const { structuredResult, useImage, expansionCost } = await this.queryService.structureQuery(
      query,
      searchMode
    )

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

    let { paginatedPhotos, hasMore } = await this.getPaginatedPhotosByCursor(
      embeddingScoredPhotos,
      pageSize,
      cursor
    )

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
      artisticScores && artisticScores.length > 0 ? artisticScores : undefined
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
    ttl: 60 * 5,
    key: (batch, structuredResult, searchMode) => {
      const photoIds = batch
        .map((item) => item.photo?.id || item.id)
        .sort()
        .join(',')
      return `processBatchInsightsImage:${searchMode}:${JSON.stringify(structuredResult)}:${photoIds}`
    },
  })
  public async processBatchInsightsImage(
    batch: any[],
    structuredResult: any,
    searchMode: SearchMode
  ) {
    const searchModelMessage =
      searchMode === 'curation'
        ? MESSAGE_SEARCH_MODEL_CREATIVE_SCORED_IMAGE
        : MESSAGE_IMAGE_SEARC_INSIGHTS

    const model = searchMode === 'curation' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash-lite'

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
}
