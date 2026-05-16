import type { HttpContext } from '@adonisjs/core/http'
import PortfolioBuildSet from '#models/portfolio_build_set'
import PortfolioBuild from '#models/portfolio_build'

export default class PortfolioBuildSetsController {
  private formatSet(set: PortfolioBuildSet, includeChildren = false): object {
    const base: Record<string, any> = {
      id: set.id,
      name: set.name,
      description: set.description,
      parentSetId: set.parentSetId,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
      portfolioBuildsCount: set.builds?.length ?? 0,
      childSetsCount: set.childSets?.length ?? 0,
    }

    if (includeChildren) {
      base.childSets = (set.childSets || []).map((child) => this.formatSet(child))
      base.builds = (set.builds || []).map((build) => ({
        id: build.id,
        status: build.status,
        progress: build.progress,
        setId: build.setId,
        config: build.config,
        targetSize: build.config.targetSize,
        coherenceMode: build.config.coherenceMode,
        isManual: Boolean(build.config.isManual),
        resultCount: build.result?.photoIds?.length ?? null,
        photoItems: build.result?.photoItems ?? null,
        costEur: Number(build.costEur),
        error: build.error ?? null,
        createdAt: build.createdAt.toISO(),
        completedAt: build.completedAt?.toISO(),
      }))
    }

    return base
  }

  public async index({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const sets = await PortfolioBuildSet.query()
        .where('userId', user.id)
        .preload('childSets')
        .preload('builds')
        .orderBy('name', 'asc')

      return response.ok(sets.map((set) => this.formatSet(set, true)))
    } catch (error) {
      return response.badRequest('Error fetching portfolio sets')
    }
  }

  public async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const set = await PortfolioBuildSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .preload('childSets', (query) => query.preload('builds'))
        .preload('builds')
        .first()

      if (!set) {
        return response.notFound('Portfolio set not found')
      }

      return response.ok(this.formatSet(set, true))
    } catch (error) {
      return response.badRequest('Error fetching portfolio set')
    }
  }

  public async store({ auth, request, response }: HttpContext) {
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
        const parent = await PortfolioBuildSet.query()
          .where('id', parentSetId)
          .where('userId', user.id)
          .first()

        if (!parent) {
          return response.notFound('Parent set not found')
        }
      }

      const set = await PortfolioBuildSet.create({
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        parentSetId: parentSetId || null,
      })

      await set.load('childSets')
      await set.load('builds')

      return response.created(this.formatSet(set, true))
    } catch (error) {
      return response.badRequest('Error creating portfolio set')
    }
  }

  public async update({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { name, description, parentSetId } = request.only([
        'name',
        'description',
        'parentSetId',
      ])

      const set = await PortfolioBuildSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .first()

      if (!set) {
        return response.notFound('Portfolio set not found')
      }

      if (!name || name.trim().length === 0) {
        return response.badRequest('Set name is required')
      }

      if (parentSetId && String(parentSetId) === String(params.id)) {
        return response.badRequest('A set cannot be its own parent')
      }

      if (parentSetId) {
        const parent = await PortfolioBuildSet.query()
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
      return response.badRequest('Error updating portfolio set')
    }
  }

  public async destroy({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const set = await PortfolioBuildSet.query()
        .where('id', params.id)
        .where('userId', user.id)
        .first()

      if (!set) {
        return response.notFound('Portfolio set not found')
      }

      const promotedParentId = set.parentSetId

      await PortfolioBuildSet.query()
        .where('parentSetId', set.id)
        .where('userId', user.id)
        .update({ parentSetId: promotedParentId })

      await PortfolioBuild.query()
        .where('setId', set.id)
        .where('userId', user.id)
        .update({ setId: promotedParentId })

      await set.delete()

      return response.ok({ message: 'Portfolio set deleted successfully' })
    } catch (error) {
      return response.badRequest('Error deleting portfolio set')
    }
  }

  public async moveBuild({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { buildId, targetSetId } = request.only(['buildId', 'targetSetId'])

      const build = await PortfolioBuild.query()
        .where('id', buildId)
        .where('userId', user.id)
        .first()

      if (!build) {
        return response.notFound('Portfolio not found')
      }

      if (targetSetId) {
        const targetSet = await PortfolioBuildSet.query()
          .where('id', targetSetId)
          .where('userId', user.id)
          .first()

        if (!targetSet) {
          return response.notFound('Target set not found')
        }
      }

      build.setId = targetSetId || null
      await build.save()

      return response.ok({ message: 'Portfolio moved successfully', setId: build.setId })
    } catch (error) {
      return response.badRequest('Error moving portfolio')
    }
  }
}
