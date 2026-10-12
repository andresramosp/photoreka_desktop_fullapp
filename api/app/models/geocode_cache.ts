import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GeocodeCache extends BaseModel {
  static table = 'geocode_cache'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare queryNormalized: string

  @column()
  declare provider: string

  @column()
  declare lat: number

  @column()
  declare lng: number

  @column()
  declare formattedAddress: string

  @column()
  declare placeId: string | null

  @column()
  declare granularity: string | null

  @column()
  declare place: string | null

  @column()
  declare city: string | null

  @column()
  declare region: string | null

  @column()
  declare country: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
