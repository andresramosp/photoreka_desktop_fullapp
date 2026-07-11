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
 * -----------------------------------------------------------------
 */

import Collection from '#models/collection'
import Series from '#models/series'
import PortfolioBuild from '#models/portfolio_build'
import Photo from '#models/photo'
import db from '@adonisjs/lucid/services/db'
import ModelsService from './models_service.js'
import ConversationService from './conversation_service.js'
import {
  ACTIONS_CATALOG,
  SUGGESTED_ACTIONS_SCHEMA,
  validateActions,
  type SuggestedAction,
  type ActionsGroundingContext,
} from '../utils/chat_actions_catalog.js'

const PHASE3_MODEL = 'gemini-3.1-flash-lite'

/** Max photos we describe to the suggester (grounding pool). */
const MAX_SHOWN_PHOTOS = 30
/** Max library items of each type injected as inventory. */
const MAX_INVENTORY_ITEMS = 20

const SYSTEM_PROMPT = `You suggest concrete next actions for a photography app (Photoreka) after the assistant replied.

## Your job
From the conversation and the concrete items provided, pick 2-4 useful, specific actions from the ACTION CATALOG. Fewer is better than forced. Return an empty array if nothing genuinely helps.

## Hard rules
- Choose ONLY action types from the catalog. Fill every param slot ONLY with IDs/values from the provided inventory (shown photos, the user's collections/series/portfolios, the listed enums). NEVER invent a photo ID, collection/series/portfolio ID, filename, tag, or filter value.
- Photo actions must reference photos from "SHOWN PHOTOS" (the ones the assistant just displayed or the user attached). If no photos were shown, don't propose photo-based actions — you may still propose a redirect (open_workspace / open_view) when relevant.
- **Selecting which photos go into a create/add-to action:** the photos are shown to you as GROUPS (as the user actually saw them), not a flat pool.
  - When groups exist: set \`groupLabels\` to the label(s) of the group(s) to include (copy the label text exactly) — do NOT set \`photoIds\`, the app resolves labels to photo IDs for you. By default include every group. The one exception is a group that the assistant clearly presented as rejected/discarded/not recommended (judge this from the group's label AND from the assistant's reply text — e.g. a group titled "Descartadas" / "No funcionan del todo" / "Fuera de la selección", or reply text like "these don't quite work" about that set) — omit that group's label. When it's ambiguous whether a group is a rejection, include it. This is group-level in/out — you never cherry-pick individual photos.
  - When there are no groups (flat list, or only user-attached photos): set \`photoIds\` directly.
- Prefer variety: don't propose three near-identical actions. A create + an explore + a redirect is better than three "create" variants.
- Do NOT write any button text/label — the app renders the visible title from a fixed template. You only choose the action type and fill its typed params. Pick an action ONLY if its params can fully express the intent; if they can't, choose a different action or none.
- For create_collection / create_series / create_canvas you MUST propose a good \`title\` (short, evocative, no quotes) in the USER'S LANGUAGE — this is the real resource name.

## Output
Respond ONLY with valid JSON: { "actions": [ { "type": ..., "params": { ... } } ] }

${ACTIONS_CATALOG}`

export default class ChatActionsService {
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
    /** photo groups as actually shown to the user this turn (label + ordered photoIds). */
    shownPhotoGroups: Array<{ label: string; photoIds: number[] }>
    /** photos the user attached to their message this turn (not part of any group). */
    attachedPhotoIds: number[]
    /** compact prior-turns context (already thinned). */
    historyText: string
  }): Promise<{ actions: SuggestedAction[]; costEur: number }> {
    const { userId, assistantText, shownPhotoGroups, attachedPhotoIds, historyText } = params

    const shownPhotoIds = shownPhotoGroups.flatMap((g) => g.photoIds)
    const availablePhotoIds = [...new Set([...shownPhotoIds, ...attachedPhotoIds])].slice(
      0,
      MAX_SHOWN_PHOTOS
    )

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
      photoGroups: shownPhotoGroups,
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
        return { actions: [], costEur: 0 }
      }
    }

    const userContent = this.buildUserContent({
      assistantText,
      historyText,
      photos,
      shownPhotoGroups,
      attachedPhotoIds,
      collections,
      series,
      portfolios,
    })

    let raw: any
    let costEur = 0
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
      raw = res?.result
      costEur = res?.cost?.totalCostInEur ?? 0
    } catch (err: any) {
      console.warn('[ChatActions] ⚠️  Phase 3 generation failed:', err?.message ?? err)
      return { actions: [], costEur: 0 }
    }

    const rawActions = Array.isArray(raw) ? raw : (raw?.actions ?? [])
    const actions = this.withUsageState(validateActions(rawActions, ctx))

    const rawTypes = Array.isArray(rawActions) ? rawActions.map((a: any) => a?.type).join(',') : ''
    const keptTypes = actions.map((a) => a.type).join(',')
    console.log(
      `[ChatActions] ✅ ${actions.length} action(s) after grounding ` +
        `(from ${Array.isArray(rawActions) ? rawActions.length : 0} raw) | €${costEur.toFixed(6)}` +
        ` | raw=[${rawTypes}] kept=[${keptTypes}]`
    )
    return { actions, costEur }
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

  private buildUserContent(args: {
    assistantText: string
    historyText: string
    photos: any[]
    shownPhotoGroups: Array<{ label: string; photoIds: number[] }>
    attachedPhotoIds: number[]
    collections: any[]
    series: any[]
    portfolios: any[]
  }): string {
    const {
      assistantText,
      historyText,
      photos,
      shownPhotoGroups,
      attachedPhotoIds,
      collections,
      series,
      portfolios,
    } = args
    const lines: string[] = []

    if (historyText.trim()) {
      lines.push('## RECENT CONVERSATION')
      lines.push(historyText.trim())
      lines.push('')
    }

    lines.push("## ASSISTANT'S LATEST REPLY")
    lines.push(assistantText.trim().slice(0, 2000))
    lines.push('')

    const photoLine = (id: number): string => {
      const p = photos.find((x) => x.id === id)
      if (!p) return `- id ${id}: photo`
      const ctxSnippet = this.firstSentence(p.descriptions?.context ?? '')
      return `- id ${id}: ${p.originalFileName ?? 'photo'}${ctxSnippet ? ` — ${ctxSnippet}` : ''}`
    }

    lines.push('## SHOWN PHOTOS, AS GROUPED FOR THE USER (the only photo IDs you may reference)')
    if (photos.length === 0) {
      lines.push('(none — do not propose photo-based actions)')
    } else if (shownPhotoGroups.length === 0) {
      lines.push('(no groups — flat list)')
      for (const p of photos.filter((x) => !attachedPhotoIds.includes(x.id))) {
        lines.push(photoLine(p.id))
      }
    } else {
      for (const g of shownPhotoGroups) {
        lines.push(`Group "${g.label}":`)
        for (const id of g.photoIds) lines.push(photoLine(id))
      }
    }
    const groupedIds = new Set(shownPhotoGroups.flatMap((g) => g.photoIds))
    const ungroupedAttached = attachedPhotoIds.filter((id) => !groupedIds.has(id))
    if (ungroupedAttached.length > 0) {
      lines.push('Attached by the user (not part of any group):')
      for (const id of ungroupedAttached) lines.push(photoLine(id))
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
  ): Promise<{ actions: SuggestedAction[]; costEur: number; messageId: number } | null> {
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

    const shownPhotoGroups = (lastAssistant.photoGroups ?? []).map((g: any) => ({
      label: g.label ?? '',
      photoIds: g.photoIds ?? [],
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

    const { actions, costEur } = await this.generateActions({
      userId,
      assistantText: lastAssistant.content,
      shownPhotoGroups,
      attachedPhotoIds,
      historyText,
    })

    // Persist onto the message metadata so reloads don't regenerate.
    lastAssistant.metadata = {
      ...(lastAssistant.metadata as any),
      actions: this.withUsageState(actions),
    }
    await lastAssistant.save()

    return { actions: this.withUsageState(actions), costEur, messageId: lastAssistant.id }
  }
}
