/**
 * Pure helpers for the Jev (TypeSafe AI System One) engine of the Phase 3 action
 * suggester. Builds the request, reads the answers back into the SAME raw-action shape
 * the LLM engine emits, so `validateActions` grounds both engines identically.
 *
 * The suggester's job decomposes into independent typed questions over one shared
 * state: "would action X help now?" (noul), "which container / view / criterion?"
 * (choice over the real inventory or a closed enum), "which threshold?" (score). Jev
 * cannot write text, so the single free-text slot of the catalog (`search_photos.query`)
 * is NOT asked here: the parser only reports that a search is wanted, and the service
 * has a generative model write the phrase.
 */

import {
  ASPECT_VALUES,
  FILTERABLE_ASPECT_KEYS,
  GENRE_PRESETS,
  SCORE_CRITERIA,
  type FilterableAspectKey,
  type GroundedPhotoGroup,
} from './chat_actions_catalog.js'

// ─── Input (engine-agnostic view of the turn) ─────────────────────────────

export interface JevActionsPhoto {
  id: number
  filename: string
  /** First sentence of the description, already budgeted by the caller ('' when omitted). */
  snippet: string
}

export interface JevActionsInput {
  assistantText: string
  historyText: string
  photos: JevActionsPhoto[]
  photoGroups: GroundedPhotoGroup[]
  collections: Array<{ id: number; name: string }>
  series: Array<{ id: number; name: string }>
  portfolios: Array<{ id: number; name: string }>
  /** How many photos get an id+filename line in the state (across the whole turn). */
  maxListedPhotos: number
}

// ─── Jev primitives ───────────────────────────────────────────────────────

export interface JevNoulQuestion {
  type: 'noul'
  instructions: string
}
export interface JevChoiceQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}
export interface JevScoreQuestion {
  type: 'score'
  instructions: string
  criteria: string[]
}
export type JevActionsQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion

export interface JevActionsRequest {
  state: Record<string, unknown>
  questions: Record<string, JevActionsQuestion>
}

/** A noul at or above this offers the action. Jev's noul is a calibrated probability. */
export const OFFER_THRESHOLD = 0.5

const NONE = 'none'
const FLAT_SCOPE = 'flat'
const VIEW_PLAIN_TARGETS: Record<string, string> = {
  'report': 'Report & Statistics: aggregate insight across the whole catalog (distributions, patterns, artistic-score charts). For numbers and patterns, never to list matching photos.',
  'tagcloud': 'Browse the catalog by subject/tag frequency.',
  'world-map': 'Where the photos were taken. For questions about location or geography.',
  'collections': "The user's collections list.",
  'series-list': "The user's series list.",
  'portfolios': "The user's portfolios list. Also when the user intends to create or curate a portfolio.",
}

const SCORE_CRITERIA_TEXT: Record<string, string> = {
  aesthetic_quality: 'overall aesthetic quality',
  composition: 'composition',
  storytelling: 'storytelling',
  originality: 'originality',
  message: 'message / meaning',
  humor: 'humor',
  visual_games: 'visual games (rhymes, juxtapositions)',
  candidness: 'candidness',
  commercial_intent: 'commercial intent (commercial profiles only)',
  subject_clarity: 'subject clarity (commercial profiles only)',
}

const GENRE_PRESET_TEXT: Record<string, string> = {
  general: 'rank as a general photographer would',
  street: 'rank as a street photographer would',
  documentary: 'rank as a documentary photographer would',
  abstract: 'rank as an abstract photographer would',
  commercial: 'rank as a commercial photographer would',
}

const RULES = [
  'The chat only ever shows a curated handful, never the full result set. Photos already on screen do not mean the request is done; opening the whole matching set is often the most useful action.',
  '"photos OF / WITH / IN a subject, scene, style, mood or place" is a CONTENT request: it is served by search_photos, not by the workspace or a report.',
  '"my BEST / WORST photos", a score criterion, or a genre / palette / lighting / stylistic facet is a QUALITY request: it is served by open_workspace, not by content search.',
  'Aggregate questions (statistics, distributions, recurring patterns, how the work compares) are served by the report view, never by listing photos.',
  'An organizing action covers exactly ONE shown group, whole, and is named after that group. A group marked rejected is the discard pile and is never organized.',
  'An action is worth offering only when it genuinely helps the user now. Fewer is better than forced.',
]

// ─── Request ──────────────────────────────────────────────────────────────

function scopeKey(groupId: number | typeof FLAT_SCOPE): string {
  return groupId === FLAT_SCOPE ? FLAT_SCOPE : `g${groupId}`
}

function inventoryChoice(
  items: Array<{ id: number; name: string }>,
  noneText: string
): Record<string, string> {
  const criteria: Record<string, string> = { [NONE]: noneText }
  for (const it of items) criteria[String(it.id)] = `"${it.name.slice(0, 60)}"`
  return criteria
}

function organizeQuestions(
  input: JevActionsInput,
  scope: number | typeof FLAT_SCOPE,
  subject: string
): Record<string, JevActionsQuestion> {
  const k = scopeKey(scope)
  const q: Record<string, JevActionsQuestion> = {
    [`create_collection_${k}`]: {
      type: 'noul',
      instructions: `${subject} is worth keeping together as a NEW thematic collection (an unordered set) and the user would want that now.`,
    },
    [`create_series_${k}`]: {
      type: 'noul',
      instructions: `${subject} forms an ordered narrative sequence or photo essay worth starting as a NEW series now (a single photo can seed one).`,
    },
  }
  if (input.collections.length > 0) {
    q[`add_to_collection_${k}`] = {
      type: 'choice',
      instructions: `Which EXISTING collection of state.library.collections should ${subject} be added to, if the conversation makes that the natural next step? Pick "none" unless one clearly fits.`,
      criteria: inventoryChoice(input.collections, 'No existing collection fits.'),
    }
  }
  if (input.series.length > 0) {
    q[`add_to_series_${k}`] = {
      type: 'choice',
      instructions: `Which EXISTING series of state.library.series should ${subject} extend, if the conversation makes that the natural next step? Pick "none" unless one clearly fits.`,
      criteria: inventoryChoice(input.series, 'No existing series fits.'),
    }
  }
  return q
}

function workspaceQuestions(): Record<string, JevActionsQuestion> {
  const criteriaWithNone = (
    entries: readonly string[],
    text: Record<string, string>,
    noneText: string
  ) => {
    const c: Record<string, string> = { [NONE]: noneText }
    for (const e of entries) c[e] = text[e] ?? e
    return c
  }
  const q: Record<string, JevActionsQuestion> = {
    offer_workspace: {
      type: 'noul',
      instructions:
        'Opening the workspace grid ranked by artistic scores and/or filtered by visual aspects (genre, palette, lighting, stylistic) would serve the user now: they asked for their best/worst photos, for a score criterion, or for one of those facets. Not for subject-matter requests (those are search_photos).',
    },
    ws_sort_field: {
      type: 'choice',
      instructions:
        'If the workspace is opened, which artistic score should it be SORTED by? "none" when the user asked for no ranking, or when a genre preset fits better.',
      criteria: criteriaWithNone(SCORE_CRITERIA, SCORE_CRITERIA_TEXT, 'No sorting by a score.'),
    },
    ws_sort_dir: {
      type: 'choice',
      instructions: 'If sorted by a score, in which direction?',
      criteria: { desc: 'best first (highest scores on top)', asc: 'worst first (lowest scores on top)' },
    },
    ws_genre_preset: {
      type: 'choice',
      instructions:
        'If the workspace is opened, should it be RANKED with a genre-specific weighting recipe ("rank my street photos the way a street photographer would")? This is a ranking recipe, not a genre filter. "none" unless the user asked to be judged as that kind of photographer.',
      criteria: criteriaWithNone(GENRE_PRESETS, GENRE_PRESET_TEXT, 'No genre preset.'),
    },
  }
  // One threshold per criterion, independently: a request like "strong composition but
  // not too staged" becomes two filters instead of the one slot the LLM prompt allowed.
  for (const criterion of SCORE_CRITERIA) {
    const text = SCORE_CRITERIA_TEXT[criterion] ?? criterion
    q[`ws_threshold_${criterion}`] = {
      type: 'choice',
      instructions: `If the workspace is opened, should photos be THRESHOLDED on their ${text} score? Only when the user asked for that criterion, explicitly or by clear implication ("only my strongest compositions", "nothing too staged").`,
      criteria: {
        [NONE]: `No threshold on ${text}.`,
        gte: `Keep photos scoring AT OR ABOVE a cut-off on ${text} (the good ones).`,
        lte: `Keep photos scoring AT OR BELOW a cut-off on ${text} (the weak ones).`,
      },
    }
    q[`ws_threshold_${criterion}_value`] = {
      type: 'score',
      instructions: `If thresholded on ${text}, the cut-off value on the 1-10 scale.`,
      criteria: Array.from({ length: 10 }, (_, i) => `${i + 1}`),
    }
  }
  for (const aspect of FILTERABLE_ASPECT_KEYS) {
    ASPECT_VALUES[aspect].forEach((value, i) => {
      q[`ws_aspect_${aspect}_${i}`] = {
        type: 'noul',
        instructions: `If the workspace is opened, its filter should require ${aspect} = "${value}": the user asked, explicitly or by clear implication, for photos with that ${aspect}.`,
      }
    })
  }
  return q
}

function viewQuestions(input: JevActionsInput): Record<string, JevActionsQuestion> {
  const criteria: Record<string, string> = { ...VIEW_PLAIN_TARGETS }
  for (const c of input.collections) criteria[`collection:${c.id}`] = `Open the collection "${c.name.slice(0, 60)}".`
  for (const s of input.series) criteria[`series:${s.id}`] = `Open the series "${s.name.slice(0, 60)}".`
  for (const p of input.portfolios) criteria[`portfolio:${p.id}`] = `Open the portfolio "${p.name.slice(0, 60)}".`
  return {
    offer_view: {
      type: 'noul',
      instructions:
        'A dedicated view (report, tag cloud, world map, or a collections / series / portfolios page) answers the user better than the chat does, so redirecting there is worth offering now. Not for finding or listing matching photos.',
    },
    view_target: {
      type: 'choice',
      instructions: 'If a dedicated view is offered, which one?',
      criteria,
    },
  }
}

function buildShownPhotos(input: JevActionsInput): Record<string, unknown> {
  const byId = new Map(input.photos.map((p) => [p.id, p]))
  let listed = 0
  const list = (ids: number[]) => {
    const room = Math.max(0, input.maxListedPhotos - listed)
    const shown = ids.slice(0, room)
    listed += shown.length
    return {
      photos: shown.map((id) => {
        const p = byId.get(id)
        return {
          id,
          filename: p?.filename ?? 'photo',
          ...(p?.snippet ? { description: p.snippet } : {}),
        }
      }),
      ...(ids.length > shown.length ? { not_listed: ids.length - shown.length } : {}),
    }
  }

  if (input.photos.length === 0) return { mode: 'none' }
  if (input.photoGroups.length === 0) {
    return { mode: 'flat', photo_count: input.photos.length, ...list(input.photos.map((p) => p.id)) }
  }
  return {
    mode: 'groups',
    groups: input.photoGroups.map((g) => ({
      id: g.id,
      label: g.label,
      photo_count: g.photoIds.length,
      rejected: g.rejected,
      ...list(g.photoIds),
    })),
  }
}

export function buildJevActionsRequest(input: JevActionsInput): JevActionsRequest {
  const state: Record<string, unknown> = {
    task: 'Photoreka is a photography app. The assistant just replied in the chat; decide which concrete next actions from the app would genuinely help the user now. Each question is one candidate action. Judge from the conversation, the reply and the concrete items below; nothing else exists.',
    rules: RULES,
    conversation: input.historyText.trim(),
    assistant_reply: input.assistantText.trim().slice(0, 2000),
    shown_photos: buildShownPhotos(input),
    library: {
      collections: input.collections.map((c) => ({ id: c.id, name: c.name.slice(0, 60) })),
      series: input.series.map((s) => ({ id: s.id, name: s.name.slice(0, 60) })),
      portfolios: input.portfolios.map((p) => ({ id: p.id, name: p.name.slice(0, 60) })),
    },
  }

  const questions: Record<string, JevActionsQuestion> = {
    offer_search: {
      type: 'noul',
      instructions:
        'A semantic search over the WHOLE library for what photos depict would serve the user now: they asked for photos of / with / in a subject, object, scene, style, mood or place, and the chat could only show a handful. Not for best/worst or visual-aspect requests.',
    },
    ...workspaceQuestions(),
    ...viewQuestions(input),
  }

  if (input.photos.length > 0) {
    if (input.photoGroups.length === 0) {
      Object.assign(
        questions,
        organizeQuestions(input, FLAT_SCOPE, `The whole set of ${input.photos.length} shown photos`)
      )
    } else {
      for (const g of input.photoGroups) {
        if (g.rejected) continue
        Object.assign(
          questions,
          organizeQuestions(input, g.id, `Group #${g.id} "${g.label}" (${g.photoIds.length} photos)`)
        )
      }
    }
  }

  return { state, questions }
}

// ─── Answers → raw actions ────────────────────────────────────────────────

export type ActionFamily = 'organize' | 'search' | 'workspace' | 'view'

/** A raw action in the LLM engine's shape, plus the probability Jev gave it. */
export interface JevActionCandidate {
  type: string
  params: Record<string, any>
  probability: number
  family: ActionFamily
}

export interface JevActionsParse {
  /** Every action Jev offered, unordered. `search_photos` is NOT among them. */
  candidates: JevActionCandidate[]
  /** Whether a content search is wanted; the caller must write its query. */
  search: { offer: boolean; probability: number }
}

function noul(answers: Record<string, any>, key: string): number {
  const v = Number(answers[key]?.noul)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

function choice(answers: Record<string, any>, key: string): { value: string | null; probability: number } {
  const a = answers[key]
  if (!a || typeof a.choice !== 'string') return { value: null, probability: 0 }
  let p = Number(a.probabilities?.[a.choice])
  if (!Number.isFinite(p)) p = Number(a.confidence)
  if (!Number.isFinite(p)) p = 0.5
  return { value: a.choice, probability: Math.min(1, Math.max(0, p)) }
}

/** Score answers carry a probability per ordered level; the mode is the level Jev backs. */
function scoreLevel(answers: Record<string, any>, key: string, levels: number): number | null {
  const a = answers[key]
  if (!a) return null
  const probs = Array.isArray(a.probabilities) ? a.probabilities.map(Number) : []
  if (probs.length === levels && probs.every(Number.isFinite)) {
    return probs.indexOf(Math.max(...probs)) + 1
  }
  const s = Number(a.score)
  return Number.isFinite(s) ? Math.min(levels, Math.max(1, Math.round(s))) : null
}

function workspaceFilters(answers: Record<string, any>): Record<string, any> | null {
  const filters: Record<string, any> = {}

  // The catalog forbids combining a sort with a genre preset; keep the one Jev backs more.
  const sort = choice(answers, 'ws_sort_field')
  const preset = choice(answers, 'ws_genre_preset')
  const hasSort = sort.value !== null && sort.value !== NONE
  const hasPreset = preset.value !== null && preset.value !== NONE
  if (hasSort && (!hasPreset || sort.probability >= preset.probability)) {
    filters.sort = { field: sort.value, dir: choice(answers, 'ws_sort_dir').value ?? 'desc' }
  } else if (hasPreset) {
    filters.genrePreset = preset.value
  }

  const scoreFilters: Array<{ field: string; op: string; value: number }> = []
  for (const criterion of SCORE_CRITERIA) {
    const op = choice(answers, `ws_threshold_${criterion}`).value
    if (op !== 'gte' && op !== 'lte') continue
    const value = scoreLevel(answers, `ws_threshold_${criterion}_value`, 10)
    if (value !== null) scoreFilters.push({ field: criterion, op, value })
  }
  if (scoreFilters.length > 0) filters.scoreFilters = scoreFilters

  const visualAspects: Array<{ aspect: FilterableAspectKey; values: string[] }> = []
  for (const aspect of FILTERABLE_ASPECT_KEYS) {
    const values = ASPECT_VALUES[aspect].filter(
      (_, i) => noul(answers, `ws_aspect_${aspect}_${i}`) >= OFFER_THRESHOLD
    )
    if (values.length > 0) visualAspects.push({ aspect, values })
  }
  if (visualAspects.length > 0) filters.visualAspects = visualAspects

  return Object.keys(filters).length > 0 ? filters : null
}

export function parseJevActionsAnswers(
  answers: unknown,
  input: JevActionsInput
): JevActionsParse {
  const a = (answers && typeof answers === 'object' ? answers : {}) as Record<string, any>
  const candidates: JevActionCandidate[] = []

  const searchP = noul(a, 'offer_search')
  const search = { offer: searchP >= OFFER_THRESHOLD, probability: searchP }

  const workspaceP = noul(a, 'offer_workspace')
  if (workspaceP >= OFFER_THRESHOLD) {
    const filters = workspaceFilters(a)
    if (filters) {
      candidates.push({ type: 'open_workspace', params: { filters }, probability: workspaceP, family: 'workspace' })
    }
  }

  const viewP = noul(a, 'offer_view')
  if (viewP >= OFFER_THRESHOLD) {
    const target = choice(a, 'view_target').value
    if (target) {
      const [view, id] = target.split(':')
      const params: Record<string, any> = { view }
      if (id !== undefined) params.id = Number(id)
      candidates.push({ type: 'open_view', params, probability: viewP, family: 'view' })
    }
  }

  const scopes: Array<{ key: string; params: Record<string, any> }> =
    input.photos.length === 0
      ? []
      : input.photoGroups.length === 0
        ? [{ key: FLAT_SCOPE, params: {} }]
        : input.photoGroups
            .filter((g) => !g.rejected)
            .map((g) => ({ key: scopeKey(g.id), params: { groupId: g.id } }))

  for (const { key, params } of scopes) {
    for (const type of ['create_collection', 'create_series'] as const) {
      const p = noul(a, `${type}_${key}`)
      if (p >= OFFER_THRESHOLD) {
        candidates.push({ type, params: { ...params }, probability: p, family: 'organize' })
      }
    }
    const toCollection = choice(a, `add_to_collection_${key}`)
    if (toCollection.value && toCollection.value !== NONE) {
      candidates.push({
        type: 'add_to_collection',
        params: { ...params, collectionId: Number(toCollection.value) },
        probability: toCollection.probability,
        family: 'organize',
      })
    }
    const toSeries = choice(a, `add_to_series_${key}`)
    if (toSeries.value && toSeries.value !== NONE) {
      candidates.push({
        type: 'add_to_series',
        params: { ...params, seriesId: Number(toSeries.value) },
        probability: toSeries.probability,
        family: 'organize',
      })
    }
  }

  return { candidates, search }
}

/**
 * Orders candidates most-useful-first with the catalog's variety rule made explicit:
 * the best of each family comes before any family's second pick, so three near-identical
 * organizing actions never crowd out a search or a redirect. `validateActions` then caps
 * and grounds them in this order, so a dropped one is replaced by the next in line.
 */
export function rankJevActionCandidates(candidates: JevActionCandidate[]): JevActionCandidate[] {
  const byProbability = [...candidates].sort((x, y) => y.probability - x.probability)
  const firstOfFamily: JevActionCandidate[] = []
  const rest: JevActionCandidate[] = []
  const seen = new Set<ActionFamily>()
  for (const c of byProbability) {
    if (seen.has(c.family)) rest.push(c)
    else {
      seen.add(c.family)
      firstOfFamily.push(c)
    }
  }
  return [...firstOfFamily, ...rest]
}
