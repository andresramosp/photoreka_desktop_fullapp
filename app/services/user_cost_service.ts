import CostLog from '#models/cost_log'
import CreditService from '#services/credit_service'
import type { CostCategory, CostSummary, CostTracker } from '../utils/cost_tracker.js'
import type { CostCategory as CreditCategory } from '#services/credit_service'

// ─── Types ───────────────────────────────────────────────

export interface CostHistory {
  totalCostInEur: number
  byCategory: Partial<Record<CostCategory, { costInEur: number; calls: number }>>
}

export interface CostLogOptions {
  model?: string
  task?: string
  referenceId?: string
  /** Explicit credits charged (overrides auto-computed). Use for fixed-price charges. */
  creditsCharged?: number
  /** Explicit margin multiplier (null = fixed price, no multiplier). Overrides auto-computed. */
  marginMultiplier?: number | null
  /**
   * Operation was served from the daily free allowance: the company still paid the
   * underlying cost (costInEur), but the user was NOT charged. The would-be charge is
   * recorded as `metadata.creditsWaived` and `creditsCharged` is forced to 0.
   */
  free?: boolean
  metadata?: Record<string, any>
}

export interface RecordFromTrackerOptions {
  free?: boolean
  /**
   * Optional credit billing category override used to compute credits/margin in logs.
   * Useful when tracker category is coarse (e.g. "search") but billing is finer
   * (e.g. SEARCH_PRECISE / SEARCH_INSIGHTS).
   */
  billingCategory?: CreditCategory
}

// ─── Service ─────────────────────────────────────────────

export default class UserCostService {
  private static readonly OPENAI_BATCH_DISCOUNT_MULTIPLIER = 0.5

  private static round(n: number): number {
    return Math.round(n * 1_000_000) / 1_000_000
  }

  /**
   * Maps cost_tracker categories to CreditService billing categories.
   * Categories not present here (photo_analysis, other) are quota-based and don't charge credits.
   */
  private static readonly CREDIT_CATEGORY_MAP: Partial<Record<CostCategory, CreditCategory>> = {
    chat: 'CHAT',
    chat_knowledge_assistant: 'CHAT_KNOWLEDGE_ASSISTANT',
    search: 'SEARCH',
    portfolio_build: 'PORTFOLIO_BUILD',
    location_inference: 'GEO_INFERENCE',
  }

  /**
   * Compute credits and margin for a cost entry.
   *
   * If `billingCategoryOverride` is provided, it takes precedence over the
   * tracker category mapping and is used for margin/credits computation.
   * Returns null for categories that don't bill credits.
   */
  private static computeCredits(
    category: CostCategory,
    costInEur: number,
    billingCategoryOverride?: CreditCategory
  ): { creditsCharged: number; marginMultiplier: number } | null {
    const billingCategory = billingCategoryOverride ?? this.CREDIT_CATEGORY_MAP[category]
    if (!billingCategory) return null

    const multiplier = CreditService.getCostMultiplier(billingCategory)
    const credits = CreditService.eurToCredits(costInEur * multiplier)
    return { creditsCharged: credits, marginMultiplier: multiplier }
  }

  /**
   * Record a cost entry for a user. Inserts a row into `cost_logs` for temporal tracking.
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

    // Insert temporal log entry
    const isFixedCharge = options?.metadata?.fixedCharge === true
    const fixedCredits =
      typeof options?.metadata?.credits === 'number' ? options.metadata.credits : undefined
    const creditInfo = isFixedCharge ? null : this.computeCredits(category, costInEur)

    // Credits the user would have been charged if this were not free.
    const wouldBeCredits =
      options?.creditsCharged !== undefined
        ? options.creditsCharged
        : (fixedCredits ?? creditInfo?.creditsCharged ?? null)

    const isFree = options?.free === true

    await CostLog.create({
      userId,
      category,
      costInEur: this.round(costInEur),
      calls,
      model: options?.model ?? null,
      task: options?.task ?? null,
      referenceId: options?.referenceId ?? null,
      creditsCharged: isFree ? 0 : wouldBeCredits,
      marginMultiplier: isFree
        ? null
        : 'marginMultiplier' in (options ?? {})
          ? (options!.marginMultiplier ?? null)
          : isFixedCharge
            ? null
            : (creditInfo?.marginMultiplier ?? null),
      metadata: isFree
        ? { ...(options?.metadata ?? {}), free: true, creditsWaived: wouldBeCredits ?? 0 }
        : (options?.metadata ?? null),
    })
  }

  /**
   * Record cost from a CostTracker instance (uses tracker's category and totals).
   * Writes individual entries per model to cost_logs for granular tracking.
   */
  static async recordFromTracker(
    userId: number,
    tracker: CostTracker,
    referenceId?: string,
    freeOrOptions: boolean | RecordFromTrackerOptions = false
  ): Promise<void> {
    const free = typeof freeOrOptions === 'boolean' ? freeOrOptions : freeOrOptions?.free === true
    const billingCategory =
      typeof freeOrOptions === 'boolean' ? undefined : freeOrOptions?.billingCategory

    return this.recordSummary(userId, tracker.getSummary(), referenceId, free, billingCategory)
  }

  /**
   * Record cost directly from a CostSummary (already aggregated).
   * Útil cuando la capa superior calcula el "delta" real de un intento y no
   * quiere que se vuelva a acumular el tracker entre retries.
   */
  static async recordSummary(
    userId: number,
    summary: CostSummary,
    referenceId?: string,
    free: boolean = false,
    billingCategory?: CreditCategory
  ): Promise<void> {
    if (!userId || summary.totalCostInEur <= 0) return

    const groupedEntries = this.groupEntriesByTaskModelAndType(summary)

    if (groupedEntries.length === 0) {
      groupedEntries.push({
        task: null,
        model: null,
        type: 'direct',
        costInEur: this.round(summary.totalCostInEur),
        calls: summary.totalCalls || 1,
        methods: [],
        tokens: { input: 0, inputCached: 0, output: 0 },
      })
    }

    for (const data of groupedEntries) {
      const creditInfo = this.computeCredits(summary.category, data.costInEur, billingCategory)

      await CostLog.create({
        userId,
        category: summary.category,
        costInEur: this.round(data.costInEur),
        calls: data.calls,
        model: data.model,
        task: data.task,
        referenceId: referenceId ?? null,
        creditsCharged: free ? 0 : (creditInfo?.creditsCharged ?? null),
        marginMultiplier: free ? null : (creditInfo?.marginMultiplier ?? null),
        metadata: {
          ...(free ? { free: true, creditsWaived: creditInfo?.creditsCharged ?? 0 } : {}),
          type: data.type,
          methods: data.methods,
          tokens: data.tokens,
          audit: {
            hasBatchCalls: data.type === 'batch',
            directCalls: data.type === 'direct' ? data.calls : 0,
            batchCalls: data.type === 'batch' ? data.calls : 0,
            directCostInEur: data.type === 'direct' ? this.round(data.costInEur) : 0,
            batchCostInEur: data.type === 'batch' ? this.round(data.costInEur) : 0,
            batchDiscountApplied:
              data.type === 'batch' ? this.OPENAI_BATCH_DISCOUNT_MULTIPLIER : null,
          },
        },
      })
    }
  }

  private static groupEntriesByTaskModelAndType(summary: CostSummary): Array<{
    task: string | null
    model: string | null
    type: 'direct' | 'batch'
    costInEur: number
    calls: number
    methods: string[]
    tokens: { input: number; inputCached: number; output: number }
  }> {
    const groups = new Map<
      string,
      {
        task: string | null
        model: string | null
        type: 'direct' | 'batch'
        costInEur: number
        calls: number
        methods: Set<string>
        tokens: { input: number; inputCached: number; output: number }
      }
    >()

    for (const entry of summary.entries) {
      const task = entry.task || null
      const model = entry.model || null
      const type = entry.type
      const key = `${task ?? 'unknown'}::${model ?? 'unknown'}::${type}`
      const group = groups.get(key) ?? {
        task,
        model,
        type,
        costInEur: 0,
        calls: 0,
        methods: new Set<string>(),
        tokens: { input: 0, inputCached: 0, output: 0 },
      }

      group.costInEur += entry.costInEur
      group.calls += 1
      group.methods.add(entry.method)
      group.tokens.input += entry.tokens.input
      group.tokens.inputCached += entry.tokens.inputCached
      group.tokens.output += entry.tokens.output
      groups.set(key, group)
    }

    return Array.from(groups.values()).map((group) => ({
      task: group.task,
      model: group.model,
      type: group.type,
      costInEur: this.round(group.costInEur),
      calls: group.calls,
      methods: Array.from(group.methods),
      tokens: group.tokens,
    }))
  }
}
