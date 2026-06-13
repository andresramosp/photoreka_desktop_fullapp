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
      const isGlobalInvalidation = userId === 'all'

      if (!isGlobalInvalidation) {
        const parsedUserId = Number(userId)
        if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
          return response.badRequest({
            message: 'Invalid userId. It must be a positive integer or "all".',
          })
        }

        const userExists = await User.query().where('id', parsedUserId).first()
        if (!userExists) {
          return response.notFound({
            message: `User ${parsedUserId} not found`,
          })
        }
      }

      // Resolve target user IDs
      let userIds: string[]
      if (isGlobalInvalidation) {
        const users = await User.query().select('id')
        userIds = users.map((u) => String(u.id))
      } else {
        userIds = [String(Number(userId))]
      }

      const results: Record<string, string> = {}

      for (const uid of userIds) {
        try {
          if (type === 'photoListChanged') {
            await CacheInvalidationService.onPhotoListChanged(uid)
          } else if (type === 'photosGeolocationUpdate') {
            await CacheInvalidationService.onPhotosGeolocationUpdate(uid)
          } else if (type === 'photosDeleted') {
            await CacheInvalidationService.onPhotosDeleted(uid, photoCount, {
              skipExpensiveWarmup: isGlobalInvalidation,
            })
          } else if (type === 'analysisCompleted') {
            await CacheInvalidationService.onAnalysisCompleted(uid, photoCount, {
              skipExpensiveWarmup: isGlobalInvalidation,
            })
          } else if (type === 'all') {
            await CacheInvalidationService.invalidateAll(uid, {
              skipExpensiveWarmup: isGlobalInvalidation,
            })
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
