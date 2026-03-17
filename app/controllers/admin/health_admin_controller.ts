// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminHealthService from '#services/admin/admin_health_service'
import HealthRepairTracker from '#services/admin/health_repair_tracker'

export default class HealthAdminController {
  async overview({ response }: HttpContext) {
    try {
      const data = await AdminHealthService.overview()
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch health overview',
        error: error.message,
      })
    }
  }

  async userCheck({ params, response }: HttpContext) {
    try {
      const report = await AdminHealthService.userHealthCheck(Number(params.id))
      return response.ok({ report })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to run user health check',
        error: error.message,
      })
    }
  }

  async userRetry({ params, response }: HttpContext) {
    try {
      const result = await AdminHealthService.userRetry(Number(params.id))
      if (!result) {
        return response.notFound({ message: 'User not found' })
      }
      if (result.error) {
        return response.badRequest({ message: result.error })
      }
      return response.ok({
        message: 'Admin retry launched for user',
        processId: result.processId,
        photosCount: result.photosCount,
        taskId: result.taskId,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to launch user retry',
        error: error.message,
      })
    }
  }

  async globalEmbeddingsStatus({ response }: HttpContext) {
    try {
      const data = await AdminHealthService.globalEmbeddingsStatus()
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch global embeddings status',
        error: error.message,
      })
    }
  }

  async runGlobalEmbeddings({ response }: HttpContext) {
    try {
      const result = await AdminHealthService.runGlobalEmbeddings()
      return response.ok({
        message: 'Global embeddings task launched',
        ...result,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to launch global embeddings task',
        error: error.message,
      })
    }
  }

  async globalClipStatus({ response }: HttpContext) {
    try {
      const data = await AdminHealthService.globalClipStatus()
      return response.ok(data)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch global CLIP status',
        error: error.message,
      })
    }
  }

  async runGlobalClipEmbeddings({ response }: HttpContext) {
    try {
      const result = await AdminHealthService.runGlobalClipEmbeddings()
      return response.ok({
        message: 'Global CLIP embeddings task launched',
        ...result,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to launch global CLIP embeddings task',
        error: error.message,
      })
    }
  }

  async activeTasks({ response }: HttpContext) {
    try {
      const tasks = HealthRepairTracker.getRecentTasks()
      return response.ok({ tasks })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch active tasks',
        error: error.message,
      })
    }
  }
}
