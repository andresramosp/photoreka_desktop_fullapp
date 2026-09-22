/**
 * Pure helpers for the Jev (TypeSafe AI System One) NLI engine and the label →
 * logicProximity contract shared by every engine in LogicInferenceService.
 *
 * Jev is a non-autoregressive classifier: one request carries a `state` plus a
 * map of typed questions, all evaluated independently in a single pass. We ask
 * one `choice` question per candidate, with the three NLI labels as options,
 * and read the calibrated probability of the winning label as its confidence.
 */

export type NLILabel = 'entailment' | 'neutral' | 'contradiction'
export type NLITermsType = 'tag' | 'desc'

export interface NLIVerdict {
  id: number
  label: NLILabel
  confidence: number
}

export const NLI_LABELS: readonly NLILabel[] = ['entailment', 'neutral', 'contradiction']

export interface JevChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<NLILabel, string>
}

export interface JevChoiceAnswer {
  type: 'choice'
  choice: string
  probabilities?: Record<string, number>
  confidence?: number
}

export interface JevNliState {
  task: string
  term: string
  input_type: string
  rules: string[]
}

export interface JevNliRequest {
  state: JevNliState
  questions: Record<string, JevChoiceQuestion>
}

const QUESTION_KEY_PREFIX = 'c'
const QUESTION_KEY_PATTERN = /^c(\d+)$/

const SHARED_RULES = [
  'The question is always one-directional: does the PREMISE ("the photo contains: <candidate>") guarantee the HYPOTHESIS ("the photo features: <term>")?',
  'Hypernym trap: a candidate that is a BROADER category than the term is never entailment. "domestic animals", "pet", "mammal", "wildlife" do not entail "cat". Only equal-or-narrower candidates entail.',
  'Unrelated is not contradiction: two concepts that can freely coexist are neutral. Contradiction requires that the candidate makes the term impossible.',
  'When unsure whether the candidate is narrower or broader than the term, choose neutral.',
  'Judge each candidate alone, by meaning, never by string overlap.',
]

const TAG_RULES = [
  'Each candidate is a short label (a tag) attached to the photo. Decide purely from the tag meaning as a category: a tag entails the term only if the tag IS the term or a subtype of it.',
]

const DESC_RULES = [
  'Each candidate is a free-text sentence describing the photo, and the term may combine several concepts (e.g. "cats and kids in an African country").',
  'Conjunction rule: when the term names multiple things, entailment requires the fragment to explicitly support EVERY one of them. If even one concept is absent, unstated or only plausible, the label is neutral.',
  'Judge only what the fragment explicitly states or logically guarantees. Do not infer plausible-but-unmentioned details: a "vibrant market scene" does not entail children or animals.',
]

function buildCriteria(term: string, termsType: NLITermsType): Record<NLILabel, string> {
  const conjunction =
    termsType === 'desc'
      ? ' When the term names several concepts, the candidate must explicitly support every one of them.'
      : ''
  return {
    entailment: `If the candidate is present in the photo, "${term}" is necessarily present too: the candidate is a synonym of the term or MORE SPECIFIC than it (a subtype, breed, instance or narrower description).${conjunction} Example: term "dog", candidate "golden retriever".`,
    neutral: `The candidate is compatible with "${term}" but does not guarantee it: it is a BROADER category than the term, a sibling, merely co-occurring, unrelated, or it covers only part of the term. Example: term "cat", candidate "pet" or "domestic animals".`,
    contradiction: `If the candidate is present, "${term}" cannot be present in the same photo: genuine mutual exclusivity, not mere unrelatedness. Example: term "indoor scene", candidate "open desert".`,
  }
}

export function buildJevNliRequest(
  term: string,
  candidates: string[],
  termsType: NLITermsType
): JevNliRequest {
  const criteria = buildCriteria(term, termsType)
  const kind = termsType === 'tag' ? 'tag' : 'description fragment'

  const questions: Record<string, JevChoiceQuestion> = {}
  candidates.forEach((candidate, id) => {
    questions[`${QUESTION_KEY_PREFIX}${id}`] = {
      type: 'choice',
      instructions: `PREMISE: the photo contains this ${kind}: "${candidate}". HYPOTHESIS: the photo features: "${term}". Does the premise guarantee the hypothesis? Apply state.rules.`,
      criteria,
    }
  })

  return {
    state: {
      task: 'Strict Natural Language Inference (NLI) for a photo search engine: the user searched for state.term; each question holds one candidate phrase known to be present in a photo.',
      term,
      input_type: termsType === 'tag' ? 'tags' : 'description fragments',
      rules: [...SHARED_RULES, ...(termsType === 'tag' ? TAG_RULES : DESC_RULES)],
    },
    questions,
  }
}

export function coerceNLILabel(value: unknown): NLILabel | null {
  const v = String(value ?? '')
    .toLowerCase()
    .trim()
  if (v.startsWith('entail')) return 'entailment'
  if (v.startsWith('contra')) return 'contradiction'
  if (v.startsWith('neutral')) return 'neutral'
  return null
}

/**
 * Turn Jev's `answers` map into verdicts. The confidence is the calibrated
 * probability Jev assigned to the winning label (falling back to its
 * `confidence` metric), so ranking gradation within a class is preserved
 * exactly as with the LLM engine's self-reported confidence.
 */
export function parseJevNliAnswers(answers: unknown, batchLength: number): NLIVerdict[] {
  if (!answers || typeof answers !== 'object') return []
  const verdicts: NLIVerdict[] = []

  for (const [key, raw] of Object.entries(answers as Record<string, any>)) {
    const match = QUESTION_KEY_PATTERN.exec(key)
    if (!match) continue
    const id = Number(match[1])
    if (id < 0 || id >= batchLength) continue
    if (!raw || raw.type !== 'choice') continue

    const label = coerceNLILabel(raw.choice)
    if (!label) continue

    let confidence = Number(raw.probabilities?.[raw.choice])
    if (!Number.isFinite(confidence)) confidence = Number(raw.confidence)
    if (!Number.isFinite(confidence)) confidence = 0.5
    confidence = Math.min(1, Math.max(0, confidence))

    verdicts.push({ id, label, confidence })
  }

  return verdicts.sort((a, b) => a.id - b.id)
}

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
