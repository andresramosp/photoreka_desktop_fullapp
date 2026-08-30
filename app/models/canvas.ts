import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import db from '@adonisjs/lucid/services/db'
import User from './user.js'

interface CanvasPhotoData {
  id: number
  config: {
    x: number
    y: number
    width: number
    height: number
    opacity: number
    zIndex: number
  }
}

interface CanvasData {
  photos: CanvasPhotoData[]
  discardedPhotos: CanvasPhotoData[]
  currentZIndex: number
}

export default class Canvas extends BaseModel {
  static table = 'canvases'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare name: string

  /**
   * The chat docked to this canvas, or null when it has none yet.
   *
   * The conversation is created archived (`hidden`), so it never shows up in the
   * general history — this column is the only way back to it. Resetting the chat
   * deletes the conversation and puts this back to null.
   */
  @column()
  declare conversationId: number | null

  @column({
    prepare: (value: CanvasData) => JSON.stringify(value),
    consume: (value: string | CanvasData) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare data: CanvasData

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  /**
   * Remove deleted photo IDs from all canvases belonging to a user.
   * Filters both `photos` and `discardedPhotos` arrays inside the JSON `data` column.
   */
  static async removePhotosFromData(userId: number, deletedIds: number[]): Promise<void> {
    if (!deletedIds.length) return

    const pgArray = `ARRAY[${deletedIds.map((id) => Number(id)).join(',')}]`

    await db.rawQuery(
      `UPDATE canvases
       SET data = jsonb_set(
         jsonb_set(
           data,
           '{photos}',
           COALESCE(
             (SELECT jsonb_agg(elem)
              FROM jsonb_array_elements(data->'photos') AS elem
              WHERE (elem->>'id')::int != ALL(${pgArray})),
             '[]'::jsonb
           )
         ),
         '{discardedPhotos}',
         COALESCE(
           (SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(data->'discardedPhotos') AS elem
            WHERE (elem->>'id')::int != ALL(${pgArray})),
           '[]'::jsonb
         )
       )
       WHERE user_id = ?
         AND data IS NOT NULL`,
      [userId]
    )
  }
}
