// @ts-nocheck

import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { withCache } from '../decorators/withCache.js'
import withCost from '../decorators/withCost.js'
import {
  MESSAGE_QUERY_CLASSIFICATION,
  // MESSAGE_QUERY_CURATORIAL_CLASSIFICATION,
  MESSAGE_QUERY_METADATA,
  MESSAGE_QUERY_NO_PREFIX_AND_TRANSLATION,
  MESSAGE_QUERY_STRUCTURE,
  MESSAGE_QUERY_STRUCTURE_CURATION,
  MESSAGE_QUERY_STRUCTURE_CURATION_IMPLICIT_ONLY,
} from '../utils/prompts/query.js'
import AnalyzerService from './analyzer_service.js'
import VectorService from './vector_service.js'
import ModelsService from './models_service.js'
import type { SearchMode } from './search_text_service.js'

export default class QueryService {
  public modelsService: ModelsService = null
  public vectorService: VectorService = null
  public analyzerService: AnalyzerService = null

  constructor() {
    this.modelsService = new ModelsService()
    this.vectorService = new VectorService()
    this.analyzerService = new AnalyzerService()
  }

  public async classifyQuery(
    query: string
  ): Promise<{ has_photo_intent: boolean; needs_artistic_evaluation: boolean }> {
    const fallback = { has_photo_intent: false, needs_artistic_evaluation: false }
    try {
      const { result } = await this.modelsService.getGeminiResponse(
        MESSAGE_QUERY_CLASSIFICATION,
        JSON.stringify({ query }),
        'gemini-2.5-flash-lite'
      )
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

  public async structureQuery(query: string, searchMode: SearchMode) {
    const numberOfWords = query.split(' ').length
    const emptyResult = {
      structuredResult: {
        original: query,
        positive_segments: [query],
        nuances_segments: [],
        no_prefix: query,
      },
    }

    if (numberOfWords > 2 || searchMode == 'curation') {
      return this.structureQueryLLM(query, searchMode)
    } else {
      return emptyResult
    }
  }

  // withCost()
  // TODO: userid!!
  @withCache({
    provider: 'redis',
    ttl: 60 * 10,
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
  })
  public async structureQueryLLM(query, searchMode: SearchMode) {
    let expansionCost = 0

    // Lanzar ambas promesas en paralelo
    const modelOnePromise = this.modelsService.getGeminiResponse(
      MESSAGE_QUERY_NO_PREFIX_AND_TRANSLATION,
      JSON.stringify({ query }),
      'gemini-2.5-flash-lite',
      { temperature: 0.1 },
      true,
      true // throwOnError: retries will exhaust, then throw to caller
    )

    const { result: modelOneResult, cost: modelOneCost } = await modelOnePromise
    // Fallback: si no_prefix vino vacío/undefined, usar la query original
    if (!modelOneResult.no_prefix) {
      modelOneResult.no_prefix = query
    }

    // Para broad, solo devolver no_prefix y traducción
    if (searchMode === 'broad') {
      return {
        structuredResult: {
          original: query,
          positive_segments: [],
          nuances_segments: [],
          no_prefix: modelOneResult.no_prefix,
          translated: modelOneResult.translated,
        },
        noPrefixCost: modelOneCost,
        expansionCost: 0,
      }
    }

    const queryStuctureMessage =
      searchMode == 'curation' || searchMode == 'adaptive'
        ? MESSAGE_QUERY_STRUCTURE_CURATION_IMPLICIT_ONLY
        : MESSAGE_QUERY_STRUCTURE

    // Nueva llamada para metadatos
    const metadataPromise = this.modelsService.getGeminiResponse(
      MESSAGE_QUERY_METADATA,
      JSON.stringify({ query }),
      'gemini-2.5-flash-lite',
      { temperature: 0.1 },
      true,
      true
    )

    const metadataResponse = await metadataPromise
    const metadataResult = metadataResponse?.result

    // Segunda llamada, depende de modelOneResult
    const { result: modelResult, cost: modelTwoCost } = await this.modelsService.getGeminiResponse(
      queryStuctureMessage,
      JSON.stringify({ query: modelOneResult.no_prefix }),
      'gemini-2.5-flash-lite',
      { temperature: 0.1 },
      true,
      true
    )

    // const { result: modelResult, cost: modelTwoCost } = await this.modelsService.getGPTResponse(
    //   queryStuctureMessage,
    //   JSON.stringify({ query: modelOneResult.no_prefix }),
    //   searchMode == 'curation' || searchMode == 'adaptive' ? 'gpt-5-nano' : 'gpt-5-nano'
    // )

    modelResult.original = query
    try {
      modelResult.positive_segments = [...new Set([...modelResult.positive_segments])]
    } catch (error) {
      console.log('Error processing positive_segments:', error)
    }
    modelResult.nuances_segments =
      searchMode == 'curation' || searchMode == 'adaptive'
        ? [...new Set(Object.values(modelResult.nuances_segments).flat())]
        : []
    modelResult.no_prefix = modelOneResult.no_prefix

    // Añadir los campos de metadata
    if (metadataResult) {
      modelResult.include_visual_aspects = // TODO: se peude desglosar en artistc/technical
        metadataResult.include_technical_aspects ||
        metadataResult.include_artistic_aspects ||
        searchMode == 'curation' ||
        searchMode == 'adaptive'
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
