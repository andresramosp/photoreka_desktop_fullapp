// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminUsersService from '#services/admin/admin_users_service'
import UserActivity from '#models/user_activity'
import vine from '@vinejs/vine'

const updateUsageValidator = vine.compile(
  vine.object({
    analyzedPhotosLimit: vine.number().optional(),
    creditsAvailable: vine.number().optional(),
  })
)

export default class UsersAdminController {
  /**
   * List all users with optional filters
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = {
        search: request.input('search'),
        role: request.input('role'),
        isActive: request.input('isActive'),
        provider: request.input('provider'),
        sortBy: request.input('sortBy'),
        sortDir: request.input('sortDir'),
      }

      const users = await AdminUsersService.list(filters)
      return response.ok({ users })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch users',
        error: error.message,
      })
    }
  }

  /**
   * Get user detail
   */
  async show({ params, response }: HttpContext) {
    try {
      const user = await AdminUsersService.getDetail(params.id)
      if (!user) {
        return response.notFound({ message: 'User not found' })
      }
      return response.ok({ user })
    } catch (error) {
      return response.internalServerError({ message: 'Failed to fetch user', error: error.message })
    }
  }

  /**
   * Toggle user active status (activate/deactivate)
   */
  async toggleActive({ params, response }: HttpContext) {
    try {
      const result = await AdminUsersService.toggleActive(params.id)
      return response.ok({
        message: `User ${result.isActive ? 'activated' : 'deactivated'}`,
        ...result,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to toggle user status',
        error: error.message,
      })
    }
  }

  /**
   * Delete a user
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await AdminUsersService.deleteUser(params.id)
      return response.ok({ message: 'User deleted successfully' })
    } catch (error) {
      if (error.message === 'Cannot delete admin users') {
        return response.forbidden({ message: error.message })
      }
      return response.internalServerError({
        message: 'Failed to delete user',
        error: error.message,
      })
    }
  }

  /**
   * Update user usage (analyzed photos limit, credits available)
   */
  async updateUsage({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateUsageValidator)
      const usage = await AdminUsersService.updateUsage(params.id, data)
      return response.ok({ message: 'Usage updated successfully', usage })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to update usage',
        error: error.message,
      })
    }
  }

  /**
   * Get paginated activity log for a user
   */
  async activities({ params, request, response }: HttpContext) {
    try {
      const page = Number(request.input('page', 1))
      const limit = Math.min(Number(request.input('limit', 30)), 100)
      const type = request.input('type') || undefined

      const query = UserActivity.query().where('userId', params.id).orderBy('createdAt', 'desc')

      if (type) {
        query.where('type', type)
      }

      const result = await query.paginate(page, limit)

      return response.ok({
        activities: result.all().map((a) => ({
          id: a.id,
          type: a.type,
          action: a.action,
          description: a.description,
          metadata: a.metadata,
          createdAt: a.createdAt.toISO(),
        })),
        meta: result.getMeta(),
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch activities',
        error: error.message,
      })
    }
  }

  /**
   * Get paginated global activity log (all users)
   */
  async globalActivities({ request, response }: HttpContext) {
    try {
      const page = Number(request.input('page', 1))
      const limit = Math.min(Number(request.input('limit', 30)), 100)
      const type = request.input('type') || undefined
      const search = request.input('search') || undefined

      const query = UserActivity.query()
        .preload('user', (q) => q.select('id', 'name', 'email'))
        .orderBy('createdAt', 'desc')

      if (type) {
        query.where('type', type)
      }

      if (search) {
        query.whereHas('user', (uq) => {
          uq.where('name', 'ilike', `%${search}%`).orWhere('email', 'ilike', `%${search}%`)
        })
      }

      const result = await query.paginate(page, limit)

      return response.ok({
        activities: result.all().map((a) => ({
          id: a.id,
          type: a.type,
          action: a.action,
          description: a.description,
          metadata: a.metadata,
          createdAt: a.createdAt.toISO(),
          user: a.user ? { id: a.user.id, name: a.user.name, email: a.user.email } : null,
        })),
        meta: result.getMeta(),
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch global activities',
        error: error.message,
      })
    }
  }
}
