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
   * Endpoint público para obtener fotos con coordenadas 3D por userId
   * Params: { userId }
   * Body: { chunkName }
   */
  public async get3DPhotosByUserId({ request, response, params }: HttpContext) {
    try {
      const { userId } = params
      const { chunkName } = request.body()

      if (!userId) {
        return response.badRequest({ message: 'El parámetro userId es requerido' })
      }

      const threeDManager = new ThreeDManager()
      const result = await threeDManager.get3DPhotos(userId, chunkName)

      return response.ok(result)
    } catch (error) {
      console.error('Error en get3DPhotosByUserId:', error)
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
