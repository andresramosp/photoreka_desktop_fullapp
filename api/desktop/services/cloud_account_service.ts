import crypto from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import User, { type UserProfile } from '#models/user'

/**
 * Cuenta de la nube del usuario del escritorio. El login usa el flujo por navegador que ya
 * tiene el plugin de Lightroom (rutas /api/auth_lr/* de la API de la nube); el usuario local
 * tiene el mismo id que su cuenta en la nube, y su cuota y créditos se copian de ella.
 */

const CLOUD_API = () => required('PHOTOREKA_CLOUD_API')
const CLOUD_APP = () => required('PHOTOREKA_CLOUD_APP')

// Campos de users.usage que manda la nube; el resto (fotos subidas...) se calcula en local.
const USAGE_FIELDS = [
  'photosLimit',
  'analyzedPhotosLimit',
  'creditsAvailable',
  'creditsUsed',
  'analyzedPhotosUsed',
  'freeShots',
  'welcomePackClaimed',
] as const

export type CloudAccount = {
  id: number
  name: string
  email: string
  isActive: boolean
  isEmailConfirmed: boolean
  hasCompletedPurchase: boolean
  preferredSource?: string
  profiles?: string
  usage: Record<string, any> | null
}

export class CloudAuthError extends Error {}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable ${name}`)
  return value.replace(/\/+$/, '')
}

function secretKey(): Buffer {
  const key = Buffer.from(required('DESKTOP_SECRET_KEY'), 'hex')
  if (key.length !== 32) throw new Error('DESKTOP_SECRET_KEY debe tener 32 bytes')
  return key
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

function decrypt(stored: string): string {
  const [iv, tag, data] = stored.split('.').map((p) => Buffer.from(p, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

async function cloudFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { 'Accept': 'application/json', 'Content-Type': 'application/json' }
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  const response = await fetch(`${CLOUD_API()}${path}`, { ...init, headers })
  if (response.status === 401 || response.status === 403) throw new CloudAuthError(`La nube rechazó la sesión (${response.status})`)
  if (!response.ok) throw new Error(`La nube respondió ${response.status} en ${path}`)
  return response.json() as Promise<any>
}

export default class CloudAccountService {
  /** Paso 1: sesión pendiente en la nube y página donde el usuario inicia sesión. */
  static async startLogin() {
    const { sessionId, expiresInSeconds } = await cloudFetch('/api/auth_lr/create-device-session', { method: 'POST' })
    return {
      sessionId: sessionId as string,
      expiresInSeconds: expiresInSeconds as number,
      verificationUrl: `${CLOUD_APP()}/lr-auth?session=${encodeURIComponent(sessionId)}`,
    }
  }

  /**
   * Paso 2: la app consulta hasta que el usuario completa el login en el navegador. Al
   * completarse, crea o actualiza el usuario local y le abre una sesión local.
   */
  static async pollLogin(sessionId: string): Promise<{ status: 'pending' | 'expired' } | { status: 'completed'; token: string }> {
    const result = await cloudFetch(`/api/auth_lr/poll-device-session?sessionId=${encodeURIComponent(sessionId)}`)
    if (result.status !== 'completed') return { status: result.status === 'pending' ? 'pending' : 'expired' }

    const cloudToken = result.token as string
    const account = await this.fetchAccount(cloudToken)
    const user = await this.saveAccount(account, cloudToken)
    // Sesión local sin caducidad: la API local solo escucha en 127.0.0.1 y la que cuenta
    // es la de la nube, que se revoca al cerrar sesión.
    const localToken = await User.accessTokensEternal.create(user, ['*'], { name: 'desktop' })
    return { status: 'completed', token: localToken.value!.release() }
  }

  static async fetchAccount(cloudToken: string): Promise<CloudAccount> {
    const { user } = await cloudFetch('/api/auth/profile', { token: cloudToken })
    return user as CloudAccount
  }

  static async saveAccount(account: CloudAccount, cloudToken?: string): Promise<User> {
    return db.transaction(async (trx) => {
      let user = await User.find(account.id, { client: trx })
      if (!user) {
        user = new User()
        user.useTransaction(trx)
        user.id = account.id
        user.preferredSource = (account.preferredSource as any) ?? 'web'
        user.profiles = (account.profiles ?? 'general') as UserProfile
      }
      user.name = account.name
      user.email = account.email
      user.isActive = account.isActive
      user.emailConfirmedAt = account.isEmailConfirmed ? (user.emailConfirmedAt ?? DateTime.now()) : null
      const usage = { ...(user.usage ?? {}) } as Record<string, any>
      for (const field of USAGE_FIELDS) {
        if (account.usage && field in account.usage) usage[field] = account.usage[field]
      }
      user.usage = usage as any
      await user.save()

      const values: Record<string, any> = { account: JSON.stringify(account), synced_at: new Date(), updated_at: new Date() }
      if (cloudToken) values.token_encrypted = encrypt(cloudToken)
      const exists = await trx.from('cloud_sessions').where('user_id', user.id).first()
      if (exists) await trx.from('cloud_sessions').where('user_id', user.id).update(values)
      else if (cloudToken) await trx.table('cloud_sessions').insert({ user_id: user.id, ...values })
      return user
    })
  }

  static async cloudToken(userId: number): Promise<string | null> {
    const row = await db.from('cloud_sessions').where('user_id', userId).first()
    if (!row) return null
    try {
      return decrypt(row.token_encrypted)
    } catch {
      // Cifrado con otra clave (Electron tuvo que crear una nueva): la sesión ya no sirve.
      logger.warn(`[cloud] el token del usuario ${userId} no se puede descifrar; hay que iniciar sesión de nuevo`)
      await this.forgetSession(userId)
      return null
    }
  }

  static async cachedAccount(userId: number): Promise<CloudAccount | null> {
    const row = await db.from('cloud_sessions').where('user_id', userId).select('account').first()
    return row?.account ?? null
  }

  /** Vuelve a copiar de la nube la cuenta de cada usuario local con sesión. */
  static async syncAll() {
    const rows = await db.from('cloud_sessions').select('user_id')
    for (const { user_id: userId } of rows) {
      try {
        const token = await this.cloudToken(userId)
        if (token) await this.saveAccount(await this.fetchAccount(token))
      } catch (error) {
        if (error instanceof CloudAuthError) {
          // Sesión revocada en la nube: el usuario tendrá que volver a iniciar sesión.
          await this.forgetSession(userId)
          logger.warn(`[cloud] sesión de la nube revocada para el usuario ${userId}`)
        } else {
          logger.warn(`[cloud] no se pudo sincronizar la cuenta ${userId}: ${(error as Error).message}`)
        }
      }
    }
  }

  /** Cierra la sesión en la nube y en local. */
  static async logout(userId: number) {
    const token = await this.cloudToken(userId)
    if (token) {
      await cloudFetch('/api/auth/logout', { method: 'POST', token }).catch((error) =>
        logger.warn(`[cloud] no se pudo cerrar la sesión en la nube: ${error.message}`)
      )
    }
    await this.forgetSession(userId)
  }

  private static async forgetSession(userId: number) {
    await db.from('cloud_sessions').where('user_id', userId).delete()
    await db.from('auth_access_tokens').where('tokenable_id', userId).delete()
  }
}
