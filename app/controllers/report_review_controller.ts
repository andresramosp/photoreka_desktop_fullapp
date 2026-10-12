import type { HttpContext } from '@adonisjs/core/http'
import pLimit from 'p-limit'
import ReportReviewManager from '../managers/report_review_manager.js'
import type { ReviewType } from '../managers/report_review_manager.js'
import User from '#models/user'
import PhotoManager from '../managers/photo_manager.js'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import { CloudFunctionError, startReport } from '#desktop/cloud_functions'

const REVIEW_TYPES: ReviewType[] = ['general', 'story', 'context']

/**
 * Builds vivos en ESTE proceso. El flag persistido (catalogPatterns.metadata.buildStartedAt)
 * no sirve como candado: el catch de buildPatterns lo borra, así que si algo quedaba
 * corriendo el siguiente should-build lanzaba otro build encima.
 */
const buildsInProgress = new Set<string>()
const BUILD_THRESHOLD_PHOTOS = 150
const BUILD_TIMEOUT_MS = 60 * 60 * 1000 // 60 minutos - tiempo máximo esperado para un build

// Escalones de threshold de cambios (fotos añadidas/borradas) según el tamaño del catálogo previo.
// Cada escalón define el número absoluto de cambios necesarios para disparar un rebuild
// cuando el catálogo previo tiene, como máximo, `maxPhotos` fotos.
const REBUILD_THRESHOLD_STEPS: { maxPhotos: number; threshold: number }[] = [
  { maxPhotos: 1_000, threshold: 250 },
  { maxPhotos: 5_000, threshold: 1000 },
  { maxPhotos: 20_000, threshold: 2000 },
  { maxPhotos: Infinity, threshold: 3000 },
]

function getRebuildThreshold(previousPhotosCount: number): number {
  const step = REBUILD_THRESHOLD_STEPS.find(({ maxPhotos }) => previousPhotosCount <= maxPhotos)
  return step!.threshold
}

/**
 * Escritorio: los informes son gratis, pero la nube pone un tope diario de gasto por usuario. Se
 * consulta antes de lanzar uno, porque el agrupamiento local es costoso y sería en balde.
 */
async function reportAllowed(userId: number): Promise<boolean> {
  try {
    await startReport(userId)
    return true
  } catch (error) {
    if (!(error instanceof CloudFunctionError && error.status === 429)) {
      console.error('[report-review] No se pudo consultar el servicio de la nube:', error)
    }
    return false
  }
}

const REPORT_NOT_ALLOWED_REASON =
  'Informe no disponible ahora: límite diario alcanzado o sin conexión con el servicio de la nube'

export default class ReportReviewController {
  /**
   * Construye y almacena los patrones de todos los reviewTypes en el usuario
   * POST /report-review/build
   */
  public async buildPatterns({ response, auth }: HttpContext) {
    const buildStart = Date.now()
    let lockedUserId: string | null = null
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      if (buildsInProgress.has(userId)) {
        return response.ok({ message: 'Build ya en progreso en este proceso, no se lanza otro' })
      }
      buildsInProgress.add(userId)
      lockedUserId = userId

      if (!(await reportAllowed(user.id))) {
        return response.ok({ message: REPORT_NOT_ALLOWED_REASON })
      }

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

      const reportReviewManager = new ReportReviewManager()
      const catalogPatterns: Record<string, any> = {}

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
          return result
        })
      )

      // allSettled y no all: 'all' rechaza al primer fallo pero NO cancela lo que ya está
      // corriendo, dejando tareas huérfanas quemando CPU y coste sin que nadie las espere.
      const settled = await Promise.allSettled(promises)
      settled.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[report-review] reviewType "${REVIEW_TYPES[i]}" FALLIDO:`, r.reason)
        }
      })
      if (settled.every((r) => r.status === 'rejected')) {
        throw new Error('Todos los reviewTypes fallaron')
      }

      // Obtener IDs de fotos PROCESADAS del usuario para metadata
      const processedPhotoIds = await new PhotoManager().getProcessedPhotoIds(String(user.id))

      // Guardar solo la sub-key 'patterns' de cada key de primer nivel.
      // Un reviewType que haya fallado conserva sus patrones del build anterior en vez de
      // quedar borrado, y la metadata se actualiza igualmente para que should-build no
      // vuelva a disparar el mismo rebuild en bucle.
      const filteredCatalogPatterns: Record<string, any> = {}
      for (const key of REVIEW_TYPES) {
        filteredCatalogPatterns[key] =
          catalogPatterns[key]?.patterns ?? existingCatalogPatterns[key] ?? []
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
          // buildStartedAt se omite al completar exitosamente
        },
        ...filteredCatalogPatterns,
      }
      await userModel.save()

      console.log(
        `[report-review] BUILD COMPLETADO - user ${user.id} (${userModel.email}) | ` +
          `patrones: ${Object.entries(filteredCatalogPatterns)
            .map(([type, patterns]) => `${type}=${Array.isArray(patterns) ? patterns.length : 0}`)
            .join(' ')} | ` +
          `fotos: ${processedPhotoIds.length} (+${photosAdded}/-${photosRemoved}) | ` +
          `rebuild: ${isRebuild} | ` +
          `duracion: ${((Date.now() - buildStart) / 60000).toFixed(1)} min`
      )

      return response.ok({
        message: 'Patterns construidos y almacenados exitosamente',
        catalogPatterns,
      })
    } catch (error) {
      console.error(
        `[report-review] BUILD FALLIDO - user ${auth.use('api').user?.id ?? 'desconocido'} | ` +
          `duracion: ${((Date.now() - buildStart) / 60000).toFixed(1)} min`
      )
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
    } finally {
      if (lockedUserId) buildsInProgress.delete(lockedUserId)
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

      // Obtener fotos PROCESADAS actuales del usuario.
      // Filtrar en SQL y no en JS: traerlas con `select *` para quedarse con los ids
      // eran 32k modelos y ~500 MB de heap por llamada (embedding e histogramas van
      // en cada fila), y esto se llama en cada carga de la app.
      const currentPhotoIds = await new PhotoManager().getProcessedPhotoIds(String(userId))
      const currentPhotosCount = currentPhotoIds.length

      // CASO 1: Sin build previo (si no hay catalogPatterns o no tiene metadata o metadata es el unico key)
      if (
        !catalogPatterns ||
        !catalogPatterns.metadata ||
        (Object.keys(catalogPatterns).length === 1 && catalogPatterns.metadata)
      ) {
        if (currentPhotosCount >= BUILD_THRESHOLD_PHOTOS) {
          if (!(await reportAllowed(userId))) {
            return response.ok({ action: 'NONE', reason: REPORT_NOT_ALLOWED_REASON })
          }
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
        if (!(await reportAllowed(userId))) {
          return response.ok({ action: 'NONE', reason: REPORT_NOT_ALLOWED_REASON, stats })
        }
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
