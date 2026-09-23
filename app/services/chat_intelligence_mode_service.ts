import { PRICES } from './models_service.js'

/**
 * Phase 2 reasoning budget. Maps to Gemini 3's `thinkingLevel` and to OpenAI's
 * `reasoning_effort` — the same three names exist on both, so a mode can be pointed
 * at either provider without touching this field. Left undefined, the model keeps
 * its own default, which is what every mode did before this field existed: `undefined`
 * is the behaviour-preserving value, not a neutral placeholder.
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
  /**
   * How many tool-calling rounds Phase 1 may spend before the curator takes over.
   * Undefined = PHASE1_MAX_ITERATIONS_DEFAULT in langchain_agent_service, i.e. the
   * value every mode ran on before this field existed.
   */
  maxIterationsPhase1?: number
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
  | 'maxIterationsPhase1'
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
    modelPhase2Cheap: 'gemini-3.1-flash-lite',
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
    modelPhase1: 'gemini-3-flash-preview',
    modelPhase2Cheap: 'gemini-3.8-flash',
    modelPhase2Expensive: 'gpt-5.6-sol',
    modelPhase2Lite: 'gemini-3.1-flash-lite',
    thinkingLevelPhase2: 'high',
    maxIterationsPhase1: 5,
    costFactor: 6,
    hidden: false,
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

/**
 * The four model slots of a mode plus its `id` — the only part of a mode `resolveTurnModels`
 * reads. The `id` is needed because the template floor override applies to the default mode
 * alone (see `resolveExpensivePhase2Model`).
 */
type ModeModelMatrix = Pick<
  ChatIntelligenceModeDefinition,
  'id' | 'modelPhase1' | 'modelPhase2Cheap' | 'modelPhase2Expensive' | 'modelPhase2Lite'
>

/**
 * What a turn needs from its Phase 2 model, distilled to the three facts that pick a slot.
 * Plain data so this file stays independent of the classifier that produces them.
 */
export type Phase2Selector = {
  /** A forced downgrade (cost guard / fallback): overrides everything to the lite model. */
  forceCheap: boolean
  /** The turn does any photographic work at all — false for greetings, small talk, asides. */
  hasPhotoIntent: boolean
  /** The turn needs artistic evaluation: the expensive slot, subject to the template floor. */
  needsArtisticEvaluation: boolean
}

/**
 * The expensive (artistic-evaluation) slot, with a template override applied to the DEFAULT
 * mode alone, and even there as a FLOOR rather than a replacement.
 *
 * The override is a lever for the default mode (Curator): it lifts that mode's artistic model
 * up to the template's baseline. It deliberately does NOT touch the other modes — Scout is
 * meant to stay cheap, and Curator High already carries a model above any template floor, so
 * lifting either would erase the very difference the mode selector offers the user. `default`
 * is identified by `DEFAULT_CHAT_INTELLIGENCE_MODE_ID`, the one source for which mode that is.
 *
 * Within the default mode it stays a floor: it never caps below the mode's own model.
 * "More capable" is read off `PRICES` — the same cost ranking `getModeCostScore` already
 * trusts — so there is no second source of truth and no per-template list of which models to
 * override. A model missing from `PRICES` scores 0, so an unknown override never displaces a
 * known mode model.
 */
function resolveExpensivePhase2Model(
  mode: ModeModelMatrix,
  templateOverride?: string | null
): string {
  if (!templateOverride || mode.id !== DEFAULT_CHAT_INTELLIGENCE_MODE_ID) {
    return mode.modelPhase2Expensive
  }
  return getModelUnitCost(templateOverride) > getModelUnitCost(mode.modelPhase2Expensive)
    ? templateOverride
    : mode.modelPhase2Expensive
}

/**
 * Picks the model for each phase of one chat turn from the mode's four-slot matrix.
 *
 * Phase 1 never varies with the turn — it is always the mode's own model. Phase 2 is where
 * the choice lives: a forced downgrade or a turn with no photo intent takes the lite slot,
 * an artistic-evaluation turn takes the expensive slot (with `templateExpensiveOverride`
 * applied as a floor), and any other photo turn takes the cheap slot.
 */
export function resolveTurnModels(
  mode: ModeModelMatrix,
  selector: Phase2Selector,
  templateExpensiveOverride?: string | null
): { phase1: string; phase2: string } {
  return {
    phase1: mode.modelPhase1,
    phase2: resolvePhase2Model(mode, selector, templateExpensiveOverride),
  }
}

function resolvePhase2Model(
  mode: ModeModelMatrix,
  selector: Phase2Selector,
  templateExpensiveOverride?: string | null
): string {
  if (selector.forceCheap || !selector.hasPhotoIntent) return mode.modelPhase2Lite
  if (selector.needsArtisticEvaluation) {
    return resolveExpensivePhase2Model(mode, templateExpensiveOverride)
  }
  return mode.modelPhase2Cheap
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
