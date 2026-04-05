import User from '#models/user'
import CostLog from '#models/cost_log'
import type { CostCategory, CostTracker } from '../utils/cost_tracker.js'

// ─── Types ───────────────────────────────────────────────

export interface CostHistory {
  totalCostInEur: number
  byCategory: Partial<Record<CostCategory, { costInEur: number; calls: number }>>
}

export interface CostLogOptions {
  model?: string
  task?: string
  referenceId?: string
  metadata?: Record<string, any>
}

// ─── Service ─────────────────────────────────────────────

export default class UserCostService {
  private static round(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
  }

  /**
   * Record a cost entry for a user. Accumulates totals in the `cost_history` JSONB column
   * AND inserts a row into `cost_logs` for temporal tracking.
   * Fire-and-forget safe — callers should `.catch(() => {})`.
   */
  static async record(
    userId: number,
    category: CostCategory,
    costInEur: number,
    calls: number = 1,
    options?: CostLogOptions
  ): Promise<void> {
    if (!userId || costInEur <= 0) return

    const user = await User.find(userId)
    if (!user) return

    // 1. Update accumulated user history (existing behavior)
    const history: CostHistory = user.costHistory ?? { totalCostInEur: 0, byCategory: {} }

    history.totalCostInEur = this.round((history.totalCostInEur || 0) + costInEur)

    if (!history.byCategory[category]) {
      history.byCategory[category] = { costInEur: 0, calls: 0 }
    }
    history.byCategory[category]!.costInEur = this.round(
      history.byCategory[category]!.costInEur + costInEur
    )
    history.byCategory[category]!.calls += calls

    user.costHistory = history
    await user.save()

    // 2. Insert temporal log entry
    await CostLog.create({
      userId,
      category,
      costInEur: this.round(costInEur),
      calls,
      model: options?.model ?? null,
      task: options?.task ?? null,
      referenceId: options?.referenceId ?? null,
      metadata: options?.metadata ?? null,
    })
  }

  /**
   * Record cost from a CostTracker instance (uses tracker's category and totals).
   * Writes individual entries per model to cost_logs for granular tracking.
   */
  static async recordFromTracker(
    userId: number,
    tracker: CostTracker,
    referenceId?: string
  ): Promise<void> {
    const summary = tracker.getSummary()
    if (summary.totalCostInEur <= 0) return

    // Update accumulated user history (single aggregated call)
    const user = await User.find(userId)
    if (!user) return

    const history: CostHistory = user.costHistory ?? { totalCostInEur: 0, byCategory: {} }
    history.totalCostInEur = this.round((history.totalCostInEur || 0) + summary.totalCostInEur)

    if (!history.byCategory[summary.category]) {
      history.byCategory[summary.category] = { costInEur: 0, calls: 0 }
    }
    history.byCategory[summary.category]!.costInEur = this.round(
      history.byCategory[summary.category]!.costInEur + summary.totalCostInEur
    )
    history.byCategory[summary.category]!.calls += summary.totalCalls

    user.costHistory = history
    await user.save()

    // Insert granular log entries per model for detailed temporal tracking
    for (const [model, data] of Object.entries(summary.byModel)) {
      // Find the dominant task for this model (best effort)
      const taskForModel = this.findDominantTaskForModel(summary, model)

      await CostLog.create({
        userId,
        category: summary.category,
        costInEur: this.round(data.costInEur),
        calls: data.calls,
        model,
        task: taskForModel,
        referenceId: referenceId ?? null,
        metadata: {
          byTask: summary.byTask,
        },
      })
    }
  }

  /**
   * Find the task with highest cost for a given model in the summary.
   */
  private static findDominantTaskForModel(
    summary: ReturnType<CostTracker['getSummary']>,
    _model: string
  ): string | null {
    const tasks = Object.entries(summary.byTask)
    if (tasks.length === 0) return null
    if (tasks.length === 1) return tasks[0][0]
    // Return the highest-cost task as a representative
    return tasks.sort((a, b) => b[1].costInEur - a[1].costInEur)[0][0]
  }
}
