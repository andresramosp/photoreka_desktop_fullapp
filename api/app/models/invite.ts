import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { UsageTier } from '#services/usage_service'

export default class Invite extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column()
  declare tier: UsageTier

  @column()
  declare maxUses: number

  @column()
  declare useCount: number

  @column.dateTime()
  declare usedAt: DateTime | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get isUsed() {
    return this.useCount >= this.maxUses
  }

  get isValid() {
    return this.useCount < this.maxUses
  }
}
