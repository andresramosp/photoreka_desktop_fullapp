import ModelsService, { PRICES, USD_TO_EUR } from '#services/models_service'

// ─── Types ───────────────────────────────────────────────

export type CostCategory =
  | 'photo_analysis'
  | 'chat'
  | 'report_review'
  | 'search'
  | 'portfolio_build'
  | 'location_inference'
  | 'other'

export interface CostEntry {
  task: string
  model: string
  method: string
  type: 'direct' | 'batch'
  costInEur: number
  tokens: {
    input: number
    inputCached: number
    output: number
  }
}

export interface CostSummary {
  category: CostCategory
  totalCostInEur: number
  totalCalls: number
  entries: CostEntry[]
  byTask: Record<string, { costInEur: number; calls: number }>
  byModel: Record<string, { costInEur: number; calls: number }>
}

// ─── CostTracker ─────────────────────────────────────────

export class CostTracker {
  private entries: CostEntry[] = []
  public currentTask: string = 'unknown'

  constructor(private category: CostCategory) {}

  setCurrentTask(taskName: string) {
    this.currentTask = taskName
  }

  record(
    cost: any,
    model: string,
    method: string,
    type: 'direct' | 'batch' = 'direct',
    taskOverride?: string
  ) {
    if (!cost || typeof cost.totalCostInEur !== 'number') return

    this.entries.push({
      task: taskOverride ?? this.currentTask,
      model,
      method,
      type,
      costInEur: cost.totalCostInEur,
      tokens: {
        input: cost.promptCacheMissTokens ?? cost.promptTokens ?? 0,
        inputCached: cost.promptCacheHitTokens ?? 0,
        output: cost.completionTokens ?? 0,
      },
    })
  }

  getSummary(): CostSummary {
    const byTask: Record<string, { costInEur: number; calls: number }> = {}
    const byModel: Record<string, { costInEur: number; calls: number }> = {}

    for (const e of this.entries) {
      // byTask
      if (!byTask[e.task]) byTask[e.task] = { costInEur: 0, calls: 0 }
      byTask[e.task].costInEur += e.costInEur
      byTask[e.task].calls++

      // byModel
      if (!byModel[e.model]) byModel[e.model] = { costInEur: 0, calls: 0 }
      byModel[e.model].costInEur += e.costInEur
      byModel[e.model].calls++
    }

    // Round to avoid floating point noise
    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000
    for (const v of Object.values(byTask)) v.costInEur = round(v.costInEur)
    for (const v of Object.values(byModel)) v.costInEur = round(v.costInEur)

    return {
      category: this.category,
      totalCostInEur: round(this.entries.reduce((sum, e) => sum + e.costInEur, 0)),
      totalCalls: this.entries.length,
      entries: this.entries,
      byTask,
      byModel,
    }
  }

  getTotal(): number {
    return this.entries.reduce((sum, e) => sum + e.costInEur, 0)
  }

  /**
   * Vacía las entries acumuladas. Útil tras persistir/enviar el resumen de un
   * intento, para que el siguiente intento registre solo su delta.
   */
  reset(): void {
    this.entries = []
  }
}

/**
 * Combina dos CostSummary en uno nuevo. Se usa para acumular el coste real de
 * un proceso a lo largo de varios intentos (retries) sin sobreescribir el
 * resumen anterior.
 *
 * Asume misma `category`; si difieren, prevalece la de `a` (base).
 */
export function mergeCostSummaries(
  a: CostSummary | null | undefined,
  b: CostSummary | null | undefined
): CostSummary | null {
  if (!a && !b) return null
  if (!a) return { ...b!, entries: [...b!.entries] }
  if (!b) return { ...a, entries: [...a.entries] }

  const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000
  const mergedEntries: CostEntry[] = [...a.entries, ...b.entries]

  const byTask: Record<string, { costInEur: number; calls: number }> = {}
  const byModel: Record<string, { costInEur: number; calls: number }> = {}

  for (const e of mergedEntries) {
    if (!byTask[e.task]) byTask[e.task] = { costInEur: 0, calls: 0 }
    byTask[e.task].costInEur += e.costInEur
    byTask[e.task].calls++

    if (!byModel[e.model]) byModel[e.model] = { costInEur: 0, calls: 0 }
    byModel[e.model].costInEur += e.costInEur
    byModel[e.model].calls++
  }
  for (const v of Object.values(byTask)) v.costInEur = round(v.costInEur)
  for (const v of Object.values(byModel)) v.costInEur = round(v.costInEur)

  return {
    category: a.category,
    totalCostInEur: round(a.totalCostInEur + b.totalCostInEur),
    totalCalls: a.totalCalls + b.totalCalls,
    entries: mergedEntries,
    byTask,
    byModel,
  }
}

// ─── Proxy-based transparent tracking ────────────────────

/**
 * Methods whose return value includes a `cost` object that should be auto-tracked.
 * Maps method name → how to extract { model, type } from the call args.
 */
const TRACKED_METHODS: Record<
  string,
  {
    modelArgIndex: number
    type: 'direct' | 'batch'
  }
> = {
  getGPTResponse: { modelArgIndex: 2, type: 'direct' },
  getGeminiResponse: { modelArgIndex: 2, type: 'direct' },
  getQwenResponse: { modelArgIndex: 2, type: 'direct' },
  getDSResponse: { modelArgIndex: 2, type: 'direct' },
  getGrokResponse: { modelArgIndex: 2, type: 'direct' },
}

export function createTrackedModelsService(
  service: ModelsService,
  tracker: CostTracker,
  taskNameRef?: { name: string }
): ModelsService {
  return new Proxy(service, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value

      const methodName = String(prop)

      // Auto-track direct LLM calls
      const tracked = TRACKED_METHODS[methodName]
      if (tracked) {
        return async function (...args: any[]) {
          const taskName = taskNameRef?.name || tracker.currentTask
          const result = await value.apply(target, args)
          if (result?.cost) {
            const model = args[tracked.modelArgIndex] || 'unknown'
            tracker.record(result.cost, model, methodName, tracked.type, taskName)
          }
          return result
        }
      }

      // Auto-track batch results
      if (methodName === 'getBatchResults') {
        return async function (...args: any[]) {
          const taskName = taskNameRef?.name || tracker.currentTask
          const results = await value.apply(target, args)
          // Extract and record aggregated cost from batch response usage data
          recordGPTBatchCost(results, tracker, args[1], taskName)
          return results
        }
      }

      // For non-tracked methods, return as-is (bound to target)
      return value.bind(target)
    },
  })
}

/**
 * Extracts cost from GPT Batch API result lines (each has response.body.usage).
 */
function resolvePricesModel(model: string): keyof typeof PRICES | null {
  if (model in PRICES) return model as keyof typeof PRICES
  // Batch API returns versioned names like "gpt-5.1-2025-11-13"; match against PRICES keys by prefix
  const candidates = Object.keys(PRICES)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length) // longest prefix wins
  return (candidates[0] as keyof typeof PRICES) || null
}

function recordGPTBatchCost(
  results: any[],
  tracker: CostTracker,
  modelHint?: string,
  taskOverride?: string
) {
  for (const res of results) {
    const usage = res?.response?.body?.usage
    if (!usage) continue

    const rawModel = res?.response?.body?.model || modelHint || 'unknown'
    const resolvedKey = resolvePricesModel(rawModel)
    if (!resolvedKey) continue
    const model = rawModel
    const prices = PRICES[resolvedKey]

    const promptTokens = usage.prompt_tokens || 0
    const completionTokens = usage.completion_tokens || 0
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0
    const cacheMissTokens = promptTokens - cachedTokens

    const inputCost =
      cacheMissTokens * prices.input_cache_miss * USD_TO_EUR +
      cachedTokens * prices.input_cache_hit * USD_TO_EUR
    const outputCost = completionTokens * prices.output * USD_TO_EUR
    const totalCostInEur = inputCost + outputCost

    tracker.record(
      {
        totalCostInEur,
        promptCacheMissTokens: cacheMissTokens,
        promptCacheHitTokens: cachedTokens,
        completionTokens,
      },
      model,
      'getBatchResults',
      'batch',
      taskOverride
    )
  }
}
