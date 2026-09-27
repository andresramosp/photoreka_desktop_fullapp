/**
 * Pure helpers for classifying a chat query with Jev (TypeSafe AI System One),
 * plus the engine selector shared by both classifier backends in QueryService.
 *
 * The routing classifier decides a handful of independent booleans about the
 * user's latest message. Each boolean maps to ONE Jev `noul` question — a yes/no
 * judgment that returns the calibrated probability of "yes" — and all of them are
 * evaluated against the same `state` in a single request. This mirrors the LLM
 * classifier's output contract exactly (same flags, same meanings), so callers
 * (QueryService.classifyQuery) don't branch on the engine.
 *
 * ── Two queries in the state ──────────────────────────────────────────────
 * Jev reads literally and is weak at resolving an elliptical follow-up ("yes",
 * "and this one?") against the conversation — that is multi-hop reasoning it does
 * poorly. So the Jev backend resolves the ellipsis UP FRONT with a cheap LLM pass
 * (QueryService.condenseQuery) and passes Jev BOTH queries in the state:
 *   • `self_contained_query` — the resolved request; what the content signals judge.
 *   • `query`                — the raw latest message, verbatim.
 * Each signal points at exactly one of them by name (`subject`). Today's four
 * flags are all about the resolved request, so they read `self_contained_query`.
 * The raw `query` is kept in the state for future signals that must judge the
 * literal message — e.g. a safety/off-topic signal, which must NEVER read the
 * condensed text because condensation can sanitize away the very content it looks
 * for. Adding such a signal is one more entry in SIGNALS with subject 'query'.
 *
 * ── Preconditions resolved in code ────────────────────────────────────────
 * Two flags carry a hard precondition the LLM prompt states in prose ("if
 * attached_photo_count is 0 → always false"; "requires that photos were shown").
 * Jev is weak at that kind of gating, so we resolve those in CODE (see
 * `shortCircuit`) and only send Jev the questions that are genuinely a judgment.
 *
 * `self_contained_query` has no meaning of its own on this backend beyond the
 * condensed text; it is used only for a debug log line, never for routing.
 */

import type { JevModelName } from '../services/models_service.js'
import { isJevConfigured } from './jev_provider.js'

/** The routing booleans, identical to the LLM classifier's flags. */
export interface QueryClassificationFlags {
  has_photo_intent: boolean
  needs_artistic_evaluation: boolean
  needs_sequencing: boolean
  attached_photos_only: boolean
  wants_more_results: boolean
  disputes_verdict: boolean
}

/** Everything the classifier reasons over, engine-agnostic. */
export interface QueryClassifierInput {
  /** The user's latest message, verbatim. */
  query: string
  /** The ellipsis-resolved request from the condensation pass; defaults to `query`. */
  selfContainedQuery?: string
  attachedPhotoCount: number
  /**
   * Photos the user has in front of them this turn: the attachments plus any the surface
   * shows them (a canvas focus). Without it, "which of these…" with nothing attached reads as
   * being about no photo at all.
   */
  photosInViewCount: number
  /** Compact "role: text" lines, most recent last; assistant turns carry " [showed N photos]". */
  recentTurns: string[]
}

/** Which classifier backend classifyQuery dispatches to. */
export enum QueryClassifierEngine {
  LLM = 'LLM',
  JEV = 'JEV',
}

/**
 * Engine selected by QUERY_CLASSIFIER_ENGINE (LLM | JEV). Defaults to LLM so the
 * classifier keeps its current, validated behavior until the Jev battery says
 * otherwise; the Jev backend itself also degrades to LLM when no API key is set.
 */
export function defaultQueryClassifierEngine(): QueryClassifierEngine {
  const raw = (process.env.QUERY_CLASSIFIER_ENGINE ?? '').trim().toUpperCase()
  return raw === QueryClassifierEngine.JEV ? QueryClassifierEngine.JEV : QueryClassifierEngine.LLM
}

export const JEV_CLASSIFIER_MODEL: JevModelName = 'jev-latest'

/** True when the recent turns hold any assistant reply — something the user could be disputing. */
export function assistantRepliedEarlier(recentTurns: string[]): boolean {
  return recentTurns.some((t) => /^assistant:/i.test(t.trim()))
}

/** True when any assistant turn is marked as having shown photos ([showed N photos]). */
export function photosShownEarlier(recentTurns: string[]): boolean {
  return recentTurns.some((t) => /\[showed \d+ photos?\]/i.test(t))
}

/**
 * The state field(s) a signal is pointed at. 'both' is for the discourse flag
 * (wants_more): its cue can live in the raw message ("veamos más") OR in the
 * resolved form ("sí" → "show me more…"), and condensation is not guaranteed to
 * preserve it, so that noul must see both and fire on either.
 */
type Subject = 'query' | 'self_contained_query' | 'both'
const SUBJECT_DESC: Record<Exclude<Subject, 'both'>, string> = {
  self_contained_query: "the user's request, rewritten to stand alone",
  query: "the user's latest message, verbatim",
}
function subjectPreamble(subject: Subject): string {
  return subject === 'both'
    ? 'Read BOTH `query` (the raw message) and `self_contained_query` (its resolved form).'
    : `Judge \`${subject}\` (${SUBJECT_DESC[subject]}).`
}

interface JevClassifierSignal {
  key: keyof QueryClassificationFlags
  /** Which state field this signal judges. */
  subject: Subject
  /** The yes/no question about the subject (phrased generically as "it"/"the request"). */
  instructions: string
  /** What a yes and a no mean, aligned with the instruction (Jev reads both literally). */
  criteria: { true: string; false: string }
  /** noul >= threshold → true. Per-flag so a battery run can tune each independently. */
  threshold: number
  /**
   * A precondition resolved in code. When it returns a boolean, that value is the
   * flag and the noul is NOT asked. null → the flag is a genuine judgment for Jev.
   */
  shortCircuit?: (input: QueryClassifierInput) => boolean | null
}

/**
 * The base-classifier signals, with the same meanings as MESSAGE_QUERY_CLASSIFICATION's
 * flags (all prompting stays in English). Jev reads criteria literally, so a closed list of
 * cases reads as exhaustive: state the principle that decides a flag and let examples only
 * illustrate it. All of them judge the resolved request, so the ellipsis is already gone by the
 * time Jev sees it — these are single-turn judgments.
 */
const SIGNALS: readonly JevClassifierSignal[] = [
  {
    key: 'has_photo_intent',
    subject: 'self_contained_query',
    threshold: 0.5,
    instructions:
      "Does answering it involve the user's photos themselves — bringing some up or working with them, whatever the operation? Every photo in this app is the user's own.",
    criteria: {
      true: "The answer involves photos: it finds or shows some, or works with them — choosing, ordering, describing, comparing, judging them or the user's body of work, or any other operation.",
      false:
        'The answer involves no photo: e.g. a count or statistic over the catalog ("how many photos do I have"), how the app works, or an action on photos already identified that needs nothing from them ("add these to a collection").',
    },
  },
  {
    key: 'needs_artistic_evaluation',
    subject: 'self_contained_query',
    threshold: 0.5,
    instructions:
      'Does answering it rest on SUBJECTIVE artistic judgment — taste about how photographs work — rather than on facts about what they show?',
    criteria: {
      true: 'The answer is a judgment of taste: how strong a photo or a body of work is, what its style is, how photos compare or work together, or how to improve — whatever the phrasing, including a plain lookup ("my best", "most original") or a choice among photos made on those grounds.',
      false:
        'The answer follows from facts: retrieval by content, subject or metadata; plain content description; ordering by an objective criterion (date, place); non-photo requests.',
    },
  },
  {
    key: 'needs_sequencing',
    subject: 'self_contained_query',
    threshold: 0.5,
    instructions:
      'Does the answer depend on how several photos work TOGETHER — which ones form a set, how they are grouped or paired, in what order they are seen, or which one fits a place among the others — rather than on each photo on its own?',
    criteria: {
      true: 'The answer arranges photos: a series, sequence, carousel, pairs or groups to build, revise, complete or trim so they hold together; the opener, the closer, or the photo that fits a gap or belongs in a set.',
      false:
        'Each photo is judged, ranked, found or described on its own, even on subjective grounds (a critique, a comparison, "my best"); a sort or split by one objective attribute such as date or colour; non-photo requests.',
    },
  },
  {
    key: 'attached_photos_only',
    subject: 'self_contained_query',
    threshold: 0.5,
    // Precondition: with no attachment there is nothing to answer "only" from.
    shortCircuit: (input) => (input.attachedPhotoCount === 0 ? false : null),
    instructions:
      'Can it be answered by looking ONLY at the photo(s) attached to this message, with no other photo? Deictic wording ("this photo", "which is better") refers to the attachments.',
    criteria: {
      true: 'Critique, describe, rate, improve, sequence or compare the attached photo(s) among themselves, by any criterion.',
      false:
        'Anything that also needs the catalog or other photos: "find similar to this", "is this my best street photo" ("my best" invokes the whole catalog), searches, statistics, library actions, app questions. Photos shown in earlier turns are "other photos" too — comparing the attachment against them is a no.',
    },
  },
  {
    key: 'wants_more_results',
    // 'both' on purpose: the cue can be in the raw message ("veamos más") or only in the
    // resolved form ("sí" → "show me more…"), and condensation may drop it from either, so
    // reading only one is fragile. Fire if EITHER form asks to continue.
    subject: 'both',
    threshold: 0.5,
    // Precondition: nothing was shown yet, so there is no earlier round to extend. When this
    // noul IS asked, a previous round already exists, so the judgment is only whether the
    // message asks to continue it — never asked otherwise, so no need to say so here.
    shortCircuit: (input) => (photosShownEarlier(input.recentTurns) ? null : false),
    instructions:
      'Does the user ask for MORE / another round of new photos, continuing an earlier photo request? A continuation expressed in EITHER form counts.',
    criteria: {
      true: 'Either form asks to continue with photos not yet shown: "more", "veamos más", "another round", "show me others", "keep looking", "next ones", "different from the ones already shown", a variant that extends while tweaking ("more, but at night"), or an affirmative that resolves to "show me more".',
      false:
        'Neither form asks for more: a fresh search anchored on a NEW photo or subject ("photos similar to the attached photo") even if an earlier round exists; a re-reference to photos already shown ("which of those is best?"); a refinement that REPLACES the previous request ("only the ones from Madrid"); praise or thanks.',
    },
  },
  {
    key: 'disputes_verdict',
    // 'both' for the same reason as wants_more: the pushback lives in the raw wording ("no, that
    // one does not convince me"), and condensation can turn it into a neutral request that drops it.
    subject: 'both',
    threshold: 0.5,
    // Precondition: with no earlier assistant reply there is no judgment to dispute.
    shortCircuit: (input) => (assistantRepliedEarlier(input.recentTurns) ? null : false),
    instructions:
      'Does the user take a different view from an ASSESSMENT the assistant made earlier about the photos — which one is stronger, how good one is, what fits, whether its order or grouping works? Contradicting, rejecting or doubting that assessment counts, and so does stating their own different opinion of the photos. Asking for something else — a new direction, other photos, another source or scope — is a change of request, not pushback, even when phrased as a preference. Pushback in EITHER form counts.',
    criteria: {
      true: 'The user disagrees with or doubts the assistant\'s earlier assessment of the photos, with or without reasons: "no, the other one is better", "that opener does not convince me", "are you sure?", "I like the other photo more", or a request that overturns it because they judge it wrong ("ok, but change the first one").',
      false:
        'No assessment of the photos is questioned: a new request or a change of direction, even phrased as a preference ("I would rather you use photos from the board", "let\'s try something darker"); a follow-up that builds on the answer; a question about it asked without disagreeing ("why did you pick that one?"); a requirement restated or a fact corrected; praise or thanks.',
    },
  },
]

/**
 * Build the single Jev request for a query. The state carries BOTH queries (see
 * file header) plus the code-computed facts the signals lean on. Only signals
 * whose precondition did not resolve in code become `noul` questions (keyed by
 * flag name); the rest are carried in `resolved` and merged back by
 * parseJevClassifierAnswers.
 */
export function buildJevClassifierRequest(input: QueryClassifierInput): {
  state: Record<string, unknown>
  questions: Record<
    string,
    { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
  >
  resolved: Partial<QueryClassificationFlags>
} {
  const selfContained = input.selfContainedQuery ?? input.query
  // No photos_shown_earlier here on purpose: the wants_more gate already withholds that noul
  // unless a round happened, and putting the flag in the state only biased Jev toward "more".
  const state = {
    task: "Routing classifier for a photo-assistant chatbot: decide independent yes/no facts about the user's request so code can route the turn. `photos_in_front_of_user` counts the user's photos they are looking at this turn (attached, or laid out on a board beside the chat); deictic or spatial wording refers to them.",
    query: input.query,
    self_contained_query: selfContained,
    attached_photo_count: input.attachedPhotoCount,
    photos_in_front_of_user: input.photosInViewCount,
  }

  const questions: Record<string, any> = {}
  const resolved: Partial<QueryClassificationFlags> = {}

  for (const signal of SIGNALS) {
    const short = signal.shortCircuit?.(input) ?? null
    if (short !== null) {
      resolved[signal.key] = short
      continue
    }
    questions[signal.key] = {
      type: 'noul',
      instructions: `${subjectPreamble(signal.subject)} ${signal.instructions}`,
      criteria: signal.criteria,
    }
  }

  return { state, questions, resolved }
}

/**
 * Turn Jev's `answers` map into the flags. Short-circuited flags come from
 * `resolved`; asked flags read `answer.noul` against the signal threshold. A flag
 * that was asked but is missing/unparseable from the response defaults to false
 * (the same conservative default the LLM classifier and its fallback use).
 */
export function parseJevClassifierAnswers(
  answers: unknown,
  resolved: Partial<QueryClassificationFlags>
): QueryClassificationFlags {
  const map = answers && typeof answers === 'object' ? (answers as Record<string, any>) : {}
  const flags: QueryClassificationFlags = {
    has_photo_intent: false,
    needs_artistic_evaluation: false,
    needs_sequencing: false,
    attached_photos_only: false,
    wants_more_results: false,
    disputes_verdict: false,
  }

  for (const signal of SIGNALS) {
    if (signal.key in resolved) {
      flags[signal.key] = resolved[signal.key]!
      continue
    }
    const noul = Number(map[signal.key]?.noul)
    flags[signal.key] = Number.isFinite(noul) && noul >= signal.threshold
  }

  return flags
}

/** Re-exported so QueryService can gate the Jev backend without importing the provider util directly. */
export { isJevConfigured }
