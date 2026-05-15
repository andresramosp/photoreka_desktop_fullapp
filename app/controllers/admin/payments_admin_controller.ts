// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminPaymentsService from '#services/admin/admin_payments_service'

export default class PaymentsAdminController {
  async overview({ response }: HttpContext) {
    try {
      const data = await AdminPaymentsService.getOverview()
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch payments overview',
        error: error.message,
      })
    }
  }

  async index({ request, response }: HttpContext) {
    try {
      const data = await AdminPaymentsService.list({
        page: Number(request.input('page', 1)),
        limit: Number(request.input('limit', 30)),
        search: request.input('search') || undefined,
        status: request.input('status') || undefined,
        type: request.input('type') || undefined,
        userId: request.input('userId') || undefined,
      })

      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch payments',
        error: error.message,
      })
    }
  }
}
