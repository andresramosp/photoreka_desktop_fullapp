import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import QueryService, { EMPTY_USAGE, type QueryCallUsage } from '../query_service.js'
import type PhotoManager from '../../managers/photo_manager.js'
import { photoDataForAgentPreview } from './agent_tools_service.js'
import { buildImagePart, type ModelName } from '../models_service.js'
import type { ThinkingLevel } from './chat_intelligence_mode_service.js'
import { MESSAGE_DISPUTE_NEUTRALIZE } from '../../utils/prompts/query.js'
import { buildCuratorialManual, SEQUENCING_MANUAL } from '../../utils/curatorial_lenses_content.js'
import { dumpVerdictReviewInput } from '../../utils/chat_debug_dump.js'
import { agentLine, agentWarn } from '../../utils/agent_log.js'
import { makeDebugCallback, makeUsageCallback } from '../../utils/agent_utils.js'

/**
 * verdict_review_service.ts
 * -----------------------------------------------------------------
 * Blind re-evaluation for turns where the user pushes back on an earlier verdict
 * (`disputes_verdict`). The curator that writes the reply has the user's pushback in front of
 * it, and with that in context the models cave: asked to hold its ground in the prompt, it
 * still finds reasons to agree. So the decision is taken out of that context:
 *
 *   1. A cheap model restates the dispute as a question plus two impersonal positions — the one
 *      the curator took, and the one the pushback takes, with only the reasons the user gave.
 *   2. A judge on its own model looks at the photos with the lens manuals and picks
 *      between "position 1" and "position 2", shown in random order. It never sees the user's
 *      message and cannot tell which position is whose.
 *   3. The outcome, mapped back to "yours" / "the user's", reaches the curator as a settled
 *      decision it has to convey, not reopen.
 *
 * The whole flow lives here. The agent runs `review` behind the `review_verdict` tool
 * (AgentToolsService.createVerdictReviewTool), which it prefetches like the basket: the
 * outcome travels as data plus the photos judged, and becomes the curator's final note through
 * `note`. The raw usage of the two calls comes back with it, for the agent to bill.
 * -----------------------------------------------------------------
 */

/** Photos the judge may be shown: at most this many, so a long series stays affordable. */
const MAX_JUDGED_PHOTOS = 12

/** The neutralizer only restates; it judges nothing, so the cheapest model is enough. */
const NEUTRALIZE_MODEL: ModelName = 'gemini-3.1-flash-lite'

/**
 * The judge's own model, whatever the turn's intelligence mode: the verdict it reaches is held
 * against the user, so it cannot drop to a cheap mode's model.
 */
export const JUDGE_MODEL: ModelName = 'gemini-3.8-flash'
const JUDGE_THINKING_LEVEL: ThinkingLevel = 'medium'

const PHOTO_TOKEN = /\[\[photo:(\d+)\|([^\]]*)\]\]/g

const JUDGE_SYSTEM_PROMPT = `You are an independent photography curator asked to settle a disagreement between two positions about the photographs you are shown. You do not know who holds either position, and neither has authority over the other: decide only from what the photos show, judged by the criteria below.

Answer the question, then say which position the photos support better: "1", "2", or "neither" when both are wrong or the difference is too small to matter. A position that gives no reasons is not weaker for that alone — test its claim against the photos. Reasons that do not hold when you look at the photos count for nothing. Name what in the frames decides it.`

/** Structured output of the judge. `winner` refers to the positions as numbered in the prompt. */
const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    winner: {
      type: 'string',
      enum: ['1', '2', 'neither'],
      description: 'The position the photos support better, or "neither".',
    },
    verdict: {
      type: 'string',
      description: 'The answer to the question, in one or two sentences.',
    },
    reasons: {
      type: 'string',
      description: 'What in the frames decides it — concrete, naming the photos by filename.',
    },
    valid_point_in_other: {
      type: 'string',
      description:
        'Anything the losing position gets right that is worth acknowledging; empty string if nothing.',
    },
  },
  required: ['winner', 'verdict', 'reasons', 'valid_point_in_other'],
} as const

/** A pushback turn restated for the judge: no trace of who holds which position. */
type NeutralDispute = {
  question: string
  photoIds: number[]
  /** The position the curator took in its previous reply. */
  earlier: { claim: string; reasons: string }
  /** The position the user's pushback takes; `reasons` is empty when they gave none. */
  challenging: { claim: string; reasons: string }
}

type Outcome = {
  /** Which side the judge upheld, mapped back from the anonymous numbering. */
  upheld: 'earlier' | 'challenging' | 'neither'
  verdict: string
  reasons: string
  validPointInOther: string
}

export type VerdictReviewInput = {
  userId: number
  /** The user's message this turn — the pushback. */
  pushback: string
  /** The curator's previous reply, `[[photo:ID|name]]` tokens included, and the ids it showed. */
  previousReply: { content: string; shownIds: number[] }
  /** Photos in front of the user this turn: attachments, a canvas focus or spotlight. */
  inViewIds: number[]
  profile: string | null
  needsSequencing: boolean
  imageDetail: 'low' | 'high' | 'auto'
  /** Binds a model to a structured-output schema (LangchainAgentService owns the builder). */
  structuredModel: (
    model: ModelName,
    schema: any,
    thinkingLevel: ThinkingLevel
  ) => { invoke: (messages: any[], options?: any) => Promise<any> }
}

/** The tool's result when the review reached an outcome. */
export type SettledDispute = {
  question: string
  upheld: Outcome['upheld']
  verdict: string
  reasons: string
  validPointInOther: string
  /** The photos the judge was shown, so the curator sees the same frames. */
  photos: Array<{ id: number; originalFileName: string }>
}

export type VerdictReviewResult = {
  /** Null when the review could not run and the curator answers alone. */
  settled: SettledDispute | null
  neutralizeUsage: QueryCallUsage
  /** Raw usage metadata of the judge call; absent when it never ran. */
  judgeUsage?: any
}

export default class VerdictReviewService {
  constructor(
    private queryService: QueryService,
    private photoManager: PhotoManager
  ) {}

  /**
   * Runs the whole review. Never throws: with no usable dispute, no photo to show or a failed
   * call, it returns no outcome and the curator answers as it would have.
   */
  async review(input: VerdictReviewInput): Promise<VerdictReviewResult> {
    const result: VerdictReviewResult = { settled: null, neutralizeUsage: EMPTY_USAGE }
    try {
      const candidateIds = VerdictReviewService.candidateIds(input)
      const photos = await this.photoManager.getPhotosByIds(candidateIds)

      const { dispute, usage } = await this.neutralize(
        input.previousReply.content,
        input.pushback,
        photos
      )
      result.neutralizeUsage = usage
      if (!dispute) return result

      const { parts, imageCount, shown } = await this.photoParts(dispute.photoIds, photos, input)
      if (imageCount === 0) {
        agentWarn('review', 'no thumbnail for the disputed photos — curator answers unassisted')
        return result
      }

      const manual = [
        buildCuratorialManual(input.profile),
        input.needsSequencing ? SEQUENCING_MANUAL : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      const { messages, earlierIsFirst } = VerdictReviewService.judgeMessages(
        dispute,
        parts,
        manual
      )
      await dumpVerdictReviewInput(messages, {
        userId: input.userId,
        model: JUDGE_MODEL,
        message: input.pushback,
        earlierIsFirst,
      })

      const usageCollector: { usage?: any } = {}
      const raw = await input
        .structuredModel(JUDGE_MODEL, JUDGE_SCHEMA, JUDGE_THINKING_LEVEL)
        .invoke(messages, {
          callbacks: [makeDebugCallback('verdict-judge'), makeUsageCallback(usageCollector)],
        })
      result.judgeUsage = usageCollector.usage

      const outcome = VerdictReviewService.mapJudgeResult(raw, earlierIsFirst)
      agentLine(
        'review',
        `${{ earlier: 'earlier verdict upheld', challenging: "user's position upheld", neither: 'neither position upheld' }[outcome.upheld]} · ${imageCount} photo(s) judged`
      )
      result.settled = {
        question: dispute.question,
        upheld: outcome.upheld,
        verdict: outcome.verdict,
        reasons: outcome.reasons,
        validPointInOther: outcome.validPointInOther,
        photos: shown,
      }
      return result
    } catch (err: any) {
      agentWarn('review', `failed: ${err?.message} — curator answers unassisted`)
      return result
    }
  }

  /**
   * Every photo the dispute can be about: those the previous reply named or showed, plus those in
   * front of the user this turn. The neutralizer may only pick from this list, so it cannot point
   * the judge at a photo nobody discussed.
   */
  private static candidateIds(input: VerdictReviewInput): number[] {
    const named = [...input.previousReply.content.matchAll(PHOTO_TOKEN)].map((m) => Number(m[1]))
    return [...new Set([...named, ...input.previousReply.shownIds, ...input.inViewIds])]
  }

  /**
   * Its whole value is what it leaves OUT: every trace of who said what, agreement or tone is
   * stripped, and the user's claim keeps only the reasons they actually gave.
   *
   * It is also the second gate after the classifier, and the one that reads both messages
   * whole: when the earlier reply judged nothing, or the listed photos cannot settle the point,
   * it returns no dispute and the turn runs as an ordinary request.
   */
  async neutralize(
    previousReply: string,
    pushback: string,
    photos: Array<{ id: number; originalFileName: string }>
  ): Promise<{ dispute: NeutralDispute | null; usage: QueryCallUsage }> {
    try {
      const { result, cost, model } = await this.queryService.callLLMWithRetry({
        systemPrompt: MESSAGE_DISPUTE_NEUTRALIZE,
        userContent: JSON.stringify({
          previous_reply: previousReply.replace(PHOTO_TOKEN, (_m, _id, name) => name),
          pushback,
          photos: photos.map((p) => ({ id: p.id, filename: p.originalFileName })),
        }),
        model: NEUTRALIZE_MODEL,
        useCache: false,
      })
      const usage = QueryService.toUsage(model, cost)
      if (result?.settleable !== true) {
        agentLine('review', 'nothing the photos can settle — the turn runs as a normal request')
        return { dispute: null, usage }
      }
      const known = new Set(photos.map((p) => p.id))
      const photoIds = (Array.isArray(result?.photo_ids) ? result.photo_ids : [])
        .map((id: unknown) => Number(id))
        .filter((id: number) => known.has(id))
      const position = (p: any) => ({
        claim: typeof p?.claim === 'string' ? p.claim.trim() : '',
        reasons: typeof p?.reasons === 'string' ? p.reasons.trim() : '',
      })
      const earlier = position(result?.earlier_position)
      const challenging = position(result?.challenging_position)
      const question = typeof result?.question === 'string' ? result.question.trim() : ''
      if (!question || !earlier.claim || !challenging.claim || photoIds.length === 0) {
        agentWarn('review', 'no usable dispute — curator answers unassisted')
        return { dispute: null, usage }
      }
      const uniqueIds: number[] = [...new Set<number>(photoIds)]
      return { dispute: { question, photoIds: uniqueIds, earlier, challenging }, usage }
    } catch (error: any) {
      agentWarn('review', `neutralizer failed: ${error?.message}`)
      return { dispute: null, usage: EMPTY_USAGE }
    }
  }

  /** The judge looks at the photos themselves; scores are left out so it cannot defer to them. */
  private async photoParts(
    photoIds: number[],
    photos: any[],
    input: VerdictReviewInput
  ): Promise<{ parts: any[]; imageCount: number; shown: SettledDispute['photos'] }> {
    const byId = new Map(photos.map((p) => [p.id, p]))
    const parts: any[] = []
    const shown: SettledDispute['photos'] = []
    let imageCount = 0
    for (const id of photoIds.slice(0, MAX_JUDGED_PHOTOS)) {
      const photo = byId.get(id)
      if (!photo) continue
      parts.push({
        type: 'text',
        text: `[${photo.originalFileName}]\n${JSON.stringify(photoDataForAgentPreview(photo, { includeScores: false }))}`,
      })
      const image = await buildImagePart({
        model: JUDGE_MODEL,
        imageName: photo.thumbnailName,
        imageUrl: photo.thumbnailUrl,
        detail: input.imageDetail,
      }).catch(() => null)
      if (image) {
        parts.push(image)
        imageCount++
      }
      shown.push({ id: photo.id, originalFileName: photo.originalFileName })
    }
    return { parts, imageCount, shown }
  }

  /**
   * The two positions are numbered in random order, so the judge cannot lean on "the first one
   * was the original". `earlierIsFirst` is what maps the answer back.
   */
  private static judgeMessages(
    dispute: NeutralDispute,
    photoParts: any[],
    manual: string
  ): { messages: any[]; earlierIsFirst: boolean } {
    const earlierIsFirst = Math.random() < 0.5
    const [first, second] = earlierIsFirst
      ? [dispute.earlier, dispute.challenging]
      : [dispute.challenging, dispute.earlier]
    const describe = (n: number, p: { claim: string; reasons: string }) =>
      `Position ${n}: ${p.claim}\nReasons given: ${p.reasons || '(none)'}`

    return {
      messages: [
        new SystemMessage(manual ? `${JUDGE_SYSTEM_PROMPT}\n\n${manual}` : JUDGE_SYSTEM_PROMPT),
        new HumanMessage({
          content: [
            {
              type: 'text',
              text:
                `Question: ${dispute.question}\n\n` +
                `${describe(1, first)}\n\n${describe(2, second)}\n\nThe photos:`,
            },
            ...photoParts,
          ],
        }),
      ],
      earlierIsFirst,
    }
  }

  private static mapJudgeResult(raw: any, earlierIsFirst: boolean): Outcome {
    const winner = raw?.winner === '1' || raw?.winner === '2' ? raw.winner : 'neither'
    const upheld =
      winner === 'neither'
        ? 'neither'
        : (winner === '1') === earlierIsFirst
          ? 'earlier'
          : 'challenging'
    const text = (v: any) => (typeof v === 'string' ? v.trim() : '')
    return {
      upheld,
      verdict: text(raw?.verdict),
      reasons: text(raw?.reasons),
      validPointInOther: text(raw?.valid_point_in_other),
    }
  }

  /**
   * The note the curator reads right before answering. It presents the outcome as settled for
   * this turn and says how to convey it — the curator keeps the conversation's voice, the judge
   * keeps the decision. Only the outcome that happened is described: the server knows it.
   */
  static note(settled: SettledDispute): HumanMessage {
    const result = {
      earlier: 'your earlier position holds',
      challenging: "the user's position is better supported",
      neither: 'neither position holds',
    }[settled.upheld]
    const convey = {
      earlier:
        'Open by saying plainly that you keep your judgment, then give the reasons in your own ' +
        'words. The choice of photos is theirs and their taste is legitimate, but your judgment stands.',
      challenging:
        'Open by saying plainly that you have changed your view, then name the reason that changed it.',
      neither:
        'Open by saying plainly that neither judgment holds, then say what the photos actually show.',
    }[settled.upheld]
    // A decided choice between photos is shown as one: the pick, and what it was preferred over.
    const groups =
      settled.upheld === 'neither'
        ? ''
        : ' When the question is a choice between photos, the groups carry the outcome: the photo ' +
          'it favours in a group labelled as the chosen one, and the other in its own group labelled ' +
          'as set aside, with `rejected: true` — both labels in the language of your reply.'
    return new HumanMessage(
      '[Independent re-evaluation of the point the user disputes — internal, not a message from the user. ' +
        'A separate judge looked at the photos again with the same criteria, without knowing which ' +
        "position was yours and which was the user's.\n\n" +
        `Question: ${settled.question}\n` +
        `Outcome: ${result}.\n` +
        `Judge's reading: ${settled.verdict} ${settled.reasons}`.trim() +
        (settled.validPointInOther
          ? `\nWhat the other position gets right: ${settled.validPointInOther}`
          : '') +
        '\n\nThis outcome is settled for this turn: your reply conveys it and does not reopen it. ' +
        convey +
        groups +
        ']'
    )
  }
}
