import type { HttpContext } from '@adonisjs/core/http'
import LangchainAgentService from '#services/langchain_agent_service'

export default class ChatController {
  /**
   * Agentic chat endpoint
   *
   * POST /api/chat
   *
   * Body:
   * {
   *   message: string           — current user message
   *   contextPhotoIds?: number[] — up to 10 photo IDs to attach as visual context
   * }
   *
   * Response:
   * {
   *   output: string            — agent reply
   *   toolsUsed: string[]       — tools invoked in this turn
   * }
   */
  public async chat({ request, response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!

      const { message, contextPhotoIds } = request.only(['message', 'contextPhotoIds'])

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

      const agentService = new LangchainAgentService()
      const result = await agentService.chat(user.id, message.trim(), validatedPhotoIds)

      return response.ok(result)
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
   * Reset chat history
   *
   * GET /api/chat/reset
   *
   * Response:
   * {
   *   message: string — success message
   * }
   */
  public reset({ response, auth }: HttpContext) {
    try {
      const user = auth.use('api').user!

      LangchainAgentService.clearHistory(user.id)

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
