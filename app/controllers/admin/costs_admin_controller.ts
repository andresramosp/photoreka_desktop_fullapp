// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminCostsService from '#services/admin/admin_costs_service'

export default class CostsAdminController {
  /**
   * Full costs overview dashboard data
   */
  async overview({ request, response }: HttpContext) {
    try {
      const dateFrom = request.input('dateFrom') as string | undefined
      const dateTo = request.input('dateTo') as string | undefined
      const data = await AdminCostsService.getOverview(dateFrom, dateTo)
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch costs overview',
        error: error.message,
      })
    }
  }
}
