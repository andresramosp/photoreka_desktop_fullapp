import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import type { CostCategory } from '../utils/cost_tracker.js'

export default class CostLog extends BaseModel {
  static table = 'cost_logs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare category: CostCategory

  @column()
  declare costInEur: number

  @column()
  declare calls: number

  @column()
  declare model: string | null

  @column()
  declare task: string | null

  @column()
  declare referenceId: string | null

  @column()
  declare metadata: Record<string, any> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
