import type { HttpContext } from '@adonisjs/core/http'
import Canvas from '#models/canvas'
import { inject } from '@adonisjs/core'

@inject()
export default class CanvasController {
  /**
   * Obtener el canvas del usuario autenticado
   */
  async getCanvas({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvas = await Canvas.query()
        .where('userId', user.id)
        .orderBy('updatedAt', 'desc')
        .first()

      if (!canvas) {
        return response.ok(null)
      }

      return response.ok({
        id: canvas.id,
        name: canvas.name,
        data: canvas.data,
        createdAt: canvas.createdAt,
        updatedAt: canvas.updatedAt,
      })
    } catch (error) {
      return response.badRequest('Error fetching canvas')
    }
  }

  /**
   * Crear o actualizar el canvas del usuario (upsert)
   */
  async saveCanvas({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const { name, data } = request.only(['name', 'data'])

      if (!data) {
        return response.badRequest('Missing canvas data')
      }

      const canvas = await Canvas.updateOrCreate(
        { userId: user.id },
        { name: name || 'My Canvas', data }
      )

      return response.ok({
        id: canvas.id,
        name: canvas.name,
        data: canvas.data,
        createdAt: canvas.createdAt,
        updatedAt: canvas.updatedAt,
      })
    } catch (error) {
      return response.badRequest('Error saving canvas')
    }
  }

  /**
   * Eliminar el canvas del usuario
   */
  async deleteCanvas({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvas = await Canvas.query().where('userId', user.id).first()

      if (!canvas) {
        return response.notFound('Canvas not found')
      }

      await canvas.delete()

      return response.ok({ message: 'Canvas deleted' })
    } catch (error) {
      return response.badRequest('Error deleting canvas')
    }
  }
}
