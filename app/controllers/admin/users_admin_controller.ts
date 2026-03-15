// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminUsersService from '#services/admin/admin_users_service'
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
}
