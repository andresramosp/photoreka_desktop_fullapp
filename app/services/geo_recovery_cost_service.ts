import GeoRecoveryCostLog from '#models/geo_recovery_cost_log'
import type { CostCategory, CostSummary, CostTracker } from '../utils/cost_tracker.js'

// ─── Types ───────────────────────────────────────────────

export interface GeoRecoveryCostLogOptions {
  model?: string
  task?: string
  referenceId?: string
  metadata?: Record<string, any>
}

// ─── Service ─────────────────────────────────────────────

export default class GeoRecoveryCostService {
  private static round(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
  }

  /**
   * Record a cost entry for a geo recovery payment. Inserts a row into `geo_recovery_cost_logs` for tracking.
   * Fire-and-forget safe — callers should `.catch(() => {})`.
   */
  static async record(
    geoRecoveryPaymentId: number,
    category: CostCategory,
    costInEur: number,
    calls: number = 1,
    options?: GeoRecoveryCostLogOptions
  ): Promise<void> {
    if (!geoRecoveryPaymentId || costInEur <= 0) return

    await GeoRecoveryCostLog.create({
      geoRecoveryPaymentId,
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
   * Writes individual entries per model to geo_recovery_cost_logs for granular tracking.
   */
  static async recordFromTracker(
    geoRecoveryPaymentId: number,
    tracker: CostTracker,
    referenceId?: string
  ): Promise<void> {
    return this.recordSummary(geoRecoveryPaymentId, tracker.getSummary(), referenceId)
  }

  /**
   * Record cost directly from a CostSummary (already aggregated).
   * Useful when the upper layer calculates the "delta" real of an attempt and doesn't
   * want to re-accumulate the tracker between retries.
   */
  static async recordSummary(
    geoRecoveryPaymentId: number,
    summary: CostSummary,
    referenceId?: string
  ): Promise<void> {
    if (!geoRecoveryPaymentId || summary.totalCostInEur <= 0) return

    // Insert granular log entries per model for detailed temporal tracking
    for (const [model, data] of Object.entries(summary.byModel)) {
      // Find the dominant task for this model (best effort)
      const taskForModel = this.findDominantTaskForModel(summary, model)

      await GeoRecoveryCostLog.create({
        geoRecoveryPaymentId,
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
    model: string
  ): string | null {
    const tasksForModel = summary.entries.filter((e) => e.model === model)
    if (tasksForModel.length === 0) return null

    const taskCosts = tasksForModel.reduce(
      (acc, e) => {
        acc[e.task] = (acc[e.task] ?? 0) + e.costInEur
        return acc
      },
      {} as Record<string, number>
    )

    const dominantTask = Object.entries(taskCosts).sort((a, b) => b[1] - a[1])[0]
    return dominantTask?.[0] ?? null
  }

  /**
   * Get total cost for a geo recovery payment by summing all related cost logs.
   */
  static async getTotalCost(geoRecoveryPaymentId: number): Promise<number> {
    const logs = await GeoRecoveryCostLog.query()
      .where('geo_recovery_payment_id', geoRecoveryPaymentId)
      .select('cost_in_eur')

    return this.round(logs.reduce((sum, log) => sum + log.costInEur, 0))
  }

  /**
   * Get cost breakdown by category for a geo recovery payment.
   */
  static async getCostBreakdown(
    geoRecoveryPaymentId: number
  ): Promise<Partial<Record<CostCategory, { costInEur: number; calls: number }>>> {
    const logs = await GeoRecoveryCostLog.query()
      .where('geo_recovery_payment_id', geoRecoveryPaymentId)
      .select('category', 'cost_in_eur', 'calls')

    const breakdown: Partial<Record<CostCategory, { costInEur: number; calls: number }>> = {}

    for (const log of logs) {
      if (!breakdown[log.category]) {
        breakdown[log.category] = { costInEur: 0, calls: 0 }
      }
      breakdown[log.category]!.costInEur += log.costInEur
      breakdown[log.category]!.calls += log.calls
    }

    // Round costs
    for (const data of Object.values(breakdown)) {
      data.costInEur = this.round(data.costInEur)
    }

    return breakdown
  }
}
