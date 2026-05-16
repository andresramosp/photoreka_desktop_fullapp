import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Series from './series.js'

export default class SeriesSet extends BaseModel {
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

  @belongsTo(() => SeriesSet, { foreignKey: 'parentSetId' })
  declare parentSet: BelongsTo<typeof SeriesSet>

  @hasMany(() => SeriesSet, { foreignKey: 'parentSetId' })
  declare childSets: HasMany<typeof SeriesSet>

  @hasMany(() => Series, { foreignKey: 'setId' })
  declare series: HasMany<typeof Series>
}
