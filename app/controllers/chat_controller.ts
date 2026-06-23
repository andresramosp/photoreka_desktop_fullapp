import type { HttpContext } from '@adonisjs/core/http'
import LangchainAgentService from '#services/langchain_agent_service'
import LangchainAgentKnowledgeService from '#services/langchain_agent_knowledge_service'
import ConversationService from '#services/conversation_service'
import Photo from '#models/photo'
import UserCostService from '#services/user_cost_service'
import CreditService from '#services/credit_service'
import FreeShotsService from '#services/free_shots_service'
import type { FreeShotCategory } from '#services/free_shots_service'
import {
  findChatIntelligenceMode,
  getDefaultChatIntelligenceModeId,
  listChatIntelligenceModes,
  resolveChatIntelligenceMode,
} from '../services/chat_intelligence_mode_service.js'

export default class ChatController {
  private conversationService = new ConversationService()

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
   * }
   *
   * Response:
   * {
   *   conversationId: number       — conversation ID (new or existing; omitted for ephemeral)
   *   output: string               — agent reply
   *   toolsUsed: string[]          — tools invoked in this turn
   *   photoGroups: [...]           — grouped photo results
   * }
   */
  public async chat({ request, response, auth }: HttpContext) {
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
      } = request.only([
        'message',
        'conversationId',
        'contextPhotoIds',
        'ephemeral',
        'modeId',
        'forceCheapModel',
        'isKnowledgeAssistant',
        'uiContext',
      ])

      const isEphemeral = ephemeral === true

      if (modeId !== undefined && findChatIntelligenceMode(modeId) === null) {
        return response.badRequest({
          message: 'The "modeId" field is invalid.',
          availableModeIds: listChatIntelligenceModes().map((mode: { id: string }) => mode.id),
        })
      }

      const selectedMode = resolveChatIntelligenceMode(modeId)

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

      if (isEphemeral) {
        resolvedConversationId = 0 // no conversation — agent will receive empty history
      } else if (conversationId) {
        const conv = await this.conversationService.verifyOwnership(conversationId, user.id)
        if (!conv) {
          return response.notFound({ message: 'Conversation not found.' })
        }
        resolvedConversationId = conv.id
      } else {
        const conv = await this.conversationService.create(user.id, message.trim())
        resolvedConversationId = conv.id
      }

      // Persist user message in DB (skipped for ephemeral calls)
      if (!isEphemeral) {
        await this.conversationService.addUserMessage(
          resolvedConversationId,
          message.trim(),
          validatedPhotoIds
        )
      }

      // ── Credit gate ──────────────────────────────────────
      // Consume the daily free allowance before touching real credits.
      const freeShotCategory: FreeShotCategory =
        isKnowledgeAssistant === true ? 'CHAT_KNOWLEDGE_ASSISTANT' : 'CHAT'
      const freeShot = await FreeShotsService.tryConsume(user.id, freeShotCategory)

      if (!freeShot) {
        const minCredits = isKnowledgeAssistant === true ? 5 : 20
        const hasCredits = await CreditService.canAfford(user.id, minCredits)
        if (!hasCredits) {
          return response.status(402).json({
            message:
              'No credits remaining. Please purchase more credits to continue. {url:/settings}',
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
          forceCheapModel === true
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
            toolsUsed: result.toolsUsed,
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

      // Record chat cost to user history (analytics)
      if (result.cost?.total?.costEur) {
        const recordCategory = isKnowledgeAssistant === true ? 'chat_knowledge_assistant' : 'chat'
        UserCostService.record(user.id, recordCategory, result.cost.total.costEur, 1, {
          referenceId: isEphemeral ? undefined : String(resolvedConversationId),
          task: 'chat_message',
          free: freeShot,
          metadata: result.cost?.total
            ? {
                inputTokens: result.cost.total.inputTokens,
                cachedTokens: result.cost.total.cachedTokens,
                outputTokens: result.cost.total.outputTokens,
              }
            : undefined,
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
        message: 'An error occurred while processing your message.',
        error: error?.message,
        stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
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
