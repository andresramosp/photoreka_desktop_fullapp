import type { HttpContext } from '@adonisjs/core/http'
import PortfolioBuildService from '#services/portfolio_build_service'
import type { PortfolioBuildConfig } from '#models/portfolio_build'

const VALID_COHERENCE_MODES = ['free', 'visual', 'chromatic', 'narrative', 'heterogeneous']
const VALID_SCORE_FIELDS = [
  'aesthetic_quality',
  'composition',
  'storytelling',
  'originality',
  'message',
  'humor',
  'visual_games',
  'candidness',
]

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

      const service = new PortfolioBuildService()

      // Check eligibility
      const eligibility = await service.validateBuildEligibility(user.id)
      if (!eligibility.eligible) {
        return response.badRequest({
          error: eligibility.reason,
          stats: eligibility.stats,
        })
      }

      const build = await service.startBuild(user.id, config)

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
          targetSize: b.config.targetSize,
          resultCount: b.result?.photoIds?.length ?? null,
          costEur: b.costEur,
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
   * GET /api/portfolio-build/eligibility
   * Check if the user is eligible to start a build.
   */
  public async eligibility({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

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

    const weights = body.weights
    if (!weights || typeof weights !== 'object') {
      throw new Error('weights is required and must be an object.')
    }
    for (const [field, value] of Object.entries(weights)) {
      if (!VALID_SCORE_FIELDS.includes(field)) {
        throw new Error(`Invalid weight field: ${field}`)
      }
      if (typeof value !== 'number' || value < 0 || value > 10) {
        throw new Error(`Weight for ${field} must be a number between 0 and 10.`)
      }
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

    if (body.freetext && typeof body.freetext === 'string' && body.freetext.trim().length > 0) {
      config.freetext = body.freetext.trim().slice(0, 2000)
    }

    if (body.filters && typeof body.filters === 'object') {
      config.filters = {}
      if (body.filters.visualAspects) config.filters.visualAspects = body.filters.visualAspects
      if (body.filters.dateFrom) config.filters.dateFrom = body.filters.dateFrom
      if (body.filters.dateTo) config.filters.dateTo = body.filters.dateTo
      if (body.filters.collectionIds) config.filters.collectionIds = body.filters.collectionIds
    }

    return config
  }
}
