import type { HttpContext } from '@adonisjs/core/http'
import ThreeDManager, { CANVAS_CLUSTER_MAX_PHOTOS } from '../managers/3d_manager.js'

export default class ThreeDViewController {
  /**
   * Agrupa las fotos de un tablero por criterio, para los botones "cluster by" del canvas.
   * Body: { chunkName, photoIds }
   */
  public async clusterPhotos({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { chunkName, photoIds } = request.body()
      if (!chunkName || typeof chunkName !== 'string') {
        return response.badRequest({ message: 'chunkName es requerido' })
      }
      const ids = Array.isArray(photoIds)
        ? photoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : []
      if (ids.length < 2) {
        return response.badRequest({ message: 'Se necesitan al menos dos fotos' })
      }
      if (ids.length > CANVAS_CLUSTER_MAX_PHOTOS) {
        return response.badRequest({
          message: `Como máximo ${CANVAS_CLUSTER_MAX_PHOTOS} fotos por petición`,
        })
      }

      const result = await new ThreeDManager().clusterPhotos(userId, chunkName, ids)
      return response.ok(result)
    } catch (error) {
      console.error('Error en clusterPhotos:', error)
      return response.internalServerError({
        message: 'Error agrupando las fotos del canvas',
        error: error.message,
      })
    }
  }

  /**
   * Endpoint para obtener fotos con coordenadas 3D basadas en un chunk de descripción
   * Body: { chunkName, outputDims? }
   */
  public async get3DPhotos({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { chunkName, outputDims = 3, limit = 5000 } = request.body()

      const threeDManager = new ThreeDManager()
      const result = await threeDManager.get3DPhotos(userId, chunkName, limit, outputDims)

      return response.ok(result)
    } catch (error) {
      console.error('Error en get3DPhotos:', error)
      return response.internalServerError({
        message: 'Error generando visualización 3D de fotos',
        error: error.message,
      })
    }
  }

  /**
   * Endpoint público para obtener fotos con coordenadas 3D por userId (numérico) o username (alfanumérico, parte antes de la @ en el email)
   * Params: { id } // puede ser userId (numérico) o username (alfanumérico)
   * Body: { chunkName, outputDims? }
   */
  public async get3DPhotosByIdOrUsername({ request, response, params }: HttpContext) {
    try {
      const { id } = params
      const { chunkName, outputDims = 3, limit = 5000 } = request.body()

      if (!id) {
        return response.badRequest({ message: 'El parámetro id es requerido' })
      }

      let userId: string
      if (/^\d+$/.test(id)) {
        // Es numérico, se asume userId
        userId = id
      } else {
        // Es alfanumérico, buscar por username (parte antes de la @ en el email)
        const User = (await import('../models/user.js')).default
        // Compatibilidad con PostgreSQL: usar POSITION y SUBSTRING
        const user = await User.query()
          .whereRaw("LOWER(SUBSTRING(email FROM 1 FOR POSITION('@' IN email) - 1)) = ?", [
            id.toLowerCase(),
          ])
          .first()

        if (!user) {
          return response.notFound({ message: 'Usuario no encontrado' })
        }
        userId = user.id.toString()
      }

      const threeDManager = new ThreeDManager()
      const result = await threeDManager.get3DPhotos(userId, chunkName, limit, outputDims)

      return response.ok(result)
    } catch (error) {
      console.error('Error en get3DPhotosByIdOrUsername:', error)
      return response.internalServerError({
        message: 'Error generando visualización 3D de fotos',
        error: error.message,
      })
    }
  }

  /**
   * Obtiene las categorías disponibles de chunks para un usuario
   */
  public async getAvailableCategories({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const threeDManager = new ThreeDManager()
      const result = await threeDManager.getAvailableCategories(userId)

      return response.ok(result)
    } catch (error) {
      console.error('Error obteniendo categorías:', error)
      return response.internalServerError({
        message: 'Error obteniendo categorías disponibles',
        error: error.message,
      })
    }
  }
}
