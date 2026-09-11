import { DateTime } from 'luxon'
import { BaseModel, beforeFetch, beforeFind, column, computed } from '@adonisjs/lucid/orm'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { Usage } from '#services/usage_service'
import type { CostHistory } from '#services/user_cost_service'

export type InsightsState = {
  shownPhotoIds: number[]
}

export type WeightPreset = {
  id: string
  name: string
  weights: Record<string, number>
  createdAt: string
}

export type ContentViolation = {
  date: string
  reasons: string[]
  batchViolations: string[]
  photoIds: number[]
  ip: string
}

export type PreferredSource = 'web' | 'lightroom' | null
export type UserProvider = 'email' | 'google'
export type UserRole = 'user' | 'admin'
export type UserProfile =
  | 'general'
  | 'commercial'
  | 'street-photography'
  | 'documentary'
  | 'artistic'
  | 'street-photography|artistic'
  | 'documentary|artistic'
  | 'street-photography|documentary'
  | null

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare email: string

  /**
   * Public handle. Owns the first path segment of a published page
   * (photoreka.com/:username) and, later, its subdomain.
   */
  @column()
  declare username: string | null

  @column({ serializeAs: null })
  declare password: string | null

  @column()
  declare isActive: boolean

  @column()
  declare role: UserRole

  @column()
  declare usage: Usage | null

  @column()
  declare costHistory: CostHistory | null

  @column()
  declare preferredSource: PreferredSource

  @column()
  declare profiles: UserProfile

  // Google OAuth fields
  @column()
  declare googleId: string | null

  @column()
  declare provider: UserProvider | null

  @column()
  declare stripeCustomerId: string | null

  @column()
  declare avatar: string | null

  @column({ columnName: 'catalog_patterns' })
  declare catalogPatterns: Record<string, any> | null

  @column()
  declare insightsState: InsightsState | null

  @column({
    prepare: (value: WeightPreset[] | null) => (value != null ? JSON.stringify(value) : null),
    consume: (value: string | WeightPreset[] | null) => {
      if (value == null) return null
      if (typeof value === 'string') return JSON.parse(value) as WeightPreset[]
      return value
    },
  })
  declare customWeightPresets: WeightPreset[] | null

  @column({
    prepare: (value: ContentViolation[] | null) => (value != null ? JSON.stringify(value) : null),
    consume: (value: string | ContentViolation[] | null) => {
      if (value == null) return null
      if (typeof value === 'string') return JSON.parse(value) as ContentViolation[]
      return value
    },
  })
  declare contentViolations: ContentViolation[] | null

  // Email confirmation fields
  @column.dateTime()
  declare emailConfirmedAt: DateTime | null

  @column({ serializeAs: null })
  declare emailConfirmationToken: string | null

  @column.dateTime()
  declare emailConfirmationSentAt: DateTime | null

  // Password reset fields
  @column({ serializeAs: null })
  declare passwordResetToken: string | null

  @column.dateTime()
  declare passwordResetExpiresAt: DateTime | null

  // Terms of Service / content-policy acceptance evidence
  @column()
  declare tosAcceptedVersion: string | null

  @column.dateTime()
  declare tosAcceptedAt: DateTime | null

  @column()
  declare tosAcceptedIp: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare photosReviewedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @beforeFind()
  public static ignoreDeleted(query: ModelQueryBuilderContract<typeof User>) {
    query.whereNull('deleted_at')
  }

  @beforeFetch()
  public static ignoreBatchDeleted(query: ModelQueryBuilderContract<typeof User>) {
    query.whereNull('deleted_at')
  }

  /**
   * Check if the user's email is confirmed
   */
  get isEmailConfirmed(): boolean {
    return this.emailConfirmedAt !== null
  }

  /**
   * Computed property that discriminates general patterns into stylistic and object motif
   */
  @computed()
  get catalogPatternsResult(): Record<string, any> | null {
    if (!this.catalogPatterns) return null

    const result = { ...this.catalogPatterns }

    // Process general patterns into general_stylistic and general_object
    // if (result.general && Array.isArray(result.general)) {
    //   const stylistic: any[] = []
    //   const objectMotif: any[] = []

    //   for (const pattern of result.general) {
    //     if (pattern.patternType === 'stylistic') {
    //       stylistic.push(pattern)
    //     } else if (pattern.patternType === 'object_motif') {
    //       objectMotif.push(pattern)
    //     }
    //   }

    //   // Remove the original general key
    //   delete result.general

    //   // Add the new categorized patterns if they have content
    //   if (stylistic.length > 0) {
    //     result.general_stylistic = stylistic
    //   }
    //   if (objectMotif.length > 0) {
    //     result.general_object = objectMotif
    //   }
    // }

    return result
  }

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '30 days',
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })

  // Same table/prefix/type but with no default expiry, so the resulting token
  // never expires (the auth guard treats a NULL expires_at as "never expires").
  //
  // Reserved for tokens that end up living inside the Lightroom plugin, which
  // runs unattended and has no way to silently re-authenticate once a token
  // expires. Eligibility is decided by WHO the request comes from (the plugin
  // identifies itself), never by the user's preferredSource — a Lightroom user
  // logging in from the web browser must still get a normal expiring token.
  static accessTokensEternal = DbAccessTokensProvider.forModel(User, {
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })
}
