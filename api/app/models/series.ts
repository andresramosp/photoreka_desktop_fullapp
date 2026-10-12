import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany, belongsTo } from '@adonisjs/lucid/orm'
import type { ManyToMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Photo from './photo.js'
import SeriesSet from './series_set.js'

export default class Series extends BaseModel {
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

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => SeriesSet, { foreignKey: 'setId' })
  declare set: BelongsTo<typeof SeriesSet>

  @manyToMany(() => Photo, {
    pivotTable: 'series_photos',
    localKey: 'id',
    pivotForeignKey: 'series_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'photo_id',
    pivotColumns: ['order'],
    pivotTimestamps: true,
  })
  declare photos: ManyToMany<typeof Photo>
}
