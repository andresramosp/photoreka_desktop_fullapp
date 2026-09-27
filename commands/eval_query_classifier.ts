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
 * The flags under test are has_photo_intent / needs_artistic_evaluation /
 * attached_photos_only / wants_more_results / needs_sequencing / disputes_verdict. Expected values are taken verbatim from
 * the prompt's own worked examples, plus extra multi-turn and Spanish cases that
 * stress the known Jev risk: resolving an elliptical follow-up against recent_turns.
 * The summary reports, per engine, overall accuracy and per-flag mismatch counts.
 */

type Case = {
  q: string
  attached?: number
  /** Photos in front of the user (attached + a canvas focus); defaults to `attached`. */
  inView?: number
  recent?: string[]
  photo: boolean // has_photo_intent
  art: boolean // needs_artistic_evaluation
  only: boolean // attached_photos_only
  more: boolean // wants_more_results
  /** needs_sequencing; omitted = false. */
  seq?: boolean
  /** disputes_verdict; omitted = false. */
  disp?: boolean
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
  { q: 'Create a chronological series of my trip to Japan',                     attached: 0, photo: true,  art: false, only: false, more: false, seq: true, note: 'objective order, but which photos tell the trip is an arrangement' },
  { q: 'How many photos do I have?',                                            attached: 0, photo: false, art: false, only: false, more: false },
  { q: 'How can I get better as a photographer?',                               attached: 0, photo: false, art: true,  only: false, more: false },
  { q: 'Add these to a new collection',                                         attached: 2, photo: false, art: false, only: false, more: false, note: 'library action' },
  { q: 'muéstrame mis mejores retratos',                                        attached: 0, photo: true,  art: true,  only: false, more: false, note: 'Spanish: "mejores" → artistic' },
  { q: 'describe esta foto',                                                    attached: 1, photo: true,  art: false, only: true,  more: false, note: 'Spanish, attached' },
  { q: 'busca fotos de mercados en Marruecos',                                  attached: 0, photo: true,  art: false, only: false, more: false, note: 'Spanish retrieval by subject' },
  { q: '¿cuál de estas pondrías en el hueco?',                       attached: 0, inView: 12, photo: true,  art: true,  only: false, more: false, seq: true, note: 'choice by fit among a canvas focus' },
  { q: 'which of these would you put in the gap of the grid?',               attached: 0, inView: 12, photo: true,  art: true,  only: false, more: false, seq: true, note: 'same, English' },
  { q: 'does this one fit in my series?',                                       attached: 1, photo: true,  art: true,  only: false, more: false, seq: true, note: 'fit against other photos' },
  { q: 'order these by date',                                                   attached: 4, photo: true,  art: false, only: true,  more: false, note: 'objective ordering: facts, not taste' },
  { q: 'hazme una serie con estas',                                             attached: 0, inView: 11, photo: true,  art: true,  only: false, more: false, seq: true, note: 'build a series from the canvas focus' },
  { q: 'tell me how to break these into groups and what holds each one together', attached: 0, inView: 12, photo: true, art: true, only: false, more: false, seq: true, note: 'grouping by idea' },
  { q: 'split these into colour and black and white',                          attached: 0, inView: 12, photo: true,  art: false, only: false, more: false, note: 'split by one objective attribute: not an arrangement' },

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
  { q: 'no, tiene que ser usando todas las fotos', attached: 0, inView: 10, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: vale esta es mi seleccion final, haz una secuencia completa', 'assistant: He organizado tu selección en una secuencia… [showed 8 photos]'],
    note: 'a correction to a proposed sequence keeps the arrangement intent; a requirement restated, not pushback (real miss, 2026-09-26)' },

  // ── Pushback on an earlier verdict (disputes_verdict) ──
  { q: 'no, esa como primera no me convence', attached: 0, inView: 10, photo: true, art: true, only: false, more: false, seq: true, disp: true,
    recent: ['user: vale esta es mi seleccion final, haz una secuencia completa', 'assistant: He situado DSCF6538.jpg como apertura, ya que establece el tono de la serie… [showed 10 photos]'],
    note: 'bare pushback on an opener (real case, 2026-09-26)' },
  { q: 'pues a mi me parece mejor esta', attached: 0, inView: 3, photo: true, art: true, only: false, more: false, disp: true,
    recent: ['user: y de estas 3 cual es la mejor?', 'assistant: La más fuerte es DSC06467.jpg: el gesto organiza el encuadre, mientras las otras dos dependen del color. [showed 3 photos]'],
    note: 'preference against a comparison verdict (real miss, 2026-09-27)' },
  { q: 'are you sure?', attached: 0, photo: true, art: true, only: false, more: false, disp: true,
    recent: ['user: which of these two photos is stronger?', 'assistant: DSC0123.jpg is stronger: the gesture carries the frame.'],
    note: 'doubt with no content of its own' },
  { q: 'vale, pero cambia la primera', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true, disp: true,
    recent: ['user: hazme una serie con estas', 'assistant: He abierto con DSC00810.jpg porque fija el tono… [showed 6 photos]'],
    note: 'pushback phrased as a request that overturns the verdict' },
  { q: 'vale, me has convencido', attached: 0, inView: 5, photo: false, art: false, only: false, more: false,
    recent: ['user: no tengo nada claro que DSCF8078.jpg deba ser el cierre de la serie', 'assistant: Mantengo DSCF8078.jpg como cierre: su mirada fuera de campo deja la serie abierta… [showed 5 photos]'],
    note: 'agreement after a held verdict inherits nothing — not a new pushback (real miss, 2026-09-27)' },
  { q: 'no esta mal, pero prefiero que uses fotos del propio canvas para complementar estas dos', attached: 0, inView: 2, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: hazme un díptico con estas dos y amplíalo a una serie de 5', 'assistant: He ampliado el díptico con tres fotos de tu catálogo que mantienen el cruce de miradas… [showed 5 photos]'],
    note: 'a change of direction phrased as a preference is not pushback (real miss, 2026-09-27)' },
  { q: 'no, pero no quiero que la serie se desarrolle por narrativa, sino por aspectos formales: estetica, composicion, etc', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: hazme una serie con estas', 'assistant: He ordenado la serie como un paseo: abre con la llegada al mercado y cierra con la despedida en la parada… [showed 6 photos]'],
    note: 'asks for a different organizing logic: a change of direction, not pushback' },
  { q: 'why did you pick that one as the opener?', attached: 0, inView: 8, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: sequence these photos', 'assistant: I opened with DSC01.jpg because it sets the tone… [showed 8 photos]'],
    note: 'a question about the verdict, not a disagreement' },
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
    const miss: Record<'photo' | 'art' | 'only' | 'more' | 'seq' | 'disp', { fp: number; fn: number }> = {
      photo: { fp: 0, fn: 0 },
      art: { fp: 0, fn: 0 },
      only: { fp: 0, fn: 0 },
      more: { fp: 0, fn: 0 },
      seq: { fp: 0, fn: 0 },
      disp: { fp: 0, fn: 0 },
    }

    this.logger.log('')
    this.logger.log(`══════ engine=${engineName} ══════`)

    for (const [i, c] of CASES.entries()) {
      const res = await qs.classifyQuery(c.q, c.attached ?? 0, c.recent ?? [], {
        engine,
        photosInViewCount: c.inView,
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
        seq: res.needs_sequencing,
        disp: res.disputes_verdict,
      }
      const exp = {
        photo: c.photo,
        art: c.art,
        only: c.only,
        more: c.more,
        seq: c.seq ?? false,
        disp: c.disp ?? false,
      }
      let ok = true
      for (const k of ['photo', 'art', 'only', 'more', 'seq', 'disp'] as const) {
        if (got[k] === exp[k]) continue
        ok = false
        if (got[k]) miss[k].fp++
        else miss[k].fn++
      }
      if (ok) pass++

      if (!ok || this.verbose) {
        const render = (f: typeof got) =>
          `${f.photo ? 'T' : 'F'}${f.art ? 'T' : 'F'}${f.only ? 'T' : 'F'}${f.more ? 'T' : 'F'}${f.seq ? 'T' : 'F'}${f.disp ? 'T' : 'F'}`
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

    const flagLine = (['photo', 'art', 'only', 'more', 'seq', 'disp'] as const)
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
