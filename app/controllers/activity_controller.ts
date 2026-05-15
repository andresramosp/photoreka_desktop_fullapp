import type { HttpContext } from '@adonisjs/core/http'
import type { ActivityType } from '#models/user_activity'
import UserActivity from '#models/user_activity'

/** Activity types that are allowed to be submitted from the frontend. */
const ALLOWED_FRONTEND_TYPES: ReadonlySet<ActivityType> = new Set<ActivityType>([
  'photo_rank',
  'filter_apply',
  'ui_action',
])

export default class ActivityController {
  /**
   * POST /api/activity/log
   *
   * Accepts a frontend-initiated activity event.
   * Body: { type: ActivityType, metadata?: Record<string, any> }
   */
  async log({ request, auth, response }: HttpContext) {
    const { type, metadata } = request.only(['type', 'metadata'])

    if (!type || !ALLOWED_FRONTEND_TYPES.has(type as ActivityType)) {
      return response.badRequest({ message: 'Invalid or disallowed activity type.' })
    }

    const authedUser = auth.use('api').user!
    // Skip logging for impersonation sessions
    if ((authedUser as any)?.currentAccessToken?.name === 'impersonation') {
      return response.noContent()
    }
    const userId = authedUser.id

    await UserActivity.create({
      userId,
      type: type as ActivityType,
      action: `FRONTEND ${type}`,
      metadata: metadata && typeof metadata === 'object' ? metadata : null,
    })

    return response.noContent()
  }
}
