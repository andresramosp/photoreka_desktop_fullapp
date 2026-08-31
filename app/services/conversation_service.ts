import Conversation from '#models/conversation'
import ConversationMessage from '#models/conversation_message'
import type { PhotoGroup } from '#models/conversation_message'
import Photo from '#models/photo'
import ModelsService from './models_service.js'
import UserCostService from './user_cost_service.js'

const MAX_CONVERSATIONS_PER_USER = 50
const MAX_LLM_CONTEXT_TURNS = 5

/** Selection basket cap. A shelf past this size stops being a selection. */
const MAX_BASKET_PHOTOS = 200

/** Minimum assistant message length (chars) before thinning is applied. */
const ASSISTANT_THIN_THRESHOLD = 1000
/**
 * Fraction of the original content to remove from the center.
 * 0.5 → remove middle 50%, keeping ~25% from start and ~25% from end.
 */
const ASSISTANT_THIN_CENTER_RATIO = 0.5
/**
 * Number of most-recent messages (counting from the end of the context window)
 * that are NEVER thinned, regardless of length.
 * 2 = the last full turn (last user message + last assistant message).
 */
const ASSISTANT_THIN_RECENT_EXEMPT = 2

/**
 * Thin a long assistant message by cutting out the central portion.
 * Only applied when content exceeds ASSISTANT_THIN_THRESHOLD.
 * The result preserves the beginning and end of the message; the omitted
 * section is replaced with a clear marker so the LLM is aware of the gap.
 */
function thinAssistantContent(content: string): string {
  if (content.length <= ASSISTANT_THIN_THRESHOLD) return content

  const removeCount = Math.floor(content.length * ASSISTANT_THIN_CENTER_RATIO)
  const keepHalf = Math.floor((content.length - removeCount) / 2)

  const start = content.slice(0, keepHalf)
  const end = content.slice(content.length - keepHalf)
  const omitted = content.length - keepHalf * 2

  return `${start}\n[...${omitted} chars omitted for brevity...]\n${end}`
}

/**
 * Shape a stored row for the LLM. `content` is passed in because the caller decides it
 * (thinned, or annotated with the omission marker); the optional fields come from the row.
 */
function toLLMMessage(
  m: ConversationMessage,
  content: string,
  searchCalls?: unknown
): ChatMessageForLLM {
  return {
    role: m.role,
    content,
    ...(m.contextPhotoIds && m.contextPhotoIds.length > 0 && { photoIds: m.contextPhotoIds }),
    ...(m.photoGroups && m.photoGroups.length > 0 && { photoGroups: m.photoGroups }),
    ...(Array.isArray(searchCalls) && searchCalls.length > 0 && { searchCalls }),
  }
}

export type ChatMessageForLLM = {
  role: 'user' | 'assistant'
  content: string
  photoIds?: number[]
  photoGroups?: PhotoGroup[]
  /**
   * Args of the `search_advanced` call(s) that produced this response's photos. Set ONLY
   * on the most recent assistant turn, so a follow-up can re-issue the same query verbatim
   * instead of rebuilding it from the conversation prose.
   */
  searchCalls?: Record<string, any>[]
}

export default class ConversationService {
  /**
   * Create a new conversation for a user.
   * Auto-generates a title from the first message content.
   *
   * `hidden` is for guided template sessions (chat-assisted portfolio building and
   * the like), whose opening turn is a long machine-written brief the user never
   * typed and would not recognise in a sidebar. Born archived, so `listByUser`
   * already leaves it out — it is a real conversation in every other respect, which
   * is what keeps LLM history, the selection basket and "show me more" pagination
   * working across its turns. (`ephemeral` would drop all three.)
   *
   * Reusing `isArchived` rather than adding a column: both meanings are "never
   * listed". If an "Archived conversations" view is ever built, it must exclude
   * these — they were never the user's to archive.
   */
  async create(
    userId: number,
    firstMessage?: string,
    options: { hidden?: boolean } = {}
  ): Promise<Conversation> {
    const hidden = options.hidden === true

    // Placeholder title: truncated message, replaced async by LLM
    const placeholder = firstMessage
      ? firstMessage.slice(0, 80) + (firstMessage.length > 80 ? '…' : '')
      : null

    const conversation = await Conversation.create({
      userId,
      title: placeholder,
      isArchived: hidden,
    })

    // Enforce max conversations limit — delete oldest beyond limit
    await this.enforceConversationLimit(userId)

    // Fire-and-forget: generate a proper title with LLM in the background.
    // Skipped for hidden conversations: nothing ever lists them, so the call and
    // the cost record it writes would buy a title no one reads.
    if (firstMessage && !hidden) {
      this.generateTitleAsync(conversation.id, firstMessage, userId).catch((err) =>
        console.warn('[ConversationService] Title generation failed:', err?.message)
      )
    }

    return conversation
  }

  /**
   * Generate a concise conversation title using Gemini and update the DB.
   * Called fire-and-forget from create().
   */
  private async generateTitleAsync(
    conversationId: number,
    firstMessage: string,
    userId: number
  ): Promise<void> {
    const modelsService = new ModelsService()
    const systemPrompt =
      'You are a conversation title generator for a photography app.' +
      " Given the user's first message, produce a short, descriptive title (3–6 words)." +
      ' Match the language of the message.' +
      ' Do not include references to IDs (collections, photos, etc.).' +
      ' Respond ONLY with valid JSON: {"result": "<title>"}'

    const { result, cost } = await modelsService.getGeminiResponse(
      systemPrompt,
      [firstMessage.slice(0, 300)],
      'gemini-2.5-flash-lite',
      { temperature: 0.4 },
      false // no cache — every title should be unique
    )

    if (cost?.totalCostInEur) {
      UserCostService.record(userId, 'chat', cost.totalCostInEur, 1, {
        model: 'gemini-2.5-flash-lite',
        task: 'title_generation',
        referenceId: String(conversationId),
      }).catch(() => {})
    }

    const title = typeof result === 'string' ? result.trim().slice(0, 255) : null
    if (!title) return

    await Conversation.query().where('id', conversationId).update({ title })
  }

  /**
   * List conversations for a user, ordered by most recently updated.
   * Excludes archived conversations.
   */
  async listByUser(
    userId: number,
    page: number = 1,
    limit: number = 30
  ): Promise<{
    conversations: Conversation[]
    total: number
  }> {
    const query = Conversation.query()
      .where('userId', userId)
      .where('isArchived', false)
      .orderBy('updatedAt', 'desc')

    const results = await query.paginate(page, limit)

    return {
      conversations: results.all(),
      total: results.total,
    }
  }

  /**
   * Load a single conversation with ALL its messages (for frontend display).
   * Verifies ownership.
   */
  async getWithMessages(conversationId: number, userId: number): Promise<Conversation | null> {
    const conversation = await Conversation.query()
      .where('id', conversationId)
      .where('userId', userId)
      .preload('messages', (q) => q.orderBy('createdAt', 'asc'))
      .first()

    if (!conversation) return null

    // Prune basket ids whose photo is gone (deleted or trashed — Photo's fetch hook
    // filters those out). Read-only: the next basket write persists the pruned set.
    // Without this the shelf silently rots, since the frontend can't resolve the ids
    // either and just drops them from the panel.
    if (conversation.selectedPhotoIds.length > 0) {
      conversation.selectedPhotoIds = await this.filterOwnedPhotoIds(
        userId,
        conversation.selectedPhotoIds
      )
    }

    return conversation
  }

  /**
   * Replace the conversation's selection basket. Verifies ownership.
   *
   * Full-array replace, last write wins: the client owns the basket during a session
   * and sends the whole shelf, so there is no incremental state to reconcile here.
   *
   * Returns the sanitized ids actually stored, or null if the conversation isn't the
   * user's. Ids are filtered against the user's own photos before storage — they end
   * up in LLM context, so a foreign id can never enter through here.
   */
  async saveBasket(
    conversationId: number,
    userId: number,
    photoIds: number[]
  ): Promise<number[] | null> {
    const conversation = await this.verifyOwnership(conversationId, userId)
    if (!conversation) return null

    const owned = await this.filterOwnedPhotoIds(userId, photoIds)

    // Query-builder update (not save()) on purpose: it skips autoUpdate, so pinning a
    // photo doesn't bump the conversation to the top of the sidebar. It also skips the
    // column's `prepare`, hence the explicit stringify.
    await Conversation.query()
      .where('id', conversationId)
      .update({ selectedPhotoIds: owned.length > 0 ? JSON.stringify(owned) : null })

    return owned
  }

  /**
   * Persist this conversation's curation-mode toggle. Verifies ownership; returns the stored
   * value, or null if the conversation isn't the user's.
   *
   * Query-builder update (not save()) on purpose — same reason as saveBasket: flipping a
   * setting shouldn't bump the conversation to the top of the sidebar via autoUpdate.
   */
  async saveCurationMode(
    conversationId: number,
    userId: number,
    curationMode: boolean
  ): Promise<boolean | null> {
    const conversation = await this.verifyOwnership(conversationId, userId)
    if (!conversation) return null

    await Conversation.query().where('id', conversationId).update({ curationMode })

    return curationMode
  }

  /**
   * Keep only the ids that belong to this user, de-duplicated and capped at
   * MAX_BASKET_PHOTOS. Photo's fetch hook filters out deleted/trashed rows, so an id
   * whose photo is gone drops here too. Order follows the caller's input.
   */
  private async filterOwnedPhotoIds(userId: number, photoIds: number[]): Promise<number[]> {
    const unique = [...new Set(photoIds)].slice(0, MAX_BASKET_PHOTOS)
    if (unique.length === 0) return []

    const rows = await Photo.query().where('userId', userId).whereIn('id', unique).select('id')
    const owned = new Set(rows.map((p) => p.id))

    return unique.filter((id) => owned.has(id))
  }

  /**
   * Get the last N turns of a conversation for LLM context.
   * Returns max MAX_LLM_CONTEXT_TURNS * 2 messages (user + assistant pairs), plus the
   * conversation's opening user message pinned on top once the window has slid past it
   * (see buildOpeningMessage) — so the result can be one longer than the window.
   *
   * Returns the turns BEFORE the one being answered. ChatController persists the incoming
   * user message before invoking an agent — deliberately, so the message survives an agent
   * failure — which means that message is already in the table when the agent asks for its
   * context. Handing it back makes every agent send it to the model twice: once from its
   * history loop, once as the current turn (and Gemini's alternation merge then fuses the
   * two HumanMessages into one with the text repeated).
   *
   * A trailing user message is dropped for that reason, and the rule needs no parameter to
   * be exact: turns alternate, so a stored conversation at rest ends with an assistant
   * message. A user message with nothing after it is, by construction, the one still being
   * answered. (An earlier turn whose assistant reply was stored as isError — filtered out
   * by the query below — leaves its user message mid-array, not trailing, so it survives.)
   */
  async getLLMContext(conversationId: number): Promise<ChatMessageForLLM[]> {
    const limit = MAX_LLM_CONTEXT_TURNS * 2

    const messages = await ConversationMessage.query()
      .where('conversationId', conversationId)
      .where('isError', false)
      .orderBy('createdAt', 'desc')
      .limit(limit)

    // Reverse to get chronological order
    messages.reverse()

    // A window that came back short is the whole conversation — nothing was cut off the
    // front, so there is no opening message to pin and no gap to count.
    const windowSlid = messages.length === limit

    const currentTurn = messages[messages.length - 1]?.role === 'user' ? messages.pop() : undefined

    // Only the LATEST assistant turn carries its search args forward: a follow-up continues
    // the most recent request, and replaying every turn's args would be noise. This
    // self-propagates — that turn re-issues the call, so the turn after it inherits it too.
    const lastAssistantIndex = messages.reduce(
      (last, m, i) => (m.role === 'assistant' ? i : last),
      -1
    )

    const window = messages.map((m, index) => {
      const isRecentlyExempt = index >= messages.length - ASSISTANT_THIN_RECENT_EXEMPT
      const content =
        m.role === 'assistant' && !isRecentlyExempt ? thinAssistantContent(m.content) : m.content
      const searchCalls = index === lastAssistantIndex ? m.metadata?.searchCalls : undefined
      return toLLMMessage(m, content, searchCalls)
    })

    const opening = windowSlid
      ? await this.buildOpeningMessage(conversationId, messages, currentTurn)
      : null

    return opening ? [opening, ...window] : window
  }

  /**
   * Every photo this conversation has put in front of the user, oldest first, deduplicated.
   *
   * Deliberately NOT derived from `getLLMContext`: that returns a 5-turn window, so a set
   * built from it would silently answer "all the photos in this conversation" with the last
   * few turns' worth. This reads the whole conversation, which is the only reading that
   * makes the question answerable at all.
   *
   * Both directions count as "in front of the user": `photoGroups` is what the assistant
   * rendered (the `rejected` piles included — a photo shown as a discard was still shown),
   * and `contextPhotoIds` is what the user attached. This is a SUPERSET of the
   * `alreadyShownIds` pagination set, which covers `photoGroups` only, on purpose.
   *
   * Errored turns are excluded, matching `getLLMContext`: a failed turn showed nothing.
   */
  async getConversationPhotoIds(conversationId: number): Promise<number[]> {
    const messages = await ConversationMessage.query()
      .where('conversationId', conversationId)
      .where('isError', false)
      .orderBy('id', 'asc')
      .select('id', 'role', 'photo_groups', 'context_photo_ids')

    const ids = new Set<number>()
    for (const m of messages) {
      for (const id of m.contextPhotoIds ?? []) ids.add(id)
      for (const group of m.photoGroups ?? []) {
        for (const id of group.photoIds) ids.add(id)
      }
    }
    return [...ids]
  }

  /**
   * The opening user message, pinned above the window whenever the window has slid past it.
   *
   * That first message is the one turn that keeps mattering after it ages out: it is where
   * the user states what the whole conversation is for ("estoy armando un portfolio de
   * bodas"), and every later turn is read against it. Dropping it makes a long conversation
   * drift — the model still sees the last five turns but no longer knows what they serve.
   *
   * Only called when the window actually filled, so the two queries below cost nothing on
   * the short conversations that are most of them. Returns `null` when there is still
   * nothing to pin: the opening message already inside the window, or it being the message
   * currently being answered — pinning it there would send it to the model twice.
   */
  private async buildOpeningMessage(
    conversationId: number,
    window: ConversationMessage[],
    currentTurn?: ConversationMessage
  ): Promise<ChatMessageForLLM | null> {
    if (window.length === 0) return null

    const first = await ConversationMessage.query()
      .where('conversationId', conversationId)
      .where('isError', false)
      .where('role', 'user')
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .first()

    if (!first) return null
    if (first.id === currentTurn?.id) return null
    if (window.some((m) => m.id === first.id)) return null

    // Bounded by id rather than createdAt: rows are inserted in order, so id is the same
    // sequence without createdAt's risk of ties inside a single turn. Everything from the
    // window's first message onwards (the current turn included) is excluded by the upper
    // bound, so this counts exactly what fell into the gap.
    const gap = await ConversationMessage.query()
      .where('conversationId', conversationId)
      .where('isError', false)
      .where('id', '>', first.id)
      .where('id', '<', window[0].id)
      .count('* as total')

    const omitted = Number(gap[0].$extras.total ?? 0)

    // Marked so the model reads the jump as a jump. Without it the pinned message and the
    // window read as one continuous exchange, and a reference like "lo que decías antes"
    // lands on the wrong turn.
    const content =
      omitted > 0 ? `${first.content}\n\n[...${omitted} messages omitted...]` : first.content

    return toLLMMessage(first, content)
  }

  /**
   * Persist a user message to a conversation.
   */
  async addUserMessage(
    conversationId: number,
    content: string,
    contextPhotoIds?: number[]
  ): Promise<ConversationMessage> {
    // Touch conversation updatedAt
    await Conversation.query().where('id', conversationId).update({ updatedAt: new Date() })

    return ConversationMessage.create({
      conversationId,
      role: 'user' as const,
      content,
      contextPhotoIds: contextPhotoIds && contextPhotoIds.length > 0 ? contextPhotoIds : null,
      isError: false,
    })
  }

  /**
   * Persist an assistant message to a conversation.
   */
  async addAssistantMessage(
    conversationId: number,
    content: string,
    photoGroups?: PhotoGroup[],
    isError: boolean = false,
    costEur?: number,
    metadata?: Record<string, any>
  ): Promise<ConversationMessage> {
    // PostgreSQL UTF-8 rejects null bytes (0x00) — strip them from all text/json fields
    const sanitize = (s: string) => s.replace(/\0/g, '')
    const sanitizeJson = (v: any): any => {
      if (typeof v === 'string') return sanitize(v)
      if (Array.isArray(v)) return v.map(sanitizeJson)
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, sanitizeJson(val)]))
      }
      return v
    }

    return ConversationMessage.create({
      conversationId,
      role: 'assistant' as const,
      content: sanitize(content),
      photoGroups:
        photoGroups && photoGroups.length > 0 ? (sanitizeJson(photoGroups) as PhotoGroup[]) : null,
      isError,
      costEur: costEur ?? null,
      metadata: metadata ? (sanitizeJson(metadata) as Record<string, any>) : {},
    })
  }

  /**
   * Rename a conversation. Verifies ownership.
   */
  async rename(conversationId: number, userId: number, title: string): Promise<boolean> {
    const updated = await Conversation.query()
      .where('id', conversationId)
      .where('userId', userId)
      .update({ title: title.slice(0, 255) })

    return updated.length > 0 || (updated as any) > 0
  }

  /**
   * Archive a conversation (soft delete). Verifies ownership.
   */
  async archive(conversationId: number, userId: number): Promise<boolean> {
    const updated = await Conversation.query()
      .where('id', conversationId)
      .where('userId', userId)
      .update({ isArchived: true })

    return updated.length > 0 || (updated as any) > 0
  }

  /**
   * Hard-delete a conversation and all its messages. Verifies ownership.
   */
  async delete(conversationId: number, userId: number): Promise<boolean> {
    const conversation = await Conversation.query()
      .where('id', conversationId)
      .where('userId', userId)
      .first()

    if (!conversation) return false

    await conversation.delete()
    return true
  }

  /**
   * Verify that a conversation belongs to a user.
   */
  async verifyOwnership(conversationId: number, userId: number): Promise<Conversation | null> {
    return Conversation.query().where('id', conversationId).where('userId', userId).first()
  }

  /**
   * Enforce max conversations per user.
   * Deletes the oldest conversations beyond the limit.
   */
  private async enforceConversationLimit(userId: number): Promise<void> {
    const count = await Conversation.query().where('userId', userId).count('* as total')
    const total = Number(count[0].$extras.total)

    if (total > MAX_CONVERSATIONS_PER_USER) {
      const toDelete = await Conversation.query()
        .where('userId', userId)
        .orderBy('updatedAt', 'asc')
        .limit(total - MAX_CONVERSATIONS_PER_USER)

      for (const conv of toDelete) {
        await conv.delete()
      }
    }
  }
}
