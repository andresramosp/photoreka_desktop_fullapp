import type { HttpContext } from '@adonisjs/core/http'
import pLimit from 'p-limit'
import ReportReviewManager, { REVIEW_TYPE_CONFIG } from '../managers/report_review_manager.js'
import type { ReviewType } from '../managers/report_review_manager.js'
import User from '#models/user'
import Photo from '#models/photo'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import UserCostService from '#services/user_cost_service'
import MailService from '#services/mail_service'
import { reportReviewBuildTemplate } from '../utils/email_templates.js'

const REVIEW_TYPES: ReviewType[] = ['general', 'story', 'context']
const BUILD_THRESHOLD_PHOTOS = 150
const BUILD_TIMEOUT_MS = 60 * 60 * 1000 // 60 minutos - tiempo máximo esperado para un build

// Escalones de threshold de cambios (fotos añadidas/borradas) según el tamaño del catálogo previo.
// Cada escalón define el número absoluto de cambios necesarios para disparar un rebuild
// cuando el catálogo previo tiene, como máximo, `maxPhotos` fotos.
const REBUILD_THRESHOLD_STEPS: { maxPhotos: number; threshold: number }[] = [
  { maxPhotos: 1_000, threshold: 250 },
  { maxPhotos: 5_000, threshold: 750 },
  { maxPhotos: 20_000, threshold: 1500 },
  { maxPhotos: Infinity, threshold: 2_500 },
]

function getRebuildThreshold(previousPhotosCount: number): number {
  const step = REBUILD_THRESHOLD_STEPS.find(({ maxPhotos }) => previousPhotosCount <= maxPhotos)
  return step!.threshold
}

export default class ReportReviewController {
  /**
   * Construye y almacena los patrones de todos los reviewTypes en el usuario
   * POST /report-review/build
   */
  public async buildPatterns({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      // Marcar inicio del build
      const userModelStart = await User.findOrFail(user.id)
      const existingPatterns = (userModelStart.catalogPatterns as any) || {}

      // Guard: si ya hay un build fresco en marcha, no lanzar otro (evita builds solapados
      // cuando varias peticiones a should-build pasan la evaluación casi a la vez)
      const existingStartedAt = existingPatterns.metadata?.buildStartedAt
      if (
        existingStartedAt &&
        Date.now() - new Date(existingStartedAt).getTime() < BUILD_TIMEOUT_MS
      ) {
        return response.ok({
          message: 'Build ya en progreso, no se lanza otro',
          buildStartedAt: existingStartedAt,
        })
      }

      userModelStart.catalogPatterns = {
        ...existingPatterns,
        metadata: {
          ...(existingPatterns.metadata || {}),
          buildStartedAt: new Date().toISOString(),
        },
      }
      await userModelStart.save()

      // Aviso interno de inicio de build (fire-and-forget, no bloquea el build)
      try {
        const mailService = new MailService()
        mailService
          .sendEmail({
            from: 'Photoreka <hello@photoreka.com>',
            to: 'andreschennai@gmail.com',
            subject: `[Photoreka] Build de patterns iniciado - user ${user.id} (${userModelStart.email})`,
            body: `<p>Se ha iniciado un build de catalog patterns.</p>
<ul>
  <li><strong>User ID:</strong> ${user.id}</li>
  <li><strong>Email:</strong> ${userModelStart.email}</li>
  <li><strong>Inicio:</strong> ${new Date().toISOString()}</li>
  <li><strong>Último build OK:</strong> ${existingPatterns.metadata?.buildDate || 'nunca'}</li>
  <li><strong>Fotos del último build:</strong> ${existingPatterns.metadata?.photosCount ?? 'N/A'}</li>
</ul>`,
          })
          .catch((err: any) => console.error('Error enviando aviso de inicio de build:', err))
      } catch (notifyError) {
        console.error('Error enviando aviso de inicio de build:', notifyError)
      }

      const reportReviewManager = new ReportReviewManager()
      const catalogPatterns: Record<string, any> = {}
      let totalCostInEur = 0

      // Obtener patrones previos del usuario para rebuild incremental
      const existingCatalogPatterns = (userModelStart.catalogPatterns as any) || {}

      // Procesar cada reviewType con límite de concurrencia (máximo 2 en paralelo)
      const limit = pLimit(1)
      const promises = REVIEW_TYPES.map((reviewType) =>
        limit(async () => {
          console.log(`Procesando patterns para reviewType: ${reviewType}`)

          // Obtener patrones previos para este reviewType (si existen)
          const previousPatterns = existingCatalogPatterns[reviewType] || []

          const result = await reportReviewManager.getPatterns(userId, reviewType, previousPatterns)
          catalogPatterns[reviewType] = result

          // Acumular costo y registrar inmediatamente (así queda guardado aunque el build falle en steps posteriores)
          if (result?.cost?.totalCostInEur) {
            totalCostInEur += result.cost.totalCostInEur
            UserCostService.record(user.id, 'report_review', result.cost.totalCostInEur, 1, {
              task: reviewType,
              model: REVIEW_TYPE_CONFIG[reviewType].model,
            }).catch(() => {})
          }

          return result
        })
      )

      await Promise.all(promises)

      // Obtener IDs de fotos PROCESADAS del usuario para metadata
      const photos = await Photo.query().where('user_id', user.id).preload('analyzerProcess')
      const processedPhotoIds = photos.filter((p) => p.status === 'processed').map((p) => p.id)

      // Guardar solo la sub-key 'patterns' de cada key de primer nivel
      const filteredCatalogPatterns: Record<string, any> = {}
      for (const key of Object.keys(catalogPatterns)) {
        filteredCatalogPatterns[key] = catalogPatterns[key]?.patterns
      }
      const userModel = await User.findOrFail(user.id)

      // Calcular fotos añadidas/borradas respecto al build anterior
      const previousMetadata = existingCatalogPatterns.metadata || {}
      const previousPhotoIdsSet = new Set<number>(previousMetadata.photoIds || [])
      const currentPhotoIdsSet = new Set<number>(processedPhotoIds)
      const photosAdded = processedPhotoIds.filter(
        (id: number) => !previousPhotoIdsSet.has(id)
      ).length
      const photosRemoved = (previousMetadata.photoIds || []).filter(
        (id: number) => !currentPhotoIdsSet.has(id)
      ).length
      const isRebuild = previousPhotoIdsSet.size > 0

      userModel.catalogPatterns = {
        metadata: {
          buildDate: new Date().toISOString(),
          photosCount: processedPhotoIds.length,
          photoIds: processedPhotoIds,
          totalCostInEur: parseFloat(totalCostInEur.toFixed(6)),
          // buildStartedAt se omite al completar exitosamente
        },
        ...filteredCatalogPatterns,
      }
      await userModel.save()

      // Enviar email de notificación al usuario
      try {
        const patternsByType: Record<
          string,
          { title: string; strength: string; isNew?: boolean }[]
        > = {}
        for (const [type, patterns] of Object.entries(filteredCatalogPatterns)) {
          if (Array.isArray(patterns)) {
            patternsByType[type] = patterns.map((p: any) => ({
              title: p.title || 'Untitled pattern',
              strength: p.strength || 'moderate',
              isNew: p.isNew || false,
            }))
          }
        }

        const html = reportReviewBuildTemplate(userModel.name || 'there', {
          isRebuild,
          photosAdded,
          photosRemoved,
          totalPhotos: processedPhotoIds.length,
          patternsByType,
          totalCostInEur,
          portfolioUrl: 'https://app.photoreka.com/report',
        })

        const mailService = new MailService()
        await mailService.sendEmail({
          from: 'Photoreka <hello@photoreka.com>',
          to: userModel.email,
          subject: isRebuild
            ? 'Your report and usage patterns have been updated'
            : 'Your usage patterns are ready',
          body: html,
        })
      } catch (emailError) {
        console.error('Error enviando email de portfolio review:', emailError)
      }

      return response.ok({
        message: 'Patterns construidos y almacenados exitosamente',
        catalogPatterns,
        totalCostInEur: totalCostInEur.toFixed(6),
      })
    } catch (error) {
      console.error('Error en buildPatterns:', error)
      // Limpiar el flag de buildStartedAt en caso de error
      try {
        const user = auth.use('api').user! as any
        const userModel = await User.findOrFail(user.id)
        const patterns = (userModel.catalogPatterns as any) || {}
        if (patterns.metadata?.buildStartedAt) {
          delete patterns.metadata.buildStartedAt
          userModel.catalogPatterns = patterns
          await userModel.save()
        }
      } catch (cleanupError) {
        console.error('Error limpiando buildStartedAt:', cleanupError)
      }
      return response.internalServerError({
        message: 'Error construyendo patrones del portfolio',
        error: error.message,
      })
    }
  }

  /**
   * Decide si se debe hacer build y lo lanza de forma asíncrona
   * GET /report-review/should-build
   */
  public async shouldBuild({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id

      const userModel = await User.findOrFail(userId)
      const catalogPatterns = userModel.catalogPatterns as any

      // Verificar si hay un build en progreso
      if (catalogPatterns?.metadata?.buildStartedAt) {
        const buildStartedAt = new Date(catalogPatterns.metadata.buildStartedAt)
        const now = new Date()
        const elapsedMs = now.getTime() - buildStartedAt.getTime()

        if (elapsedMs < BUILD_TIMEOUT_MS) {
          // Build aún en progreso
          return response.ok({
            action: 'BUILDING',
            reason: `Build en progreso desde hace ${Math.floor(elapsedMs / 60000)} minutos`,
            stats: {
              currentPhotos: catalogPatterns.metadata.photosCount || 0,
              previousPhotos: catalogPatterns.metadata.photosCount || 0,
              photosAdded: 0,
              photosRemoved: 0,
              totalChanges: 0,
              changePercentage: 0,
              lastBuildDate: catalogPatterns.metadata.buildDate || null,
              buildStartedAt: catalogPatterns.metadata.buildStartedAt,
            },
          })
        } else {
          // Build expirado, continuar evaluación normal
        }
      }

      // Verificar si hay procesos de análisis activos (no finished ni failed)
      const activeProcesses = await AnalyzerProcess.query()
        .where('user_id', userId)
        .whereNotIn('current_stage', ['finished', 'failed'])

      if (activeProcesses.length > 0) {
        return response.ok({
          action: 'WAITING',
          reason: `Hay ${activeProcesses.length} procesos de análisis en progreso. Esperando finalización antes de evaluar build.`,
          stats: {
            currentPhotos: catalogPatterns.metadata?.photosCount || 0,
            previousPhotos: catalogPatterns.metadata?.photosCount || 0,
            photosAdded: 0,
            photosRemoved: 0,
            totalChanges: 0,
            changePercentage: 0,
            lastBuildDate: catalogPatterns.metadata?.buildDate || null,
            activeProcesses: activeProcesses.length,
          },
        })
      }

      // Obtener fotos PROCESADAS actuales del usuario
      const currentPhotos = await Photo.query().where('user_id', userId).preload('analyzerProcess')

      // Filtrar solo fotos PROCESADAS
      const currentPhotoIds = currentPhotos.filter((p) => p.status === 'processed').map((p) => p.id)
      const currentPhotosCount = currentPhotoIds.length

      // CASO 1: Sin build previo (si no hay catalogPatterns o no tiene metadata o metadata es el unico key)
      if (
        !catalogPatterns ||
        !catalogPatterns.metadata ||
        (Object.keys(catalogPatterns).length === 1 && catalogPatterns.metadata)
      ) {
        if (currentPhotosCount >= BUILD_THRESHOLD_PHOTOS) {
          // Lanzar build de forma asíncrona
          this.buildPatterns({ response, auth } as HttpContext).catch((error) => {
            console.error('Error en build asíncrono:', error)
          })

          return response.ok({
            action: 'BUILDING',
            reason: `Iniciando primer build con ${currentPhotosCount} fotos (threshold: ${BUILD_THRESHOLD_PHOTOS})`,
            stats: {
              currentPhotos: currentPhotosCount,
              previousPhotos: 0,
              photosAdded: currentPhotosCount,
              photosRemoved: 0,
              changePercentage: 100,
              lastBuildDate: null,
            },
          })
        } else {
          return response.ok({
            action: 'NONE',
            reason: `No hay suficientes fotos para build (${currentPhotosCount}/${BUILD_THRESHOLD_PHOTOS})`,
            stats: {
              currentPhotos: currentPhotosCount,
              previousPhotos: 0,
              photosAdded: 0,
              photosRemoved: 0,
              changePercentage: 0,
              lastBuildDate: null,
            },
          })
        }
      }

      // CASO 2: Con build previo
      const metadata = catalogPatterns.metadata
      const previousPhotoIds = new Set(metadata.photoIds || [])
      const currentPhotoIdsSet = new Set(currentPhotoIds)

      // Calcular cambios
      const photosAdded = currentPhotoIds.filter((id) => !previousPhotoIds.has(id)).length
      const photosRemoved = metadata.photoIds.filter(
        (id: number) => !currentPhotoIdsSet.has(id)
      ).length
      const totalChanges = photosAdded + photosRemoved
      const changePercentage =
        metadata.photosCount > 0 ? (totalChanges / metadata.photosCount) * 100 : 0
      const rebuildThreshold = getRebuildThreshold(metadata.photosCount)

      const stats = {
        currentPhotos: currentPhotosCount,
        previousPhotos: metadata.photosCount,
        photosAdded,
        photosRemoved,
        totalChanges,
        changePercentage: parseFloat(changePercentage.toFixed(2)),
        lastBuildDate: metadata.buildDate,
      }

      if (totalChanges >= rebuildThreshold) {
        // Lanzar rebuild de forma asíncrona
        this.buildPatterns({ response, auth } as HttpContext).catch((error) => {
          console.error('Error en rebuild asíncrono:', error)
        })

        return response.ok({
          action: 'RE-BUILDING',
          reason: `Cambio significativo detectado: ${totalChanges} fotos diferentes (threshold: ${rebuildThreshold})`,
          stats,
        })
      } else {
        return response.ok({
          action: 'NONE',
          reason: `Cambios insuficientes para rebuild: ${totalChanges} fotos diferentes (threshold: ${rebuildThreshold})`,
          stats,
        })
      }
    } catch (error) {
      console.error('Error en shouldBuild:', error)
      return response.internalServerError({
        message: 'Error evaluando necesidad de build',
        error: error.message,
      })
    }
  }

  /**
   * Obtiene los patrones identificados en el portfolio del usuario
   * GET /report-review/:reviewType
   */
  public async getPatterns({ params, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const reviewType = (params.reviewType || 'general') as ReviewType
      const reportReviewManager = new ReportReviewManager()
      const result = await reportReviewManager.getPatterns(userId, reviewType)

      if (result?.cost?.totalCostInEur) {
        UserCostService.record(user.id, 'report_review', result.cost.totalCostInEur, 1, {
          task: reviewType,
          model: REVIEW_TYPE_CONFIG[reviewType].model,
        }).catch(() => {})
      }

      return response.ok(result)
    } catch (error) {
      console.error('Error en getPatterns:', error)
      return response.internalServerError({
        message: 'Error analizando patrones del portfolio',
        error: error.message,
      })
    }
  }

  /**
   * Endpoint público para obtener patrones por userId
   * GET /report-review/:reviewType/user/:userId
   */
  public async getPatternsByUserId({ params, response }: HttpContext) {
    try {
      const { userId, reviewType } = params
      const reviewTypeParam = (reviewType || 'general') as ReviewType
      const reportReviewManager = new ReportReviewManager()
      const result = await reportReviewManager.getPatterns(userId, reviewTypeParam)

      if (result?.cost?.totalCostInEur) {
        UserCostService.record(parseInt(userId), 'report_review', result.cost.totalCostInEur, 1, {
          task: reviewTypeParam,
          model: REVIEW_TYPE_CONFIG[reviewTypeParam].model,
        }).catch(() => {})
      }

      return response.ok(result)
    } catch (error) {
      console.error('Error en getPatternsByUserId:', error)
      return response.internalServerError({
        message: 'Error analizando patrones del portfolio',
        error: error.message,
      })
    }
  }
}
