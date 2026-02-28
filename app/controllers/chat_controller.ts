import type { HttpContext } from '@adonisjs/core/http'
import LangchainAgentService from '#services/langchain_agent_service'
import ConversationService from '#services/conversation_service'

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
   * }
   *
   * Response:
   * {
   *   conversationId: number       — conversation ID (new or existing)
   *   output: string               — agent reply
   *   toolsUsed: string[]          — tools invoked in this turn
   *   photoGroups: [...]           — grouped photo results
   * }
   */
  public async chat({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!

      const { message, conversationId, contextPhotoIds } = request.only([
        'message',
        'conversationId',
        'contextPhotoIds',
      ])

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

      // Resolve or create conversation
      let resolvedConversationId: number

      if (conversationId) {
        const conv = await this.conversationService.verifyOwnership(conversationId, user.id)
        if (!conv) {
          return response.notFound({ message: 'Conversation not found.' })
        }
        resolvedConversationId = conv.id
      } else {
        const conv = await this.conversationService.create(user.id, message.trim())
        resolvedConversationId = conv.id
      }

      // Persist user message in DB
      await this.conversationService.addUserMessage(
        resolvedConversationId,
        message.trim(),
        validatedPhotoIds
      )

      // Run the agent
      const agentService = new LangchainAgentService()
      const result = await agentService.chat(
        user.id,
        resolvedConversationId,
        message.trim(),
        validatedPhotoIds
      )

      // Persist assistant message in DB (with cost & metadata)
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

      // Strip photoDescriptions before sending to frontend (LLM-only field)
      const photoGroupsForFrontend = result.photoGroups.map(
        ({ photoDescriptions: _omit, ...g }) => g
      )

      return response.ok({
        conversationId: resolvedConversationId,
        ...result,
        photoGroups: photoGroupsForFrontend,
      })
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error('[ChatController] ❌ Error resetting chat:', error)
      return response.internalServerError({
        message: 'An error occurred while resetting chat history.',
        error: error?.message,
      })
    }
  }
}
