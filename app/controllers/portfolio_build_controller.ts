import type { HttpContext } from '@adonisjs/core/http'
import PortfolioBuildService from '#services/portfolio_build_service'
import CreditService from '#services/credit_service'
import type { PortfolioBuildConfig } from '#models/portfolio_build'

const VALID_COHERENCE_MODES = ['free', 'visual', 'chromatic', 'narrative', 'heterogeneous']
const VALID_SCORE_FIELDS = [
  'aesthetic_quality',
  'composition',
  'storytelling',
  'originality',
  'strangeness',
  'message',
  'humor',
  'visual_games',
  'candidness',
]

/** Maps aliased score field names to the canonical name used downstream. */
const SCORE_FIELD_ALIASES: Record<string, string> = {
  strangeness: 'originality',
}

export default class PortfolioBuildController {
  /**
   * POST /api/portfolio-build/start
   * Launch a new portfolio build (async, returns 202).
   */
  public async start({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const body = request.body()
      const config = this.parseAndValidateConfig(body)

      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const service = new PortfolioBuildService()

      // Check eligibility
      const eligibility = await service.validateBuildEligibility(user.id)
      if (!eligibility.eligible) {
        return response.badRequest({
          error: eligibility.reason,
          stats: eligibility.stats,
        })
      }

      const wait = Boolean(body.wait ?? false)
      const build = await service.startBuild(user.id, config, wait)

      if (wait) {
        return response.ok({
          success: true,
          buildId: build.id,
          status: build.status,
          result: build.result,
          costEur: build.costEur,
          error: build.error ?? undefined,
        })
      }

      return response.accepted({
        success: true,
        buildId: build.id,
        status: build.status,
        message: 'Portfolio build started. You will be notified when it completes.',
      })
    } catch (error: any) {
      if (error.message?.includes('already in progress')) {
        return response.conflict({ error: error.message })
      }
      console.error('[PortfolioBuildController] start error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/portfolio-build/:id
   * Get status of a specific build.
   */
  public async getStatus({ params, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const service = new PortfolioBuildService()
      const build = await service.getStatus(Number(params.id), user.id)

      if (!build) {
        return response.notFound({ error: 'Build not found.' })
      }

      return response.ok({
        id: build.id,
        status: build.status,
        progress: build.progress,
        config: build.config,
        result: build.result,
        costEur: build.costEur,
        error: build.error,
        startedAt: build.startedAt?.toISO(),
        completedAt: build.completedAt?.toISO(),
        createdAt: build.createdAt.toISO(),
      })
    } catch (error: any) {
      console.error('[PortfolioBuildController] getStatus error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/portfolio-build/list
   * List all builds for the current user.
   */
  public async list({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const service = new PortfolioBuildService()
      const builds = await service.listBuilds(user.id)

      return response.ok({
        builds: builds.map((b) => ({
          id: b.id,
          status: b.status,
          progress: b.progress,
          config: b.config,
          targetSize: b.config.targetSize,
          coherenceMode: b.config.coherenceMode,
          resultCount: b.result?.photoIds?.length ?? null,
          photoItems: b.result?.photoItems ?? null,
          costEur: Number(b.costEur),
          error: b.error ?? null,
          createdAt: b.createdAt.toISO(),
          completedAt: b.completedAt?.toISO(),
        })),
      })
    } catch (error: any) {
      console.error('[PortfolioBuildController] list error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * POST /api/portfolio-build/:id/abort
   * Abort an in-progress build.
   */
  public async abort({ params, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const service = new PortfolioBuildService()
      const aborted = await service.abort(Number(params.id), user.id)

      if (!aborted) {
        return response.notFound({ error: 'Build not found or already finished.' })
      }

      return response.ok({ success: true, message: 'Build aborted.' })
    } catch (error: any) {
      console.error('[PortfolioBuildController] abort error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * PATCH /api/portfolio-build/:id/layout
   * Update the photo order (and optionally remove photos) for a completed build.
   */
  public async updateLayout({ params, request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const service = new PortfolioBuildService()
      const build = await service.getStatus(Number(params.id), user.id)

      if (!build) {
        return response.notFound({ error: 'Build not found.' })
      }

      if (build.status !== 'completed') {
        return response.badRequest({ error: 'Can only update layout of completed builds.' })
      }

      const body = request.body()
      const photoIds = body.photoIds

      if (!Array.isArray(photoIds) || photoIds.length === 0) {
        return response.badRequest({ error: 'photoIds must be a non-empty array.' })
      }

      // Validate that all provided IDs are a subset of the original result
      const originalIds = new Set(build.result?.photoIds ?? [])
      const invalidIds = photoIds.filter((id: any) => !originalIds.has(Number(id)))
      if (invalidIds.length > 0) {
        return response.badRequest({
          error: `photoIds contains IDs not in the original build: ${invalidIds.join(', ')}`,
        })
      }

      // Build new photoItems in the requested order
      const originalItemsMap = new Map(
        (build.result?.photoItems ?? []).map((item: any) => [item.id, item])
      )
      const newPhotoIds = photoIds.map(Number)
      const newPhotoItems = newPhotoIds
        .map((id: number) => originalItemsMap.get(id))
        .filter(Boolean)

      build.result = {
        ...build.result!,
        photoIds: newPhotoIds,
        photoItems: newPhotoItems,
      }
      await build.save()

      return response.ok({ success: true, photoIds: newPhotoIds })
    } catch (error: any) {
      console.error('[PortfolioBuildController] updateLayout error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/portfolio-build/eligibility
   * Check if the user is eligible to start a build.
   */
  public async eligibility({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const service = new PortfolioBuildService()
      const result = await service.validateBuildEligibility(user.id)

      return response.ok(result)
    } catch (error: any) {
      console.error('[PortfolioBuildController] eligibility error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── Validation ─────────────────────────────────────────────

  private parseAndValidateConfig(body: any): PortfolioBuildConfig {
    const targetSize = Number(body.targetSize)
    if (!Number.isFinite(targetSize) || targetSize < 10 || targetSize > 60) {
      throw new Error('targetSize must be between 10 and 60.')
    }

    const rawWeights = body.weights
    if (!rawWeights || typeof rawWeights !== 'object') {
      throw new Error('weights is required and must be an object.')
    }

    // Normalize aliased field names (e.g. strangeness → originality)
    const weights: Record<string, number> = {}
    for (const [field, value] of Object.entries(rawWeights)) {
      const canonical = SCORE_FIELD_ALIASES[field] ?? field
      if (!VALID_SCORE_FIELDS.includes(canonical)) {
        throw new Error(`Invalid weight field: ${field}`)
      }
      if (typeof value !== 'number' || value < 0 || value > 10) {
        throw new Error(`Weight for ${field} must be a number between 0 and 10.`)
      }
      weights[canonical] = value
    }

    const coherenceMode = body.coherenceMode ?? 'free'
    if (!VALID_COHERENCE_MODES.includes(coherenceMode)) {
      throw new Error(`Invalid coherenceMode: ${coherenceMode}`)
    }

    const sequencing = Boolean(body.sequencing ?? false)

    const config: PortfolioBuildConfig = {
      targetSize,
      weights,
      coherenceMode,
      sequencing,
    }

    if (
      body.themePreferences &&
      typeof body.themePreferences === 'string' &&
      body.themePreferences.trim().length > 0
    ) {
      config.themePreferences = body.themePreferences.trim().slice(0, 2000)
    }

    if (
      body.sequencingPreferences &&
      typeof body.sequencingPreferences === 'string' &&
      body.sequencingPreferences.trim().length > 0
    ) {
      config.sequencingPreferences = body.sequencingPreferences.trim().slice(0, 2000)
    }

    if (body.filters && typeof body.filters === 'object') {
      config.filters = {}
      if (body.filters.visualAspects) config.filters.visualAspects = body.filters.visualAspects
      if (body.filters.dateFrom) config.filters.dateFrom = body.filters.dateFrom
      if (body.filters.dateTo) config.filters.dateTo = body.filters.dateTo
      if (Array.isArray(body.filters.collectionIds) && body.filters.collectionIds.length > 0) {
        config.filters.collectionIds = body.filters.collectionIds
          .filter((id: any) => Number.isFinite(Number(id)))
          .map(Number)
      }
    }

    return config
  }
}
