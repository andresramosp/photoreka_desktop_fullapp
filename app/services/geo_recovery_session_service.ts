import crypto from 'node:crypto'
import redis from '@adonisjs/redis/services/main'

export const GEO_RECOVERY_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
export const GEO_RECOVERY_MAX_PHOTOS_PER_SESSION = 5000
export const FREE_RUN_IP_LIMIT_PER_DAY = 1
export const FREE_RUN_GLOBAL_LIMIT_PER_DAY = 10
const FREE_RUN_COUNTER_TTL_SECONDS = 60 * 60 * 48 // 48 h so the key outlives the calendar day

export interface GeoRecoveryPhotoEntry {
  clientPhotoId: string
  r2Key: string
  mime: string
  originalName: string
  /** UTC ms timestamp from EXIF DateTimeOriginal, or null when missing. */
  takenAtMs: number | null
}

export interface GeoRecoverySessionState {
  sessionId: string
  createdAt: string
  paid: boolean
  isFreeRun?: boolean
  photos: GeoRecoveryPhotoEntry[]
}

function sessionSecret(): string {
  const secret = process.env.GEO_RECOVERY_SECRET || process.env.APP_KEY
  if (!secret) {
    throw new Error('Missing GEO_RECOVERY_SECRET (or APP_KEY) for session signing')
  }
  return secret
}

function sign(sessionId: string): string {
  return crypto
    .createHmac('sha256', sessionSecret())
    .update(sessionId)
    .digest('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function sessionKey(sessionId: string): string {
  return `geo_recovery:session:${sessionId}`
}

export default class GeoRecoverySessionService {
  /**
   * Creates a free-run session, enforcing two best-effort Redis counters:
   *   1. Per-IP  : max FREE_RUN_IP_LIMIT_PER_DAY  per calendar day
   *   2. Global  : max FREE_RUN_GLOBAL_LIMIT_PER_DAY per calendar day
   *
   * "Best-effort" means small over-counts are possible under heavy concurrency —
   * this is explicitly accepted because anonymous sessions cannot be tied to users.
   */
  public async createFree(
    clientIp: string
  ): Promise<
    | { sessionToken: string; state: GeoRecoverySessionState }
    | { error: 'ip_limit' | 'global_limit' }
  > {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    // Hash the IP so we never store a raw address in Redis.
    const ipHash = crypto
      .createHash('sha256')
      .update(clientIp || 'unknown')
      .digest('hex')
      .slice(0, 16)

    const ipKey = `geo_recovery:free_run:ip:${ipHash}:${today}`
    const globalKey = `geo_recovery:free_run:global:${today}`

    // INCR is atomic; decrement on limit breach gives best-effort rollback.
    const newIpCount = await redis.incr(ipKey)
    if (newIpCount === 1) await redis.expire(ipKey, FREE_RUN_COUNTER_TTL_SECONDS)
    if (newIpCount > FREE_RUN_IP_LIMIT_PER_DAY) {
      await redis.decr(ipKey)
      return { error: 'ip_limit' }
    }

    const newGlobalCount = await redis.incr(globalKey)
    if (newGlobalCount === 1) await redis.expire(globalKey, FREE_RUN_COUNTER_TTL_SECONDS)
    if (newGlobalCount > FREE_RUN_GLOBAL_LIMIT_PER_DAY) {
      await redis.decr(globalKey)
      await redis.decr(ipKey)
      return { error: 'global_limit' }
    }

    const sessionId = crypto.randomUUID()
    const state: GeoRecoverySessionState = {
      sessionId,
      createdAt: new Date().toISOString(),
      paid: true, // free run is pre-authorised — no payment step needed
      isFreeRun: true,
      photos: [],
    }
    await this.save(state)
    return { sessionToken: `${sessionId}.${sign(sessionId)}`, state }
  }

  public async create(): Promise<{ sessionToken: string; state: GeoRecoverySessionState }> {
    const sessionId = crypto.randomUUID()
    const state: GeoRecoverySessionState = {
      sessionId,
      createdAt: new Date().toISOString(),
      paid: false,
      photos: [],
    }
    await this.save(state)
    return { sessionToken: `${sessionId}.${sign(sessionId)}`, state }
  }

  public async loadFromToken(token: string | undefined): Promise<GeoRecoverySessionState | null> {
    if (!token || typeof token !== 'string') return null

    const trimmed = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim()
    const dot = trimmed.indexOf('.')
    if (dot <= 0) return null

    const sessionId = trimmed.slice(0, dot)
    const signature = trimmed.slice(dot + 1)
    const expected = sign(sessionId)
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null

    return this.load(sessionId)
  }

  public async load(sessionId: string): Promise<GeoRecoverySessionState | null> {
    const raw = await redis.get(sessionKey(sessionId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as GeoRecoverySessionState
    } catch {
      return null
    }
  }

  public async save(state: GeoRecoverySessionState): Promise<void> {
    await redis.set(
      sessionKey(state.sessionId),
      JSON.stringify(state),
      'EX',
      GEO_RECOVERY_SESSION_TTL_SECONDS
    )
  }
}
