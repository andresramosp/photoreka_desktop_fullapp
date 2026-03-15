// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminCostsService from '#services/admin/admin_costs_service'

export default class CostsAdminController {
  /**
   * Full costs overview dashboard data
   */
  async overview({ response }: HttpContext) {
    try {
      const data = await AdminCostsService.getOverview()
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch costs overview',
        error: error.message,
      })
    }
  }
}
