/**
 * chat_actions_service.ts
 * -----------------------------------------------------------------
 * Phase 3 — the "action suggester".
 *
 * A cheap, single-shot LLM that reads the last few chat turns + the photos the
 * assistant just surfaced + the user's real library items, and proposes 2-3
 * concrete, clickable actions from the closed catalog in chat_actions_catalog.ts.
 *
 * It carries NO tooling context and produces NO prose — only typed action slots,
 * which are then validated against the real inventory before being returned.
 * This is intentionally decoupled from Phase 1/2 (langchain_agent_service.ts):
 * Phase 2 is now a pure curator and no longer suggests next steps.
 *
 * Two interchangeable engines produce the raw actions (CHAT_ACTIONS_ENGINE):
 *   • LLM — one Gemini call with the catalog as prompt and structured JSON output.
 *   • JEV — TypeSafe AI's non-autoregressive classifier: one typed question per
 *     candidate action over the same context (utils/chat_actions_jev.ts). It cannot
 *     write text, so when it wants a `search_photos` a small Gemini call writes the
 *     query phrase. Degrades to LLM without a key or on failure.
 * Both feed `validateActions`, so grounding is identical whichever engine ran.
 * -----------------------------------------------------------------
 */

import Collection from '#models/collection'
import Series from '#models/series'
import PortfolioBuild from '#models/portfolio_build'
import Photo from '#models/photo'
import db from '@adonisjs/lucid/services/db'
import ModelsService from '../models_service.js'
import ConversationService from './conversation_service.js'
import {
  ACTIONS_CATALOG,
  SUGGESTED_ACTIONS_SCHEMA,
  validateActions,
  type SuggestedAction,
  type ActionsGroundingContext,
  type GroundedPhotoGroup,
} from '../../utils/chat_actions_catalog.js'
import {
  buildJevActionsRequest,
  parseJevActionsAnswers,
  rankJevActionCandidates,
  type JevActionsInput,
} from '../../utils/chat_actions_jev.js'
import { isJevConfigured, resolveJevProvider } from '../../utils/jev_provider.js'

const PHASE3_MODEL = 'gemini-3.1-flash-lite'

export enum ChatActionsEngine {
  LLM = 'LLM',
  JEV = 'JEV',
}

/**
 * Engine selected by CHAT_ACTIONS_ENGINE (LLM | JEV). Defaults to JEV, which itself
 * degrades to LLM when the Jev provider has no API key (see utils/jev_provider.ts).
 */
export function defaultChatActionsEngine(): ChatActionsEngine {
  const raw = (process.env.CHAT_ACTIONS_ENGINE ?? '').trim().toUpperCase()
  return (Object.values(ChatActionsEngine) as string[]).includes(raw)
    ? (raw as ChatActionsEngine)
    : ChatActionsEngine.JEV
}

/** The turn as both engines see it: raw Lucid rows plus the grounded groups. */
interface SuggesterTurn {
  assistantText: string
  historyText: string
  photos: any[]
  photoGroups: GroundedPhotoGroup[]
  collections: any[]
  series: any[]
  portfolios: any[]
}

/** What the LLM and Jev engines both return; `validateActions` takes it from here. */
interface RawSuggestion {
  rawActions: any[]
  costEur: number
  engine: ChatActionsEngine
  /** Model id(s) that ran, "+"-joined when more than one, for the cost log. */
  model: string
}

const JEV_MODEL = 'jev-latest'

const SEARCH_QUERY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    query: { type: 'STRING', description: 'The search phrase, in the user language.' },
  },
  required: ['query'],
}

const SEARCH_QUERY_PROMPT = `You write ONE search phrase for the semantic photo search of a photography app (Photoreka).

The app has already decided that a content search over the user's whole library is the right next step. Your only job is the phrase.

- The search runs against image embeddings, so the phrase must name something VISIBLE in a photo: a subject, object, scene, style, atmosphere or place as content.
- Write it in THE USER'S LANGUAGE, as they would type it.
- Translate figurative wording into a concrete visual phrase ("hidden gems" -> "nice photos with interesting details").
- Keep it short: a subject, not a sentence. No quality words ("best", "worst"), no filters, no explanations.

Respond ONLY with valid JSON: { "query": "..." }`

/**
 * How many shown photos an action may COVER (bounds the ownership query). Spent at
 * WHOLE-GROUP granularity: a partially-grounded group would let the suggester pick
 * "group #2" and silently get fewer photos than the user saw under that heading.
 *
 * Deliberately decoupled from the prompt-size guards below. The suggester scopes a
 * grouped turn by group NUMBER, so it doesn't need to see every photo of a big group
 * to include it — which means a big group costs tokens, not correctness.
 */
const MAX_GROUNDED_PHOTOS = 200
/** How many photos get an id+filename line in the prompt (across the whole turn). */
const MAX_LISTED_PHOTOS = 40
/** Of those, how many also carry a description snippet. */
const MAX_DESCRIBED_PHOTOS = 24
/** Max library items of each type injected as inventory. */
const MAX_INVENTORY_ITEMS = 20
/** Label of the synthetic group holding photos the user attached to their message. */
const ATTACHED_GROUP_LABEL = 'Photos you attached'
/**
 * Below this, a board isn't worth offering: a canvas is for arranging a set against
 * itself, and two or three photos are not a set — they're just photos.
 */
const MIN_CANVAS_PHOTOS = 4

const SYSTEM_PROMPT = `You suggest concrete next actions for a photography app (Photoreka) after the assistant replied.

## Your job
From the conversation and the concrete items provided, pick up to 3 useful, specific actions from the ACTION CATALOG. Fewer is better than forced. Return an empty array if nothing genuinely helps — the user is separately offered a canvas board of the whole selection, so a weak suggestion adds noise rather than value.

## Hard rules
- Choose ONLY action types from the catalog. Fill every param slot ONLY with IDs/values from the provided inventory (shown photos, the user's collections/series/portfolios, the listed enums). NEVER invent a photo ID, collection/series/portfolio ID, filename, tag, or filter value.
- Photo actions must reference photos from "SHOWN PHOTOS" (the ones the assistant just displayed or the user attached). If no photos were shown, don't propose photo-based actions — you may still propose a redirect (open_workspace / open_view) when relevant.
- **Selecting which photos go into a create/add-to action — ONE GROUP PER ACTION:** the photos are shown to you as numbered GROUPS (as the user actually saw them), not a flat pool.
  - When groups exist: set \`groupId\` to the NUMBER of the ONE group the action is about (the N in \`Group #N\`). Do NOT set \`photoIds\` — it is ignored on a grouped turn.
    - You cannot merge groups. A collection/series is built from exactly one group and takes that group's name. If two groups each deserve an action, that is two actions.
    - You cannot cherry-pick photos out of a group: it goes in whole or not at all.
    - A group marked REJECTED is the assistant's discard pile: never name it. The app refuses it anyway.
  - When there are no groups (flat list, or only user-attached photos): set \`photoIds\` directly.
- Prefer variety: don't propose three near-identical actions. A create + an explore + a redirect is better than three "create" variants.
- **You never write text.** No button labels, no resource names: the app composes every visible word from a fixed template plus the group's own name. There is no \`title\` slot. The single exception is \`query\` for search_photos, which is a search phrase, not a name. Pick an action ONLY if its params can fully express the intent; if they can't, choose a different action or none.
- Never propose a canvas, and never propose opening a single photo — a board over the whole selection, and the atlas view of a lone attached photo, are offered to the user automatically.

## Output
Respond ONLY with valid JSON: { "actions": [ { "type": ..., "params": { ... } } ] }

${ACTIONS_CATALOG}`

export default class ChatActionsService {
  private static warnedMissingJevKey = false
  private modelsService = new ModelsService()

  private withUsageState(actions: SuggestedAction[] | any[]): SuggestedAction[] {
    if (!Array.isArray(actions)) return []
    return actions.map((a: any) => ({
      ...a,
      used: a?.used === true,
    }))
  }

  /**
   * Generate grounded action suggestions for the latest assistant turn.
   *
   * @returns the validated actions plus the LLM cost in EUR.
   */
  public async generateActions(params: {
    userId: number
    assistantText: string
    /** photo groups as actually shown to the user this turn (stable id + label + ordered photoIds). */
    shownPhotoGroups: Array<{ id?: number; label: string; photoIds: number[]; rejected?: boolean }>
    /** photos the user attached to their message this turn (not part of any group). */
    attachedPhotoIds: number[]
    /** the curator's name for this turn's whole selection — the suggester writes no names. */
    selectionTitle: string
    /** compact prior-turns context (already thinned). */
    historyText: string
  }): Promise<{ actions: SuggestedAction[]; costEur: number; model: string | null }> {
    const {
      userId,
      assistantText,
      shownPhotoGroups,
      attachedPhotoIds,
      selectionTitle,
      historyText,
    } = params

    // The turn is EITHER grouped or flat, and the two are resolved by different slots
    // (groupId vs photoIds). Deciding that here, once, is what keeps the suggester from
    // silently widening an action's scope to every photo on screen.
    const photoGroups = this.buildGroundedGroups(shownPhotoGroups, attachedPhotoIds)
    const availablePhotoIds =
      photoGroups.length > 0
        ? [...new Set(photoGroups.flatMap((g) => g.photoIds))]
        : [...new Set(attachedPhotoIds)].slice(0, MAX_GROUNDED_PHOTOS)

    // ── Gather real inventory in parallel ──
    const [photos, collections, series, portfolios] = await Promise.all([
      availablePhotoIds.length > 0
        ? Photo.query()
            .whereIn('id', availablePhotoIds)
            .where('user_id', userId)
            .select(['id', 'original_file_name', 'descriptions'])
        : Promise.resolve([]),
      Collection.query()
        .where('user_id', userId)
        .select(['id', 'name'])
        .orderBy('updated_at', 'desc')
        .limit(MAX_INVENTORY_ITEMS),
      Series.query()
        .where('user_id', userId)
        .select(['id', 'name'])
        .orderBy('updated_at', 'desc')
        .limit(MAX_INVENTORY_ITEMS),
      PortfolioBuild.query()
        .where('user_id', userId)
        .where('status', 'completed')
        .orderBy('updated_at', 'desc')
        .limit(MAX_INVENTORY_ITEMS),
    ])

    // Which of the shown photos already live in the inventory collections/series, so
    // validateActions can drop an add_to_* whose photos are ALL already members.
    const { collectionMembership, seriesMembership } = await this.loadMembership(
      availablePhotoIds,
      collections.map((c: any) => c.id),
      series.map((s: any) => s.id)
    )

    const ctx: ActionsGroundingContext = {
      photos: photos.map((p: any) => ({ id: p.id, filename: p.originalFileName ?? 'photo' })),
      photoGroups,
      selectionTitle,
      collections: collections.map((c: any) => ({ id: c.id, name: c.name })),
      series: series.map((s: any) => ({ id: s.id, name: s.name })),
      portfolios: portfolios.map((p: any) => ({
        id: p.id,
        name: p.config?.name ?? `Portfolio ${p.id}`,
      })),
      collectionMembership,
      seriesMembership,
    }

    // No grounding surface at all → nothing worth suggesting.
    if (
      ctx.photos.length === 0 &&
      ctx.collections.length === 0 &&
      ctx.series.length === 0 &&
      ctx.portfolios.length === 0
    ) {
      // Still allow pure redirects (open_workspace / open_view non-id targets),
      // so we don't early-return here — but if the assistant text is trivial, skip.
      if (!assistantText || assistantText.trim().length < 20) {
        return { actions: [], costEur: 0, model: null }
      }
    }

    const turn = { assistantText, historyText, photos, photoGroups, collections, series, portfolios }
    const { rawActions, costEur, engine, model } = await this.suggest(
      turn,
      defaultChatActionsEngine()
    )

    const { actions: grounded, trace } = validateActions(rawActions, ctx)
    const withPhotoView = this.appendSinglePhotoViewAction(grounded, ctx, attachedPhotoIds, trace)
    const withCanvas = this.appendCanvasAction(withPhotoView, ctx, trace)
    const actions = this.withUsageState(withCanvas)

    console.log(
      `[ChatActions] ✅ ${actions.length} action(s) after grounding ` +
        `(from ${Array.isArray(rawActions) ? rawActions.length : 0} raw, engine=${engine}) | €${costEur.toFixed(6)}` +
        ` | groups=[${photoGroups
          .map((g) => `#${g.id} "${g.label}"(${g.photoIds.length}${g.rejected ? ',rejected' : ''})`)
          .join(' ')}]`
    )
    // Per-action outcome: which slot resolved its photo scope, or why it was dropped.
    // Without this, an action that quietly widened to every shown photo looks identical
    // to one the model scoped on purpose.
    for (const line of trace) console.log(`[ChatActions]    ${line}`)

    return { actions, costEur, model }
  }

  // ═══════════════════════════════════════════════════════
  //  Suggester engines — both return raw actions for validateActions
  // ═══════════════════════════════════════════════════════

  private async suggest(turn: SuggesterTurn, engine: ChatActionsEngine): Promise<RawSuggestion> {
    if (engine === ChatActionsEngine.JEV) {
      if (!isJevConfigured()) {
        if (!ChatActionsService.warnedMissingJevKey) {
          ChatActionsService.warnedMissingJevKey = true
          console.warn(
            `[ChatActions] engine=JEV requested but provider "${resolveJevProvider().name}" has no API key → LLM`
          )
        }
        return this.suggestWithLLM(turn)
      }
      try {
        return await this.suggestWithJev(turn)
      } catch (err: any) {
        console.warn(`[ChatActions] engine=JEV failed (${err?.message ?? err}) → falling back to LLM`)
      }
    }
    return this.suggestWithLLM(turn)
  }

  /** One Gemini call: catalog as prompt, structured JSON output. Never throws. */
  private async suggestWithLLM(turn: SuggesterTurn): Promise<RawSuggestion> {
    const engine = ChatActionsEngine.LLM
    const userContent = this.buildUserContent(turn)
    try {
      const res = await this.modelsService.getGeminiResponse(
        SYSTEM_PROMPT,
        [userContent],
        PHASE3_MODEL,
        {
          temperature: 0.3,
          // Structured output: force valid JSON with in-catalog enum values.
          // validateActions still enforces per-action shape + grounding.
          responseMimeType: 'application/json',
          responseSchema: SUGGESTED_ACTIONS_SCHEMA,
        },
        false // no cache — suggestions are turn-specific
      )
      const raw = res?.result
      return {
        rawActions: Array.isArray(raw) ? raw : (raw?.actions ?? []),
        costEur: res?.cost?.totalCostInEur ?? 0,
        engine,
        model: PHASE3_MODEL,
      }
    } catch (err: any) {
      console.warn('[ChatActions] ⚠️  Phase 3 generation failed:', err?.message ?? err)
      return { rawActions: [], costEur: 0, engine, model: PHASE3_MODEL }
    }
  }

  /**
   * One Jev request: a typed question per candidate action over the turn's state, read
   * back into raw actions ordered most-useful-first. Throws on a Jev failure so the
   * caller falls back to the LLM engine.
   *
   * `search_photos` needs a phrase Jev cannot write: when its noul passes, a small
   * Gemini call writes the query, and the action takes the rank Jev's probability gives
   * it. A failed query write drops only that action.
   */
  private async suggestWithJev(turn: SuggesterTurn): Promise<RawSuggestion> {
    const engine = ChatActionsEngine.JEV
    let described = 0
    const input: JevActionsInput = {
      assistantText: turn.assistantText,
      historyText: turn.historyText,
      photos: turn.photos.map((p: any) => ({
        id: p.id,
        filename: p.originalFileName ?? 'photo',
        snippet:
          described++ < MAX_DESCRIBED_PHOTOS ? this.firstSentence(p.descriptions?.context ?? '') : '',
      })),
      photoGroups: turn.photoGroups,
      collections: turn.collections.map((c: any) => ({ id: c.id, name: c.name ?? '' })),
      series: turn.series.map((s: any) => ({ id: s.id, name: s.name ?? '' })),
      portfolios: turn.portfolios.map((p: any) => ({
        id: p.id,
        name: p.config?.name ?? `Portfolio ${p.id}`,
      })),
      maxListedPhotos: MAX_LISTED_PHOTOS,
    }

    const { state, questions } = buildJevActionsRequest(input)
    const res = await this.modelsService.getJevResponse(
      state,
      questions,
      JEV_MODEL,
      false, // no cache — suggestions are turn-specific
      true // throwOnError — the caller falls back to the LLM engine
    )
    let costEur = res?.cost?.totalCostInEur ?? 0
    const models: string[] = [String(res?.model ?? JEV_MODEL)]

    const { candidates, search } = parseJevActionsAnswers(res?.result, input)
    if (search.offer) {
      const written = await this.writeSearchQuery(turn)
      costEur += written.costEur
      if (written.model) models.push(written.model)
      if (written.query) {
        candidates.push({
          type: 'search_photos',
          params: { query: written.query },
          probability: search.probability,
          family: 'search',
        })
      }
    }

    const ranked = rankJevActionCandidates(candidates)
    console.log(
      `[ChatActions] engine=JEV ${Object.keys(questions).length} question(s) → ` +
        ranked.map((c) => `${c.type}@${c.probability.toFixed(2)}`).join(' ')
    )
    return {
      rawActions: ranked.map(({ type, params }) => ({ type, params })),
      costEur,
      engine,
      model: models.join('+'),
    }
  }

  /** The one thing Jev cannot do: write the `search_photos` phrase. Never throws. */
  private async writeSearchQuery(
    turn: SuggesterTurn
  ): Promise<{ query: string | null; costEur: number; model: string | null }> {
    const lines: string[] = []
    if (turn.historyText.trim()) lines.push('## RECENT CONVERSATION', turn.historyText.trim(), '')
    lines.push("## ASSISTANT'S LATEST REPLY", turn.assistantText.trim().slice(0, 2000))
    try {
      const res = await this.modelsService.getGeminiResponse(
        SEARCH_QUERY_PROMPT,
        [lines.join('\n')],
        PHASE3_MODEL,
        {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: SEARCH_QUERY_SCHEMA,
        },
        false
      )
      const query = typeof res?.result?.query === 'string' ? res.result.query.trim() : ''
      return {
        query: query || null,
        costEur: res?.cost?.totalCostInEur ?? 0,
        model: String(res?.model ?? PHASE3_MODEL),
      }
    } catch (err: any) {
      console.warn('[ChatActions] ⚠️  search query write failed:', err?.message ?? err)
      return { query: null, costEur: 0, model: null }
    }
  }

  /**
   * Appends "place this photo on the atlas" whenever the user attached exactly ONE photo.
   *
   * Same reasoning as the canvas board: the scope isn't a judgment call. A turn built around
   * a single attached photo is a question about THAT photo, and there is exactly one photo the
   * action could be about — nothing for the suggester to decide, only to forget, which it
   * regularly did. So `view_photo` is off the suggester's menu entirely (like create_canvas)
   * and offered here instead, unconditionally.
   *
   * A single attached photo is below MIN_CANVAS_PHOTOS, so in practice this rides in the slot
   * the board would otherwise have taken rather than adding a fifth chip.
   */
  private appendSinglePhotoViewAction(
    actions: SuggestedAction[],
    ctx: ActionsGroundingContext,
    attachedPhotoIds: number[],
    trace: string[]
  ): SuggestedAction[] {
    const attached = [...new Set(attachedPhotoIds)]
    if (attached.length !== 1) return actions

    // Grounded = the photo survived the ownership query, so it really is the user's.
    const photo = ctx.photos.find((p) => p.id === attached[0])
    if (!photo) return actions

    trace.push(`✓ view_photo — photo ${photo.id} [programmatic]`)
    return [
      ...actions,
      { type: 'view_photo', params: { photoId: photo.id, filename: photo.filename, view: '2d' } },
    ]
  }

  /**
   * Appends the "arrange these on a board" action — the one organizing action the LLM
   * does NOT choose.
   *
   * A canvas is the only create whose scope isn't a judgment call: a board over everything
   * the assistant just showed is always coherent, so there was nothing for the suggester to
   * decide and plenty for it to get wrong (it merged four groups into a series named after
   * one of them). Here the scope is "the whole non-rejected selection" by construction and
   * the name is the curator's own title for it.
   *
   * Always appended when the selection is big enough to be worth arranging — it rides
   * ALONGSIDE the suggester's picks rather than competing for one of their slots. That's
   * why MAX_ACTIONS caps the suggester, not this.
   */
  private appendCanvasAction(
    actions: SuggestedAction[],
    ctx: ActionsGroundingContext,
    trace: string[]
  ): SuggestedAction[] {
    const title = ctx.selectionTitle?.trim().slice(0, 100)
    if (!title) {
      trace.push('· create_canvas — skipped: the curator gave no name for the selection')
      return actions
    }

    const shown = new Set(ctx.photos.map((p) => p.id))
    const photoIds =
      ctx.photoGroups.length > 0
        ? [
            ...new Set(
              ctx.photoGroups.filter((g) => !g.rejected).flatMap((g) => g.photoIds)
            ),
          ].filter((id) => shown.has(id))
        : ctx.photos.map((p) => p.id)

    if (photoIds.length < MIN_CANVAS_PHOTOS) {
      if (photoIds.length > 0) {
        trace.push(
          `· create_canvas — skipped: only ${photoIds.length} photo(s), a board needs ${MIN_CANVAS_PHOTOS}`
        )
      }
      return actions
    }

    trace.push(`✓ create_canvas — "${title}" · ${photoIds.length} photo(s) [programmatic]`)
    return [...actions, { type: 'create_canvas', params: { title, photoIds } }]
  }

  /**
   * Normalizes the turn's photo groups into the stable, integer-addressed groups that
   * Phase 3 selects with (`groupId`).
   *
   * - Legacy messages persisted before groups had ids get `index + 1`, which is exactly
   *   the id they would have been assigned at creation.
   * - Photos the user attached that belong to no assistant group are folded in as a
   *   synthetic trailing group, so a grouped turn has ONE selection mechanism and the
   *   attached photos remain includable/excludable like any other set.
   * - The photo budget is spent on WHOLE groups: a group that doesn't fit is dropped
   *   with a warning rather than truncated, because a half-listed group would make
   *   "include group #2" mean something different to the model than it did to the user.
   *
   * Returns [] when the assistant showed no groups — that's a flat turn, resolved by
   * `photoIds` instead.
   */
  private buildGroundedGroups(
    shownPhotoGroups: Array<{ id?: number; label: string; photoIds: number[]; rejected?: boolean }>,
    attachedPhotoIds: number[]
  ): GroundedPhotoGroup[] {
    const normalized = shownPhotoGroups
      .map((g, i) => ({
        id: g.id ?? i + 1,
        label: (g.label ?? '').trim() || `Group ${i + 1}`,
        photoIds: [...new Set(g.photoIds ?? [])],
        rejected: g.rejected === true,
      }))
      .filter((g) => g.photoIds.length > 0)

    if (normalized.length === 0) return []

    const groupedIds = new Set(normalized.flatMap((g) => g.photoIds))
    const attached = [...new Set(attachedPhotoIds)].filter((id) => !groupedIds.has(id))

    let budget = MAX_GROUNDED_PHOTOS - attached.length
    const kept: GroundedPhotoGroup[] = []
    for (const g of normalized) {
      if (g.photoIds.length > budget) {
        console.warn(
          `[ChatActions] ⚠️  group #${g.id} "${g.label}" (${g.photoIds.length} photos) left out — ` +
            `over the ${MAX_GROUNDED_PHOTOS}-photo grounding budget`
        )
        continue
      }
      kept.push(g)
      budget -= g.photoIds.length
    }

    if (attached.length > 0) {
      kept.push({
        id: Math.max(0, ...normalized.map((g) => g.id)) + 1,
        label: ATTACHED_GROUP_LABEL,
        photoIds: attached.slice(0, MAX_GROUNDED_PHOTOS),
        rejected: false,
      })
    }

    return kept
  }

  /**
   * Builds `collectionId → Set<photoId>` and `seriesId → Set<photoId>` maps for the
   * shown photos, restricted to the inventory containers. Reads the pivot tables
   * directly (collection_photos / series_photos). Never throws — on any failure it
   * returns empty maps, so validation simply skips membership filtering.
   */
  private async loadMembership(
    photoIds: number[],
    collectionIds: number[],
    seriesIds: number[]
  ): Promise<{
    collectionMembership: Map<number, Set<number>>
    seriesMembership: Map<number, Set<number>>
  }> {
    const collectionMembership = new Map<number, Set<number>>()
    const seriesMembership = new Map<number, Set<number>>()
    if (photoIds.length === 0) return { collectionMembership, seriesMembership }

    const toMap = (rows: any[], key: string, map: Map<number, Set<number>>) => {
      for (const r of rows) {
        const cid = Number(r[key])
        const pid = Number(r.photo_id)
        if (!map.has(cid)) map.set(cid, new Set())
        map.get(cid)!.add(pid)
      }
    }

    try {
      const [collectionRows, seriesRows] = await Promise.all([
        collectionIds.length > 0
          ? db
              .from('collection_photos')
              .whereIn('photo_id', photoIds)
              .whereIn('collection_id', collectionIds)
              .select('collection_id', 'photo_id')
          : Promise.resolve([]),
        seriesIds.length > 0
          ? db
              .from('series_photos')
              .whereIn('photo_id', photoIds)
              .whereIn('series_id', seriesIds)
              .select('series_id', 'photo_id')
          : Promise.resolve([]),
      ])
      toMap(collectionRows, 'collection_id', collectionMembership)
      toMap(seriesRows, 'series_id', seriesMembership)
    } catch (err: any) {
      console.warn('[ChatActions] ⚠️  membership load failed:', err?.message ?? err)
    }

    return { collectionMembership, seriesMembership }
  }

  private buildUserContent(args: SuggesterTurn): string {
    const { assistantText, historyText, photos, photoGroups, collections, series, portfolios } = args
    const lines: string[] = []

    if (historyText.trim()) {
      lines.push('## RECENT CONVERSATION')
      lines.push(historyText.trim())
      lines.push('')
    }

    lines.push("## ASSISTANT'S LATEST REPLY")
    lines.push(assistantText.trim().slice(0, 2000))
    lines.push('')

    // Two independent budgets: how many photos we LIST (prompt size) and how many of
    // those carry a description (tokens). Neither limits what an action can cover — on a
    // grouped turn the suggester includes whole groups BY NUMBER, so the photos we never
    // listed still travel with their group. A big group costs tokens, not correctness.
    let listed = 0
    let described = 0
    const photoLine = (id: number): string => {
      const p = photos.find((x) => x.id === id)
      const snippet =
        described++ < MAX_DESCRIBED_PHOTOS ? this.firstSentence(p?.descriptions?.context ?? '') : ''
      return `- id ${id}: ${p?.originalFileName ?? 'photo'}${snippet ? ` — ${snippet}` : ''}`
    }
    /** Lists what fits in the remaining budget and states plainly what it left out. */
    const listPhotos = (ids: number[], omittedNote: (n: number) => string) => {
      const room = Math.max(0, MAX_LISTED_PHOTOS - listed)
      for (const id of ids.slice(0, room)) lines.push(photoLine(id))
      listed += Math.min(room, ids.length)
      if (ids.length > room) lines.push(`- (${omittedNote(ids.length - room)})`)
    }

    if (photos.length === 0) {
      lines.push('## SHOWN PHOTOS')
      lines.push('(none — do not propose photo-based actions)')
    } else if (photoGroups.length === 0) {
      lines.push('## SHOWN PHOTOS — flat list, no groups (the only photo IDs you may reference)')
      lines.push(
        'Scope create/add actions with `photoIds`; `groupIds` does not apply this turn. ' +
          `To cover ALL ${photos.length} of them, leave \`photoIds\` empty.`
      )
      listPhotos(
        photos.map((p: any) => p.id),
        (n) => `+${n} more photos, ids not listed — leave \`photoIds\` empty to include them too`
      )
    } else {
      lines.push('## SHOWN PHOTOS, AS GROUPED FOR THE USER')
      lines.push(
        'Scope every create/add action with `groupIds` — the numbers below. Listing individual ' +
          'photo IDs is ignored this turn. Pick the group(s) the action is actually about.'
      )
      for (const g of photoGroups) {
        const rejected = g.rejected
          ? ' — REJECTED by the assistant: never put this group in a create/add action'
          : ''
        lines.push(`Group #${g.id} "${g.label}" (${g.photoIds.length} photos)${rejected}:`)
        listPhotos(
          g.photoIds,
          (n) =>
            `+${n} more photos in this group, ids not listed — including group #${g.id} covers all ${g.photoIds.length}`
        )
      }
    }
    lines.push('')

    lines.push('## USER LIBRARY (for add_to_* and open_view id targets)')
    lines.push(`Collections: ${this.inventoryList(collections)}`)
    lines.push(`Series: ${this.inventoryList(series)}`)
    lines.push(
      `Portfolios: ${this.inventoryList(portfolios.map((p) => ({ id: p.id, name: p.config?.name ?? `Portfolio ${p.id}` })))}`
    )

    return lines.join('\n')
  }

  private inventoryList(items: Array<{ id: number; name: string }>): string {
    if (!items || items.length === 0) return '(none)'
    return items.map((i) => `#${i.id} "${(i.name ?? '').slice(0, 60)}"`).join(', ')
  }

  private firstSentence(text: string): string {
    if (!text) return ''
    const m = text.match(/[^.!?]+[.!?]+/)
    return (m ? m[0] : text).trim().slice(0, 120)
  }

  /**
   * Convenience wrapper that resolves the latest assistant turn of a conversation
   * and generates (or returns cached) actions. Used by the /api/chat/actions endpoint.
   *
   * Returns null when the conversation has no eligible assistant message.
   */
  public async generateForLatestTurn(
    userId: number,
    conversationId: number
  ): Promise<{
    actions: SuggestedAction[]
    costEur: number
    model: string | null
    messageId: number
  } | null> {
    const ConversationMessage = (await import('#models/conversation_message')).default

    const lastAssistant = await ConversationMessage.query()
      .where('conversation_id', conversationId)
      .where('role', 'assistant')
      .where('is_error', false)
      .orderBy('created_at', 'desc')
      .first()

    if (!lastAssistant) return null

    // Return persisted actions if already generated for this message.
    const existing = (lastAssistant.metadata as any)?.actions
    if (Array.isArray(existing)) {
      return {
        actions: this.withUsageState(existing),
        costEur: 0,
        model: null,
        messageId: lastAssistant.id,
      }
    }

    // The user message immediately preceding it (for attached photos).
    // Compare by id (monotonic autoincrement) to avoid datetime serialization pitfalls.
    const precedingUser = await ConversationMessage.query()
      .where('conversation_id', conversationId)
      .where('role', 'user')
      .where('id', '<', lastAssistant.id)
      .orderBy('id', 'desc')
      .first()

    // `id` is absent on messages persisted before groups carried one — index+1 reproduces
    // the id they would have been given, and it's the same order the user saw.
    const shownPhotoGroups = (lastAssistant.photoGroups ?? []).map((g: any, i: number) => ({
      id: typeof g.id === 'number' ? g.id : i + 1,
      label: g.label ?? '',
      photoIds: g.photoIds ?? [],
      // Absent on messages persisted before the curator flagged its discard piles —
      // those turns simply have no rejected group, which is the pre-existing behaviour.
      rejected: g.rejected === true,
    }))
    const attachedPhotoIds = precedingUser?.contextPhotoIds ?? []

    const history = await new ConversationService().getLLMContext(conversationId)
    // Phase 3 only needs enough context to read the CURRENT turn's intent — not the
    // whole window. A long history makes older items (e.g. collection names mentioned
    // turns ago) salient and biases the suggester toward archiving into them. Keep just
    // the immediately-preceding turn plus the current user message, and drop the very
    // last assistant turn (it's passed separately as assistantText).
    const historyText = history
      .slice(-3, -1)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')

    const { actions, costEur, model } = await this.generateActions({
      userId,
      assistantText: lastAssistant.content,
      shownPhotoGroups,
      attachedPhotoIds,
      // Absent on messages persisted before the curator named its selections; the
      // suggester then simply has no name to give a canvas, and skips it.
      selectionTitle: String((lastAssistant.metadata as any)?.selectionTitle ?? ''),
      historyText,
    })

    // Persist onto the message metadata so reloads don't regenerate.
    lastAssistant.metadata = {
      ...(lastAssistant.metadata as any),
      actions: this.withUsageState(actions),
    }
    await lastAssistant.save()

    return { actions: this.withUsageState(actions), costEur, model, messageId: lastAssistant.id }
  }
}
