import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import PortfolioBuild from './portfolio_build.js'

export default class PortfolioBuildSet extends BaseModel {
  static table = 'portfolio_build_sets'

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

  @belongsTo(() => PortfolioBuildSet, { foreignKey: 'parentSetId' })
  declare parentSet: BelongsTo<typeof PortfolioBuildSet>

  @hasMany(() => PortfolioBuildSet, { foreignKey: 'parentSetId' })
  declare childSets: HasMany<typeof PortfolioBuildSet>

  @hasMany(() => PortfolioBuild, { foreignKey: 'setId' })
  declare builds: HasMany<typeof PortfolioBuild>
}
