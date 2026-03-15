// @ts-nocheck

import User from '#models/user'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import db from '@adonisjs/lucid/services/db'
import type { CostCategory } from '../../utils/cost_tracker.js'

// ─── Response interfaces ────────────────────────────────

export interface CostsTotals {
  totalCostEur: number
  thisMonthCostEur: number
  lastMonthCostEur: number
  monthOverMonthPct: number | null
  totalCalls: number
  avgCostPerProcess: number
  totalProcesses: number
  totalUsers: number
}

export interface MonthlyDataPoint {
  month: string // 'YYYY-MM'
  costEur: number
  calls: number
  processes: number
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

export interface TopUserCost {
  id: number
  name: string
  email: string
  totalCostEur: number
  processesCount: number
  byCategory: Record<string, { costInEur: number; calls: number }>
}

export interface CostsOverview {
  totals: CostsTotals
  monthly: MonthlyDataPoint[]
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
   */
  static async getOverview(): Promise<CostsOverview> {
    // ── 1. Aggregate user-level costs (for totals + categories + top users) ──
    const users = await User.query().select('id', 'name', 'email', 'costHistory')

    let globalTotalCost = 0
    let globalTotalCalls = 0
    const categoryAgg: Record<string, { costEur: number; calls: number }> = {}
    const topUsersRaw: TopUserCost[] = []

    for (const u of users) {
      const history = u.costHistory as {
        totalCostInEur?: number
        byCategory?: Record<string, { costInEur: number; calls: number }>
      } | null

      if (!history) continue

      const userCost = history.totalCostInEur ?? 0
      globalTotalCost += userCost

      const byCategory = history.byCategory ?? {}
      let userCalls = 0

      for (const [cat, val] of Object.entries(byCategory)) {
        if (!categoryAgg[cat]) categoryAgg[cat] = { costEur: 0, calls: 0 }
        categoryAgg[cat].costEur += val.costInEur
        categoryAgg[cat].calls += val.calls
        globalTotalCalls += val.calls
        userCalls += val.calls
      }

      if (userCost > 0) {
        topUsersRaw.push({
          id: u.id,
          name: u.name,
          email: u.email,
          totalCostEur: this.round(userCost),
          processesCount: 0, // filled below
          byCategory,
        })
      }
    }

    // ── 2. Process-level data (for monthly chart, by-model, by-task, per-user process count) ──
    const processes = await AnalyzerProcess.query()
      .where('isPreprocess', false)
      .whereNotNull('user_id')
      .whereNotNull('cost_report')
      .select('id', 'userId', 'costReport', 'createdAt')

    // Monthly aggregation (last 12 months)
    const now = new Date()
    const monthlyMap: Record<string, { costEur: number; calls: number; processes: number }> = {}

    // Pre-fill last 12 months with zeros
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { costEur: 0, calls: 0, processes: 0 }
    }

    const modelAgg: Record<string, { costEur: number; calls: number }> = {}
    const taskAgg: Record<string, { costEur: number; calls: number }> = {}
    const userProcessCount = new Map<number, number>()

    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

    for (const p of processes) {
      const report = p.costReport as {
        totalCostInEur?: number
        totalCalls?: number
        byModel?: Record<string, { costInEur: number; calls: number }>
        byTask?: Record<string, { costInEur: number; calls: number }>
      } | null

      if (!report) continue

      // Monthly
      const createdAt = p.createdAt?.toJSDate?.() ?? new Date(p.createdAt as any)
      const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
      if (monthlyMap[monthKey]) {
        monthlyMap[monthKey].costEur += report.totalCostInEur ?? 0
        monthlyMap[monthKey].calls += report.totalCalls ?? 0
        monthlyMap[monthKey].processes++
      }

      // By model
      if (report.byModel) {
        for (const [model, val] of Object.entries(report.byModel)) {
          if (!modelAgg[model]) modelAgg[model] = { costEur: 0, calls: 0 }
          modelAgg[model].costEur += val.costInEur
          modelAgg[model].calls += val.calls
        }
      }

      // By task
      if (report.byTask) {
        for (const [task, val] of Object.entries(report.byTask)) {
          if (!taskAgg[task]) taskAgg[task] = { costEur: 0, calls: 0 }
          taskAgg[task].costEur += val.costInEur
          taskAgg[task].calls += val.calls
        }
      }

      // Per-user process count
      if (p.userId) {
        userProcessCount.set(p.userId, (userProcessCount.get(p.userId) || 0) + 1)
      }
    }

    // ── 3. Assemble totals ──
    const thisMonthCost = monthlyMap[thisMonthKey]?.costEur ?? 0
    const lastMonthCost = monthlyMap[lastMonthKey]?.costEur ?? 0
    const monthOverMonthPct =
      lastMonthCost > 0 ? this.round(((thisMonthCost - lastMonthCost) / lastMonthCost) * 100) : null

    const totalProcesses = processes.length
    const avgCostPerProcess = totalProcesses > 0 ? this.round(globalTotalCost / totalProcesses) : 0

    const usersWithCost = topUsersRaw.length

    const totals: CostsTotals = {
      totalCostEur: this.round(globalTotalCost),
      thisMonthCostEur: this.round(thisMonthCost),
      lastMonthCostEur: this.round(lastMonthCost),
      monthOverMonthPct,
      totalCalls: globalTotalCalls,
      avgCostPerProcess,
      totalProcesses,
      totalUsers: usersWithCost,
    }

    // ── 4. Monthly array (sorted chronologically) ──
    const monthly: MonthlyDataPoint[] = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        costEur: this.round(data.costEur),
        calls: data.calls,
        processes: data.processes,
      }))

    // ── 5. Category breakdown with percentages ──
    const byCategory: CategoryBreakdown[] = Object.entries(categoryAgg)
      .map(([category, data]) => ({
        category,
        costEur: this.round(data.costEur),
        calls: data.calls,
        pct: globalTotalCost > 0 ? this.round((data.costEur / globalTotalCost) * 100) : 0,
      }))
      .sort((a, b) => b.costEur - a.costEur)

    // ── 6. Model breakdown ──
    const byModel: ModelBreakdown[] = Object.entries(modelAgg)
      .map(([model, data]) => ({
        model,
        costEur: this.round(data.costEur),
        calls: data.calls,
      }))
      .sort((a, b) => b.costEur - a.costEur)

    // ── 7. Task breakdown ──
    const byTask: TaskBreakdown[] = Object.entries(taskAgg)
      .map(([task, data]) => ({
        task,
        costEur: this.round(data.costEur),
        calls: data.calls,
      }))
      .sort((a, b) => b.costEur - a.costEur)

    // ── 8. Top users (top 15, with process counts) ──
    for (const tu of topUsersRaw) {
      tu.processesCount = userProcessCount.get(tu.id) || 0
    }
    const topUsers = topUsersRaw.sort((a, b) => b.totalCostEur - a.totalCostEur).slice(0, 15)

    return { totals, monthly, byCategory, byModel, byTask, topUsers }
  }
}
