import Conversation from '#models/conversation'
import ConversationMessage from '#models/conversation_message'
import type { PhotoGroup } from '#models/conversation_message'
import ModelsService from './models_service.js'

const MAX_CONVERSATIONS_PER_USER = 50
const MAX_LLM_CONTEXT_TURNS = 5

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

export type ChatMessageForLLM = {
  role: 'user' | 'assistant'
  content: string
  photoIds?: number[]
  photoGroups?: PhotoGroup[]
}

export default class ConversationService {
  /**
   * Create a new conversation for a user.
   * Auto-generates a title from the first message content.
   */
  async create(userId: number, firstMessage?: string): Promise<Conversation> {
    // Placeholder title: truncated message, replaced async by LLM
    const placeholder = firstMessage
      ? firstMessage.slice(0, 80) + (firstMessage.length > 80 ? '…' : '')
      : null

    const conversation = await Conversation.create({
      userId,
      title: placeholder,
      isArchived: false,
    })

    // Enforce max conversations limit — delete oldest beyond limit
    await this.enforceConversationLimit(userId)

    // Fire-and-forget: generate a proper title with LLM in the background
    if (firstMessage) {
      this.generateTitleAsync(conversation.id, firstMessage).catch((err) =>
        console.warn('[ConversationService] Title generation failed:', err?.message)
      )
    }

    return conversation
  }

  /**
   * Generate a concise conversation title using Gemini and update the DB.
   * Called fire-and-forget from create().
   */
  private async generateTitleAsync(conversationId: number, firstMessage: string): Promise<void> {
    const modelsService = new ModelsService()
    const systemPrompt =
      'You are a conversation title generator for a photography app.' +
      " Given the user's first message, produce a short, descriptive title (3–6 words)." +
      ' Match the language of the message.' +
      ' Respond ONLY with valid JSON: {"result": "<title>"}'

    const { result } = await modelsService.getGeminiResponse(
      systemPrompt,
      [firstMessage.slice(0, 300)],
      'gemini-2.5-flash-lite',
      { temperature: 0.4 },
      false // no cache — every title should be unique
    )

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
    return Conversation.query()
      .where('id', conversationId)
      .where('userId', userId)
      .preload('messages', (q) => q.orderBy('createdAt', 'asc'))
      .first()
  }

  /**
   * Get the last N turns of a conversation for LLM context.
   * Returns max MAX_LLM_CONTEXT_TURNS * 2 messages (user + assistant pairs).
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

    return messages.map((m, index) => {
      const isRecentlyExempt = index >= messages.length - ASSISTANT_THIN_RECENT_EXEMPT
      const content =
        m.role === 'assistant' && !isRecentlyExempt ? thinAssistantContent(m.content) : m.content
      return {
        role: m.role,
        content,
        ...(m.contextPhotoIds && m.contextPhotoIds.length > 0 && { photoIds: m.contextPhotoIds }),
        ...(m.photoGroups && m.photoGroups.length > 0 && { photoGroups: m.photoGroups }),
      }
    })
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
    return ConversationMessage.create({
      conversationId,
      role: 'assistant' as const,
      content,
      photoGroups: photoGroups && photoGroups.length > 0 ? photoGroups : null,
      isError,
      costEur: costEur ?? null,
      metadata: metadata ?? {},
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
