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
   * a mislabeled/hallucinated CTA structurally impossible. The only free text
   * the LLM contributes is `params.title` for creations (a resource name).
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
# ACTION CATALOG — pick 2-3, most useful first. Fill params ONLY from the provided inventory.

IMPORTANT — the chat only shows a CURATED HANDFUL, never the full result set. When the user's message THIS turn was itself a request to find/see photos of some subject ("encontrar fotos de…", "muéstrame fotos de…", "fotos donde hay…", "photos of/with X"), you MUST include a search_photos for that subject, EVEN THOUGH the assistant already displayed a few — clicking it opens the FULL library search for that content, not the 2-3 curated shots. Do not assume the request is "done" just because some photos are on screen. This is usually the single most useful action in that situation, so put it FIRST.

Match the action to the user's intent:
- To FIND PHOTOS BY CONTENT — a concrete subject, object, scene, style, mood, place-as-content ("photos of/with X", "my street shots", "shots in the rain", "anything with red") → search_photos. This runs a semantic search over what the photos actually DEPICT. Derive the query from what the user was looking for (translate their request into a short search phrase in their language).
- To ORGANIZE the surfaced photos → create_collection / create_series / create_canvas / add_to_collection / add_to_series.
- To FIND PHOTOS BY ARTISTIC QUALITY OR VISUAL ASPECT — rank/threshold by the artistic scores and/or filter by the closed visual-aspect facets ("my best X", "which score high on composition", "my black and white street shots", "backlit photos with bokeh") → open_workspace. This ranks/filters the library by SCORE and by ASPECT metadata; it does not search by content.
  Rule of thumb: "photos OF/WITH/IN <a subject>" → search_photos. "my BEST/WORST, or filtered by an aspect below" → open_workspace.
- To ANSWER AN AGGREGATE question about the catalog as a whole (statistics, distributions, recurring patterns, "how does my work compare", how common/rare something is across everything) → open_view (report / tagcloud / world-map). This is for numbers and patterns, NOT for pulling up a set of matching photos.
- To inspect how ONE specific photo fits → view_photo. Do NOT default to archiving a photo when the user only asked to understand it.

Photo selection for the actions below (photoIds / groupLabels):
- If SHOWN PHOTOS are presented as GROUPS this turn: set \`groupLabels\` to the group name(s) whose photos should go in — copy the label text exactly. Do NOT also set photoIds and do NOT list individual photo IDs; the app resolves each label to its group's photos for you. Omit a group's label to leave its photos out (e.g. a group of rejected/discarded photos).
- If SHOWN PHOTOS are a flat list (no groups): set \`photoIds\` to the photo IDs to include.

## create_collection
When: the assistant surfaced a set of photos worth grouping thematically (unordered).
params: { title: string, photoIds?: number[], groupLabels?: string[] }   // title = a short, evocative name you propose

## create_series
When: the photos form an ordered narrative sequence / photo essay. A single photo is fine — a series can be seeded with one and grown later.
params: { title: string, photoIds?: number[], groupLabels?: string[] }   // keep photoIds in the narrative order you intend (when used)
Pairing bias: whenever you propose create_series, ALSO propose create_canvas for the same photos. They are sibling organizing tools (a narrative sequence vs. a free-form board of the same set), so offering both lets the user pick their preferred layout. This pairing is a deliberate EXCEPTION to the "prefer variety" rule — series + canvas of the same photos is expected here, not redundant.

## create_canvas
When: the user would benefit from arranging these photos freely on a visual board. Also the natural companion to create_series (see its pairing bias).
params: { title: string, photoIds?: number[], groupLabels?: string[] }

## add_to_collection
When: the photos belong in an EXISTING collection the user already has.
params: { collectionId: number, photoIds?: number[], groupLabels?: string[] }   // collectionId MUST be from the inventory

## add_to_series
When: the photos extend an EXISTING series.
params: { seriesId: number, photoIds?: number[], groupLabels?: string[] }        // seriesId MUST be from the inventory

## search_photos
When: the user wants to pull up photos that DEPICT something concrete — a subject, object, scene, style, mood, or place-as-content. Runs a broad semantic search over the WHOLE library on the query text. Use this, NOT open_workspace, whenever the need is about WHAT IS IN the photo rather than its score.
Strong trigger: the user's own message this turn asked to find/see photos of a subject. Propose it even when the assistant already showed a few — the assistant curates 2-3, this opens EVERYTHING matching. In that case it's the top action.
params: { query: string }   // query = a short search phrase in the USER'S LANGUAGE capturing the subject the user wants. Distill it to the core content, dropping meta-words like "encontrar/fotos de". e.g. user "necesito encontrar fotos de temperatura fría donde hay perros" → query "perros en la nieve"; "muéstrame retratos en blanco y negro" → query "retratos en blanco y negro"; "brutalist architecture" → query "brutalist architecture". No filters, no scores — just the thing to look for.
Scope: this is a pure content search — it cannot rank by artistic score or filter by visual aspect. If the user only wants their "best/worst", or a visual-aspect filter with no subject, use open_workspace instead.

## open_workspace
When: the user wants to RANK / THRESHOLD their library by artistic quality ("show me my best X", "which photos score high on Y"), and/or FILTER it by the visual aspects below ("my black and white photos", "long exposure landscapes", "my best backlit portraits"). This is about SCORE + ASPECT metadata, not content — for "photos of/with/in <a subject>" use search_photos. Prefer this over the report whenever the user wants to end up looking at matching PHOTOS rather than statistics.
Overwrites any current workspace filters.
One action carries filters + ranking TOGETHER, so put everything a single request needs into one \`filters\` object — never split one intent across two chips. Only propose a second open_workspace when it opens a genuinely DIFFERENT set of photos (e.g. one for colour portraits, another for b&w non-portraits).
params: { filters: GridFilters }
  GridFilters = {
    sort?:        { field: <score criterion>, dir: "asc"|"desc" },
    genrePreset?: <"general"|"street"|"documentary"|"abstract"|"commercial">,   // don't combine with sort
    scoreFilters?: [ { field: <score criterion>, op: "gte"|"lte", value: 1-10 } ],
    visualAspects?: [ { aspect: <aspect>, values: [<value of that aspect>, …] } ]
  }
  score criteria: aesthetic_quality, composition, storytelling, originality, message, humor, visual_games, candidness (commercial profiles also: commercial_intent, subject_clarity)
  visual aspects (a photo must match EVERY listed aspect; within one aspect its values are alternatives — OR):
${FILTERABLE_ASPECT_KEYS.map((k) => `    - ${k}: ${ASPECT_VALUES[k].join(', ')}`).join('\n')}
  Use the EXACT value strings above — anything else is dropped. Only these four aspects exist here; there is no filter for framing, perspective, temperature, orientation or depth of field.
  Note "genre" the aspect (a per-photo label you FILTER by) is not the same as "genrePreset" (a score-weighting recipe you RANK by). "show me my street photos" → visualAspects genre:[street]. "rank my street photos the way a street photographer would" → genrePreset street.
  Capability scope: ranking/thresholding by the artistic scores and filtering by the four aspects above — that is its ENTIRE expressivity. If the user's need is about subject matter, tags, location, dates or a mood outside those values, this action cannot serve it; pick a different action or none. Aspect filters combine freely with sorting/score thresholds: "my best black and white portraits" → visualAspects genre:[portrait] + palette:[black and white], sorted by aesthetic_quality desc.

## view_photo
When: inspect ONE specific photo in context.
params: { photoId: number, view: "2d" }       // photoId MUST be one just shown
  view "2d":  place the photo among its visually-similar neighbours on the semantic atlas — the visual answer to "is this photo unusual or typical? how does it sit among similar shots? is it a rarity or a recurring pattern?"

## open_view
When: a dedicated tool answers the user's need better than chat (redirect).
Report tabs are for AGGREGATE insight only — statistics, distributions, recurring patterns across the whole catalog. Do NOT suggest a report tab as a way to FIND or LIST photos that match some criteria; that is open_workspace's job. If the user's intent is "search / show me the photos that…", pick open_workspace (or none), not a report tab.
params: { view: <target>, id?: number, filters?: GridFilters }
  targets:
    "report"      — Report & Statistics: aggregate insight across the whole catalog — narrative/stylistic patterns, visual-aspect charts (colour, genre, lighting), tag distribution, and artistic-score charts. Use for "is this rare / a recurring pattern / how does my work compare / how common is X".
  Other targets:
    "tagcloud"    — browse the catalog by subject/tag frequency.
    "world-map"   — where photos were taken.
    "collections" — the user's collections list; "collection"(needs id + optional filters) opens one.
    "series-list" — the user's series list; "series"(needs id) opens one.
    "portfolios"  — the user's portfolios list; "portfolio"(needs id) opens one.

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
          type: strEnum([
            'create_collection',
            'create_series',
            'create_canvas',
            'add_to_collection',
            'add_to_series',
            'search_photos',
            'open_workspace',
            'view_photo',
            'open_view',
          ]),
          params: {
            type: 'OBJECT',
            description: 'Typed slots — fill ONLY the ones the chosen action needs (see catalog).',
            properties: {
              title: { type: 'STRING', description: 'Resource name for create_* (user language).' },
              query: {
                type: 'STRING',
                description: 'Content search phrase for search_photos (user language).',
              },
              photoIds: { type: 'ARRAY', items: { type: 'INTEGER' } },
              groupLabels: { type: 'ARRAY', items: { type: 'STRING' } },
              collectionId: { type: 'INTEGER' },
              seriesId: { type: 'INTEGER' },
              photoId: { type: 'INTEGER' },
              id: {
                type: 'INTEGER',
                description: 'Owned id for open_view portfolio/collection/series.',
              },
              // `view` is shared by view_photo ("2d") and open_view (VIEW_TARGETS);
              // validateActions disambiguates by action type.
              view: strEnum(['2d', ...VIEW_TARGETS]),
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
export type ActionsGroundingContext = {
  /** Photos the assistant actually surfaced this turn (photoGroups + attached). */
  photos: Array<{ id: number; filename: string }>
  /** Groups as shown to the user this turn (empty when the assistant returned a flat list). */
  photoGroups: Array<{ label: string; photoIds: number[] }>
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

/**
 * Drops or repairs any action whose slots don't ground against the real
 * inventory. Returns only actions safe to hand to the frontend.
 */
export function validateActions(
  rawActions: any[],
  ctx: ActionsGroundingContext
): SuggestedAction[] {
  if (!Array.isArray(rawActions)) return []
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
   * Resolves the photo selection for create/add-to actions, in order of intent:
   *   1. `groupLabels` — the intended path when the turn had real groups; the LLM
   *      names groups and we look up their IDs so it can't drift from what was shown.
   *   2. raw `photoIds` — common under structured output, where `photoIds` is a
   *      prominent slot; grounded to shown photos so it can't reference unseen ones.
   *   3. every shown photo — last-resort default when the model specified neither a
   *      matching label nor a valid ID (e.g. it mislabeled a group, or emitted the
   *      wrong slot for a single attached photo). This is the documented default
   *      ("include every group") and is safe because all ids are grounded. Without
   *      it, a resolvable, well-intentioned action would be dropped SILENTLY.
   */
  const resolvePhotoIds = (p: any): number[] => {
    if (ctx.photoGroups.length > 0 && Array.isArray(p.groupLabels) && p.groupLabels.length > 0) {
      const labels = p.groupLabels.map((l: any) => String(l).trim().toLowerCase())
      const ids = new Set<number>()
      for (const group of ctx.photoGroups) {
        if (labels.includes(group.label.trim().toLowerCase())) {
          for (const id of group.photoIds) ids.add(id)
        }
      }
      const resolved = groundPhotoIds([...ids])
      if (resolved.length > 0) return resolved
    }
    const direct = groundPhotoIds(asIntArray(p.photoIds))
    if (direct.length > 0) return direct
    return groundPhotoIds(ctx.photos.map((ph) => ph.id))
  }

  const out: SuggestedAction[] = []

  for (const a of rawActions) {
    if (!a || typeof a !== 'object') continue
    const type = String(a.type) as SuggestedActionType
    const p = a.params && typeof a.params === 'object' ? a.params : {}

    switch (type) {
      case 'create_collection':
      case 'create_series':
      case 'create_canvas': {
        const title = typeof p.title === 'string' ? p.title.trim().slice(0, 100) : ''
        const photoIds = resolvePhotoIds(p)
        if (!title || photoIds.length === 0) continue
        out.push({ type, params: { title, photoIds } })
        break
      }
      case 'add_to_collection': {
        const collectionId = Number(p.collectionId)
        if (!collectionName.has(collectionId)) continue
        const photoIds = dropExistingMembers(
          resolvePhotoIds(p),
          ctx.collectionMembership,
          collectionId
        )
        if (photoIds.length === 0) continue
        out.push({
          type,
          params: { collectionId, collectionName: collectionName.get(collectionId), photoIds },
        })
        break
      }
      case 'add_to_series': {
        const seriesId = Number(p.seriesId)
        if (!seriesName.has(seriesId)) continue
        const photoIds = dropExistingMembers(resolvePhotoIds(p), ctx.seriesMembership, seriesId)
        if (photoIds.length === 0) continue
        out.push({
          type,
          params: { seriesId, seriesName: seriesName.get(seriesId), photoIds },
        })
        break
      }
      case 'search_photos': {
        // Free-text content search — no grounding against inventory (like `title`).
        const query = typeof p.query === 'string' ? p.query.trim().slice(0, 200) : ''
        if (!query) continue
        out.push({ type, params: { query } })
        break
      }
      case 'open_workspace': {
        const filters = sanitizeGridFilters(p.filters)
        if (!filters) continue
        // Two workspace CTAs are legitimate when they open DIFFERENT sets (e.g.
        // "colour portraits" vs "b&w non-portraits"), but an exact repeat renders
        // as two identical chips — drop it. Sanitization is deterministic, so
        // equal filters ⇒ equal JSON.
        const fingerprint = JSON.stringify(filters)
        if (
          out.some((a) => a.type === 'open_workspace' && JSON.stringify(a.params.filters) === fingerprint)
        ) {
          continue
        }
        out.push({ type, params: { filters } })
        break
      }
      case 'view_photo': {
        const photoId = Number(p.photoId)
        if (!photoName.has(photoId)) continue
        out.push({ type, params: { photoId, filename: photoName.get(photoId), view: '2d' } })
        break
      }
      case 'open_view': {
        const view = String(p.view)
        if (!VIEW_SET.has(view)) continue
        const params: Record<string, any> = { view }
        // views that need a specific, owned id (+ its display name)
        if (view === 'portfolio') {
          const id = Number(p.id)
          if (!portfolioName.has(id)) continue
          params.id = id
          params.name = portfolioName.get(id)
        } else if (view === 'collection') {
          const id = Number(p.id)
          if (!collectionName.has(id)) continue
          params.id = id
          params.name = collectionName.get(id)
          const filters = sanitizeGridFilters(p.filters)
          if (filters) params.filters = filters
        } else if (view === 'series') {
          const id = Number(p.id)
          if (!seriesName.has(id)) continue
          params.id = id
          params.name = seriesName.get(id)
        }
        out.push({ type, params })
        break
      }
      default:
        continue
    }
    if (out.length >= 3) break
  }

  return out
}
