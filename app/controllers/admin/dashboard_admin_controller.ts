// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminDashboardService from '#services/admin/admin_dashboard_service'

export default class DashboardAdminController {
  async overview({ response }: HttpContext) {
    try {
      const data = await AdminDashboardService.getOverview()
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch dashboard overview',
        error: error.message,
      })
    }
  }
}
