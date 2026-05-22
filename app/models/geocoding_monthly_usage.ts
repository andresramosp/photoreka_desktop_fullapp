import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GeocodingMonthlyUsage extends BaseModel {
  static table = 'geocoding_monthly_usage'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare provider: string

  @column()
  declare yearMonth: string

  @column()
  declare callCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
