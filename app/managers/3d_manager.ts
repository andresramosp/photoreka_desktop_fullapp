import db from '@adonisjs/lucid/services/db'
import ModelsService from '#services/models_service'
import PhotoManager from './photo_manager.js'
import { withCache } from '../decorators/withCache.js'

export default class ThreeDManager {
  private parseVectorField(value: unknown): number[] | null {
    if (!value) return null
    if (Array.isArray(value)) return value as number[]

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as number[]
      } catch {
        return null
      }
    }

    return null
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

    // Sumar todos los embeddings
    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        combined[i] += embedding[i]
      }
    }

    // Calcular promedio
    for (let i = 0; i < dimensions; i++) {
      combined[i] = combined[i] / embeddings.length
    }

    return combined
  }

  /**
   * Obtiene fotos con coordenadas 3D basadas en un chunk de descripción
   * @param userId - ID del usuario
   * @param chunkName - Nombre de la categoría de chunk
   * @param fakeLimit - Límite de fotos (default 5000)
   * @returns Array de fotos con coordenadas 3D
   */

  @withCache({
    provider: 'redis',
    key: (userId, chunkName, fakeLimit, outputDims) =>
      `get3DPhotos:${userId}:${chunkName}:${fakeLimit}:${outputDims}`,
    ttl: 1_209_600, // 2 weeks — fallback expiry if manual invalidation is skipped
  })
  public async get3DPhotos(
    userId: string,
    chunkName: string,
    fakeLimit: number = 10000,
    outputDims: number = 3
  ) {
    let photosWithCategory

    // Caso especial: si chunkName es null, usar embeddings de la tabla photos
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
        {
          userId: parseInt(userId),
        }
      )
    } else if (chunkName === 'artistic_scores') {
      // Caso especial: usar el embedding computado de artistic_scores
      const photoManager = new PhotoManager()
      const photosFromDb = await photoManager.getPhotosFor3DView(userId, 'artistic_scores')

      // Convertir a formato compatible con el resto del código
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

      // Convertir a formato compatible con el resto del código
      photosWithCategory = {
        rows: photosFromDb.map((photo) => ({
          id: photo.id,
          name: photo.name,
          thumbnail_name: photo.thumbnailName,
          original_file_name: photo.originalFileName,
          visual_aspects_embedding_computed: photo.visualAspectsEmbeddingComputed,
        })),
      }
    } else if (chunkName === 'color_histogram' || chunkName === 'color_histogram_dominant') {
      const histogramField =
        chunkName === 'color_histogram_dominant' ? 'color_histogram_dominant' : 'color_histogram'

      photosWithCategory = await db.rawQuery(
        `
        SELECT 
          p.id,
          p.name,
          p.thumbnail_name,
          p.original_file_name,
          p.${histogramField} AS color_histogram
        FROM photos p
        WHERE p.user_id = :userId
          AND p.${histogramField} IS NOT NULL
          AND p.deleted_at IS NULL
        ORDER BY p.id
      `,
        {
          userId: parseInt(userId),
        }
      )
    } else {
      // Validación para cuando chunkName no es null
      if (!chunkName) {
        throw new Error('El parámetro chunkName es requerido')
      }

      // Obtener las fotos únicas que tienen chunks de esta categoría
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
          AND p.deleted_at IS NULL
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
      return {
        photos: [],
        metadata: {
          chunkName,
          message: 'No se encontraron fotos con embeddings para esta categoría',
        },
      }
    }

    let vectors

    // Caso especial: si chunkName es null, usar embeddings directos de las fotos
    if (chunkName === 'general') {
      vectors = photos
        .map((photo: any) => {
          const embedding = photo.embedding ? JSON.parse(photo.embedding as string) : null

          return {
            id: photo.id,
            chunkId: null, // No hay chunk específico
            embedding,
            photoData: {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunk: null, // No hay chunk de descripción
            },
          }
        })
        .filter((v: any) => v.embedding && v.embedding.length > 0)
    } else if (chunkName === 'artistic_scores') {
      // Caso especial: usar embeddings de artistic_scores_embedding_computed
      vectors = photos
        .map((photo: any) => {
          const embedding = photo.artistic_scores_embedding_computed

          return {
            id: photo.id,
            chunkId: null, // No hay chunk específico
            embedding,
            photoData: {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunk: null, // No hay chunk de descripción
            },
          }
        })
        .filter((v: any) => v.embedding && v.embedding.length > 0)
    } else if (chunkName === 'visual_aspects') {
      // Caso especial: usar embeddings de visual_aspects_embedding_computed
      vectors = photos
        .map((photo: any) => {
          const embedding = photo.visual_aspects_embedding_computed

          return {
            id: photo.id,
            chunkId: null, // No hay chunk específico
            embedding,
            photoData: {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunk: null, // No hay chunk de descripción
            },
          }
        })
        .filter((v: any) => v.embedding && v.embedding.length > 0)
    } else if (chunkName === 'color_histogram' || chunkName === 'color_histogram_dominant') {
      vectors = photos
        .map((photo: any) => {
          const embedding = this.parseVectorField(photo.color_histogram)

          return {
            id: photo.id,
            chunkId: null,
            embedding,
            photoData: {
              id: photo.id,
              name: photo.name,
              thumbnailName: photo.thumbnail_name,
              originalFileName: photo.original_file_name,
              chunk: null,
            },
          }
        })
        .filter((v: any) => v.embedding && v.embedding.length > 0)
    } else {
      // Obtener los chunks específicos de las fotos paginadas
      const photoIds = photos.map((p: any) => p.id)
      const chunksResult = await db.rawQuery(
        `
        SELECT 
          dc.id as chunk_id,
          dc.photo_id,
          dc.chunk,
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

      // Agrupar chunks por foto_id y combinar sus embeddings
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

        // Buscar la información de la foto correspondiente
        const photoInfo = photos.find((p: any) => p.id === photoId)

        // Combinar todos los chunks en un solo texto para mostrar
        const combinedChunkText = photoChunks.map((chunk: any) => chunk.chunk).join(' | ')

        vectors.push({
          id: photoId,
          chunkId: null, // Ya no es relevante porque combinamos todos
          embedding: combinedEmbedding,
          photoData: {
            id: photoId,
            name: photoInfo?.name,
            thumbnailName: photoInfo?.thumbnail_name,
            originalFileName: photoInfo?.original_file_name,
            chunk: combinedChunkText,
          },
        })
      }
    }

    if (vectors.length === 0) {
      return {
        photos: [],
        metadata: {
          chunkName,
          message: 'No se encontraron embeddings válidos',
        },
      }
    }

    // Aplicar reducción dimensional
    const modelsService = new ModelsService()

    // Preparar payload para el nuevo endpoint
    const payload = {
      chunkName, // Para la cache key
      userId, // Para la cache key
      method: 'umap',
      umap_n_neighbors: 20,
      umap_min_dist: 1, // Sube este valor para inflar los grupúsculos
      umap_spread: 10.0, // Sube este valor para separar más los grupos
      output_dims: outputDims,
      umap_metric: 'cosine',
      random_state: 42,

      // method: 'pca_tsne',
      // n_components: 3,
      // perplexity: 5, // más bajo para más grupúsculos
      // metric: 'cosine',
      // learning_rate: 50, // más bajo para agrupamientos más definidos
      // n_iter: 2500, // más iteraciones para mejor separación
      // init: 'random', // prueba también con 'pca'
      // random_state: 42,
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),
    }

    const reductionResult = await modelsService.getReducedEmbeddings(payload)
    const reducedVectors = reductionResult.items || []

    // Crear mapa para un acceso rápido a los datos de las fotos
    const photosMap = new Map()
    vectors.forEach((vector: any) => {
      photosMap.set(vector.id, vector.photoData)
    })

    // Mapear resultados con información de fotos
    // Obtener descriptions para cada foto y filtrar propiedades
    const photoIdsForDescriptions = reducedVectors.map((reduced: any) => parseInt(reduced.id))
    let descriptionsMap = new Map()
    if (photoIdsForDescriptions.length > 0) {
      const descriptionsResult = await db.rawQuery(
        `SELECT id, descriptions FROM photos WHERE id = ANY(:photoIds) AND deleted_at IS NULL`,
        { photoIds: photoIdsForDescriptions }
      )
      descriptionsResult.rows.forEach((row: any) => {
        let filtered: any = {}
        if (row.descriptions) {
          try {
            const desc =
              typeof row.descriptions === 'string' ? JSON.parse(row.descriptions) : row.descriptions
            if ('visual_aspects' in desc) filtered.visual_aspects = desc.visual_aspects
            if ('artistic_scores' in desc) filtered.artistic_scores = desc.artistic_scores
            if ('EXIF' in desc) filtered.EXIF = desc.EXIF
          } catch {}
        }
        descriptionsMap.set(row.id, filtered)
      })
    }

    // Obtener tags filtrados para cada foto
    let tagsMap = new Map()
    if (photoIdsForDescriptions.length > 0) {
      const tagsResult = await db.rawQuery(
        `
        SELECT 
          tp.photo_id,
          tp.id as tag_photo_id,
          tp.category,
          tp.area,
          t.id as tag_id,
          t.name as tag_name, 
          t.group as tag_group
        FROM tags_photos tp
        JOIN tags t ON tp.tag_id = t.id
        WHERE tp.photo_id = ANY(:photoIds)
          AND tp.category IN ('context_story', 'visual_accents')
          AND t.group IN (  'person','animals','objects','toponym', 'symbols','abstract concept', 'environment' )
        ORDER BY tp.photo_id, tp.id
      `,
        { photoIds: photoIdsForDescriptions }
      )

      // Agrupar tags por photo_id
      tagsResult.rows.forEach((row: any) => {
        if (!tagsMap.has(row.photo_id)) {
          tagsMap.set(row.photo_id, [])
        }
        tagsMap.get(row.photo_id).push({
          id: row.tag_photo_id,
          category: row.category,
          area: row.area,
          name: row.tag_name,
          group: row.tag_group,
        })
      })
    }

    const photos3D = reducedVectors
      .map((reduced: any) => {
        const photoData = photosMap.get(parseInt(reduced.id))
        if (!photoData) return null
        const descriptions = descriptionsMap.get(photoData.id) || {}
        const tags = tagsMap.get(photoData.id) || []

        // Completar la tercera coordenada con 0 si outputDims === 2
        let coordinates = reduced.embedding_3d
        if (outputDims === 2 && Array.isArray(coordinates) && coordinates.length === 2) {
          coordinates = [...coordinates, 0]
        }

        return {
          id: photoData.id,
          originalFileName: photoData.originalFileName,
          thumbnailUrl: `https://${process.env.IMAGES_WORKER}/${photoData.thumbnailName}`,
          chunk: photoData.chunk,
          coordinates,
          descriptions,
          tags,
        }
      })
      .filter(Boolean)

    // Aplicar límite temporal para pruebas
    const finalPhotos = photos3D.slice(0, fakeLimit)

    return {
      photos: finalPhotos,
      metadata: {
        chunkName,
        vectorCount: finalPhotos.length,
        reducedCount: finalPhotos.length,
      },
    }
  }

  /**
   * Obtiene las categorías disponibles de chunks para un usuario
   * @param userId - ID del usuario
   * @returns Array de categorías con su conteo
   */
  public async getAvailableCategories(userId: string) {
    const specialCategoriesResult = await db.rawQuery(
      `
      SELECT 'general' AS category, COUNT(*)::int AS count
      FROM photos
      WHERE user_id = :userId
        AND embedding IS NOT NULL
        AND deleted_at IS NULL

      UNION ALL

      SELECT 'color_histogram' AS category, COUNT(*)::int AS count
      FROM photos
      WHERE user_id = :userId
        AND color_histogram IS NOT NULL
        AND deleted_at IS NULL

      UNION ALL

      SELECT 'color_histogram_dominant' AS category, COUNT(*)::int AS count
      FROM photos
      WHERE user_id = :userId
        AND color_histogram_dominant IS NOT NULL
        AND deleted_at IS NULL
    `,
      {
        userId: parseInt(userId),
      }
    )

    const categoriesResult = await db.rawQuery(
      `
      SELECT 
        dc.category,
        COUNT(*) as count
      FROM descriptions_chunks dc
      JOIN photos p ON dc.photo_id = p.id
      WHERE p.user_id = :userId
        AND dc.embedding IS NOT NULL
        AND p.deleted_at IS NULL
      GROUP BY dc.category
      ORDER BY count DESC
    `,
      {
        userId: parseInt(userId),
      }
    )

    const merged = [...specialCategoriesResult.rows, ...categoriesResult.rows]
    const categories = merged
      .map((row: any) => ({
        category: row.category,
        count: typeof row.count === 'number' ? row.count : parseInt(row.count),
      }))
      .filter((row: any) => row.count > 0)
      .sort((a: any, b: any) => b.count - a.count)

    return {
      categories,
      totalCategories: categories.length,
    }
  }
}
