import crypto from 'node:crypto'
import redis from '@adonisjs/redis/services/main'
import { DateTime } from 'luxon'
import PicksSession from '#models/picks/picks_session'
import { PICKS_FREE_TRIAL } from '#config/picks'

// The session token is `${sessionId}.${hmac}`: anyone holding it (the buyer's
// browser, the emailed link) can read the results, and nobody can forge one.

const CREATE_LIMIT_PER_IP_PER_HOUR = 30
// Outlives the calendar day so the key never expires mid-day.
const FREE_COUNTER_TTL_SECONDS = 60 * 60 * 48

const hashIp = (ip: string) =>
  crypto
    .createHash('sha256')
    .update(ip || 'unknown')
    .digest('hex')
    .slice(0, 16)

function secret(): string {
  const value = process.env.PICKS_SECRET || process.env.APP_KEY
  if (!value) throw new Error('Missing PICKS_SECRET (or APP_KEY) for session signing')
  return value
}

function sign(sessionId: string): string {
  return crypto.createHmac('sha256', secret()).update(`picks:${sessionId}`).digest('base64url')
}

export function picksTokenFor(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`
}

function sessionIdFromToken(token: string | undefined | null): string | null {
  if (!token || typeof token !== 'string') return null
  const trimmed = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim()
  const dot = trimmed.indexOf('.')
  if (dot <= 0) return null
  const sessionId = trimmed.slice(0, dot)
  const expected = Buffer.from(sign(sessionId))
  const given = Buffer.from(trimmed.slice(dot + 1))
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
  return sessionId
}

export default class PicksSessionService {
  /** Null when this IP already opened too many sessions in the last hour. */
  async create(orderedCount: number, clientIp: string): Promise<PicksSession | null> {
    const key = `picks:create:${hashIp(clientIp)}:${new Date().toISOString().slice(0, 13)}`
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 60 * 60)
    if (count > CREATE_LIMIT_PER_IP_PER_HOUR) return null

    return PicksSession.create({ id: crypto.randomUUID(), status: 'open', orderedCount })
  }

  /**
   * A free-trial order, born already "paid" for its photos so judging starts
   * right away. Best-effort daily counters: a slight overshoot under heavy
   * concurrency is acceptable for anonymous traffic.
   */
  async createFree(
    photoCount: number,
    clientIp: string
  ): Promise<PicksSession | { error: 'ip_limit' | 'daily_limit' }> {
    const today = new Date().toISOString().slice(0, 10)
    const ipKey = `picks:free:ip:${hashIp(clientIp)}:${today}`
    const dayKey = `picks:free:day:${today}`

    const ipCount = await redis.incr(ipKey)
    if (ipCount === 1) await redis.expire(ipKey, FREE_COUNTER_TTL_SECONDS)
    if (ipCount > PICKS_FREE_TRIAL.perIpPerDay) {
      await redis.decr(ipKey)
      return { error: 'ip_limit' }
    }

    const dayCount = await redis.incr(dayKey)
    if (dayCount === 1) await redis.expire(dayKey, FREE_COUNTER_TTL_SECONDS)
    if (dayCount > PICKS_FREE_TRIAL.perDay) {
      await redis.decr(dayKey)
      await redis.decr(ipKey)
      return { error: 'daily_limit' }
    }

    return PicksSession.create({
      id: crypto.randomUUID(),
      status: 'processing',
      isFree: true,
      orderedCount: photoCount,
      paidCount: photoCount,
      paidAt: DateTime.now(),
    })
  }

  async loadFromToken(token: string | undefined | null): Promise<PicksSession | null> {
    const sessionId = sessionIdFromToken(token)
    return sessionId ? PicksSession.find(sessionId) : null
  }
}
