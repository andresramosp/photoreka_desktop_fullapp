import db from '@adonisjs/lucid/services/db'
import ModelsService, { ModelName } from '#services/models_service'
import PhotoManager from './photo_manager.js'
import { withCache } from '../decorators/withCache.js'
import {
  PROMPT_PORTFOLIO_NARRATIVE_PATTERN,
  PROMPT_PORTFOLIO_CONTEXTUAL_PATTERN,
  PROMPT_PORTFOLIO_AESTHETIC_PATTERN,
  PROMPT_PORTFOLIO_PROGRESSIVE_FUSION,
  PROMPT_PORTFOLIO_GENERAL_PATTERN_INDEPENDENT,
} from '../utils/prompts/portfolio_review.js'

export type ReviewType = 'story' | 'context' | 'general'

// Configuración para cada tipo de review
export interface ReviewTypeConfig {
  model: ModelName // Modelo principal a usar
  useProgressiveFusion: boolean // true: fusión progresiva, false: análisis independiente
  retryModel?: ModelName // Modelo para reintentos (opcional, por defecto usa el mismo modelo)
}

// Configuración por reviewType
export const REVIEW_TYPE_CONFIG: Record<ReviewType, ReviewTypeConfig> = {
  general: {
    model: 'gpt-5.1',
    useProgressiveFusion: false,
    retryModel: 'gpt-5.1',
  },
  story: {
    model: 'gemini-2.5-flash',
    useProgressiveFusion: true,
    retryModel: 'gpt-5.1',
  },
  context: {
    model: 'gemini-2.5-flash',
    useProgressiveFusion: true,
    retryModel: 'gpt-5.1',
  },
}

// Mapeo de ReviewType a chunkName usado en la BD
const REVIEW_TYPE_TO_CHUNK: Record<ReviewType, string> = {
  story: 'story',
  context: 'context',
  general: 'general', // Usa embeddings CLIP de photos.embedding
}

interface ClusterPattern {
  patternId: string
  patternType: 'stylistic' | 'object_motif' | 'NA'
  title: string
  description: string
  photoCount: number
  percentage: number
  strength: 'strong' | 'moderate' | 'weak'
  samplePhotos: Array<{
    id: number
    thumbnailUrl: string
    description: string
  }>
}

// Interfaz extendida para acumular datos durante la fusión progresiva
interface AccumulatedPattern extends ClusterPattern {
  shortDescription: string // Descripción corta (2 frases) para contexto del LLM
  mergedClusterIds: string[] // IDs de clusters que se han fusionado en este patrón
  allPhotoIds: number[] // Todos los IDs de fotos (para evitar duplicados en samplePhotos)
  mergedClustersExamples?: Array<{
    clusterId: string
    sampleDescription: string
  }> // Ejemplo de descripción de foto por cada cluster mergeado
}

export default class PortfolioReviewManager {
  private modelsService: ModelsService

  constructor() {
    this.modelsService = new ModelsService()
  }

  /**
   * Calcula la fuerza del patrón basándose en el porcentaje de fotos
   * strong: >= 20% de las fotos
   * moderate: >= 5% de las fotos
   * weak: < 5% de las fotos
   */
  private calculatePatternStrength(percentage: number): 'strong' | 'moderate' | 'weak' {
    if (percentage >= 20) {
      return 'strong'
    } else if (percentage >= 5) {
      return 'moderate'
    } else {
      return 'weak'
    }
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isNonEmptyString(value: any): boolean {
    return typeof value === 'string' && value.trim().length > 0
  }

  private isValidProgressiveFusionResult(result: any): boolean {
    if (!result || typeof result !== 'object') return false

    const decisionOk =
      typeof result.decision === 'string' &&
      (result.decision === 'merge' || result.decision === 'new')

    if (!decisionOk) return false

    // Si es merge, solo necesita mergeWithPatternId
    if (result.decision === 'merge') {
      return this.isNonEmptyString(result.mergeWithPatternId)
    }

    // Si es new, necesita title y description
    if (result.decision === 'new') {
      const hasTitle = this.isNonEmptyString(result.title)
      const hasDescription = this.isNonEmptyString(result.description)
      return hasTitle && hasDescription
    }

    return true
  }

  private isValidIndependentPatternResult(result: any): boolean {
    if (!result || typeof result !== 'object') return false

    // Requisito: si falta title/description, debemos reintentar.
    return this.isNonEmptyString(result.title) && this.isNonEmptyString(result.description)
  }

  /**
   * Realiza múltiples intentos de llamada a un LLM (Gemini o GPT) con retry exponencial
   *
   * Características:
   * - Soporta tanto Gemini como GPT de forma transparente
   * - Maneja automáticamente el formateo de imágenes según el modelo:
   *   * Gemini: formato inlineData con base64
   *   * GPT: formato image_url con URLs
   * - Implementa retry con exponential backoff
   * - Valida respuestas con función custom
   * - Soporta fallback en caso de fallos repetidos
   *
   * @param options.systemPrompt - Prompt del sistema
   * @param options.userMessages - Mensajes del usuario (texto)
   * @param options.model - Modelo a usar (detecta automáticamente si es Gemini o GPT)
   * @param options.retryModel - Modelo alternativo para reintentos (opcional, por defecto usa el mismo modelo)
   * @param options.generationConfig - Configuración de generación (temperature, responseType, etc)
   * @param options.useCache - Si usar caché (solo en primer intento)
   * @param options.contextLabel - Label para logs
   * @param options.maxAttempts - Número máximo de intentos
   * @param options.validateResult - Función para validar la respuesta del LLM
   * @param options.fallbackResult - Resultado de fallback si fallan todos los intentos
   * @param options.images - Array de imágenes con { photo, base64 }
   * @param options.imageResolution - Resolución para GPT ('low' | 'medium' | 'high')
   */
  private async getLLMResponseWithRetry(options: {
    systemPrompt: string
    userMessages: any[]
    model:
      | Parameters<ModelsService['getGeminiResponse']>[2]
      | Parameters<ModelsService['getGPTResponse']>[2]
    retryModel?: ModelName // Modelo para reintentos
    generationConfig?: any
    useCache?: boolean
    contextLabel?: string
    maxAttempts?: number
    validateResult?: (result: any) => boolean
    fallbackResult?: any
    images?: Array<{ photo: any; base64: string }>
    imageResolution?: 'low' | 'medium' | 'high'
  }): Promise<any> {
    const {
      systemPrompt,
      userMessages,
      model,
      retryModel,
      generationConfig = { temperature: 0.1 },
      useCache = true,
      contextLabel = 'llm',
      maxAttempts = 3, // 1 intento inicial + 2 reintentos
      validateResult,
      fallbackResult,
      images,
      imageResolution = 'low',
    } = options

    const baseDelayMs = 900
    const maxDelayMs = 12000

    let lastError: any

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // A partir del segundo intento, usar retryModel si está disponible
      const currentModel = attempt > 1 && retryModel ? retryModel : model

      // Detectar si es un modelo Gemini o GPT
      const modelStr = String(currentModel)
      const isGeminiModel = modelStr.includes('gemini')
      const isGPTModel = modelStr.includes('gpt')
      try {
        let response: any

        if (isGeminiModel) {
          // Formatear imágenes para Gemini
          let formattedUserMessages = userMessages

          if (images && images.length > 0) {
            const geminiImages = images.map(({ base64 }) => ({
              inlineData: {
                mimeType: 'image/png',
                data: base64,
              },
            }))

            formattedUserMessages = [...geminiImages, ...userMessages]
          }

          response = await this.modelsService.getGeminiResponse(
            systemPrompt,
            formattedUserMessages,
            currentModel as any,
            generationConfig,
            useCache && attempt === 1, // Solo usar cache en el primer intento
            true // throwOnError
          )
        } else if (isGPTModel) {
          // Formatear para GPT
          let formattedUserContent: any

          if (images && images.length > 0) {
            // Con imágenes: content debe ser un array de objetos
            const gptImages = images.map(({ photo }) => {
              // Construir originalUrl a partir del nombre de la foto
              const originalUrl = `https://${process.env.IMAGES_WORKER}/${photo.name}`

              return {
                type: 'image_url',
                image_url: {
                  url: originalUrl,
                  detail: imageResolution,
                },
              }
            })

            // Convertir texto a formato de objetos y combinar con imágenes
            const textObjects = userMessages.map((msg) => ({
              type: 'text',
              text: typeof msg === 'string' ? msg : JSON.stringify(msg),
            }))

            formattedUserContent = [...gptImages, ...textObjects]
          } else {
            // Sin imágenes: content debe ser un string simple
            formattedUserContent =
              userMessages.length === 1 ? userMessages[0] : userMessages.join('\n')
          }

          // Para GPT, extraer valores de generationConfig
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
            useCache && attempt === 1 // Solo usar cache en el primer intento
          )
        } else {
          throw new Error(
            `Modelo no soportado: ${currentModel}. Solo se soportan modelos Gemini y GPT.`
          )
        }

        if (!response || typeof response !== 'object') {
          throw new Error(`Empty/invalid LLM response`)
        }

        const result = response.result

        // Validar que no sea un objeto vacío
        const isEmptyObject =
          result &&
          typeof result === 'object' &&
          !Array.isArray(result) &&
          Object.keys(result).length === 0

        if (isEmptyObject) {
          throw new Error(`Parsed empty JSON object (likely truncated)`)
        }

        // Validar con función custom si existe
        if (validateResult && !validateResult(result)) {
          throw new Error(`LLM JSON did not match expected shape`)
        }

        return response
      } catch (error) {
        lastError = error

        // Log del error
        console.log(
          `⚠️ [${contextLabel}] Intento ${attempt}/${maxAttempts} falló:`,
          error?.message || error
        )

        // Si es el último intento, salir del loop
        if (attempt >= maxAttempts) {
          break
        }

        // Exponential backoff con jitter
        const exp = Math.min(6, attempt)
        const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exp - 1))
        const jitter = Math.floor(Math.random() * 250)
        await this.sleep(delay + jitter)

        console.log(`🔄 [${contextLabel}] Reintentando en ${delay + jitter}ms...`)
      }
    }

    // Si agotamos todos los reintentos y hay fallback configurado
    if (fallbackResult) {
      console.error(
        `❌ [${contextLabel}] Todos los reintentos fallaron, usando fallback.`,
        'Último error:',
        lastError?.message || lastError
      )
      return { result: fallbackResult, cost: { totalCostInEur: 0 }, usedFallback: true }
    }

    throw lastError || new Error(`[${contextLabel}] Failed after ${maxAttempts} attempts`)
  }

  /**
   * Combina múltiples embeddings en uno solo usando promedio aritmético
   */
  private combineEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      return []
    }

    if (embeddings.length === 1) {
      return embeddings[0]
    }

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

  /**
   * Obtiene embeddings para el tipo de review especificado
   * Basado en la lógica de 3d_manager para diferentes tipos de chunks
   */
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
        {
          userId: parseInt(userId),
        }
      )
    } else if (chunkName === 'artistic_scores') {
      // Caso especial: usar el embedding computado de artistic_scores
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
      // Caso especial: usar el embedding computado de visual_aspects
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
          p.original_file_name
        FROM photos p
        JOIN descriptions_chunks dc ON p.id = dc.photo_id
        WHERE dc.category = :chunkName
          AND p.user_id = :userId
          AND dc.embedding IS NOT NULL
        ORDER BY p.id
      `,
        {
          chunkName,
          userId: parseInt(userId),
        }
      )
    }

    const photos = photosWithCategory.rows

    if (photos.length === 0) {
      return { vectors: [], photoMapObject: {} }
    }

    let vectors: any[] = []
    const photoMapObject: Record<number, any> = {}

    // Caso especial: general usa embeddings directos
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
              chunks: [], // No hay chunks para general
            }

            return {
              id: photo.id,
              embedding,
              chunks: [],
            }
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

            return {
              id: photo.id,
              embedding,
              chunks: [],
            }
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

            return {
              id: photo.id,
              embedding,
              chunks: [],
            }
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
        {
          chunkName,
          photoIds,
        }
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
          .map((chunk: any) => {
            return chunk.embedding ? JSON.parse(chunk.embedding as string) : null
          })
          .filter(Boolean)

        if (embeddings.length === 0) continue

        // Combinar embeddings de todos los chunks de esta foto
        const combinedEmbedding = this.combineEmbeddings(embeddings)

        const photoInfo = photos.find((p: any) => p.id === photoId)

        photoMapObject[photoId] = {
          id: photoId,
          name: photoInfo?.name,
          thumbnailName: photoInfo?.thumbnail_name,
          originalFileName: photoInfo?.original_file_name,
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

  /**
   * Obtiene una muestra representativa de un cluster
   * Combina fotos cercanas al centroide (representativas) con algunas del borde (diversidad)
   */
  private sampleCluster(cluster: any, sampleSize: number = 10): number[] {
    const { photo_ids, centroid_distances } = cluster

    // Crear pares [photoId, distancia] y ordenar por distancia
    const photoDistances = photo_ids.map((id: string, idx: number) => ({
      id: parseInt(id),
      distance: centroid_distances[idx],
    }))

    photoDistances.sort((a: any, b: any) => a.distance - b.distance)

    // 70% fotos cercanas al centroide (más representativas)
    const coreSize = Math.floor(sampleSize * 0.7)
    const coreSample = photoDistances.slice(0, coreSize).map((p: any) => p.id)

    // 30% fotos del borde (para capturar diversidad)
    const edgeSize = sampleSize - coreSize
    const edgeSample = photoDistances
      .slice(-edgeSize)
      .map((p: any) => p.id)
      .reverse()

    return [...coreSample, ...edgeSample]
  }

  /**
   * Genera el prompt para que el LLM interprete un cluster
   */
  private generateClusterPrompt(
    samplePhotos: any[],
    reviewType: ReviewType
  ): { systemPrompt: string; userMessage: string; needsImages?: boolean } {
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    // Para tipos que usan chunks de texto
    if (chunkName === 'story') {
      const photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `
Photo ${idx + 1}:
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}
      `.trim()
        })
        .join('\n\n')

      return PROMPT_PORTFOLIO_NARRATIVE_PATTERN(photosText, samplePhotos.length)
    } else if (chunkName === 'context') {
      const photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `
Photo ${idx + 1}:
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}
      `.trim()
        })
        .join('\n\n')

      return PROMPT_PORTFOLIO_CONTEXTUAL_PATTERN(photosText, samplePhotos.length)
    } else if (chunkName === 'visual_aspects') {
      const photosList = samplePhotos
        .map((photo, idx) => `Photo ${idx + 1}: ${photo.originalFileName}`)
        .join('\n')

      return PROMPT_PORTFOLIO_AESTHETIC_PATTERN(photosList, samplePhotos.length)
    } else {
      // Para general: se deben pasar imágenes reales al LLM
      const photosText = samplePhotos
        .map((photo, idx) => {
          const filename = photo.originalFileName || photo.name || 'Unknown'
          return `Photo ${idx + 1}: ${filename} (ID: ${photo.id})`
        })
        .join('\n')

      const { systemPrompt, userMessage } = PROMPT_PORTFOLIO_GENERAL_PATTERN_INDEPENDENT(
        samplePhotos.length,
        photosText
      )
      return { systemPrompt, userMessage, needsImages: true }
    }
  }

  /**
   * Genera el prompt para fusión progresiva de clusters
   * Incluye los patrones ya identificados para que el LLM decida si fusionar o crear nuevo
   */
  private generateProgressiveFusionPrompt(
    samplePhotos: any[],
    reviewType: ReviewType,
    existingPatterns: AccumulatedPattern[]
  ): { systemPrompt: string; userMessage: string; needsImages?: boolean } {
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    // Mapear ReviewType a los tipos del prompt
    const reviewTypeMap: Record<ReviewType, 'narrative' | 'contextual' | 'general'> = {
      story: 'narrative',
      context: 'contextual',
      general: 'general',
    }

    // Preparar texto de las fotos según el tipo
    let photosText: string
    let needsImages = false

    if (chunkName === 'general') {
      // Para 'general' el LLM debe analizar las imágenes reales (embeddings CLIP)
      // El texto solo sirve como índice/metadata para alinear el orden con las imágenes adjuntas.
      needsImages = true
      photosText = samplePhotos
        .map((photo, idx) => {
          const filename = photo.originalFileName || photo.name || 'Unknown'
          return `Photo ${idx + 1}: ${filename} (id: ${photo.id})`
        })
        .join('\n')
    } else if (chunkName === 'story' || chunkName === 'context' || chunkName === 'visual_accents') {
      photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `Photo ${idx + 1} (ID: ${photo.id}):
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}`
        })
        .join('\n\n')
    } else {
      photosText = samplePhotos
        .map((photo, idx) => `Photo ${idx + 1} (ID: ${photo.id}): ${photo.originalFileName}`)
        .join('\n')
    }

    // Preparar resumen de patrones existentes (usando shortDescription para no saturar)
    const existingPatternsSummary = existingPatterns.map((p) => ({
      patternId: p.patternId,
      title: p.title,
      shortDescription: p.shortDescription,
    }))

    return {
      ...PROMPT_PORTFOLIO_PROGRESSIVE_FUSION(
        photosText,
        samplePhotos.length,
        existingPatternsSummary,
        reviewTypeMap[reviewType]
      ),
      needsImages,
    }
  }

  /**
   * Método principal: Obtiene patrones del portfolio según el tipo de review
   * @param userId - ID del usuario
   * @param reviewType - Tipo de review (general, story, context)
   * @param previousPatterns - Patrones previos del usuario para rebuild incremental (opcional)
   */

  public async getPatterns(
    userId: string,
    reviewType: ReviewType = 'general',
    previousPatterns: ClusterPattern[] = []
  ) {
    // Obtener configuración para este reviewType
    const config = REVIEW_TYPE_CONFIG[reviewType]
    const actualUseProgressiveFusion = config.useProgressiveFusion
    const mainModel = config.model
    const retryModel = config.retryModel || config.model

    // Log de configuración inicial
    console.log('\n========== INICIO PORTFOLIO REVIEW ==========')
    console.log(`📋 ReviewType: ${reviewType}`)
    console.log(`🤖 Modelo principal: ${mainModel}`)
    console.log(`🔄 Modelo para retries: ${retryModel}`)
    console.log(
      `🔀 Modo de procesamiento: ${actualUseProgressiveFusion ? 'Fusión Progresiva' : 'Independiente'}`
    )
    console.log(`👤 User ID: ${userId}`)
    console.log('=============================================\n')

    // Inicializar acumulador de costos
    let totalCostInEur = 0

    // FASE 1: Obtener embeddings según el tipo de review
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

    // HDBSCAN es muy sensible a min_cluster_size y a cómo escala con N.
    // Para 'general' (CLIP) suele haber MUCHAS más fotos que en story/context,
    // y un min_cluster_size proporcional demasiado alto tiende a producir muy pocos clusters.
    const totalItemsForClustering = vectors.length
    const minClusterRatio = reviewType === 'general' ? 0.002 : 0.008
    const min_cluster_size = Math.max(5, Math.floor(totalItemsForClustering * minClusterRatio))

    // FASE 2: Clustering en espacio de alta dimensión
    const clusterPayload = {
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),

      method: 'hdbscan',
      max_clusters: 20,
      min_cluster_size,
      min_samples: reviewType === 'general' ? 5 : 3,
      dim_reduction_method: 'umap',
      umap_n_components: 15,
      // Para CLIP suele funcionar mejor un enfoque más local para evitar mega-clusters.
      umap_n_neighbors: reviewType === 'general' ? 5 : 30,
      umap_min_dist: 0.0,
      umap_spread: 1.0,
      umap_metric: 'cosine',
    }

    const clusterResult = await this.modelsService.getClusters(clusterPayload)
    const clusters = clusterResult.clusters || []

    // Log de clusters encontrados
    console.log('\n========== RESULTADO DE CLUSTERING ==========')
    console.log(`📊 Clusters encontrados: ${clusters.length}`)
    console.log(`📷 Total de fotos a analizar: ${vectors.length}`)
    console.log(`⚙️  min_cluster_size: ${min_cluster_size}`)
    console.log(`⚙️  umap_n_neighbors: ${clusterPayload.umap_n_neighbors}`)
    if (clusters.length > 0) {
      console.log('\nDesglose de clusters:')
      clusters.forEach((cluster: any, idx: number) => {
        console.log(
          `  ${idx + 1}. Cluster ${cluster.cluster_id}: ${cluster.size} fotos (${cluster.percentage.toFixed(1)}%)`
        )
      })
    }
    console.log('=============================================\n')

    if (clusters.length === 0) {
      // Si no hay clusters pero hay patrones previos, devolverlos vacíos (todos eliminados)
      return {
        patterns: [],
        metadata: {
          totalPhotos: vectors.length,
          clustersFound: 0,
          patternsIdentified: 0,
          previousPatternsCount: previousPatterns.length,
          message: 'No se encontraron patrones significativos en el portfolio',
        },
      }
    }

    // Log de patrones previos
    if (previousPatterns.length > 0) {
      console.log('\n========== PATRONES PREVIOS PARA REBUILD ==========')
      console.log(`📋 Patrones previos encontrados: ${previousPatterns.length}`)
      for (const p of previousPatterns) {
        console.log(`   - [${p.patternId}] "${p.title}" (${p.photoCount} fotos)`)
      }
      console.log('===================================================\n')
    }

    // FASE 3 & 4: Análisis de clusters con LLM
    // Inicializar accumulatedPatterns con los patrones previos (si existen)
    const accumulatedPatterns: AccumulatedPattern[] = previousPatterns.map((p) => ({
      ...p,
      shortDescription: p.description.slice(0, 150),
      mergedClusterIds: [],
      allPhotoIds: p.samplePhotos.map((sp) => sp.id),
      // Reset counters - se recalcularán con los nuevos clusters
      photoCount: 0,
      percentage: 0,
    }))
    const patterns: ClusterPattern[] = []
    const totalPhotos = vectors.length
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    // Helper para crear descripción de foto
    const createPhotoDescription = (photo: any) => {
      return chunkName === 'story' || chunkName === 'context'
        ? photo.chunks
            .filter((c: any) => c.category === chunkName)
            .map((c: any) => c.chunk)
            .join(' ') || 'No description'
        : photo.originalFileName || 'No filename'
    }

    // Helper para crear objeto de foto para samplePhotos
    const createSamplePhoto = (photo: any) => ({
      id: photo.id,
      thumbnailUrl: `https://${process.env.IMAGES_WORKER}/${photo.thumbnailName}`,
      description: createPhotoDescription(photo),
    })

    if (actualUseProgressiveFusion) {
      // ============ MODO FUSIÓN PROGRESIVA ============
      // El LLM decide si cada cluster se fusiona con uno existente o crea uno nuevo

      for (const cluster of clusters) {
        const clusterSize = cluster.size
        const sampleSize = Math.min(15, Math.max(5, Math.floor(clusterSize * 0.1)))

        const samplePhotoIds = this.sampleCluster(cluster, sampleSize)
        let samplePhotos = samplePhotoIds.map((id) => photoMapObject[id]).filter(Boolean)
        const allClusterPhotoIds = cluster.photo_ids.map((id: string) => parseInt(id))

        // Generar prompt con contexto de patrones existentes
        const { systemPrompt, userMessage, needsImages } = this.generateProgressiveFusionPrompt(
          samplePhotos,
          reviewType,
          accumulatedPatterns
        )

        // Preparar imágenes si es necesario
        const imagesForLLM = needsImages
          ? samplePhotos.map((photo) => ({
              photo: { id: photo.id, name: photo.name },
              base64: '', // No necesario, getLLMResponseWithRetry construirá las URLs
            }))
          : undefined

        const llmResponse = await this.getLLMResponseWithRetry({
          contextLabel: `portfolioReview.progressiveFusion.${needsImages ? 'withImages' : 'textOnly'}.cluster_${cluster.cluster_id}`,
          systemPrompt,
          userMessages: [userMessage],
          model: mainModel,
          retryModel: retryModel,
          generationConfig: { temperature: 0.7, responseType: 'json_object' },
          useCache: !needsImages, // Evitar cache con imágenes grandes
          validateResult: (r: any) => this.isValidProgressiveFusionResult(r),
          fallbackResult: {
            decision: 'new',
            title: `Pattern ${accumulatedPatterns.length + 1}`,
            shortDescription: 'No description',
            description: 'No description available',
            strength: 'moderate',
          },
          images: imagesForLLM,
        })

        // Acumular costo
        if (llmResponse?.cost?.totalCostInEur) {
          totalCostInEur += llmResponse.cost.totalCostInEur
        }

        let analysis = llmResponse?.result

        // Normalizar salida para evitar tumbar el flujo por campos ausentes
        if (!analysis || typeof analysis !== 'object') {
          analysis = {
            decision: 'new',
            title: `Pattern ${accumulatedPatterns.length + 1}`,
            shortDescription: 'No description',
            description: 'No description available',
            strength: 'moderate',
          }
        }

        if (analysis.decision !== 'merge' && analysis.decision !== 'new') {
          analysis.decision = 'new'
        }

        if (analysis.decision === 'merge' && !analysis.mergeWithPatternId) {
          analysis.decision = 'new'
        }

        if (analysis.decision === 'merge' && analysis.mergeWithPatternId) {
          // FUSIONAR con patrón existente
          const targetPattern = accumulatedPatterns.find(
            (p) => p.patternId === analysis.mergeWithPatternId
          )

          if (targetPattern) {
            targetPattern.photoCount += clusterSize
            targetPattern.percentage += cluster.percentage
            targetPattern.mergedClusterIds.push(`cluster_${cluster.cluster_id}`)

            // Guardar ejemplo de descripción del cluster mergeado para el resumen
            if (!targetPattern.mergedClustersExamples) {
              targetPattern.mergedClustersExamples = []
            }
            const sampleDescription = samplePhotos[0]
              ? createPhotoDescription(samplePhotos[0])
              : 'No description'
            targetPattern.mergedClustersExamples.push({
              clusterId: `cluster_${cluster.cluster_id}`,
              sampleDescription: sampleDescription.slice(0, 200),
            })

            // Usar las fotos representativas del LLM si están disponibles
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
              .slice(0, Math.max(0, 8 - targetPattern.samplePhotos.length))

            for (const photo of newPhotosToAdd) {
              targetPattern.samplePhotos.push(createSamplePhoto(photo))
              targetPattern.allPhotoIds.push(photo.id)
            }

            for (const photoId of allClusterPhotoIds) {
              if (!existingPhotoIds.has(photoId)) {
                targetPattern.allPhotoIds.push(photoId)
              }
            }

            // Recalcular strength basándose en el porcentaje actualizado
            targetPattern.strength = this.calculatePatternStrength(targetPattern.percentage)
          }
        } else {
          // CREAR nuevo patrón
          // Usar las fotos representativas seleccionadas por el LLM
          let representativePhotos: any[] = []
          if (analysis.representativePhotoIds && Array.isArray(analysis.representativePhotoIds)) {
            // Convertir IDs a números y buscar las fotos correspondientes
            const repIds = analysis.representativePhotoIds.map((id: any) => parseInt(String(id)))
            representativePhotos = repIds.map((id: number) => photoMapObject[id]).filter(Boolean)
          }

          // Fallback: si no hay IDs representativos o no se encontraron, usar las primeras 4
          if (representativePhotos.length === 0) {
            representativePhotos = samplePhotos.slice(0, 4)
          }

          const newPattern: AccumulatedPattern = {
            patternId: `pattern_${accumulatedPatterns.length + 1}`,
            patternType: analysis.patternType || 'NA',
            title: analysis.title || `Pattern ${accumulatedPatterns.length + 1}`,
            shortDescription:
              analysis.shortDescription || analysis.description?.slice(0, 150) || 'No description',
            description: analysis.description || 'No description available (null)',
            photoCount: clusterSize,
            percentage: cluster.percentage,
            strength: this.calculatePatternStrength(cluster.percentage),
            samplePhotos: representativePhotos.map(createSamplePhoto),
            mergedClusterIds: [`cluster_${cluster.cluster_id}`],
            allPhotoIds: allClusterPhotoIds,
          }

          accumulatedPatterns.push(newPattern)
        }
      }

      // Convertir AccumulatedPattern a ClusterPattern (filtrar patrones con 0 fotos)
      for (const p of accumulatedPatterns) {
        // Filtrar patrones que quedaron vacíos (no recibieron ningún merge)
        if (p.photoCount === 0) {
          console.log(`⚠️ Patrón "${p.title}" eliminado por tener 0 fotos después del rebuild`)
          continue
        }

        patterns.push({
          patternId: p.patternId,
          patternType: p.patternType || 'NA',
          title: p.title,
          description: p.description,
          photoCount: p.photoCount,
          percentage: Math.min(100, p.percentage),
          strength: p.strength,
          samplePhotos: p.samplePhotos.slice(0, 4),
        })
      }

      // Mostrar resumen de fusiones
      console.log('\n========== RESUMEN DE FUSIONES PROGRESIVAS ==========')
      for (const pattern of accumulatedPatterns) {
        if (pattern.mergedClusterIds.length > 0) {
          console.log(`\n📦 Patrón: ${pattern.title}`)
          console.log(`   Descripción: ${pattern.description}`)
          console.log(
            `   Total de fotos: ${pattern.photoCount} (${pattern.percentage.toFixed(1)}%)`
          )
          console.log(`   Fuerza: ${pattern.strength}`)
          console.log(`   Clusters mergeados (${pattern.mergedClusterIds.length}):`)

          if (pattern.mergedClustersExamples && pattern.mergedClustersExamples.length > 0) {
            for (const cluster of pattern.mergedClustersExamples) {
              console.log(`     ├─ ${cluster.clusterId}`)
              console.log(`     │  └─ Ejemplo: "${cluster.sampleDescription}..."`)
            }
          }
          // Mostrar el cluster original del patrón
          console.log(`     └─ ${pattern.mergedClusterIds[0]} (cluster original del patrón)`)
        }
      }
      console.log('\n===================================================\n')
    } else {
      // ============ MODO INDEPENDIENTE (con soporte para patrones previos en rebuild) ============
      // Cada cluster puede: 1) mergearse a un patrón previo, o 2) crear uno nuevo
      // NO permite merge entre clusters nuevos del mismo batch

      // Convertir patrones previos a estructura para el prompt
      const previousPatternsForPrompt = accumulatedPatterns.map((p) => ({
        patternId: p.patternId,
        title: p.title,
        shortDescription: p.shortDescription,
      }))

      const hasPreviousPatterns = previousPatternsForPrompt.length > 0

      for (const cluster of clusters) {
        const clusterSize = cluster.size
        const sampleSize = Math.min(15, Math.max(5, Math.floor(clusterSize * 0.1)))

        const samplePhotoIds = this.sampleCluster(cluster, sampleSize)
        let samplePhotos = samplePhotoIds.map((id) => photoMapObject[id]).filter(Boolean)
        const allClusterPhotoIds = cluster.photo_ids.map((id: string) => parseInt(id))

        let llmResponse: any
        let analysis: any

        // Decidir qué prompt usar según si hay patrones previos
        if (hasPreviousPatterns) {
          // REBUILD: Usar prompt que permite merge a previos o crear nuevo
          const photosText = samplePhotos
            .map((photo, idx) => `Photo ${idx + 1} (ID: ${photo.id}): ${photo.originalFileName}`)
            .join('\n')

          const { systemPrompt, userMessage } = PROMPT_PORTFOLIO_GENERAL_PATTERN_INDEPENDENT(
            samplePhotos.length,
            photosText,
            previousPatternsForPrompt
          )

          // Preparar imágenes si es necesario (para 'general')
          const imagesForLLM =
            chunkName === 'general'
              ? samplePhotos.map((photo) => ({
                  photo: { id: photo.id, name: photo.name },
                  base64: '',
                }))
              : undefined

          llmResponse = await this.getLLMResponseWithRetry({
            contextLabel: `portfolioReview.independentRebuild.${chunkName === 'general' ? 'withImages' : 'textOnly'}.cluster_${cluster.cluster_id}`,
            systemPrompt,
            userMessages: [userMessage],
            model: mainModel,
            retryModel: retryModel,
            generationConfig: { temperature: 0.7, responseType: 'json_object' },
            useCache: chunkName !== 'general',
            validateResult: (r: any) => this.isValidProgressiveFusionResult(r),
            fallbackResult: {
              decision: 'new',
              title: `Pattern ${patterns.length + accumulatedPatterns.length + 1}`,
              description: 'No description available',
              patternType: 'NA',
            },
            images: imagesForLLM,
          })

          if (llmResponse?.cost?.totalCostInEur) {
            totalCostInEur += llmResponse.cost.totalCostInEur
          }

          analysis = llmResponse?.result

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
          if (analysis.decision === 'merge' && analysis.mergeWithPatternId) {
            // MERGE con patrón previo
            const targetPattern = accumulatedPatterns.find(
              (p) => p.patternId === analysis.mergeWithPatternId
            )

            if (targetPattern) {
              targetPattern.photoCount += clusterSize
              targetPattern.percentage += cluster.percentage
              targetPattern.mergedClusterIds.push(`cluster_${cluster.cluster_id}`)

              // Usar las fotos representativas del LLM si están disponibles
              let photosToConsider: any[] = samplePhotos
              if (
                analysis.representativePhotoIds &&
                Array.isArray(analysis.representativePhotoIds)
              ) {
                const repIds = analysis.representativePhotoIds.map((id: any) =>
                  parseInt(String(id))
                )
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
                .slice(0, Math.max(0, 8 - targetPattern.samplePhotos.length))

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
              continue // No crear nuevo patrón
            }
          }

          // CREATE NEW pattern (si no hubo merge o si el merge falló)
          let representativePhotos: any[] = []
          if (analysis.representativePhotoIds && Array.isArray(analysis.representativePhotoIds)) {
            const repIds = analysis.representativePhotoIds.map((id: any) => parseInt(String(id)))
            representativePhotos = repIds.map((id: number) => photoMapObject[id]).filter(Boolean)
          }
          if (representativePhotos.length === 0) {
            representativePhotos = samplePhotos.slice(0, 4)
          }

          const pattern: ClusterPattern = {
            patternId: `pattern_new_${patterns.length + 1}`,
            patternType: analysis.patternType || 'NA',
            title: analysis.title || `Pattern ${patterns.length + 1}`,
            description: analysis.description || 'No description available',
            photoCount: clusterSize,
            percentage: cluster.percentage,
            strength: this.calculatePatternStrength(cluster.percentage),
            samplePhotos: representativePhotos.map(createSamplePhoto),
          }

          patterns.push(pattern)
          console.log(`✨ Nuevo patrón creado: "${pattern.title}"`)
        } else {
          // PRIMER BUILD: Usar prompt original sin patrones previos
          const { systemPrompt, userMessage, needsImages } = this.generateClusterPrompt(
            samplePhotos,
            reviewType
          )

          // Preparar imágenes si es necesario
          const imagesForLLM = needsImages
            ? samplePhotos.map((photo) => ({
                photo: { id: photo.id, name: photo.name },
                base64: '',
              }))
            : undefined

          llmResponse = await this.getLLMResponseWithRetry({
            contextLabel: `portfolioReview.independent.${needsImages ? 'withImages' : 'textOnly'}.cluster_${cluster.cluster_id}`,
            systemPrompt,
            userMessages: [userMessage],
            model: mainModel,
            retryModel: retryModel,
            generationConfig: { temperature: 0.7, responseType: 'json_object' },
            useCache: !needsImages,
            validateResult: (r: any) => this.isValidIndependentPatternResult(r),
            fallbackResult: {
              title: `Pattern ${cluster.cluster_id + 1}`,
              description: 'No description available',
              strength: 'moderate',
            },
            images: imagesForLLM,
          })

          if (llmResponse?.cost?.totalCostInEur) {
            totalCostInEur += llmResponse.cost.totalCostInEur
          }

          analysis = llmResponse?.result

          if (!analysis || typeof analysis !== 'object') {
            analysis = {
              title: `Pattern ${cluster.cluster_id + 1}`,
              description: 'No description available',
              strength: 'moderate',
            }
          }

          let representativePhotos: any[] = []
          if (analysis.representativePhotoIds && Array.isArray(analysis.representativePhotoIds)) {
            const repIds = analysis.representativePhotoIds.map((id: any) => parseInt(String(id)))
            representativePhotos = repIds.map((id: number) => photoMapObject[id]).filter(Boolean)
          }
          if (representativePhotos.length === 0) {
            representativePhotos = samplePhotos.slice(0, 4)
          }

          const pattern: ClusterPattern = {
            patternId: `cluster_${cluster.cluster_id}`,
            patternType: analysis.patternType || 'NA',
            title: analysis.title || `Pattern ${cluster.cluster_id + 1}`,
            description: analysis.description || 'No description available',
            photoCount: clusterSize,
            percentage: cluster.percentage,
            strength: this.calculatePatternStrength(cluster.percentage),
            samplePhotos: representativePhotos.map(createSamplePhoto),
          }

          patterns.push(pattern)
        }
      }

      // Agregar patrones previos que recibieron merges (con photoCount > 0)
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
            samplePhotos: p.samplePhotos.slice(0, 4),
          })
        } else {
          console.log(`⚠️ Patrón previo "${p.title}" eliminado por no recibir ningún merge`)
        }
      }
    }

    // Ordenar por porcentaje (más prominentes primero)
    patterns.sort((a, b) => b.percentage - a.percentage)

    return {
      patterns,
      metadata: {
        totalPhotos,
        clustersFound: clusters.length,
        patternsIdentified: patterns.length,
        clustersMerged: actualUseProgressiveFusion ? clusters.length - patterns.length : 0,
        reviewType,
        fusionMode: actualUseProgressiveFusion ? 'progressive' : 'independent',
      },
      cost: {
        totalCostInEur,
      },
    }
  }
}
