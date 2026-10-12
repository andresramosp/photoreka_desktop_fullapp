import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import SuggestedCanvasService from '#services/suggested_canvas_service'

export default class SuggestedCanvasController {
  /**
   * GET /api/dashboard/suggested-canvas
   * `{ status: 'none' | 'generating' }`, or `{ status: 'ready', proposal }`.
   * The client polls while it reads `generating`.
   */
  public async show({ auth, response }: HttpContext) {
    await auth.use('api').check()
    const user = await User.findOrFail(auth.use('api').user!.id)
    try {
      const result = await new SuggestedCanvasService().getStatus(user)
      if (result.status !== 'ready') return response.ok({ status: result.status })
      return response.ok({
        status: 'ready',
        proposal: { title: result.proposal.title, photoIds: result.proposal.photoIds },
      })
    } catch (error) {
      console.error('[SuggestedCanvas] error:', error)
      return response.ok({ status: 'none' })
    }
  }

  /** POST /api/dashboard/suggested-canvas/seen */
  public async seen({ auth, response }: HttpContext) {
    await auth.use('api').check()
    const user = await User.findOrFail(auth.use('api').user!.id)
    await new SuggestedCanvasService().markSeen(user)
    return response.noContent()
  }

  /** POST /api/dashboard/suggested-canvas/opened */
  public async opened({ auth, response }: HttpContext) {
    await auth.use('api').check()
    const user = await User.findOrFail(auth.use('api').user!.id)
    await new SuggestedCanvasService().markOpened(user)
    return response.noContent()
  }
}
