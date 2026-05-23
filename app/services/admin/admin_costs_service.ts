// @ts-nocheck

import User from '#models/user'
import CostLog from '#models/cost_log'
import db from '@adonisjs/lucid/services/db'
import type { CostCategory } from '../../utils/cost_tracker.js'

// ─── Response interfaces ────────────────────────────────

export interface CostsTotals {
  totalCostEur: number
  thisMonthCostEur: number
  lastMonthCostEur: number
  monthOverMonthPct: number | null
  totalCalls: number
  avgCostPerCall: number
  totalUsers: number
}

export interface MonthlyDataPoint {
  month: string // 'YYYY-MM'
  costEur: number
  calls: number
  byCategory: Record<string, number>
}

export interface CategoryBreakdown {
  category: string
  costEur: number
  calls: number
  pct: number
}

export interface ModelBreakdown {
  model: string
  costEur: number
  calls: number
}

export interface TaskBreakdown {
  task: string
  costEur: number
  calls: number
}

export interface DailyDataPoint {
  date: string // 'YYYY-MM-DD'
  costEur: number
  calls: number
  byCategory: Record<string, number>
}

export interface TopUserCost {
  id: number
  name: string
  email: string
  totalCostEur: number
  thisMonthCostEur: number
  byCategory: Record<string, { costInEur: number; calls: number }>
}

export interface CostsOverview {
  totals: CostsTotals
  monthly: MonthlyDataPoint[]
  daily: DailyDataPoint[]
  byCategory: CategoryBreakdown[]
  byModel: ModelBreakdown[]
  byTask: TaskBreakdown[]
  topUsers: TopUserCost[]
}

// ─── Service ─────────────────────────────────────────────

export default class AdminCostsService {
  private static round(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
  }

  /**
   * Build the full costs overview dashboard payload.
   * All temporal data now comes from cost_logs table.
   * Falls back to user.costHistory for users who have legacy data without logs.
   */
  static async getOverview(dateFrom?: string, dateTo?: string): Promise<CostsOverview> {
    const now = new Date()
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

    // ── Date range filter ──
    let filterStart: Date | null = null
    let filterEnd: Date | null = null
    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      filterStart = new Date(dateFrom + 'T00:00:00.000Z')
    }
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      const d = new Date(dateTo + 'T00:00:00.000Z')
      d.setUTCDate(d.getUTCDate() + 1) // exclusive upper bound
      filterEnd = d
    }
    // Require both bounds; ignore partial ranges
    if (!filterStart || !filterEnd) {
      filterStart = null
      filterEnd = null
    }
    const filterClause = filterStart ? 'AND created_at >= ? AND created_at < ?' : ''
    const filterParams: string[] = filterStart
      ? [filterStart.toISOString(), filterEnd!.toISOString()]
      : []

    // ── 1. Monthly aggregation from cost_logs (last 12 months) ──
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    const monthlyRows = await db.rawQuery(
      `
      SELECT
        to_char(created_at, 'YYYY-MM') AS month,
        category,
        COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur,
        COALESCE(SUM(calls), 0)::int AS calls
      FROM cost_logs
      WHERE created_at >= ?
      GROUP BY month, category
      ORDER BY month
    `,
      [twelveMonthsAgo.toISOString()]
    )

    // Pre-fill last 12 months
    const monthlyMap: Record<
      string,
      { costEur: number; calls: number; byCategory: Record<string, number> }
    > = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { costEur: 0, calls: 0, byCategory: {} }
    }

    for (const row of monthlyRows.rows) {
      if (monthlyMap[row.month]) {
        monthlyMap[row.month].costEur += row.cost_eur
        monthlyMap[row.month].calls += row.calls
        monthlyMap[row.month].byCategory[row.category] =
          (monthlyMap[row.month].byCategory[row.category] || 0) + row.cost_eur
      }
    }

    // ── 2. Daily aggregation (last 30 days) ──
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const dailyRows = await db.rawQuery(
      `
      SELECT
        to_char(created_at, 'YYYY-MM-DD') AS date,
        category,
        COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur,
        COALESCE(SUM(calls), 0)::int AS calls
      FROM cost_logs
      WHERE created_at >= ?
      GROUP BY date, category
      ORDER BY date
    `,
      [thirtyDaysAgo.toISOString()]
    )

    // Pre-fill last 30 days
    const dailyMap: Record<
      string,
      { costEur: number; calls: number; byCategory: Record<string, number> }
    > = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      dailyMap[key] = { costEur: 0, calls: 0, byCategory: {} }
    }

    for (const row of dailyRows.rows) {
      if (dailyMap[row.date]) {
        dailyMap[row.date].costEur += row.cost_eur
        dailyMap[row.date].calls += row.calls
        dailyMap[row.date].byCategory[row.category] =
          (dailyMap[row.date].byCategory[row.category] || 0) + row.cost_eur
      }
    }

    // ── 3. Global totals from cost_logs ──
    const totalsRow = await db.rawQuery(`
      SELECT
        COALESCE(SUM(cost_in_eur), 0)::float AS total_cost,
        COALESCE(SUM(calls), 0)::int AS total_calls,
        COUNT(DISTINCT user_id)::int AS total_users
      FROM cost_logs
    `)

    const logTotalCost = totalsRow.rows[0]?.total_cost ?? 0
    const logTotalCalls = totalsRow.rows[0]?.total_calls ?? 0
    const logTotalUsers = totalsRow.rows[0]?.total_users ?? 0

    // Also get legacy accumulated totals from users who may have pre-migration data
    const legacyTotalsRow = await db.rawQuery(`
      SELECT COALESCE(SUM((cost_history->>'totalCostInEur')::float), 0)::float AS legacy_total
      FROM users
      WHERE cost_history IS NOT NULL
    `)
    const legacyTotal = legacyTotalsRow.rows[0]?.legacy_total ?? 0

    // Use the higher of the two as total (cost_logs will catch up over time)
    const globalTotalCost = Math.max(logTotalCost, legacyTotal)

    // This month / last month from cost_logs (accurate temporal data)
    const thisMonthCost = monthlyMap[thisMonthKey]?.costEur ?? 0
    const lastMonthCost = monthlyMap[lastMonthKey]?.costEur ?? 0
    const monthOverMonthPct =
      lastMonthCost > 0 ? this.round(((thisMonthCost - lastMonthCost) / lastMonthCost) * 100) : null

    // ── 4. Category breakdown from cost_logs ──
    const categoryRows = await db.rawQuery(
      `
      SELECT
        category,
        COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur,
        COALESCE(SUM(calls), 0)::int AS calls
      FROM cost_logs
      WHERE true ${filterClause}
      GROUP BY category
      ORDER BY cost_eur DESC
    `,
      filterParams
    )

    const categoryTotal = categoryRows.rows.reduce((s: number, r: any) => s + r.cost_eur, 0)
    const byCategory: CategoryBreakdown[] = categoryRows.rows.map((r: any) => ({
      category: r.category,
      costEur: this.round(r.cost_eur),
      calls: r.calls,
      pct: categoryTotal > 0 ? this.round((r.cost_eur / categoryTotal) * 100) : 0,
    }))

    // ── 5. Model breakdown from cost_logs ──
    const modelRows = await db.rawQuery(
      `
      SELECT
        COALESCE(model, 'unknown') AS model,
        COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur,
        COALESCE(SUM(calls), 0)::int AS calls
      FROM cost_logs
      WHERE model IS NOT NULL ${filterClause}
      GROUP BY model
      ORDER BY cost_eur DESC
    `,
      filterParams
    )

    const byModel: ModelBreakdown[] = modelRows.rows.map((r: any) => ({
      model: r.model,
      costEur: this.round(r.cost_eur),
      calls: r.calls,
    }))

    // ── 6. Task breakdown from cost_logs ──
    const taskRows = await db.rawQuery(
      `
      SELECT
        COALESCE(task, 'unknown') AS task,
        COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur,
        COALESCE(SUM(calls), 0)::int AS calls
      FROM cost_logs
      WHERE task IS NOT NULL ${filterClause}
      GROUP BY task
      ORDER BY cost_eur DESC
    `,
      filterParams
    )

    const byTask: TaskBreakdown[] = taskRows.rows.map((r: any) => ({
      task: r.task,
      costEur: this.round(r.cost_eur),
      calls: r.calls,
    }))

    // ── 7. Top users (from cost_logs, enriched with user info) ──
    const topUserRows = await db.rawQuery(
      `
      SELECT
        cl.user_id,
        u.name,
        u.email,
        COALESCE(SUM(cl.cat_cost), 0)::float AS total_cost_eur,
        json_object_agg(
          cl.category,
          json_build_object('costInEur', cl.cat_cost, 'calls', cl.cat_calls)
        ) AS by_category
      FROM (
        SELECT
          user_id,
          category,
          SUM(cost_in_eur)::float AS cat_cost,
          SUM(calls)::int AS cat_calls
        FROM cost_logs
        WHERE true ${filterClause}
        GROUP BY user_id, category
      ) cl
      JOIN users u ON u.id = cl.user_id
      GROUP BY cl.user_id, u.name, u.email
      ORDER BY total_cost_eur DESC
      LIMIT 15
    `,
      filterParams
    )

    // Get this month's cost per top user
    const topUserIds = topUserRows.rows.map((r: any) => r.user_id)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let thisMonthByUser: Record<number, number> = {}
    if (filterStart) {
      // When filtering by month, thisMonthCost = the filtered period's cost
      for (const r of topUserRows.rows) {
        thisMonthByUser[r.user_id] = r.total_cost_eur
      }
    } else if (topUserIds.length > 0) {
      const thisMonthUserRows = await db.rawQuery(
        `
        SELECT
          user_id,
          COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur
        FROM cost_logs
        WHERE user_id = ANY(?)
          AND created_at >= ?
        GROUP BY user_id
      `,
        [topUserIds, thisMonthStart.toISOString()]
      )

      for (const r of thisMonthUserRows.rows) {
        thisMonthByUser[r.user_id] = r.cost_eur
      }
    }

    const topUsers: TopUserCost[] = topUserRows.rows.map((r: any) => ({
      id: r.user_id,
      name: r.name,
      email: r.email,
      totalCostEur: this.round(r.total_cost_eur),
      thisMonthCostEur: this.round(thisMonthByUser[r.user_id] ?? 0),
      byCategory: r.by_category ?? {},
    }))

    // ── 8. Assemble ──
    const totals: CostsTotals = {
      totalCostEur: this.round(globalTotalCost),
      thisMonthCostEur: this.round(thisMonthCost),
      lastMonthCostEur: this.round(lastMonthCost),
      monthOverMonthPct,
      totalCalls: logTotalCalls,
      avgCostPerCall: logTotalCalls > 0 ? this.round(globalTotalCost / logTotalCalls) : 0,
      totalUsers: logTotalUsers,
    }

    const monthly: MonthlyDataPoint[] = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        costEur: this.round(data.costEur),
        calls: data.calls,
        byCategory: Object.fromEntries(
          Object.entries(data.byCategory).map(([k, v]) => [k, this.round(v)])
        ),
      }))

    const daily: DailyDataPoint[] = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        costEur: this.round(data.costEur),
        calls: data.calls,
        byCategory: Object.fromEntries(
          Object.entries(data.byCategory).map(([k, v]) => [k, this.round(v)])
        ),
      }))

    return { totals, monthly, daily, byCategory, byModel, byTask, topUsers }
  }
}
