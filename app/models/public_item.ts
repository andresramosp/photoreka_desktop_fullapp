import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export type PublicItemType = 'portfolio' | 'series'

export default class PublicItem extends BaseModel {
  static table = 'public_items'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare itemType: PublicItemType

  @column()
  declare itemId: number

  @column()
  declare slug: string

  @column()
  declare sortOrder: number

  /**
   * width/height ratio per photo id, measured by the publisher's browser. Only a
   * hint: the public grid re-measures on load and corrects a stale entry.
   */
  @column()
  declare aspectRatios: Record<string, number> | null

  @column.dateTime()
  declare publishedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
