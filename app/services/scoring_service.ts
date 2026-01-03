// @ts-nocheck

import Tag from '#models/tag'
import ModelsService from './models_service.js'
import Photo from '#models/photo'
import NodeCache from 'node-cache'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { createRequire } from 'module'
import VectorService from './vector_service.js'
import { withCache } from '../decorators/withCache.js'
import type { SearchMode, SearchType } from './search_text_service.js'
import TagPhotoManager from '../managers/tag_photo_manager.js'
import TagManager from '../managers/tag_manager.js'
import TagPhoto from '#models/tag_photo'
import { EmbeddingStoreService, EmbeddingType } from './embeddings_store_service.js'
import NLPService from './nlp_service.js'
const require = createRequire(import.meta.url)
const pluralize = require('pluralize')

const cache = new NodeCache({ stdTTL: 3600 })

interface ScoredPhoto {
  id: number
  tagScore?: number
  descScore?: number
  imageScore?: number
  totalScore?: number
  matchingTags?: any[]
  matchingChunks?: any[]
}

// Interfaces para sistema de puntuación absoluta

export interface MatchThresholds {
  excellent: number // 90-100%
  good: number // 70-89%
  fair: number // 50-69%
  poor: number // 30-49%
}

export interface SearchComposition {
  hasFullQuery: boolean
  hasNuances: boolean
  segmentCount: number
  searchMode?: SearchMode
}

const MAX_SIMILAR_TAGS = 1250
const MAX_SIMILAR_CHUNKS = 850

export type RefineMode = 'entailment' | 'neutral' | 'none'

export interface SearchModeConfig {
  tagsThreshold: number | null
  descSegmentThreshold: number | null
  descFullQueryThreshold: number | null
  imageThreshold: number | null
  refineMode: RefineMode
  nuancesThreshold: number | null
}

const SEARCH_MODE_CONFIGURATION: Record<SearchMode, SearchModeConfig> = {
  broad: {
    tagsThreshold: null,
    descSegmentThreshold: null,
    descFullQueryThreshold: null,
    imageThreshold: 0.15,
    refineMode: 'none',
    nuancesThreshold: null,
  },
  adaptive: {
    tagsThreshold: 0.17,
    descSegmentThreshold: 0.2,
    descFullQueryThreshold: 0.25,
    imageThreshold: 0.2,
    refineMode: 'none',
    nuancesThreshold: null,
  },
  precise: {
    tagsThreshold: 0.17,
    descSegmentThreshold: 0.17,
    descFullQueryThreshold: 0.3,
    imageThreshold: 0.25,
    refineMode: 'entailment',
    nuancesThreshold: null,
  },
  curation: {
    tagsThreshold: null,
    descSegmentThreshold: null,
    descFullQueryThreshold: 0.3,
    imageThreshold: 0.15,
    refineMode: 'neutral',
    nuancesThreshold: 0.35,
  },
}

// Input normalizado y preparado para scoring
interface PreparedQuery {
  positiveSegments: string[]
  nuancesSegments: string[]
  fullQuery: string
  includeVisualAspects: boolean
}

// Configuración efectiva para una búsqueda específica
interface EffectiveConfig extends SearchModeConfig {
  searchInDesc: boolean
}

export default class ScoringService {
  public modelsService: ModelsService = null
  public vectorService: VectorService = null
  public tagManager: TagManager = null
  public tagPhotoManager: TagPhotoManager = null
  public nlpService: NLPService = null

  constructor() {
    this.modelsService = new ModelsService()
    this.vectorService = new VectorService()
    this.tagManager = new TagManager()
    this.tagPhotoManager = new TagPhotoManager()
    this.nlpService = new NLPService()
  }

  // ==================== HELPERS DE CONFIGURACIÓN ====================

  private getEffectiveConfig(
    searchMode: SearchMode,
    searchType: 'full' | 'tags_only'
  ): EffectiveConfig {
    const baseConfig = { ...SEARCH_MODE_CONFIGURATION[searchMode] }

    // Para búsqueda solo por tags, desactivar desc
    if (searchType === 'tags_only') {
      return {
        ...baseConfig,
        descSegmentThreshold: null,
        descFullQueryThreshold: null,
        searchInDesc: false,
      }
    }

    return {
      ...baseConfig,
      searchInDesc: baseConfig.descSegmentThreshold !== null,
    }
  }

  private prepareQuery(structuredQuery: any): PreparedQuery {
    return {
      positiveSegments: this.nlpService.normalizeTerms(structuredQuery.positive_segments),
      nuancesSegments: structuredQuery.nuances_segments?.length
        ? this.nlpService.normalizeTerms(structuredQuery.nuances_segments)
        : [],
      fullQuery: structuredQuery.no_prefix || '',
      includeVisualAspects: structuredQuery.include_visual_aspects || false,
    }
  }

  private prepareQueryFromTags(included: string[], excluded: string[]): PreparedQuery {
    return {
      positiveSegments: this.nlpService.normalizeTerms(included),
      nuancesSegments: [],
      fullQuery: this.nlpService.normalizeTerms(included).join(', '),
      includeVisualAspects: true,
    }
  }

  private async prepareEmbeddings(query: PreparedQuery, config: EffectiveConfig): Promise<void> {
    const terms = [...query.positiveSegments, ...query.nuancesSegments, query.fullQuery].filter(
      Boolean
    )

    const needsClipEmbedding = config.imageThreshold !== null
    await EmbeddingStoreService.calculateEmbeddings(terms, needsClipEmbedding)
  }

  private initializeScores(photoIds: number[]): ScoredPhoto[] {
    return photoIds.map((id) => ({
      id,
      tagScore: 0,
      descScore: 0,
      imageScore: 0,
      totalScore: 0,
    }))
  }

  private getTagsCategories(includeVisualAspects: boolean): string[] {
    return includeVisualAspects
      ? ['context_story', 'visual_accents', 'visual_aspects', 'artistic_scores']
      : ['context_story', 'visual_accents']
  }

  // ==================== MÉTODOS DE COMPOSICIÓN ====================

  private analyzeSearchComposition(
    query: PreparedQuery,
    config: EffectiveConfig,
    searchMode: SearchMode
  ): SearchComposition {
    return {
      hasFullQuery: query.positiveSegments.length > 1 && config.descFullQueryThreshold !== null,
      hasNuances: query.nuancesSegments.length > 0,
      segmentCount:
        query.positiveSegments.length && (config.tagsThreshold !== null || config.searchInDesc)
          ? query.positiveSegments.length
          : 1,
      searchMode,
    }
  }

  public getAbsoluteThresholds(composition: SearchComposition): MatchThresholds {
    // Modificador para umbrales menos estrictos (configurable)
    const THRESHOLD_MODIFIER_NON_PRECISE = 0.7
    // Umbrales base normalizados por segmento
    let segmentCount = Math.max(1, composition.segmentCount)
    // Si hay fullQuery, cuenta como 1/4 segmento adicional
    // Es decir, el score maximo es mas exigente
    if (composition.hasFullQuery) {
      segmentCount += 0.25
    }

    // Modificador para searchMode distinto de 'precise'
    const thresholdModifier =
      composition.searchMode !== 'precise' ? THRESHOLD_MODIFIER_NON_PRECISE : 1

    // Cada umbral es un porcentaje del máximo posible (segmentCount)
    // El rango total será de 0 a segmentCount
    const base = {
      excellent: 0.9 * segmentCount * thresholdModifier, // 90-100%
      good: 0.7 * segmentCount * thresholdModifier, // 70-89%
      fair: 0.5 * segmentCount * thresholdModifier, // 50-69%
      poor: 0.3 * segmentCount * thresholdModifier, // 30-49%
    }

    return base
  }

  public getLabelScore(totalScore: number, thresholds: MatchThresholds): string {
    if (totalScore >= thresholds.excellent) {
      return 'excellent'
    } else if (totalScore >= thresholds.good) {
      return 'good'
    } else if (totalScore >= thresholds.fair) {
      return 'fair'
    } else {
      return 'poor'
    }
  }

  // ==================== MÉTODOS PRINCIPALES DE SCORING ====================

  @withCache({
    provider: 'redis',
    ttl: 60 * 5,
  })
  public async getScoredPhotosByTagsAndDesc(
    photoIds: number[],
    structuredQuery: any,
    searchMode: SearchMode,
    userId: string
  ): Promise<ScoredPhoto[] | undefined> {
    // 1. Obtener configuración
    const config = this.getEffectiveConfig(searchMode, 'full')

    // 2. Preparar query (normalizar términos)
    const query = this.prepareQuery(structuredQuery)

    // 3. Pre-calcular embeddings necesarios
    await this.prepareEmbeddings(query, config)

    // 4. Inicializar scores
    const initialScores = this.initializeScores(photoIds)

    // 5. Ejecutar en paralelo: segmentos, fullQuery, nuances e image
    const [segmentScores, fullQueryScores, nuanceScores, imageScores] = await Promise.all([
      this.processPositiveSegments(initialScores, query, config, userId),
      this.processFullQuery(photoIds, query, config),
      this.processNuances(photoIds, query, config, userId),
      this.processImageSimilarity(photoIds, query.fullQuery, config),
    ])

    // 6. Merge todos los resultados
    let finalScores = this.mergeTagDescScoredPhotos(segmentScores, [], fullQueryScores)

    for (const nuanceScore of nuanceScores) {
      finalScores = this.mergeTagDescScoredPhotos(finalScores, nuanceScore, [])
    }

    finalScores = this.mergeImageScores(finalScores, imageScores)

    // 7. Calcular labels y ordenar
    return this.finalizeScores(finalScores, query, config, searchMode)
  }

  // TODO: replantear: tiene
  private async filterExcludedPhotoIdsByTags(
    photoIds: number[],
    excluded: string[],
    searchMode: SearchMode,
    userId: string
  ): Promise<number[]> {
    const proximityThreshold = 0.4
    const allTags = await this.tagManager.getTagsByUser(userId)

    const matchingPromises = excluded.map((tag) =>
      this.findMatchingTagsForSegment(
        { name: tag, index: 1 },
        allTags,
        0.55,
        'none',
        photoIds,
        [],
        []
      )
    )

    const matchingResults = await Promise.all(matchingPromises)
    const allExcludedTags = matchingResults.map((mr) => mr.matchingPhotoTags).flat()
    const excludedTagNames = allExcludedTags
      .filter((t) => t.proximity > proximityThreshold)
      .map((t) => t.name)

    console.log(`Excluded: ${excludedTagNames}`)

    // Ahora consultamos solo los IDs que tengan esos tags
    const photosWithExcludedTags = await Photo.query()
      .whereIn('id', photoIds)
      .whereHas('tags', (query) => {
        query.whereHas('tag', (tagQuery) => {
          tagQuery.whereIn('name', excludedTagNames)
        })
      })
      .select('id')

    const excludedPhotoIds = photosWithExcludedTags.map((p) => p.id)

    // Devolvemos solo los IDs que no están excluidos
    return photoIds.filter((id) => !excludedPhotoIds.includes(id))
  }

  @withCache({
    provider: 'redis',
    ttl: 60 * 5,
  })
  public async getScoredPhotosByTags(
    photoIds: number[],
    included: string[],
    excluded: string[],
    searchMode: SearchMode,
    userId: string
  ): Promise<ScoredPhoto[] | undefined> {
    // 1. Obtener configuración (tags_only ignora desc)
    const config = this.getEffectiveConfig(searchMode, 'tags_only')

    // 2. Preparar query desde tags
    const query = this.prepareQueryFromTags(included, excluded)
    const normalizedExcluded = this.nlpService.normalizeTerms(excluded)

    await EmbeddingStoreService.calculateEmbeddings(
      [...query.positiveSegments, ...normalizedExcluded, query.fullQuery],
      config.imageThreshold !== null
    )

    // 4. Filtrar excluidos
    const filteredIds = await this.filterExcludedPhotoIdsByTags(
      photoIds,
      normalizedExcluded,
      searchMode,
      userId
    )

    // 5. Inicializar scores (con pequeño valor para devolver algo si solo hay negativos)
    const initialScores = filteredIds.map((id) => ({
      id,
      tagScore: 0,
      descScore: 0,
      imageScore: 0,
      totalScore: 0.0001,
    }))

    // 6. Ejecutar en paralelo: tags e image
    const [tagScores, imageScores] = await Promise.all([
      this.processPositiveSegments(initialScores, query, config, userId),
      this.processImageSimilarity(filteredIds, query.fullQuery, config),
    ])

    // 7. Merge image scores
    const finalScores = this.mergeImageScores(tagScores, imageScores)

    // 8. Calcular labels y ordenar
    return this.finalizeScores(finalScores, query, config, searchMode)
  }

  private mergeTagDescScoredPhotos(
    aggregatedScores: ScoredPhoto[],
    newScoredTagsPhotos: { id: number; tagScore: number; matchingTags?: any[] }[],
    newScoredDescsPhotos: { id: number; descScore: number; matchingChunks?: any[] }[]
  ): ScoredPhoto[] {
    const map = new Map<number, ScoredPhoto>()

    // Inicia con los scores acumulados previos.
    for (const scored of aggregatedScores) {
      map.set(scored.id, { ...scored })
    }

    // Calcular el score del segmento actual para cada foto
    const segmentScores = new Map<number, number>()

    // Recopilar scores de tags para este segmento
    for (const scored of newScoredTagsPhotos) {
      const currentScore = segmentScores.get(scored.id) || 0
      segmentScores.set(scored.id, Math.max(currentScore, scored.tagScore))
    }

    // Recopilar scores de descriptions para este segmento
    for (const scored of newScoredDescsPhotos) {
      const currentScore = segmentScores.get(scored.id) || 0
      segmentScores.set(scored.id, Math.max(currentScore, scored.descScore))
    }

    // Actualizar o crear entradas con matching tags/chunks
    for (const scored of newScoredTagsPhotos) {
      const id = scored.id
      if (map.has(id)) {
        const entry = map.get(id)!
        entry.tagScore = Math.max(entry.tagScore || 0, scored.tagScore)
        entry.matchingTags = Array.from(
          new Set([...(entry.matchingTags || []), ...(scored.matchingTags || [])])
        )
      } else {
        map.set(id, {
          id,
          tagScore: scored.tagScore,
          descScore: 0,
          totalScore: 0,
          matchingTags: scored.matchingTags || [],
          matchingChunks: [],
        })
      }
    }

    for (const scored of newScoredDescsPhotos) {
      const id = scored.id
      if (map.has(id)) {
        const entry = map.get(id)!
        entry.descScore = Math.max(entry.descScore || 0, scored.descScore)
        entry.matchingChunks = Array.from(
          new Set([...(entry.matchingChunks || []), ...(scored.matchingChunks || [])])
        )
      } else {
        map.set(id, {
          id,
          tagScore: 0,
          descScore: scored.descScore,
          totalScore: 0,
          matchingTags: [],
          matchingChunks: scored.matchingChunks || [],
        })
      }
    }

    // Sumar el score del segmento actual al totalScore acumulado
    for (const [photoId, segmentScore] of segmentScores) {
      if (map.has(photoId)) {
        const entry = map.get(photoId)!
        entry.totalScore = (entry.totalScore || 0) + segmentScore
      }
    }

    return Array.from(map.values())
  }

  private mergeImageScores(
    aggregatedScores: ScoredPhoto[],
    imageScores: { id: number; imageScore: number; matchingImageSimilarity: number }[]
  ): ScoredPhoto[] {
    const map = new Map<number, ScoredPhoto>()

    // Inicia con los scores acumulados previos
    for (const scored of aggregatedScores) {
      map.set(scored.id, { ...scored })
    }

    // Agregar o actualizar con imageScores
    for (const imageData of imageScores) {
      const id = imageData.id
      if (map.has(id)) {
        const entry = map.get(id)!
        entry.imageScore = imageData.imageScore
        entry.totalScore = (entry.totalScore || 0) + imageData.imageScore * 1.5
      } else {
        // Crear nueva entrada si no existe
        map.set(id, {
          id,
          tagScore: 0,
          descScore: 0,
          imageScore: imageData.imageScore,
          totalScore: imageData.imageScore,
          matchingTags: [],
          matchingChunks: [],
        })
      }
    }

    return Array.from(map.values())
  }

  // ==================== MÉTODOS DE PROCESAMIENTO ====================

  private async processPositiveSegments(
    scores: ScoredPhoto[],
    query: PreparedQuery,
    config: EffectiveConfig,
    userId: string
  ): Promise<ScoredPhoto[]> {
    const tagsCategories = this.getTagsCategories(query.includeVisualAspects)

    for (const [index, segment] of query.positiveSegments.entries()) {
      scores = await this.processSegment(
        { name: segment, index },
        scores,
        {
          tagsThreshold: config.tagsThreshold,
          descThreshold: config.descSegmentThreshold,
          refineMode: config.refineMode,
        },
        tagsCategories,
        ['context', 'story'],
        userId
      )
    }
    return scores
  }

  // Versión para ejecución paralela (usa photoIds directamente)
  private async processFullQuery(
    photoIds: number[],
    query: PreparedQuery,
    config: EffectiveConfig
  ): Promise<{ id: number; descScore: number; matchingChunks: any[] }[]> {
    // Solo procesar si hay más de 1 segmento y fullQuery está habilitado
    if (query.positiveSegments.length <= 1 || config.descFullQueryThreshold === null) {
      return []
    }

    return this.getScoredPhotoDescBySegment(
      photoIds,
      { name: query.fullQuery, index: -1 },
      config.descFullQueryThreshold,
      config.refineMode,
      true,
      ['context', 'story', 'visual_accents']
    )
  }

  // Versión para ejecución paralela (usa photoIds directamente)
  private async processNuances(
    photoIds: number[],
    query: PreparedQuery,
    config: EffectiveConfig,
    userId: string
  ): Promise<ScoredPhoto[][]> {
    // Solo procesar si hay nuances Y config lo permite
    if (config.nuancesThreshold === null || !query.nuancesSegments.length) {
      return []
    }

    const tagsCategories = this.getTagsCategories(query.includeVisualAspects)
    const initialScores = this.initializeScores(photoIds)

    return Promise.all(
      query.nuancesSegments.map((segment, index) =>
        this.processSegment(
          { name: segment, index },
          initialScores,
          {
            tagsThreshold: config.nuancesThreshold,
            descThreshold: null, // Nuances solo busca en tags
            refineMode: config.refineMode,
          },
          tagsCategories,
          [],
          userId
        )
      )
    )
  }

  // Versión para ejecución paralela (usa photoIds directamente)
  private async processImageSimilarity(
    photoIds: number[],
    fullQuery: string,
    config: EffectiveConfig
  ): Promise<{ id: number; imageScore: number }[]> {
    if (config.imageThreshold === null || !fullQuery) {
      return []
    }

    return this.getScoredPhotoImageByFullQuery(photoIds, fullQuery, config.imageThreshold)
  }

  private finalizeScores(
    scores: ScoredPhoto[],
    query: PreparedQuery,
    config: EffectiveConfig,
    searchMode: SearchMode
  ): ScoredPhoto[] {
    const searchComposition = this.analyzeSearchComposition(query, config, searchMode)
    const thresholds = this.getAbsoluteThresholds(searchComposition)

    return scores
      .filter((score) => score.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((score) => ({
        ...score,
        labelScore: this.getLabelScore(score.totalScore, thresholds),
      }))
  }

  private async processSegment(
    segment: { name: string; index: number },
    aggregatedScores: ScoredPhoto[],
    config: {
      tagsThreshold: number | null
      descThreshold: number | null
      refineMode: RefineMode
    },
    tagsCategories: string[],
    descCategories: string[],
    userId: string
  ): Promise<ScoredPhoto[]> {
    const photoIds = aggregatedScores.map((s) => s.id)

    const tagPromise =
      config.tagsThreshold !== null && photoIds.length
        ? this.getScoredPhotoTagsBySegment(
            photoIds,
            segment,
            config.tagsThreshold,
            config.refineMode,
            tagsCategories,
            [],
            userId
          )
        : Promise.resolve([])

    const descPromise =
      config.descThreshold !== null && photoIds.length
        ? this.getScoredPhotoDescBySegment(
            photoIds,
            segment,
            config.descThreshold,
            config.refineMode,
            false,
            descCategories
          )
        : Promise.resolve([])

    const [newTagScores, newDescScores] = await Promise.all([tagPromise, descPromise])

    const matchingSegmentPhotoIds = new Set([
      ...newTagScores.map((t) => t.id),
      ...newDescScores.map((d) => d.id),
    ])

    let updatedScores = this.mergeTagDescScoredPhotos(aggregatedScores, newTagScores, newDescScores)

    return updatedScores.filter((score) => matchingSegmentPhotoIds.has(score.id))
  }

  private async getScoredPhotoDescBySegment(
    photoIds: number[],
    segment: { name: string; index: number },
    embeddingsProximityThreshold: number = 0.2,
    refineMode: RefineMode,
    isFullQuery: boolean = false,
    categories: string[],
    areas: string[] = []
  ): Promise<{ id: number; descScore: number; matchingChunks: any[] }[]> {
    const embedding = EmbeddingStoreService.getEmbedding(segment.name)

    const matchingChunks = await this.vectorService.findSimilarChunkToEmbedding(
      embedding,
      embeddingsProximityThreshold,
      MAX_SIMILAR_CHUNKS,
      'cosine_similarity',
      photoIds,
      categories,
      areas
    )

    let adjustedChunks = await this.adjustProximities(
      segment.name,
      matchingChunks.map((mc) => ({
        name: mc.chunk.replace(/\.$/, ''),
        proximity: mc.proximity,
        chunk_id: mc.id,
        photo_id: mc.photo_id,
      })),
      'desc',
      refineMode
    )

    const photoChunkMap = new Map<number, any[]>()
    for (const chunk of adjustedChunks) {
      if (!photoChunkMap.has(chunk.photo_id)) {
        photoChunkMap.set(chunk.photo_id, [])
      }
      if (chunk.proximity > 0) {
        photoChunkMap.get(chunk.photo_id).push({
          chunk: chunk.name,
          proximity: chunk.proximity,
          isFullQuery,
        })
      }
    }

    const scoredPhotos = Array.from(photoChunkMap.entries()).map(([photoId, matchingChunks]) => {
      const proximities = matchingChunks.map((c) => c.proximity)
      const descScore = Math.max(...proximities)

      return {
        id: photoId,
        descScore,
        matchingChunks,
      }
    })

    return scoredPhotos
      .filter((score) => score.descScore > 0)
      .sort((a, b) => b.descScore - a.descScore)
  }

  @withCache({
    provider: 'redis',
    ttl: 60 * 5,
  })
  private async getScoredPhotoImageByFullQuery(
    photoIds: number[],
    fullQuery: string,
    embeddingsProximityThreshold: number = 0.25
  ): Promise<{ id: number; imageScore: number }[]> {
    const embedding = EmbeddingStoreService.getEmbedding(fullQuery, EmbeddingType.CLIP)

    if (!embedding) {
      console.warn(
        `[ScoringService] No se encontró embedding CLIP para la fullQuery '${fullQuery}'`
      )
      return []
    }

    const matchingPhotos = await this.vectorService.findSimilarPhotoToEmbedding(
      embedding,
      embeddingsProximityThreshold,
      photoIds.length,
      'cosine_similarity',
      photoIds
    )

    // Map scores from 0.15-0.35 to 0-1
    const mapScore = (score: number) => {
      const min = 0.15
      const max = 0.35
      if (score <= min) return 0
      if (score >= max) return 1
      return (score - min) / (max - min)
    }

    const scoredPhotos = matchingPhotos.map((match) => ({
      id: match.id,
      imageScore: mapScore(match.proximity),
    }))

    return scoredPhotos
      .filter((score) => score.imageScore > 0)
      .sort((a, b) => b.imageScore - a.imageScore)
  }

  private async getScoredPhotoTagsBySegment(
    photoIds: number[],
    segment: { name: string; index: number },
    embeddingsProximityThreshold: number = 0.15,
    refineMode: RefineMode,
    categories?: string[],
    areas: string[] = [],
    userId: string
  ): Promise<{ id: number; tagScore: number; matchingTags: any[] }[]> {
    let userTags = await this.tagManager.getTagsByUser(userId)

    const { matchingPhotoTags } = await this.findMatchingTagsForSegment(
      segment,
      userTags,
      embeddingsProximityThreshold,
      refineMode,
      photoIds,
      categories,
      areas
    )

    const photoTagMap = new Map<number, any[]>()

    for (const pt of matchingPhotoTags) {
      if (!categories || categories.includes(pt.category)) {
        if (!photoTagMap.has(pt.photo_id)) {
          photoTagMap.set(pt.photo_id, [])
        }
        photoTagMap.get(pt.photo_id).push({
          name: pt.name,
          proximity: pt.proximity,
        })
      }
    }

    const scoredPhotos = Array.from(photoTagMap.entries()).map(([photoId, matchingTags]) => {
      const proximities = matchingTags.map((t) => t.proximity)
      const tagScore = Math.max(...proximities)

      return {
        id: photoId,
        tagScore,
        matchingTags,
      }
    })

    return scoredPhotos
      .filter((score) => score.tagScore > 0)
      .sort((a, b) => b.tagScore - a.tagScore)
  }

  public async findMatchingTagsForSegment(
    segment: { name: string; index: number },
    userTags,
    embeddingsProximityThreshold: number,
    refineMode: RefineMode,
    photoIds: number[],
    categories: string[],
    areas: string[]
  ) {
    // Comparación y ajuste semántico/lógico
    const semanticMatches = await this.getSemanticMatches(
      segment.name,
      userTags,
      embeddingsProximityThreshold,
      photoIds,
      categories,
      areas,
      refineMode
    )

    return { matchingPhotoTags: semanticMatches }
  }

  private getStringMatches(segment: { name: string; index: number }, userTags) {
    const lematizedTerm = pluralize.singular(segment.name.toLowerCase())
    const termWordCount = lematizedTerm.split(' ').length

    const lematizedTagNames = userTags.map((tag) => ({
      name: pluralize.singular(tag.name.toLowerCase()),
      id: tag.id,
    }))

    // Filtrar tags con igual o mayor cantidad de palabras que el término
    const equalOrShorterTags = lematizedTagNames.filter(
      (tag) => tag.name.split(' ').length >= termWordCount
    )

    // Coincidencia por expresión regular
    const regex = new RegExp(`(^|\\s)${lematizedTerm}($|\\s)`, 'i')
    const matchedTagsByString = equalOrShorterTags.filter((tag) => regex.test(tag.name))
    const stringMatches = matchedTagsByString.map((tag) => ({
      id: tag.id,
      name: userTags.find((t) => t.id === tag.id).name,
      proximity: 1.9,
    }))

    // Excluir tags ya coincidentes por string
    const remainingTags = lematizedTagNames.filter(
      (tag) => !matchedTagsByString.some((matchedTag) => matchedTag.name === tag.name)
    )

    return { lematizedTerm, stringMatches, remainingTags }
  }

  private async getSemanticMatches(
    term: string,
    userTags,
    embeddingsProximityThreshold: number,
    photoIds: number[],
    categories: string[],
    areas: string[],
    refineMode: RefineMode
  ) {
    const embedding = EmbeddingStoreService.getEmbedding(term)

    const excludeSustantives = term.trim().split(/\s+/).length > 1

    // Buscar similitud
    const similarTags = await this.vectorService.findSimilarTagToEmbedding(
      embedding,
      embeddingsProximityThreshold,
      MAX_SIMILAR_TAGS,
      'cosine_similarity',
      userTags.map((t) => t.id),
      categories,
      areas,
      excludeSustantives ? ['misc'] : [],
      photoIds
    )

    // Ajustar proximidades según inferencia lógica
    const adjustedSimilarTags = await this.adjustProximities(term, similarTags, 'tag', refineMode)

    return adjustedSimilarTags
  }

  public async adjustProximities(
    term: string,
    tags: any[],
    termsType: 'tag' | 'desc' = 'tag',
    refineMode: RefineMode
  ) {
    const LOGIC_THRESHOLD = 1

    // None: sin ajuste, solo filtrar positivos
    if (refineMode === 'none') {
      return tags.filter((tag) => tag.proximity > 0)
    }

    const adjustedProximitiesByContext =
      await this.modelsService.adjustProximitiesByContextInference(term, tags, termsType, false)

    // Entailment: filtro estricto basado en logicProximity
    if (refineMode === 'entailment') {
      return adjustedProximitiesByContext
        .map((ap) => ({
          ...ap,
          proximity: ap.logicProximity,
        }))
        .filter((element) => element.proximity > LOGIC_THRESHOLD)
        .map((element) => ({
          ...element,
          proximity: (element.proximity - LOGIC_THRESHOLD) / (2 - LOGIC_THRESHOLD),
        }))
    }

    // Neutral: bonus logarítmico combinando embeddings y logic
    const maxPossible = 1 + Math.log1p(2) // embeddingsProximity max 1, logicProximity max 2
    return adjustedProximitiesByContext
      .map((ap) => {
        const logicBonus = Math.max(ap.logicProximity, 0)
        const scaledBonus = Math.log1p(logicBonus)
        const rawProximity = ap.embeddingsProximity + scaledBonus
        return {
          ...ap,
          rawProximity,
        }
      })
      .filter((element) => element.rawProximity > 0.9)
      .map((element) => {
        const normalizedProximity = Math.max(0, Math.min(1, element.rawProximity / maxPossible))
        return {
          ...element,
          proximity: normalizedProximity,
        }
      })
  }
}
