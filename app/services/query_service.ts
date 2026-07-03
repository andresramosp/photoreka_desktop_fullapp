// @ts-nocheck

import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { withCache } from '../decorators/withCache.js'
import withCost from '../decorators/withCost.js'
import {
  MESSAGE_QUERY_CLASSIFICATION,
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
import type { SearchMode } from './search_text_service.js'
import type { SearchModeConfig } from './search_text_service.js'

const LLM_MAX_RETRIES = 2
const LLM_RETRY_BASE_DELAY_MS = 1000
/** Bumped to on failure of the primary (cheaper) model, e.g. gemini-2.5-flash-lite. */
const GEMINI_FALLBACK_MODEL: ModelName = 'gemini-2.5-flash'

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
  }): Promise<any> {
    const {
      systemPrompt,
      userContent,
      model,
      fallbackModel = GEMINI_FALLBACK_MODEL,
      temperature = 0.1,
      useCache = true,
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
            true // throwOnError: retries/fallback are handled here
          )
          if (!result?.result) {
            throw new Error(`LLM returned empty/undefined response (model: ${currentModel})`)
          }
          return result
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

  public async classifyQuery(
    query: string
  ): Promise<{ has_photo_intent: boolean; needs_artistic_evaluation: boolean }> {
    const fallback = { has_photo_intent: false, needs_artistic_evaluation: false }
    try {
      const { result } = await this.callLLMWithRetry({
        systemPrompt: MESSAGE_QUERY_CLASSIFICATION,
        userContent: JSON.stringify({ query }),
        model: 'gemini-2.5-flash-lite',
      })
      return {
        has_photo_intent: result?.has_photo_intent === true,
        needs_artistic_evaluation: result?.needs_artistic_evaluation === true,
      }
    } catch (error) {
      console.error('[QueryService] classifyQuery error:', error)
      return fallback
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
    const numberOfWords = query.split(' ').length

    if (needsStructuring && numberOfWords > 2) {
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
