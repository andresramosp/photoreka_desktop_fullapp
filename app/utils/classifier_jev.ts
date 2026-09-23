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

/** The four routing booleans, identical to the LLM classifier's flags. */
export interface QueryClassificationFlags {
  has_photo_intent: boolean
  needs_artistic_evaluation: boolean
  attached_photos_only: boolean
  wants_more_results: boolean
}

/** Everything the classifier reasons over, engine-agnostic. */
export interface QueryClassifierInput {
  /** The user's latest message, verbatim. */
  query: string
  /** The ellipsis-resolved request from the condensation pass; defaults to `query`. */
  selfContainedQuery?: string
  attachedPhotoCount: number
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
 * The four base-classifier signals. Instructions/criteria are a faithful, literal
 * restatement of MESSAGE_QUERY_CLASSIFICATION's per-flag guidance (all prompting
 * stays in English). All four judge the resolved request, so the ellipsis is
 * already gone by the time Jev sees it — these are single-turn judgments.
 */
const SIGNALS: readonly JevClassifierSignal[] = [
  {
    key: 'has_photo_intent',
    subject: 'self_contained_query',
    threshold: 0.5,
    instructions:
      "Does answering it require engaging with the user's photographic work — showing, selecting, searching, ranking, describing or visually analyzing photos, or judging their body of work (critique, improvement advice, strengths/weaknesses, style, recurring themes)?",
    criteria: {
      true: "Photos must be shown, found, ranked, described or visually analyzed, or the user's work is judged.",
      false:
        'Counting or statistics over the catalog ("how many photos do I have"), app functionality/pricing/definitions, or library actions on photos the user already identified ("add these to a collection").',
    },
  },
  {
    key: 'needs_artistic_evaluation',
    subject: 'self_contained_query',
    threshold: 0.5,
    instructions: 'Does it call for SUBJECTIVE artistic judgment about photographs?',
    criteria: {
      true: 'Critique or evaluation, improvement advice, style/evolution analysis, selecting for awards, portfolios or exhibitions, curated storytelling sequences, or comparing/ranking by artistic merit ("my best", "most original") even when phrased as a plain lookup.',
      false:
        'Retrieval by content, subject or metadata; plain content description; sequences by objective criteria (chronological, by location); non-photo requests.',
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
    task: "Routing classifier for a photo-assistant chatbot: decide independent yes/no facts about the user's request so code can route the turn.",
    query: input.query,
    self_contained_query: selfContained,
    attached_photo_count: input.attachedPhotoCount,
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
 * Turn Jev's `answers` map into the four flags. Short-circuited flags come from
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
    attached_photos_only: false,
    wants_more_results: false,
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
