import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import ConversationMessage from './conversation_message.js'

export default class Conversation extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare title: string | null

  @column()
  declare isArchived: boolean

  @column({
    prepare: (value: Record<string, any>) => (value ? JSON.stringify(value) : '{}'),
    consume: (value: string | Record<string, any> | null) =>
      typeof value === 'string' ? JSON.parse(value) : (value ?? {}),
  })
  declare metadata: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => ConversationMessage)
  declare messages: HasMany<typeof ConversationMessage>
}
