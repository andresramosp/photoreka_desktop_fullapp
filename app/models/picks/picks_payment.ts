import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type PicksPaymentStatus = 'pending' | 'completed' | 'failed'

export default class PicksPayment extends BaseModel {
  static table = 'picks_payments'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sessionId: string

  @column()
  declare stripePaymentIntentId: string | null

  @column()
  declare stripeCustomerId: string | null

  @column()
  declare customerEmail: string | null

  @column()
  declare photoCount: number

  @column({ consume: (value) => Number(value) })
  declare amountEur: number

  @column()
  declare status: PicksPaymentStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
