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
  /** Flags this case is scored on; omitted = all. For cases whose other flags are debatable. */
  scored?: Flag[]
  note?: string
}

type Flag = 'photo' | 'art' | 'only' | 'more' | 'seq' | 'disp'

const DOGS = [
  'user: enséñame fotos de perros',
  'assistant: Aquí tienes fotos de perros de tu catálogo… [showed 12 photos]',
]
const BEST_DOGS = [
  'user: mis mejores fotos de perros',
  'assistant: Aquí tienes tus 8 mejores fotos de perros: destacan por la luz lateral y los gestos… [showed 8 photos]',
]

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

  // ── Pushback (disputes_verdict): strict — only a clear dispute of the earlier verdict ──
  { q: 'no, esa como primera no me convence', attached: 0, inView: 10, photo: true, art: true, only: false, more: false, seq: true, disp: true,
    recent: ['user: vale esta es mi seleccion final, haz una secuencia completa', 'assistant: He situado DSCF6538.jpg como apertura, ya que establece el tono de la serie… [showed 10 photos]'],
    note: 'bare pushback on an opener (real case, 2026-09-26)' },
  { q: 'pues a mi me parece mejor esta', attached: 0, inView: 3, photo: true, art: true, only: false, more: false, disp: true,
    recent: ['user: y de estas 3 cual es la mejor?', 'assistant: La más fuerte es DSC06467.jpg: el gesto organiza el encuadre, mientras las otras dos dependen del color. [showed 3 photos]'],
    note: 'preference against a comparison verdict (real miss, 2026-09-27)' },
  { q: 'no lo tengo claro, yo prefiero esta... la palangana amarilla es muy surrealista', attached: 1, photo: true, art: true, only: false, more: false, disp: true, scored: ['disp'],
    recent: ['user: cual es mas original?', 'assistant: De las tres, la más **original** es sin duda [[photo:34461|DSC02565.jpg]]. Lo que la eleva es ese **paraguas abandonado** en primer plano; es un elemento inesperado que sugiere una historia previa —quizás una lluvia repentina que ya cesó— y crea un contraste muy potente con la quietud de la mujer absorta en su tableta. No es solo una captura de [showed 3 photos]'],
    note: 'a preference for another photo, hedged with doubt, against a comparison verdict (real miss, 2026-10-03)' },
  { q: 'no estoy de acuerdo, yo no te he preguntado por street photography, sino cual es mas artistica', attached: 0, inView: 2, photo: true, art: true, only: false, more: false, disp: true, scored: ['disp'],
    recent: ['user: cual tiene un punto mas artistico?', 'assistant: Desde tu perspectiva de fotógrafo de calle con una inclinación artística, la respuesta clara es [[photo:242637|DSCF8967.jpg]]. Mientras que la otra imagen es un ejercicio estético más sencillo, esta captura en Estambul demuestra una ambición compositiva superior.\n\nEn [[photo:242637|DSCF8967.jpg]], l [showed 2 photos]'],
    note: 'outright disagreement whose reason is that the verdict used the wrong standard (real miss, 2026-10-03)' },
  { q: 'yo no lo veo asi, estas seguro? mira bien', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true, disp: true, scored: ['disp'],
    recent: ['user: la verdad es que no lo veo claro, creo que meter una aldea africana en medio puede ser rompedor de algun modo', 'assistant: Para que un contraste funcione como recurso **rompedor** y no como un tropiezo editorial, debe compartir un eje claro que haga evidente la intención del choque.\n\nColocar [[photo:154846|DSC07430.jpg]] entre [[photo:34194|DSC06532.jpg]] (la joven abstraída frente a la publicidad) y [[photo:34523|DSC03584-Mejorado-NR.jpg]] (la cola en la acera parisina) no [showed 4 photos]'],
    note: 'outright disagreement followed by a doubt (real miss, 2026-10-03)' },
  { q: 'la verdad es que no lo veo claro, creo que meter una aldea africana en medio puede ser rompedor de algun modo', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true, scored: ['disp'],
    recent: ['user: para esta serie, tengo dudas sobre cual de estas dos fotos poner en el hueco', 'assistant: La elección indiscutible para ese hueco es [[photo:35283|DSC08157.jpg]]. La serie que tienes montada en la hilera central —con [[photo:41677|DSC01338.jpg]], [[photo:34194|DSC06532.jpg]], [[photo:34523|DSC03584-Mejorado-NR.jpg]] y [[photo:34554|DSC03912.jpg]]— es una secuencia puramente urbana de cal [showed 6 photos]'],
    note: 'a doubt plus a counter-idea: strict pushback leaves it out' },
  { q: 'sigo sin verlo claro', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true, scored: ['disp'],
    recent: ['user: yo no lo veo asi, estas seguro? mira bien', 'assistant: Mirando despacio la hilera completa, la razón sigue estando del lado de [[photo:35283|DSC08157.jpg]].\n\nFíjate en cómo discurre la fila central: [[photo:41677|DSC01338.jpg]], [[photo:34194|DSC06532.jpg]], [[photo:34523|DSC03584-Mejorado-NR.jpg]] y [[photo:34554|DSC03912.jpg]] comparten una misma esca [showed 6 photos]'],
    note: 'a persisting doubt: strict pushback leaves it out' },
  { q: 'are you sure?', attached: 0, photo: true, art: true, only: false, more: false,
    recent: ['user: which of these two photos is stronger?', 'assistant: DSC0123.jpg is stronger: the gesture carries the frame.'],
    note: 'a doubt, not an explicit contrary judgment: strict pushback leaves it out' },
  { q: 'vale, pero cambia la primera', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: hazme una serie con estas', 'assistant: He abierto con DSC00810.jpg porque fija el tono… [showed 6 photos]'],
    note: 'a change asked without saying the verdict is wrong: strict pushback leaves it out' },
  { q: 'vale, me has convencido', attached: 0, inView: 5, photo: false, art: false, only: false, more: false,
    recent: ['user: no tengo nada claro que DSCF8078.jpg deba ser el cierre de la serie', 'assistant: Mantengo DSCF8078.jpg como cierre: su mirada fuera de campo deja la serie abierta… [showed 5 photos]'],
    note: 'agreement after a held verdict inherits nothing — not a new pushback (real miss, 2026-09-27)' },
  { q: 'no esta mal, pero prefiero que uses fotos del propio canvas para complementar estas dos', attached: 0, inView: 2, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: hazme un díptico con estas dos y amplíalo a una serie de 5', 'assistant: He ampliado el díptico con tres fotos de tu catálogo que mantienen el cruce de miradas… [showed 5 photos]'],
    note: 'a change of direction phrased as a preference is not pushback (real miss, 2026-09-27)' },
  { q: 'no, pero no quiero que la serie se desarrolle por narrativa, sino por aspectos formales: estetica, composicion, etc', attached: 0, inView: 6, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: hazme una serie con estas', 'assistant: He ordenado la serie como un paseo: abre con la llegada al mercado y cierra con la despedida en la parada… [showed 6 photos]'],
    note: 'asks for a different organizing logic: a change of direction, not pushback' },
  { q: 'lo siento no se a que foto te refieres, damela puesta en la serie', attached: 0, inView: 6, photo: true, art: false, only: false, more: false, seq: true,
    recent: ['user: no me convence la foto que propusiste como pausa, las personas están quietas pero el encuadre es denso', 'assistant: Mantengo la pausa en la cuarta posición: su quietud frena el ritmo antes del cierre… [showed 6 photos]'],
    note: 'a clarification after a pushback turn inherits no pushback (real miss, 2026-09-27)' },
  { q: 'vale, pues entonces ponme la serie completa con ese cambio', attached: 0, inView: 6, photo: true, art: false, only: false, more: false, seq: true,
    recent: ['user: creo que la tercera no encaja, la mujer del fondo distrae', 'assistant: Tienes razón en que distrae: la cambio por DSC0441.jpg, que mantiene el gesto sin ruido… [showed 6 photos]'],
    note: 'a follow-up after an accepted pushback is not pushback' },
  { q: 'y ahora fuera de Marruecos, pero sin irnos a una ciudad Europea, que seria demasiado', attached: 0, photo: true, art: false, only: false, more: false, scored: ['photo'],
    recent: ['user: proponme un recorrido por Marruecos para este tablero', 'assistant: Te propongo un recorrido que arranca en la medina de Marrakech y termina en las dunas de Merzouga… [showed 6 photos]'],
    note: 'a follow-up whose thread never said "photos" (real miss, 2026-10-03; earlier turns reconstructed)' },
  { q: 'discrepo, creo que es una gran foto de naturaleza', attached: 0, photo: true, art: true, only: false, more: false, disp: true, scored: ['disp'],
    recent: ['user: ¿esta foto encajaría en un concurso de fotografía de naturaleza?', 'assistant: Entiendo la intención de romper moldes mediante el contraste, pero los jurados de fotografía de naturaleza se centran en la vida salvaje y el paisaje sin intervención humana: el factor humano y el cigarro sacan esta imagen del género, así que no la presentaría a ese concurso.'],
    note: 'contrary judgment of what fits a genre (real miss, 2026-09-28; previous reply reconstructed from its first line)' },
  { q: 'why did you pick that one as the opener?', attached: 0, inView: 8, photo: true, art: true, only: false, more: false, seq: true,
    recent: ['user: sequence these photos', 'assistant: I opened with DSC01.jpg because it sets the tone… [showed 8 photos]'],
    note: 'a question about the verdict, not a disagreement' },

  // ── Rejection of results, scored on disputes_verdict only: asks for other photos, not pushback ──
  { q: 'no, esas no me valen', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'rejects a retrieval' },
  { q: 'no me gustan', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'rejects a retrieval' },
  { q: 'ninguna me convence', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: '"no me convence" echoes a pushback example' },
  { q: 'no es lo que buscaba', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'rejects a retrieval' },
  { q: 'esas no, otras', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'asks for others' },
  { q: 'no, esas son muy flojas', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'judges the results, but the assistant judged nothing' },
  { q: 'no, esos no son perros, son zorros', recent: DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'fact corrected' },
  { q: "no, these won't do", recent: ['user: show me photos of dogs', 'assistant: Here are dog photos from your catalog… [showed 12 photos]'], photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'English retrieval rejection' },
  { q: 'no, esas no me valen', recent: ['user: hazme una serie con fotos de perros', 'assistant: He armado una serie de 6 fotos de perros que abre con DSC01.jpg… [showed 6 photos]'], photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'rejects a whole proposed series' },
  { q: 'no, esas no me valen', recent: BEST_DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'bare rejection of a curated set — the batch, not a judgment' },
  { q: 'no me gustan nada', recent: BEST_DOGS, photo: true, art: false, only: false, more: false, scored: ['disp'], note: 'taste on a curated set, no contrary judgment' },
  { q: 'no, esas no son mis mejores fotos de perros', recent: BEST_DOGS, photo: true, art: false, only: false, more: false, disp: true, scored: ['disp'], note: 'explicit contrary judgment — though no shown photo can settle it' },
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
    const miss: Record<Flag, { fp: number; fn: number }> = {
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
      for (const k of c.scored ?? (['photo', 'art', 'only', 'more', 'seq', 'disp'] as const)) {
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
