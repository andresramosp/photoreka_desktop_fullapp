import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { PicksCriterionKey, PicksGenreKey } from '#config/picks'

// duplicate: exact copy of another photo in the session, never judged itself
export type PicksPhotoStatus = 'pending' | 'judged' | 'failed' | 'duplicate'
export type PicksScores = Record<PicksCriterionKey, number>

const jsonColumn = {
  prepare: (value: unknown) =>
    value === null || value === undefined ? null : JSON.stringify(value),
}

export default class PicksPhoto extends BaseModel {
  static table = 'picks_photos'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sessionId: string

  @column()
  declare clientPhotoId: string

  // Explicit: the naming strategy would map `r2Key` to `r_2_key`.
  @column({ columnName: 'r2_key' })
  declare r2Key: string

  @column()
  declare originalName: string

  @column()
  declare width: number

  @column()
  declare height: number

  @column()
  declare status: PicksPhotoStatus

  @column()
  declare attempts: number

  @column(jsonColumn)
  declare scores: PicksScores | null

  @column()
  declare critique: string | null

  /** client_photo_id of the judged photo this one is an exact copy of. */
  @column()
  declare duplicateOf: string | null

  @column(jsonColumn)
  declare genres: PicksGenreKey[] | null

  @column.dateTime()
  declare judgedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
