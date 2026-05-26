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

  /**
   * Paginated raw transaction log (cost_logs joined with users)
   */
  async transactions({ request, response }: HttpContext) {
    try {
      const page = Number(request.input('page', 1))
      const limit = Number(request.input('limit', 50))
      const dateFrom = request.input('dateFrom') as string | undefined
      const dateTo = request.input('dateTo') as string | undefined
      const category = request.input('category') as string | undefined
      const onlyCharged = request.input('onlyCharged') === 'true'

      const data = await AdminCostsService.getTransactions({
        page,
        limit,
        dateFrom,
        dateTo,
        category,
        onlyCharged,
      })
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch cost transactions',
        error: error.message,
      })
    }
  }
}
