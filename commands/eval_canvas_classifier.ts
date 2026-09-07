import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import QueryService from '#services/query_service'
import { findChatTemplate, CANVAS_COMPANION_TEMPLATE_ID } from '#services/chat_templates_service'

/**
 * Battery against the canvas query classifier prompt (MESSAGE_QUERY_CLASSIFICATION_CANVAS).
 *
 *   node ace eval:canvas-classifier
 *
 * The flag under test is `attached_photos_only`, redefined on this surface as "answerable
 * from what is already in front of the user (attached ∪ focus)". Errors are meant to bias
 * toward false NEGATIVES (a wrong false only makes Phase 1 run a non-starving scoped search)
 * and away from false POSITIVES (a wrong true skips Phase 1 and answers a whole-board or
 * new-material question from the focus alone), so the summary counts the two separately.
 */

type Case = {
  q: string
  attached?: number
  focus?: number
  recent?: string[]
  only: boolean // expected attached_photos_only
  more?: boolean // expected wants_more_results, when the case exercises it
  photo?: boolean // expected has_photo_intent, when the case exercises it
  /**
   * `self_contained_query` must come back byte-identical to `q`. The praise cases below are
   * the reason it exists: the failure they guard is a REWRITE, not a mis-scored flag — a
   * bare "gracias" was being condensed into the previous turn's request, after which every
   * flag was scored correctly against text the classifier had invented.
   */
  verbatim?: boolean
  note?: string
}

// prettier-ignore
const CASES: Case[] = [
  // ── Present (attached and/or focus) → true ─────────────────────────────
  { q: '¿dirías que esta foto encaja aquí?',                 attached: 1, focus: 12, only: true,  note: 'attached vs focus' },
  { q: '¿no desentona un poco en color y luminosidad con el grupo?', attached: 1, focus: 12, only: true, note: 'the turn-2 bug' },
  { q: '¿cuál de estas es la mejor?',                        attached: 0, focus: 12, only: true,  note: 'select among focus' },
  { q: 'which of these works best as an opener?',            attached: 0, focus: 8,  only: true },
  { q: '¿esta serie aguanta como conjunto?',                 attached: 0, focus: 12, only: true,  note: 'bare-focus judgment' },
  { q: '¿qué le falta a este grupo?',                        attached: 0, focus: 12, only: true,  note: 'judging present set' },
  { q: 'describe esta foto',                                 attached: 1, focus: 12, only: true },
  { q: '¿estas dos pegan juntas?',                           attached: 2, focus: 12, only: true },

  // ── Whole board (beyond the focus, not present) → false ────────────────
  { q: '¿cuál es la mejor foto del canvas?',                 attached: 0, focus: 12, only: false, note: 'needs search scope:canvas' },
  { q: 'de todo el board, ¿cuál aguanta menos?',             attached: 0, focus: 12, only: false },
  { q: '¿me estoy repitiendo en el board?',                  attached: 0, focus: 12, only: false },

  // ── New material → false ───────────────────────────────────────────────
  { q: 'añádeme un par que peguen aquí',                     attached: 0, focus: 12, only: false, note: 'new material' },
  { q: 'más como estas',                                     attached: 0, focus: 12, only: false, note: 'new material' },
  { q: 'busca algo con rojos fuertes para esa esquina vacía', attached: 0, focus: 12, only: false },

  // ── Profile / app-help / greeting / catalog → false ────────────────────
  { q: '¿de qué va este canvas?',                            attached: 0, focus: 12, only: false, note: 'profile → canvas_overview' },
  { q: 'muéstrame mis mejores retratos',                     attached: 0, focus: 0,  only: false, note: 'catalog' },
  { q: 'hola',                                               attached: 0, focus: 12, only: false, note: 'greeting' },
  { q: '¿cómo funciona el foco?',                            attached: 0, focus: 12, only: false, note: 'app help' },

  // ── Tricky: attachment present but the referent focus is EMPTY → false ──
  { q: '¿qué le falta a este grupo?',                        attached: 1, focus: 0,  only: false, note: 'absent group → lookup' },

  // ── Multi-turn ─────────────────────────────────────────────────────────
  { q: '¿y esta?', attached: 1, focus: 12, only: true,
    recent: ['user: ¿esta foto encaja aquí? [attached 1]', 'assistant: Sí, encaja bien con el grupo…'],
    note: 'follow-up on attached vs focus' },
  { q: 'otra ronda', attached: 0, focus: 12, only: false, more: true,
    recent: ['user: añádeme fotos de calle nocturnas para este hueco', 'assistant: Aquí tienes una selección… [showed 6 photos]'],
    note: 'pagination' },
  { q: '¿cuál de esas es la mejor?', attached: 0, focus: 12, only: false,
    recent: ['user: enséñame street nocturno', 'assistant: Aquí tienes… [showed 6 photos]'],
    note: 'refers to shown batch, not focus' },

  // ── Praise / thanks with no request: inherits NOTHING ──────────────────
  // These are the cases the classifier used to rewrite into the previous request. What
  // matters is `verbatim` — once the query survives untouched the flags follow for free.
  { q: 'perfecto gracias!', attached: 0, focus: 9, only: false, more: false, photo: false, verbatim: true,
    recent: ['user: mi tablero está caótico, sácame los grupos lógicos', 'assistant: Tu tablero reúne tres atmósferas… [showed 9 photos]'],
    note: 'must NOT inherit the grouping request' },
  { q: 'muy bien hecho!', attached: 0, focus: 9, only: false, more: false, photo: false, verbatim: true,
    recent: ['user: agrúpame estas por temática', 'assistant: Aquí van tres grupos… [showed 9 photos]'],
    note: 'the re-grouping bug' },
  { q: 'genial, me encanta', attached: 0, focus: 12, only: false, more: false, photo: false, verbatim: true,
    recent: ['user: enséñame street nocturno', 'assistant: Aquí tienes… [showed 6 photos]'],
    note: 'reaction, not a follow-up' },

  // ── …but praise that ALSO asks is an ordinary follow-up ────────────────
  { q: 'gracias, ahora dame más', attached: 0, focus: 12, only: false, more: true, photo: true,
    recent: ['user: enséñame street nocturno', 'assistant: Aquí tienes… [showed 6 photos]'],
    note: 'thanks + request → still inherits' },
]

export default class EvalCanvasClassifier extends BaseCommand {
  static commandName = 'eval:canvas-classifier'
  static description = 'Runs a battery against the canvas query classifier prompt'
  static options: CommandOptions = { startApp: true }

  async run() {
    const qs = new QueryService()
    const template = findChatTemplate(CANVAS_COMPANION_TEMPLATE_ID)
    if (!template?.classifierPrompt) {
      this.logger.error('Canvas template has no classifierPrompt')
      return
    }

    let pass = 0
    let falsePositives = 0 // dangerous: got true, expected false
    let falseNegatives = 0 // cheap: got false, expected true
    let rewrites = 0 // a `verbatim` case whose query was condensed into something else

    for (const [i, c] of CASES.entries()) {
      const attached = c.attached ?? 0
      const focus = c.focus ?? 0
      const res = await qs.classifyQuery(c.q, attached, c.recent ?? [], {
        prompt: template.classifierPrompt,
        context: { focus_photo_count: focus },
      })

      const onlyOk = res.attached_photos_only === c.only
      const moreOk = c.more === undefined || res.wants_more_results === c.more
      const photoOk = c.photo === undefined || res.has_photo_intent === c.photo
      const verbatimOk = c.verbatim !== true || res.self_contained_query === c.q
      const ok = onlyOk && moreOk && photoOk && verbatimOk
      if (ok) pass++
      if (!onlyOk && res.attached_photos_only) falsePositives++
      if (!onlyOk && !res.attached_photos_only) falseNegatives++
      if (!verbatimOk) rewrites++

      const b = (v: boolean) => (v ? 'T' : 'F')
      const exp = `${b(c.only)}${c.more !== undefined ? '/' + b(c.more) : ''}${c.photo !== undefined ? '/' + b(c.photo) : ''}`
      const got = `${b(res.attached_photos_only)}${c.more !== undefined ? '/' + b(res.wants_more_results) : ''}${c.photo !== undefined ? '/' + b(res.has_photo_intent) : ''}`
      const mark = ok
        ? '  ok '
        : !verbatimOk
          ? 'REWRITE'
          : !onlyOk && res.attached_photos_only
            ? 'FALSE+'
            : 'fail '
      const idx = String(i + 1).padStart(2)
      this.logger.log(
        `${mark} #${idx} exp=${exp} got=${got}  "${c.q}" (a${attached} f${focus})${c.note ? '  // ' + c.note : ''}`
      )
      if (res.self_contained_query && res.self_contained_query !== c.q) {
        this.logger.log(`         ↳ condensed: "${res.self_contained_query}"`)
      }
    }

    this.logger.log('')
    this.logger.log(
      `TOTAL ${pass}/${CASES.length} pass · false-POSITIVES(dangerous)=${falsePositives} · false-negatives(cheap)=${falseNegatives} · REWRITES=${rewrites}`
    )
  }
}
