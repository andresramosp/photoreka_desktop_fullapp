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
   * Vista previa sobre una muestra del catálogo del usuario. Síncrona, sin escribir y
   * con la configuración del backend: devuelve los grupos de casi-duplicados con el
   * antes/después de cada foto. Solo se elige CUÁNTO se mira, no CÓMO se calcula.
   */
  async userScoreSmoothingPreview({ params, request, response }: HttpContext) {
    try {
      const { sampleSize, maxGroups, sampleSeed } = request.only([
        'sampleSize',
        'maxGroups',
        'sampleSeed',
      ])

      const report = await AdminScoreSmoothingService.previewForUser(Number(params.id), {
        sampleSize: sampleSize ? Number(sampleSize) : undefined,
        maxGroups: maxGroups ? Number(maxGroups) : undefined,
        sampleSeed,
      })
      if (!report) {
        return response.notFound({ message: 'User not found or has no analysed photos' })
      }

      return response.ok(report)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to preview score smoothing',
        error: error.message,
      })
    }
  }

  /**
   * Fotos del usuario que quedaron corregidas, con su antes y su después leídos de
   * base de datos. No recalcula nada: es el visor de lo que hay escrito.
   */
  async userScoreSmoothingApplied({ params, request, response }: HttpContext) {
    try {
      const { page, perPage } = request.qs()

      const result = await AdminScoreSmoothingService.appliedForUser(Number(params.id), {
        page: page ? Number(page) : undefined,
        perPage: perPage ? Number(perPage) : undefined,
      })
      if (!result) {
        return response.notFound({ message: 'User not found' })
      }

      return response.ok(result)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch applied score smoothing',
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
