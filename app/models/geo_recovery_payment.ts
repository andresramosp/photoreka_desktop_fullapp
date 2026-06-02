import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type GeoRecoveryPaymentStatus = 'pending' | 'completed' | 'failed'

export default class GeoRecoveryPayment extends BaseModel {
  static table = 'geo_recovery_payments'

  @column({ isPrimary: true })
  declare id: number

  /** The Redis geo-recovery session ID */
  @column()
  declare sessionId: string

  @column()
  declare stripeSessionId: string | null

  @column()
  declare stripePaymentIntentId: string | null

  @column()
  declare stripeCustomerId: string | null

  /** Email entered by the buyer during Stripe Checkout — for refund traceability. */
  @column()
  declare customerEmail: string | null

  @column()
  declare photoCount: number

  @column()
  declare amountEur: number

  @column()
  declare status: GeoRecoveryPaymentStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
