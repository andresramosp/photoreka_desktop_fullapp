import db from '@adonisjs/lucid/services/db'
import ModelsService from '#services/models_service'
import PhotoManager from './photo_manager.js'
import { withCache } from '../decorators/withCache.js'
import {
  PROMPT_PORTFOLIO_NARRATIVE_PATTERN,
  PROMPT_PORTFOLIO_CONTEXTUAL_PATTERN,
  PROMPT_PORTFOLIO_GENERAL_PATTERN,
  PROMPT_PORTFOLIO_AESTHETIC_PATTERN,
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
   */
  private generateClusterPrompt(
    samplePhotos: any[],
    reviewType: ReviewType
  ): { systemPrompt: string; userMessage: string } {
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
      // Para general y otros casos
      const photosList = samplePhotos
        .map((photo, idx) => `Photo ${idx + 1}: ${photo.originalFileName}`)
        .join('\n')

      return PROMPT_PORTFOLIO_GENERAL_PATTERN(photosList, samplePhotos.length)
    }
  }

  /**
   * Método principal: Obtiene patrones del portfolio según el tipo de review
   */
  // @withCache({
  //   ttl: 60 * 60 * 2, // Cache por 2 horas
  //   provider: 'redis',
  //   key: (userId, reviewType) => `portfolioReview:${reviewType}:${userId}`,
  // })
  public async getPatterns(userId: string, reviewType: ReviewType = 'general') {
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

    // FASE 2: Clustering en espacio de alta dimensión
    const clusterPayload = {
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),
      //   method: 'hdbscan',
      //   min_cluster_size: Math.max(15, Math.floor(vectors.length * 0.05)), // Al menos 5% del portfolio o 15 fotos
      //   metric: 'cosine',

      //   method: 'hdbscan',
      //   min_cluster_size: 5,
      //   min_samples: 3,
      //   metric: 'cosine',
      //   pca_components: 5,

      method: 'hdbscan',
      max_clusters: 12,
      min_cluster_size: 5, // Valor clave para controlar numero de clusters
      min_samples: 3,
      dim_reduction_method: 'umap',
      umap_n_components: 15,
      umap_n_neighbors: 30,
      umap_min_dist: 0.0,
      umap_spread: 1.0,
      umap_metric: 'cosine',
      // cluster_selection_epsilon: 0.1, // si no vale un valor global, usarlo para iterar e ir reduciendo numero de clusters

      // cluster_selection_epsilon: 0.1,
      // umap_n_components: 20,
      // umap_n_neighbors: 20,
      // umap_min_dist: 0.5,
      // umap_spread: 5.0,
      // umap_metric: 'cosine',
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

    // FASE 3 & 4: Muestreo inteligente y análisis con LLM
    const patterns: ClusterPattern[] = []
    const totalPhotos = vectors.length

    for (const cluster of clusters) {
      // Calcular tamaño de muestra (entre 5 y 15 fotos)
      const clusterSize = cluster.size
      const sampleSize = Math.min(15, Math.max(5, Math.floor(clusterSize * 0.1)))

      // Obtener muestra representativa
      const samplePhotoIds = this.sampleCluster(cluster, sampleSize)
      const samplePhotos = samplePhotoIds.map((id) => photoMapObject[id]).filter(Boolean)

      // Generar prompt y llamar al LLM
      const { systemPrompt, userMessage } = this.generateClusterPrompt(samplePhotos, reviewType)

      const llmResponse = await this.modelsService.getGeminiResponse(
        systemPrompt,
        [userMessage],
        'gemini-2.5-flash-lite',
        { temperature: 0.7, responseType: 'json_object' },
        true
      )

      const analysis = llmResponse.result

      // Construir el patrón
      const chunkName = REVIEW_TYPE_TO_CHUNK[reviewType]
      const pattern: ClusterPattern = {
        patternId: `cluster_${cluster.cluster_id}`,
        title: analysis.title || `Pattern ${cluster.cluster_id + 1}`,
        description: analysis.description || 'No description available',
        photoCount: clusterSize,
        percentage: cluster.percentage, // Porcentaje calculado por Python
        strength: analysis.strength || 'moderate',
        samplePhotos: samplePhotos.slice(0, 5).map((photo) => ({
          id: photo.id,
          thumbnailUrl: `https://pub-${process.env.R2_PUBLIC_ID}.r2.dev/${photo.thumbnailName}`,
          description:
            chunkName === 'story' || chunkName === 'context'
              ? photo.chunks
                  .filter((c: any) => c.category === chunkName)
                  .map((c: any) => c.chunk)
                  .join(' ') || 'No description'
              : photo.originalFileName || 'No filename',
        })),
      }

      patterns.push(pattern)
    }

    // Ordenar por porcentaje (más prominentes primero)
    patterns.sort((a, b) => b.percentage - a.percentage)

    return {
      patterns,
      metadata: {
        totalPhotos,
        clustersFound: clusters.length,
        patternsIdentified: patterns.length,
        reviewType,
      },
    }
  }
}
