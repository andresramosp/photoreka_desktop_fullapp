// @ts-nocheck

import Tag from '#models/tag'
import ModelsService from './models_service.js'
import Photo from '#models/photo'
import NodeCache from 'node-cache'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { createRequire } from 'module'
import VectorService from './vector_service.js'
import { withCache } from '../decorators/withCache.js'
import type {
  SearchMode,
  SearchType,
  RefineMode,
  SearchModeConfig,
  ImageRankingStrategy,
} from './search_text_service.js'
import { SEARCH_MODE_CONFIGURATION } from './search_text_service.js'
import TagPhotoManager from '../managers/tag_photo_manager.js'
import TagManager from '../managers/tag_manager.js'
import TagPhoto from '#models/tag_photo'
import { EmbeddingStoreService } from './embeddings_store_service.js'
import NLPService from './nlp_service.js'
import { hashNumberIds } from '../utils/cache_key.js'
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
  maxScore?: number
  imageRanking?: ImageRankingStrategy
}

const MAX_SIMILAR_TAGS = 1250
const MAX_SIMILAR_CHUNKS = 850
const MAX_SIMILAR_PHOTOS = 5000
const MAX_PARALLEL_SCORING_PHOTOS = 5000
const MAX_CACHEABLE_SCORING_PHOTOS = 5000
const SCORING_CACHE_VERSION = 'v5'

// CLIP cosine proximities live in roughly this band; mapClipProximityToScore normalizes them to 0..1.
const CLIP_SCORE_MIN = 0.15
const CLIP_SCORE_MAX = 0.35

// gateThenRank: CLIP must SCORE every admitted photo over its full range so it can actually rank
// them, so we score from this low floor regardless of the mode's (much higher) image threshold.
// The mode's image threshold is instead applied to the *mapped* score to decide CLIP-only admission.
const CLIP_RANK_FLOOR = CLIP_SCORE_MIN

// gateThenRank: tiny floor given to photos that qualified via a text (entailment) match but scored
// no CLIP similarity, so they still surface — ranked below every CLIP-scored photo — instead of
// vanishing. Small enough to never perturb the CLIP-driven order among photos that CLIP did score.
const TEXT_GATE_FLOOR = 0.0001

// Normalizes a raw CLIP cosine proximity into a 0..1 score. Shared by the image scorer and the
// gateThenRank admission cutoff so both speak the same units.
function mapClipProximityToScore(proximity: number): number {
  if (proximity <= CLIP_SCORE_MIN) return 0
  if (proximity >= CLIP_SCORE_MAX) return 1
  return (proximity - CLIP_SCORE_MIN) / (CLIP_SCORE_MAX - CLIP_SCORE_MIN)
}

// Input normalizado y preparado para scoring
interface PreparedQuery {
  positiveSegments: string[]
  nuancesSegments: string[]
  fullQuery: string
  clipQuery: string
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
        thresholds: {
          ...baseConfig.thresholds,
          descSegment: null,
          descFullQuery: null,
        },
        scoreWeights: {
          ...baseConfig.scoreWeights,
          tag: 1,
        },
        thresholdWeights: {
          ...baseConfig.thresholdWeights,
          tag: 1,
        },
        searchInDesc: false,
      }
    }

    return {
      ...baseConfig,
      searchInDesc: baseConfig.thresholds.descSegment !== null,
    }
  }

  private prepareQuery(structuredQuery: any, config: EffectiveConfig): PreparedQuery {
    const noPrefix = structuredQuery.no_prefix || ''
    const clipQuery =
      config.thresholds.image !== null ? structuredQuery.compact_query || noPrefix : noPrefix
    return {
      positiveSegments: this.nlpService.normalizeTerms(structuredQuery.positive_segments),
      nuancesSegments: structuredQuery.nuances_segments?.length
        ? this.nlpService.normalizeTerms(structuredQuery.nuances_segments)
        : [],
      fullQuery: noPrefix,
      clipQuery,
      includeVisualAspects: structuredQuery.include_visual_aspects || false,
    }
  }

  private prepareQueryFromTags(included: string[], excluded: string[]): PreparedQuery {
    const joinedTerms = this.nlpService.normalizeTerms(included).join(', ')
    return {
      positiveSegments: this.nlpService.normalizeTerms(included),
      nuancesSegments: [],
      fullQuery: joinedTerms,
      clipQuery: joinedTerms,
      includeVisualAspects: true,
    }
  }

  private async prepareEmbeddings(query: PreparedQuery, config: EffectiveConfig): Promise<void> {
    const needsSegmentEmbeddings =
      config.thresholds.tag !== null || config.thresholds.descSegment !== null
    const needsNuancesEmbeddings = config.thresholds.nuances !== null
    const needsFullQueryTextEmbedding =
      config.thresholds.descFullQuery !== null || config.thresholds.notes !== null
    const needsClipEmbedding = config.thresholds.image !== null

    const terms: string[] = []

    if (needsSegmentEmbeddings) {
      terms.push(...query.positiveSegments)
    }
    if (needsNuancesEmbeddings) {
      terms.push(...query.nuancesSegments)
    }
    if (needsFullQueryTextEmbedding && query.fullQuery) {
      terms.push(query.fullQuery)
    }
    if (needsClipEmbedding && query.clipQuery) {
      terms.push(query.clipQuery)
    }

    const needsTextEmbedding =
      needsSegmentEmbeddings || needsNuancesEmbeddings || needsFullQueryTextEmbedding

    const filteredTerms = [...new Set(terms.filter(Boolean))]
    await EmbeddingStoreService.preloadEmbeddings(
      filteredTerms,
      needsClipEmbedding,
      needsTextEmbedding
    )
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
    const hasPositiveTextSegments =
      query.positiveSegments.length > 0 && (config.thresholds.tag !== null || config.searchInDesc)
    const positiveSegmentThresholdWeight = Math.max(
      config.thresholds.tag !== null ? config.thresholdWeights.tag : 0,
      config.searchInDesc ? config.thresholdWeights.desc : 0
    )
    let maxScore = hasPositiveTextSegments
      ? query.positiveSegments.length * positiveSegmentThresholdWeight
      : config.thresholdWeights.image

    if (config.thresholds.image !== null) {
      maxScore = Math.max(maxScore, config.thresholdWeights.image)
    }
    if (query.positiveSegments.length > 1 && config.thresholds.descFullQuery !== null) {
      maxScore += config.thresholdWeights.fullQueryDesc
    }
    if (query.fullQuery && config.thresholds.notes !== null) {
      maxScore += config.thresholdWeights.notes
    }
    if (query.nuancesSegments.length && config.thresholds.nuances !== null) {
      maxScore += query.nuancesSegments.length * config.thresholdWeights.nuances
    }

    return {
      hasFullQuery: query.positiveSegments.length > 1 && config.thresholds.descFullQuery !== null,
      hasNuances: query.nuancesSegments.length > 0,
      segmentCount:
        query.positiveSegments.length && (config.thresholds.tag !== null || config.searchInDesc)
          ? query.positiveSegments.length
          : 1,
      searchMode,
      maxScore: Math.max(1, maxScore),
      imageRanking: config.imageRanking,
    }
  }

  public getAbsoluteThresholds(composition: SearchComposition): MatchThresholds {
    // Modificador para umbrales menos estrictos (configurable)
    const THRESHOLD_MODIFIER_NON_PRECISE = 0.7
    // Umbrales base normalizados por segmento
    let segmentCount = Math.max(1, composition.maxScore ?? composition.segmentCount)
    // Si hay fullQuery, cuenta como 1/4 segmento adicional
    // Es decir, el score maximo es mas exigente
    if (composition.maxScore === undefined && composition.hasFullQuery) {
      segmentCount += 0.25
    }

    // Escala de labels. El modificador estricto (1.0) solo tenía sentido cuando 'precise' sumaba un
    // score aditivo multi-canal que podía subir alto. En gateThenRank el score es CLIP puro, igual
    // que broad, así que usa la MISMA escala indulgente calibrada a CLIP (0.7) — por eso las estrellas
    // de precise ahora coinciden con las de broad en vez de mandarlo todo a 'poor'.
    const usesClipLabelScale =
      composition.imageRanking === 'gateThenRank' || composition.searchMode !== 'precise'
    const thresholdModifier = usesClipLabelScale ? THRESHOLD_MODIFIER_NON_PRECISE : 1

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
    key: (photoIds: number[], structuredQuery: any, searchMode: SearchMode, userId: string) =>
      `${SCORING_CACHE_VERSION}:getScoredPhotosByTagsAndDesc:${userId}:${searchMode}:${JSON.stringify(structuredQuery)}:${hashNumberIds(photoIds)}`,
    ttl: 60 * 60 * 12,
    shouldCache: (_result, [photoIds]) => photoIds.length <= MAX_CACHEABLE_SCORING_PHOTOS,
  })
  public async getScoredPhotosByTagsAndDesc(
    photoIds: number[],
    structuredQuery: any,
    searchMode: SearchMode,
    userId: string
  ): Promise<ScoredPhoto[] | undefined> {
    // 1. Obtener configuración
    const config = this.getEffectiveConfig(searchMode, 'full')

    // gateThenRank scores CLIP from a low floor (so ranking has full range); admission strictness is
    // reapplied later in finalizeScores. blend modes score at the mode's own image threshold.
    const imageScoringThreshold =
      config.imageRanking === 'gateThenRank' ? CLIP_RANK_FLOOR : undefined

    // 2. Preparar query (normalizar términos)
    const query = this.prepareQuery(structuredQuery, config)

    // 3. Pre-calcular embeddings necesarios
    await this.prepareEmbeddings(query, config)

    // 4. Inicializar scores
    const initialScores = this.initializeScores(photoIds)

    if (photoIds.length > MAX_PARALLEL_SCORING_PHOTOS) {
      console.log(
        `[ScoringService] Número de fotos (${photoIds.length}) excede el límite para procesamiento paralelo (${MAX_PARALLEL_SCORING_PHOTOS}). Procesando secuencialmente para evitar sobrecarga.`
      )

      let finalScores = await this.processPositiveSegments(initialScores, query, config, userId)

      const fullQueryScores = await this.processFullQuery(photoIds, query, config)
      finalScores = this.mergeTagDescScoredPhotos(finalScores, [], fullQueryScores, {
        desc: config.scoreWeights.fullQueryDesc,
      })

      const notesScores = await this.processNotes(photoIds, query, config)
      finalScores = this.mergeTagDescScoredPhotos(finalScores, [], notesScores, {
        desc: config.scoreWeights.notes,
      })

      const nuanceScores = await this.processNuances(photoIds, query, config, userId)
      for (const nuanceScore of nuanceScores) {
        finalScores = this.mergeTagDescScoredPhotos(finalScores, nuanceScore, [], {
          tag: config.scoreWeights.nuances,
        })
      }

      const imageScores = await this.processImageSimilarity(
        photoIds,
        query.clipQuery,
        config,
        userId,
        imageScoringThreshold
      )
      finalScores = this.mergeImageScores(finalScores, imageScores, config)

      return this.finalizeScores(finalScores, query, config, searchMode)
    }

    console.log(`[ScoringService] Procesando ${photoIds.length} fotos en paralelo`)

    const [segmentScores, fullQueryScores, notesScores, nuanceScores, imageScores] =
      await Promise.all([
        this.processPositiveSegments(initialScores, query, config, userId),
        this.processFullQuery(photoIds, query, config),
        this.processNotes(photoIds, query, config),
        this.processNuances(photoIds, query, config, userId),
        this.processImageSimilarity(photoIds, query.clipQuery, config, userId, imageScoringThreshold),
      ])

    // 6. Merge todos los resultados
    let finalScores = this.mergeTagDescScoredPhotos(segmentScores, [], fullQueryScores, {
      desc: config.scoreWeights.fullQueryDesc,
    })

    // Merge notes scores
    finalScores = this.mergeTagDescScoredPhotos(finalScores, [], notesScores, {
      desc: config.scoreWeights.notes,
    })

    for (const nuanceScore of nuanceScores) {
      finalScores = this.mergeTagDescScoredPhotos(finalScores, nuanceScore, [], {
        tag: config.scoreWeights.nuances,
      })
    }

    finalScores = this.mergeImageScores(finalScores, imageScores, config)

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
    key: (
      photoIds: number[],
      included: string[],
      excluded: string[],
      searchMode: SearchMode,
      userId: string
    ) =>
      `${SCORING_CACHE_VERSION}:getScoredPhotosByTags:${userId}:${searchMode}:${JSON.stringify([...included].sort())}:${JSON.stringify([...excluded].sort())}:${hashNumberIds(photoIds)}`,
    ttl: 60 * 60 * 12,
    shouldCache: (_result, [photoIds]) => photoIds.length <= MAX_CACHEABLE_SCORING_PHOTOS,
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

    await EmbeddingStoreService.preloadEmbeddings(
      [...query.positiveSegments, ...normalizedExcluded, query.fullQuery],
      config.thresholds.image !== null
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

    // gateThenRank scores CLIP from a low floor so ranking has full range (see getScoredPhotosByTagsAndDesc)
    const imageScoringThreshold =
      config.imageRanking === 'gateThenRank' ? CLIP_RANK_FLOOR : undefined

    // 6. Ejecutar en paralelo: tags e image
    const [tagScores, imageScores] = await Promise.all([
      this.processPositiveSegments(initialScores, query, config, userId),
      this.processImageSimilarity(filteredIds, query.clipQuery, config, userId, imageScoringThreshold),
    ])

    // 7. Merge image scores
    const finalScores = this.mergeImageScores(tagScores, imageScores, config)

    // 8. Calcular labels y ordenar
    return this.finalizeScores(finalScores, query, config, searchMode)
  }

  private mergeTagDescScoredPhotos(
    aggregatedScores: ScoredPhoto[],
    newScoredTagsPhotos: { id: number; tagScore: number; matchingTags?: any[] }[],
    newScoredDescsPhotos: { id: number; descScore: number; matchingChunks?: any[] }[],
    scoreWeights: { tag?: number; desc?: number } = {}
  ): ScoredPhoto[] {
    const map = new Map<number, ScoredPhoto>()
    const tagScoreWeight = scoreWeights.tag ?? 1
    const descScoreWeight = scoreWeights.desc ?? 1

    // Inicia con los scores acumulados previos.
    for (const scored of aggregatedScores) {
      map.set(scored.id, { ...scored })
    }

    // Calcular el score del segmento actual para cada foto
    const segmentScores = new Map<number, number>()

    // Recopilar scores de tags para este segmento
    for (const scored of newScoredTagsPhotos) {
      const currentScore = segmentScores.get(scored.id) || 0
      segmentScores.set(scored.id, Math.max(currentScore, scored.tagScore * tagScoreWeight))
    }

    // Recopilar scores de descriptions para este segmento
    for (const scored of newScoredDescsPhotos) {
      const currentScore = segmentScores.get(scored.id) || 0
      segmentScores.set(scored.id, Math.max(currentScore, scored.descScore * descScoreWeight))
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
    imageScores: { id: number; imageScore: number; matchingImageSimilarity: number }[],
    config: EffectiveConfig
  ): ScoredPhoto[] {
    const map = new Map<number, ScoredPhoto>()
    const imageScoreWeight = config.scoreWeights.image

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
        entry.totalScore = (entry.totalScore || 0) + imageData.imageScore * imageScoreWeight
      } else {
        // Crear nueva entrada si no existe
        map.set(id, {
          id,
          tagScore: 0,
          descScore: 0,
          imageScore: imageData.imageScore,
          totalScore: imageData.imageScore * imageScoreWeight,
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
          tagsThreshold: config.thresholds.tag,
          descThreshold: config.thresholds.descSegment,
          refineMode: config.refineMode,
          tagScoreWeight: config.scoreWeights.tag,
          descScoreWeight: config.scoreWeights.desc,
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
    if (
      query.positiveSegments.length <= 1 ||
      config.thresholds.descFullQuery === null ||
      !query.fullQuery
    ) {
      return []
    }

    return this.getScoredPhotoDescBySegment(
      photoIds,
      { name: query.fullQuery, index: -1 },
      config.thresholds.descFullQuery,
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
    if (config.thresholds.nuances === null || !query.nuancesSegments.length) {
      return []
    }

    const tagsCategories = this.getTagsCategories(query.includeVisualAspects)
    const initialScores = this.initializeScores(photoIds)

    const processNuance = (segment: string, index: number) =>
      this.processSegment(
        { name: segment, index },
        initialScores,
        {
          tagsThreshold: config.thresholds.nuances,
          descThreshold: null, // Nuances solo busca en tags
          refineMode: config.refineMode,
          tagScoreWeight: config.scoreWeights.nuances,
          descScoreWeight: 0,
        },
        tagsCategories,
        [],
        userId
      )

    if (photoIds.length <= MAX_PARALLEL_SCORING_PHOTOS) {
      return Promise.all(query.nuancesSegments.map(processNuance))
    }

    const nuanceScores: ScoredPhoto[][] = []
    for (const [index, segment] of query.nuancesSegments.entries()) {
      nuanceScores.push(await processNuance(segment, index))
    }
    return nuanceScores
  }

  // Versión para ejecución paralela (usa photoIds directamente)
  private async processNotes(
    photoIds: number[],
    query: PreparedQuery,
    config: EffectiveConfig
  ): Promise<{ id: number; descScore: number; matchingChunks: any[] }[]> {
    // Solo procesar si notes está habilitado y hay fullQuery
    if (config.thresholds.notes === null || !query.fullQuery) {
      return []
    }

    return this.getScoredPhotoDescBySegment(
      photoIds,
      { name: query.fullQuery, index: -2 },
      config.thresholds.notes,
      'none',
      false,
      ['notes']
    )
  }

  // Versión para ejecución paralela (usa photoIds directamente)
  private async processImageSimilarity(
    photoIds: number[],
    fullQuery: string,
    config: EffectiveConfig,
    userId: string,
    thresholdOverride?: number
  ): Promise<{ id: number; imageScore: number }[]> {
    if (config.thresholds.image === null || !fullQuery) {
      return []
    }

    // gateThenRank scores CLIP from a low floor so the mapped score spans its full range and can
    // rank; blend modes keep scoring at the mode's own image threshold.
    const scoringThreshold = thresholdOverride ?? config.thresholds.image

    return this.getScoredPhotoImageByFullQuery(photoIds, fullQuery, scoringThreshold, userId)
  }

  private finalizeScores(
    scores: ScoredPhoto[],
    query: PreparedQuery,
    config: EffectiveConfig,
    searchMode: SearchMode
  ): ScoredPhoto[] {
    const searchComposition = this.analyzeSearchComposition(query, config, searchMode)
    const thresholds = this.getAbsoluteThresholds(searchComposition)

    // gateThenRank: admission is decided by text (entailment) OR strong CLIP; the order is then
    // driven purely by the full-range CLIP score. CLIP was scored from a low floor (CLIP_RANK_FLOOR)
    // so imageScore has real dynamic range even for photos below the mode's image threshold — that
    // threshold is reapplied here, in mapped-score units, only to gate CLIP-*only* admissions.
    // This is what stops a distant/anecdotal moto (weak CLIP, strong tag) from outranking a moto that
    // fills the frame (strong CLIP): the tag no longer contributes to the score at all.
    const rankedScores =
      config.imageRanking === 'gateThenRank'
        ? scores.map((score) => {
            const imageScore = score.imageScore || 0
            const hasTextMatch = (score.tagScore || 0) > 0 || (score.descScore || 0) > 0
            const strongClipAdmit =
              config.thresholds.image !== null &&
              imageScore >= mapClipProximityToScore(config.thresholds.image)
            const admitted = hasTextMatch || strongClipAdmit

            const imageContribution = imageScore * config.scoreWeights.image
            return {
              ...score,
              totalScore: !admitted
                ? 0
                : imageContribution > 0
                  ? imageContribution
                  : TEXT_GATE_FLOOR,
            }
          })
        : scores

    return rankedScores
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
      tagScoreWeight?: number
      descScoreWeight?: number
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

    let updatedScores = this.mergeTagDescScoredPhotos(
      aggregatedScores,
      newTagScores,
      newDescScores,
      {
        tag: config.tagScoreWeight,
        desc: config.descScoreWeight,
      }
    )

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
    const embedding = (await EmbeddingStoreService.getTextEmbeddings([segment.name]))[0]
    if (!embedding || embedding.length === 0) {
      console.warn(
        `[getScoredPhotoDescBySegment] No embedding found for segment: '${segment.name}', skipping`
      )
      return []
    }

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
        category: mc.category,
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
          category: chunk.category,
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
    key: (
      photoIds: number[],
      fullQuery: string,
      embeddingsProximityThreshold: number,
      userId: string
    ) =>
      `getScoredPhotoImageByFullQuery:${userId}:${fullQuery}:${embeddingsProximityThreshold}:${hashNumberIds(photoIds)}`,
    ttl: 60 * 60 * 12,
  })
  private async getScoredPhotoImageByFullQuery(
    photoIds: number[],
    fullQuery: string,
    embeddingsProximityThreshold: number = 0.25,
    userId: string = ''
  ): Promise<{ id: number; imageScore: number }[]> {
    const embedding = (await EmbeddingStoreService.getCLIPEmbeddings([fullQuery]))[0]

    if (!embedding) {
      console.warn(
        `[ScoringService] No se encontró embedding CLIP para la fullQuery '${fullQuery}'`
      )
      return []
    }

    const matchingPhotos = await this.vectorService.findSimilarPhotoToEmbedding(
      embedding,
      embeddingsProximityThreshold,
      Math.min(photoIds.length, MAX_SIMILAR_PHOTOS),
      'cosine_similarity',
      photoIds
    )

    const scoredPhotos = matchingPhotos.map((match) => ({
      id: match.id,
      imageScore: mapClipProximityToScore(match.proximity),
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
    const embedding = (await EmbeddingStoreService.getTextEmbeddings([term]))[0]

    if (!embedding) return []

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
