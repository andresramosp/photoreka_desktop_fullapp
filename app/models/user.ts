import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { Usage } from '#services/usage_service'

export type PreferredSource = 'web' | 'lightroom'
export type UserProvider = 'email' | 'google'
export type UserProfile =
  | 'general'
  | 'street-photography'
  | 'documentary'
  | 'artistic'
  | 'street-photography|artistic'
  | 'documentary|artistic'
  | 'street-photography|documentary'

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

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '30 days',
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })
}
