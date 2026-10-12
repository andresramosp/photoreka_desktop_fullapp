import { applyLogicProximities, labelToLogicProximity, type NLITermsType } from '../utils/nli_jev.js'
import { classifyEntailment, type SearchTicket } from '#desktop/cloud_functions'

/**
 * Inferencia lógica (NLI) de la búsqueda precisa. Escritorio: cada término se clasifica en el
 * servicio de la nube, con el prompt, los modelos, los lotes y los reintentos del motor LLM de
 * App; aquí se convierten los veredictos en logicProximity.
 */

/** Tope de candidatos por término, para acotar coste y latencia. */
const MAX_CANDIDATES = 1500

export default class LogicInferenceService {
  public async adjustProximitiesByContextInference(
    ticket: SearchTicket,
    term: string,
    texts: any[],
    termsType: NLITermsType = 'tag'
  ): Promise<any[]> {
    if (!Array.isArray(texts) || texts.length === 0) return []
    try {
      const names = [...new Set(texts.map((t) => t?.name).filter((n) => n !== undefined && n !== null))]
      const verdicts = await classifyEntailment(ticket, term, names.slice(0, MAX_CANDIDATES), termsType)
      const logicByName = new Map(verdicts.map((v) => [v.name, labelToLogicProximity(v.label, v.confidence)]))
      return applyLogicProximities(texts, logicByName)
    } catch (error: any) {
      console.error('Error en LogicInferenceService.adjustProximitiesByContextInference:', error?.message)
      return []
    }
  }
}
