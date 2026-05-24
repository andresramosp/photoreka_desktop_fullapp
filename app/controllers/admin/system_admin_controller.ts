// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import User from '#models/user'

type InvalidationType =
  | 'photoListChanged'
  | 'photosGeolocationUpdate'
  | 'photosDeleted'
  | 'analysisCompleted'
  | 'all'

export default class SystemAdminController {
  /**
   * POST /api/admin/system/cache/invalidate
   * Body: { type: InvalidationType, userId?: string | 'all', photoCount?: number }
   */
  async invalidateCache({ request, response }: HttpContext) {
    const {
      type,
      userId = 'all',
      photoCount = 10,
    } = request.only(['type', 'userId', 'photoCount']) as {
      type: InvalidationType
      userId: string
      photoCount: number
    }

    const validTypes: InvalidationType[] = [
      'photoListChanged',
      'photosGeolocationUpdate',
      'photosDeleted',
      'analysisCompleted',
      'all',
    ]

    if (!validTypes.includes(type)) {
      return response.badRequest({
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
      })
    }

    try {
      // Resolve target user IDs
      let userIds: string[]
      if (userId === 'all') {
        const users = await User.query().select('id')
        userIds = users.map((u) => String(u.id))
      } else {
        userIds = [userId]
      }

      const results: Record<string, string> = {}

      for (const uid of userIds) {
        try {
          if (type === 'photoListChanged') {
            await CacheInvalidationService.onPhotoListChanged(uid)
          } else if (type === 'photosGeolocationUpdate') {
            await CacheInvalidationService.onPhotosGeolocationUpdate(uid)
          } else if (type === 'photosDeleted') {
            await CacheInvalidationService.onPhotosDeleted(uid, photoCount)
          } else if (type === 'analysisCompleted') {
            await CacheInvalidationService.onAnalysisCompleted(uid, photoCount)
          } else if (type === 'all') {
            await CacheInvalidationService.onPhotoListChanged(uid)
            await CacheInvalidationService.onPhotosGeolocationUpdate(uid)
            await CacheInvalidationService.onPhotosDeleted(uid, 999)
            await CacheInvalidationService.onAnalysisCompleted(uid, 999)
          }
          results[uid] = 'ok'
        } catch (err) {
          results[uid] = `error: ${err.message}`
        }
      }

      return response.ok({
        message: 'Cache invalidation completed',
        type,
        userId,
        processedUsers: userIds.length,
        results,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to invalidate cache',
        error: error.message,
      })
    }
  }
}
