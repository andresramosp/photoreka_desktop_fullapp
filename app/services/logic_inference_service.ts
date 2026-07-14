import axios from 'axios'
import pLimit from 'p-limit'
import type ModelsService from './models_service.js'
import type { ModelName } from './models_service.js'
import CreditService, { LOGIC_GPU_CREDITS } from '#services/credit_service'
import UserCostService from '#services/user_cost_service'
import FreeShotsService from '#services/free_shots_service'

/**
 * Logical inference (NLI) for search scoring — centralized, engine-agnostic.
 *
 * Exposes two interchangeable engines with the SAME contract. Both take the
 * candidates and return every input `text` augmented with `embeddingsProximity`
 * (its original CLIP/text proximity) and a scalar `logicProximity` in [0, 2],
 * consumed unchanged by `ScoringService.adjustProximities` (LOGIC_THRESHOLD = 1):
 *   contradiction → [0, 1)   neutral → 1   entailment → (1, 2]
 *
 *   • adjustProximitiesByContextInferenceByBert — RunPod BERT cross-encoder
 *     (GPU). Exact, calibrated scalar per pair, but suffers serverless cold
 *     starts. Bills a flat LOGIC_GPU_CREDITS per call, fully self-contained
 *     (free-bag → credits, same "credits-first" priority as everywhere else).
 *   • adjustProximitiesByContextInferenceByLLM  — gemini-3.1-flash-lite at
 *     MINIMAL thinking (retries fall back to gemini-2.5-flash-lite), micro-batched
 *     with bounded concurrency and structured JSON output. No cold start; cost
 *     billed per-token via the caller's tracked ModelsService.
 *
 * Both take the `ModelsService` to use so the caller can pass a cost-tracked
 * instance — for the LLM engine, getGeminiResponse prices each call from its
 * input/output tokens and the CostTracker proxy records it, so the real cost
 * flows into the search cost tracker and is charged under the SEARCH_PRECISE
 * margin. The BERT engine reuses ModelsService's endpoint configuration via
 * buildRequestConfig, but its cost is a flat fixed price rather than a
 * per-token one, so it is charged directly (see chargeGpuInference) instead of
 * going through the tracker/margin pipeline.
 */

/**
 * Thrown by the GPU (BERT) engine when the caller can't be billed for the
 * call — 'QUOTA_EXHAUSTED' (no credits left and the daily free bag is spent)
 * or 'INSUFFICIENT_CREDITS' (no free bag left either). Callers should catch
 * this and map it to the same 402 shape used by the rest of the app.
 */
export class LogicInferenceBillingError extends Error {
  constructor(public code: 'QUOTA_EXHAUSTED' | 'INSUFFICIENT_CREDITS') {
    super(code)
  }
}

/**
 * Selects which NLI engine adjustProximitiesByContextInference dispatches to.
 * AUTO picks BERT when the RunPod GPU already has a warm worker (no cold start),
 * otherwise triggers a background wake-up and serves this call with the LLM.
 */
export enum LogicInferenceEngine {
  LLM = 'LLM',
  BERT = 'BERT',
  AUTO = 'AUTO',
}

// ─── LLM engine config ───────────────────────────────────

type TermsType = 'tag' | 'desc'

interface LLMModelStepConfig {
  model: ModelName
  thinkingConfig?: Record<string, any>
}

interface LLMTermsTypeConfig {
  batchSize: number
  concurrency: number
  maxRetries: number
  model1: LLMModelStepConfig
  model2: LLMModelStepConfig
}

/**
 * Declarative per-request-type strategy:
 * - model1 is used on the first attempt
 * - model2 is used on retries
 * - thinkingConfig is passed verbatim to getGeminiResponse
 */
const LLM_CONFIG_BY_TERMS_TYPE: Record<TermsType, LLMTermsTypeConfig> = {
  tag: {
    batchSize: 10,
    concurrency: 10,
    maxRetries: 2,
    model1: {
      model: 'gemini-2.5-flash-lite',
      thinkingConfig: { thinkingBudget: 512 },
    },
    model2: {
      model: 'gemini-3.1-flash-lite',
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  },
  desc: {
    batchSize: 10,
    concurrency: 10,
    maxRetries: 2,
    model1: {
      model: 'gemini-3.1-flash-lite',
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
    model2: {
      model: 'gemini-2.5-flash-lite',
      thinkingConfig: { thinkingBudget: 1024 },
    },
  },
}

/** Hard cap on candidates processed per term to bound worst-case cost/latency. */
const MAX_CANDIDATES = 1500

/** Base backoff between retries (exponential: base * 2^(attempt-1)). */
const RETRY_BASE_DELAY_MS = 800

/** Print one line per inference (term ⇐ candidate: label/confidence → logicProximity). */
const LOG_INFERENCES = false

type NLILabel = 'entailment' | 'neutral' | 'contradiction'

interface NLIVerdict {
  id: number
  label: NLILabel
  confidence: number
}

const PROMPT_CORE = `You are a strict Natural Language Inference (NLI) classifier for a photo search engine.

The user searched for a TERM. You receive candidate phrases known to be present in a photo. For each candidate decide, by directional entailment:

  PREMISE:    "the photo contains: <CANDIDATE>"
  HYPOTHESIS: "the photo features: <TERM>"

The question is ALWAYS one-directional: does the PREMISE guarantee the HYPOTHESIS?

Labels:
- "entailment": IF the candidate is present, the term is NECESSARILY present. This holds only when the candidate is a synonym of, or MORE SPECIFIC than (a hyponym / subtype / instance of), the term.
    term "dog" + candidate "golden retriever" → entailment (a golden retriever IS a dog)
    term "cat" + candidate "tabby" → entailment (a tabby IS a cat)
- "neutral": the candidate is compatible with the term but does NOT guarantee it. This is the correct label when the candidate is BROADER than the term (a hypernym / category), a sibling, or merely co-occurring.
    term "cat" + candidate "domestic animals" → neutral (a domestic animal need NOT be a cat — could be a dog, a rooster, etc.)
    term "cat" + candidate "pet" → neutral (a pet need not be a cat)
    term "dog" + candidate "grass field" → neutral
- "contradiction": IF the candidate is present, the term CANNOT be present. Reserve this for genuine MUTUAL EXCLUSIVITY only.
    term "indoor scene" + candidate "open desert" → contradiction
    term "cat" + candidate "empty landscape, no animals" → contradiction

CRITICAL RULE — the hypernym trap: a candidate that is a BROADER category than the term is NEVER entailment. "domestic animals", "pet", "mammal", "wildlife" do NOT entail "cat". Only equal-or-narrower candidates entail. When unsure whether the candidate is narrower or broader, choose "neutral".

CRITICAL RULE — unrelated ≠ contradiction: two concepts that are simply UNRELATED and can freely coexist are "neutral", NOT "contradiction". Contradiction requires that the candidate makes the term impossible.`

// Tags: short atomic labels. The main risk is the hypernym trap.
const PROMPT_TAG_GUIDANCE = `

INPUT TYPE — TAGS: each candidate is a short label (a tag) attached to the photo. Decide purely from the tag's meaning as a category. A tag entails the term only if the tag IS the term or a subtype of it; a broader-category tag is neutral.`

// Descriptions: long free-text fragments; the term may be a full multi-concept query.
const PROMPT_DESC_GUIDANCE = `

INPUT TYPE — DESCRIPTION FRAGMENTS: each candidate is a free-text sentence describing the photo, and the TERM may combine SEVERAL concepts (e.g. "cats and kids in an African country").

- Conjunction rule: when the term names multiple things, entailment requires the fragment to explicitly support EVERY one of them. If even one concept is absent, unstated, or only plausible, the label is "neutral" — not entailment.
- Judge ONLY what the fragment explicitly states or logically guarantees. Do NOT infer plausible-but-unmentioned details: a "vibrant market scene" does NOT entail children or animals just because they could be there.
- A fragment that satisfies part of the term (e.g. mentions an African country) but is silent on the rest (cats, kids) is "neutral", never "entailment".`

const PROMPT_JSON_FORMAT = `

Judge each candidate independently. Do not let one candidate influence another. Base the decision on meaning, never on string overlap.

Return STRICT JSON, no prose, with this exact shape:
{"results":[{"id":<number>,"label":"entailment|neutral|contradiction","confidence":<0..1>}]}

- "id" must echo the candidate id given in the input.
- "confidence" is how sure you are of the label (0..1).
- Return exactly one object per input candidate.`

function buildSystemPrompt(termsType: TermsType): string {
  const guidance = termsType === 'tag' ? PROMPT_TAG_GUIDANCE : PROMPT_DESC_GUIDANCE
  return PROMPT_CORE + guidance + PROMPT_JSON_FORMAT
}

export default class LogicInferenceService {
  /**
   * Single entry point for both NLI engines — same signature regardless of
   * `engine`, so callers (ScoringService.adjustProximities) don't need to
   * branch. `userId` is required by both for signature parity, but only the
   * BERT engine actually bills from it (the LLM engine's real cost is tracked
   * on `modelsService`'s CostTracker by the caller instead).
   */
  public async adjustProximitiesByContextInference(
    modelsService: ModelsService,
    term: string,
    texts: any[],
    userId: number,
    termsType: TermsType = 'tag',
    engine: LogicInferenceEngine = LogicInferenceEngine.LLM
  ): Promise<any[]> {
    const resolved =
      engine === LogicInferenceEngine.AUTO ? await this.resolveEngine(modelsService) : engine

    return resolved === LogicInferenceEngine.BERT
      ? this.adjustProximitiesByContextInferenceByBert(modelsService, term, texts, userId, termsType)
      : this.adjustProximitiesByContextInferenceByLLM(modelsService, term, texts, userId, termsType)
  }

  /**
   * Resolve LogicInferenceEngine.AUTO to a concrete engine based on RunPod GPU
   * warmth: if BERT already has a warm worker we use it (fast, calibrated);
   * otherwise we kick off a non-blocking wake-up and fall back to the LLM for
   * this request so the user never waits out a cold start. Subsequent searches
   * route back to BERT once RunPod reports warm.
   */
  private async resolveEngine(modelsService: ModelsService): Promise<LogicInferenceEngine> {
    const warm = await modelsService.isRunPodEndpointWarm('logic_gpu')

    if (warm) {
      console.log('[LogicInference] engine=BERT (RunPod GPU warm, no cold start)')
      return LogicInferenceEngine.BERT
    }

    console.log('[LogicInference] engine=LLM (RunPod GPU cold → triggering warm-up, serving via LLM)')
    modelsService.triggerRunPodWarm('logic_gpu')
    return LogicInferenceEngine.LLM
  }

  // ═══════════════════════════════════════════════════════
  //  BERT engine (RunPod GPU cross-encoder)
  // ═══════════════════════════════════════════════════════

  /**
   * NLI via the RunPod BERT cross-encoder. Moved here from ModelsService so both
   * engines live in one place; it still relies on ModelsService for endpoint
   * configuration (buildRequestConfig).
   *
   * Billing is fully self-contained: charges a flat LOGIC_GPU_CREDITS per call —
   * free daily bag first (SEARCH_PRECISE), falling back to real credits — before
   * ever hitting RunPod. Throws LogicInferenceBillingError if the user can't be
   * billed; the caller should catch it and respond the same way it does for
   * other 402 paths.
   *
   * @param modelsService  ModelsService providing buildRequestConfig / endpoints
   * @param term           the user's search term
   * @param texts          candidates, each with at least { name, group?, proximity }
   * @param userId         billed for the GPU call
   * @param termsType      'tag' | 'desc' — selects the RunPod operation
   */
  public async adjustProximitiesByContextInferenceByBert(
    modelsService: ModelsService,
    term: string,
    texts: any[],
    userId: number,
    termsType: TermsType = 'tag'
  ): Promise<any[]> {
    await this.chargeGpuInference(userId)

    try {
      // Unique by name + group
      const uniqueTexts = Object.values(
        texts.reduce((acc: Record<string, any>, item: any) => {
          const key = `${item.name}::${item.group}`
          if (!acc[key]) acc[key] = item
          return acc
        }, {})
      )

      const payload = {
        term,
        tag_list: uniqueTexts.map((tag: any) => ({ name: tag.name, group: tag.group })),
        premise_wrapper: 'the photo has the following fragment in its description: {term}',
        hypothesis_wrapper: 'the photo features {term}',
      }

      const operation =
        termsType === 'tag'
          ? 'adjust_tags_proximities_by_context_inference'
          : 'adjust_descs_proximities_by_context_inference'

      const { url, requestPayload, headers } = modelsService.buildRequestConfig(
        operation,
        payload,
        'logic_gpu'
      )

      let { data } = await axios.post(url, requestPayload, { headers })
      data = data.output ? data.output : data

      return texts.map((text) => ({
        ...text,
        embeddingsProximity: text.proximity,
        logicProximity: data[text.name]?.adjusted_proximity,
      }))
    } catch (error: any) {
      console.error(
        'Error en LogicInferenceService.adjustProximitiesByContextInferenceByBert:',
        error?.message
      )
      return []
    }
  }

  /**
   * Bill one LOGIC_GPU_CREDITS charge for a GPU NLI call, credits-first with the
   * daily free bag as fallback — same priority order as every other billed
   * search path (FreeShotsService.tryConsumeFreeBag: real credits are spent
   * before the free bag kicks in). Throws LogicInferenceBillingError when the
   * user can't be billed at all, so the caller never reaches RunPod for free.
   */
  private async chargeGpuInference(userId: number): Promise<void> {
    const freeShot = await FreeShotsService.tryConsumeFreeBag(
      userId,
      'SEARCH_PRECISE',
      LOGIC_GPU_CREDITS
    )

    if (freeShot === 'exhausted') {
      throw new LogicInferenceBillingError('QUOTA_EXHAUSTED')
    }

    if (!freeShot) {
      const charged = await CreditService.tryChargeFixed(userId, LOGIC_GPU_CREDITS)
      if (!charged) {
        throw new LogicInferenceBillingError('INSUFFICIENT_CREDITS')
      }
    }

    UserCostService.record(
      userId,
      'search',
      CreditService.creditsToEstimatedEur(LOGIC_GPU_CREDITS),
      1,
      {
        task: 'gpu_precise_search',
        free: freeShot === true,
        metadata: { fixedCharge: true, credits: LOGIC_GPU_CREDITS },
      }
    ).catch(() => {})
  }

  // ═══════════════════════════════════════════════════════
  //  LLM engine (gemini-2.5-flash-lite, micro-batched)
  // ═══════════════════════════════════════════════════════

  /**
   * NLI via micro-batched gemini-2.5-flash-lite. Same signature/return as the
   * BERT engine. Hundreds of candidates are split into small independent batches
   * fired with bounded concurrency, keeping each batch's context clean so the
   * model treats each pair as unique (no drift / neighbour anchoring).
   *
   * @param modelsService  tracked or plain ModelsService providing getGeminiResponse
   * @param term           the user's search term (hypothesis subject)
   * @param texts          candidates, each with at least { name, proximity }
   * @param userId         unused here — kept for signature parity with the BERT
   *                        engine; this engine's real cost is billed by the
   *                        caller from modelsService's CostTracker instead
   * @param termsType      'tag' | 'desc' — surfaced to the model as context
   */
  public async adjustProximitiesByContextInferenceByLLM(
    modelsService: ModelsService,
    term: string,
    texts: any[],
    userId: number,
    termsType: TermsType = 'tag'
  ): Promise<any[]> {
    if (!Array.isArray(texts) || texts.length === 0) return []

    try {
      // Dedupe by name (the return is keyed by name, matching the BERT engine).
      const uniqueByName = new Map<string, any>()
      for (const item of texts) {
        if (item?.name == null) continue
        if (!uniqueByName.has(item.name)) uniqueByName.set(item.name, item)
      }

      const uniqueNames = Array.from(uniqueByName.keys()).slice(0, MAX_CANDIDATES)

      // logicProximity per candidate name.
      const logicByName = new Map<string, number>()

      const termsConfig = this.getTermsTypeConfig(termsType)
      const batchSize = termsConfig.batchSize
      const batches = this.chunk(uniqueNames, batchSize)
      const limit = pLimit(termsConfig.concurrency)

      if (LOG_INFERENCES) {
        console.log(
          `[LogicInference] term="${term}" (${termsType}) | inputs=${texts.length} unique=${uniqueNames.length} batches=${batches.length} (size=${batchSize}, concurrency=${termsConfig.concurrency}). Note: cached batches cost €0 and are not counted in cost_logs.`
        )
      }

      await Promise.all(
        batches.map((batchNames) =>
          limit(async () => {
            const verdicts = await this.classifyBatch(modelsService, term, batchNames, termsType)
            for (const v of verdicts) {
              const name = batchNames[v.id]
              if (name === undefined) continue
              const logicProximity = this.labelToLogicProximity(v.label, v.confidence)
              logicByName.set(name, logicProximity)
              if (LOG_INFERENCES) {
                const surfaces = logicProximity > 1 ? '✓ surfaces' : '· filtered'
                console.log(
                  `[LogicInference] "${term}" ⇐ "${name}": ${v.label} (${v.confidence.toFixed(2)}) → logicProx=${logicProximity.toFixed(2)} ${surfaces}`
                )
              }
            }
          })
        )
      )

      // Map ALL original texts, preserving order and every field (contract parity).
      return texts.map((text) => {
        const embeddingsProximity = text.proximity
        // Missing verdict (model dropped it, or beyond MAX_CANDIDATES) → conservative
        // fallback that never counts as entailment: clamp embeddings proximity to <= 1.
        const logicProximity = logicByName.has(text.name)
          ? logicByName.get(text.name)!
          : Math.min(1, Math.max(0, embeddingsProximity ?? 0))

        return {
          ...text,
          embeddingsProximity,
          logicProximity,
        }
      })
    } catch (error: any) {
      console.error(
        'Error en LogicInferenceService.adjustProximitiesByContextInferenceByLLM:',
        error?.message
      )
      return []
    }
  }

  /**
   * Classify a single micro-batch. Returns the parsed verdicts (may be fewer than
   * requested if the model dropped items — the caller fills gaps with a fallback).
   */
  private async classifyBatch(
    modelsService: ModelsService,
    term: string,
    batchNames: string[],
    termsType: TermsType
  ): Promise<NLIVerdict[]> {
    const candidateKind = termsType === 'tag' ? 'tags' : 'description fragments'
    const candidateList = batchNames.map((name, id) => `${id}: ${name}`).join('\n')
    const userPrompt = `TERM: "${term}"\n\nCandidates (photo ${candidateKind}):\n${candidateList}`
    const systemPrompt = buildSystemPrompt(termsType)

    try {
      const response = await this.callLLMWithRetry(
        modelsService,
        systemPrompt,
        userPrompt,
        termsType
      )
      return this.normalizeVerdicts(response?.result, batchNames.length)
    } catch (error: any) {
      // Exhausted retries — degrade this batch to the embeddings-only fallback.
      console.warn('[LogicInference] batch failed after retries:', error?.message)
      return []
    }
  }

  /**
   * Call the LLM with retry + exponential backoff, mirroring the callLLMWithRetry
   * pattern used elsewhere (ai_location_inference_service). Model choice,
   * retries, and thinking are selected declaratively from LLM_CONFIG_BY_TERMS_TYPE.
   * getGeminiResponse is invoked with throwOnError=true so transient errors
   * propagate here to be retried; an empty/unparseable result is also retried.
   * Caching stays on: identical (term, candidates) batches are served from
   * Redis at zero cost, so repeated searches don't re-bill.
   */
  private async callLLMWithRetry(
    modelsService: ModelsService,
    systemPrompt: string,
    userPrompt: string,
    termsType: TermsType
  ): Promise<any> {
    let lastError: Error | null = null
    const termsConfig = this.getTermsTypeConfig(termsType)

    for (let attempt = 1; attempt <= termsConfig.maxRetries; attempt++) {
      const stepConfig = attempt === 1 ? termsConfig.model1 : termsConfig.model2
      const { model, thinkingConfig } = stepConfig
      try {
        const result = await modelsService.getGeminiResponse(
          systemPrompt,
          [userPrompt],
          model,
          { temperature: 0, responseMimeType: 'application/json' },
          true, // useCache — deterministic NLI, safe & cheap to cache
          true, // throwOnError — surface transient errors so we can retry here
          thinkingConfig
        )

        if (!result?.result) throw new Error(`LLM returned an empty response (${model})`)
        return result
      } catch (error: any) {
        lastError = error
        if (attempt === termsConfig.maxRetries) break

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        console.warn(
          `[LogicInference] attempt ${attempt}/${termsConfig.maxRetries} (${model}) failed: ${error?.message}. Retrying in ${delay}ms.`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError ?? new Error('LLM logic inference failed')
  }

  /**
   * Coerce the model output into clean, in-range verdicts. getGeminiResponse
   * unwraps `{ results: [...] }` to the array on `.result`.
   */
  private normalizeVerdicts(raw: any, batchLength: number): NLIVerdict[] {
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []
    const verdicts: NLIVerdict[] = []

    for (const item of arr) {
      const id = Number(item?.id)
      if (!Number.isInteger(id) || id < 0 || id >= batchLength) continue

      const label = this.coerceLabel(item?.label)
      if (!label) continue

      let confidence = Number(item?.confidence)
      if (!Number.isFinite(confidence)) confidence = 0.5
      confidence = Math.min(1, Math.max(0, confidence))

      verdicts.push({ id, label, confidence })
    }

    return verdicts
  }

  private coerceLabel(value: any): NLILabel | null {
    const v = String(value ?? '')
      .toLowerCase()
      .trim()
    if (v.startsWith('entail')) return 'entailment'
    if (v.startsWith('contra')) return 'contradiction'
    if (v.startsWith('neutral')) return 'neutral'
    return null
  }

  /**
   * Map (label, confidence) → logicProximity in [0, 2], aligned with
   * ScoringService.adjustProximities' LOGIC_THRESHOLD = 1:
   *   contradiction → 1 - confidence  ∈ [0, 1)
   *   neutral       → 1               (boundary: filtered out in entailment mode)
   *   entailment    → 1 + confidence  ∈ (1, 2]
   * Confidence preserves ranking gradation within each class.
   */
  private labelToLogicProximity(label: NLILabel, confidence: number): number {
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

  private getTermsTypeConfig(termsType: TermsType): LLMTermsTypeConfig {
    return LLM_CONFIG_BY_TERMS_TYPE[termsType]
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }
}
