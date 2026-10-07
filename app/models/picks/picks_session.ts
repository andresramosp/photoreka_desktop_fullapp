import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { PICKS_MAX_PHOTOS } from '#config/picks'

export type PicksSessionStatus = 'open' | 'processing' | 'completed' | 'failed'

export default class PicksSession extends BaseModel {
  static table = 'picks_sessions'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare status: PicksSessionStatus

  @column()
  declare orderedCount: number

  @column()
  declare paidCount: number | null

  @column()
  declare isFree: boolean

  @column()
  declare customerEmail: string | null

  @column.dateTime()
  declare paidAt: DateTime | null

  @column.dateTime()
  declare uploadCompletedAt: DateTime | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime()
  declare emailSentAt: DateTime | null

  @column()
  declare error: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * How many photos this session may hold. Before payment the browser keeps
   * uploading while the buyer adds photos and re-quotes, so only the product
   * limit applies; the judge never goes past the paid count anyway.
   */
  get photoCap(): number {
    return this.paidCount ?? PICKS_MAX_PHOTOS
  }
}
