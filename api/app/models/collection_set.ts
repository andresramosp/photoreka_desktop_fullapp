import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Collection from './collection.js'

export default class CollectionSet extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare parentSetId: number | null

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

  @belongsTo(() => CollectionSet, { foreignKey: 'parentSetId' })
  declare parentSet: BelongsTo<typeof CollectionSet>

  @hasMany(() => CollectionSet, { foreignKey: 'parentSetId' })
  declare childSets: HasMany<typeof CollectionSet>

  @hasMany(() => Collection, { foreignKey: 'setId' })
  declare collections: HasMany<typeof Collection>
}
