import type { HttpContext } from '@adonisjs/core/http'
import CollectionSet from '#models/collection_set'
import Collection from '#models/collection'
import CollectionPhotosService from '#services/collection_photos_service'
import type { CollectionPreviewPhoto } from '#services/collection_photos_service'
import { inject } from '@adonisjs/core'

/**
 * Conteos y portadas de las colecciones de un set, resueltos en SQL.
 * Vacíos cuando el set aún no tiene colecciones (recién creado).
 */
interface CollectionPhotoSummary {
  counts: Map<number, number>
  previews: Map<number, CollectionPreviewPhoto[]>
}

const EMPTY_SUMMARY: CollectionPhotoSummary = { counts: new Map(), previews: new Map() }

@inject()
export default class CollectionSetsController {
  /**
   * Conteo + portadas de las colecciones indicadas. Sustituye al `preload('photos')`
   * que hidrataba todas las fotos de todas las colecciones del usuario para acabar
   * quedándose con tres por colección.
   */
  private async summarizeCollectionPhotos(
    userId: number | string,
    collectionIds: number[]
  ): Promise<CollectionPhotoSummary> {
    if (collectionIds.length === 0) {
      return EMPTY_SUMMARY
    }

    const [counts, previews] = await Promise.all([
      CollectionPhotosService.photoCountsByCollection(userId, collectionIds),
      CollectionPhotosService.previewPhotosByCollection(userId, collectionIds),
    ])

    return { counts, previews }
  }

  /**
   * Build a formatted set object including counts
   */
  private formatSet(
    set: CollectionSet,
    includeChildren = false,
    summary: CollectionPhotoSummary = EMPTY_SUMMARY
  ): object {
    const base: Record<string, any> = {
      id: set.id,
      name: set.name,
      description: set.description,
      parentSetId: set.parentSetId,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
      collectionsCount: set.collections?.length ?? 0,
      childSetsCount: set.childSets?.length ?? 0,
    }

    if (includeChildren) {
      base.childSets = (set.childSets || []).map((child) => this.formatSet(child))
      base.collections = (set.collections || []).map((col) => ({
        id: col.id,
        name: col.name,
        description: col.description,
        setId: col.setId,
        createdAt: col.createdAt,
        updatedAt: col.updatedAt,
        photosCount: summary.counts.get(col.id) ?? 0,
        photos: summary.previews.get(col.id) ?? [],
      }))
    }

    return base
  }

  /**
   * Get all collection sets for the authenticated user (flat list)
   */
  async index({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const sets = await CollectionSet.query()
        .where('userId', user.id)
        .preload('childSets')
        .preload('collections')
        .orderBy('name', 'asc')

      const summary = await this.summarizeCollectionPhotos(
        user.id,
        sets.flatMap((s) => s.collections.map((col) => col.id))
      )

      return response.ok(sets.map((s) => this.formatSet(s, true, summary)))
    } catch (error) {
      return response.badRequest('Error fetching collection sets')
    }
  }

  /**
   * Get a specific collection set with its children and collections
   */
  async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const set = await CollectionSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .preload('childSets', (q) => q.preload('collections'))
        .preload('collections')
        .first()

      if (!set) {
        return response.notFound('Collection set not found')
      }

      const summary = await this.summarizeCollectionPhotos(
        user.id,
        set.collections.map((col) => col.id)
      )

      return response.ok(this.formatSet(set, true, summary))
    } catch (error) {
      return response.badRequest('Error fetching collection set')
    }
  }

  /**
   * Create a new collection set
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { name, description, parentSetId } = request.only([
        'name',
        'description',
        'parentSetId',
      ])

      if (!name || name.trim().length === 0) {
        return response.badRequest('Set name is required')
      }

      // If parentSetId provided, verify it belongs to the user
      if (parentSetId) {
        const parent = await CollectionSet.query()
          .where('id', parentSetId)
          .where('userId', user.id)
          .first()

        if (!parent) {
          return response.notFound('Parent set not found')
        }
      }

      const set = await CollectionSet.create({
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        parentSetId: parentSetId || null,
      })

      await set.load('childSets')
      await set.load('collections')

      return response.created(this.formatSet(set, true))
    } catch (error) {
      return response.badRequest('Error creating collection set')
    }
  }

  /**
   * Update a collection set (name, description, or parent)
   */
  async update({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { name, description, parentSetId } = request.only([
        'name',
        'description',
        'parentSetId',
      ])

      const set = await CollectionSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .first()

      if (!set) {
        return response.notFound('Collection set not found')
      }

      if (!name || name.trim().length === 0) {
        return response.badRequest('Set name is required')
      }

      // Prevent setting itself as its own parent
      if (parentSetId && String(parentSetId) === String(params.id)) {
        return response.badRequest('A set cannot be its own parent')
      }

      // Verify new parent belongs to user if provided
      if (parentSetId) {
        const parent = await CollectionSet.query()
          .where('id', parentSetId)
          .where('userId', user.id)
          .first()

        if (!parent) {
          return response.notFound('Parent set not found')
        }
      }

      set.name = name.trim()
      set.description = description?.trim() || null
      set.parentSetId = parentSetId ?? set.parentSetId
      await set.save()

      return response.ok(this.formatSet(set))
    } catch (error) {
      return response.badRequest('Error updating collection set')
    }
  }

  /**
   * Delete a collection set.
   * Child sets are promoted to the deleted set's parent (or root if no parent).
   * Collections inside are moved to root level (setId = null).
   */
  async destroy({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const set = await CollectionSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .first()

      if (!set) {
        return response.notFound('Collection set not found')
      }

      const promotedParentId = set.parentSetId

      // Promote child sets to parent
      await CollectionSet.query()
        .where('parentSetId', set.id)
        .where('userId', user.id)
        .update({ parentSetId: promotedParentId })

      // Move collections to parent set (or root)
      await Collection.query()
        .where('setId', set.id)
        .where('userId', user.id)
        .update({ setId: promotedParentId })

      await set.delete()

      return response.ok({ message: 'Collection set deleted successfully' })
    } catch (error) {
      return response.badRequest('Error deleting collection set')
    }
  }

  /**
   * Move a collection into this set (or set its set to null for root)
   */
  async moveCollection({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { collectionId, targetSetId } = request.only(['collectionId', 'targetSetId'])

      const collection = await Collection.query()
        .where('id', collectionId)
        .where('userId', user.id)
        .first()

      if (!collection) {
        return response.notFound('Collection not found')
      }

      // If targetSetId provided, validate it belongs to the user
      if (targetSetId) {
        const targetSet = await CollectionSet.query()
          .where('id', targetSetId)
          .where('userId', user.id)
          .first()

        if (!targetSet) {
          return response.notFound('Target set not found')
        }
      }

      collection.setId = targetSetId || null
      await collection.save()

      return response.ok({ message: 'Collection moved successfully', setId: collection.setId })
    } catch (error) {
      return response.badRequest('Error moving collection')
    }
  }
}
