import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import GeoRecoveryPayment from './geo_recovery_payment.js'
import type { CostCategory } from '../utils/cost_tracker.js'

export default class GeoRecoveryCostLog extends BaseModel {
  static table = 'geo_recovery_cost_logs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare geoRecoveryPaymentId: number

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

  @belongsTo(() => GeoRecoveryPayment)
  declare payment: BelongsTo<typeof GeoRecoveryPayment>
}
