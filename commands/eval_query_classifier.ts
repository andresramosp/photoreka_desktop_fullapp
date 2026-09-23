import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import QueryService from '#services/query_service'
import type { ModelName } from '#services/models_service'
import { QueryClassifierEngine } from '../app/utils/classifier_jev.js'
import { isJevConfigured, resolveJevProvider } from '../app/utils/jev_provider.js'

/**
 * Battery against the BASE query classifier (MESSAGE_QUERY_CLASSIFICATION / its Jev
 * equivalent), the pre-flight routing step in QueryService.classifyQuery.
 *
 *   node ace eval:query-classifier [--engines=LLM,JEV] [--model=…] [--thinking=low] [--verbose]
 *
 * Same battery runs against every engine so LLM and Jev are compared on identical
 * cases. Runs with the Redis cache OFF (the Jev cache key is deterministic, and the
 * LLM cache key ignores thinking level, so a cached hit would compare a call to itself).
 *
 * The four flags under test are has_photo_intent / needs_artistic_evaluation /
 * attached_photos_only / wants_more_results. Expected values are taken verbatim from
 * the prompt's own worked examples, plus extra multi-turn and Spanish cases that
 * stress the known Jev risk: resolving an elliptical follow-up against recent_turns.
 * The summary reports, per engine, overall accuracy and per-flag mismatch counts.
 */

type Case = {
  q: string
  attached?: number
  recent?: string[]
  photo: boolean // has_photo_intent
  art: boolean // needs_artistic_evaluation
  only: boolean // attached_photos_only
  more: boolean // wants_more_results
  note?: string
}

// prettier-ignore
const CASES: Case[] = [
  // ── Single-turn (recent = []) — straight from the prompt's examples ─────
  { q: 'Show me my street photos',                                              attached: 0, photo: true,  art: false, only: false, more: false },
  { q: 'Give a critique of this photo',                                         attached: 1, photo: true,  art: true,  only: true,  more: false },
  { q: 'Which photo is better from the perspective of street photography?',     attached: 3, photo: true,  art: true,  only: true,  more: false },
  { q: 'Which of these two photos is stronger and why?',                        attached: 2, photo: true,  art: true,  only: true,  more: false },
  { q: 'Describe this photo',                                                   attached: 1, photo: true,  art: false, only: true,  more: false },
  { q: 'Describe this photo',                                                   attached: 0, photo: true,  art: false, only: false, more: false, note: 'no attachment → refers to an earlier photo' },
  { q: 'Find photos similar to this one',                                       attached: 1, photo: true,  art: false, only: false, more: false, note: 'needs the catalog' },
  { q: 'Is this my best street photo?',                                         attached: 1, photo: true,  art: true,  only: false, more: false, note: '"my best" invokes the catalog' },
  { q: 'Which are my most original photos?',                                    attached: 0, photo: true,  art: true,  only: false, more: false },
  { q: 'Select the best 5 portraits for my portfolio',                          attached: 0, photo: true,  art: true,  only: false, more: false },
  { q: 'Create a chronological series of my trip to Japan',                     attached: 0, photo: true,  art: false, only: false, more: false, note: 'objective sequence' },
  { q: 'How many photos do I have?',                                            attached: 0, photo: false, art: false, only: false, more: false },
  { q: 'How can I get better as a photographer?',                               attached: 0, photo: false, art: true,  only: false, more: false },
  { q: 'Add these to a new collection',                                         attached: 2, photo: false, art: false, only: false, more: false, note: 'library action' },
  { q: 'muéstrame mis mejores retratos',                                        attached: 0, photo: true,  art: true,  only: false, more: false, note: 'Spanish: "mejores" → artistic' },
  { q: 'describe esta foto',                                                    attached: 1, photo: true,  art: false, only: true,  more: false, note: 'Spanish, attached' },
  { q: 'busca fotos de mercados en Marruecos',                                  attached: 0, photo: true,  art: false, only: false, more: false, note: 'Spanish retrieval by subject' },

  // ── Multi-turn — ellipsis resolved against recent_turns (the Jev risk) ──
  { q: 'now with this one', attached: 1, photo: true, art: true, only: false, more: false,
    recent: ['user: find me photos chromatically similar to this one and give me your opinion', 'assistant: I have analyzed your photograph… [showed 16 photos]'],
    note: 'inherits similar+opinion; compares against shown → not attached-only' },
  { q: 'and this one?', attached: 1, photo: true, art: true, only: true, more: false,
    recent: ['user: give a critique of this photo', 'assistant: The photograph stands out for its composition…'],
    note: 'inherits a critique of the attached photo' },
  { q: 'is it better than the ones you showed me?', attached: 1, photo: true, art: true, only: false, more: false,
    recent: ['user: show me my best street photos', 'assistant: Here are your best street photos. [showed 5 photos]'],
    note: 'compares the attachment against shown photos' },
  { q: 'another round', attached: 0, photo: true, art: false, only: false, more: true,
    recent: ['user: show me photos of urban landscapes with few people', 'assistant: Here is a selection… [showed 6 photos]'],
    note: 'pagination' },
  { q: 'sí', attached: 0, photo: true, art: true, only: false, more: true,
    recent: ['user: mis mejores fotos de gatos', 'assistant: Aquí tienes una primera ronda… ¿quieres ver más? [showed 20 photos]'],
    note: 'Spanish bare affirmative answering an offer to continue' },
  { q: 'which of those would you say is the best?', attached: 0, photo: true, art: true, only: false, more: false,
    recent: ['user: show me photos of urban landscapes with few people', 'assistant: Here is a selection… [showed 6 photos]'],
    note: 're-reference to the shown batch, not a new round' },
  { q: 'perfect, thanks!', attached: 0, photo: false, art: false, only: false, more: false,
    recent: ['user: select my best portraits', 'assistant: Here is a selection… [showed 8 photos]'],
    note: 'pure praise closes the request — inherits nothing' },
  { q: 'genial, gracias', attached: 0, photo: false, art: false, only: false, more: false,
    recent: ['user: enséñame calle nocturna', 'assistant: Aquí tienes… [showed 6 photos]'],
    note: 'Spanish praise, inherits nothing' },
  { q: 'gracias, ahora dame más', attached: 0, photo: true, art: false, only: false, more: true,
    recent: ['user: enséñame calle nocturna', 'assistant: Aquí tienes… [showed 6 photos]'],
    note: 'praise + request → still a new round' },
  { q: 'más, pero en blanco y negro', attached: 0, photo: true, art: false, only: false, more: true,
    recent: ['user: fotos de arquitectura brutalista', 'assistant: Aquí tienes… [showed 8 photos]'],
    note: 'Spanish: extends while tweaking the criterion' },
  { q: 'veamos mas', attached: 0, photo: true, art: false, only: false, more: true,
    recent: ['user: busca muchas fotos de gatitos', 'assistant: Aquí tienes una selección… [showed 12 photos]'],
    note: 'Spanish "let\'s see more" (no accent): must become "more, different from shown", not echo the prior request verbatim' },
]

const ENGINE_BY_NAME: Record<string, QueryClassifierEngine> = {
  LLM: QueryClassifierEngine.LLM,
  JEV: QueryClassifierEngine.JEV,
}

export default class EvalQueryClassifier extends BaseCommand {
  static commandName = 'eval:query-classifier'
  static description = 'Runs a battery against the base query classifier across LLM and Jev'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Comma-separated engines to run: LLM,JEV', default: 'LLM,JEV' })
  declare engines: string

  @flags.string({ description: 'Model to classify with (LLM engine only; default: classifier default)' })
  declare model?: string

  @flags.string({ description: 'Gemini 3 thinking level (LLM engine only): minimal | low | medium | high' })
  declare thinking?: string

  @flags.boolean({ description: 'Print every case, not only the failures' })
  declare verbose: boolean

  async run() {
    const qs = new QueryService()
    const engines = this.engines
      .split(',')
      .map((e) => e.trim().toUpperCase())
      .filter((e) => e in ENGINE_BY_NAME) as (keyof typeof ENGINE_BY_NAME)[]

    if (engines.length === 0) {
      this.logger.error('No valid engines. Use --engines=LLM,JEV')
      return
    }
    if (engines.includes('JEV') && !isJevConfigured()) {
      this.logger.warning(
        `JEV requested but provider "${resolveJevProvider().name}" has no API key — it will silently fall back to LLM. Set the key to test Jev for real.`
      )
    }

    for (const engineName of engines) {
      await this.runEngine(qs, engineName)
    }
  }

  private async runEngine(qs: QueryService, engineName: keyof typeof ENGINE_BY_NAME) {
    const engine = ENGINE_BY_NAME[engineName]
    const startedAt = Date.now()
    const modelsSeen = new Map<string, number>()
    let costEur = 0
    let pass = 0
    // per-flag mismatches: [predicted true wrongly, predicted false wrongly]
    const miss: Record<'photo' | 'art' | 'only' | 'more', { fp: number; fn: number }> = {
      photo: { fp: 0, fn: 0 },
      art: { fp: 0, fn: 0 },
      only: { fp: 0, fn: 0 },
      more: { fp: 0, fn: 0 },
    }

    this.logger.log('')
    this.logger.log(`══════ engine=${engineName} ══════`)

    for (const [i, c] of CASES.entries()) {
      const res = await qs.classifyQuery(c.q, c.attached ?? 0, c.recent ?? [], {
        engine,
        model: this.model as ModelName | undefined,
        thinkingLevel: this.thinking,
        useCache: false,
      })
      modelsSeen.set(res.usage.model ?? '?', (modelsSeen.get(res.usage.model ?? '?') ?? 0) + 1)
      costEur += res.usage.costEur

      const got = {
        photo: res.has_photo_intent,
        art: res.needs_artistic_evaluation,
        only: res.attached_photos_only,
        more: res.wants_more_results,
      }
      const exp = { photo: c.photo, art: c.art, only: c.only, more: c.more }
      let ok = true
      for (const k of ['photo', 'art', 'only', 'more'] as const) {
        if (got[k] === exp[k]) continue
        ok = false
        if (got[k]) miss[k].fp++
        else miss[k].fn++
      }
      if (ok) pass++

      if (!ok || this.verbose) {
        const render = (f: typeof got) =>
          `${f.photo ? 'T' : 'F'}${f.art ? 'T' : 'F'}${f.only ? 'T' : 'F'}${f.more ? 'T' : 'F'}`
        const idx = String(i + 1).padStart(2)
        this.logger.log(
          `${ok ? '  ok ' : 'FAIL'} #${idx} exp=${render(exp)} got=${render(got)}  "${c.q}" (a${c.attached ?? 0}${c.recent ? ' +ctx' : ''})${c.note ? '  // ' + c.note : ''}`
        )
        // On the Jev backend self_contained_query is the condensation pass's output — show it
        // when it rewrote the message, so a discourse-flag miss can be traced to the rewrite.
        if (res.self_contained_query && res.self_contained_query !== c.q) {
          this.logger.log(`         ↳ condensed: "${res.self_contained_query}"`)
        }
      }
    }

    const flagLine = (['photo', 'art', 'only', 'more'] as const)
      .map((k) => `${k}(+${miss[k].fp}/-${miss[k].fn})`)
      .join(' ')
    const models = [...modelsSeen].map(([m, n]) => `${m}x${n}`).join(', ')
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
    this.logger.log('')
    this.logger.log(`TOTAL ${pass}/${CASES.length} pass · mismatches ${flagLine}`)
    this.logger.log(
      `RUN engine=${engineName} · models=${models} · cost=€${costEur.toFixed(6)} · ${seconds}s`
    )
    this.logger.log('  (flag(+x/-y): x = predicted true but should be false, y = predicted false but should be true)')
  }
}
