import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Conversation from './conversation.js'

export type MessageRole = 'user' | 'assistant'

export interface PhotoGroup {
  label: string
  photoIds: number[]
  /** id (as string) → "filename — context". Only populated for LLM history; stripped before sending to frontend. */
  photoDescriptions?: Record<string, string>
}

export default class ConversationMessage extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare role: MessageRole

  @column()
  declare content: string

  @column({
    prepare: (value: number[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | number[] | null) =>
      typeof value === 'string' ? JSON.parse(value) : (value ?? null),
  })
  declare contextPhotoIds: number[] | null

  @column({
    prepare: (value: PhotoGroup[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | PhotoGroup[] | null) =>
      typeof value === 'string' ? JSON.parse(value) : (value ?? null),
  })
  declare photoGroups: PhotoGroup[] | null

  @column()
  declare isError: boolean

  @column()
  declare costEur: number | null

  @column({
    prepare: (value: Record<string, any>) => (value ? JSON.stringify(value) : '{}'),
    consume: (value: string | Record<string, any> | null) =>
      typeof value === 'string' ? JSON.parse(value) : (value ?? {}),
  })
  declare metadata: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => Conversation)
  declare conversation: BelongsTo<typeof Conversation>
}
