import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export type PortfolioBuildStatus =
  | 'pending'
  | 'parsing'
  | 'recall'
  | 'evaluating'
  | 'refining'
  | 'sequencing'
  | 'completed'
  | 'failed'

export type CoherenceMode = 'free' | 'visual' | 'chromatic' | 'narrative' | 'heterogeneous'

export type PortfolioBuildConfig = {
  targetSize: number
  weights: Record<string, number>
  freetext?: string
  coherenceMode: CoherenceMode
  sequencing: boolean
  filters?: {
    visualAspects?: Record<string, string[]>
    dateFrom?: string
    dateTo?: string
    collectionIds?: number[]
  }
}

export type PortfolioBuildResult = {
  photoIds: number[]
  photoItems?: { id: number; thumbnailUrl: string }[]
  recallSize: number
  batchesEvaluated: number
  totalCandidatesEvaluated: number
  refinementNotes?: string
  sequencingNotes?: string
  gridImagePath?: string
}

export default class PortfolioBuild extends BaseModel {
  static table = 'portfolio_builds'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare status: PortfolioBuildStatus

  @column()
  declare config: PortfolioBuildConfig

  @column()
  declare parsedFilters: Record<string, any> | null

  @column()
  declare result: PortfolioBuildResult | null

  @column({ columnName: 'cost_eur' })
  declare costEur: number

  @column()
  declare progress: number

  @column()
  declare error: string | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
