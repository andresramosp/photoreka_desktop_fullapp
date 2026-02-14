import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Invite extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column.dateTime()
  declare usedAt: DateTime | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get isUsed() {
    return !!this.usedAt
  }

  get isValid() {
    return !this.usedAt
  }
}
