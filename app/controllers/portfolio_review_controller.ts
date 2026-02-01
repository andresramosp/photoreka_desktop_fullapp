import type { HttpContext } from '@adonisjs/core/http'
import PortfolioReviewManager from '../managers/portfolio_review_manager.js'
import type { ReviewType } from '../managers/portfolio_review_manager.js'
import User from '#models/user'
import Photo from '#models/photo'

const REVIEW_TYPES: ReviewType[] = ['general', 'story', 'context']
const BUILD_THRESHOLD_PHOTOS = 200
const REBUILD_THRESHOLD_CHANGES = 200 // Número absoluto de fotos añadidas/borradas para rebuild
const BUILD_TIMEOUT_MS = 60 * 60 * 1000 // 60 minutos - tiempo máximo esperado para un build

/**
 * Controlador para Portfolio Review
 *
 * NOTA: Para personalizar la configuración de cada reviewType (modelo LLM, fusión/independiente, retries),
 * edita el objeto REVIEW_TYPE_CONFIG en portfolio_review_manager.ts
 *
 * Ejemplo de configuración:
 * {
 *   general: {
 *     model: 'gpt-5.1',              // Modelo principal para análisis
 *     useProgressiveFusion: true,     // true: fusión progresiva, false: análisis independiente
 *     retryModel: 'gemini-2.5-flash', // Modelo para reintentos (opcional)
 *   }
 * }
 */
export default class PortfolioReviewController {
  /**
   * Construye y almacena los patrones de todos los reviewTypes en el usuario
   * POST /portfolio-review/build
   */
  public async buildPatterns({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      // Marcar inicio del build
      const userModelStart = await User.findOrFail(user.id)
      const existingPatterns = (userModelStart.catalogPatterns as any) || {}
      userModelStart.catalogPatterns = {
        ...existingPatterns,
        metadata: {
          ...(existingPatterns.metadata || {}),
          buildStartedAt: new Date().toISOString(),
        },
      }
      await userModelStart.save()

      const portfolioReviewManager = new PortfolioReviewManager()
      const catalogPatterns: Record<string, any> = {}
      let totalCostInEur = 0

      // Procesar cada reviewType secuencialmente
      for (const reviewType of REVIEW_TYPES) {
        console.log(`Procesando patterns para reviewType: ${reviewType}`)
        const result = await portfolioReviewManager.getPatterns(userId, reviewType)
        catalogPatterns[reviewType] = result

        // Acumular costo
        if (result?.cost?.totalCostInEur) {
          totalCostInEur += result.cost.totalCostInEur
        }
      }

      // Obtener IDs de fotos del usuario para metadata
      const photos = await Photo.query().where('user_id', user.id).select('id')
      const photoIds = photos.map((p) => p.id)

      // Guardar solo la sub-key 'patterns' de cada key de primer nivel
      const filteredCatalogPatterns: Record<string, any> = {}
      for (const key of Object.keys(catalogPatterns)) {
        filteredCatalogPatterns[key] = catalogPatterns[key]?.patterns
      }
      const userModel = await User.findOrFail(user.id)
      userModel.catalogPatterns = {
        metadata: {
          buildDate: new Date().toISOString(),
          photosCount: photoIds.length,
          photoIds: photoIds,
          // buildStartedAt se omite al completar exitosamente
        },
        ...filteredCatalogPatterns,
      }
      await userModel.save()

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
   * GET /portfolio-review/should-build
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
          // Build expirado, permitir nuevo build
          console.log(
            `Build expirado (${Math.floor(elapsedMs / 60000)} minutos). Permitiendo nuevo build.`
          )
        }
      }

      // Obtener fotos actuales del usuario
      const currentPhotos = await Photo.query().where('user_id', userId).select('id')
      const currentPhotoIds = currentPhotos.map((p) => p.id)
      const currentPhotosCount = currentPhotoIds.length

      // CASO 1: Sin build previo
      if (!catalogPatterns || !catalogPatterns.metadata) {
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

      const stats = {
        currentPhotos: currentPhotosCount,
        previousPhotos: metadata.photosCount,
        photosAdded,
        photosRemoved,
        totalChanges,
        changePercentage: parseFloat(changePercentage.toFixed(2)),
        lastBuildDate: metadata.buildDate,
      }

      if (totalChanges >= REBUILD_THRESHOLD_CHANGES) {
        // Lanzar rebuild de forma asíncrona
        this.buildPatterns({ response, auth } as HttpContext).catch((error) => {
          console.error('Error en rebuild asíncrono:', error)
        })

        return response.ok({
          action: 'RE-BUILDING',
          reason: `Cambio significativo detectado: ${totalChanges} fotos diferentes (threshold: ${REBUILD_THRESHOLD_CHANGES})`,
          stats,
        })
      } else {
        return response.ok({
          action: 'NONE',
          reason: `Cambios insuficientes para rebuild: ${totalChanges} fotos diferentes (threshold: ${REBUILD_THRESHOLD_CHANGES})`,
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
}
