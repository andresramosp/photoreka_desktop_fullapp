import db from '@adonisjs/lucid/services/db'
import { photoThumbnailUrl } from '#models/photo'

/**
 * Pertenencia foto↔colección resuelta en SQL plano.
 *
 * El listado de colecciones y el de sets sólo necesitan tres cosas de las fotos:
 * cuántas hay, qué ids contiene cada colección y las 2-3 miniaturas que pinta la
 * card. Hidratarlas como modelos Lucid (`preload('photos')`) costaba un modelo por
 * fila de pivote — 56k modelos para un catálogo con 1.000 colecciones — y todos
 * menos tres por colección se tiraban acto seguido.
 *
 * Las consultas replican el scope del hook `@beforeFetch` de Photo: fuera borradas
 * y fuera subidas sin confirmar.
 */

export interface CollectionPreviewPhoto {
  id: number
  thumbnailUrl: string
}

export const DEFAULT_PREVIEW_PHOTOS = 3

export default class CollectionPhotosService {
  private static membershipQuery(userId: number | string, collectionIds?: number[]) {
    const query = db
      .from('collection_photos as cp')
      .join('collections as c', 'c.id', 'cp.collection_id')
      .join('photos as p', 'p.id', 'cp.photo_id')
      .where('c.user_id', userId)
      .whereNull('p.deleted_at')
      .whereRaw('p.confirmed IS NOT FALSE')

    if (collectionIds) {
      query.whereIn('cp.collection_id', collectionIds)
    }

    return query
  }

  /** Ids de foto de cada colección del usuario, indexados por id de colección. */
  static async photoIdsByCollection(
    userId: number | string,
    collectionIds?: number[]
  ): Promise<Map<number, number[]>> {
    const rows = await this.membershipQuery(userId, collectionIds).select(
      'cp.collection_id',
      'cp.photo_id'
    )

    const byCollection = new Map<number, number[]>()
    for (const row of rows) {
      const collectionId = Number(row.collection_id)
      const ids = byCollection.get(collectionId)
      if (ids) {
        ids.push(Number(row.photo_id))
      } else {
        byCollection.set(collectionId, [Number(row.photo_id)])
      }
    }

    return byCollection
  }

  /** Igual que `photoIdsByCollection` pero sin traer las filas: sólo el conteo. */
  static async photoCountsByCollection(
    userId: number | string,
    collectionIds?: number[]
  ): Promise<Map<number, number>> {
    const rows = await this.membershipQuery(userId, collectionIds)
      .select('cp.collection_id')
      .count('* as total')
      .groupBy('cp.collection_id')

    return new Map(rows.map((row: any) => [Number(row.collection_id), Number(row.total)]))
  }

  /**
   * Las `limit` fotos más recientemente añadidas a cada colección, que son las que
   * la card usa como portada. Una sola consulta con `row_number()` en lugar de
   * traer la colección entera para quedarse con las tres primeras.
   */
  static async previewPhotosByCollection(
    userId: number | string,
    collectionIds?: number[],
    limit = DEFAULT_PREVIEW_PHOTOS
  ): Promise<Map<number, CollectionPreviewPhoto[]>> {
    if (collectionIds && collectionIds.length === 0) {
      return new Map()
    }

    const collectionFilter = collectionIds ? 'and cp.collection_id = ANY(:collectionIds)' : ''

    const result = await db.rawQuery(
      `select collection_id, photo_id, thumbnail_name
         from (
           select cp.collection_id,
                  p.id as photo_id,
                  p.thumbnail_name,
                  row_number() over (partition by cp.collection_id order by cp.id desc) as rn
             from collection_photos cp
             join collections c on c.id = cp.collection_id
             join photos p on p.id = cp.photo_id
            where c.user_id = :userId
              ${collectionFilter}
              and p.deleted_at is null
              and p.confirmed is not false
         ) ranked
        where rn <= :limit`,
      { userId, limit, ...(collectionIds ? { collectionIds } : {}) }
    )

    const byCollection = new Map<number, CollectionPreviewPhoto[]>()
    for (const row of result.rows) {
      const collectionId = Number(row.collection_id)
      const photo = { id: Number(row.photo_id), thumbnailUrl: photoThumbnailUrl(row.thumbnail_name) }
      const photos = byCollection.get(collectionId)
      if (photos) {
        photos.push(photo)
      } else {
        byCollection.set(collectionId, [photo])
      }
    }

    return byCollection
  }
}
