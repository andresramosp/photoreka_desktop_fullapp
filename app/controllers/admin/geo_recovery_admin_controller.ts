import type { HttpContext } from '@adonisjs/core/http'
import redis from '@adonisjs/redis/services/main'
import {
  FREE_RUN_GLOBAL_LIMIT_PER_DAY,
  FREE_RUN_IP_LIMIT_PER_DAY,
} from '#services/geo_recovery_session_service'
import type { GeoRecoverySessionState } from '#services/geo_recovery_session_service'
import type { GeoRecoveryJobState } from '#services/geo_recovery_inference_service'
import GeoRecoveryPayment from '#models/geo_recovery_payment'
import GeoRecoveryCostLog from '#models/geo_recovery_cost_log'

export default class GeoRecoveryAdminController {
  // ── POST /api/admin/geo-recovery/reset-free-runs ─────────────────────────

  /**
   * Deletes today's free-run rate-limit counters (both global and all per-IP).
   * Also accepts an optional ?date=YYYY-MM-DD query param to reset a specific day.
   */
  public async resetFreeRuns({ request, response }: HttpContext) {
    const today = new Date().toISOString().slice(0, 10)
    const date = String(request.input('date', today)).trim()

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return response.badRequest({ error: 'Invalid date format. Use YYYY-MM-DD.' })
    }

    try {
      // Delete global counter
      const globalKey = `geo_recovery:free_run:global:${date}`
      const globalDeleted = await redis.del(globalKey)

      // Scan and delete all per-IP counters for the date
      let cursor = '0'
      let ipDeleted = 0
      const ipPattern = `geo_recovery:free_run:ip:*:${date}`
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', ipPattern, 'COUNT', 200)
        cursor = nextCursor
        if (keys.length > 0) {
          await redis.del(...keys)
          ipDeleted += keys.length
        }
      } while (cursor !== '0')

      return response.ok({
        date,
        globalDeleted: globalDeleted > 0,
        ipCountersDeleted: ipDeleted,
        message: `Free-run counters for ${date} cleared.`,
      })
    } catch (error: any) {
      console.error('[GeoRecoveryAdmin] resetFreeRuns error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── GET /api/admin/geo-recovery/stats ────────────────────────────────────

  /**
   * Returns today's free-run counters (global + rough IP count).
   */
  public async stats({ request, response }: HttpContext) {
    const today = new Date().toISOString().slice(0, 10)
    const date = String(request.input('date', today)).trim()

    try {
      const globalKey = `geo_recovery:free_run:global:${date}`
      const globalCount = Number(await redis.get(globalKey)) || 0

      // Count distinct IP keys for the date
      let ipPattern = `geo_recovery:free_run:ip:*:${date}`
      let cursor = '0'
      let ipCount = 0
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', ipPattern, 'COUNT', 200)
        cursor = nextCursor
        ipCount += keys.length
      } while (cursor !== '0')

      return response.ok({
        date,
        globalCount,
        globalLimit: FREE_RUN_GLOBAL_LIMIT_PER_DAY,
        ipCount,
        ipLimit: FREE_RUN_IP_LIMIT_PER_DAY,
      })
    } catch (error: any) {
      console.error('[GeoRecoveryAdmin] stats error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── GET /api/admin/geo-recovery/sessions ─────────────────────────────────

  /**
   * Lists all geo-recovery sessions currently in Redis, joined with their job state.
   * Sessions are short-lived (7 days TTL), so this is a live view of recent activity.
   */
  public async sessions({ response }: HttpContext) {
    try {
      // Scan all session keys
      let cursor = '0'
      const sessionKeys: string[] = []
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          'geo_recovery:session:*',
          'COUNT',
          200
        )
        cursor = nextCursor
        sessionKeys.push(...keys)
      } while (cursor !== '0')

      if (sessionKeys.length === 0) {
        return response.ok({ sessions: [] })
      }

      // Batch-fetch all session payloads
      const rawSessions = await redis.mget(...sessionKeys)

      // For each session also fetch the job key
      const sessions: Array<GeoRecoverySessionState & { job: GeoRecoveryJobState | null }> = []

      const jobFetches = rawSessions.map(async (raw) => {
        if (!raw) return
        let session: GeoRecoverySessionState
        try {
          session = JSON.parse(raw) as GeoRecoverySessionState
        } catch {
          return
        }

        const jobRaw = await redis.get(`geo_recovery:job:${session.sessionId}`)
        let job: GeoRecoveryJobState | null = null
        if (jobRaw) {
          try {
            job = JSON.parse(jobRaw) as GeoRecoveryJobState
          } catch {}
        }

        sessions.push({ ...session, job })
      })

      await Promise.all(jobFetches)

      // Sort newest first
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return response.ok({ sessions })
    } catch (error: any) {
      console.error('[GeoRecoveryAdmin] sessions error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── GET /api/admin/geo-recovery/payments ─────────────────────────────────

  /**
   * Lists all geo-recovery payments from the database, ordered by newest first.
   * Supports pagination via ?page=1&limit=50 query params.
   */
  public async payments({ request, response }: HttpContext) {
    try {
      const page = Math.max(1, Number(request.input('page', 1)))
      const limit = Math.min(200, Math.max(1, Number(request.input('limit', 50))))

      const paymentsQuery = GeoRecoveryPayment.query()
        .where('status', 'completed')
        .orderBy('created_at', 'desc')
        .paginate(page, limit)

      const result = await paymentsQuery

      return response.ok({
        payments: result.all(),
        meta: result.getMeta(),
      })
    } catch (error: any) {
      console.error('[GeoRecoveryAdmin] payments error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── GET /api/admin/geo-recovery/analyses ────────────────────────────────

  /**
   * Lists merged payment + cost summaries (one row per analysis).
   * Supports pagination via ?page=1&limit=50 query params.
   */
  public async analyses({ request, response }: HttpContext) {
    try {
      const page = Math.max(1, Number(request.input('page', 1)))
      const limit = Math.min(200, Math.max(1, Number(request.input('limit', 50))))

      const paymentsQuery = GeoRecoveryPayment.query()
        .where('status', 'completed')
        .orderBy('created_at', 'desc')
        .paginate(page, limit)

      const result = await paymentsQuery
      const payments = result.all()
      const paymentIds = payments.map((payment) => payment.id)

      const costLogs = paymentIds.length
        ? await GeoRecoveryCostLog.query()
            .whereIn('geo_recovery_payment_id', paymentIds)
            .select(
              'geo_recovery_payment_id',
              'category',
              'cost_in_eur',
              'reference_id',
              'created_at'
            )
        : []

      const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000
      const summaries = new Map<
        number,
        {
          totalCostEur: number
          costLogCount: number
          categories: Set<string>
          referenceIds: Set<string>
          lastCostAt: string | null
          lastCostAtMs: number
        }
      >()

      for (const log of costLogs) {
        const paymentId = log.geoRecoveryPaymentId
        if (!paymentId) continue

        const summary = summaries.get(paymentId) ?? {
          totalCostEur: 0,
          costLogCount: 0,
          categories: new Set<string>(),
          referenceIds: new Set<string>(),
          lastCostAt: null,
          lastCostAtMs: 0,
        }

        summary.totalCostEur = round(summary.totalCostEur + (log.costInEur ?? 0))
        summary.costLogCount += 1

        if (log.category) summary.categories.add(log.category)
        if (log.referenceId) summary.referenceIds.add(log.referenceId)

        if (log.createdAt) {
          const createdMs = log.createdAt.toMillis()
          if (createdMs > summary.lastCostAtMs) {
            summary.lastCostAtMs = createdMs
            summary.lastCostAt = log.createdAt.toISO()
          }
        }

        summaries.set(paymentId, summary)
      }

      const analyses = payments.map((payment) => {
        const summary = summaries.get(payment.id)

        return {
          ...payment.serialize(),
          totalCostEur: summary?.totalCostEur ?? 0,
          costLogCount: summary?.costLogCount ?? 0,
          costCategories: summary ? Array.from(summary.categories) : [],
          costReferenceIds: summary ? Array.from(summary.referenceIds) : [],
          lastCostAt: summary?.lastCostAt ?? null,
        }
      })

      return response.ok({
        analyses,
        meta: result.getMeta(),
      })
    } catch (error: any) {
      console.error('[GeoRecoveryAdmin] analyses error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── GET /api/admin/geo-recovery/cost-logs ────────────────────────────────

  /**
   * Lists all geo-recovery cost logs from the database, ordered by newest first.
   * Preloads the associated payment for each log.
   * Supports pagination via ?page=1&limit=50 query params.
   */
  public async costLogs({ request, response }: HttpContext) {
    try {
      const page = Math.max(1, Number(request.input('page', 1)))
      const limit = Math.min(200, Math.max(1, Number(request.input('limit', 50))))

      const costLogsQuery = GeoRecoveryCostLog.query()
        .preload('payment')
        .orderBy('created_at', 'desc')
        .paginate(page, limit)

      const result = await costLogsQuery

      return response.ok({
        costLogs: result.all(),
        meta: result.getMeta(),
      })
    } catch (error: any) {
      console.error('[GeoRecoveryAdmin] costLogs error:', error)
      return response.internalServerError({ error: error.message })
    }
  }
}
