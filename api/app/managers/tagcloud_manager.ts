import db from '@adonisjs/lucid/services/db'
import ModelsService from '#services/models_service'
import { withCache } from '../decorators/withCache.js'

export default class TagCloudManager {
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
   * Obtiene los tags del usuario con coordenadas 2D basadas en el embedding del tag.
   * Cada tag corresponde a un Tag distinto que aparece en al menos una foto del usuario,
   * y se posiciona mediante reducción dimensional (UMAP) para formar clusters
   * de proximidad semántica.
   */
  @withCache({
    provider: 'redis',
    key: (userId, outputDims, minPhotoCount, limit) =>
      `getTagCloud:${userId}:${outputDims}:${minPhotoCount}:${limit}`,
    ttl: 1_209_600, // 2 weeks — fallback expiry if manual invalidation is skipped
  })
  public async getTagCloud(
    userId: string,
    outputDims: number = 2,
    minPhotoCount: number = 1,
    limit: number = 8000
  ) {
    // Recuperamos cada Tag único asociado al usuario (a través de tags_photos -> photos)
    // junto con cuántas tag_photo lo referencian (popularidad para escalar el tamaño).
    // Filtramos por popularidad mínima y limitamos a top-N para visualizaciones manejables.
    const tagsResult = await db.rawQuery(
      `
      SELECT
        t.id,
        t.name,
        t.group,
        t.embedding,
        COUNT(tp.id)::int AS photo_count
      FROM tags t
      JOIN tags_photos tp ON tp.tag_id = t.id
      JOIN photos p ON p.id = tp.photo_id
      WHERE p.user_id = :userId
        AND p.deleted_at IS NULL
        AND t.embedding IS NOT NULL
      GROUP BY t.id, t.name, t.group, t.embedding
      HAVING COUNT(tp.id) >= :minPhotoCount
      ORDER BY COUNT(tp.id) DESC
      LIMIT :limit
      `,
      {
        userId: parseInt(userId),
        minPhotoCount,
        limit,
      }
    )

    const tags = tagsResult.rows

    if (tags.length === 0) {
      return {
        tags: [],
        metadata: {
          message: 'No se encontraron tags con embeddings para este usuario',
          vectorCount: 0,
        },
      }
    }

    // Construir vectores válidos
    const vectors = tags
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        group: t.group,
        photoCount: t.photo_count,
        embedding: this.parseVectorField(t.embedding),
      }))
      .filter((v: any) => v.embedding && v.embedding.length > 0)

    if (vectors.length === 0) {
      return {
        tags: [],
        metadata: {
          message: 'No se encontraron embeddings válidos',
          vectorCount: 0,
        },
      }
    }

    // Si hay muy pocos puntos UMAP fallaría; devolvemos coords sintéticas en círculo.
    if (vectors.length < 5) {
      const radius = 5
      const finalTags = vectors.map((v: any, idx: number) => {
        const angle = (idx / vectors.length) * Math.PI * 2
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        const coordinates = outputDims === 2 ? [x, y] : [x, y, 0]
        return {
          id: v.id,
          name: v.name,
          group: v.group,
          photoCount: v.photoCount,
          coordinates,
        }
      })
      return {
        tags: finalTags,
        metadata: {
          vectorCount: finalTags.length,
          reducedCount: finalTags.length,
          fallback: 'too_few_points',
        },
      }
    }

    const modelsService = new ModelsService()

    const payload = {
      chunkName: 'tag_embeddings',
      userId,
      method: 'umap',
      umap_n_neighbors: Math.min(30, Math.max(2, vectors.length - 1)),
      // Inflamos los clusters para reducir el apelotonamiento visual:
      // min_dist alto => puntos vecinos no se solapan tanto
      // spread alto   => clusters más separados entre sí
      umap_min_dist: 1.2,
      umap_spread: 18.0,
      output_dims: outputDims,
      umap_metric: 'cosine',
      random_state: 42,
      items: vectors.map((v: any) => ({
        id: v.id.toString(),
        embedding: v.embedding,
      })),
    }

    const reductionResult = await modelsService.getReducedEmbeddings(payload)
    const reducedVectors = reductionResult.items || []

    const tagMap = new Map<number, any>()
    vectors.forEach((v: any) => tagMap.set(v.id, v))

    const finalTags = reducedVectors
      .map((reduced: any) => {
        const tag = tagMap.get(parseInt(reduced.id))
        if (!tag) return null

        let coordinates = reduced.embedding_3d
        if (outputDims === 2 && Array.isArray(coordinates) && coordinates.length === 2) {
          // mantener 2D
        } else if (outputDims === 2 && Array.isArray(coordinates) && coordinates.length === 3) {
          coordinates = [coordinates[0], coordinates[1]]
        }

        return {
          id: tag.id,
          name: tag.name,
          group: tag.group,
          photoCount: tag.photoCount,
          coordinates,
        }
      })
      .filter(Boolean)

    return {
      tags: finalTags,
      metadata: {
        vectorCount: vectors.length,
        reducedCount: finalTags.length,
      },
    }
  }
}
