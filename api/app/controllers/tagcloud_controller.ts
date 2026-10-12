import type { HttpContext } from '@adonisjs/core/http'
import TagCloudManager from '../managers/tagcloud_manager.js'

export default class TagCloudController {
  /**
   * Devuelve los tags del usuario con coordenadas 2D para visualizarlos
   * flotando en un espacio formando clusters de proximidad semántica.
   * Body: { outputDims? } (default 2)
   */
  public async get2DTags({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { outputDims = 2, minPhotoCount = 1, limit = 10000 } = request.body() || {}

      const manager = new TagCloudManager()
      const result = await manager.getTagCloud(userId, outputDims, minPhotoCount, limit)

      return response.ok(result)
    } catch (error) {
      console.error('Error en get2DTags:', error)
      return response.internalServerError({
        message: 'Error generando visualización 2D de tags',
        error: error.message,
      })
    }
  }
}
