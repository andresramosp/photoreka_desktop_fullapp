import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export type ActivityType =
  // Auth
  | 'login'
  | 'register'
  // Search
  | 'search_semantic'
  | 'search_tags'
  | 'search_visual'
  // Chat
  | 'chat_message'
  // Photos
  | 'photos_uploaded'
  | 'photo_analyze'
  | 'photo_delete'
  | 'photo_download'
  | 'photo_duplicates'
  | 'photo_insight'
  | 'photo_swap'
  | 'photo_note'
  // Collections
  | 'collection_create'
  | 'collection_update'
  | 'collection_delete'
  | 'collection_add_photos'
  | 'collection_remove_photos'
  // Series
  | 'series_create'
  | 'series_update'
  | 'series_delete'
  | 'series_add_photos'
  | 'series_remove_photos'
  // Portfolio & Visualization
  | 'portfolio_build'
  | 'report_build'
  | 'view_3d'
  // Embeddings
  | 'generate_embeddings'
  // Canvas
  | 'canvas_create'
  | 'canvas_delete'

export default class UserActivity extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare type: ActivityType

  @column()
  declare action: string

  @column()
  declare description: string | null

  @column()
  declare metadata: Record<string, any> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
