import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Immutable, insert-only provenance log of every photo upload.
 *
 * Decoupled from `users` / `photos` (no FK cascade) so the record survives
 * account or photo deletion — this is the chain-of-custody evidence that ties
 * an object stored in R2 to the user that uploaded it (CSAM / abuse defense).
 *
 * Never update or delete rows in this table.
 */
export default class UploadAudit extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare photoId: number | null

  @column()
  declare objectKey: string

  @column()
  declare thumbnailKey: string | null

  @column()
  declare originalFileName: string | null

  @column()
  declare contentType: string | null

  @column()
  declare uploadIp: string | null

  @column()
  declare userAgent: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
