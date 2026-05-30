// @ts-nocheck

import User from '#models/user'
import Photo from '#models/photo'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import db from '@adonisjs/lucid/services/db'

export interface DashboardOverview {
  users: {
    total: number
    active: number
    recentSignups: number // last 7 days
  }
  photos: {
    total: number
  }
  processes: {
    total: number
    active: number
    failed: number
  }
  health: {
    globalScore: number
    missingEmbeddings: number
    missingDescriptions: number
    missingColorHistogram: number
    tagsWithoutEmbedding: number
    chunksWithoutEmbedding: number
  }
  costs: {
    totalCostEur: number
    thisMonthCostEur: number
    lastMonthCostEur: number
    monthOverMonthPct: number | null
    totalCalls: number
  }
  recentProcesses: {
    id: string
    userName: string | null
    currentStage: string | null
    photosTotal: number
    photosCompleted: number
    totalCostEur: number
    createdAt: string
  }[]
  monthlyTrend: {
    month: string
    costEur: number
  }[]
}

export default class AdminDashboardService {
  private static round(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
  }

  static async getOverview(): Promise<DashboardOverview> {
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // ── Run all independent queries in parallel ──
    const [
      usersData,
      photosData,
      processesData,
      healthData,
      recentProcesses,
      tagsMissing,
      chunksMissing,
    ] = await Promise.all([
      // Users stats
      db.rawQuery(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_active = true)::int AS active,
          COUNT(*) FILTER (WHERE created_at >= ?)::int AS recent_signups
        FROM users
      `,
        [sevenDaysAgo.toISOString()]
      ),

      // Photos count
      db.rawQuery(`
        SELECT COUNT(*)::int AS total FROM photos WHERE deleted_at IS NULL
      `),

      // Processes stats
      db.rawQuery(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE current_stage NOT IN ('finished', 'failed') AND current_stage IS NOT NULL)::int AS active,
          COUNT(*) FILTER (WHERE current_stage = 'failed')::int AS failed
        FROM analyzer_processes
        WHERE is_preprocess = false
          AND mode IN ('adding', 'retry_process', 'admin_retry')
          AND user_id IS NOT NULL
      `),

      // Health: photo-level missing data — only processed photos
      db.rawQuery(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE photos.embedding IS NULL)::int AS missing_embeddings,
          COUNT(*) FILTER (WHERE photos.descriptions IS NULL)::int AS missing_descriptions,
          COUNT(*) FILTER (WHERE photos.color_histogram IS NULL)::int AS missing_color
        FROM photos
        JOIN analyzer_processes ap ON photos.analyzer_process_id = ap.id
          AND (
            ap.mode IN ('admin_retry', 'overwrite_metadata')
            OR (ap.is_preprocess = false AND ap.current_stage = 'finished')
          )
        WHERE photos.deleted_at IS NULL
      `),

      // Recent processes (last 8)
      AnalyzerProcess.query()
        .where('isPreprocess', false)
        .whereIn('mode', ['adding', 'retry_process', 'admin_retry'])
        .whereNotNull('user_id')
        .orderBy('created_at', 'desc')
        .limit(8)
        .select('id', 'userId', 'currentStage', 'costReport', 'createdAt', 'processSheet'),

      // Tags without embedding
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM tags WHERE embedding IS NULL`),

      // Chunks without embedding
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM descriptions_chunks WHERE embedding IS NULL`),
    ])

    const usersRow = usersData.rows[0]
    const photosRow = photosData.rows[0]
    const processesRow = processesData.rows[0]
    const healthRow = healthData.rows[0]

    // Health score calculation
    const totalPhotos = healthRow.total || 0
    let totalChecks = 0
    let totalPassed = 0
    if (totalPhotos > 0) {
      totalChecks = totalPhotos * 3
      totalPassed =
        totalPhotos -
        healthRow.missing_embeddings +
        (totalPhotos - healthRow.missing_descriptions) +
        (totalPhotos - healthRow.missing_color)
    }
    const globalScore = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 100

    // Costs from cost_logs (single source of truth)
    const costTotalRow = await db.rawQuery(`
      SELECT
        COALESCE(SUM(cost_in_eur), 0)::float AS total_cost,
        COALESCE(SUM(calls), 0)::int AS total_calls
      FROM cost_logs
    `)
    const totalCostEur = costTotalRow.rows[0]?.total_cost ?? 0
    const totalCalls = costTotalRow.rows[0]?.total_calls ?? 0

    // Monthly trend (last 6 months) from cost_logs (all categories)
    const monthlyMap: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = 0
    }

    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const monthlyRows = await db.rawQuery(
      `
      SELECT
        to_char(created_at, 'YYYY-MM') AS month,
        COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur
      FROM cost_logs
      WHERE created_at >= ?
      GROUP BY month
      ORDER BY month
    `,
      [sixMonthsAgo.toISOString()]
    )

    for (const row of monthlyRows.rows) {
      if (row.month in monthlyMap) {
        monthlyMap[row.month] = row.cost_eur
      }
    }

    const thisMonthCost = this.round(monthlyMap[thisMonthKey] ?? 0)
    const lastMonthCost = this.round(monthlyMap[lastMonthKey] ?? 0)
    const monthOverMonthPct =
      lastMonthCost > 0
        ? Math.round(((thisMonthCost - lastMonthCost) / lastMonthCost) * 1000) / 10
        : null

    // Map recent processes with user names
    const userIds = [
      ...new Set(recentProcesses.map((p: any) => p.userId).filter(Boolean)),
    ] as number[]
    const usersNameMap = new Map<number, string>()
    if (userIds.length > 0) {
      const usersForNames = await User.query().whereIn('id', userIds).select('id', 'name')
      for (const u of usersForNames) {
        usersNameMap.set(u.id, u.name)
      }
    }

    const recentProcessesMapped = recentProcesses.map((p: any) => {
      const report = p.costReport as { totalCostInEur?: number } | null
      const sheet = p.processSheet as Record<string, any> | null
      let photosTotal = 0
      let photosCompleted = 0
      if (sheet) {
        for (const task of Object.values(sheet)) {
          if (Array.isArray(task)) {
            photosTotal = Math.max(photosTotal, task.length)
            photosCompleted = Math.max(
              photosCompleted,
              task.filter((t: any) => t.status === 'done').length
            )
          }
        }
      }
      return {
        id: p.id,
        userName: usersNameMap.get(p.userId) ?? null,
        currentStage: p.currentStage,
        photosTotal,
        photosCompleted,
        totalCostEur: this.round(report?.totalCostInEur ?? 0),
        createdAt: p.createdAt.toString(),
      }
    })

    return {
      users: {
        total: usersRow.total,
        active: usersRow.active,
        recentSignups: usersRow.recent_signups,
      },
      photos: {
        total: photosRow.total,
      },
      processes: {
        total: processesRow.total,
        active: processesRow.active,
        failed: processesRow.failed,
      },
      health: {
        globalScore,
        missingEmbeddings: healthRow.missing_embeddings,
        missingDescriptions: healthRow.missing_descriptions,
        missingColorHistogram: healthRow.missing_color,
        tagsWithoutEmbedding: tagsMissing.rows[0]?.cnt ?? 0,
        chunksWithoutEmbedding: chunksMissing.rows[0]?.cnt ?? 0,
      },
      costs: {
        totalCostEur: this.round(totalCostEur),
        thisMonthCostEur: thisMonthCost,
        lastMonthCostEur: lastMonthCost,
        monthOverMonthPct,
        totalCalls,
      },
      recentProcesses: recentProcessesMapped,
      monthlyTrend: Object.entries(monthlyMap).map(([month, costEur]) => ({
        month,
        costEur: this.round(costEur),
      })),
    }
  }
}
