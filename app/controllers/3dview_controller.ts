import type { HttpContext } from '@adonisjs/core/http'
import ThreeDManager from '../managers/3d_manager.js'

export default class ThreeDViewController {
  /**
   * Endpoint para obtener fotos con coordenadas 3D basadas en un chunk de descripción
   * Body: { chunkName }
   */
  public async get3DPhotos({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { chunkName } = request.body()

      const threeDManager = new ThreeDManager()
      const result = await threeDManager.get3DPhotos(userId, chunkName)

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
   * Body: { chunkName }
   */
  public async get3DPhotosByIdOrUsername({ request, response, params }: HttpContext) {
    try {
      const { id } = params
      const { chunkName } = request.body()

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
      const result = await threeDManager.get3DPhotos(userId, chunkName)

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
