import { PRICES } from './models_service.js'

export type ChatIntelligenceModeDefinition = {
  id: string
  name: string
  description: string
  modelPhase1: string
  modelPhase2Cheap: string
  modelPhase2Expensive: string
  modelPhase2Lite: string
  costFactor?: number
}

export type ChatIntelligenceModeWithCost = Omit<
  ChatIntelligenceModeDefinition,
  'modelPhase1' | 'modelPhase2Cheap' | 'modelPhase2Expensive' | 'modelPhase2Lite'
> & {
  costFactor: number
}

const CHAT_INTELLIGENCE_MODES: ReadonlyArray<ChatIntelligenceModeDefinition> = [
  {
    id: 'scout',
    name: 'Scout',
    description: 'Optimized for quick exploration and broad analysis.',
    modelPhase1: 'gemini-3.1-flash-lite-preview',
    modelPhase2Cheap: 'gemini-3.1-flash-lite-preview',
    modelPhase2Expensive: 'gemini-3.1-flash-lite-preview',
    modelPhase2Lite: 'gemini-3.1-flash-lite-preview',
    // modelPhase1: 'gemini-2.5-flash-lite',
    // modelPhase2Cheap: 'gemini-2.5-flash-lite',
    // modelPhase2Expensive: 'gemini-2.5-flash-lite',
    // modelPhase2Lite: 'gemini-2.5-flash-lite',
    costFactor: 0.5,
  },
  {
    id: 'default',
    name: 'Curator',
    description: 'Balanced mode for the standard ChatLab experience.',
    modelPhase1: 'gemini-3-flash-preview',
    modelPhase2Cheap: 'gemini-3-flash-preview',
    modelPhase2Expensive: 'gemini-3-flash-preview',
    modelPhase2Lite: 'gemini-3.1-flash-lite-preview',
    // modelPhase1: 'gemini-2.5-flash',
    // modelPhase2Cheap: 'gemini-2.5-flash',
    // modelPhase2Expensive: 'gemini-2.5-flash',
    // modelPhase2Lite: 'gemini-2.5-flash',
    costFactor: 1,
  },
  // {
  //   id: 'curator',
  //   name: 'Curator', // Para casos que demandan inteligencia estética profunda
  //   description: 'Optimized for tasks that require a deeper aesthetic intelligence.',
  //   // modelPhase1: 'gemini-3-flash-preview',
  //   // modelPhase2Cheap: 'gemini-3-pro-preview',
  //   // modelPhase2Expensive: 'gemini-3-pro-preview',
  //   // modelPhase2Lite: 'gemini-3.1-flash-lite-preview',
  //   modelPhase1: 'gemini-3-flash-preview',
  //   modelPhase2Cheap: 'gpt-5.4',
  //   modelPhase2Expensive: 'gpt-5.4',
  //   modelPhase2Lite: 'gemini-3.1-flash-lite-preview',
  //   costFactor: 2,
  // },
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

const DEFAULT_CHAT_INTELLIGENCE_MODE_ID = 'normal'

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
  const hasManualOverrides = CHAT_INTELLIGENCE_MODES.some((mode) => mode.costFactor !== undefined)

  if (hasManualOverrides) {
    return CHAT_INTELLIGENCE_MODES.map((mode) => ({
      id: mode.id,
      name: mode.name,
      description: mode.description,
      costFactor: mode.costFactor ?? 1,
    }))
  }

  const scores = CHAT_INTELLIGENCE_MODES.map((mode) => ({
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
