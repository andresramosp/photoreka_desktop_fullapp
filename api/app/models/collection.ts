import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany, belongsTo } from '@adonisjs/lucid/orm'
import type { ManyToMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Photo from './photo.js'
import CollectionSet from './collection_set.js'

export default class Collection extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare setId: number | null

  @column()
  declare name: string

  @column()
  declare description: string | null

  /**
   * Hierarchical folder path identifier used to dedupe collections that
   * mirror an external folder structure (e.g. Lightroom catalog folders).
   * Stored as an array of folder names from root to leaf, e.g.
   * ['2026', 'cliente1']. `null` for collections created manually by the user.
   */
  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: any) => {
      if (!value) return null
      if (Array.isArray(value)) return value
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    },
  })
  declare sourceFolderPath: string[] | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => CollectionSet, { foreignKey: 'setId' })
  declare set: BelongsTo<typeof CollectionSet>

  @manyToMany(() => Photo, {
    pivotTable: 'collection_photos',
    localKey: 'id',
    pivotForeignKey: 'collection_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'photo_id',
  })
  declare photos: ManyToMany<typeof Photo>
}
