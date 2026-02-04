import db from '@adonisjs/lucid/services/db'
import ModelsService, { ModelName } from '#services/models_service'
import PhotoManager from './photo_manager.js'
import PhotoImageService from '#services/photo_image_service'
import VectorService from '#services/vector_service'
import { withCache } from '../decorators/withCache.js'
import pLimit from 'p-limit'
import {
  PROMPT_PORTFOLIO_STORY,
  PROMPT_PORTFOLIO_CONTEXT,
  PROMPT_PORTFOLIO_GENERAL,
  PROMPT_PORTFOLIO_DEDUPLICATE,
  ExistingPatternSummary,
  PatternForDeduplication,
  PROMPT_PORTFOLIO_VISUAL_ACCENTS,
} from '../utils/prompts/portfolio_review.js'

// ========================================
// TYPES & INTERFACES
// ========================================

export type ReviewType = 'story' | 'context' | 'general' | 'visual_accents'

export interface ReviewTypeConfig {
  model: ModelName
  retryModel: ModelName
  needsImages: boolean // true para general (CLIP), false para story/context (texto)
  concurrency: number // límite de clusters procesados en paralelo
  useThumbOnRetry: number // a partir de qué intento usar thumbnail (0 = nunca, 2 = a partir del 2do intento, etc.)
  useBase64OnRetry: boolean // si en retry GPT debe enviar imágenes como base64 en lugar de URL
}

export const REVIEW_TYPE_CONFIG: Record<ReviewType, ReviewTypeConfig> = {
  general: {
    model: 'gpt-5.1',
    retryModel: 'gpt-5.1',
    needsImages: true,
    concurrency: 1,
    useThumbOnRetry: 2,
    useBase64OnRetry: true,
  },
  story: {
    model: 'gemini-2.5-flash',
    retryModel: 'gpt-5.1',
    needsImages: false,
    concurrency: 3,
    useThumbOnRetry: 0,
    useBase64OnRetry: false,
  },
  context: {
    model: 'gemini-2.5-flash',
    retryModel: 'gpt-5.1',
    needsImages: false,
    concurrency: 3,
    useThumbOnRetry: 0,
    useBase64OnRetry: false,
  },
  visual_accents: {
    model: 'gemini-2.5-flash',
    retryModel: 'gpt-5.1',
    needsImages: false,
    concurrency: 5,
    useThumbOnRetry: 0,
    useBase64OnRetry: false,
  },
}

// Mapeo de ReviewType a chunkName usado en la BD
const REVIEW_TYPE_TO_CHUNK: Record<ReviewType, string> = {
  story: 'story',
  context: 'context',
  general: 'general',
  visual_accents: 'visual_accents',
}

export interface ClusterPattern {
  patternId: string
  patternType: 'stylistic' | 'object_motif' | 'NA'
  title: string
  description: string
  photoCount: number
  percentage: number
  strength: 'strong' | 'moderate' | 'weak'
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

  private calculatePatternStrength(percentage: number): 'strong' | 'moderate' | 'weak' {
    if (percentage >= 20) return 'strong'
    if (percentage >= 5) return 'moderate'
    return 'weak'
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isNonEmptyString(value: any): boolean {
    return typeof value === 'string' && value.trim().length > 0
  }

  private isValidPatternResult(result: any, hasExistingPatterns: boolean): boolean {
    if (!result || typeof result !== 'object') return false

    // Si hay patrones existentes, puede ser merge o new
    if (hasExistingPatterns) {
      const decisionOk =
        typeof result.decision === 'string' &&
        (result.decision === 'merge' || result.decision === 'new')

      if (!decisionOk) return false

      if (result.decision === 'merge') {
        return this.isNonEmptyString(result.mergeWithPatternId)
      }

      // Si es new, necesita title y description
      return this.isNonEmptyString(result.title) && this.isNonEmptyString(result.description)
    }

    // Sin patrones existentes (first build), solo necesita title y description
    return this.isNonEmptyString(result.title) && this.isNonEmptyString(result.description)
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

  // ========================================
  // EMBEDDINGS
  // ========================================

  @withCache({
    ttl: 60 * 60,
    provider: 'redis',
    key: (userId, reviewType) => `portfolioEmbeddings:${reviewType}:${userId}`,
  })
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

        photoMapObject[photoId] = {
          id: photoId,
          name: photoInfo?.name,
          thumbnailName: photoInfo?.thumbnail_name,
          originalFileName: photoInfo?.original_file_name,
          embedding: clipEmbedding,
          chunks: photoChunks,
        }

        vectors.push({
          id: photoId,
          embedding: combinedEmbedding,
          chunks: photoChunks,
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
      // console.log(`✅ No se encontraron duplicados. Se mantienen ${uniquePhotoIds.length} fotos`)
    }

    return uniquePhotoIds
  }

  // ========================================
  // PROMPT GENERATION
  // ========================================

  private generatePrompt(
    samplePhotos: any[],
    reviewType: ReviewType,
    existingPatterns: ExistingPatternSummary[] = []
  ): { systemPrompt: string; userMessage: string } {
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    if (reviewType === 'story') {
      const photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `Photo ${idx + 1} (ID: ${photo.id}):
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}`
        })
        .join('\n\n')

      return PROMPT_PORTFOLIO_STORY(photosText, samplePhotos.length, existingPatterns)
    }

    if (reviewType === 'visual_accents') {
      const photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `Photo ${idx + 1} (ID: ${photo.id}):
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}`
        })
        .join('\n\n')

      return PROMPT_PORTFOLIO_VISUAL_ACCENTS(photosText, samplePhotos.length, existingPatterns)
    }

    if (reviewType === 'context') {
      const photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `Photo ${idx + 1} (ID: ${photo.id}):
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}`
        })
        .join('\n\n')

      return PROMPT_PORTFOLIO_CONTEXT(photosText, samplePhotos.length, existingPatterns)
    }

    // general - usa imágenes reales
    const photosText = samplePhotos
      .map((photo, idx) => {
        const filename = photo.originalFileName || photo.name || 'Unknown'
        return `Photo ${idx + 1}: ${filename} (ID: ${photo.id})`
      })
      .join('\n')

    return PROMPT_PORTFOLIO_GENERAL(samplePhotos.length, photosText, existingPatterns)
  }

  // ========================================
  // LLM WITH RETRY
  // ========================================

  private async getLLMResponseWithRetry(options: {
    systemPrompt: string
    userMessages: any[]
    model: ModelName
    retryModel?: ModelName
    generationConfig?: any
    useCache?: boolean
    contextLabel?: string
    maxAttempts?: number
    validateResult?: (result: any) => boolean
    fallbackResult?: any
    images?: Array<{ photo: any; base64: string }>
    imageResolution?: 'low' | 'medium' | 'high'
    useThumbOnRetry?: number
    useBase64OnRetry?: boolean
  }): Promise<any> {
    const {
      systemPrompt,
      userMessages,
      model,
      retryModel,
      generationConfig = { temperature: 0.1 },
      useCache = true,
      contextLabel = 'llm',
      maxAttempts = 3,
      validateResult,
      fallbackResult,
      images,
      imageResolution = 'low',
      useThumbOnRetry = 0,
      useBase64OnRetry = false,
    } = options

    const baseDelayMs = 1200
    const maxDelayMs = 12000

    let lastError: any

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const currentModel = attempt > 1 && retryModel ? retryModel : model
      const modelStr = String(currentModel)
      const isGeminiModel = modelStr.includes('gemini')
      const isGPTModel = modelStr.includes('gpt')

      try {
        let response: any

        if (isGeminiModel) {
          let formattedUserMessages = userMessages

          if (images && images.length > 0) {
            // Para Gemini, necesitamos descargar las imágenes y convertirlas a base64
            const photoImageService = PhotoImageService.getInstance()
            const shouldUseThumbnail = useThumbOnRetry > 0 && attempt >= useThumbOnRetry
            if (shouldUseThumbnail) {
              console.log(
                `🖼️  [${contextLabel}] Usando thumbnails (intento ${attempt}/${maxAttempts})`
              )
            }
            const geminiImages = await photoImageService
              .getValidPhotosWithImages(
                images.map(({ photo }) => photo),
                shouldUseThumbnail
              )
              .then((photosWithImages) =>
                photosWithImages.map((imageData) => ({
                  inlineData: {
                    mimeType: 'image/png',
                    data: imageData.base64,
                  },
                }))
              )
            formattedUserMessages = [...geminiImages, ...userMessages]
          }

          response = await this.modelsService.getGeminiResponse(
            systemPrompt,
            formattedUserMessages,
            currentModel as any,
            generationConfig,
            useCache && attempt === 1,
            true
          )
        } else if (isGPTModel) {
          let formattedUserContent: any

          if (images && images.length > 0) {
            const shouldUseThumbnail = useThumbOnRetry > 0 && attempt >= useThumbOnRetry
            const shouldUseBase64 = useBase64OnRetry && attempt > 1

            if (shouldUseThumbnail) {
              console.log(
                `🖼️  [${contextLabel}] Usando thumbnails (intento ${attempt}/${maxAttempts})`
              )
            }

            if (shouldUseBase64) {
              console.log(
                `📦 [${contextLabel}] Usando base64 para imágenes (intento ${attempt}/${maxAttempts})`
              )
              // Descargar imágenes como base64 (similar a Gemini)
              const photoImageService = PhotoImageService.getInstance()
              const gptImages = await photoImageService
                .getValidPhotosWithImages(
                  images.map(({ photo }) => photo),
                  shouldUseThumbnail
                )
                .then((photosWithImages) =>
                  photosWithImages.map((imageData) => ({
                    type: 'image_url',
                    image_url: {
                      url: `data:image/png;base64,${imageData.base64}`,
                      detail: 'low',
                    },
                  }))
                )

              const textObjects = userMessages.map((msg) => ({
                type: 'text',
                text: typeof msg === 'string' ? msg : JSON.stringify(msg),
              }))

              formattedUserContent = [...gptImages, ...textObjects]
            } else {
              // Usar URL (comportamiento original)
              const gptImages = images.map(({ photo }) => {
                const imageName = shouldUseThumbnail ? photo.thumbnailName : photo.name
                const imageUrl = `https://${process.env.IMAGES_WORKER}/${imageName}`
                return {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'low',
                  },
                }
              })

              const textObjects = userMessages.map((msg) => ({
                type: 'text',
                text: typeof msg === 'string' ? msg : JSON.stringify(msg),
              }))

              formattedUserContent = [...gptImages, ...textObjects]
            }
          } else {
            formattedUserContent =
              userMessages.length === 1 ? userMessages[0] : userMessages.join('\n')
          }

          const temperature = generationConfig.temperature ?? 0.1
          const responseFormat = generationConfig.responseType
            ? { type: generationConfig.responseType }
            : null

          response = await this.modelsService.getGPTResponse(
            systemPrompt,
            formattedUserContent,
            currentModel as any,
            responseFormat,
            temperature,
            useCache && attempt === 1
          )
        } else {
          throw new Error(`Modelo no soportado: ${currentModel}`)
        }

        if (!response || typeof response !== 'object') {
          throw new Error(`Empty/invalid LLM response`)
        }

        const result = response.result

        const isEmptyObject =
          result &&
          typeof result === 'object' &&
          !Array.isArray(result) &&
          Object.keys(result).length === 0

        if (isEmptyObject) {
          throw new Error(`Parsed empty JSON object (likely truncated)`)
        }

        if (validateResult && !validateResult(result)) {
          throw new Error(`LLM JSON did not match expected shape`)
        }

        return response
      } catch (error) {
        lastError = error
        console.log(
          `⚠️ [${contextLabel}] Intento ${attempt}/${maxAttempts} falló:`,
          (error as any)?.message || error
        )

        if (attempt >= maxAttempts) break

        const exp = Math.min(6, attempt)
        const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exp - 1))
        const jitter = Math.floor(Math.random() * 250)
        await this.sleep(delay + jitter)

        console.log(`🔄 [${contextLabel}] Reintentando en ${delay + jitter}ms...`)
      }
    }

    if (fallbackResult) {
      console.error(
        `❌ [${contextLabel}] Todos los reintentos fallaron, usando fallback.`,
        'Último error:',
        (lastError as any)?.message || lastError
      )
      return { result: fallbackResult, cost: { totalCostInEur: 0 }, usedFallback: true }
    }

    throw lastError || new Error(`[${contextLabel}] Failed after ${maxAttempts} attempts`)
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
    const mainModel = config.model
    const retryModel = config.retryModel
    const needsImages = config.needsImages

    console.log('\n========== INICIO PORTFOLIO REVIEW ==========')
    console.log(`📋 ReviewType: ${reviewType}`)
    console.log(`🤖 Modelo principal: ${mainModel}`)
    console.log(`🔄 Modelo para retries: ${retryModel}`)
    console.log(`🖼️  Necesita imágenes: ${needsImages}`)
    console.log(`👤 User ID: ${userId}`)
    console.log('=============================================\n')

    let totalCostInEur = 0

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
    const totalItemsForClustering = vectors.length
    const minClusterRatio = reviewType === 'general' ? 0.002 : 0.008
    const min_cluster_size = Math.max(5, Math.floor(totalItemsForClustering * minClusterRatio))

    const clusterPayload = {
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),
      method: 'hdbscan',
      max_clusters: 20,
      min_cluster_size,
      min_samples: reviewType === 'general' ? 6 : 4,
      dim_reduction_method: 'umap',
      umap_n_components: reviewType === 'general' ? 5 : 15,
      umap_n_neighbors: reviewType === 'general' ? 4 : 30,
      umap_min_dist: 0.0,
      umap_spread: 5,
      umap_metric: 'cosine',
    }

    const clusterResult = await this.modelsService.getClusters(clusterPayload)
    const clusters = clusterResult.clusters || []

    console.log('\n========== RESULTADO DE CLUSTERING ==========')
    console.log(`📊 Clusters encontrados: ${clusters.length}`)
    console.log(`📷 Total de fotos: ${vectors.length}`)
    if (clusters.length > 0) {
      clusters.forEach((cluster: any, idx: number) => {
        console.log(
          `  ${idx + 1}. Cluster ${cluster.cluster_id}: ${cluster.size} fotos (${cluster.percentage.toFixed(1)}%)`
        )
      })
    }
    console.log('=============================================\n')

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

    // Inicializar con patrones previos (para rebuilds)
    const accumulatedPatterns: AccumulatedPattern[] = previousPatterns.map((p) => ({
      ...p,
      shortDescription: p.description.slice(0, 250) + ' ...',
      mergedClusterIds: [],
      allPhotoIds: p.clusterPhotos || p.samplePhotos.map((sp) => sp.id),
      photoCount: 0, // Reset - se recalculará
      percentage: 0,
    }))

    const hasExistingPatterns = accumulatedPatterns.length > 0
    const patterns: ClusterPattern[] = []
    const totalPhotos = vectors.length
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    // Log de patrones previos
    if (hasExistingPatterns) {
      console.log('\n========== PATRONES PREVIOS PARA REBUILD ==========')
      console.log(`📋 Patrones previos: ${accumulatedPatterns.length}`)
      accumulatedPatterns.forEach((p) => console.log(`   - [${p.patternId}] "${p.title}"`))
      console.log('===================================================\n')
    }

    // Helpers
    const createPhotoDescription = (photo: any) => {
      return chunkName === 'story' || chunkName === 'context'
        ? photo.chunks
            .filter((c: any) => c.category === chunkName)
            .map((c: any) => c.chunk)
            .join(' ') || 'No description'
        : photo.originalFileName || 'No filename'
    }

    const createSamplePhoto = (photo: any) => ({
      id: photo.id,
      thumbnailUrl: `https://${process.env.IMAGES_WORKER}/${photo.thumbnailName}`,
      description: createPhotoDescription(photo),
    })

    // Preparar patrones existentes para el prompt
    const existingPatternsForPrompt: ExistingPatternSummary[] = accumulatedPatterns.map((p) => ({
      patternId: p.patternId,
      title: p.title,
      shortDescription: p.shortDescription,
    }))

    // FASE 3: Procesar cada cluster (con límite de concurrencia)
    const limit = pLimit(config.concurrency)
    console.log(`⚡ Procesando clusters con límite de concurrencia: ${config.concurrency}`)

    const clusterProcessingTasks = clusters.map((cluster: any) =>
      limit(async () => {
        const clusterPhotoIds = Array.isArray(cluster.photo_ids) ? cluster.photo_ids : []
        const clusterSize = clusterPhotoIds.length > 0 ? clusterPhotoIds.length : cluster.size
        const sampleSize = clusterSize >= 15 ? 15 : clusterSize

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
          const additionalPhotos = additionalFilteredIds
            .map((id) => photoMapObject[id])
            .filter(Boolean)

          samplePhotos.push(...additionalPhotos)
          console.log(
            `   ✅ Agregadas ${additionalPhotos.length} fotos adicionales. Total: ${samplePhotos.length} fotos`
          )
        }

        const allClusterPhotoIds = clusterPhotoIds.map((id: string) => parseInt(id))

        // Generar prompt unificado
        const { systemPrompt, userMessage } = this.generatePrompt(
          samplePhotos,
          reviewType,
          existingPatternsForPrompt
        )

        // Preparar imágenes si es necesario
        const imagesForLLM = needsImages
          ? samplePhotos.map((photo) => ({
              photo: { id: photo.id, name: photo.name, thumbnailName: photo.thumbnailName },
              base64: '',
            }))
          : undefined

        // Llamar al LLM
        console.log(
          `🧠 Analizando cluster ${cluster.cluster_id} (${clusterSize} fotos, ${samplePhotos.length} en muestra, ${cluster.percentage.toFixed(2)}%)...`
        )

        const llmResponse = await this.getLLMResponseWithRetry({
          contextLabel: `portfolioReview.${reviewType}.cluster_${cluster.cluster_id}`,
          systemPrompt,
          userMessages: [userMessage],
          model: mainModel,
          retryModel: retryModel,
          generationConfig: { temperature: 0.7, responseType: 'json_object' },
          useCache: !needsImages,
          validateResult: (r: any) => this.isValidPatternResult(r, hasExistingPatterns),
          fallbackResult: {
            decision: 'new',
            title: `Pattern ${patterns.length + accumulatedPatterns.length + 1}`,
            description: 'No description available',
            patternType: 'NA',
          },
          images: imagesForLLM,
          useThumbOnRetry: config.useThumbOnRetry,
          useBase64OnRetry: config.useBase64OnRetry,
        })

        let cost = 0
        if (llmResponse?.cost?.totalCostInEur) {
          cost = llmResponse.cost.totalCostInEur
        }

        let analysis = llmResponse?.result

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
              targetPattern.samplePhotos.push(createSamplePhoto(photo))
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
            return { type: 'merge', cost }
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
          ? `pattern_new_${patterns.length + 1}`
          : `cluster_${cluster.cluster_id}`

        const pattern: ClusterPattern = {
          patternId: newPatternId,
          patternType: analysis.patternType || 'NA',
          title: analysis.title || `Pattern ${patterns.length + 1}`,
          description: analysis.description || 'No description available',
          photoCount: clusterSize,
          percentage: cluster.percentage,
          strength: this.calculatePatternStrength(cluster.percentage),
          clusterPhotos: allClusterPhotoIds,
          samplePhotos: representativePhotos.slice(0, 4).map(createSamplePhoto),
        }

        console.log(`✨ Nuevo patrón creado: "${pattern.title}"`)
        return { type: 'new', pattern, cost }
      })
    )

    // Esperar a que todos los clusters terminen de procesarse
    const results = await Promise.all(clusterProcessingTasks)

    // Consolidar resultados
    for (const result of results) {
      if (result.cost) {
        totalCostInEur += result.cost
      }
      if (result.type === 'new' && result.pattern) {
        patterns.push(result.pattern)
      }
    }

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

    // FASE 4: Deduplicación de patrones
    const deduplicationResult = await this.deduplicatePatterns(
      patterns,
      reviewType,
      'gemini-2.5-flash'
    )

    // devolvemos el objeto sin deduplicar
    // const deduplicationResult = { patterns, removedIds: [], cost: 0 }

    const finalPatterns = deduplicationResult.patterns
    totalCostInEur += deduplicationResult.cost

    console.log('\n========== RESUMEN FINAL ==========')
    console.log(`📦 Patrones identificados: ${finalPatterns.length}`)
    finalPatterns.forEach((p, idx) => {
      console.log(
        `  ${idx + 1}. "${p.title}" - ${p.photoCount} fotos (${p.percentage.toFixed(1)}%)`
      )
    })
    console.log(`💰 Costo total: €${totalCostInEur.toFixed(4)}`)
    console.log('====================================\n')

    return {
      patterns: finalPatterns,
      metadata: {
        totalPhotos,
        clustersFound: clusters.length,
        patternsIdentified: finalPatterns.length,
        patternsBeforeDeduplication: patterns.length,
        patternsRemoved: deduplicationResult.removedIds.length,
        reviewType,
        previousPatternsCount: previousPatterns.length,
      },
      cost: {
        totalCostInEur,
      },
    }
  }

  // ========================================
  // DEDUPLICATION
  // ========================================

  private async deduplicatePatterns(
    patterns: ClusterPattern[],
    reviewType: ReviewType,
    model: ModelName
  ): Promise<{ patterns: ClusterPattern[]; removedIds: string[]; cost: number }> {
    // Si hay menos de 2 patrones, no hay nada que deduplicar
    if (patterns.length < 2) {
      return { patterns, removedIds: [], cost: 0 }
    }

    console.log('\n========== FASE DE DEDUPLICACIÓN ==========')
    console.log(`📋 Patrones a analizar: ${patterns.length}`)

    // Preparar datos para el prompt
    const patternsForPrompt: PatternForDeduplication[] = patterns.map((p) => ({
      patternId: p.patternId,
      title: p.title,
      shortDescription: p.description.slice(0, 250) + ' ...',
      photoCount: p.photoCount,
    }))

    const { systemPrompt, userMessage } = PROMPT_PORTFOLIO_DEDUPLICATE(
      patternsForPrompt,
      reviewType
    )

    try {
      const llmResponse = await this.getLLMResponseWithRetry({
        contextLabel: `portfolioReview.deduplicate.${reviewType}`,
        systemPrompt,
        userMessages: [userMessage],
        model,
        generationConfig: { temperature: 0.3, responseType: 'json_object' },
        useCache: true,
        validateResult: (r: any) => r && typeof r === 'object' && Array.isArray(r.merges),
        fallbackResult: { merges: [] },
      })

      const cost = llmResponse?.cost?.totalCostInEur || 0
      const result = llmResponse?.result

      if (!result?.merges || result.merges.length === 0) {
        console.log('✅ No se encontraron duplicados')
        console.log('============================================\n')
        return { patterns, removedIds: [], cost }
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

      return { patterns: filteredPatterns, removedIds, cost }
    } catch (error) {
      console.error('⚠️ Error en deduplicación, manteniendo todos los patrones:', error)
      return { patterns, removedIds: [], cost: 0 }
    }
  }
}
