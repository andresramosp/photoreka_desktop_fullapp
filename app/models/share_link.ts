import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export type ShareResourceType = 'series' | 'collection' | 'atlas_3d' | 'atlas_2d'

export default class ShareLink extends BaseModel {
  static table = 'share_links'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare resourceType: ShareResourceType

  @column()
  declare resourceId: number | null

  @column()
  declare slug: string

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
