import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import PortfolioBuildSet from './portfolio_build_set.js'

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
  name?: string
  /**
   * Optional free-text description. Only used by manually-created portfolios
   * (no AI build); the AI pipeline ignores this field.
   */
  description?: string
  /**
   * If true, this is a manually-curated portfolio: no AI build pipeline runs,
   * photos are added/removed by the user through the detail view.
   */
  isManual?: boolean
  targetSize: number
  weights: Record<string, number>
  /**
   * Optional free-text description of the desired artistic style. When
   * present and `weights` were not explicitly set by the user, the backend
   * parses it into an emphasize/deemphasize set and applies boosts on top of
   * a neutral baseline.
   */
  stylePreferences?: string
  themePreferences?: string
  sequencingPreferences?: string
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
  photoItems?: { id: number; thumbnailUrl: string; originalUrl?: string }[]
  recallSize: number
  batchesEvaluated: number
  totalCandidatesEvaluated: number
  refinementNotes?: string
  sequencingNotes?: string
  gridImagePath?: string
  /**
   * Pool of photos the LLM approved during evaluation but that didn't make
   * the final cut (trimmed by similarity gate, over-generation buffer, or
   * refinement). Surfaced to the user as additional suggestions.
   */
  builderPool?: { id: number; thumbnailUrl: string; originalUrl?: string }[]
  /**
   * Live progress counters, updated throughout the pipeline so the UI can
   * show meaningful step-level detail (e.g. "3/6 batches evaluated").
   */
  evaluationProgress?: { completed: number; total: number }
  refinementProgress?: { trimmed: number; toTrim: number; startCount: number }
}

export default class PortfolioBuild extends BaseModel {
  static table = 'portfolio_builds'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare setId: number | null

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

  @belongsTo(() => PortfolioBuildSet, { foreignKey: 'setId' })
  declare set: BelongsTo<typeof PortfolioBuildSet>
}
