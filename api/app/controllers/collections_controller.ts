import type { HttpContext } from '@adonisjs/core/http'
import Collection from '#models/collection'
import Photo from '#models/photo'
import CollectionPhotosService from '#services/collection_photos_service'
import { inject } from '@adonisjs/core'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

@inject()
export default class CollectionsController {
  private formatPhotoPreview(photo: Photo) {
    return {
      id: photo.id,
      thumbnailUrl: photo.thumbnailUrl,
    }
  }

  /**
   * Obtener todas las colecciones del usuario autenticado.
   *
   * Devuelve la pertenencia completa (`photoIds`), que el front usa para filtrar
   * la grilla, el canvas y el atlas 2D, pero sólo las miniaturas que la card pinta
   * (`previewPhotos`). Enviar `{id, thumbnailUrl}` por cada foto de cada colección
   * eran 5,7 MB y 56k modelos Lucid para un catálogo con 1.000 colecciones, y la
   * URL era un duplicado: el front ya tiene el catálogo entero en su store.
   */
  async index({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const [collections, photoIdsByCollection, previewsByCollection] = await Promise.all([
        db
          .from('collections')
          .where('user_id', user.id)
          .orderBy('updated_at', 'desc')
          .select('id', 'name', 'description', 'set_id', 'created_at', 'updated_at'),
        CollectionPhotosService.photoIdsByCollection(user.id),
        CollectionPhotosService.previewPhotosByCollection(user.id),
      ])

      const formattedCollections = collections.map((collection) => {
        const photoIds = photoIdsByCollection.get(Number(collection.id)) ?? []
        return {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          setId: collection.set_id,
          createdAt: collection.created_at,
          updatedAt: collection.updated_at,
          photosCount: photoIds.length,
          photoIds,
          previewPhotos: previewsByCollection.get(Number(collection.id)) ?? [],
        }
      })

      return response.ok(formattedCollections)
    } catch (error) {
      return response.badRequest('Error fetching collections')
    }
  } /**
   * Obtener una colección específica
   */
  async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const collectionId = params.id

      const collection = await Collection.query()
        .where('id', collectionId)
        .where('userId', user.id)
        .preload('photos', (photosQuery) => photosQuery.select('id', 'thumbnailName'))
        .first()

      if (!collection) {
        return response.notFound('Collection not found')
      }

      const formattedCollection = {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        setId: collection.setId,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        photos: collection.photos.map((photo) => this.formatPhotoPreview(photo)),
      }

      return response.ok(formattedCollection)
    } catch (error) {
      return response.badRequest('Error fetching collection')
    }
  }

  /**
   * Crear una nueva colección
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
        return response.badRequest('Collection name is required')
      }

      // Verificar que no existe ya una colección con el mismo nombre para este usuario
      const existing = await Collection.query()
        .where('userId', user.id)
        .where('name', name.trim())
        .first()

      if (existing) {
        return response.conflict('A collection with this name already exists')
      }

      // Crear la colección
      const collection = await Collection.create({
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        setId: setId || null,
      })

      // Si se proporcionaron fotos iniciales, añadirlas a la colección
      if (photoIds && Array.isArray(photoIds) && photoIds.length > 0) {
        // Filtrar solo las fotos que existen y pertenecen al usuario
        const photos = await Photo.query().whereIn('id', photoIds).where('userId', user.id)
        const validPhotoIds = photos.map((photo) => photo.id)

        if (validPhotoIds.length > 0) {
          await collection.related('photos').attach(validPhotoIds)
        }
      }

      // Cargar la colección con sus fotos para devolverla
      await collection.load('photos', (photosQuery) => {
        photosQuery.select('id', 'thumbnailName')
      })

      const formattedCollection = {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        setId: collection.setId,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        photos: collection.photos.map((photo) => this.formatPhotoPreview(photo)),
      }

      return response.created(formattedCollection)
    } catch (error) {
      return response.badRequest('Error creating collection')
    }
  }

  /**
   * Actualizar una colección (nombre y descripción)
   */
  async update({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const collectionId = params.id
      const { name, description } = request.only(['name', 'description'])

      const collection = await Collection.query()
        .where('id', collectionId)
        .where('userId', user.id)
        .first()

      if (!collection) {
        return response.notFound('Collection not found')
      }

      if (!name || name.trim().length === 0) {
        return response.badRequest('Collection name is required')
      }

      // Verificar que no existe otra colección con el mismo nombre para este usuario
      const existing = await Collection.query()
        .where('userId', user.id)
        .where('name', name.trim())
        .whereNot('id', collectionId)
        .first()

      if (existing) {
        return response.conflict('A collection with this name already exists')
      }

      collection.name = name.trim()
      collection.description = description?.trim() || null
      await collection.save()

      return response.ok({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
      })
    } catch (error) {
      return response.badRequest('Error updating collection')
    }
  }

  /**
   * Eliminar una colección
   */
  async destroy({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const collectionId = params.id

      const collection = await Collection.query()
        .where('id', collectionId)
        .where('userId', user.id)
        .first()

      if (!collection) {
        return response.notFound('Collection not found')
      }

      // Con many-to-many, primero desasociamos todas las fotos
      await collection.related('photos').detach()

      // Eliminar la colección
      await collection.delete()

      return response.ok({ message: 'Collection deleted successfully' })
    } catch (error) {
      return response.badRequest('Error deleting collection')
    }
  }

  /**
   * Añadir fotos a una colección
   */
  async addPhotos({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const collectionId = params.id
      const { photoIds } = request.only(['photoIds'])

      if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        return response.badRequest('Photo IDs are required')
      }

      const collection = await Collection.query()
        .where('id', collectionId)
        .where('userId', user.id)
        .first()

      if (!collection) {
        return response.notFound('Collection not found')
      }

      // Filtrar solo las fotos que existen y pertenecen al usuario
      const photos = await Photo.query().whereIn('id', photoIds).where('userId', user.id)
      const validPhotoIds = photos.map((photo) => photo.id)

      // Cargar las fotos existentes en la colección
      await collection.load('photos')
      const existingPhotoIds = collection.photos.map((photo) => photo.id)
      const newPhotoIds = validPhotoIds.filter((id: number) => !existingPhotoIds.includes(id))

      if (newPhotoIds.length === 0) {
        return response.badRequest('All photos are already in the collection')
      }

      // Usar la relación many-to-many para asociar las nuevas fotos
      await collection.related('photos').attach(newPhotoIds)
      collection.updatedAt = DateTime.now()
      await collection.save()

      return response.ok({
        message: `${newPhotoIds.length} photos added to collection`,
        addedPhotos: newPhotoIds.length,
        alreadyInCollection: existingPhotoIds.length,
      })
    } catch (error) {
      return response.badRequest('Error adding photos to collection')
    }
  }

  /**
   * Eliminar múltiples colecciones de una vez
   */
  async destroyMany({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { ids } = request.only(['ids'])

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return response.badRequest('Collection IDs are required')
      }

      const collections = await Collection.query().whereIn('id', ids).where('userId', user.id)

      if (collections.length === 0) {
        return response.notFound('No matching collections found')
      }

      for (const collection of collections) {
        await collection.related('photos').detach()
        await collection.delete()
      }

      return response.ok({
        message: `${collections.length} collection(s) deleted successfully`,
        deletedCount: collections.length,
      })
    } catch (error) {
      return response.badRequest('Error deleting collections')
    }
  }

  /**
   * Quitar fotos de una colección
   */
  async removePhotos({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const collectionId = params.id
      const { photoIds } = request.only(['photoIds'])

      if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        return response.badRequest('Photo IDs are required')
      }

      const collection = await Collection.query()
        .where('id', collectionId)
        .where('userId', user.id)
        .first()

      if (!collection) {
        return response.notFound('Collection not found')
      }

      // Usar la relación many-to-many para desasociar las fotos
      await collection.related('photos').detach(photoIds)
      collection.updatedAt = DateTime.now()
      await collection.save()

      return response.ok({
        message: `${photoIds.length} photos removed from collection`,
        removedPhotos: photoIds.length,
      })
    } catch (error) {
      return response.badRequest('Error removing photos from collection')
    }
  }
}
