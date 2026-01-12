import db from '@adonisjs/lucid/services/db'
import ModelsService from '#services/models_service'
import PhotoManager from './photo_manager.js'
import PhotoImageService from '../services/photo_image_service.js'
import { withCache } from '../decorators/withCache.js'
import {
  PROMPT_PORTFOLIO_NARRATIVE_PATTERN,
  PROMPT_PORTFOLIO_CONTEXTUAL_PATTERN,
  PROMPT_PORTFOLIO_GENERAL_PATTERN_WITH_IMAGES,
  PROMPT_PORTFOLIO_AESTHETIC_PATTERN,
  PROMPT_PORTFOLIO_PROGRESSIVE_FUSION,
} from '../utils/prompts/portfolio_review.js'

export type ReviewType = 'story' | 'context' | 'aesthetic' | 'general' | 'visual_accents'

// Mapeo de ReviewType a chunkName usado en la BD
const REVIEW_TYPE_TO_CHUNK: Record<ReviewType, string> = {
  story: 'story',
  context: 'context',
  visual_accents: 'visual_aspects',
  aesthetic: 'visual_aspects',
  general: 'general', // Usa embeddings CLIP de photos.embedding
}

interface ClusterPattern {
  patternId: string
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
   * Para el caso 'general', devuelve requiresImages: true para indicar que se deben pasar imágenes reales
   */
  private generateClusterPrompt(
    samplePhotos: any[],
    reviewType: ReviewType
  ): { systemPrompt: string; userMessage: string; requiresImages?: boolean } {
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
      const { systemPrompt, userMessage } = PROMPT_PORTFOLIO_GENERAL_PATTERN_WITH_IMAGES(
        samplePhotos.length
      )
      return { systemPrompt, userMessage, requiresImages: true }
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
  ): { systemPrompt: string; userMessage: string } {
    const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]

    // Mapear ReviewType a los tipos del prompt
    const reviewTypeMap: Record<ReviewType, 'narrative' | 'contextual' | 'aesthetic' | 'general'> =
      {
        story: 'narrative',
        context: 'contextual',
        aesthetic: 'aesthetic',
        visual_accents: 'aesthetic',
        general: 'general',
      }

    // Preparar texto de las fotos según el tipo
    let photosText: string
    if (chunkName === 'story' || chunkName === 'context') {
      photosText = samplePhotos
        .map((photo, idx) => {
          const relevantChunks = photo.chunks.filter((c: any) => c.category === chunkName)
          return `Photo ${idx + 1}:
${relevantChunks.length > 0 ? relevantChunks.map((c: any) => c.chunk).join(' ') : 'No description'}`
        })
        .join('\n\n')
    } else {
      photosText = samplePhotos
        .map((photo, idx) => `Photo ${idx + 1}: ${photo.originalFileName}`)
        .join('\n')
    }

    // Preparar resumen de patrones existentes (usando shortDescription para no saturar)
    const existingPatternsSummary = existingPatterns.map((p) => ({
      patternId: p.patternId,
      title: p.title,
      shortDescription: p.shortDescription,
    }))

    return PROMPT_PORTFOLIO_PROGRESSIVE_FUSION(
      photosText,
      samplePhotos.length,
      existingPatternsSummary,
      reviewTypeMap[reviewType]
    )
  }

  /**
   * Método principal: Obtiene patrones del portfolio según el tipo de review
   * @param useProgressiveFusion - Si true, usa fusión progresiva con LLM. Si false, genera patrones independientes.
   */
  // @withCache({
  //   ttl: 60 * 60 * 2, // Cache por 2 horas
  //   provider: 'redis',
  //   key: (userId, reviewType) => `portfolioReview:${reviewType}:${userId}`,
  // })
  public async getPatterns(
    userId: string,
    reviewType: ReviewType = 'general',
    useProgressiveFusion: boolean = true
  ) {
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

    const min_cluster_size = Object.keys(photoMapObject).length * 0.008

    // FASE 2: Clustering en espacio de alta dimensión
    const clusterPayload = {
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),

      method: 'hdbscan',
      max_clusters: 20,
      min_cluster_size,
      min_samples: 3,
      dim_reduction_method: 'umap',
      umap_n_components: 15,
      umap_n_neighbors: 30,
      umap_min_dist: 0.0,
      umap_spread: 1.0,
      umap_metric: 'cosine',
    }

    const clusterResult = await this.modelsService.getClusters(clusterPayload)
    const clusters = clusterResult.clusters || []

    if (clusters.length === 0) {
      return {
        patterns: [],
        metadata: {
          totalPhotos: vectors.length,
          message: 'No se encontraron patrones significativos en el portfolio',
        },
      }
    }

    // FASE 3 & 4: Análisis de clusters con LLM
    const accumulatedPatterns: AccumulatedPattern[] = []
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
      thumbnailUrl: `https://images.photoreka.com/${photo.thumbnailName}`,
      description: createPhotoDescription(photo),
    })

    if (useProgressiveFusion) {
      // ============ MODO FUSIÓN PROGRESIVA ============
      // El LLM decide si cada cluster se fusiona con uno existente o crea uno nuevo

      for (const cluster of clusters) {
        const clusterSize = cluster.size
        const sampleSize = Math.min(15, Math.max(5, Math.floor(clusterSize * 0.1)))

        const samplePhotoIds = this.sampleCluster(cluster, sampleSize)
        const samplePhotos = samplePhotoIds.map((id) => photoMapObject[id]).filter(Boolean)
        const allClusterPhotoIds = cluster.photo_ids.map((id: string) => parseInt(id))

        // Generar prompt con contexto de patrones existentes
        const { systemPrompt, userMessage } = this.generateProgressiveFusionPrompt(
          samplePhotos,
          reviewType,
          accumulatedPatterns
        )

        const llmResponse = await this.modelsService.getGeminiResponse(
          systemPrompt,
          [userMessage],
          'gemini-2.5-flash-lite',
          { temperature: 0.7, responseType: 'json_object' },
          true
        )

        const analysis = llmResponse.result

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

            const existingPhotoIds = new Set(targetPattern.allPhotoIds)
            const newPhotosToAdd = samplePhotos
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

            if (targetPattern.photoCount > totalPhotos * 0.2) {
              targetPattern.strength = 'strong'
            } else if (targetPattern.photoCount > totalPhotos * 0.1) {
              targetPattern.strength = 'moderate'
            }
          }
        } else {
          // CREAR nuevo patrón
          const newPattern: AccumulatedPattern = {
            patternId: `pattern_${accumulatedPatterns.length + 1}`,
            title: analysis.title || `Pattern ${accumulatedPatterns.length + 1}`,
            shortDescription:
              analysis.shortDescription || analysis.description?.slice(0, 150) || 'No description',
            description: analysis.description || 'No description available',
            photoCount: clusterSize,
            percentage: cluster.percentage,
            strength: analysis.strength || 'moderate',
            samplePhotos: samplePhotos.slice(0, 5).map(createSamplePhoto),
            mergedClusterIds: [`cluster_${cluster.cluster_id}`],
            allPhotoIds: allClusterPhotoIds,
          }

          accumulatedPatterns.push(newPattern)
        }
      }

      // Convertir AccumulatedPattern a ClusterPattern
      for (const p of accumulatedPatterns) {
        patterns.push({
          patternId: p.patternId,
          title: p.title,
          description: p.description,
          photoCount: p.photoCount,
          percentage: Math.min(100, p.percentage),
          strength: p.strength,
          samplePhotos: p.samplePhotos.slice(0, 5),
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
      // ============ MODO INDEPENDIENTE (sin fusión) ============
      // Cada cluster genera su propio patrón independiente

      for (const cluster of clusters) {
        const clusterSize = cluster.size
        const sampleSize = Math.min(15, Math.max(5, Math.floor(clusterSize * 0.1)))

        const samplePhotoIds = this.sampleCluster(cluster, sampleSize)
        const samplePhotos = samplePhotoIds.map((id) => photoMapObject[id]).filter(Boolean)

        // Generar prompt sin contexto de patrones previos
        const { systemPrompt, userMessage, requiresImages } = this.generateClusterPrompt(
          samplePhotos,
          reviewType
        )

        let llmResponse: any

        if (requiresImages) {
          // Para el caso 'general', obtenemos las imágenes reales y las pasamos al LLM
          const photoImageService = PhotoImageService.getInstance()

          // Crear objetos Photo-like para el servicio de imágenes
          const photosForImages = samplePhotos.map((photo) => ({
            id: photo.id,
            name: photo.name,
          }))

          // Obtener imágenes válidas de R2
          const validImages = await photoImageService.getValidPhotosWithImages(
            photosForImages as any,
            false
          )

          if (validImages.length === 0) {
            console.warn(
              `No se pudieron obtener imágenes para el cluster ${cluster.cluster_id}, saltando...`
            )
            continue
          }

          // Convertir al formato esperado por Gemini (inlineData)
          const images = validImages.map(({ base64 }) => ({
            inlineData: {
              mimeType: 'image/png',
              data: base64,
            },
          }))

          // Llamar a Gemini con las imágenes reales
          llmResponse = await this.modelsService.getGeminiResponse(
            systemPrompt,
            [...images, userMessage],
            'gemini-2.5-flash-lite',
            { temperature: 0.7, responseType: 'json_object' },
            false // No usar cache para evitar problemas con imágenes grandes
          )

          // Limpiar las imágenes de memoria
          images.forEach((img) => (img.inlineData.data = ''))
          images.length = 0
        } else {
          // Para otros tipos, usar solo texto
          llmResponse = await this.modelsService.getGeminiResponse(
            systemPrompt,
            [userMessage],
            'gemini-2.5-flash-lite',
            { temperature: 0.7, responseType: 'json_object' },
            true
          )
        }

        const analysis = llmResponse.result

        const pattern: ClusterPattern = {
          patternId: `cluster_${cluster.cluster_id}`,
          title: analysis.title || `Pattern ${cluster.cluster_id + 1}`,
          description: analysis.description || 'No description available',
          photoCount: clusterSize,
          percentage: cluster.percentage,
          strength: analysis.strength || 'moderate',
          samplePhotos: samplePhotos.slice(0, 5).map(createSamplePhoto),
        }

        patterns.push(pattern)
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
        clustersMerged: useProgressiveFusion ? clusters.length - patterns.length : 0,
        reviewType,
        fusionMode: useProgressiveFusion ? 'progressive' : 'independent',
      },
    }
  }
}
