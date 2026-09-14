import type { HttpContext } from '@adonisjs/core/http'
import LangchainAgentService from '#services/langchain_agent_service'
import LangchainAgentKnowledgeService from '#services/langchain_agent_knowledge_service'
import ConversationService from '#services/conversation_service'
import CanvasChatService from '#services/canvas_chat_service'
import Photo from '#models/photo'
import UserCostService from '#services/user_cost_service'
import CreditService from '#services/credit_service'
import FreeShotsService, { FREE_DAILY_SHOTS } from '#services/free_shots_service'
import type { FreeShotCategory } from '#services/free_shots_service'
import {
  findChatIntelligenceMode,
  getDefaultChatIntelligenceModeId,
  listChatIntelligenceModes,
  resolveChatIntelligenceMode,
} from '../services/chat_intelligence_mode_service.js'
import {
  findChatTemplate,
  listChatTemplateIds,
  resolveTemplateScopeCollectionIds,
} from '../services/chat_templates_service.js'

export default class ChatController {
  private conversationService = new ConversationService()
  private canvasChatService = new CanvasChatService()

  private sortDeep(value: any): any {
    if (Array.isArray(value)) return value.map((v) => this.sortDeep(v))
    if (!value || typeof value !== 'object') return value
    return Object.keys(value)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = this.sortDeep(value[key])
          return acc
        },
        {} as Record<string, any>
      )
  }

  private actionSignature(action: any): string {
    const normalized = {
      type: String(action?.type ?? ''),
      params: action?.params && typeof action.params === 'object' ? action.params : {},
    }
    return JSON.stringify(this.sortDeep(normalized))
  }

  /**
   * Agentic chat endpoint
   *
   * POST /api/chat
   *
   * Body:
   * {
   *   message: string              — current user message
   *   conversationId?: number      — existing conversation ID (null = create new)
   *   contextPhotoIds?: number[]   — up to 10 photo IDs to attach as visual context
   *   ephemeral?: boolean          — if true, no conversation or history is created (one-time calls)
   *   modeId?: string              — selected chat intelligence mode
   *   isKnowledgeAssistant?: boolean — if true, forces use of knowledge-only agent (no photo search/analysis)
   *   templateScopeCollectionIds?: number[] — collections the templated session is pinned to.
   *                                  Ignored unless the resolved template declares a scope.
   *                                  Like `templateId`, must ride on EVERY turn: the server
   *                                  keeps no per-conversation template state.
   *   curationMode?: boolean       — progressive exploration: when true, every turn excludes
   *                                  photos already shown in the conversation, not only the
   *                                  ones read as an explicit "another round". Ignored by the
   *                                  knowledge assistant.
   *   canvasId?: number            — the canvas this chat is docked to. Makes the turn run in
   *                                  THAT canvas's conversation, whatever `conversationId` says:
   *                                  the binding lives on the canvas and the server owns it, so a
   *                                  stale client cannot fork a second chat for the same board.
   *                                  Creates and binds one on first use, already archived.
   *   canvasPhotoIds?: number[]    — every photo PLACED on that canvas. Kept out of search
   *                                  results so the agent never proposes a photo already there,
   *                                  and the set that every description of the board is built
   *                                  from (the `canvas` search scope, `canvas_overview`).
   *   canvasDiscardedIds?: number[] — photos the user dropped in the board's trash zone. Also
   *                                  kept out of search results — re-proposing what they just
   *                                  threw away is worse than repeating anything else — but
   *                                  never part of what DESCRIBES the board.
   *   canvasFocusIds?: number[]    — the photos in the chat's focus (under the halo or picked
   *                                  by hand), in reading order. The ZONE the user is working
   *                                  in, and one of the two sets described to the agent.
   *   canvasRegionIds?: number[]   — the user's whole hand-picked selection, in reading order.
   *                                  `canvasFocusIds` is its capped, described prefix; this is
   *                                  the pool the board's tools operate over ("this area").
   *                                  Never from the halo, never shown as thumbnails.
   *   canvasSpotlightIds?: number[] — the photos the user spotlighted on the board, in reading
   *                                  order. The SUBJECT of the turn. A level of the board in
   *                                  its own right, not an attachment: `contextPhotoIds`
   *                                  carries photos brought in from OUTSIDE the board.
   *   canvasLayout?: (number|null)[][] — focus and spotlight as a grid of ids, rows top to
   *                                  bottom and cells left to right, `null` where the board is
   *                                  empty. The client resolves the geometry and sends cells;
   *                                  no coordinate ever reaches the server.
   *   canvasScopedToCanvas?: boolean — the user's "Canvas only" switch. When true, every
   *                                  search this turn is confined to `canvasPhotoIds` instead
   *                                  of the catalog (see canvas_chat_service.buildContext).
   *                                  A no-op with nothing placed, and only meaningful on a
   *                                  canvas turn.
   *   hidden?: boolean             — create the conversation already archived, so it never
   *                                  appears in the sidebar. Only read when this call creates
   *                                  the conversation. For guided template sessions, whose
   *                                  first turn is a generated brief; unlike `ephemeral` the
   *                                  conversation is fully persisted, so history, basket and
   *                                  "show me more" pagination keep working across turns.
   * }
   *
   * Response:
   * {
   *   conversationId: number       — conversation ID (new or existing; omitted for ephemeral)
   *   output: string               — agent reply
   *   toolsUsed: string[]          — tools invoked in this turn
   *   photoGroups: [...]           — grouped photo results
   * }
   *
   * A 500 also carries `conversationId` whenever the failure happened after the
   * conversation was resolved — the client needs it to retry in place.
   */
  public async chat({ request, response, auth }: HttpContext) {
    // Declared out here only so the catch can hand it back: by the time the agent can
    // fail, the conversation exists and the user's message is already in it. Without
    // this the client — which only learns the id from a successful response — would
    // start a NEW conversation on the next turn, orphaning the one it just wrote to
    // and taking its history with it. See the 500 handler at the bottom.
    let createdConversationId: number | undefined
    try {
      const user = auth.use('api').user!

      const {
        message,
        conversationId,
        contextPhotoIds,
        ephemeral,
        modeId,
        forceCheapModel,
        isKnowledgeAssistant,
        uiContext,
        hidden,
        templateId,
        templateScopeCollectionIds,
        curationMode,
        canvasId,
        canvasPhotoIds,
        canvasDiscardedIds,
        canvasFocusIds,
        canvasRegionIds,
        canvasSpotlightIds,
        canvasLayout,
        canvasGeometry,
        canvasScopedToCanvas,
      } = request.only([
        'message',
        'conversationId',
        'contextPhotoIds',
        'ephemeral',
        'modeId',
        'forceCheapModel',
        'isKnowledgeAssistant',
        'uiContext',
        'hidden',
        'templateId',
        'templateScopeCollectionIds',
        'curationMode',
        'canvasId',
        'canvasPhotoIds',
        'canvasDiscardedIds',
        'canvasFocusIds',
        'canvasRegionIds',
        'canvasSpotlightIds',
        'canvasLayout',
        'canvasGeometry',
        'canvasScopedToCanvas',
      ])

      const isEphemeral = ephemeral === true

      if (modeId !== undefined && findChatIntelligenceMode(modeId) === null) {
        return response.badRequest({
          message: 'The "modeId" field is invalid.',
          availableModeIds: listChatIntelligenceModes().map((mode: { id: string }) => mode.id),
        })
      }

      const selectedMode = resolveChatIntelligenceMode(modeId)

      // Only the id crosses the wire. The tool allowlist and the prompts a template swaps
      // in are resolved here and never read from the request body — accepting either from
      // the caller would be a way to reconfigure the agent from outside.
      const selectedTemplate = findChatTemplate(templateId)
      if (templateId !== undefined && templateId !== null && selectedTemplate === null) {
        return response.badRequest({
          message: 'The "templateId" field is invalid.',
          availableTemplateIds: listChatTemplateIds(),
        })
      }

      // The collections the session was pinned to, if its template takes a scope. Unlike the
      // allowlist and the prompts these are the user's own data — sanitised, not authorised:
      // scopes resolve against `user_id`, so an id that isn't theirs contributes no photos.
      const templateScope = resolveTemplateScopeCollectionIds(
        selectedTemplate,
        templateScopeCollectionIds
      )

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return response.badRequest({
          message: 'The "message" field is required and must be a non-empty string.',
        })
      }

      let validatedPhotoIds: number[] = []
      if (contextPhotoIds !== undefined) {
        if (!Array.isArray(contextPhotoIds)) {
          return response.badRequest({
            message: 'The "contextPhotoIds" field must be an array of numeric photo IDs.',
          })
        }
        if (contextPhotoIds.length > 10) {
          return response.badRequest({
            message: 'You can provide at most 10 context photos.',
          })
        }
        validatedPhotoIds = (contextPhotoIds as any[])
          .filter((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)
          .slice(0, 10)
      }

      // Resolve or create conversation (skipped for ephemeral calls)
      let resolvedConversationId: number
      // Photos the user pinned in this conversation. Only an existing conversation can
      // have any — a brand-new one has nothing pinned yet, and an ephemeral call has no
      // conversation at all.
      let basketPhotoIds: number[] = []

      // A canvas turn resolves through the canvas, not through the id the client sent:
      // the binding is server-owned, so a stale client cannot fork a second chat for a
      // board that already has one. A canvas that isn't this user's falls through to the
      // ordinary path rather than failing the turn.
      const canvasSession =
        !isEphemeral && canvasId !== undefined && canvasId !== null
          ? await this.canvasChatService.resolveSession(Number(canvasId), user.id, message.trim())
          : null
      const canvasConversation = canvasSession?.conversation ?? null

      // Only for a turn that actually runs in a canvas conversation. A `canvasPhotoIds`
      // arriving without a resolvable `canvasId` describes a board this turn is not
      // attached to, and acting on it would silently exclude photos from an ordinary chat.
      const canvasContext = canvasSession
        ? this.canvasChatService.buildContext(
            canvasPhotoIds,
            canvasFocusIds,
            canvasRegionIds,
            canvasSpotlightIds,
            canvasLayout,
            canvasDiscardedIds,
            canvasSession.canvas.name,
            canvasScopedToCanvas
          )
        : null

      if (isEphemeral) {
        resolvedConversationId = 0 // no conversation — agent will receive empty history
      } else if (canvasConversation) {
        resolvedConversationId = canvasConversation.id
        basketPhotoIds = canvasConversation.selectedPhotoIds ?? []
      } else if (conversationId) {
        const conv = await this.conversationService.verifyOwnership(conversationId, user.id)
        if (!conv) {
          return response.notFound({ message: 'Conversation not found.' })
        }
        resolvedConversationId = conv.id
        basketPhotoIds = conv.selectedPhotoIds ?? []
      } else {
        // `hidden` only has any effect here, on the turn that creates the
        // conversation — a later turn can't retroactively take it out of the
        // sidebar, and shouldn't be able to put someone else's back in.
        const conv = await this.conversationService.create(user.id, message.trim(), {
          hidden: hidden === true,
        })
        resolvedConversationId = conv.id
      }

      // From here on a failure can still return the id — see the declaration above.
      // Ephemeral calls stay undefined: there is no conversation to go back to.
      if (!isEphemeral) createdConversationId = resolvedConversationId

      // Persist user message in DB (skipped for ephemeral calls)
      if (!isEphemeral) {
        // On a canvas turn, snapshot the photos the agent actually SAW this turn (the
        // focus and the spotlight) onto the user message. The board's focus can move while the agent
        // thinks, so without this the reply loses any reference to what it answered
        // about. Server-derived from the already-sanitised context — no new request
        // field, and the ids are the user's own (ownership resolves downstream).
        //
        // A REGION turn saw no photos as images — the selection outgrew what the chat can
        // be shown, so no focus travelled — and there the snapshot is a COUNT: the record
        // says the question was asked over a region of N, which is all the reply itself
        // was given about them.
        const regionCount =
          canvasContext && canvasContext.focusIds.length === 0
            ? canvasContext.regionIds.length
            : 0
        // The board rectangles of the focus/spotlight photos, so a past message can redraw
        // the same 2D crop the composer showed. Persistence only — filtered to the ids this
        // turn actually describes, and never handed to the agent. A region carries none.
        const geometry = canvasContext
          ? CanvasChatService.cleanGeometry(canvasGeometry, [
              ...canvasContext.focusIds,
              ...canvasContext.spotlightIds,
            ])
          : []
        const canvasFocusMeta =
          canvasContext &&
          (canvasContext.focusIds.length > 0 ||
            canvasContext.spotlightIds.length > 0 ||
            regionCount > 0)
            ? {
                canvasFocus: {
                  focusedIds: canvasContext.focusIds,
                  spotlightIds: canvasContext.spotlightIds,
                  boardCount: canvasContext.photoIds.length,
                  ...(regionCount > 0 && { regionCount }),
                  ...(geometry.length > 0 && { geometry }),
                },
              }
            : undefined
        await this.conversationService.addUserMessage(
          resolvedConversationId,
          message.trim(),
          validatedPhotoIds,
          canvasFocusMeta
        )
      }

      // ── Credit gate ──────────────────────────────────────
      // Credits first: the free bag only kicks in once the user can't afford it.
      const freeShotCategory: FreeShotCategory =
        isKnowledgeAssistant === true ? 'CHAT_KNOWLEDGE_ASSISTANT' : 'CHAT'
      const minCredits = isKnowledgeAssistant === true ? 5 : 20
      const freeShot = await FreeShotsService.tryConsumeFreeBag(
        user.id,
        freeShotCategory,
        minCredits
      )

      if (freeShot === 'exhausted') {
        return response.status(402).json({
          code: 'QUOTA_EXHAUSTED',
          category: freeShotCategory,
          dailyLimit: FREE_DAILY_SHOTS[freeShotCategory],
        })
      }

      if (!freeShot) {
        const hasCredits = await CreditService.canAfford(user.id, minCredits)
        if (!hasCredits) {
          return response.status(402).json({
            code: 'INSUFFICIENT_CREDITS',
            message: 'No credits remaining. Please purchase more credits to continue.',
          })
        }
      }

      // Route to knowledge-only agent when forced via parameter or when user has no analyzed photos.
      // This prevents Phase 1 tool orchestration from hallucinating on empty results.
      const analyzedCount = await Photo.query()
        .where('user_id', user.id)
        .whereNotNull('descriptions')
        .whereRaw(`descriptions->>'artistic_scores' IS NOT NULL`)
        .count('* as total')
        .then((r) => Number(r[0].$extras.total ?? 0))

      let result
      if (isKnowledgeAssistant === true || analyzedCount === 0) {
        console.log(
          isKnowledgeAssistant === true
            ? `[ChatController] 🧠 Forcing knowledge agent (isKnowledgeAssistant=true)`
            : `[ChatController] 📭 No analyzed photos — routing to knowledge agent`
        )
        result = await new LangchainAgentKnowledgeService().chat(
          user.id,
          resolvedConversationId,
          message.trim(),
          typeof uiContext === 'string' ? uiContext : undefined
        )
      } else {
        result = await new LangchainAgentService().chat(
          user.id,
          resolvedConversationId,
          message.trim(),
          validatedPhotoIds,
          selectedMode,
          forceCheapModel === true,
          basketPhotoIds,
          selectedTemplate,
          templateScope,
          curationMode === true,
          canvasContext
        )
      }

      // Persist assistant message in DB (skipped for ephemeral calls)
      if (!isEphemeral) {
        await this.conversationService.addAssistantMessage(
          resolvedConversationId,
          result.output,
          result.photoGroups,
          false,
          result.cost?.total?.costEur,
          {
            // The curator's name for this turn's whole selection. Phase 3 reads it back to
            // title anything that spans the full set (it never writes a name itself).
            selectionTitle: result.selectionTitle,
            toolsUsed: result.toolsUsed,
            // Replayed into the next turn's Phase 1 context — see AgentChatResult.searchCalls.
            ...(result.searchCalls &&
              result.searchCalls.length > 0 && { searchCalls: result.searchCalls }),
            totalIterations: result.totalIterations,
            costEur: result.cost?.total?.costEur,
            tokens: result.cost?.total
              ? {
                  input: result.cost.total.inputTokens,
                  cached: result.cost.total.cachedTokens,
                  output: result.cost.total.outputTokens,
                }
              : undefined,
          }
        )
      }

      // Record chat cost to user history (analytics).
      // The pre-flight query classifier is logged apart, as `chat_routing`: it runs on a
      // different (cheap) model and is worth watching on its own. Its cost is subtracted
      // from the `chat_message` row so the two rows still sum to the real turn cost —
      // credits below are charged once, on the total.
      const recordCategory = isKnowledgeAssistant === true ? 'chat_knowledge_assistant' : 'chat'
      const costReferenceId = isEphemeral ? undefined : String(resolvedConversationId)
      const routingUsage = result.cost?.classifier
      const turnCostEur = result.cost?.total?.costEur ?? 0
      const agentCostEur = Math.max(0, turnCostEur - (routingUsage?.costEur ?? 0))

      if (agentCostEur > 0) {
        UserCostService.record(user.id, recordCategory, agentCostEur, 1, {
          referenceId: costReferenceId,
          task: 'chat_message',
          free: freeShot,
          metadata: result.cost?.total
            ? {
                inputTokens: result.cost.total.inputTokens - (routingUsage?.inputTokens ?? 0),
                cachedTokens: result.cost.total.cachedTokens - (routingUsage?.cachedTokens ?? 0),
                outputTokens: result.cost.total.outputTokens - (routingUsage?.outputTokens ?? 0),
              }
            : undefined,
        }).catch(() => {})
      }

      if (routingUsage?.costEur) {
        UserCostService.record(user.id, recordCategory, routingUsage.costEur, 1, {
          model: routingUsage.model,
          referenceId: costReferenceId,
          task: 'chat_routing',
          free: freeShot,
          metadata: {
            inputTokens: routingUsage.inputTokens,
            cachedTokens: routingUsage.cachedTokens,
            outputTokens: routingUsage.outputTokens,
          },
        }).catch(() => {})
      }

      // Charge credits based on real cost
      if (!freeShot && result.cost?.total?.costEur) {
        const chargeCategory = isKnowledgeAssistant === true ? 'CHAT_KNOWLEDGE_ASSISTANT' : 'CHAT'
        CreditService.charge(user.id, result.cost.total.costEur, chargeCategory).catch(() => {})
      }

      // Strip photoDescriptions before sending to frontend (LLM-only field)
      const photoGroupsForFrontend = result.photoGroups.map(
        ({ photoDescriptions: _omit, ...g }) => g
      )

      return response.ok({
        ...(isEphemeral ? {} : { conversationId: resolvedConversationId }),
        ...result,
        photoGroups: photoGroupsForFrontend,
      })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error:', error)
      console.error('[ChatController] Stack:', error?.stack)
      return response.internalServerError({
        // The turn failed, but the conversation and the user's message survived it.
        // Returning the id lets the client retry INSIDE it instead of opening a new
        // one — which matters most in guided template sessions, where the lost
        // history is the brief the whole session runs on.
        ...(createdConversationId !== undefined && { conversationId: createdConversationId }),
        message: 'An error occurred while processing your message.',
        error: error?.message,
        stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
      })
    }
  }

  /**
   * Phase 3 — grounded action suggestions for the latest assistant turn.
   *
   * POST /api/chat/actions
   * Body: { conversationId: number }
   *
   * Returns typed, clickable actions the frontend renders under the message.
   * Idempotent: once generated they are persisted on the message metadata and
   * returned as-is on subsequent calls (no extra LLM cost).
   */
  public async chatActions({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const { conversationId } = request.only(['conversationId'])
      const convId = Number(conversationId)

      if (!convId || Number.isNaN(convId)) {
        return response.badRequest({ message: 'A valid "conversationId" is required.' })
      }

      const conv = await this.conversationService.verifyOwnership(convId, user.id)
      if (!conv) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      const ChatActionsService = (await import('#services/chat_actions_service')).default
      const result = await new ChatActionsService().generateForLatestTurn(user.id, convId)

      if (!result) {
        return response.ok({ actions: [], messageId: null })
      }

      // Record cost (analytics) — suggestions are cheap; not credit-gated.
      if (result.costEur > 0) {
        UserCostService.record(user.id, 'chat', result.costEur, 1, {
          referenceId: String(convId),
          task: 'chat_actions',
        }).catch(() => {})
        CreditService.charge(user.id, result.costEur, 'CHAT').catch(() => {})
      }

      return response.ok({ actions: result.actions, messageId: result.messageId })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error generating actions:', error)
      // Non-fatal for the UX — the chat message already rendered.
      return response.ok({ actions: [], messageId: null })
    }
  }

  /**
   * Mark one suggested action as used for a specific assistant message.
   *
   * POST /api/chat/actions/used
   * Body: { conversationId: number, messageId: number, action: { type, params } }
   */
  public async markChatActionUsed({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const { conversationId, messageId, action } = request.only([
        'conversationId',
        'messageId',
        'action',
      ])

      const convId = Number(conversationId)
      const msgId = Number(messageId)

      if (!convId || Number.isNaN(convId) || !msgId || Number.isNaN(msgId)) {
        return response.badRequest({
          message: 'Valid "conversationId" and "messageId" are required.',
        })
      }
      if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
        return response.badRequest({
          message: 'A valid "action" payload is required.',
        })
      }

      const conv = await this.conversationService.verifyOwnership(convId, user.id)
      if (!conv) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      const ConversationMessage = (await import('#models/conversation_message')).default
      const targetMessage = await ConversationMessage.query()
        .where('id', msgId)
        .where('conversation_id', convId)
        .where('role', 'assistant')
        .first()

      if (!targetMessage) {
        return response.notFound({ message: 'Assistant message not found.' })
      }

      const metadata = (targetMessage.metadata as any) ?? {}
      const actions = Array.isArray(metadata.actions) ? metadata.actions : []
      if (actions.length === 0) {
        return response.ok({ actions: [], updated: false })
      }

      const requestedSignature = this.actionSignature(action)
      let updated = false
      const nextActions = actions.map((candidate: any) => {
        if (this.actionSignature(candidate) !== requestedSignature) return candidate
        updated = true
        return { ...candidate, used: true }
      })

      if (updated) {
        targetMessage.metadata = {
          ...metadata,
          actions: nextActions,
        }
        await targetMessage.save()
      }

      return response.ok({ actions: nextActions, updated })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error marking action as used:', error)
      return response.internalServerError({
        message: 'Failed to mark action as used.',
      })
    }
  }

  /**
   * Persist the conversation's selection basket — the photos the user keeps aside
   * while curating, so the shelf survives a reload or a device change.
   *
   * POST /api/chat/basket
   * Body: { conversationId: number, photoIds: number[] }
   *
   * The whole basket is sent on every change (debounced client-side); the server
   * stores it as-is after filtering out ids that aren't the user's.
   *
   * Lives under /api/chat rather than /api/conversations/:id/basket so demo users
   * keep it: the read-only middleware allow-lists by static path prefix, which a
   * route with an id in the middle can't match.
   */
  public async updateBasket({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const { conversationId, photoIds } = request.only(['conversationId', 'photoIds'])
      const convId = Number(conversationId)

      if (!convId || Number.isNaN(convId)) {
        return response.badRequest({ message: 'A valid "conversationId" is required.' })
      }
      if (!Array.isArray(photoIds)) {
        return response.badRequest({
          message: 'The "photoIds" field must be an array of numeric photo IDs.',
        })
      }

      const requestedIds = (photoIds as any[])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)

      const saved = await this.conversationService.saveBasket(convId, user.id, requestedIds)

      if (saved === null) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      return response.ok({ selectedPhotoIds: saved })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error saving basket:', error)
      return response.internalServerError({
        message: 'An error occurred while saving your selection.',
        error: error?.message,
      })
    }
  }

  /**
   * Persist a conversation's curation-mode toggle (progressive exploration).
   *
   * POST /api/chat/curation-mode
   * Body: { conversationId: number, curationMode: boolean }
   *
   * Behaviour is driven per turn by the `curationMode` field on the chat request; this only
   * stores the toggle so it survives a reload. Under /api/chat for the same static-prefix
   * reason as the basket endpoint.
   */
  public async updateCurationMode({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const { conversationId, curationMode } = request.only(['conversationId', 'curationMode'])
      const convId = Number(conversationId)

      if (!convId || Number.isNaN(convId)) {
        return response.badRequest({ message: 'A valid "conversationId" is required.' })
      }

      const saved = await this.conversationService.saveCurationMode(
        convId,
        user.id,
        curationMode === true
      )

      if (saved === null) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      return response.ok({ curationMode: saved })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error saving curation mode:', error)
      return response.internalServerError({
        message: 'An error occurred while saving your preference.',
        error: error?.message,
      })
    }
  }

  /**
   * The conversation docked to a canvas, without creating one.
   *
   * GET /api/chat/canvas-session/:canvasId
   *
   * Returns `{ conversationId: number | null }` — null means this canvas has no chat yet,
   * which is the normal state of a board nobody has talked to. The client opens a blank
   * chat on null and lets the first message create the binding server-side.
   *
   * Under /api/chat rather than /api/canvas/:id/chat for the same reason as the basket
   * endpoint: the demo read-only middleware allow-lists by static path prefix.
   */
  public async getCanvasSession({ params, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const canvasId = Number(params.canvasId)

      if (!canvasId || Number.isNaN(canvasId)) {
        return response.badRequest({ message: 'A valid "canvasId" is required.' })
      }

      const conversationId = await this.canvasChatService.getBoundConversationId(canvasId, user.id)

      return response.ok({ conversationId })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error resolving canvas session:', error)
      return response.internalServerError({
        message: 'An error occurred while loading the canvas chat.',
        error: error?.message,
      })
    }
  }

  /**
   * Throw a canvas chat away so the next message starts a fresh one.
   *
   * POST /api/chat/canvas-session/reset
   * Body: { canvasId: number }
   *
   * POST rather than DELETE because the demo read-only middleware blocks every DELETE
   * outright, and a demo user resetting their own canvas chat is a read-only-safe action.
   */
  public async resetCanvasSession({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const { canvasId } = request.only(['canvasId'])
      const id = Number(canvasId)

      if (!id || Number.isNaN(id)) {
        return response.badRequest({ message: 'A valid "canvasId" is required.' })
      }

      const reset = await this.canvasChatService.resetConversation(id, user.id)
      if (!reset) {
        return response.notFound({ message: 'Canvas not found.' })
      }

      return response.ok({ conversationId: null })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error resetting canvas session:', error)
      return response.internalServerError({
        message: 'An error occurred while resetting the canvas chat.',
        error: error?.message,
      })
    }
  }

  /**
   * List available chat intelligence modes
   *
   * GET /api/chat/modes
   */
  public async listModes({ response }: HttpContext) {
    return response.ok({
      defaultModeId: getDefaultChatIntelligenceModeId(),
      modes: listChatIntelligenceModes(),
    })
  }

  /**
   * List user conversations
   *
   * GET /api/conversations
   */
  public async listConversations({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const page = Number(request.input('page', 1))
      const limit = Number(request.input('limit', 30))

      const result = await this.conversationService.listByUser(user.id, page, limit)

      return response.ok(result)
    } catch (error: any) {
      console.error('[ChatController] ❌ Error listing conversations:', error)
      return response.internalServerError({
        message: 'An error occurred while listing conversations.',
        error: error?.message,
      })
    }
  }

  /**
   * Get a single conversation with all messages
   *
   * GET /api/conversations/:id
   */
  public async getConversation({ params, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const convId = Number(params.id)

      if (!convId || isNaN(convId)) {
        return response.badRequest({ message: 'Invalid conversation ID.' })
      }

      const conversation = await this.conversationService.getWithMessages(convId, user.id)

      if (!conversation) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      return response.ok(conversation)
    } catch (error: any) {
      console.error('[ChatController] ❌ Error getting conversation:', error)
      return response.internalServerError({
        message: 'An error occurred while loading the conversation.',
        error: error?.message,
      })
    }
  }

  /**
   * Rename a conversation
   *
   * PATCH /api/conversations/:id
   *
   * Body: { title: string }
   */
  public async updateConversation({ params, request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const convId = Number(params.id)
      const { title } = request.only(['title'])

      if (!convId || isNaN(convId)) {
        return response.badRequest({ message: 'Invalid conversation ID.' })
      }

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return response.badRequest({ message: 'Title is required.' })
      }

      const success = await this.conversationService.rename(convId, user.id, title.trim())

      if (!success) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      return response.ok({ message: 'Conversation renamed.' })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error renaming conversation:', error)
      return response.internalServerError({
        message: 'An error occurred while renaming the conversation.',
        error: error?.message,
      })
    }
  }

  /**
   * Delete a conversation
   *
   * DELETE /api/conversations/:id
   */
  public async deleteConversation({ params, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!
      const convId = Number(params.id)

      if (!convId || isNaN(convId)) {
        return response.badRequest({ message: 'Invalid conversation ID.' })
      }

      const success = await this.conversationService.delete(convId, user.id)

      if (!success) {
        return response.notFound({ message: 'Conversation not found.' })
      }

      return response.ok({ message: 'Conversation deleted.' })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error deleting conversation:', error)
      return response.internalServerError({
        message: 'An error occurred while deleting the conversation.',
        error: error?.message,
      })
    }
  }

  /**
   * Reset chat history (legacy endpoint — now a no-op since frontend
   * simply creates a new conversation)
   *
   * GET /api/chat/reset
   */
  public async reset({ response, auth }: HttpContext) {
    try {
      auth.use('api').user!
      return response.ok({
        message: 'Chat history cleared successfully.',
      })
    } catch (error: any) {
      console.error('[ChatController] ❌ Error resetting chat:', error)
      return response.internalServerError({
        message: 'An error occurred while resetting chat history.',
        error: error?.message,
      })
    }
  }
}
