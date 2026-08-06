// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AdminHealthService from '#services/admin/admin_health_service'
import HealthRepairTracker from '#services/admin/health_repair_tracker'
import AdminScoreSmoothingService from '#services/admin/admin_score_smoothing_service'

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

  async userImageCheck({ params, response }: HttpContext) {
    try {
      const report = await AdminHealthService.userImageHealthCheck(Number(params.id))
      return response.ok({ report })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to run user image health check',
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

  /**
   * Regulariza los scores artísticos de todo el catálogo de un usuario, con la
   * configuración del backend (no admite ajustes por petición). Escribe los valores
   * corregidos; `revert` devuelve los originales del LLM.
   * Body: { action?: 'run' | 'revert', dryRun?: boolean }
   * Se ejecuta en segundo plano; el progreso sale por /api/admin/health/tasks.
   */
  async userScoreSmoothing({ params, request, response }: HttpContext) {
    try {
      const { action, dryRun } = request.only(['action', 'dryRun'])

      if (action && !['run', 'revert'].includes(action)) {
        return response.badRequest({ message: `Unknown action: ${action}` })
      }
      const result = await AdminScoreSmoothingService.launch(Number(params.id), {
        action,
        dryRun: Boolean(dryRun),
      })
      if (!result) {
        return response.notFound({ message: 'User not found' })
      }

      return response.ok({ message: 'Score smoothing launched', ...result })
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to launch score smoothing',
        error: error.message,
      })
    }
  }

  /**
   * Pasada sobre el catálogo completo del usuario. `dryRun: true` (por defecto)
   * simula; `false` escribe. Es el mismo cálculo en los dos casos, y devuelve todos
   * los grupos con lo que se escribiría y lo que hay escrito, que es lo que separa lo
   * hecho de lo que falta.
   *
   * Síncrona: tarda lo que tarda una pasada entera y el cliente espera.
   * Body: { dryRun?: boolean }
   */
  async userScoreSmoothingRun({ params, request, response }: HttpContext) {
    try {
      const { dryRun } = request.only(['dryRun'])

      const report = await AdminScoreSmoothingService.runForUser(Number(params.id), {
        dryRun: dryRun !== false,
      })
      if (!report) {
        return response.notFound({ message: 'User not found or has no analysed photos' })
      }

      return response.ok(report)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to run score smoothing',
        error: error.message,
      })
    }
  }

  /** Último informe de regularización de scores del usuario (o null). */
  async userScoreSmoothingReport({ params, response }: HttpContext) {
    try {
      return response.ok(AdminScoreSmoothingService.getLastReport(Number(params.id)) ?? {})
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch score smoothing report',
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
