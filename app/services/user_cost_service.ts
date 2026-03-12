import User from '#models/user'
import type { CostCategory, CostTracker } from '../utils/cost_tracker.js'

// ─── Types ───────────────────────────────────────────────

export interface CostHistory {
  totalCostInEur: number
  byCategory: Partial<Record<CostCategory, { costInEur: number; calls: number }>>
}

// ─── Service ─────────────────────────────────────────────

export default class UserCostService {
  private static round(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
  }

  /**
   * Record a cost entry for a user. Accumulates totals in the `cost_history` JSONB column.
   * Fire-and-forget safe — callers should `.catch(() => {})`.
   */
  static async record(
    userId: number,
    category: CostCategory,
    costInEur: number,
    calls: number = 1
  ): Promise<void> {
    if (!userId || costInEur <= 0) return

    const user = await User.find(userId)
    if (!user) return

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
  }

  /**
   * Record cost from a CostTracker instance (uses tracker's category and totals).
   */
  static async recordFromTracker(userId: number, tracker: CostTracker): Promise<void> {
    const summary = tracker.getSummary()
    if (summary.totalCostInEur <= 0) return
    await this.record(userId, summary.category, summary.totalCostInEur, summary.totalCalls)
  }
}
