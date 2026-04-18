// @ts-nocheck

import Photo from '#models/photo'
import DescriptionChunk from '#models/descriptionChunk'

import ModelsService from './models_service.js'
import PhotoManager from '../managers/photo_manager.js'
import VisualFeaturesService from './visual_features_service.js'
import ScoringService, { MatchThresholds, SearchComposition } from './scoring_service.js'
import VectorService from './vector_service.js'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import PhotoImageService from './photo_image_service.js'
import sharp from 'sharp'

export type SearchByPhotoOptions = {
  anchorIds: number[]
  currentPhotosIds: number[]
  criteria:
    | 'embedding'
    | 'story'
    | 'context'
    | 'chromatic'
    | 'chromatic_dominant'
    | 'composition'
    | 'tags'
  tagIds: number[]
  boxesIds: number[]
  descriptionCategories: string[]
  opposite: boolean
  inverted: boolean
  resultLength: number
  collectionId?: number
  /** When provided, restricts the candidate pool to only these photo IDs (applied after collectionId filter). */
  candidatePoolIds?: number[]
  /** Optional crop region as percentages (0-1). When set, only the selected area of the anchor is used for scoring. */
  cropRegion?: { x: number; y: number; w: number; h: number } | null
}

export default class SearchPhotoService {
  private photoManager = new PhotoManager()
  private visualFeaturesService = new VisualFeaturesService()
  private scoringService = new ScoringService()
  private vectorService = new VectorService()

  public async searchByPhotos(
    query: SearchByPhotoOptions,
    userId: number
  ): Promise<(Photo & { score: number; labelScore: string })[]> {
    if (!query.anchorIds?.length) return []

    let userPhotoIds = await this.photoManager.getPhotosIdsForSearch(userId)

    if (query.collectionId) {
      const collectionPhotos = await Photo.query()
        .whereHas('collections', (q) => {
          q.where('collection_id', query.collectionId)
        })
        .where('user_id', userId)
        .select('id')
      const collectionPhotoIds = collectionPhotos.map((p) => p.id)
      userPhotoIds = userPhotoIds.filter((id) => collectionPhotoIds.includes(id))
    }

    if (query.candidatePoolIds && query.candidatePoolIds.length > 0) {
      const poolSet = new Set(query.candidatePoolIds)
      userPhotoIds = userPhotoIds.filter((id) => poolSet.has(id))
    }

    const anchors = await this.photoManager.getPhotosByIds(query.anchorIds)
    if (!anchors.length) return []

    const candidateIds = userPhotoIds.filter(
      (id) => !query.anchorIds.includes(id) && !query.currentPhotosIds.includes(id)
    )
    if (!candidateIds.length) return []

    let scored: { id: number; score: number }[] = []
    switch (query.criteria) {
      case 'story':
        scored = await this.scoreSemantic(query, candidateIds, anchors, ['story'])
        break
      case 'context':
        scored = await this.scoreSemantic(query, candidateIds, anchors, ['context'])
        break
      case 'visual_accents':
        scored = await this.scoreSemantic(query, candidateIds, anchors, ['visual_accents'])
        break
      case 'embedding':
        scored = await this.scoreEmbedding(query, candidateIds, anchors)
        break
      case 'chromatic':
        scored = await this.scoreChromatic(query, candidateIds, anchors, false)
        break
      case 'chromatic_dominant':
        scored = await this.scoreChromatic(query, candidateIds, anchors, true)
        break
      case 'tags':
        scored = await this.scoreTags(query, candidateIds, anchors)
        break
      case 'composition':
        scored = await this.scoreComposition(query, candidateIds, anchors[0])
        break
      default:
        return []
    }

    if (!scored.length) return []

    let scoredSorted = scored.sort((a, b) =>
      query.opposite && query.criteria !== 'composition' ? a.score - b.score : b.score - a.score
    )

    // Aplicar sistema de puntuación por labels
    const scoredWithLabels = scoredSorted.map((entry) => ({
      ...entry,
      labelScore: this.calculateLabelScore(entry.score, query),
    }))

    const topScored = scoredWithLabels.slice(0, query.resultLength)
    const topIds = topScored.map(({ id }) => id)

    const photos = await Photo.query()
      .whereIn('id', topIds.map(String))
      .preload('tags', (query) => {
        query.preload('tag')
      })
    const photoMap = new Map(photos.map((p) => [p.id, p.serialize()]))

    const sortedPhotosWithScore = topScored
      .map((entry) => {
        const serialized = photoMap.get(entry.id)
        if (serialized) {
          return { ...serialized, ...entry }
        }
        return null
      })
      .filter(Boolean)

    return sortedPhotosWithScore
  }

  /* ───────────────────── Strategy helpers ───────────────────── */

  /**
   * Calcula el label score basado en el score numérico y el tipo de búsqueda
   */
  private calculateLabelScore(score: number, query: SearchByPhotoOptions): string {
    const composition: SearchComposition = {
      hasFullQuery: false,
      hasNuances: false,
      segmentCount: query.criteria === 'tags' ? Math.max(1, query.tagIds.length) : 1,
      searchMode: 'precise', // Por defecto para búsquedas por fotos
    }

    const thresholds = this.scoringService.getAbsoluteThresholds(composition)
    return this.scoringService.getLabelScore(score, thresholds)
  }

  private async scoreSemantic(
    query: SearchByPhotoOptions,
    candidateIds: number[],
    anchors: Photo[],
    descriptionCategories: string[]
  ) {
    for (const p of anchors) if (!p.descriptionChunks) await p.load('descriptionChunks')

    // Para cada foto candidata, guardamos los mejores scores por cada chunk buscado
    const chunkScoreMap: Record<number, Record<number, { content: string; proximity: number }>> = {}

    for (const anchor of anchors) {
      const baseChunks = anchor.descriptionChunks.filter((dc) =>
        descriptionCategories.includes(dc.category)
      )

      for (const chunk of baseChunks) {
        const chunkEmb = VectorService.getParsedEmbedding(chunk.embedding)

        const similar = await this.vectorService.findSimilarChunkToEmbedding(
          chunkEmb,
          query.opposite ? 1 : 0.5,
          200,
          'cosine_similarity',
          candidateIds,
          descriptionCategories,
          undefined,
          query.opposite
        )

        similar.forEach((c) => {
          if (!chunkScoreMap[c.photo_id]) chunkScoreMap[c.photo_id] = {}
          // Para cada chunk buscado, guardamos el mejor score
          const chunkId = chunk.id
          if (
            !chunkScoreMap[c.photo_id][chunkId] ||
            c.proximity > chunkScoreMap[c.photo_id][chunkId].proximity
          ) {
            chunkScoreMap[c.photo_id][chunkId] = {
              content: c.content || c.chunk || '',
              proximity: c.proximity,
              category: c.category,
            }
          }
        })
      }
    }

    // Ahora sumamos los scores de los chunks buscados para cada foto
    return Object.entries(chunkScoreMap).map(([id, chunkScores]) => {
      let score = 0
      let matchingChunks: { chunk: string; proximity: number; category: string }[] = []
      for (const chunkScore of Object.values(chunkScores)) {
        score += chunkScore.proximity
        matchingChunks.push({
          chunk: chunkScore.content,
          proximity: chunkScore.proximity,
          category: chunkScore.category,
        })
      }
      return {
        id: +id,
        score,
        matchingChunks,
      }
    })
  }

  private async scoreSemanticPerSegment(
    query: SearchByPhotoOptions,
    candidateIds: number[],
    anchors: Photo[],
    descriptionCategories: string[]
  ) {
    for (const p of anchors) if (!p.descriptionChunks) await p.load('descriptionChunks')

    // Junta todos los chunks relevantes de las fotos base
    const baseChunks: DescriptionChunk[] = []
    anchors.forEach((p) => {
      baseChunks.push(
        ...p.descriptionChunks.filter((dc) => descriptionCategories.includes(dc.category))
      )
    })
    if (!baseChunks.length) return []

    // Para cada chunk base, busca los chunks más similares en las fotos candidatas
    const bestScores: Record<number, number> = {}
    for (const chunk of baseChunks) {
      const embedding = VectorService.getParsedEmbedding(chunk.embedding)
      const similar = await this.vectorService.findSimilarChunkToEmbedding(
        embedding,
        query.opposite ? 1 : 0.5,
        200,
        'cosine_similarity',
        candidateIds,
        descriptionCategories,
        undefined,
        query.opposite
      )
      // Para cada foto candidata, guarda el mejor score para este chunk
      similar.forEach((c) => {
        if (!bestScores[c.photo_id] || c.proximity > bestScores[c.photo_id]) {
          bestScores[c.photo_id] = c.proximity
        }
      })
    }

    // Devuelve los mejores scores por foto candidata
    return Object.entries(bestScores).map(([id, score]) => ({ id: +id, score }))
  }

  @MeasureExecutionTime
  private async scoreEmbedding(
    query: SearchByPhotoOptions,
    candidateIds: number[],
    anchors: Photo[]
  ) {
    let combinedEmbedding: number[]

    // If a crop region is provided (single anchor only), compute CLIP embedding from the cropped area
    if (query.cropRegion && anchors.length === 1) {
      combinedEmbedding = await this.computeCroppedEmbedding(anchors[0], query.cropRegion)
      if (!combinedEmbedding.length) return []
    } else {
      const anchorEmbeddings = anchors
        .filter((p) => p.embedding)
        .map((p) => VectorService.getParsedEmbedding(p.embedding))
      if (!anchorEmbeddings.length) return []

      combinedEmbedding = anchorEmbeddings
        .reduce((acc, e, i) => (i === 0 ? e.slice() : acc.map((v, idx) => v + e[idx])), [])
        .map((v) => v / anchorEmbeddings.length)
    }

    const similar = await this.vectorService.findSimilarPhotoToEmbedding(
      combinedEmbedding,
      query.opposite ? 1 : 0.4,
      200,
      'cosine_similarity',
      candidateIds,
      query.opposite
    )

    return similar.map((s) => ({ id: s.id, score: s.proximity }))
  }

  @MeasureExecutionTime
  private async scoreChromatic(
    query: SearchByPhotoOptions,
    candidateIds: number[],
    anchors: Photo[],
    useDominants: boolean = true
  ) {
    let combinedEmbedding: number[]

    // If a crop region is provided (single anchor only), compute histogram from the cropped area
    if (query.cropRegion && anchors.length === 1) {
      combinedEmbedding = await this.computeCroppedColorHistogram(anchors[0], query.cropRegion)
      if (!combinedEmbedding.length) return []
    } else {
      const anchorEmbeddings = anchors
        .filter((p) => (useDominants ? p.colorHistogramDominant : p.colorHistogram))
        .map((p) =>
          useDominants
            ? VectorService.getParsedEmbedding(p.colorHistogramDominant)
            : VectorService.getParsedEmbedding(p.colorHistogram)
        )

      if (!anchorEmbeddings.length) return []

      combinedEmbedding = anchorEmbeddings
        .reduce((acc, e, i) => (i === 0 ? e.slice() : acc.map((v, idx) => v + e[idx])), [])
        .map((v) => v / anchorEmbeddings.length)
    }

    const similar = await this.vectorService.findSimilarPhotoToColorPalette(
      combinedEmbedding,
      query.opposite ? 1 : 0.1,
      200,
      'cosine_similarity',
      candidateIds,
      query.opposite,
      useDominants
    )

    return similar.map((s) => ({ id: s.id, score: s.proximity }))
  }

  /**
   * Downloads the anchor photo, crops it to the given region, and computes
   * a color histogram via the Python API. Returns the 64-dim embedding.
   */
  private async computeCroppedColorHistogram(
    anchor: Photo,
    region: { x: number; y: number; w: number; h: number }
  ): Promise<number[]> {
    try {
      const photoImageService = PhotoImageService.getInstance()
      const buffer = await photoImageService.getImageBufferFromR2(anchor.name)

      const metadata = await sharp(buffer).metadata()
      const imgWidth = metadata.width || 1
      const imgHeight = metadata.height || 1

      const left = Math.round(region.x * imgWidth)
      const top = Math.round(region.y * imgHeight)
      const width = Math.max(1, Math.round(region.w * imgWidth))
      const height = Math.max(1, Math.round(region.h * imgHeight))

      const croppedBuffer = await sharp(buffer).extract({ left, top, width, height }).toBuffer()

      const croppedBase64 = croppedBuffer.toString('base64')

      const modelsService = new ModelsService()
      const { embeddings } = await modelsService.getHistogramColor([
        { id: anchor.id.toString(), base64: croppedBase64 },
      ])

      if (!embeddings || !embeddings.length) return []

      // Use full histogram (not dominant) for crop regions — more accurate for partial areas
      return embeddings[0].embedding_full || embeddings[0].embedding_dominant || []
    } catch (error) {
      console.error('Error computing cropped color histogram:', error)
      return []
    }
  }

  /**
   * Downloads the anchor photo, crops it to the given region, and computes
   * a volatile CLIP embedding via the GPU API. Returns the embedding vector.
   */
  private async computeCroppedEmbedding(
    anchor: Photo,
    region: { x: number; y: number; w: number; h: number }
  ): Promise<number[]> {
    try {
      const photoImageService = PhotoImageService.getInstance()
      const buffer = await photoImageService.getImageBufferFromR2(anchor.name)

      const metadata = await sharp(buffer).metadata()
      const imgWidth = metadata.width || 1
      const imgHeight = metadata.height || 1

      const left = Math.round(region.x * imgWidth)
      const top = Math.round(region.y * imgHeight)
      const width = Math.max(1, Math.round(region.w * imgWidth))
      const height = Math.max(1, Math.round(region.h * imgHeight))

      const croppedBuffer = await sharp(buffer).extract({ left, top, width, height }).toBuffer()
      const croppedBase64 = croppedBuffer.toString('base64')

      const modelsService = new ModelsService()
      const { embeddings } = await modelsService.getEmbeddingsImagesCPU([
        { id: anchor.id, base64: croppedBase64 },
      ])

      if (!embeddings || !embeddings.length) return []

      return embeddings[0].embedding || []
    } catch (error) {
      console.error('Error computing cropped CLIP embedding:', error)
      return []
    }
  }

  private async scoreTags(query: SearchByPhotoOptions, candidateIds: number[], anchors: Photo[]) {
    // Para cada foto candidata, guardamos los mejores scores por cada tag buscado
    const tagScoreMap: Record<number, Record<number, { name: string; proximity: number }>> = {}
    for (const anchor of anchors) {
      for (const tagPhoto of anchor.tags) {
        // Si hay tagIds, solo buscamos los que están en la lista
        if (query.tagIds.length && !query.tagIds.includes(tagPhoto.tag.id)) continue
        const tagEmb = VectorService.getParsedEmbedding(tagPhoto.tag.embedding)
        const excludeSustantives = tagPhoto.tag.name.trim().split(/\s+/).length > 1

        const similar = await this.vectorService.findSimilarTagToEmbedding(
          tagEmb,
          query.opposite ? 1 : 0.3,
          200,
          'cosine_similarity',
          null,
          null,
          [],
          excludeSustantives ? ['misc'] : [],
          candidateIds,
          query.opposite
        )
        similar.forEach((t) => {
          if (!tagScoreMap[t.photo_id]) tagScoreMap[t.photo_id] = {}
          // Para cada tag buscado, guardamos el mejor score
          const tagId = tagPhoto.tag.id
          if (
            !tagScoreMap[t.photo_id][tagId] ||
            t.proximity > tagScoreMap[t.photo_id][tagId].proximity
          ) {
            tagScoreMap[t.photo_id][tagId] = { name: t.name, proximity: t.proximity }
          }
        })
      }
    }
    // Ahora sumamos los scores de los tags buscados para cada foto
    return Object.entries(tagScoreMap).map(([id, tagScores]) => {
      // Si hay tagIds, sumamos solo los que están en la lista; si no, sumamos todos
      const tagIdsToSum = query.tagIds.length ? query.tagIds : Object.keys(tagScores).map(Number)
      let score = 0
      let matchingTags: string[] = []
      for (const tagId of tagIdsToSum) {
        if (tagScores[tagId]) {
          score += tagScores[tagId].proximity
          matchingTags.push(tagScores[tagId].name)
        }
      }
      return {
        id: +id,
        score,
        matchingTags,
      }
    })
  }

  private async scoreComposition(
    query: SearchByPhotoOptions,
    candidateIds: number[],
    reference: Photo
  ) {
    // call with the correct signature (no candidateIds param)
    const hits = await this.visualFeaturesService.findSimilarPhotosByDetections(
      reference,
      query.boxesIds,
      ['animal', 'person', 'prominent object', 'architectural feature'],
      ['animal', 'person', 'prominent object', 'architectural feature'],
      query.inverted
    )

    // Filter only those hits that belong to the candidate universe
    return hits
      .filter((h) => candidateIds.includes(h.id))
      .map((h) => ({ id: h.id, score: h.score }))
  }
}
