import type { HttpContext } from '@adonisjs/core/http'
import SeriesSet from '#models/series_set'
import Series from '#models/series'
import { inject } from '@adonisjs/core'

@inject()
export default class SeriesSetsController {
  private formatSet(set: SeriesSet, includeChildren = false): object {
    const base: Record<string, any> = {
      id: set.id,
      name: set.name,
      description: set.description,
      parentSetId: set.parentSetId,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
      seriesCount: set.series?.length ?? 0,
      childSetsCount: set.childSets?.length ?? 0,
    }

    if (includeChildren) {
      base.childSets = (set.childSets || []).map((child) => this.formatSet(child))
      base.series = (set.series || []).map((series) => ({
        id: series.id,
        name: series.name,
        description: series.description,
        setId: series.setId,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        photosCount: (series as any).photos?.length ?? 0,
        photos:
          (series as any).photos?.slice(0, 3).map((p: any) => ({
            id: p.id,
            thumbnailUrl: p.thumbnailUrl,
          })) ?? [],
      }))
    }

    return base
  }

  async index({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const sets = await SeriesSet.query()
        .where('userId', user.id)
        .preload('childSets')
        .preload('series', (query) => query.preload('photos'))
        .orderBy('name', 'asc')

      return response.ok(sets.map((set) => this.formatSet(set, true)))
    } catch (error) {
      return response.badRequest('Error fetching series sets')
    }
  }

  async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const set = await SeriesSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .preload('childSets', (query) => query.preload('series'))
        .preload('series', (query) => query.preload('photos'))
        .first()

      if (!set) {
        return response.notFound('Series set not found')
      }

      return response.ok(this.formatSet(set, true))
    } catch (error) {
      return response.badRequest('Error fetching series set')
    }
  }

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

      if (parentSetId) {
        const parent = await SeriesSet.query()
          .where('id', parentSetId)
          .where('userId', user.id)
          .first()

        if (!parent) {
          return response.notFound('Parent set not found')
        }
      }

      const set = await SeriesSet.create({
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        parentSetId: parentSetId || null,
      })

      await set.load('childSets')
      await set.load('series')

      return response.created(this.formatSet(set, true))
    } catch (error) {
      return response.badRequest('Error creating series set')
    }
  }

  async update({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { name, description, parentSetId } = request.only([
        'name',
        'description',
        'parentSetId',
      ])

      const set = await SeriesSet.query().where('id', params.id).where('userId', user.id).first()

      if (!set) {
        return response.notFound('Series set not found')
      }

      if (!name || name.trim().length === 0) {
        return response.badRequest('Set name is required')
      }

      if (parentSetId && String(parentSetId) === String(params.id)) {
        return response.badRequest('A set cannot be its own parent')
      }

      if (parentSetId) {
        const parent = await SeriesSet.query()
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
      return response.badRequest('Error updating series set')
    }
  }

  async destroy({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const set = await SeriesSet.query().where('id', params.id).where('userId', user.id).first()

      if (!set) {
        return response.notFound('Series set not found')
      }

      const promotedParentId = set.parentSetId

      await SeriesSet.query()
        .where('parentSetId', set.id)
        .where('userId', user.id)
        .update({ parentSetId: promotedParentId })

      await Series.query()
        .where('setId', set.id)
        .where('userId', user.id)
        .update({ setId: promotedParentId })

      await set.delete()

      return response.ok({ message: 'Series set deleted successfully' })
    } catch (error) {
      return response.badRequest('Error deleting series set')
    }
  }

  async moveSeries({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { seriesId, targetSetId } = request.only(['seriesId', 'targetSetId'])

      const series = await Series.query().where('id', seriesId).where('userId', user.id).first()

      if (!series) {
        return response.notFound('Series not found')
      }

      if (targetSetId) {
        const targetSet = await SeriesSet.query()
          .where('id', targetSetId)
          .where('userId', user.id)
          .first()

        if (!targetSet) {
          return response.notFound('Target set not found')
        }
      }

      series.setId = targetSetId || null
      await series.save()

      return response.ok({ message: 'Series moved successfully', setId: series.setId })
    } catch (error) {
      return response.badRequest('Error moving series')
    }
  }
}
