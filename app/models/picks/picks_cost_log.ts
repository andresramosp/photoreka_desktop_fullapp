import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type PicksCostTask = 'scores' | 'genres'

export default class PicksCostLog extends BaseModel {
  static table = 'picks_cost_logs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sessionId: string

  @column()
  declare model: string

  @column()
  declare task: PicksCostTask

  @column()
  declare photos: number

  @column({ consume: (value) => Number(value) })
  declare costInEur: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
