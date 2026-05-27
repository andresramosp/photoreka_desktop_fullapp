import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class CacheInvalidationWatermark extends BaseModel {
  static table = 'cache_invalidation_watermarks'
  static primaryKey = 'user_id'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare userId: number

  /** Signed accumulator: +N for analysis, -N for deletions */
  @column()
  declare netDelta: number

  /** Unsigned accumulator: always +=|N| — catches churn that nets to zero */
  @column()
  declare churnDelta: number

  /** Last time expensive caches were actually invalidated */
  @column.dateTime()
  declare lastInvalidatedAt: DateTime | null

  @column.dateTime({ autoCreate: false, autoUpdate: false })
  declare updatedAt: DateTime
}
