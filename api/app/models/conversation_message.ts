import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Conversation from './conversation.js'

export type MessageRole = 'user' | 'assistant'

/**
 * One photo's board rectangle at the instant a canvas turn was sent, in board coordinates.
 * Persisted so a PAST message can redraw the same 2D crop the composer showed — the agent
 * never sees this (it reads a grid of ids), so no coordinate is ever in front of the model.
 */
export interface CanvasPhotoRect {
  id: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * The canvas context a user turn was asked over, snapshotted onto the message so the reply
 * keeps a reference even after the board's focus moves. Lives inside `metadata.canvasFocus`.
 *
 * A REGION turn carries a `regionCount` instead of ids/geometry: the selection outgrew what
 * the chat can be shown, so no photo travelled and the record is a count.
 */
export interface CanvasFocusMeta {
  focusedIds: number[]
  spotlightIds?: number[]
  boardCount: number
  regionCount?: number
  /**
   * Rectangles for the focus ∪ spotlight photos, keyed by id. Absent on region turns and on
   * rows persisted before this existed — read with `?? []` and fall back to the flat grid.
   */
  geometry?: CanvasPhotoRect[]
}

export interface PhotoGroup {
  /**
   * Stable 1-based id, unique within the message. This is the handle the action
   * suggester (Phase 3) uses to say WHICH groups an action applies to — an integer
   * instead of the group's free-text label, which the LLM would have to copy
   * verbatim and could drift on. Optional because rows persisted before it existed
   * lack it; normalize with `id ?? index + 1` when reading.
   */
  id?: number
  label: string
  photoIds: number[]
  /**
   * The assistant presented this group as discarded / not recommended (a "Descartadas"
   * pile). Set by the curator itself in Phase 2, NOT inferred from the label: the action
   * suggester excludes these photos from every create/add action, and an exclusion that
   * depends on reading a free-text label back is exactly the fragility this replaces.
   */
  rejected?: boolean
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
