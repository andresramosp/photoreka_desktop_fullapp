import type { HttpContext } from '@adonisjs/core/http'
import { moderateImages } from '#desktop/cloud_functions'

/**
 * Escritorio: la moderación (Google Vision SafeSearch, sus reglas y el registro de infracciones en
 * la cuenta) se hace en el servicio de la nube, que tiene la clave. Aquí solo se reenvía.
 */
export default class SafeSearchController {
  public async check({ request, response, auth }: HttpContext) {
    const user = await auth.use('api').authenticate()
    const { images, photoIds } = request.only(['images', 'photoIds'])
    if (!Array.isArray(images) || images.length === 0) {
      return response.badRequest({ message: 'No images provided' })
    }
    try {
      return response.ok(await moderateImages(user.id, images, photoIds))
    } catch (error) {
      // Como en App: si la comprobación falla, no se bloquea la subida.
      console.error('Safe search check failed:', error)
      return response.ok({ passed: true, skipped: true })
    }
  }
}
