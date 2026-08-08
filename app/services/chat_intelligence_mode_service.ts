import { PRICES } from './models_service.js'

/**
 * Phase 2 reasoning budget (Gemini 3 `thinkingLevel`). Left undefined, the model
 * keeps its own default — which is what every mode did before this field existed,
 * so `undefined` is the behaviour-preserving value, not a neutral placeholder.
 */
export type ThinkingLevel = 'low' | 'medium' | 'high'

export type ChatIntelligenceModeDefinition = {
  id: string
  name: string
  description: string
  modelPhase1: string
  modelPhase2Cheap: string
  modelPhase2Expensive: string
  modelPhase2Lite: string
  /**
   * Reasoning budget for the Phase 2 curator call. This is the ONLY axis on
   * which `curator_plus` differs from `default` — same model, more thinking —
   * so the two can be A/B'd without confounding the model swap with the budget.
   */
  thinkingLevelPhase2?: ThinkingLevel
  costFactor?: number
  /**
   * Hidden modes resolve by id but are never offered in the UI. Lets a mode be
   * exercised end-to-end (pass its id explicitly) before it is billed to users.
   */
  hidden?: boolean
}

export type ChatIntelligenceModeWithCost = Omit<
  ChatIntelligenceModeDefinition,
  | 'modelPhase1'
  | 'modelPhase2Cheap'
  | 'modelPhase2Expensive'
  | 'modelPhase2Lite'
  | 'thinkingLevelPhase2'
  | 'hidden'
> & {
  costFactor: number
}

const CHAT_INTELLIGENCE_MODES: ReadonlyArray<ChatIntelligenceModeDefinition> = [
  {
    id: 'scout',
    name: 'Scout',
    description: 'Quick exploration and broad analysis at cheaper cost.',
    modelPhase1: 'gemini-3.1-flash-lite',
    modelPhase2Cheap: 'gemini-3.1-flash-lite',
    modelPhase2Expensive: 'gemini-3.1-flash-lite',
    modelPhase2Lite: 'gemini-3.1-flash-lite',
    // modelPhase1: 'gemini-2.5-flash-lite',
    // modelPhase2Cheap: 'gemini-2.5-flash-lite',
    // modelPhase2Expensive: 'gemini-2.5-flash-lite',
    // modelPhase2Lite: 'gemini-2.5-flash-lite',
    thinkingLevelPhase2: 'medium',
    costFactor: 0.5,
  },
  {
    id: 'default',
    name: 'Curator',
    description: 'Best balance for curation and analysis at standard cost.',
    modelPhase1: 'gemini-3-flash-preview',
    modelPhase2Cheap: 'gemini-3-flash-preview',
    modelPhase2Expensive: 'gemini-3-flash-preview',
    modelPhase2Lite: 'gemini-3.1-flash-lite',
    // modelPhase1: 'gemini-2.5-flash',
    // modelPhase2Cheap: 'gemini-2.5-flash',
    // modelPhase2Expensive: 'gemini-2.5-flash',
    // modelPhase2Lite: 'gemini-2.5-flash',
    costFactor: 1,
  },
  {
    id: 'curator_plus',
    name: 'Curator High', // Para casos que demandan inteligencia estética profunda
    description: 'Optimized for tasks that require a deeper aesthetic intelligence. High cost.',
    // Deliberately the SAME Phase 2 model as `default`. The hypothesis under test is
    // that Gemini 3 already reads a photograph well and it is the thin reasoning
    // budget that flattens the verdict into convention — so the only variable moved
    // here is `thinkingLevelPhase2`. Swapping the model too (gemini-3-pro / gpt-5.5,
    // below) would confound the two and tell us nothing about which one paid off.
    modelPhase1: 'gemini-3-flash-preview',
    modelPhase2Cheap: 'gemini-3-flash-preview',
    modelPhase2Expensive: 'gemini-3.6-flash',
    modelPhase2Lite: 'gemini-3.1-flash-lite',
    thinkingLevelPhase2: 'medium',
    // Thinking tokens bill as output. 2x is a placeholder — measure real turns with
    // the agent's cost log before charging users for it.
    costFactor: 3,
    hidden: false, // flip to false (or delete) to offer it in the UI
    // ── Next rung, once the thinking-only variant has been measured: ──
    // modelPhase2Cheap: 'gemini-3-pro-preview',
    // modelPhase2Expensive: 'gemini-3-pro-preview',
  },
  // {
  //   id: 'detail',
  //   name: 'Detail',
  //   description: 'Keeps the stronger final model even for lighter chat turns.',
  //   modelPhase1: 'gemini-3-flash-preview',
  //   modelPhase2Cheap: 'gemini-3-flash-preview',
  //   modelPhase2Expensive: 'gemini-3-flash-preview',
  //   modelPhase2Lite: 'gemini-3-flash-preview',
  // },
]

const DEFAULT_CHAT_INTELLIGENCE_MODE_ID = 'default'

function getModelUnitCost(modelName: string): number {
  const price = PRICES[modelName as keyof typeof PRICES]
  if (!price) return 0
  return price.input_cache_miss + price.output
}

function getModeCostScore(mode: ChatIntelligenceModeDefinition): number {
  return (
    (getModelUnitCost(mode.modelPhase1) +
      getModelUnitCost(mode.modelPhase2Cheap) +
      getModelUnitCost(mode.modelPhase2Expensive) +
      getModelUnitCost(mode.modelPhase2Lite)) /
    4
  )
}

export function listChatIntelligenceModes(): ChatIntelligenceModeWithCost[] {
  // Hidden modes stay resolvable by id but are never advertised to the client.
  const visibleModes = CHAT_INTELLIGENCE_MODES.filter((mode) => !mode.hidden)
  const hasManualOverrides = visibleModes.some((mode) => mode.costFactor !== undefined)

  if (hasManualOverrides) {
    return visibleModes.map((mode) => ({
      id: mode.id,
      name: mode.name,
      description: mode.description,
      costFactor: mode.costFactor ?? 1,
    }))
  }

  const scores = visibleModes.map((mode) => ({
    mode,
    score: getModeCostScore(mode),
  }))
  const minScore = Math.min(...scores.map((s) => s.score))
  return scores.map(({ mode, score }) => ({
    id: mode.id,
    name: mode.name,
    description: mode.description,
    costFactor: minScore > 0 ? Math.round((score / minScore) * 10) / 10 : 1,
  }))
}

export function getDefaultChatIntelligenceModeId(): string {
  return DEFAULT_CHAT_INTELLIGENCE_MODE_ID
}

export function findChatIntelligenceMode(
  modeId?: string | null
): ChatIntelligenceModeDefinition | null {
  if (!modeId) return null
  return CHAT_INTELLIGENCE_MODES.find((mode) => mode.id === modeId) ?? null
}

export function resolveChatIntelligenceMode(
  modeId?: string | null
): ChatIntelligenceModeDefinition {
  return (
    findChatIntelligenceMode(modeId) ??
    CHAT_INTELLIGENCE_MODES.find((mode) => mode.id === DEFAULT_CHAT_INTELLIGENCE_MODE_ID) ??
    CHAT_INTELLIGENCE_MODES[0]
  )
}
