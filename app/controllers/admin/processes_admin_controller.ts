// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminProcessesService from '#services/admin/admin_processes_service'
import AnalyzerPoolService from '#services/analyzer_pool_service'

export default class ProcessesAdminController {
  /**
   * List all analyzer processes with optional filters
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = {
        search: request.input('search'),
        stage: request.input('stage'),
        mode: request.input('mode'),
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
   * Get photos (thumbnails) for a process
   */
  async photos({ params, response }: HttpContext) {
    try {
      const photos = await AdminProcessesService.getPhotos(params.id)
      if (photos === null) {
        return response.notFound({ message: 'Process not found' })
      }
      return response.ok({ photos })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch process photos',
        error: error.message,
      })
    }
  }

  /**
   * Manual retry of a process (admin_retry mode)
   */
  async retry({ params, request, response }: HttpContext) {
    try {
      const notifyUser = !!request.input('notifyUser')
      const result = await AdminProcessesService.adminRetry(params.id, notifyUser)
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

  /**
   * Manually launch a queued process (bypasses the analyzer pool)
   */
  async launch({ params, response }: HttpContext) {
    try {
      const result = await AdminProcessesService.launchQueued(params.id)
      if (!result) {
        return response.notFound({ message: 'Process not found' })
      }
      if (result.error) {
        return response.badRequest({ message: result.error })
      }
      return response.ok({ message: 'Queued process launched', processId: result.processId })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to launch queued process',
        error: error.message,
      })
    }
  }

  /**
   * Current analyzer pool status (active/capacity)
   */
  async poolStatus({ response }: HttpContext) {
    try {
      const status = await AnalyzerPoolService.getStatus()
      return response.ok({ pool: status })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch pool status',
        error: error.message,
      })
    }
  }
}
