/**
 * Contrato label → logicProximity de la inferencia lógica de la búsqueda. Escritorio: los
 * veredictos llegan del servicio de la nube; los motores Jev y BERT no existen aquí.
 */

export type NLILabel = 'entailment' | 'neutral' | 'contradiction'
export type NLITermsType = 'tag' | 'desc'

/**
 * (label, confidence) → logicProximity in [0, 2], aligned with
 * ScoringService.adjustProximities' LOGIC_THRESHOLD = 1:
 *   contradiction → 1 - confidence  ∈ [0, 1)
 *   neutral       → 1               (boundary: filtered out in entailment mode)
 *   entailment    → 1 + confidence  ∈ (1, 2]
 */
export function labelToLogicProximity(label: NLILabel, confidence: number): number {
  switch (label) {
    case 'entailment':
      return 1 + confidence
    case 'contradiction':
      return 1 - confidence
    case 'neutral':
    default:
      return 1
  }
}

/**
 * Map every original text (order and fields preserved) to the engine contract:
 * `embeddingsProximity` keeps the CLIP/text proximity, `logicProximity` comes
 * from the verdicts. A candidate without a verdict gets a conservative fallback
 * that never counts as entailment: its embeddings proximity clamped to <= 1.
 */
export function applyLogicProximities(texts: any[], logicByName: Map<string, number>): any[] {
  return texts.map((text) => {
    const embeddingsProximity = text.proximity
    const logicProximity = logicByName.has(text.name)
      ? logicByName.get(text.name)!
      : Math.min(1, Math.max(0, embeddingsProximity ?? 0))
    return { ...text, embeddingsProximity, logicProximity }
  })
}
