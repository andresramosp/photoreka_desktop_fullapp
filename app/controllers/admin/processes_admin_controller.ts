// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminProcessesService from '#services/admin/admin_processes_service'

export default class ProcessesAdminController {
  /**
   * List all analyzer processes with optional filters
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = {
        search: request.input('search'),
        stage: request.input('stage'),
        sortBy: request.input('sortBy'),
        sortDir: request.input('sortDir'),
      }

      const processes = await AdminProcessesService.list(filters)
      return response.ok({ processes })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch processes',
        error: error.message,
      })
    }
  }

  /**
   * Get process detail
   */
  async show({ params, response }: HttpContext) {
    try {
      const process = await AdminProcessesService.getDetail(params.id)
      if (!process) {
        return response.notFound({ message: 'Process not found' })
      }
      return response.ok({ process })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch process',
        error: error.message,
      })
    }
  }

  /**
   * Run health check on a process
   */
  async healthCheck({ params, response }: HttpContext) {
    try {
      const report = await AdminProcessesService.healthCheck(params.id)
      if (!report) {
        return response.notFound({ message: 'Process not found' })
      }
      return response.ok({ report })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to run health check',
        error: error.message,
      })
    }
  }

  /**
   * Manual retry of a process (admin_retry mode)
   */
  async retry({ params, response }: HttpContext) {
    try {
      const result = await AdminProcessesService.adminRetry(params.id)
      if (!result) {
        return response.notFound({ message: 'Process not found' })
      }
      if (result.error) {
        return response.badRequest({ message: result.error })
      }
      return response.ok({ message: 'Admin retry launched', processId: result.processId })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to launch retry',
        error: error.message,
      })
    }
  }
}
