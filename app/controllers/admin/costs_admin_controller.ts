// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminCostsService from '#services/admin/admin_costs_service'

export default class CostsAdminController {
  /**
   * Full costs overview dashboard data
   */
  async overview({ request, response }: HttpContext) {
    try {
      const month = request.input('month') as string | undefined
      const data = await AdminCostsService.getOverview(month)
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch costs overview',
        error: error.message,
      })
    }
  }
}
