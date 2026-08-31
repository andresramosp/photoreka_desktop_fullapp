import Canvas from '#models/canvas'
import Conversation from '#models/conversation'
import ConversationService from '#services/conversation_service'
import { CANVAS_VIEW_MAX_PHOTOS } from '#services/agent_tools_service'
import type { CanvasChatContext } from '#services/langchain_agent_service'

/**
 * Photos on a board that the agent will be told about.
 *
 * Only an exclusion list, never a prompt, so the ceiling is about the SQL `IN (...)` that
 * resolves it rather than about tokens. Boards past this are rare and lose nothing they
 * would notice: the excess is simply eligible to be suggested again.
 */
const MAX_CANVAS_PHOTO_IDS = 1000

/**
 * The chat docked to a canvas.
 *
 * A canvas chat is an ordinary conversation in every respect — history, selection basket,
 * "show me more" pagination all work the same — with two differences, and they are the
 * whole of this service:
 *
 *   1. It is created archived, so it never appears in the general conversation history.
 *      The canvas is the only way back to it (`canvases.conversation_id`).
 *   2. Resolution is server-authoritative. `/api/chat` ignores the client's
 *      `conversationId` on a turn that carries a `canvasId` and asks here instead —
 *      otherwise a stale client could create a second conversation for a canvas that
 *      already had one, orphaning the first along with its history.
 */
export default class CanvasChatService {
  private conversationService = new ConversationService()

  /** The canvas, or null when it isn't this user's (or doesn't exist). */
  async findOwnedCanvas(canvasId: number, userId: number): Promise<Canvas | null> {
    if (!Number.isInteger(canvasId) || canvasId <= 0) return null
    return Canvas.query().where('id', canvasId).where('userId', userId).first()
  }

  /**
   * The conversation this canvas chats in, creating and binding one on first use.
   *
   * `firstMessage` only seeds the placeholder title of a conversation that did not exist
   * yet; an existing binding ignores it.
   *
   * Returns null when the canvas isn't the user's — the caller falls back to an ordinary
   * conversation rather than failing the turn, since a chat that answers is a better
   * outcome than a 404 over a binding the user never sees.
   */
  async resolveConversation(
    canvasId: number,
    userId: number,
    firstMessage?: string
  ): Promise<Conversation | null> {
    const canvas = await this.findOwnedCanvas(canvasId, userId)
    if (!canvas) return null

    if (canvas.conversationId) {
      const existing = await this.conversationService.verifyOwnership(canvas.conversationId, userId)
      if (existing) return existing
      // The row is gone (deleted directly, or swept before canvas chats were exempt from
      // the limit). The FK's SET NULL normally covers this; healing it here too means a
      // stale in-memory canvas can't keep pointing at nothing.
      canvas.conversationId = null
    }

    // Archived from birth: `listByUser` filters on `isArchived`, so it is out of the
    // history without needing to know that canvas chats exist.
    const conversation = await this.conversationService.create(userId, firstMessage, {
      hidden: true,
    })

    canvas.conversationId = conversation.id
    await canvas.save()

    return conversation
  }

  /** The bound conversation id without creating one. Null when there is no chat yet. */
  async getBoundConversationId(canvasId: number, userId: number): Promise<number | null> {
    const canvas = await this.findOwnedCanvas(canvasId, userId)
    if (!canvas?.conversationId) return null

    // Verified rather than trusted: the id survives in the column between the
    // conversation being deleted and anything writing the canvas back.
    const conversation = await this.conversationService.verifyOwnership(
      canvas.conversationId,
      userId
    )
    return conversation ? conversation.id : null
  }

  /**
   * Throw the canvas chat away and start over.
   *
   * The column is cleared BEFORE the conversation is deleted, so a failure between the
   * two leaves a canvas with no chat (which simply opens a fresh one) rather than a
   * canvas pointing at a conversation that no longer exists.
   *
   * Returns false when the canvas isn't the user's.
   */
  async resetConversation(canvasId: number, userId: number): Promise<boolean> {
    const canvas = await this.findOwnedCanvas(canvasId, userId)
    if (!canvas) return false

    const previousId = canvas.conversationId
    if (previousId === null) return true

    canvas.conversationId = null
    await canvas.save()

    await this.conversationService.delete(previousId, userId)
    return true
  }

  /**
   * Sanitises the board a turn carries into the context the agent runs on.
   *
   * These come from the request body, like `contextPhotoIds` and the template scope, and
   * for the same reason they are safe to: nothing about the agent's configuration hangs
   * off them, and ownership resolves downstream — `fetch_canvas_view` and every scope
   * query filter on `user_id`, so a forged id contributes no photo and describes none.
   *
   * `visibleIds` is intersected with `photoIds` deliberately: the radius is a window onto
   * the board, so a photo in the window that is not on the board is a client that got out
   * of sync, and describing it would tell the agent the user is looking at something they
   * are not.
   *
   * Returns null when there is nothing to say about the board, so the whole feature stays
   * dark rather than injecting an empty context.
   */
  buildContext(rawPhotoIds: unknown, rawVisibleIds: unknown): CanvasChatContext | null {
    const clean = (raw: unknown): number[] =>
      Array.isArray(raw)
        ? [
            ...new Set(
              raw
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0)
            ),
          ]
        : []

    const photoIds = clean(rawPhotoIds).slice(0, MAX_CANVAS_PHOTO_IDS)
    if (photoIds.length === 0) return null

    const onBoard = new Set(photoIds)
    // Order is the client's and is preserved — it carries the board's reading order,
    // which is the whole reason the radius is sent as a list rather than as a set.
    const visibleIds = clean(rawVisibleIds)
      .filter((id) => onBoard.has(id))
      .slice(0, CANVAS_VIEW_MAX_PHOTOS)

    return { photoIds, visibleIds }
  }

  /** Called when a canvas is deleted: its chat has nowhere left to live. */
  async deleteConversationForCanvas(canvas: Canvas): Promise<void> {
    if (!canvas.conversationId) return
    await this.conversationService.delete(canvas.conversationId, canvas.userId)
  }
}
