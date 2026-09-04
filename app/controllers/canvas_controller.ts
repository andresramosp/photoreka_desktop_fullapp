import type { HttpContext } from '@adonisjs/core/http'
import Canvas from '#models/canvas'
import CanvasChatService from '#services/canvas_chat_service'
import { inject } from '@adonisjs/core'

const EMPTY_CANVAS_DATA = { photos: [], discardedPhotos: [], currentZIndex: 1 }

@inject()
export default class CanvasController {
  private canvasChatService = new CanvasChatService()

  /**
   * Listar todos los canvas del usuario (sin campo data para response ligero)
   */
  async index({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvases = await Canvas.query().where('userId', user.id).orderBy('updatedAt', 'desc')

      return response.ok(
        canvases.map((c) => ({
          id: c.id,
          name: c.name,
          photoCount: c.data?.photos?.length ?? 0,
          updatedAt: c.updatedAt,
          createdAt: c.createdAt,
        }))
      )
    } catch (error) {
      return response.badRequest('Error fetching canvases')
    }
  }

  /**
   * Obtener un canvas completo con toda su data
   */
  async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvas = await Canvas.query().where('id', params.id).where('userId', user.id).first()

      if (!canvas) {
        return response.notFound('Canvas not found')
      }

      return response.ok({
        id: canvas.id,
        name: canvas.name,
        data: canvas.data,
        updatedAt: canvas.updatedAt,
        createdAt: canvas.createdAt,
      })
    } catch (error) {
      return response.badRequest('Error fetching canvas')
    }
  }

  /**
   * Crear un nuevo canvas (opcionalmente con data inicial)
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const { name, data } = request.only(['name', 'data'])

      const canvas = await Canvas.create({
        userId: user.id,
        name: name || 'New Canvas',
        data: data || EMPTY_CANVAS_DATA,
      })

      return response.created({
        id: canvas.id,
        name: canvas.name,
        data: canvas.data,
        updatedAt: canvas.updatedAt,
        createdAt: canvas.createdAt,
      })
    } catch (error) {
      return response.badRequest('Error creating canvas')
    }
  }

  /**
   * Actualizar la data de un canvas
   */
  async update({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvas = await Canvas.query().where('id', params.id).where('userId', user.id).first()

      if (!canvas) {
        return response.notFound('Canvas not found')
      }

      const { data } = request.only(['data'])

      if (!data) {
        return response.badRequest('Missing canvas data')
      }

      canvas.data = data
      await canvas.save()

      return response.ok({
        id: canvas.id,
        name: canvas.name,
        updatedAt: canvas.updatedAt,
      })
    } catch (error) {
      return response.badRequest('Error saving canvas')
    }
  }

  /**
   * Renombrar un canvas
   */
  async rename({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvas = await Canvas.query().where('id', params.id).where('userId', user.id).first()

      if (!canvas) {
        return response.notFound('Canvas not found')
      }

      const { name } = request.only(['name'])

      if (!name || name.trim().length === 0) {
        return response.badRequest('Name cannot be empty')
      }

      canvas.name = name.trim()
      await canvas.save()

      return response.ok({ id: canvas.id, name: canvas.name })
    } catch (error) {
      return response.badRequest('Error renaming canvas')
    }
  }

  /**
   * Eliminar un canvas
   */
  async destroy({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const canvas = await Canvas.query().where('id', params.id).where('userId', user.id).first()

      if (!canvas) {
        return response.notFound('Canvas not found')
      }

      // The docked chat has nowhere left to live: it is archived, so nothing but this
      // canvas could ever reach it again. Before the delete, so a failure here leaves the
      // canvas (and its chat) intact rather than orphaning the conversation for good.
      await this.canvasChatService.deleteConversationForCanvas(canvas)

      await canvas.delete()

      return response.ok({ message: 'Canvas deleted' })
    } catch (error) {
      return response.badRequest('Error deleting canvas')
    }
  }
}
