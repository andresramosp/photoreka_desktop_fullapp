/**
 * chat_actions_catalog.ts
 * -----------------------------------------------------------------
 * Phase 3 ("action suggester") contract.
 *
 * A cheap LLM reads the last few chat turns + the photos the assistant
 * just surfaced + the user's real library items, and picks 2-3 CONCRETE,
 * clickable actions from the closed catalog below — it never invents a
 * flow, it only fills typed slots. The backend then validates every slot
 * against the real inventory before returning them to the frontend.
 *
 * This file is the single source of truth for:
 *   - the action type union + param shapes (mirrored on the frontend)
 *   - the feature-oriented catalog text injected into the Phase 3 prompt
 *   - the structured-output JSON schema
 *   - grounding validation (drops actions referencing unknown IDs/enums)
 * -----------------------------------------------------------------
 */

import { resolveInternalScoreKeyAnyVariant, VISUAL_ASPECTS_MAP } from '#config/photo_schema'

// ══════════════════════════════════════════════════════════════
// ENUMS (kept in sync with api/config/photo_schema.ts)
// ══════════════════════════════════════════════════════════════

/** Artistic score criteria usable in score filters / sorting. Superset of
 *  non-commercial + commercial profiles — validation is per-user lenient:
 *  we only reject criteria that exist in NEITHER profile. */
export const SCORE_CRITERIA = [
  // non-commercial
  'aesthetic_quality',
  'composition',
  'storytelling',
  'originality',
  'message',
  'humor',
  'visual_games',
  'candidness',
  // commercial-only extras
  'commercial_intent',
  'subject_clarity',
] as const

/** Genre presets available for score-weighted sorting. */
export const GENRE_PRESETS = ['general', 'street', 'documentary', 'abstract', 'commercial'] as const

/**
 * Visual-aspect facets the suggester may filter the workspace by. A deliberate
 * SUBSET of VISUAL_ASPECTS_SCHEMA: exposing all ten selectors (framing, perspective,
 * temperature, depth of field…) would bloat the Phase-3 prompt for facets users
 * rarely ask for in chat. These four cover the common asks.
 */
export const FILTERABLE_ASPECT_KEYS = ['genre', 'palette', 'lighting', 'stylistic'] as const
export type FilterableAspectKey = (typeof FILTERABLE_ASPECT_KEYS)[number]

/** aspect key → allowed values. The full union across profiles is used, not the
 *  per-variant narrowing: a value the user's profile never produces simply matches
 *  no photos, which is a harmless empty grid rather than a dropped action. */
export const ASPECT_VALUES = Object.fromEntries(
  FILTERABLE_ASPECT_KEYS.map((key) => [key, VISUAL_ASPECTS_MAP[key].values])
) as Record<FilterableAspectKey, string[]>

/** Flat enum for the structured-output schema (Gemini can't express a value enum
 *  that depends on a sibling field — the aspect/value pairing is enforced in
 *  sanitizeGridFilters instead). */
export const ALL_ASPECT_VALUES = [...new Set(Object.values(ASPECT_VALUES).flat())]

/** Plain redirect targets for `open_view` (no photo payload). */
export const VIEW_TARGETS = [
  'report', // Report & Statistics (opens the report; the tab is chosen in-app)
  'portfolios', // portfolio builder list
  'portfolio', // a specific portfolio (requires id)
  'collections',
  'collection', // a specific collection (requires id)
  'series-list',
  'series', // a specific series (requires id)
  'world-map',
  'tagcloud',
] as const

export type ScoreCriterion = (typeof SCORE_CRITERIA)[number]
export type GenrePreset = (typeof GENRE_PRESETS)[number]
export type ViewTarget = (typeof VIEW_TARGETS)[number]

// ══════════════════════════════════════════════════════════════
// ACTION CONTRACT (mirror on the frontend: web/src/composables/useChatActions.js)
// ══════════════════════════════════════════════════════════════

export type SuggestedActionType =
  | 'create_collection'
  | 'create_series'
  | 'create_canvas'
  | 'add_to_collection'
  | 'add_to_series'
  | 'search_photos'
  | 'open_workspace'
  | 'view_photo'
  | 'open_view'

/** Filters/sort payload shared by `open_workspace` and (optionally) `open_view`
 *  when the target is a collection — both render photos through PhotosGrid. */
export type GridFilters = {
  /** Score-weighted ranking (criteria averaged). */
  sort?: {
    field: ScoreCriterion
    dir: 'asc' | 'desc'
  }
  /** Genre-preset weighted ranking (mutually exclusive with `sort`). */
  genrePreset?: GenrePreset
  /** Hard score thresholds. */
  scoreFilters?: Array<{
    field: ScoreCriterion
    op: 'gte' | 'lte'
    value: number
  }>
  /** Visual-aspect facets: AND across aspects, OR within one aspect's values
   *  (same semantics as the workspace's own visual-aspect selects). */
  visualAspects?: Array<{
    aspect: FilterableAspectKey
    values: string[]
  }>
}

export type SuggestedAction = {
  type: SuggestedActionType
  used?: boolean
  /**
   * Typed slots. Includes display names resolved from the DB inventory
   * (e.g. collectionName, filename) so the frontend can compose the chip label
   * from a FIXED template — the LLM never writes the visible title, which makes
   * a mislabeled/hallucinated CTA structurally impossible.
   *
   * `params.title` is a real resource name, but the SUGGESTER never writes it either: it
   * is the label of the group the action is scoped to, or the curator's name for the whole
   * selection. The only free text the suggester contributes anywhere is `params.query` for
   * search_photos, which is a search phrase and not a name.
   *
   * Photo actions carry BOTH the resolved `photoIds` (what the action operates on) and,
   * when the turn had groups, the `groupId`/`groupLabel` they came from — so the frontend
   * can show and highlight the action's SCOPE rather than infer it from a flat id list.
   */
  params: Record<string, any>
}

// ══════════════════════════════════════════════════════════════
// STATIC CATALOG (feature-oriented, injected into the Phase 3 prompt)
// ══════════════════════════════════════════════════════════════

/**
 * The machine-readable menu the suggester chooses from. Deliberately terse —
 * it is the "summarized, feature-oriented" version of the app knowledge, NOT
 * the full prose doc. Every `params` slot must be filled ONLY from the runtime
 * inventory the service injects alongside this catalog.
 */

export const ACTIONS_CATALOG = `
# ACTION CATALOG

Pick 2-3 actions, most useful first.
Fill params ONLY from the provided inventory.

## 1) Core Principle

The chat only ever shows a CURATED HANDFUL, never the full result set.
Photos already being on screen does not mean the user's request is "done".
An action that opens the whole matching set is often the most useful thing to offer.

## 2) Match Intent to Action

- FIND PHOTOS BY CONTENT
  Subject, object, scene, style, mood, place-as-content
  ("photos of/with X", "my street shots", "shots in the rain", "anything with red")
  -> search_photos
  This runs a semantic search over what photos actually DEPICT.

- ORGANIZE surfaced photos
  -> create_collection / create_series / add_to_collection / add_to_series

- FIND PHOTOS BY ARTISTIC QUALITY OR VISUAL ASPECT
  Rank/threshold by artistic scores and/or filter by closed visual-aspect facets
  ("my best X", "which score high on composition", "my black and white street shots", "backlit photos with bokeh")
  -> open_workspace
  This is SCORE + ASPECT metadata, not content search.

Rule of thumb:
- "photos OF/WITH/IN <a subject>" -> search_photos
- "my BEST/WORST, or filtered by an aspect below" -> open_workspace

- ANSWER AGGREGATE catalog questions
  Statistics, distributions, recurring patterns, "how does my work compare", rarity/commonness
  -> open_view (report / tagcloud / world-map)
  Use for numbers and patterns, not for listing matching photos.

## 3) Photo Selection Rules (ONE GROUP PER ACTION)

- If SHOWN PHOTOS come as GROUPS (each listed as Group #N "label"):
  set groupId to the NUMBER of the ONE group the action is about.
  One organizing action covers exactly one group.
  You cannot merge several groups into one collection/series.
  You cannot cherry-pick photos out of a group.
  If two groups both deserve action, that is two actions.

- photoIds is IGNORED on a grouped turn.
  Never enumerate individual photo IDs there.

- A group marked REJECTED is the assistant's discard pile.
  Never name it. The app refuses it anyway.

- If SHOWN PHOTOS are a flat list (no groups):
  leave groupId empty and set photoIds to the photos to include.

- You NEVER write a name.
  A collection/series takes the name of the group it's built from.
  On a flat turn, it takes the assistant's name for the selection.
  There is no title slot. Do not try to supply one.

## 4) Action Specs

### create_collection
When:
- One shown group is worth keeping together thematically (unordered).

params:
- { groupId?: number, photoIds?: number[] } // named after the group

### create_series
When:
- One group forms an ordered narrative sequence / photo essay.
- A single photo is fine; a series can be seeded with one and grown later.

params:
- { groupId?: number, photoIds?: number[] }
  // named after the group; on a flat turn keep photoIds in narrative order

### add_to_collection
When:
- A group's photos belong in an EXISTING collection the user already has.

params:
- { collectionId: number, groupId?: number, photoIds?: number[] }
  // collectionId MUST be from the inventory

### add_to_series
When:
- A group's photos extend an EXISTING series.

params:
- { seriesId: number, groupId?: number, photoIds?: number[] }
  // seriesId MUST be from the inventory

### search_photos
When:
- The user wants photos that REPRESENT something:
  a subject, object, scene, style, atmosphere, or place as content.
- It performs a broad semantic search across the ENTIRE library.
- Use this option, NOT open_workspace, whenever CONTENT matters more than rating.
- Suggest it even when matching photos are already shown in chat.
- Usually execute this FIRST when user asks to find/view photos of something.

Parameters:
- { query: string } // query = subject to search for, in THE USER'S LANGUAGE

Notes:
- Search runs against embeddings, so text must represent something visible in a photo.
- Figurative expressions may need translation to a concrete phrase.
  Examples: user asked for "hidden gems" -> "nice photos with interesting details".

Scope:
- Pure content search.
- Cannot sort by artistic score or filter by visual appearance.
- If user wants only best/worst or visual-aspect filtering with no subject, use open_workspace.

### open_workspace
When:
- User wants to RANK / THRESHOLD by artistic quality
  ("show me my best X", "which photos score high on Y")
- and/or FILTER by visual aspects
  ("my black and white photos", "long exposure landscapes", "my best backlit portraits")
- This is SCORE + ASPECT metadata, not content search.
- For "photos of/with/in <a subject>", use search_photos.
- Prefer this over report when user wants to inspect matching PHOTOS, not statistics.

Behavior:
- Overwrites any current workspace filters.
- Put all needed ranking + filtering into one filters object.
- Never split one intent across two chips.
- Propose a second open_workspace only when it opens a genuinely DIFFERENT set
  (e.g. one for colour portraits, another for b&w non-portraits).

params:
- { filters: GridFilters }

GridFilters:
  {
    sort?:        { field: <score criterion>, dir: "asc"|"desc" },
    genrePreset?: <"general"|"street"|"documentary"|"abstract"|"commercial">,   // don't combine with sort
    scoreFilters?: [ { field: <score criterion>, op: "gte"|"lte", value: 1-10 } ],
    visualAspects?: [ { aspect: <aspect>, values: [<value of that aspect>, ...] } ]
  }

score criteria:
- aesthetic_quality, composition, storytelling, originality, message, humor,
  visual_games, candidness
- commercial profiles also: commercial_intent, subject_clarity

visual aspects:
- A photo must match EVERY listed aspect.
- Within one aspect, listed values are alternatives (OR).
${FILTERABLE_ASPECT_KEYS.map((k) => `    - ${k}: ${ASPECT_VALUES[k].join(', ')}`).join('\n')}

Constraints:
- Use the EXACT value strings above; anything else is dropped.
- Only these four aspects exist here.
- There is no filter for framing, perspective, temperature, orientation, or depth of field.

Important distinction:
- genre (visual aspect) = per-photo label you FILTER by.
- genrePreset = score-weighting recipe you RANK by.
- "show me my street photos" -> visualAspects genre:[street]
- "rank my street photos the way a street photographer would" -> genrePreset street

Capability scope:
- Only ranking/thresholding by artistic scores + filtering by these four aspects.
- If user asks about subject matter, tags, location, dates, or unsupported moods,
  this action cannot serve it; pick a different action or none.
- Aspect filters combine freely with sorting/thresholds.
  Example:
  "my best black and white portraits" ->
  visualAspects genre:[portrait] + palette:[black and white], sorted by aesthetic_quality desc.

### open_view
When:
- A dedicated tool answers the user's need better than chat (redirect).

Rule:
- Report tabs are for AGGREGATE insight only (statistics/distributions/patterns).
- Do NOT suggest a report tab to FIND or LIST matching photos.
- If intent is "search / show me photos that...", pick open_workspace (or none), not report.

params:
- { view: <target>, id?: number, filters?: GridFilters }

targets:
- report      — Report & Statistics: aggregate insight across the whole catalog,
  narrative/stylistic patterns, visual-aspect charts (colour, genre, lighting),
  tag distribution, artistic-score charts. Use for global analysis questions.
- tagcloud    — browse catalog by subject/tag frequency.
- world-map   — where photos were taken. Suggest it when the user asks about location or geography.
- collections — user's collections list; collection (needs id + optional filters) opens one.
- series-list — user's series list; series (needs id) opens one.
- portfolios  — user's portfolios list; portfolio (needs id) opens one. Suggest this one when the user intends to create or curate a portfolio. 

`.trim()

// ══════════════════════════════════════════════════════════════
// STRUCTURED-OUTPUT SCHEMA
// ══════════════════════════════════════════════════════════════

/** Gemini string-enum helper (constrained decoding to a closed set). */
const strEnum = (values: readonly string[]) => ({
  type: 'STRING',
  format: 'enum',
  enum: [...values],
})

/**
 * Gemini structured-output schema (passed as `responseSchema`).
 *
 * Gemini's constrained schema does NOT support `additionalProperties` or per-type
 * discriminated unions, so `params` is ONE flat superset object with every possible
 * slot optional (only `type` + `params` are required). The per-action shape is still
 * enforced downstream by validateActions() — this schema only guarantees valid JSON
 * with in-catalog ENUM values, which is exactly what the weak Phase-3 model failed to
 * produce for nested/rare slots (e.g. report section targets).
 *
 * Enums are derived from the same const arrays as the catalog so they can't drift.
 * Note the Gemini dialect: uppercase `Type` names and `format: 'enum'` for strings.
 */
export const SUGGESTED_ACTIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    actions: {
      type: 'ARRAY',
      description: '2-3 concrete suggested actions, most useful first. Empty array if none fit.',
      items: {
        type: 'OBJECT',
        properties: {
          // create_canvas and view_photo are deliberately absent: both are appended
          // programmatically, because neither one's scope is a judgment call — a board covers
          // the whole selection, and a lone attached photo is the only photo its atlas view
          // could be about. Nothing to prompt for, and plenty for a weak model to get wrong
          // (it merged groups into one canvas, and it forgot the atlas view outright).
          type: strEnum([
            'create_collection',
            'create_series',
            'add_to_collection',
            'add_to_series',
            'search_photos',
            'open_workspace',
            'open_view',
          ]),
          params: {
            type: 'OBJECT',
            description: 'Typed slots — fill ONLY the ones the chosen action needs (see catalog).',
            properties: {
              query: {
                type: 'STRING',
                description: 'Content search phrase for search_photos (user language).',
              },
              groupId: {
                type: 'INTEGER',
                description:
                  'The ONE shown group this action is about (the N in `Group #N`). The only way to scope a create/add action on a grouped turn; the resource is named after that group.',
              },
              photoIds: {
                type: 'ARRAY',
                description:
                  'Individual photo IDs. ONLY for a flat, group-less turn — ignored whenever groups exist (use groupId there).',
                items: { type: 'INTEGER' },
              },
              collectionId: { type: 'INTEGER' },
              seriesId: { type: 'INTEGER' },
              id: {
                type: 'INTEGER',
                description: 'Owned id for open_view portfolio/collection/series.',
              },
              view: strEnum(VIEW_TARGETS),
              filters: {
                type: 'OBJECT',
                properties: {
                  sort: {
                    type: 'OBJECT',
                    properties: {
                      field: strEnum(SCORE_CRITERIA),
                      dir: strEnum(['asc', 'desc']),
                    },
                  },
                  genrePreset: strEnum(GENRE_PRESETS),
                  scoreFilters: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        field: strEnum(SCORE_CRITERIA),
                        op: strEnum(['gte', 'lte']),
                        value: { type: 'INTEGER', description: '1-10' },
                      },
                    },
                  },
                  visualAspects: {
                    type: 'ARRAY',
                    description:
                      'Visual-aspect facets. `values` must belong to the chosen `aspect` (see catalog) — mismatched pairs are dropped.',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        aspect: strEnum(FILTERABLE_ASPECT_KEYS),
                        values: { type: 'ARRAY', items: strEnum(ALL_ASPECT_VALUES) },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        required: ['type', 'params'],
      },
    },
  },
  required: ['actions'],
}

// ══════════════════════════════════════════════════════════════
// GROUNDING VALIDATION
// ══════════════════════════════════════════════════════════════

/** Real inventory the suggested actions are allowed to reference. Carries display
 *  names so validation can enrich params with the strings the frontend templates. */
/** A photo group as it was shown to the user, carrying the stable id Phase 3 references. */
export type GroundedPhotoGroup = {
  id: number
  label: string
  photoIds: number[]
  /** Curator's verdict from Phase 2: a discard pile. Never enters a create/add action. */
  rejected?: boolean
}

export type ActionsGroundingContext = {
  /** Photos the assistant actually surfaced this turn (photoGroups + attached). */
  photos: Array<{ id: number; filename: string }>
  /**
   * Groups as shown to the user this turn (empty when the assistant returned a flat
   * list). Ids are stable within the message; user-attached photos that belong to no
   * assistant group are folded in as a synthetic trailing group, so scope selection
   * has exactly ONE mechanism.
   */
  photoGroups: GroundedPhotoGroup[]
  /**
   * The curator's umbrella name for everything shown this turn (Phase 2's `selection_title`).
   * The suggester writes no names at all: a per-group action is named after its group, and
   * anything spanning the whole selection — the canvas board, or a create on a flat turn —
   * is named with this. Empty when the curator gave none.
   */
  selectionTitle: string
  collections: Array<{ id: number; name: string }>
  series: Array<{ id: number; name: string }>
  portfolios: Array<{ id: number; name: string }>
  /** collectionId → set of shown photoIds already in it. Lets validation drop an
   *  `add_to_collection` whose photos are ALL already members (redundant CTA). Optional:
   *  when absent, no membership filtering happens (back-compatible). */
  collectionMembership?: Map<number, Set<number>>
  /** seriesId → set of shown photoIds already in it (same purpose as above). */
  seriesMembership?: Map<number, Set<number>>
}

/** Chips the SUGGESTER may contribute. The programmatic ones (the canvas board, the atlas view
 *  of a lone attached photo) are appended on top. */
export const MAX_ACTIONS = 3

const SCORE_SET = new Set<string>(SCORE_CRITERIA)
const GENRE_SET = new Set<string>(GENRE_PRESETS)
const VIEW_SET = new Set<string>(VIEW_TARGETS)

const asIntArray = (v: any): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : []

function sanitizeGridFilters(raw: any): GridFilters | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: GridFilters = {}

  if (raw.sort && typeof raw.sort === 'object') {
    const field = String(raw.sort.field ?? '')
    const dir = raw.sort.dir === 'asc' ? 'asc' : 'desc'
    if (SCORE_SET.has(field)) {
      // The LLM speaks the external score name (e.g. "originality"); the frontend
      // filters against the raw DB key (e.g. "strangeness") — translate here so
      // every consumer downstream (querystring, PhotosGridControls) gets the
      // key that actually exists on `descriptions.artistic_scores`.
      out.sort = { field: resolveInternalScoreKeyAnyVariant(field) as ScoreCriterion, dir }
    }
  }
  if (raw.genrePreset && GENRE_SET.has(String(raw.genrePreset))) {
    out.genrePreset = String(raw.genrePreset) as GenrePreset
    // sort + genrePreset are mutually exclusive — genre wins if both slipped through
    delete out.sort
  }
  if (Array.isArray(raw.scoreFilters)) {
    const filters = raw.scoreFilters
      .filter((f: any) => f && SCORE_SET.has(String(f.field)))
      .map((f: any) => ({
        field: resolveInternalScoreKeyAnyVariant(String(f.field)) as ScoreCriterion,
        op: f.op === 'lte' ? 'lte' : 'gte',
        value: Math.max(1, Math.min(10, Number(f.value) || 0)),
      }))
      .filter((f: any) => f.value > 0)
    if (filters.length > 0) out.scoreFilters = filters
  }
  if (Array.isArray(raw.visualAspects)) {
    const aspects = raw.visualAspects
      .map((a: any) => {
        const aspect = String(a?.aspect ?? '') as FilterableAspectKey
        const allowed = ASPECT_VALUES[aspect]
        if (!allowed) return null
        // Drop values that don't belong to THIS aspect — the schema enum is a flat
        // union across all four, so the model can pair e.g. genre with "bokeh".
        const values = [
          ...new Set(
            (Array.isArray(a.values) ? a.values : [])
              .map((v: any) => String(v).trim().toLowerCase())
              .filter((v: string) => allowed.includes(v))
          ),
        ] as string[]
        return values.length > 0 ? { aspect, values } : null
      })
      .filter(Boolean) as GridFilters['visualAspects']
    if (aspects && aspects.length > 0) out.visualAspects = aspects
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/** How an action's photo selection got resolved — logged, never sent to the frontend. */
type SelectionSource =
  /** The model named the group (the intended path on a grouped turn). */
  | 'groupId'
  /** Grouped turn, model listed photo ids — snapped up to the single group holding them. */
  | 'photoIds→group'
  /** Grouped turn with exactly one selectable group, so naming it was unnecessary. */
  | 'only-group'
  /** Flat turn, model listed photo ids. */
  | 'photoIds'
  /** Flat turn, no usable ids → every shown photo. */
  | 'default-all-photos'

/** The photo scope of a create/add action, plus the group it was resolved from. */
type PhotoSelection = {
  photoIds: number[]
  /** Present only on a grouped turn: the ONE group this action covers. */
  groupId?: number
  groupLabel?: string
  /**
   * The resource name, when the action creates one. NEVER written by the suggester: it is
   * the group's own label, or — on a flat turn — the curator's name for the whole
   * selection. A name and a scope chosen by the same weak model drifted apart (a series
   * titled after group 1 that swept up all four); deriving the name FROM the scope makes
   * that contradiction unrepresentable.
   */
  title: string
  source: SelectionSource
}

export type ActionsValidationResult = {
  actions: SuggestedAction[]
  /** One human-readable line per raw action (kept / dropped + why). For logs. */
  trace: string[]
}

/**
 * Drops or repairs any action whose slots don't ground against the real
 * inventory. Returns only actions safe to hand to the frontend, plus a trace
 * explaining what happened to each one.
 */
export function validateActions(
  rawActions: any[],
  ctx: ActionsGroundingContext
): ActionsValidationResult {
  if (!Array.isArray(rawActions)) return { actions: [], trace: [] }
  const photoName = new Map(ctx.photos.map((p) => [p.id, p.filename]))
  const collectionName = new Map(ctx.collections.map((c) => [c.id, c.name]))
  const seriesName = new Map(ctx.series.map((s) => [s.id, s.name]))
  const portfolioName = new Map(ctx.portfolios.map((p) => [p.id, p.name]))

  const groundPhotoIds = (ids: number[]) => ids.filter((id) => photoName.has(id))

  /** Removes photos already belonging to the target container, so we never suggest
   *  adding a photo where it already lives. When `membership` is absent (not loaded),
   *  returns the ids untouched — the caller then behaves exactly as before. */
  const dropExistingMembers = (
    ids: number[],
    membership: Map<number, Set<number>> | undefined,
    containerId: number
  ): number[] => {
    const members = membership?.get(containerId)
    if (!members || members.size === 0) return ids
    return ids.filter((id) => !members.has(id))
  }

  /**
   * Resolves WHICH photos a create/add-to action applies to.
   *
   * A GROUPED turn resolves to exactly ONE group. Groups are the sets the user actually
   * saw under their own headings, so an organizing action is either about one of them or
   * it is about nothing coherent. The earlier contract let the suggester name a set of
   * groups AND write a free-text title, and the two drifted apart — a series titled
   * "Digital Solitude" that swept up all four groups. One group per action makes that
   * unrepresentable, and the name then falls out of the scope instead of being invented
   * beside it.
   *
   *   1. `groupId` — the intended slot. Unknown or rejected → DROP. The model tried to be
   *      selective and missed; widening the action inverts its intent, which is worse than
   *      showing no chip at all.
   *   2. `photoIds` on a grouped turn — the model filled the wrong slot (the schema must
   *      expose both in one flat object, and a model that can see the ids will enumerate
   *      them). Read it as evidence, not as an instruction: if every listed photo lives in
   *      ONE selectable group, that's the group. If they straddle several, the action is
   *      ambiguous — drop it rather than guess which heading the user meant.
   *   3. Neither slot, and exactly one selectable group → that group, since there was
   *      nothing to disambiguate. With several groups, silence is not a choice: drop.
   *
   * A group the curator flagged `rejected` (its discard pile) is never selectable, whatever
   * the suggester asks for. Phase 2 already decided those photos don't work; leaving the
   * exclusion to Phase 3's reading of a label like "Descartadas" is what let a discard pile
   * end up inside a "create series" chip.
   *
   * On a FLAT turn there are no groups to get wrong, so `photoIds` is authoritative, an
   * empty one means every shown photo, and the name comes from the curator's own title for
   * the selection.
   */
  const resolveSelection = (p: any): PhotoSelection | null => {
    const fromGroup = (g: GroundedPhotoGroup, source: SelectionSource): PhotoSelection | null => {
      const photoIds = groundPhotoIds(g.photoIds)
      if (photoIds.length === 0) return null
      return { photoIds, groupId: g.id, groupLabel: g.label, title: g.label, source }
    }

    if (ctx.photoGroups.length > 0) {
      const selectable = ctx.photoGroups.filter((g) => !g.rejected)
      if (selectable.length === 0) return null

      const requested = Number(p.groupId)
      if (Number.isInteger(requested) && requested > 0) {
        const picked = selectable.find((g) => g.id === requested)
        return picked ? fromGroup(picked, 'groupId') : null
      }

      const listed = new Set(groundPhotoIds(asIntArray(p.photoIds)))
      if (listed.size > 0) {
        const touched = selectable.filter((g) => g.photoIds.some((id) => listed.has(id)))
        return touched.length === 1 ? fromGroup(touched[0], 'photoIds→group') : null
      }

      return selectable.length === 1 ? fromGroup(selectable[0], 'only-group') : null
    }

    const title = ctx.selectionTitle?.trim() ?? ''
    const direct = groundPhotoIds(asIntArray(p.photoIds))
    if (direct.length > 0) return { photoIds: direct, title, source: 'photoIds' }
    const all = groundPhotoIds(ctx.photos.map((ph) => ph.id))
    return all.length > 0 ? { photoIds: all, title, source: 'default-all-photos' } : null
  }

  /** The group reference travels to the frontend alongside the resolved ids, so a chip
   *  can name/highlight its scope instead of guessing it back from a flat id list. */
  const scopeParams = (sel: PhotoSelection) => ({
    photoIds: sel.photoIds,
    ...(sel.groupId ? { groupId: sel.groupId, groupLabel: sel.groupLabel } : {}),
  })

  const out: SuggestedAction[] = []
  const trace: string[] = []
  const drop = (type: string, reason: string) => {
    trace.push(`✗ ${type} — ${reason}`)
  }
  const keep = (type: string, detail: string) => {
    trace.push(`✓ ${type} — ${detail}`)
  }
  /** e.g. "3 photo(s) via groupId [group 1 \"Digital Solitude\"]" — makes a scope bug visible in logs. */
  const scopeDetail = (sel: PhotoSelection) =>
    `${sel.photoIds.length} photo(s) via ${sel.source}` +
    (sel.groupId ? ` [group ${sel.groupId} "${sel.groupLabel}"]` : '')

  /** Why a scope failed, in the terms the suggester actually filled in. */
  const scopeFailure = (p: any) =>
    `unresolvable scope (groupId=${JSON.stringify(p.groupId ?? null)}, ` +
    `photoIds=${Array.isArray(p.photoIds) ? p.photoIds.length : 0})`

  for (const a of rawActions) {
    if (!a || typeof a !== 'object') continue
    const type = String(a.type) as SuggestedActionType
    const p = a.params && typeof a.params === 'object' ? a.params : {}

    switch (type) {
      case 'create_collection':
      case 'create_series': {
        const sel = resolveSelection(p)
        if (!sel) {
          drop(type, scopeFailure(p))
          continue
        }
        // The name is the group's label (or the curator's title for a flat selection).
        // No name means nothing sensible to call the resource — not a chip we can render.
        const title = sel.title.trim().slice(0, 100)
        if (!title) {
          drop(type, 'no name available for the resource')
          continue
        }
        out.push({ type, params: { title, ...scopeParams(sel) } })
        keep(type, `"${title}" · ${scopeDetail(sel)}`)
        break
      }
      case 'add_to_collection': {
        const collectionId = Number(p.collectionId)
        if (!collectionName.has(collectionId)) {
          drop(type, `unknown collectionId ${p.collectionId}`)
          continue
        }
        const sel = resolveSelection(p)
        if (!sel) {
          drop(type, scopeFailure(p))
          continue
        }
        const photoIds = dropExistingMembers(sel.photoIds, ctx.collectionMembership, collectionId)
        if (photoIds.length === 0) {
          drop(type, 'all photos already in that collection')
          continue
        }
        out.push({
          type,
          params: {
            collectionId,
            collectionName: collectionName.get(collectionId),
            ...scopeParams({ ...sel, photoIds }),
          },
        })
        keep(type, scopeDetail({ ...sel, photoIds }))
        break
      }
      case 'add_to_series': {
        const seriesId = Number(p.seriesId)
        if (!seriesName.has(seriesId)) {
          drop(type, `unknown seriesId ${p.seriesId}`)
          continue
        }
        const sel = resolveSelection(p)
        if (!sel) {
          drop(type, scopeFailure(p))
          continue
        }
        const photoIds = dropExistingMembers(sel.photoIds, ctx.seriesMembership, seriesId)
        if (photoIds.length === 0) {
          drop(type, 'all photos already in that series')
          continue
        }
        out.push({
          type,
          params: {
            seriesId,
            seriesName: seriesName.get(seriesId),
            ...scopeParams({ ...sel, photoIds }),
          },
        })
        keep(type, scopeDetail({ ...sel, photoIds }))
        break
      }
      case 'search_photos': {
        // Free-text content search — no grounding against inventory (like `title`).
        const query = typeof p.query === 'string' ? p.query.trim().slice(0, 200) : ''
        if (!query) {
          drop(type, 'empty query')
          continue
        }
        out.push({ type, params: { query } })
        keep(type, `"${query}"`)
        break
      }
      case 'open_workspace': {
        const filters = sanitizeGridFilters(p.filters)
        if (!filters) {
          drop(type, 'no valid filters after sanitization')
          continue
        }
        // Two workspace CTAs are legitimate when they open DIFFERENT sets (e.g.
        // "colour portraits" vs "b&w non-portraits"), but an exact repeat renders
        // as two identical chips — drop it. Sanitization is deterministic, so
        // equal filters ⇒ equal JSON.
        const fingerprint = JSON.stringify(filters)
        if (
          out.some(
            (kept) =>
              kept.type === 'open_workspace' && JSON.stringify(kept.params.filters) === fingerprint
          )
        ) {
          drop(type, 'duplicate of an earlier workspace action')
          continue
        }
        out.push({ type, params: { filters } })
        keep(type, fingerprint)
        break
      }
      case 'open_view': {
        const view = String(p.view)
        if (!VIEW_SET.has(view)) {
          drop(type, `unknown view "${view}"`)
          continue
        }
        const params: Record<string, any> = { view }
        // views that need a specific, owned id (+ its display name)
        if (view === 'portfolio') {
          const id = Number(p.id)
          if (!portfolioName.has(id)) {
            drop(type, `unknown portfolio id ${p.id}`)
            continue
          }
          params.id = id
          params.name = portfolioName.get(id)
        } else if (view === 'collection') {
          const id = Number(p.id)
          if (!collectionName.has(id)) {
            drop(type, `unknown collection id ${p.id}`)
            continue
          }
          params.id = id
          params.name = collectionName.get(id)
          const filters = sanitizeGridFilters(p.filters)
          if (filters) params.filters = filters
        } else if (view === 'series') {
          const id = Number(p.id)
          if (!seriesName.has(id)) {
            drop(type, `unknown series id ${p.id}`)
            continue
          }
          params.id = id
          params.name = seriesName.get(id)
        }
        out.push({ type, params })
        keep(type, view)
        break
      }
      default:
        drop(type, 'not in the catalog')
        continue
    }
    if (out.length >= MAX_ACTIONS) break
  }

  return { actions: out, trace }
}
