import db from '@adonisjs/lucid/services/db'
import ModelsService from '#services/models_service'
import PhotoManager from './photo_manager.js'
import VectorService from '#services/vector_service'
import pLimit from 'p-limit'
import crypto from 'node:crypto'
import {
  analyzeReportCluster,
  deduplicateReportPatterns,
  isDesktopFileKey,
  type ReportCloudPhoto,
} from '#desktop/cloud_functions'

// ========================================
// CONFIGURACIÓN GLOBAL
// ========================================

// Umbrales para reclusterización: se reclusteriza si el cluster supera CUALQUIERA de estos valores
// Y tiene al menos RECLUSTER_MIN_PHOTO_COUNT fotos
const RECLUSTER_MIN_PHOTO_COUNT = 25 // Número mínimo de fotos para reclusterizar
const RECLUSTER_THRESHOLD_PERCENT = 20 // Porcentaje del total de fotos
const RECLUSTER_THRESHOLD_PHOTO_COUNT = 500 // Número absoluto de fotos
const MAX_RECLUSTERIZATION_STEPS = 2

// ========================================
// TYPES & INTERFACES
// ========================================

export type ReviewType = 'story' | 'context' | 'general'

// Escritorio: los modelos, prompts y reintentos de cada tipo están en el servicio de la nube.
export interface ReviewTypeConfig {
  needsImages: boolean // true para general (CLIP), false para story/context (texto)
  concurrency: number // límite de clusters procesados en paralelo
}

export const REVIEW_TYPE_CONFIG: Record<ReviewType, ReviewTypeConfig> = {
  general: { needsImages: true, concurrency: 2 },
  story: { needsImages: false, concurrency: 3 },
  context: { needsImages: false, concurrency: 3 },
}

// Patrón del informe anterior tal como se ofrece al modelo para fusionar.
interface ExistingPatternSummary {
  patternId: string
  title: string
  shortDescription: string
}

// Mapeo de ReviewType a chunkName usado en la BD
const REVIEW_TYPE_TO_CHUNK: Record<ReviewType, string> = {
  story: 'story',
  context: 'context',
  general: 'general',
}

export interface ClusterPattern {
  patternId: string
  patternType: 'stylistic' | 'object_motif' | 'NA'
  title: string
  description: string
  photoCount: number
  percentage: number
  strength: 'strong' | 'moderate' | 'emergent'
  isNew?: boolean
  clusterPhotos: number[]
  samplePhotos: Array<{
    id: number
    thumbnailUrl: string
    description: string
  }>
}

// Interfaz extendida para acumular datos durante el procesamiento
interface AccumulatedPattern extends ClusterPattern {
  shortDescription: string
  mergedClusterIds: string[]
  allPhotoIds: number[]
}

// ========================================
// PORTFOLIO REVIEW MANAGER
// ========================================

export default class PortfolioReviewManager {
  private modelsService: ModelsService

  constructor() {
    this.modelsService = new ModelsService()
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private calculatePatternStrength(percentage: number): 'strong' | 'moderate' | 'emergent' {
    if (percentage >= 20) return 'strong'
    if (percentage >= 5) return 'moderate'
    return 'emergent'
  }

  private shouldReclusterCluster(cluster: any): boolean {
    return (
      cluster.size >= RECLUSTER_MIN_PHOTO_COUNT &&
      (cluster.percentage > RECLUSTER_THRESHOLD_PERCENT ||
        cluster.size > RECLUSTER_THRESHOLD_PHOTO_COUNT)
    )
  }

  private combineEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return []
    if (embeddings.length === 1) return embeddings[0]

    const dimensions = embeddings[0].length
    const combined: number[] = new Array(dimensions).fill(0)

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        combined[i] += embedding[i]
      }
    }

    for (let i = 0; i < dimensions; i++) {
      combined[i] = combined[i] / embeddings.length
    }

    return combined
  }

  private createPhotoDescription(photo: any, chunkName: string): string {
    return chunkName === 'story' || chunkName === 'context'
      ? photo.chunks
          .filter((c: any) => c.category === chunkName)
          .map((c: any) => c.chunk)
          .join(' ') || 'No description'
      : photo.originalFileName || 'No filename'
  }

  private createSamplePhoto(photo: any, chunkName: string) {
    return {
      id: photo.id,
      thumbnailUrl: `https://${process.env.IMAGES_WORKER}/${photo.thumbnailName}`,
      description: this.createPhotoDescription(photo, chunkName),
    }
  }

  private async processCluster(
    userId: string,
    cluster: any,
    photoMapObject: Record<number, any>,
    reviewType: ReviewType,
    chunkName: string,
    needsImages: boolean,
    existingPatternsForPrompt: ExistingPatternSummary[],
    hasExistingPatterns: boolean,
    accumulatedPatterns: AccumulatedPattern[],
    patterns: ClusterPattern[]
  ) {
    const clusterPhotoIds = Array.isArray(cluster.photo_ids) ? cluster.photo_ids : []
    const clusterSize = clusterPhotoIds.length > 0 ? clusterPhotoIds.length : cluster.size
    let sampleSize

    if (clusterSize <= 15) sampleSize = clusterSize
    else if (clusterSize <= 60) sampleSize = Math.min(20, Math.round(clusterSize * 0.65))
    else sampleSize = Math.min(30, Math.round(20 + Math.log2(clusterSize / 60) * 5))

    let samplePhotoIds = this.sampleCluster(cluster, sampleSize)

    // Filtrar duplicados de las fotos de muestra
    let filteredPhotoIds = await this.filterDuplicatePhotos(samplePhotoIds, photoMapObject)
    let samplePhotos = filteredPhotoIds.map((id) => photoMapObject[id]).filter(Boolean)

    // Re-samplear si quedamos con muy pocas fotos
    const minAcceptablePhotos = Math.max(3, Math.floor(sampleSize * 0.6)) // Al menos 60% del objetivo o 3 fotos
    if (samplePhotos.length < minAcceptablePhotos && samplePhotos.length < clusterSize) {
      console.log(
        `   ⚠️ Solo ${samplePhotos.length} fotos después de filtrar duplicados (objetivo: ${sampleSize}). Re-sampleando...`
      )

      const usedPhotoIds = new Set(samplePhotoIds)
      const remainingPhotoIds = clusterPhotoIds
        .map((id: string) => parseInt(id))
        .filter((id: any) => !usedPhotoIds.has(id))

      // Tomar fotos adicionales aleatoriamente
      const photosNeeded = Math.min(sampleSize - samplePhotos.length, remainingPhotoIds.length)
      const shuffled = remainingPhotoIds.sort(() => Math.random() - 0.5)
      const additionalPhotoIds = shuffled.slice(0, photosNeeded)

      // Filtrar duplicados de las fotos adicionales
      const additionalFilteredIds = await this.filterDuplicatePhotos(
        additionalPhotoIds,
        photoMapObject
      )
      const additionalPhotos = additionalFilteredIds.map((id) => photoMapObject[id]).filter(Boolean)

      samplePhotos.push(...additionalPhotos)
      console.log(
        `   ✅ Agregadas ${additionalPhotos.length} fotos adicionales. Total: ${samplePhotos.length} fotos`
      )
    }

    const allClusterPhotoIds = clusterPhotoIds.map((id: string) => parseInt(id))

    // Escritorio: el prompt se compone y el modelo se llama en la nube. En el informe general van
    // las miniaturas, así que solo entran las de la carpeta del escritorio.
    const cloudPhotos: ReportCloudPhoto[] = needsImages
      ? samplePhotos
          .filter((photo) => isDesktopFileKey(photo.thumbnailName))
          .map((photo) => ({
            id: photo.id,
            filename: photo.originalFileName || photo.name || 'Unknown',
            key: photo.thumbnailName,
          }))
      : samplePhotos.map((photo) => ({
          id: photo.id,
          text:
            photo.chunks
              .filter((c: any) => c.category === chunkName)
              .map((c: any) => c.chunk)
              .join(' ') || undefined,
        }))

    console.log(
      `🧠 Analizando cluster ${cluster.cluster_id} (${clusterSize} fotos, ${samplePhotos.length} en muestra, ${cluster.percentage.toFixed(2)}%)...`
    )

    let analysis =
      cloudPhotos.length > 0
        ? await analyzeReportCluster(Number(userId), {
            reviewType,
            photos: cloudPhotos,
            existingPatterns: existingPatternsForPrompt,
          })
        : null

    // Normalizar respuesta
    if (!analysis || typeof analysis !== 'object') {
      analysis = {
        decision: 'new',
        title: `Pattern ${patterns.length + accumulatedPatterns.length + 1}`,
        description: 'No description available',
        patternType: 'NA',
      }
    }

    // Procesar decisión
    const isMerge =
      hasExistingPatterns && analysis.decision === 'merge' && analysis.mergeWithPatternId

    if (isMerge) {
      // MERGE con patrón previo
      const targetPattern = accumulatedPatterns.find(
        (p) => p.patternId === analysis.mergeWithPatternId
      )

      if (targetPattern) {
        targetPattern.photoCount += clusterSize
        targetPattern.percentage += cluster.percentage
        targetPattern.mergedClusterIds.push(`cluster_${cluster.cluster_id}`)

        // Obtener fotos representativas
        let photosToConsider: any[] = samplePhotos
        if (analysis.representativePhotoIds && Array.isArray(analysis.representativePhotoIds)) {
          const repIds = analysis.representativePhotoIds.map((id: any) => parseInt(String(id)))
          const representativePhotos = repIds
            .map((id: number) => photoMapObject[id])
            .filter(Boolean)
          if (representativePhotos.length > 0) {
            photosToConsider = representativePhotos
          }
        }

        const existingPhotoIds = new Set(targetPattern.allPhotoIds)
        const newPhotosToAdd = photosToConsider
          .filter((photo) => !existingPhotoIds.has(photo.id))
          .slice(0, Math.max(0, 4 - targetPattern.samplePhotos.length))

        for (const photo of newPhotosToAdd) {
          targetPattern.samplePhotos.push(this.createSamplePhoto(photo, chunkName))
          targetPattern.allPhotoIds.push(photo.id)
        }

        for (const photoId of allClusterPhotoIds) {
          if (!existingPhotoIds.has(photoId)) {
            targetPattern.allPhotoIds.push(photoId)
          }
        }

        targetPattern.strength = this.calculatePatternStrength(targetPattern.percentage)

        console.log(
          `🔗 Cluster ${cluster.cluster_id} mergeado a patrón previo "${targetPattern.title}"`
        )
        return { type: 'merge' as const }
      }
    }

    // CREATE NEW pattern
    let representativePhotos: any[] = []
    if (analysis.representativePhotoIds && Array.isArray(analysis.representativePhotoIds)) {
      const repIds = analysis.representativePhotoIds.map((id: any) => parseInt(String(id)))
      representativePhotos = repIds.map((id: number) => photoMapObject[id]).filter(Boolean)
    }
    if (representativePhotos.length === 0) {
      representativePhotos = samplePhotos.slice(0, 4)
    }

    const newPatternId = hasExistingPatterns
      ? `pattern_new_${crypto.randomBytes(4).toString('hex')}`
      : `cluster_${cluster.cluster_id}`

    const pattern: ClusterPattern = {
      patternId: newPatternId,
      patternType: analysis.patternType || 'NA',
      title: analysis.title || `Pattern ${patterns.length + 1}`,
      description: analysis.description || 'No description available',
      photoCount: clusterSize,
      percentage: cluster.percentage,
      strength: this.calculatePatternStrength(cluster.percentage),
      isNew: true,
      clusterPhotos: allClusterPhotoIds,
      samplePhotos: representativePhotos
        .slice(0, 4)
        .map((photo) => this.createSamplePhoto(photo, chunkName)),
    }

    console.log(`✨ Nuevo patrón creado: "${pattern.title}"`)
    return { type: 'new' as const, pattern }
  }

  // ========================================
  // EMBEDDINGS
  // ========================================

  // Sin caché a propósito: el payload son cientos de MB por usuario (story superaba el
  // límite de string de V8 al serializarlo) y la watermark de CacheInvalidationService lo
  // invalida cada 10 fotos analizadas, muy por debajo de las 3000 que disparan un rebuild,
  // así que nunca llegaba caliente a un build real.
  private async getEmbeddingsByReviewType(userId: string, reviewType: ReviewType) {
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]
    let photosWithCategory

    // Caso especial: general usa embeddings CLIP directos de la tabla photos
    if (chunkName === 'general') {
      photosWithCategory = await db.rawQuery(
        `
        SELECT 
          p.id,
          p.name,
          p.thumbnail_name,
          p.original_file_name,
          p.embedding
        FROM photos p
        WHERE p.user_id = :userId
          AND p.embedding IS NOT NULL
          AND p.deleted_at IS NULL
        ORDER BY p.id
      `,
        { userId: parseInt(userId) }
      )
    } else if (chunkName === 'artistic_scores') {
      const photoManager = new PhotoManager()
      const photosFromDb = await photoManager.getPhotosFor3DView(userId, 'artistic_scores')

      photosWithCategory = {
        rows: photosFromDb.map((photo) => ({
          id: photo.id,
          name: photo.name,
          thumbnail_name: photo.thumbnailName,
          original_file_name: photo.originalFileName,
          artistic_scores_embedding_computed: photo.artisticScoresEmbeddingComputed,
        })),
      }
    } else if (chunkName === 'visual_aspects') {
      const photoManager = new PhotoManager()
      const photosFromDb = await photoManager.getPhotosFor3DView(userId, 'visual_aspects')

      photosWithCategory = {
        rows: photosFromDb.map((photo) => ({
          id: photo.id,
          name: photo.name,
          thumbnail_name: photo.thumbnailName,
          original_file_name: photo.originalFileName,
          visual_aspects_embedding_computed: photo.visualAspectsEmbeddingComputed,
        })),
      }
    } else {
      // Para story, context y otros chunks normales
      photosWithCategory = await db.rawQuery(
        `
        SELECT DISTINCT
          p.id,
          p.name,
          p.thumbnail_name,
          p.original_file_name,
          p.embedding
        FROM photos p
        JOIN descriptions_chunks dc ON p.id = dc.photo_id
        WHERE dc.category = :chunkName
          AND p.user_id = :userId
          AND dc.embedding IS NOT NULL
          AND p.deleted_at IS NULL
        ORDER BY p.id
      `,
        { chunkName, userId: parseInt(userId) }
      )
    }

    const photos = photosWithCategory.rows

    if (photos.length === 0) {
      return { vectors: [], photoMapObject: {} }
    }

    let vectors: any[] = []
    const photoMapObject: Record<number, any> = {}

    if (chunkName === 'general') {
      vectors = photos
        .map((photo: any) => {
          const embedding = photo.embedding ? JSON.parse(photo.embedding as string) : null

          if (embedding && embedding.length > 0) {
            photoMapObject[photo.id] = {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunks: [],
            }

            return { id: photo.id, embedding, chunks: [] }
          }
          return null
        })
        .filter(Boolean)
    } else if (chunkName === 'artistic_scores') {
      vectors = photos
        .map((photo: any) => {
          const embedding = photo.artistic_scores_embedding_computed

          if (embedding && embedding.length > 0) {
            photoMapObject[photo.id] = {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunks: [],
            }

            return { id: photo.id, embedding, chunks: [] }
          }
          return null
        })
        .filter(Boolean)
    } else if (chunkName === 'visual_aspects') {
      vectors = photos
        .map((photo: any) => {
          const embedding = photo.visual_aspects_embedding_computed

          if (embedding && embedding.length > 0) {
            photoMapObject[photo.id] = {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunks: [],
            }

            return { id: photo.id, embedding, chunks: [] }
          }
          return null
        })
        .filter(Boolean)
    } else {
      // Para chunks normales (story, context, etc.)
      const photoIds = photos.map((p: any) => p.id)
      const chunksResult = await db.rawQuery(
        `
        SELECT 
          dc.id as chunk_id,
          dc.photo_id,
          dc.chunk,
          dc.category,
          dc.embedding
        FROM descriptions_chunks dc
        WHERE dc.category = :chunkName
          AND dc.photo_id = ANY(:photoIds)
          AND dc.embedding IS NOT NULL
        ORDER BY dc.photo_id
      `,
        { chunkName, photoIds }
      )

      const chunks = chunksResult.rows

      // Agrupar chunks por foto_id
      const photoChunksMap = new Map<number, any[]>()
      chunks.forEach((chunk: any) => {
        const photoId = chunk.photo_id
        if (!photoChunksMap.has(photoId)) {
          photoChunksMap.set(photoId, [])
        }
        photoChunksMap.get(photoId)!.push(chunk)
      })

      // Preparar vectores combinando embeddings por foto
      vectors = []

      for (const [photoId, photoChunks] of photoChunksMap.entries()) {
        const embeddings = photoChunks
          .map((chunk: any) => (chunk.embedding ? JSON.parse(chunk.embedding as string) : null))
          .filter(Boolean)

        if (embeddings.length === 0) continue

        const combinedEmbedding = this.combineEmbeddings(embeddings)
        const photoInfo = photos.find((p: any) => p.id === photoId)

        // Guardar tanto el embedding CLIP (para detección de duplicados) como los chunks
        const clipEmbedding = photoInfo?.embedding
          ? JSON.parse(photoInfo.embedding as string)
          : null

        // Tras calcular combinedEmbedding, los embeddings de cada chunk ya no se usan
        // (prompts solo leen chunk/category). Se descartan para no retenerlos en memoria
        // ni serializarlos a Redis (con catálogos grandes provocaba OOM en JSON.stringify).
        const lightChunks = photoChunks.map((c: any) => ({
          chunk_id: c.chunk_id,
          photo_id: c.photo_id,
          chunk: c.chunk,
          category: c.category,
        }))

        photoMapObject[photoId] = {
          id: photoId,
          name: photoInfo?.name,
          thumbnailName: photoInfo?.thumbnail_name,
          originalFileName: photoInfo?.original_file_name,
          embedding: clipEmbedding,
          chunks: lightChunks,
        }

        vectors.push({
          id: photoId,
          embedding: combinedEmbedding,
          chunks: lightChunks,
        })
      }
    }

    return { vectors, photoMapObject }
  }

  // ========================================
  // CLUSTERING
  // ========================================

  private sampleCluster(cluster: any, sampleSize: number = 10): number[] {
    const { photo_ids, centroid_distances } = cluster

    if (!Array.isArray(photo_ids) || photo_ids.length === 0 || !Array.isArray(centroid_distances)) {
      return []
    }

    const effectiveSampleSize = Math.min(sampleSize, photo_ids.length)

    const photoDistances = photo_ids.map((id: string, idx: number) => ({
      id: parseInt(id, 10),
      distance: centroid_distances[idx],
    }))

    photoDistances.sort((a, b) => a.distance - b.distance)

    // Ajusta aquí la proporción si quieres edge (0.7, 0.8, 1, etc.)
    const coreRatio = 1
    const coreSize = Math.floor(effectiveSampleSize * coreRatio)
    const edgeSize = effectiveSampleSize - coreSize

    const coreSample = photoDistances.slice(0, coreSize).map((p) => p.id)

    let edgeSample: number[] = []

    if (edgeSize > 0) {
      edgeSample = photoDistances
        .slice(photoDistances.length - edgeSize)
        .map((p) => p.id)
        .reverse()
    }

    return [...coreSample, ...edgeSample]
  }

  /**
   * Filtra fotos duplicadas de una lista de IDs basándose en similitud de embeddings.
   * Usa el mismo criterio que checkDuplicates en catalog_controller (umbral 0.92).
   * @param photoIds - Array de IDs de fotos a filtrar
   * @param photoMapObject - Mapa con información de las fotos incluyendo embeddings
   * @returns Array de IDs de fotos sin duplicados
   */
  private async filterDuplicatePhotos(
    photoIds: number[],
    photoMapObject: Record<number, any>
  ): Promise<number[]> {
    if (photoIds.length <= 1) {
      return photoIds
    }

    // console.log(`🔍 Analizando ${photoIds.length} fotos para detectar duplicados...`)

    const vectorService = new VectorService()
    const uniquePhotoIds: number[] = []
    const processedIds = new Set<number>()
    const removedDuplicates: { photoId: number; duplicateOf: number }[] = []

    for (const photoId of photoIds) {
      if (processedIds.has(photoId)) continue

      const photo = photoMapObject[photoId]
      if (!photo) {
        continue
      }

      // Obtener embedding CLIP de la foto (siempre debe estar disponible)
      let embedding: number[] | null = null

      if (photo.embedding) {
        embedding =
          typeof photo.embedding === 'string' ? JSON.parse(photo.embedding) : photo.embedding
      }

      if (!embedding || embedding.length === 0) {
        // Si no tiene embedding CLIP, la agregamos de todas formas
        uniquePhotoIds.push(photoId)
        processedIds.add(photoId)
        continue
      }

      // Buscar duplicados solo entre las fotos restantes no procesadas
      const remainingPhotoIds = photoIds.filter((id) => !processedIds.has(id))

      try {
        const similarPhotos = await vectorService.findSimilarPhotoToEmbedding(
          embedding,
          0.92, // mismo umbral que en checkDuplicates
          remainingPhotoIds.length,
          'cosine_similarity',
          remainingPhotoIds
        )

        // Marcar como procesados todos los duplicados encontrados
        const duplicatesFound = similarPhotos.filter((match: any) => match.id !== photoId)
        duplicatesFound.forEach((match: any) => {
          processedIds.add(match.id)
          removedDuplicates.push({ photoId: match.id, duplicateOf: photoId })
          console.log(
            `   ❌ Foto ${match.id} es duplicada de ${photoId} (similitud: ${(match.similarity * 100).toFixed(1)}%)`
          )
        })

        // Agregar la foto actual como representante del grupo
        uniquePhotoIds.push(photoId)
        processedIds.add(photoId)
      } catch (error) {
        console.error(`Error al verificar duplicados para foto ${photoId}:`, error)
        // En caso de error, incluir la foto de todas formas
        uniquePhotoIds.push(photoId)
        processedIds.add(photoId)
      }
    }

    if (removedDuplicates.length > 0) {
      console.log(
        `✅ Se eliminaron ${removedDuplicates.length} fotos duplicadas. Fotos restantes: ${uniquePhotoIds.length}`
      )
    } else {
      console.log(`✅ No se encontraron duplicados. Se mantienen ${uniquePhotoIds.length} fotos`)
    }

    return uniquePhotoIds
  }

  // ========================================
  // CLUSTERING HELPERS
  // ========================================

  private getClusteringParams(
    reviewType: ReviewType,
    iteration: number,
    totalItemsForClustering: number
  ): {
    max_clusters: number
    min_cluster_size: number
    min_samples: number
    umap_n_components: number
    umap_n_neighbors: number
    umap_min_dist: number
    umap_spread: number
    umap_metric: 'cosine'
  } {
    // Iteración 0: exactamente como antes
    const baseMinClusterRatio = reviewType === 'general' ? 0.008 : 0.008
    const baseMinClusterSize = Math.max(
      5,
      Math.floor(totalItemsForClustering * baseMinClusterRatio)
    )

    const base = {
      max_clusters: 15,
      min_cluster_size: baseMinClusterSize,
      min_samples: reviewType === 'general' ? 6 : 6,
      umap_n_components: reviewType === 'general' ? 5 : 5,
      umap_n_neighbors: reviewType === 'general' ? 4 : 4,
      umap_min_dist: 1,
      umap_spread: 10,
      umap_metric: 'cosine' as const,
    }

    const step = Math.max(0, iteration)
    if (step === 0) {
      return base
    }

    // Sub-iteraciones: variar más agresivamente para evitar sobre-fragmentación
    // Aumentar el ratio y el tamaño mínimo de cluster más rápido, y reducir max_clusters más fuerte
    const adjustedMinClusterRatio = Math.min(0.05, baseMinClusterRatio + step * 0.008)
    const adjustedMinClusterSize = Math.max(
      base.min_cluster_size,
      12 + step * 2,
      Math.floor(totalItemsForClustering * adjustedMinClusterRatio)
    )

    return {
      ...base,
      max_clusters: Math.max(6, base.max_clusters - step * 4),
      min_cluster_size: adjustedMinClusterSize,
      min_samples: Math.min(16, base.min_samples + step * 2),
      umap_n_neighbors: Math.min(20, base.umap_n_neighbors + step * 4),
      umap_min_dist: Math.min(0.18, base.umap_min_dist + step * 0.06),
      umap_spread: Math.min(20, base.umap_spread + step * 1.2),
    }
  }

  /**
   * Obtiene clusters a partir de embeddings usando HDBSCAN + UMAP
   * @param vectors - Array de vectores con embeddings
   * @param reviewType - Tipo de review (general, story, context, etc.)
   * @param currentStep - Paso actual de reclusterización (uso interno)
   * @param parentClusterId - ID del cluster padre (uso interno)
   */
  private async getClustersFromEmbeddings(
    vectors: any[],
    reviewType: ReviewType,
    currentStep: number = 0,
    parentClusterId: string = ''
  ): Promise<any[]> {
    const totalItemsForClustering = vectors.length

    const params = this.getClusteringParams(reviewType, currentStep, totalItemsForClustering)

    const clusterPayload = {
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),
      method: 'hdbscan',
      max_clusters: params.max_clusters,
      min_cluster_size: params.min_cluster_size,
      min_samples: params.min_samples,
      dim_reduction_method: 'umap',
      umap_n_components: params.umap_n_components,
      umap_n_neighbors: params.umap_n_neighbors,
      umap_min_dist: params.umap_min_dist,
      umap_spread: params.umap_spread,
      umap_metric: params.umap_metric,
    }

    const indent = '  '.repeat(currentStep)
    console.log(
      `${indent}\n${indent}========== CLUSTERING ${parentClusterId ? `(${parentClusterId})` : ''} - NIVEL ${currentStep} ==========`
    )
    console.log(`${indent}📊 Total de fotos a clusterizar: ${vectors.length}`)

    const clusterResult = await this.modelsService.getClusters(clusterPayload)
    let clusters = clusterResult.clusters || []

    console.log(`${indent}📊 Clusters encontrados: ${clusters.length}`)
    if (clusters.length > 0) {
      clusters.forEach((cluster: any, idx: number) => {
        console.log(
          `${indent}  ${idx + 1}. Cluster ${cluster.cluster_id}: ${cluster.size} fotos (${cluster.percentage.toFixed(1)}%)`
        )
      })
    }
    console.log(`${indent}========================================\n`)

    // Si hemos alcanzado el límite de pasos de reclusterización, retornar
    if (currentStep >= MAX_RECLUSTERIZATION_STEPS) {
      console.log(`${indent}⚠️ Límite de reclusterización alcanzado (nivel ${currentStep})\n`)
      return clusters
    }

    // Identificar clusters que superan el threshold (porcentaje O número absoluto de fotos)
    // Y tienen al menos el mínimo de fotos requeridas
    const largeClusters = clusters.filter((cluster: any) => this.shouldReclusterCluster(cluster))

    if (largeClusters.length === 0) {
      console.log(
        `${indent}✅ No hay clusters que superen el ${RECLUSTER_THRESHOLD_PERCENT}% o ${RECLUSTER_THRESHOLD_PHOTO_COUNT} fotos (mín: ${RECLUSTER_MIN_PHOTO_COUNT})\n`
      )
      return clusters
    }

    console.log(
      `${indent}🔍 Clusters que superen ${RECLUSTER_THRESHOLD_PERCENT}% o ${RECLUSTER_THRESHOLD_PHOTO_COUNT} fotos (mín requerido: ${RECLUSTER_MIN_PHOTO_COUNT}): ${largeClusters.length}`
    )

    // Procesar cada cluster grande
    const finalClusters: any[] = []
    const vectorsMap = new Map(vectors.map((v) => [v.id, v]))

    for (const cluster of clusters) {
      if (!this.shouldReclusterCluster(cluster)) {
        // Cluster pequeño, mantenerlo
        finalClusters.push(cluster)
      } else {
        // Cluster grande, reclusterizar
        console.log(
          `${indent}🔄 Reclusterizando cluster ${cluster.cluster_id} (${cluster.size} fotos, ${cluster.percentage.toFixed(1)}%)`
        )

        const clusterPhotoIds = Array.isArray(cluster.photo_ids) ? cluster.photo_ids : []
        const clusterVectors = clusterPhotoIds
          .map((id: string) => vectorsMap.get(parseInt(id)))
          .filter(Boolean)

        if (clusterVectors.length < 10) {
          // Si el cluster es muy pequeño, no vale la pena reclusterizar
          console.log(
            `${indent}   ⚠️ Cluster muy pequeño para reclusterizar (${clusterVectors.length} fotos), manteniéndolo`
          )
          finalClusters.push(cluster)
          continue
        }

        // Reclusterizar recursivamente
        const newParentId = parentClusterId
          ? `${parentClusterId}_${cluster.cluster_id}`
          : `cluster_${cluster.cluster_id}`

        const subclusters = await this.getClustersFromEmbeddings(
          clusterVectors,
          reviewType,
          currentStep + 1,
          newParentId
        )

        if (subclusters.length === 0 || subclusters.length === 1) {
          // Si no se pudo subdividir o solo hay 1 subcluster, mantener el original
          console.log(
            `${indent}   ⚠️ No se pudo subdividir significativamente, manteniendo cluster original`
          )
          finalClusters.push(cluster)
        } else {
          // Agregar los subclusters con IDs jerárquicos
          console.log(`${indent}   ✅ Subdividido en ${subclusters.length} subclusters`)
          subclusters.forEach((subcluster: any, idx: number) => {
            // Si el subcluster ya tiene depth > currentStep + 1, viene de niveles más profundos
            // y debemos preservar tanto su depth como su cluster_id
            const comesFromDeeperLevel = subcluster.depth && subcluster.depth > currentStep + 1
            const hierarchicalId = `${newParentId}_${idx + 1}`

            finalClusters.push({
              ...subcluster,
              cluster_id: comesFromDeeperLevel ? subcluster.cluster_id : hierarchicalId,
              parent_cluster_id: cluster.cluster_id,
              depth: subcluster.depth ?? currentStep + 1,
            })
          })
        }
      }
    }

    console.log(`${indent}📦 Clusters finales en nivel ${currentStep}: ${finalClusters.length}\n`)

    return finalClusters
  }

  /**
   * Muestra un resumen consolidado de todos los clusters finales
   */
  private logFinalClustersHierarchy(clusters: any[]): void {
    console.log('\n')
    console.log('════════════════════════════════════════════════════════════════════════')
    console.log('                    CLUSTERS FINALES CONSOLIDADOS')
    console.log('════════════════════════════════════════════════════════════════════════\n')

    console.log(`📊 TOTAL: ${clusters.length} clusters\n`)

    clusters.forEach((cluster, idx) => {
      const size = cluster.size || (Array.isArray(cluster.photo_ids) ? cluster.photo_ids.length : 0)
      const percentage = cluster.percentage?.toFixed(1) || 'N/A'
      const depth = cluster.depth ?? 0
      // Add asterisks for each depth level > 0
      const asterisks = depth > 0 ? ' ' + '*'.repeat(depth) : ''

      console.log(
        `  ${idx + 1}. ${cluster.cluster_id} → ${size} fotos (${percentage}%)${asterisks}`
      )
    })

    console.log('\n════════════════════════════════════════════════════════════════════════\n')
  }

  /**
   * Inicializa patrones previos para rebuild y prepara estructuras de datos
   */
  private initializePreviousPatterns(previousPatterns: ClusterPattern[]): {
    accumulatedPatterns: AccumulatedPattern[]
    existingPatternsForPrompt: ExistingPatternSummary[]
    hasExistingPatterns: boolean
  } {
    const accumulatedPatterns: AccumulatedPattern[] = previousPatterns.map((p) => ({
      ...p,
      shortDescription: p.description.slice(0, 250) + ' ...',
      mergedClusterIds: [],
      allPhotoIds: p.clusterPhotos || p.samplePhotos.map((sp) => sp.id),
      photoCount: 0, // Reset - se recalculará
      percentage: 0,
    }))

    const hasExistingPatterns = accumulatedPatterns.length > 0

    // Log de patrones previos
    if (hasExistingPatterns) {
      console.log('\n========== PATRONES PREVIOS PARA REBUILD ==========')
      console.log(`📋 Patrones previos: ${accumulatedPatterns.length}`)
      accumulatedPatterns.forEach((p) => console.log(`   - [${p.patternId}] "${p.title}"`))
      console.log('===================================================\n')
    }

    // Preparar patrones existentes para el prompt
    const existingPatternsForPrompt: ExistingPatternSummary[] = accumulatedPatterns.map((p) => ({
      patternId: p.patternId,
      title: p.title,
      shortDescription: p.shortDescription,
    }))

    return { accumulatedPatterns, existingPatternsForPrompt, hasExistingPatterns }
  }

  /**
   * Procesa todos los clusters en paralelo con límite de concurrencia
   */
  private async processAllClusters(
    userId: string,
    clusters: any[],
    photoMapObject: Record<number, any>,
    reviewType: ReviewType,
    chunkName: string,
    config: ReviewTypeConfig,
    existingPatternsForPrompt: ExistingPatternSummary[],
    hasExistingPatterns: boolean,
    accumulatedPatterns: AccumulatedPattern[],
    patterns: ClusterPattern[]
  ): Promise<void> {
    const limit = pLimit(config.concurrency)
    console.log(`⚡ Procesando clusters con límite de concurrencia: ${config.concurrency}`)

    const clusterProcessingTasks = clusters.map((cluster: any) =>
      limit(() =>
        this.processCluster(
          userId,
          cluster,
          photoMapObject,
          reviewType,
          chunkName,
          config.needsImages,
          existingPatternsForPrompt,
          hasExistingPatterns,
          accumulatedPatterns,
          patterns
        )
      )
    )

    // Esperar a que todos los clusters terminen de procesarse
    const results = await Promise.all(clusterProcessingTasks)

    // Consolidar resultados
    for (const result of results) {
      if (result.type === 'new' && result.pattern) {
        patterns.push(result.pattern)
      }
    }
  }

  /**
   * Consolida patrones previos con merges y ordena por porcentaje
   */
  private consolidatePatternsWithMerges(
    patterns: ClusterPattern[],
    accumulatedPatterns: AccumulatedPattern[]
  ): ClusterPattern[] {
    // Agregar patrones previos que recibieron merges
    for (const p of accumulatedPatterns) {
      if (p.photoCount > 0) {
        patterns.push({
          patternId: p.patternId,
          patternType: p.patternType || 'NA',
          title: p.title,
          description: p.description,
          photoCount: p.photoCount,
          percentage: Math.min(100, p.percentage),
          strength: p.strength,
          clusterPhotos: p.allPhotoIds,
          samplePhotos: p.samplePhotos.slice(0, 4),
        })
      } else {
        console.log(`⚠️ Patrón previo "${p.title}" eliminado (0 fotos después del rebuild)`)
      }
    }

    // Ordenar por porcentaje
    patterns.sort((a, b) => b.percentage - a.percentage)

    return patterns
  }

  /**
   * Imprime resumen final de patrones y costo
   */
  private logFinalSummary(patterns: ClusterPattern[]): void {
    console.log('\n========== RESUMEN FINAL ==========')
    console.log(`📦 Patrones identificados: ${patterns.length}`)
    patterns.forEach((p, idx) => {
      console.log(
        `  ${idx + 1}. "${p.title}" - ${p.photoCount} fotos (${p.percentage.toFixed(1)}%)`
      )
    })
    console.log('====================================\n')
  }

  // ========================================
  // MAIN METHOD: getPatterns
  // ========================================

  public async getPatterns(
    userId: string,
    reviewType: ReviewType = 'general',
    previousPatterns: ClusterPattern[] = []
  ) {
    const config = REVIEW_TYPE_CONFIG[reviewType]

    // Log inicial
    console.log('\n========== INICIO PORTFOLIO REVIEW ==========')
    console.log(`📋 ReviewType: ${reviewType}`)
    console.log(`🖼️  Necesita imágenes: ${config.needsImages}`)
    console.log(`👤 User ID: ${userId}`)
    console.log('=============================================\n')

    // FASE 1: Obtener embeddings
    const { vectors, photoMapObject } = await this.getEmbeddingsByReviewType(userId, reviewType)

    if (vectors.length === 0) {
      return {
        patterns: [],
        metadata: {
          totalPhotos: 0,
          message: `No se encontraron fotos con descripciones de tipo ${reviewType}`,
        },
      }
    }

    // FASE 2: Clustering
    const clusters = await this.getClustersFromEmbeddings(vectors, reviewType)

    // Mostrar resumen consolidado de clusters
    this.logFinalClustersHierarchy(clusters)

    if (clusters.length === 0) {
      return {
        patterns: [],
        metadata: {
          totalPhotos: vectors.length,
          clustersFound: 0,
          patternsIdentified: 0,
          message: 'No se encontraron patrones significativos',
        },
      }
    }

    // Inicializar patrones previos y estructuras de datos
    const { accumulatedPatterns, existingPatternsForPrompt, hasExistingPatterns } =
      this.initializePreviousPatterns(previousPatterns)

    const patterns: ClusterPattern[] = []
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    // FASE 3: Procesar todos los clusters
    await this.processAllClusters(
      userId,
      clusters,
      photoMapObject,
      reviewType,
      chunkName,
      config,
      existingPatternsForPrompt,
      hasExistingPatterns,
      accumulatedPatterns,
      patterns
    )

    // FASE 4: Consolidar patrones con merges
    const consolidatedPatterns = this.consolidatePatternsWithMerges(patterns, accumulatedPatterns)

    // FASE 5: Deduplicación de patrones
    const deduplicationResult = await this.deduplicatePatterns(
      userId,
      consolidatedPatterns,
      reviewType
    )

    // Log final y retorno
    const finalPatterns = deduplicationResult.patterns
    this.logFinalSummary(finalPatterns)

    return {
      patterns: finalPatterns,
      metadata: {
        totalPhotos: vectors.length,
        clustersFound: clusters.length,
        patternsIdentified: finalPatterns.length,
        patternsBeforeDeduplication: consolidatedPatterns.length,
        patternsRemoved: deduplicationResult.removedIds.length,
        reviewType,
        previousPatternsCount: previousPatterns.length,
      },
    }
  }

  // ========================================
  // DEDUPLICATION
  // ========================================

  private async deduplicatePatterns(
    userId: string,
    patterns: ClusterPattern[],
    reviewType: ReviewType
  ): Promise<{ patterns: ClusterPattern[]; removedIds: string[] }> {
    // Si hay menos de 2 patrones, no hay nada que deduplicar
    if (patterns.length < 2) {
      return { patterns, removedIds: [] }
    }

    console.log('\n========== FASE DE DEDUPLICACIÓN ==========')
    console.log(`📋 Patrones a analizar: ${patterns.length}`)

    // Preparar datos para el prompt
    const patternsForPrompt = patterns.map((p) => ({
      patternId: p.patternId,
      title: p.title,
      shortDescription: p.description.slice(0, 250) + ' ...',
      photoCount: p.photoCount,
    }))

    try {
      // Escritorio: el modelo se llama en la nube; sin respuesta válida no se fusiona nada.
      const result = await deduplicateReportPatterns(Number(userId), {
        reviewType,
        patterns: patternsForPrompt,
      })

      if (!result?.merges || result.merges.length === 0) {
        console.log('✅ No se encontraron duplicados')
        console.log('============================================\n')
        return { patterns, removedIds: [] }
      }

      // Crear mapa de patrones para acceso rápido
      const patternMap = new Map<string, ClusterPattern>()
      patterns.forEach((p) => patternMap.set(p.patternId, p))

      const idsToRemove = new Set<string>()
      const mergeOperations = result.merges as Array<{
        mergeFrom: string
        mergeInto: string
        reasoning: string
      }>

      console.log(`🔍 Fusiones a realizar: ${mergeOperations.length}`)

      // Procesar cada fusión
      for (const merge of mergeOperations) {
        const { mergeFrom, mergeInto, reasoning } = merge

        const sourcePattern = patternMap.get(mergeFrom)
        const targetPattern = patternMap.get(mergeInto)

        if (!sourcePattern || !targetPattern) {
          console.log(
            `   ⚠️ Fusión inválida: no se encontraron patrones [${mergeFrom}] o [${mergeInto}]`
          )
          continue
        }

        console.log(
          `   🔀 Fusionando: [${mergeFrom}] "${sourcePattern.title}" (${sourcePattern.photoCount} fotos)`
        )
        console.log(
          `      ➜ Destino: [${mergeInto}] "${targetPattern.title}" (${targetPattern.photoCount} fotos)`
        )
        if (reasoning) {
          console.log(`      Razón: ${reasoning}`)
        }

        // Fusionar photoCount y percentage
        targetPattern.photoCount += sourcePattern.photoCount
        targetPattern.percentage += sourcePattern.percentage

        // Fusionar clusterPhotos (eliminar duplicados)
        const existingPhotoIds = new Set(targetPattern.clusterPhotos)
        for (const photoId of sourcePattern.clusterPhotos) {
          if (!existingPhotoIds.has(photoId)) {
            targetPattern.clusterPhotos.push(photoId)
          }
        }

        // Recalcular strength basándose en el nuevo porcentaje
        targetPattern.strength = this.calculatePatternStrength(targetPattern.percentage)

        // Marcar el patrón source para eliminación
        idsToRemove.add(mergeFrom)

        console.log(
          `      ✅ Fusión completada. Nuevo tamaño: ${targetPattern.photoCount} fotos (${targetPattern.percentage.toFixed(1)}%)`
        )
      }

      // Filtrar patrones eliminados
      const filteredPatterns = patterns.filter((p) => !idsToRemove.has(p.patternId))
      const removedIds = Array.from(idsToRemove)

      console.log(`\n✅ Patrones después de fusión: ${filteredPatterns.length}`)
      console.log(`   (${removedIds.length} patrones fusionados y eliminados)`)
      console.log('============================================\n')

      return { patterns: filteredPatterns, removedIds }
    } catch (error) {
      console.error('⚠️ Error en deduplicación, manteniendo todos los patrones:', error)
      return { patterns, removedIds: [] }
    }
  }
}
