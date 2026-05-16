import type { HttpContext } from '@adonisjs/core/http'
import Series from '#models/series'
import SeriesSet from '#models/series_set'
import Photo from '#models/photo'
import db from '@adonisjs/lucid/services/db'
import { inject } from '@adonisjs/core'

@inject()
export default class SeriesController {
  /**
   * Obtener todas las series del usuario autenticado
   */
  async index({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const seriesList = await Series.query()
        .where('userId', user.id)
        .preload('photos', (query) => {
          query.orderBy('series_photos.order', 'asc')
        })
        .orderBy('createdAt', 'desc')

      // Formatear la respuesta para incluir información básica de las fotos con orden
      const formattedSeries = seriesList.map((series) => ({
        id: series.id,
        name: series.name,
        description: series.description,
        setId: series.setId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        photosCount: series.photos.length,
        photos: series.photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
          order: photo.$extras.pivot_order,
          descriptions: {
            visual_aspects: photo.descriptions?.visual_aspects || [],
            artistic_scores: photo.descriptions?.artistic_scores || [],
          },
        })),
      }))

      return response.ok(formattedSeries)
    } catch (error) {
      return response.badRequest('Error fetching series')
    }
  }

  /**
   * Obtener una serie específica
   */
  async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id

      const series = await Series.query()
        .where('id', seriesId)
        .where('userId', user.id)
        .preload('photos', (query) => {
          query.orderBy('series_photos.order', 'asc')
        })
        .first()

      if (!series) {
        return response.notFound('Series not found')
      }

      const formattedSeries = {
        id: series.id,
        name: series.name,
        description: series.description,
        setId: series.setId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        photos: series.photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
          title: photo.title,
          order: photo.$extras.pivot_order,
          descriptions: photo.descriptions,
        })),
      }

      return response.ok(formattedSeries)
    } catch (error) {
      return response.badRequest('Error fetching series')
    }
  }

  /**
   * Obtener una serie por nombre y username del usuario
   */
  async showByName({ params, request, response }: HttpContext) {
    try {
      const { name } = params
      const { userId: username } = request.qs()
      // Decodificar el nombre que puede venir con espacios codificados como %20
      const seriesName = decodeURIComponent(name)

      // Buscar usuario por username (parte antes de la @ en el email)
      const User = (await import('#models/user')).default
      const user = await User.query()
        .whereRaw("LOWER(SUBSTRING(email FROM 1 FOR POSITION('@' IN email) - 1)) = ?", [
          username.toLowerCase(),
        ])
        .first()

      if (!user) {
        return response.notFound('User not found')
      }

      const series = await Series.query()
        .whereRaw('LOWER(name) = ?', [seriesName.toLowerCase()])
        .where('userId', user.id)
        .preload('photos', (query) => {
          query.orderBy('series_photos.order', 'asc')
        })
        .first()

      if (!series) {
        return response.notFound('Series not found')
      }

      const formattedSeries = {
        id: series.id,
        name: series.name,
        description: series.description,
        setId: series.setId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        photos: series.photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
          title: photo.title,
          order: photo.$extras.pivot_order,
          descriptions: photo.descriptions,
        })),
      }

      return response.ok(formattedSeries)
    } catch (error) {
      return response.badRequest('Error fetching series by name')
    }
  }

  /**
   * Crear una nueva serie
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { name, description, photoIds, setId } = request.only([
        'name',
        'description',
        'photoIds',
        'setId',
      ])

      if (!name || name.trim().length === 0) {
        return response.badRequest('Series name is required')
      }

      // Verificar que no existe otra serie con el mismo nombre para este usuario
      const existingSeries = await Series.query()
        .where('userId', user.id)
        .where('name', name.trim())
        .first()

      if (existingSeries) {
        return response.badRequest('A series with this name already exists')
      }

      if (setId) {
        const set = await SeriesSet.query().where('id', setId).where('userId', user.id).first()

        if (!set) {
          return response.notFound('Series set not found')
        }
      }

      // Crear la serie
      const series = await Series.create({
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        setId: setId || null,
      })

      // Si se proporcionaron fotos iniciales, añadirlas a la serie con orden
      if (photoIds && Array.isArray(photoIds) && photoIds.length > 0) {
        // Verificar que las fotos pertenecen al usuario
        const photos = await Photo.query().whereIn('id', photoIds).where('userId', user.id)

        if (photos.length !== photoIds.length) {
          return response.badRequest('Some photos not found or do not belong to user')
        }

        // Crear objeto con los photoIds y su orden correspondiente
        const photosWithOrder: Record<number, { order: number }> = {}
        photoIds.forEach((photoId: number, index: number) => {
          photosWithOrder[photoId] = { order: index }
        })

        // Usar la relación many-to-many para asociar las fotos con su orden
        await series.related('photos').attach(photosWithOrder)
      }

      // Cargar la serie con sus fotos para devolverla
      await series.load('photos', (query) => {
        query.orderBy('series_photos.order', 'asc')
      })

      const formattedSeries = {
        id: series.id,
        name: series.name,
        description: series.description,
        setId: series.setId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        photos: series.photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
          order: photo.$extras.pivot_order,
        })),
      }

      return response.created(formattedSeries)
    } catch (error) {
      return response.badRequest('Error creating series')
    }
  }

  /**
   * Actualizar una serie (nombre y descripción)
   */
  async update({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id
      const { name, description } = request.only(['name', 'description'])

      const series = await Series.query().where('id', seriesId).where('userId', user.id).first()

      if (!series) {
        return response.notFound('Series not found')
      }

      if (!name || name.trim().length === 0) {
        return response.badRequest('Series name is required')
      }

      series.name = name.trim()
      series.description = description?.trim() || null
      await series.save()

      return response.ok({
        id: series.id,
        name: series.name,
        description: series.description,
        setId: series.setId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
      })
    } catch (error) {
      return response.badRequest('Error updating series')
    }
  }

  /**
   * Eliminar una serie
   */
  async destroy({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id

      const series = await Series.query().where('id', seriesId).where('userId', user.id).first()

      if (!series) {
        return response.notFound('Series not found')
      }

      // Con many-to-many, primero desasociamos todas las fotos
      await series.related('photos').detach()

      // Eliminar la serie
      await series.delete()

      return response.ok({ message: 'Series deleted successfully' })
    } catch (error) {
      return response.badRequest('Error deleting series')
    }
  }

  /**
   * Eliminar múltiples series de una vez
   */
  async destroyMany({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { ids } = request.only(['ids'])

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return response.badRequest('Series IDs are required')
      }

      const seriesList = await Series.query().whereIn('id', ids).where('userId', user.id)

      if (seriesList.length === 0) {
        return response.notFound('No matching series found')
      }

      for (const series of seriesList) {
        await series.related('photos').detach()
        await series.delete()
      }

      return response.ok({
        message: `${seriesList.length} series deleted successfully`,
        deletedCount: seriesList.length,
      })
    } catch (error) {
      return response.badRequest('Error deleting series')
    }
  }

  /**
   * Añadir fotos a una serie
   */
  async addPhotos({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id
      const { photoIds } = request.only(['photoIds'])

      if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        return response.badRequest('Photo IDs are required')
      }

      const series = await Series.query().where('id', seriesId).where('userId', user.id).first()

      if (!series) {
        return response.notFound('Series not found')
      }

      // Verificar que las fotos pertenecen al usuario
      const photos = await Photo.query().whereIn('id', photoIds).where('userId', user.id)

      if (photos.length !== photoIds.length) {
        return response.badRequest('Some photos not found or do not belong to user')
      }

      // Cargar las fotos existentes en la serie
      await series.load('photos')
      const existingPhotoIds = series.photos.map((photo) => photo.id)
      const newPhotoIds = photoIds.filter((id: number) => !existingPhotoIds.includes(id))

      if (newPhotoIds.length === 0) {
        return response.badRequest('All photos are already in the series')
      }

      // Obtener el máximo orden actual
      const maxOrderResult = await db
        .from('series_photos')
        .where('series_id', seriesId)
        .max('order as maxOrder')
        .first()

      const startOrder = (maxOrderResult?.maxOrder ?? -1) + 1

      // Crear objeto con los photoIds y su orden correspondiente
      const photosWithOrder: Record<number, { order: number }> = {}
      newPhotoIds.forEach((photoId: number, index: number) => {
        photosWithOrder[photoId] = { order: startOrder + index }
      })

      // Usar la relación many-to-many para asociar las nuevas fotos
      await series.related('photos').attach(photosWithOrder)

      return response.ok({
        message: `${newPhotoIds.length} photos added to series`,
        addedPhotos: newPhotoIds.length,
        alreadyInSeries: existingPhotoIds.length,
      })
    } catch (error) {
      return response.badRequest('Error adding photos to series')
    }
  }

  /**
   * Quitar fotos de una serie
   */
  async removePhotos({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id
      const { photoIds } = request.only(['photoIds'])

      if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        return response.badRequest('Photo IDs are required')
      }

      const series = await Series.query().where('id', seriesId).where('userId', user.id).first()

      if (!series) {
        return response.notFound('Series not found')
      }

      // Usar la relación many-to-many para desasociar las fotos
      await series.related('photos').detach(photoIds)

      return response.ok({
        message: `${photoIds.length} photos removed from series`,
        removedPhotos: photoIds.length,
      })
    } catch (error) {
      return response.badRequest('Error removing photos from series')
    }
  }

  /**
   * Actualizar el orden de las fotos en una serie
   * Recibe un array de objetos { photoId, order }
   */
  async updateOrder({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id
      const { photos } = request.only(['photos'])

      if (!photos || !Array.isArray(photos) || photos.length === 0) {
        return response.badRequest('Photos array with order is required')
      }

      const series = await Series.query().where('id', seriesId).where('userId', user.id).first()

      if (!series) {
        return response.notFound('Series not found')
      }

      // Verificar que todos los objetos tienen photoId y order
      const isValidFormat = photos.every(
        (item: any) => typeof item.photoId === 'number' && typeof item.order === 'number'
      )

      if (!isValidFormat) {
        return response.badRequest('Each photo must have photoId and order as numbers')
      }

      // Actualizar el orden de cada foto en la tabla pivot
      for (const photo of photos) {
        await db
          .from('series_photos')
          .where('series_id', seriesId)
          .where('photo_id', photo.photoId)
          .update({ order: photo.order })
      }

      // Cargar la serie actualizada con sus fotos ordenadas
      await series.load('photos', (query) => {
        query.orderBy('series_photos.order', 'asc')
      })

      const formattedSeries = {
        id: series.id,
        name: series.name,
        description: series.description,
        photos: series.photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
          order: photo.$extras.pivot_order,
        })),
      }

      return response.ok({
        message: 'Photo order updated successfully',
        series: formattedSeries,
      })
    } catch (error) {
      return response.badRequest('Error updating photo order')
    }
  }

  /**
   * Mover una foto a una posición específica dentro de la serie
   * Reordena automáticamente las demás fotos
   */
  async movePhoto({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const seriesId = params.id
      const { photoId, newPosition } = request.only(['photoId', 'newPosition'])

      if (typeof photoId !== 'number' || typeof newPosition !== 'number') {
        return response.badRequest('photoId and newPosition are required as numbers')
      }

      const series = await Series.query()
        .where('id', seriesId)
        .where('userId', user.id)
        .preload('photos', (query) => {
          query.orderBy('series_photos.order', 'asc')
        })
        .first()

      if (!series) {
        return response.notFound('Series not found')
      }

      // Verificar que la foto está en la serie
      const photoInSeries = series.photos.find((p) => p.id === photoId)
      if (!photoInSeries) {
        return response.badRequest('Photo is not in this series')
      }

      // Obtener todas las fotos ordenadas
      const orderedPhotos = series.photos.map((p) => ({
        id: p.id,
        order: p.$extras.pivot_order,
      }))

      // Encontrar la posición actual de la foto
      const currentIndex = orderedPhotos.findIndex((p) => p.id === photoId)

      // Validar la nueva posición
      if (newPosition < 0 || newPosition >= orderedPhotos.length) {
        return response.badRequest('Invalid new position')
      }

      // Si la posición es la misma, no hacer nada
      if (currentIndex === newPosition) {
        return response.ok({ message: 'Photo is already at this position' })
      }

      // Reordenar: remover la foto de su posición actual
      const [movedPhoto] = orderedPhotos.splice(currentIndex, 1)
      // Insertar en la nueva posición
      orderedPhotos.splice(newPosition, 0, movedPhoto)

      // Actualizar todos los órdenes
      for (let i = 0; i < orderedPhotos.length; i++) {
        await db
          .from('series_photos')
          .where('series_id', seriesId)
          .where('photo_id', orderedPhotos[i].id)
          .update({ order: i })
      }

      // Recargar la serie con el nuevo orden
      await series.load('photos', (query) => {
        query.orderBy('series_photos.order', 'asc')
      })

      const formattedSeries = {
        id: series.id,
        name: series.name,
        photos: series.photos.map((photo) => ({
          id: photo.id,
          name: photo.name,
          order: photo.$extras.pivot_order,
        })),
      }

      return response.ok({
        message: 'Photo moved successfully',
        series: formattedSeries,
      })
    } catch (error) {
      return response.badRequest('Error moving photo')
    }
  }
}
