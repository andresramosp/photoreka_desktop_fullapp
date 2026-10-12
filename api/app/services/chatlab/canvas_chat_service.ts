import Canvas from '#models/canvas'
import Conversation from '#models/conversation'
import ConversationService from '#services/chatlab/conversation_service'
import { CANVAS_VIEW_MAX_PHOTOS } from '#services/chatlab/agent_tools_service'
import type { CanvasChatContext } from '#services/chatlab/langchain_agent_service'
import type { CanvasPhotoRect } from '#models/conversation_message'

/**
 * Photos on a board that the agent will be told about. Applied to the placed list and to
 * the discarded list SEPARATELY, so a pathological board can reach twice this in the one
 * place the two are unioned (the search exclusion) — still a single indexed `= ANY(...)`,
 * and nowhere near where Postgres starts caring.
 *
 * Never a prompt: these ids reach the model in no form, so the ceiling is about the query
 * that resolves them rather than about tokens. Boards past this are rare and lose nothing
 * they would notice: the excess is simply eligible to be suggested again.
 */
const MAX_CANVAS_PHOTO_IDS = 1000

/**
 * The hand-picked selection a turn carries ENTIRE, for the tools that operate over "this
 * area" — never for a prompt. Above `CANVAS_VIEW_MAX_PHOTOS` because nothing here is
 * described; below `MAX_CANVAS_PHOTO_IDS` because, unlike the placed list, every id here is
 * loaded and scored by whatever tool takes it as its pool.
 */
const CANVAS_REGION_MAX_PHOTOS = 200

/**
 * Ceiling on the grid a client may describe. It is rendered into a prompt, so the cap is
 * about how much whitespace an untrusted client can bill for — the client already collapses
 * runs of empty cells, and a focus of a dozen photos never comes near these.
 */
const MAX_LAYOUT_ROWS = 24
const MAX_LAYOUT_COLUMNS = 16

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
   * The conversation this canvas chats in, creating and binding one on first use — and the
   * canvas itself, which the caller needs anyway.
   *
   * The canvas rides along rather than being fetched again by the caller: this method has
   * already loaded the row to read `conversationId`, and `name` is in the same object. A
   * second query for a column already in memory is how the board's name ends up being
   * "not worth the lookup" and never reaching the agent at all.
   *
   * `firstMessage` only seeds the placeholder title of a conversation that did not exist
   * yet; an existing binding ignores it.
   *
   * Returns null when the canvas isn't the user's — the caller falls back to an ordinary
   * conversation rather than failing the turn, since a chat that answers is a better
   * outcome than a 404 over a binding the user never sees.
   */
  async resolveSession(
    canvasId: number,
    userId: number,
    firstMessage?: string
  ): Promise<{ conversation: Conversation; canvas: Canvas } | null> {
    const canvas = await this.findOwnedCanvas(canvasId, userId)
    if (!canvas) return null

    if (canvas.conversationId) {
      const existing = await this.conversationService.verifyOwnership(canvas.conversationId, userId)
      if (existing) return { conversation: existing, canvas }
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

    return { conversation, canvas }
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
   * off them, and ownership resolves downstream — `fetch_focus_view`, `canvas_overview`
   * and every scope query filter on `user_id`, so a forged id contributes no photo and
   * describes none.
   *
   * **`photoIds` and `discardedIds` are kept apart because they answer different
   * questions, and conflating them was wrong in one of the two.** A photo the user dropped
   * in the trash zone must still be excluded from search results — re-proposing what they
   * just threw away is the most obviously wrong thing this chat could do — so exclusion
   * runs on the union. But it is no longer ON the board, so it must not appear in anything
   * that DESCRIBES the board: not in the `canvas` search scope ("of everything on the
   * canvas, which is weakest" should not rank the discards), and not in the profile
   * `canvas_overview` builds, where averaging in rejected work describes a set that exists
   * nowhere. See `CanvasChatContext`.
   *
   * `focusIds` and `spotlightIds` are each intersected with `photoIds` deliberately: both
   * are levels OF the board, so an id in either that is not placed is a client that got out
   * of sync, and describing it would tell the agent the user is looking at something they
   * are not. Discards are not part of that intersection either — a discarded photo under
   * the focus is a client mid-drag, not something the user is working on.
   *
   * `regionIds` — the hand-picked selection entire — is intersected the same way, being the
   * same level of the board seen as a pool rather than as a picture. The client sends none
   * under the halo, so a non-empty region always means a selection, and `focusIds` is its
   * prefix by construction there; nothing here re-derives that.
   *
   * `layout` is the arrangement of those two levels and is filtered against their union: a
   * cell naming anything else would put an id in front of the model that nothing else in
   * the turn describes. It is never the source of the two lists, nor they of it — the grid
   * says WHERE, the lists say WHICH ROLE, and a client that disagrees loses only the cell.
   *
   * Returns null when there is nothing to say about the board, so the whole feature stays
   * dark rather than injecting an empty context. A board holding nothing but discards
   * still counts: its exclusion set is real work, even though its profile is empty.
   */
  buildContext(
    rawPhotoIds: unknown,
    rawFocusIds: unknown,
    rawRegionIds: unknown,
    rawSpotlightIds: unknown,
    rawLayout: unknown,
    rawDiscardedIds: unknown,
    canvasName: string | null,
    rawScopedToCanvas: unknown
  ): CanvasChatContext | null {
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
    // A photo cannot be both placed and discarded. When a client says both, "placed" wins:
    // it is the claim that puts the photo somewhere, and the cost of believing it is one
    // photo in a profile rather than one photo wrongly re-proposed.
    const placed = new Set(photoIds)
    const discardedIds = clean(rawDiscardedIds)
      .filter((id) => !placed.has(id))
      .slice(0, MAX_CANVAS_PHOTO_IDS)

    if (photoIds.length === 0 && discardedIds.length === 0) return null

    // Order is the client's and is preserved — it carries the board's reading order,
    // which is the whole reason these are sent as lists rather than as sets.
    const focusIds = clean(rawFocusIds)
      .filter((id) => placed.has(id))
      .slice(0, CANVAS_VIEW_MAX_PHOTOS)
    const spotlightIds = clean(rawSpotlightIds)
      .filter((id) => placed.has(id))
      .slice(0, CANVAS_VIEW_MAX_PHOTOS)
    const regionIds = clean(rawRegionIds)
      .filter((id) => placed.has(id))
      .slice(0, CANVAS_REGION_MAX_PHOTOS)

    return {
      name: CanvasChatService.readableCanvasName(canvasName),
      photoIds,
      discardedIds,
      focusIds,
      regionIds,
      spotlightIds,
      layout: CanvasChatService.cleanLayout(rawLayout, [...focusIds, ...spotlightIds]),
      // "Canvas only" caps every search at the placed photos. Meaningless with none placed —
      // it would cage every search to an empty pool — so it only counts when `photoIds` is
      // non-empty, which also means a board holding nothing but discards can never be scoped.
      scopedToBoard: rawScopedToCanvas === true && photoIds.length > 0,
    }
  }

  /**
   * The grid of ids a turn carries, reduced to the cells that are safe to render.
   *
   * A cell survives only if it names a photo this turn already describes; everything else
   * becomes an empty cell. That is the whole rule, and it is what keeps the picture and the
   * descriptions in step: the grid can never introduce an id, only place one.
   *
   * Rows left holding nothing are dropped, EXCEPT between two rows that still have photos —
   * there an empty row is the client saying two groups sit apart, which is exactly the kind
   * of thing the grid exists to carry. Leading and trailing blanks say nothing, so they go.
   */
  private static cleanLayout(raw: unknown, describedIds: number[]): Array<Array<number | null>> {
    if (!Array.isArray(raw) || raw.length === 0) return []
    const allowed = new Set(describedIds)
    const seen = new Set<number>()

    const rows = raw.slice(0, MAX_LAYOUT_ROWS).map((row) =>
      (Array.isArray(row) ? row : [])
        .slice(0, MAX_LAYOUT_COLUMNS)
        .map((cell) => {
          const id = Number(cell)
          // Deduped as well as filtered: the same photo in two cells would have the agent
          // reading one photo as two places on the board.
          if (!Number.isInteger(id) || !allowed.has(id) || seen.has(id)) return null
          seen.add(id)
          return id
        })
    )

    const first = rows.findIndex((row) => row.some((cell) => cell !== null))
    if (first === -1) return []
    let last = rows.length - 1
    while (rows[last].every((cell) => cell === null)) last -= 1
    return rows.slice(first, last + 1)
  }

  /**
   * The board rectangles a turn carries, reduced to what is safe to persist and redraw.
   *
   * Persistence only — this never reaches the agent (it reads `layout`, a grid of ids), so
   * the concern here is a client billing storage with junk, not a prompt. A rect survives
   * only if it names a photo the turn already DESCRIBES (`describedIds` = focus ∪ spotlight),
   * mirroring `cleanLayout`: the geometry can never introduce an id, only place one the reply
   * was actually given about. Deduped for the same reason, and coordinates coerced to finite
   * numbers so a NaN can't poison the crop's bounds later.
   */
  static cleanGeometry(raw: unknown, describedIds: number[]): CanvasPhotoRect[] {
    if (!Array.isArray(raw) || raw.length === 0) return []
    const allowed = new Set(describedIds)
    const seen = new Set<number>()
    const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

    const rects: CanvasPhotoRect[] = []
    for (const entry of raw.slice(0, CANVAS_VIEW_MAX_PHOTOS * 2)) {
      if (!entry || typeof entry !== 'object') continue
      const id = Number((entry as any).id)
      if (!Number.isInteger(id) || !allowed.has(id) || seen.has(id)) continue
      seen.add(id)
      rects.push({
        id,
        x: num((entry as any).x),
        y: num((entry as any).y),
        width: num((entry as any).width),
        height: num((entry as any).height),
      })
    }
    return rects
  }

  /**
   * The board's name, or null when it does not carry one worth telling the agent.
   *
   * Every canvas HAS a name, but most of them are `New Canvas`, `New Canvas 3` or
   * `My Canvas` — what the client auto-generates so the sidebar has something to show.
   * Passed through, those read to a model as a statement about the board, and it will
   * reach for them: a canvas is exactly the kind of thing whose name is supposed to be its
   * theme, so "New Canvas 3" gets treated as one. Suppressing them makes "the user named
   * this board" a fact the agent can trust, and their absence a real state.
   *
   * Length-capped and flattened because this is user-authored text going into a prompt.
   * Not a privilege boundary — it is the user's own text reaching their own session, the
   * same as their message — but a name is a label, and a label that runs to paragraphs is
   * a label being used as something else.
   */
  static readableCanvasName(raw: string | null | undefined): string | null {
    const name = (raw ?? '').replace(/\s+/g, ' ').trim()
    if (!name) return null
    if (/^(new canvas|my canvas|canvas|untitled)( \d+)?$/i.test(name)) return null
    return name.slice(0, 120)
  }

  /** Called when a canvas is deleted: its chat has nowhere left to live. */
  async deleteConversationForCanvas(canvas: Canvas): Promise<void> {
    if (!canvas.conversationId) return
    await this.conversationService.delete(canvas.conversationId, canvas.userId)
  }
}
