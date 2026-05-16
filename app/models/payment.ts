import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type PaymentType = 'photo_package' | 'credits'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export default class Payment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare userEmailSnapshot: string | null

  @column()
  declare stripeSessionId: string | null

  @column()
  declare stripePaymentIntentId: string | null

  @column()
  declare type: PaymentType

  @column()
  declare packageId: string

  @column()
  declare stripePriceId: string | null

  @column()
  declare stripeProductId: string | null

  @column()
  declare productName: string | null

  @column()
  declare analyzedPhotosGranted: number

  @column()
  declare creditsGranted: number

  @column()
  declare amountEur: number

  @column()
  declare status: PaymentStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
