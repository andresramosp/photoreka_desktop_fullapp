import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import redis from '@adonisjs/redis/services/main'
import { PICKS_FREE_TRIAL } from '#config/picks'
import PicksSession from '#models/picks/picks_session'
import PicksJudgeService from '#services/picks/picks_judge_service'
import { picksTokenFor } from '#services/picks/picks_session_service'

const SESSION_FILTERS: Record<string, string> = {
  paid: 's.paid_at IS NOT NULL AND NOT s.is_free',
  free: 's.is_free',
  open: 's.paid_at IS NULL',
  processing: "s.status = 'processing'",
  failed: "s.status = 'failed'",
  all: 'TRUE',
}

const round = (value: unknown, decimals = 4) => {
  const factor = 10 ** decimals
  return Math.round(Number(value ?? 0) * factor) / factor
}

const today = () => new Date().toISOString().slice(0, 10)

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')
  return keys
}

export default class PicksAdminController {
  // ── GET /api/admin/picks/free-trials ─────────────────────────────────────

  /** Today's free-trial counters (UTC day), the same ones the limits read. */
  public async freeTrials({ response }: HttpContext) {
    const date = today()
    const [used, ipKeys] = await Promise.all([
      redis.get(`picks:free:day:${date}`),
      scanKeys(`picks:free:ip:*:${date}`),
    ])
    return response.ok({
      date,
      used: Number(used) || 0,
      dailyLimit: PICKS_FREE_TRIAL.perDay,
      ipCount: ipKeys.length,
      ipLimit: PICKS_FREE_TRIAL.perIpPerDay,
    })
  }

  // ── POST /api/admin/picks/free-trials/reset ──────────────────────────────

  /** Clears today's global and per-IP counters, so every IP can run a trial again. */
  public async resetFreeTrials({ response }: HttpContext) {
    const date = today()
    const keys = [`picks:free:day:${date}`, ...(await scanKeys(`picks:free:ip:*:${date}`))]
    const deleted = await redis.del(...keys)
    return response.ok({ date, deleted })
  }

  // ── GET /api/admin/picks/overview?days=30 ────────────────────────────────

  public async overview({ request, response }: HttpContext) {
    const days = Math.min(365, Math.max(1, Number(request.input('days', 30)) || 30))
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const [sessions, revenue, cost, photos] = await Promise.all([
      db.rawQuery(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE paid_at IS NOT NULL AND NOT is_free) AS paid,
                count(*) FILTER (WHERE is_free) AS free,
                count(*) FILTER (WHERE status = 'processing') AS processing,
                count(*) FILTER (WHERE status = 'completed') AS completed,
                count(*) FILTER (WHERE status = 'failed') AS failed
           FROM picks_sessions WHERE created_at >= ?`,
        [since]
      ),
      db.rawQuery(
        `SELECT coalesce(sum(amount_eur), 0) AS eur FROM picks_payments
          WHERE status = 'completed' AND created_at >= ?`,
        [since]
      ),
      db.rawQuery(
        `SELECT task, coalesce(sum(cost_in_eur), 0) AS eur, coalesce(sum(photos), 0) AS photos
           FROM picks_cost_logs WHERE created_at >= ? GROUP BY task`,
        [since]
      ),
      db.rawQuery(
        `SELECT count(*) FILTER (WHERE status = 'judged') AS judged,
                count(*) FILTER (WHERE status = 'failed') AS failed
           FROM picks_photos WHERE created_at >= ?`,
        [since]
      ),
    ])

    const s = sessions.rows[0]
    const revenueEur = round(revenue.rows[0].eur, 2)
    const costByTask = Object.fromEntries(
      cost.rows.map((row: any) => [row.task, round(row.eur)])
    ) as Record<string, number>
    const costEur = round(Object.values(costByTask).reduce((sum, v) => sum + v, 0))
    const judged = Number(photos.rows[0].judged)

    return response.ok({
      days,
      sessions: {
        total: Number(s.total),
        paid: Number(s.paid),
        free: Number(s.free),
        processing: Number(s.processing),
        completed: Number(s.completed),
        failed: Number(s.failed),
      },
      photos: { judged, failed: Number(photos.rows[0].failed) },
      revenueEur,
      costEur,
      costByTask,
      marginEur: round(revenueEur - costEur, 2),
      costPer1000PhotosEur: judged > 0 ? round((costEur / judged) * 1000, 2) : null,
    })
  }

  // ── GET /api/admin/picks/sessions?filter=paid&page=1&limit=50 ────────────

  public async sessions({ request, response }: HttpContext) {
    const filter = SESSION_FILTERS[String(request.input('filter', 'paid'))] ?? SESSION_FILTERS.paid
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.min(200, Math.max(1, Number(request.input('limit', 50)) || 50))

    const [rows, total] = await Promise.all([
      db.rawQuery(
        `SELECT s.id, s.status, s.is_free, s.ordered_count, s.paid_count, s.customer_email, s.error,
                s.created_at, s.paid_at, s.upload_completed_at, s.started_at, s.completed_at,
                s.email_sent_at,
                ph.registered, ph.judged, ph.failed, ph.duplicates,
                (SELECT coalesce(sum(amount_eur), 0) FROM picks_payments p
                  WHERE p.session_id = s.id AND p.status = 'completed') AS revenue_eur,
                (SELECT coalesce(sum(cost_in_eur), 0) FROM picks_cost_logs c
                  WHERE c.session_id = s.id) AS cost_eur
           FROM picks_sessions s
           LEFT JOIN LATERAL (
             SELECT count(*) AS registered,
                    count(*) FILTER (WHERE status = 'judged') AS judged,
                    count(*) FILTER (WHERE status = 'failed') AS failed,
                    count(*) FILTER (WHERE status = 'duplicate') AS duplicates
               FROM picks_photos WHERE session_id = s.id
           ) ph ON TRUE
          WHERE ${filter}
          ORDER BY s.created_at DESC
          LIMIT ? OFFSET ?`,
        [limit, (page - 1) * limit]
      ),
      db.rawQuery(`SELECT count(*) AS total FROM picks_sessions s WHERE ${filter}`),
    ])

    return response.ok({
      sessions: rows.rows.map((row: any) => ({
        id: row.id,
        status: row.status,
        isFree: row.is_free,
        orderedCount: row.ordered_count,
        paidCount: row.paid_count,
        customerEmail: row.customer_email,
        error: row.error,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        uploadCompletedAt: row.upload_completed_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        emailSentAt: row.email_sent_at,
        registered: Number(row.registered),
        judged: Number(row.judged),
        failed: Number(row.failed),
        duplicates: Number(row.duplicates),
        revenueEur: round(row.revenue_eur, 2),
        costEur: round(row.cost_eur),
        // Support can open exactly what the buyer sees.
        resultsPath: row.paid_at ? `/picks/${picksTokenFor(row.id)}` : null,
      })),
      meta: { page, limit, total: Number(total.rows[0].total) },
    })
  }

  // ── POST /api/admin/picks/sessions/:id/resume ────────────────────────────

  /** Restarts judging for a paid session left stuck or failed; pending photos are retried. */
  public async resume({ params, response }: HttpContext) {
    const session = await PicksSession.find(params.id)
    if (!session) return response.notFound({ error: 'Session not found' })
    if (!session.paidAt) return response.badRequest({ error: 'This session was never paid' })

    await db
      .from('picks_photos')
      .where('session_id', session.id)
      .where('status', 'failed')
      .update({ status: 'pending', attempts: 0 })
    session.status = 'processing'
    session.completedAt = null
    session.error = null
    await session.save()

    await new PicksJudgeService().start(session.id)
    return response.ok({ resumed: true })
  }
}
