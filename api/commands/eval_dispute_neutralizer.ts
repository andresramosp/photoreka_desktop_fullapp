import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import QueryService from '#services/query_service'
import PhotoManager from '../app/managers/photo_manager.js'
import VerdictReviewService from '#services/chatlab/verdict_review_service'

/**
 * Battery against the dispute neutralizer (MESSAGE_DISPUTE_NEUTRALIZE), the second gate of a
 * pushback turn after the classifier's `disputes_verdict`.
 *
 *   node ace eval:dispute-neutralizer [--runs=3] [--verbose]
 *
 * Each case is a turn the classifier could flag: the earlier reply, the user's message and the
 * photos the dispute may be about. The neutralizer should hand the judge a dispute only when the
 * earlier reply judged the photos and the message disputes that judgment in a way those photos
 * can settle; everything else must come back empty, so the turn runs as a normal request.
 */

type Case = {
  pushback: string
  previousReply: string
  photos: string[]
  /** Whether the judge should get a dispute. */
  settle: boolean
  note?: string
}

const DOGS_REPLY = 'Aquí tienes fotos de perros de tu catálogo, de retratos cerrados a escenas de parque.'
const BEST_DOGS_REPLY =
  'Aquí tienes tus 8 mejores fotos de perros: destacan por la luz lateral y los gestos, con DSC101.jpg como la más fuerte.'
const DOG_PHOTOS = ['DSC101.jpg', 'DSC102.jpg', 'DSC103.jpg', 'DSC104.jpg']

// prettier-ignore
const CASES: Case[] = [
  // ── Real disputes: the earlier reply judged, the message holds a contrary judgment ──
  { pushback: 'no, esa como primera no me convence', settle: true,
    previousReply: 'He situado DSCF6538.jpg como apertura, ya que establece el tono de la serie con su luz baja; DSCF6540.jpg cierra.',
    photos: ['DSCF6538.jpg', 'DSCF6539.jpg', 'DSCF6540.jpg'], note: 'bare pushback on an opener' },
  { pushback: 'pues a mi me parece mejor esta', settle: true,
    previousReply: 'La más fuerte es DSC06467.jpg: el gesto organiza el encuadre, mientras las otras dos dependen del color.',
    photos: ['DSC06467.jpg', 'DSC06470.jpg', 'DSC06480.jpg'], note: 'preference against a comparison verdict' },
  { pushback: 'discrepo, creo que es una gran foto de naturaleza', settle: true,
    previousReply: 'Entiendo la intención de romper moldes mediante el contraste, pero los jurados de fotografía de naturaleza se centran en la vida salvaje y el paisaje sin intervención humana: el factor humano y el cigarro sacan DSC09001.jpg del género, así que no la presentaría a ese concurso.',
    photos: ['DSC09001.jpg'], note: 'contrary judgment of what fits a genre (real miss, 2026-09-28)' },
  { pushback: 'yo no estoy de acuerdo, la otra la veo mas potente a nivel narrativo', settle: true,
    previousReply: 'DSCF6597.jpg tiene más fuerza narrativa que DSC08902.jpg: sus capas humanas simultáneas crean tensión, mientras el muelle es sobre todo paisaje.',
    photos: ['DSCF6597.jpg', 'DSC08902.jpg'], note: 'real case, 2026-09-28' },
  { pushback: 'no estoy de acuerdo, para mi la mas floja es esta, es un puro cliche de foto por layers en un sitio anodino', settle: true,
    previousReply: 'La más floja de las cuatro es DSC0300.jpg, por su encuadre plano; DSC0302.jpg sostiene la serie gracias a sus capas.',
    photos: ['DSC0300.jpg', 'DSC0301.jpg', 'DSC0302.jpg', 'DSC0303.jpg'], note: 'contrary judgment with reasons (real case, 2026-09-27)' },
  { pushback: 'no lo tengo claro, yo prefiero esta... la palangana amarilla es muy surrealista', settle: true,
    previousReply: 'De las tres, la más original es sin duda DSC02565.jpg: el paraguas abandonado en primer plano sugiere una historia previa. DSC05259.jpg es una escena documental sólida pero más tradicional, y DSC04125.jpg la menos original.',
    photos: ['DSC02565.jpg', 'DSC05259.jpg', 'DSC04125.jpg'], note: 'preference for another photo, hedged (real case, 2026-10-03)' },
  { pushback: 'no estoy de acuerdo, yo no te he preguntado por street photography, sino cual es mas artistica', settle: true,
    previousReply: 'Desde tu perspectiva de fotógrafo de calle, la respuesta clara es DSCF8967.jpg: orquesta varios planos de acción, mientras DSC00374-1.jpg es un estudio visual más convencional.',
    photos: ['DSCF8967.jpg', 'DSC00374-1.jpg'], note: 'the verdict answered the question by the wrong standard (real case, 2026-10-03)' },

  // ── Real disputes: the earlier reply judged, the message doubts it ──
  { pushback: 'are you sure?', settle: true,
    previousReply: 'DSC0123.jpg is stronger than DSC0124.jpg: the gesture carries the frame.',
    photos: ['DSC0123.jpg', 'DSC0124.jpg'], note: 'a bare doubt' },
  { pushback: 'yo no lo veo asi, estas seguro? mira bien', settle: true,
    previousReply: 'Colocar DSC07430.jpg entre DSC06532.jpg y DSC03584.jpg no crea un diálogo poético: dinamita la espacialidad y el código formal de la serie urbana. DSC08157.jpg es la que encaja en el hueco.',
    photos: ['DSC07430.jpg', 'DSC08157.jpg', 'DSC06532.jpg', 'DSC03584.jpg'], note: 'real case, 2026-10-03' },
  { pushback: 'sigo sin verlo claro', settle: true,
    previousReply: 'Mirando despacio la hilera completa, la razón sigue estando del lado de DSC08157.jpg: comparte la escala y la luz urbana de la fila, mientras DSC07430.jpg rompe el código formal de la serie.',
    photos: ['DSC07430.jpg', 'DSC08157.jpg', 'DSC06532.jpg', 'DSC03584.jpg'], note: 'a persisting doubt after a held verdict (real case, 2026-10-03)' },

  // ── The earlier reply only retrieved: nothing was judged ──
  { pushback: 'no, esas no me valen', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false },
  { pushback: 'no me gustan', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false },
  { pushback: 'ninguna me convence', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false },
  { pushback: 'no es lo que buscaba', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false },
  { pushback: 'esas no, otras', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false },
  { pushback: 'no, esas son muy flojas', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false, note: 'judges results the assistant never judged' },
  { pushback: 'no, esos no son perros, son zorros', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false, note: 'fact corrected' },
  { pushback: "no, these won't do", previousReply: 'Here are dog photos from your catalog, from close portraits to park scenes.', photos: DOG_PHOTOS, settle: false },
  { pushback: 'no, esas no me valen', previousReply: 'He armado una serie de 4 fotos de perros que abre con DSC101.jpg y cierra con DSC104.jpg.', photos: DOG_PHOTOS, settle: false, note: 'rejects a whole series, asks for other material' },

  // ── The earlier reply judged, but the message asks for other photos or needs photos not listed ──
  { pushback: 'no, esas no me valen', previousReply: BEST_DOGS_REPLY, photos: DOG_PHOTOS, settle: false, note: 'rejects the batch' },
  { pushback: 'no me gustan nada', previousReply: BEST_DOGS_REPLY, photos: DOG_PHOTOS, settle: false, note: 'taste, no contrary judgment' },
  { pushback: 'no, esas no son mis mejores fotos de perros', previousReply: BEST_DOGS_REPLY, photos: DOG_PHOTOS, settle: false, note: 'settling it needs photos that are not listed' },

  // ── Resistance that is not about a judgment: a doubt with nothing judged, a change of direction ──
  { pushback: '¿seguro?', previousReply: DOGS_REPLY, photos: DOG_PHOTOS, settle: false, note: 'a doubt about a retrieval' },
  { pushback: 'is it better than the ones you showed me?', settle: false,
    previousReply: 'Here are your best street photos: DSC401.jpg, DSC402.jpg and DSC403.jpg stand out for their timing.',
    photos: ['DSC401.jpg', 'DSC402.jpg', 'DSC403.jpg', 'DSC499.jpg'], note: 'a new comparison, not a doubt about the verdict' },
  { pushback: 'no, pero no quiero que la serie se desarrolle por narrativa, sino por aspectos formales: estetica, composicion, etc', settle: false,
    previousReply: 'He ordenado la serie como un paseo: abre con la llegada al mercado en DSC201.jpg y cierra con la despedida en la parada en DSC206.jpg.',
    photos: ['DSC201.jpg', 'DSC202.jpg', 'DSC203.jpg', 'DSC206.jpg'], note: 'asks for a different organizing logic' },
  { pushback: 'no, tiene que ser usando todas las fotos', settle: false,
    previousReply: 'He organizado tu selección en una secuencia de 8 que abre con DSC301.jpg y cierra con DSC308.jpg.',
    photos: ['DSC301.jpg', 'DSC302.jpg', 'DSC308.jpg'], note: 'a requirement restated' },
]

export default class EvalDisputeNeutralizer extends BaseCommand {
  static commandName = 'eval:dispute-neutralizer'
  static description = 'Runs a battery against the verdict-review neutralizer (second pushback gate)'
  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'How many passes over the battery', default: 1 })
  declare runs: number

  @flags.boolean({ description: 'Print every case, not only the failures' })
  declare verbose: boolean

  async run() {
    const service = new VerdictReviewService(new QueryService(), new PhotoManager())
    for (let run = 1; run <= this.runs; run++) {
      let pass = 0
      let falseSettle = 0
      let missedSettle = 0
      let costEur = 0
      this.logger.log(`══════ run ${run} ══════`)
      for (const [i, c] of CASES.entries()) {
        const photos = c.photos.map((name, j) => ({ id: j + 1, originalFileName: name }))
        const { dispute, usage } = await service.neutralize(c.previousReply, c.pushback, photos)
        costEur += usage.costEur
        const got = dispute !== null
        const ok = got === c.settle
        if (ok) pass++
        else if (got) falseSettle++
        else missedSettle++
        if (!ok || this.verbose) {
          this.logger.log(
            `${ok ? '  ok ' : 'FAIL'} #${String(i + 1).padStart(2)} exp=${c.settle ? 'settle' : 'none  '} got=${got ? 'settle' : 'none  '}  "${c.pushback}"${c.note ? '  // ' + c.note : ''}`
          )
          if (dispute && this.verbose) this.logger.log(`         ↳ ${dispute.question}`)
        }
      }
      this.logger.log(
        `TOTAL ${pass}/${CASES.length} · settled wrongly ${falseSettle} · missed ${missedSettle} · cost=€${costEur.toFixed(6)}`
      )
    }
  }
}
