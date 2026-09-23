// @ts-nocheck

import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { withCache } from '../decorators/withCache.js'
import withCost from '../decorators/withCost.js'
import {
  MESSAGE_QUERY_CLASSIFICATION,
  MESSAGE_QUERY_CONDENSE,
  // MESSAGE_QUERY_CURATORIAL_CLASSIFICATION,
  MESSAGE_QUERY_COMPACT,
  MESSAGE_QUERY_METADATA,
  MESSAGE_QUERY_NO_PREFIX_AND_TRANSLATION,
  MESSAGE_QUERY_STRUCTURE,
  MESSAGE_QUERY_STRUCTURE_CURATION,
  MESSAGE_QUERY_STRUCTURE_CURATION_IMPLICIT_ONLY,
} from '../utils/prompts/query.js'
import AnalyzerService from './analyzer_service.js'
import VectorService from './vector_service.js'
import ModelsService from './models_service.js'
import type { ModelName } from './models_service.js'
import {
  QueryClassifierEngine,
  defaultQueryClassifierEngine,
  buildJevClassifierRequest,
  parseJevClassifierAnswers,
  isJevConfigured,
  JEV_CLASSIFIER_MODEL,
  type QueryClassificationFlags,
} from '../utils/classifier_jev.js'
import type { SearchMode } from './search_text_service.js'
import type { SearchModeConfig } from './search_text_service.js'

const LLM_MAX_RETRIES = 2
const LLM_RETRY_BASE_DELAY_MS = 1000
/** Bumped to on failure of the primary (cheaper) model, e.g. gemini-2.5-flash-lite. */
const GEMINI_FALLBACK_MODEL: ModelName = 'gemini-3.1-flash-lite'

/** Cheap/fast model for the Jev backend's ellipsis-resolution pass (condense-only). */
const JEV_CONDENSE_MODEL: ModelName = 'gemini-3.1-flash-lite'

/**
 * Token spend of a single QueryService LLM call, normalized so callers can bill it.
 * All zeros (and model: null) when the call was served from cache or failed —
 * a cached ModelsService response carries `cost: '0 [cached]'`, not a number.
 */
export type QueryCallUsage = {
  model: string | null
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  thinkingTokens: number
  totalTokens: number
  costEur: number
}

const EMPTY_USAGE: QueryCallUsage = {
  model: null,
  inputTokens: 0,
  cachedTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
  totalTokens: 0,
  costEur: 0,
}

/** Conservative default flags — every classifier failure path returns these. */
const ALL_FALSE_FLAGS: QueryClassificationFlags = {
  has_photo_intent: false,
  needs_artistic_evaluation: false,
  attached_photos_only: false,
  wants_more_results: false,
}

/** What classifyQuery returns, whatever the backend. `usage` is billed as chat_routing. */
export type QueryClassificationResult = QueryClassificationFlags & {
  /** The LLM's rewrite of an elliptical follow-up; the raw query on the Jev backend. Log-only. */
  self_contained_query: string
  usage: QueryCallUsage
}

export default class QueryService {
  public modelsService: ModelsService = null
  public vectorService: VectorService = null
  public analyzerService: AnalyzerService = null

  constructor() {
    this.modelsService = new ModelsService()
    this.vectorService = new VectorService()
    this.analyzerService = new AnalyzerService()
  }

  /**
   * Calls Gemini with retries on the primary model, then falls back to a
   * different, more reliable model if the primary keeps failing.
   */
  private async callLLMWithRetry(opts: {
    systemPrompt: string
    userContent: any
    model: ModelName
    fallbackModel?: ModelName
    temperature?: number
    useCache?: boolean
    /** Gemini 3 thinking level ('minimal' | 'low' | 'medium' | 'high'); omitted = the service default (MINIMAL). */
    thinkingLevel?: string
  }): Promise<any> {
    const {
      systemPrompt,
      userContent,
      model,
      fallbackModel = GEMINI_FALLBACK_MODEL,
      temperature = 0.1,
      useCache = true,
      thinkingLevel,
    } = opts

    const modelsToTry = fallbackModel && fallbackModel !== model ? [model, fallbackModel] : [model]
    let lastError: Error | null = null

    for (const currentModel of modelsToTry) {
      for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt++) {
        try {
          const result = await this.modelsService.getGeminiResponse(
            systemPrompt,
            userContent,
            currentModel,
            { temperature },
            useCache,
            true, // throwOnError: retries/fallback are handled here
            thinkingLevel ? { thinkingLevel: thinkingLevel.toUpperCase() } : undefined
          )
          if (!result?.result) {
            throw new Error(`LLM returned empty/undefined response (model: ${currentModel})`)
          }
          // `model` tells callers which of the candidates actually answered — the
          // fallback may have taken over, and cost logs need the real model name.
          return { ...result, model: currentModel }
        } catch (error: any) {
          lastError = error
          if (attempt < LLM_MAX_RETRIES) {
            const delay = LLM_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
            console.warn(
              `[QueryService] Gemini call failed (attempt ${attempt}/${LLM_MAX_RETRIES}, model: ${currentModel}): ${error.message}. Retrying in ${delay}ms…`
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
          } else if (currentModel !== modelsToTry[modelsToTry.length - 1]) {
            console.warn(
              `[QueryService] Gemini call exhausted retries on model ${currentModel}, falling back to ${fallbackModel}: ${error.message}`
            )
          }
        }
      }
    }

    throw lastError ?? new Error('Gemini call failed after retries and fallback')
  }

  /** Normalizes a ModelsService `cost` payload into a billable QueryCallUsage. */
  private static toUsage(model: string, cost: any): QueryCallUsage {
    if (!cost || typeof cost.totalCostInEur !== 'number') return EMPTY_USAGE
    const cachedTokens = cost.promptCacheHitTokens ?? 0
    const inputTokens = (cost.promptCacheMissTokens ?? 0) + cachedTokens
    const outputTokens = cost.completionTokens ?? 0
    const thinkingTokens = cost.thinkingTokens ?? 0
    return {
      model,
      inputTokens,
      cachedTokens,
      outputTokens,
      thinkingTokens,
      totalTokens: cost.totalTokens ?? inputTokens + outputTokens + thinkingTokens,
      costEur: cost.totalCostInEur,
    }
  }

  /**
   * @param attachedPhotoCount  Photos attached to THIS message. The classifier needs it
   *                            to resolve deictic queries ("¿qué foto es mejor?") against
   *                            the attachments — the text alone is ambiguous.
   * @param recentTurns  Compact "role: text" lines for the last few conversation turns.
   *                     Lets the classifier condense elliptical follow-ups ("ahora con
   *                     esta") into self_contained_query before classifying.
   *
   * self_contained_query is the classifier's own resolution of the request — used for
   * classification accuracy and logging only; it never replaces the user's message.
   *
   * `options` lets a session swap the classifier for a full replacement prompt (same output
   * contract) and inject extra input keys the base prompt has no field for. A template that
   * changes what a flag MEANS on its surface owns the prompt; the runtime numbers it refers
   * to (e.g. focus_photo_count) are supplied here by the caller — same declare/wire split as
   * the rest of the templating. The return shape is unchanged either way.
   *
   * `usage` is the spend of the classifier call itself. The agent bills it as its own
   * "chat_routing" line, so it must be returned even when the classification falls back.
   */
  public async classifyQuery(
    query: string,
    attachedPhotoCount = 0,
    recentTurns: string[] = [],
    options?: {
      /** Full replacement for the classifier system prompt. Defaults to MESSAGE_QUERY_CLASSIFICATION. */
      prompt?: string
      /** Extra keys merged into the user JSON, referenced by a replacement prompt. */
      context?: Record<string, unknown>
      /** Model to classify with. Defaults to the cheapest Gemini. */
      model?: ModelName
      /** Gemini 3 thinking level; omitted = MINIMAL. */
      thinkingLevel?: string
      /** Redis cache for identical inputs; the key ignores thinkingLevel, so evals turn it off. */
      useCache?: boolean
      /** Force a backend; omitted = QUERY_CLASSIFIER_ENGINE (see defaultQueryClassifierEngine). */
      engine?: QueryClassifierEngine
    }
  ): Promise<QueryClassificationResult> {
    // A template that replaces the whole prompt (canvas redefines a flag's meaning
    // in prose) has no Jev equivalent yet, so an override always routes to the LLM.
    // Otherwise the engine is the caller's override, else the env default.
    const engine = options?.prompt
      ? QueryClassifierEngine.LLM
      : (options?.engine ?? defaultQueryClassifierEngine())

    return engine === QueryClassifierEngine.JEV
      ? this.classifyQueryByJev(query, attachedPhotoCount, recentTurns, options)
      : this.classifyQueryByLLM(query, attachedPhotoCount, recentTurns, options)
  }

  /**
   * LLM backend — micro-prompted Gemini with retry/fallback. Owns `self_contained_query`
   * (its own rewrite of an elliptical follow-up) and honours a template's prompt/context
   * override. On any failure it returns the all-false fallback so the turn still routes.
   */
  private async classifyQueryByLLM(
    query: string,
    attachedPhotoCount: number,
    recentTurns: string[],
    options?: {
      prompt?: string
      context?: Record<string, unknown>
      model?: ModelName
      thinkingLevel?: string
      useCache?: boolean
    }
  ): Promise<QueryClassificationResult> {
    try {
      const { result, cost, model } = await this.callLLMWithRetry({
        systemPrompt: options?.prompt ?? MESSAGE_QUERY_CLASSIFICATION,
        userContent: JSON.stringify({
          query,
          attached_photo_count: attachedPhotoCount,
          recent_turns: recentTurns,
          ...(options?.context ?? {}),
        }),
        model: options?.model ?? 'gemini-3.1-flash-lite',
        thinkingLevel: options?.thinkingLevel,
        useCache: options?.useCache,
      })
      const condensed =
        typeof result?.self_contained_query === 'string' && result.self_contained_query.trim()
          ? result.self_contained_query.trim()
          : query
      return {
        self_contained_query: condensed,
        has_photo_intent: result?.has_photo_intent === true,
        needs_artistic_evaluation: result?.needs_artistic_evaluation === true,
        attached_photos_only: result?.attached_photos_only === true,
        wants_more_results: result?.wants_more_results === true,
        usage: QueryService.toUsage(model, cost),
      }
    } catch (error) {
      console.error('[QueryService] classifyQuery error:', error)
      return { self_contained_query: query, ...ALL_FALSE_FLAGS, usage: EMPTY_USAGE }
    }
  }

  /**
   * Jev backend — resolves any ellipsis with a cheap LLM pass first, then classifies with
   * one System One request whose questions (one noul per flag) share a single state.
   *
   * The condensation runs ONLY when there is history to resolve; a single-turn message goes
   * straight to Jev at full speed. Both queries (raw + condensed) go into the state so each
   * signal reads the one it needs (see classifier_jev). Flags with a hard precondition are
   * resolved in code and never asked; when every flag resolves that way, even the Jev call
   * is skipped. The billed `usage` sums the condensation call and the Jev call, since both
   * are the classifier's cost (logged as one chat_routing line). Degrades to the LLM backend
   * when no API key is set or any step fails.
   */
  private async classifyQueryByJev(
    query: string,
    attachedPhotoCount: number,
    recentTurns: string[],
    options?: { useCache?: boolean } & Record<string, unknown>
  ): Promise<QueryClassificationResult> {
    if (!isJevConfigured()) {
      return this.classifyQueryByLLM(query, attachedPhotoCount, recentTurns, options)
    }

    try {
      // Resolve the ellipsis up front — only when there are turns to resolve against.
      let selfContainedQuery = query
      let condenseUsage = EMPTY_USAGE
      if (recentTurns.length > 0) {
        const condensed = await this.condenseQuery(
          query,
          attachedPhotoCount,
          recentTurns,
          options?.useCache
        )
        selfContainedQuery = condensed.text
        condenseUsage = condensed.usage
      }

      const { state, questions, resolved } = buildJevClassifierRequest({
        query,
        selfContainedQuery,
        attachedPhotoCount,
        recentTurns,
      })

      // Every flag pinned in code (no attachments, nothing shown yet) → no Jev call needed.
      if (Object.keys(questions).length === 0) {
        return {
          self_contained_query: selfContainedQuery,
          ...parseJevClassifierAnswers({}, resolved),
          usage: condenseUsage,
        }
      }

      const { result, model, cost } = await this.modelsService.getJevResponse(
        state,
        questions,
        JEV_CLASSIFIER_MODEL,
        options?.useCache ?? true,
        true // throwOnError — a failed request degrades to the LLM backend below
      )

      return {
        self_contained_query: selfContainedQuery,
        ...parseJevClassifierAnswers(result, resolved),
        usage: QueryService.sumUsage(condenseUsage, QueryService.toUsage(model, cost)),
      }
    } catch (error: any) {
      console.warn(
        `[QueryService] classifyQuery Jev failed (${error?.message}) → falling back to LLM`
      )
      return this.classifyQueryByLLM(query, attachedPhotoCount, recentTurns, options)
    }
  }

  /**
   * Cheap LLM pass that rewrites an elliptical follow-up into a standalone request, using
   * recent_turns. Flags-free (MESSAGE_QUERY_CONDENSE): its only job is the resolution Jev
   * cannot do itself. On any failure it returns the raw query, so a condensation outage
   * degrades to single-turn Jev classification rather than an error.
   */
  private async condenseQuery(
    query: string,
    attachedPhotoCount: number,
    recentTurns: string[],
    useCache?: boolean
  ): Promise<{ text: string; usage: QueryCallUsage }> {
    try {
      const { result, cost, model } = await this.callLLMWithRetry({
        systemPrompt: MESSAGE_QUERY_CONDENSE,
        userContent: JSON.stringify({
          query,
          attached_photo_count: attachedPhotoCount,
          recent_turns: recentTurns,
        }),
        model: JEV_CONDENSE_MODEL,
        useCache,
      })
      const text =
        typeof result?.self_contained_query === 'string' && result.self_contained_query.trim()
          ? result.self_contained_query.trim()
          : query
      return { text, usage: QueryService.toUsage(model, cost) }
    } catch (error: any) {
      console.warn('[QueryService] condenseQuery failed, using raw query:', error?.message)
      return { text: query, usage: EMPTY_USAGE }
    }
  }

  /** Sum two classifier-call usages into one chat_routing line (condensation + Jev). */
  private static sumUsage(a: QueryCallUsage, b: QueryCallUsage): QueryCallUsage {
    return {
      model: [a.model, b.model].filter(Boolean).join('+') || null,
      inputTokens: a.inputTokens + b.inputTokens,
      cachedTokens: a.cachedTokens + b.cachedTokens,
      outputTokens: a.outputTokens + b.outputTokens,
      thinkingTokens: a.thinkingTokens + b.thinkingTokens,
      totalTokens: a.totalTokens + b.totalTokens,
      costEur: a.costEur + b.costEur,
    }
  }

  // public async classifyCuratorialQuery(query: string): Promise<boolean> {
  //   try {
  //     const { result } = await this.modelsService.getGeminiResponse(
  //       MESSAGE_QUERY_CURATORIAL_CLASSIFICATION,
  //       JSON.stringify({ query }),
  //       'gemini-2.5-flash-lite'
  //     )
  //     return result?.is_curatorial === true
  //   } catch (error) {
  //     console.error('[QueryService] classifyCuratorialQuery error:', error)
  //     return false
  //   }
  // }

  /** Maximum word count before compacting the query for CLIP (77-token limit) */
  private static readonly CLIP_MAX_WORDS = 25

  /**
   * If the query exceeds the CLIP word limit, calls Gemini to produce a
   * shortened version that fits within the limit while preserving key visual
   * concepts. Returns null when no compaction is needed.
   */
  @withCache({
    provider: 'redis',
    ttl: 60 * 60 * 24 * 7,
  })
  public async compactQuery(
    query: string
  ): Promise<{ compact_query: string | null; cost: number }> {
    const wordCount = query.trim().split(/\s+/).length
    if (wordCount <= QueryService.CLIP_MAX_WORDS) {
      return { compact_query: null, cost: 0 }
    }

    try {
      const { result, cost } = await this.callLLMWithRetry({
        systemPrompt: MESSAGE_QUERY_COMPACT(QueryService.CLIP_MAX_WORDS),
        userContent: JSON.stringify({ query }),
        model: 'gemini-2.5-flash-lite',
        temperature: 0.1,
        useCache: true,
      })
      return { compact_query: result?.compact_query ?? null, cost: cost ?? 0 }
    } catch (error) {
      console.error('[QueryService] compactQuery error:', error)
      return { compact_query: null, cost: 0 }
    }
  }

  public async structureQuery(query: string, config: SearchModeConfig) {
    const needsStructuring =
      config.thresholds.tag !== null ||
      config.thresholds.descSegment !== null ||
      config.thresholds.descFullQuery !== null

    if (needsStructuring) {
      return this.structureQueryLLM(query, config)
    }

    return {
      structuredResult: {
        original: query,
        positive_segments: needsStructuring ? [query] : [],
        nuances_segments: [],
        no_prefix: query,
      },
    }
  }

  // withCost()
  // TODO: userid!!
  @withCache({
    provider: 'redis',
    ttl: 60 * 60 * 24 * 7,
  })
  public async structureQueryNLP(query) {
    let expansionCost = 0
    let structuredResult = await this.modelsService.getStructuredQuery(query)

    console.log(
      `[processQuery]: Result for ${query} -> ${JSON.stringify(structuredResult.positive_segments)}`
    )

    return {
      structuredResult,
      expansionCost,
    }
  }

  @withCache({
    provider: 'redis',
    ttl: 60 * 60 * 24 * 7,
  })
  public async structureQueryLLM(query, config: SearchModeConfig) {
    let expansionCost = 0

    // Lanzar ambas promesas en paralelo
    const modelOnePromise = this.callLLMWithRetry({
      systemPrompt: MESSAGE_QUERY_NO_PREFIX_AND_TRANSLATION,
      userContent: JSON.stringify({ query }),
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1,
      useCache: true,
    })

    const { result: modelOneResult, cost: modelOneCost } = await modelOnePromise
    // Fallback: si no_prefix vino vacío/undefined, usar la query original
    if (!modelOneResult.no_prefix) {
      modelOneResult.no_prefix = query
    }

    const queryStuctureMessage =
      config.queryStructurePrompt === 'implicit_only'
        ? MESSAGE_QUERY_STRUCTURE_CURATION_IMPLICIT_ONLY
        : MESSAGE_QUERY_STRUCTURE

    // Nueva llamada para metadatos
    const metadataPromise = this.callLLMWithRetry({
      systemPrompt: MESSAGE_QUERY_METADATA,
      userContent: JSON.stringify({ query }),
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1,
      useCache: true,
    })

    const metadataResponse = await metadataPromise
    const metadataResult = metadataResponse?.result

    // Segunda llamada, depende de modelOneResult
    const { result: modelResult, cost: modelTwoCost } = await this.callLLMWithRetry({
      systemPrompt: queryStuctureMessage,
      userContent: JSON.stringify({ query: modelOneResult.no_prefix }),
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1,
      useCache: true,
    })

    modelResult.original = query
    try {
      modelResult.positive_segments = [...new Set([...modelResult.positive_segments])]
    } catch (error) {
      console.log('Error processing positive_segments:', error)
    }
    modelResult.nuances_segments =
      config.thresholds.nuances !== null
        ? [...new Set(Object.values(modelResult.nuances_segments).flat())]
        : []
    modelResult.no_prefix = modelOneResult.no_prefix

    // Añadir los campos de metadata
    if (metadataResult) {
      modelResult.include_visual_aspects =
        metadataResult.include_technical_aspects ||
        metadataResult.include_artistic_aspects ||
        config.forceVisualAspects
    }

    console.log(
      `[processQuery]: Result for ${query} -> ${JSON.stringify(modelResult.positive_segments)} | ${JSON.stringify(modelResult.nuances_segments)}`
    )

    return {
      structuredResult: modelResult,
      noPrefixCost: modelOneCost,
      expansionCost: modelTwoCost,
    }
  }
}
