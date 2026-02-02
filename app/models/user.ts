import { DateTime } from 'luxon'
import { BaseModel, column, computed } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { Usage } from '#services/usage_service'

export type PreferredSource = 'web' | 'lightroom' | null
export type UserProvider = 'email' | 'google'
export type UserProfile =
  | 'general'
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

  @column({ serializeAs: null })
  declare password: string | null

  @column()
  declare isActive: boolean

  @column()
  declare usage: Usage | null

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
  declare avatar: string | null

  @column({ columnName: 'catalog_patterns' })
  declare catalogPatterns: Record<string, any> | null

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

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

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
    if (result.general && Array.isArray(result.general)) {
      const stylistic: any[] = []
      const objectMotif: any[] = []

      for (const pattern of result.general) {
        if (pattern.patternType === 'stylistic') {
          stylistic.push(pattern)
        } else if (pattern.patternType === 'object_motif') {
          objectMotif.push(pattern)
        }
      }

      // Remove the original general key
      delete result.general

      // Add the new categorized patterns if they have content
      if (stylistic.length > 0) {
        result.general_stylistic = stylistic
      }
      if (objectMotif.length > 0) {
        result.general_object = objectMotif
      }
    }

    return result
  }

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '30 days',
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })
}
