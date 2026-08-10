import type { HttpContext } from '@adonisjs/core/http'
import PortfolioBuildService from '#services/portfolio_build_service'
import CreditService from '#services/credit_service'
import Photo from '#models/photo'
import PortfolioBuild from '#models/portfolio_build'
import PortfolioBuildSet from '#models/portfolio_build_set'
import type { PortfolioBuildConfig, PortfolioGridSettings } from '#models/portfolio_build'
import {
  getArtisticExternalKeys,
  getPromptVariant,
  getScoreInternalToExternal,
  type PromptVariant,
} from '#config/photo_schema'

const VALID_COHERENCE_MODES = ['free', 'visual', 'chromatic', 'narrative', 'heterogeneous']

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
      const config = this.parseAndValidateConfig(body, user.profiles)
      const setId = await this.parseAndValidateSetId(body.setId, user.id)

      const hasCredits = await CreditService.canAfford(user.id)
      if (!hasCredits) {
        return response.status(402).json({
          message: 'No credits remaining. Please purchase more credits to continue.',
          code: 'INSUFFICIENT_CREDITS',
        })
      }

      const service = new PortfolioBuildService()

      // If the client only sent a free-text style description (no explicit
      // weights), resolve it now so the build starts with a concrete weight
      // vector. Cheap PARSE_MODEL call; same path as the preview endpoint.
      if (!config.weights && config.stylePreferences) {
        const parsed = await service.previewStyleWeights(config.stylePreferences, user.profiles)
        // Scale from the 0..1 preview range to the 0..10 pipeline range.
        config.weights = Object.fromEntries(
          Object.entries(parsed.weights).map(([k, v]) => [k, v * 10])
        )
      }

      if (!config.weights) {
        return response.badRequest({
          error: 'Either "weights" or "stylePreferences" must be provided.',
        })
      }

      // Check eligibility (using the actual target size we're about to build)
      const eligibility = await service.validateBuildEligibility(user.id, config.targetSize)
      if (!eligibility.eligible) {
        return response.badRequest({
          error: eligibility.reason,
          stats: eligibility.stats,
          requiredPool: eligibility.requiredPool,
        })
      }

      const wait = Boolean(body.wait ?? false)
      const build = await service.startBuild(user.id, config, wait, setId)

      if (wait) {
        return response.ok({
          success: true,
          buildId: build.id,
          setId: build.setId,
          status: build.status,
          result: build.result,
          costEur: build.costEur,
          error: build.error ?? undefined,
        })
      }

      return response.accepted({
        success: true,
        buildId: build.id,
        setId: build.setId,
        status: build.status,
        message: 'Portfolio build started. You will be notified when it completes.',
      })
    } catch (error: any) {
      if (error.message?.includes('Portfolio set not found')) {
        return response.notFound({ error: error.message })
      }
      if (error.message?.includes('setId must be')) {
        return response.badRequest({ error: error.message })
      }
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
        setId: build.setId,
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
          setId: b.setId,
          status: b.status,
          progress: b.progress,
          config: b.config,
          targetSize: b.config.targetSize,
          coherenceMode: b.config.coherenceMode,
          isManual: Boolean(b.config.isManual),
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
      const buildId = Number(params.id)
      if (!Number.isInteger(buildId) || buildId <= 0) {
        return response.badRequest({ error: 'Invalid build ID.' })
      }
      const aborted = await service.abort(buildId, user.id)

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
   * DELETE /api/portfolio-build/:id
   * Permanently delete a portfolio build record.
   */
  public async delete({ params, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const service = new PortfolioBuildService()
      const buildId = Number(params.id)
      if (!Number.isInteger(buildId) || buildId <= 0) {
        return response.badRequest({ error: 'Invalid build ID.' })
      }
      const build = await service.getStatus(buildId, user.id)

      if (!build) {
        return response.notFound({ error: 'Build not found.' })
      }

      await build.delete()

      return response.ok({ success: true })
    } catch (error: any) {
      console.error('[PortfolioBuildController] delete error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * DELETE /api/portfolio-build
   * Permanently delete multiple portfolio build records.
   */
  public async deleteMany({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { ids } = request.only(['ids'])

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return response.badRequest({ error: 'Build IDs are required.' })
      }

      const builds = await PortfolioBuild.query().whereIn('id', ids).where('userId', user.id)

      if (builds.length === 0) {
        return response.notFound({ error: 'No matching portfolios found.' })
      }

      for (const build of builds) {
        await build.delete()
      }

      return response.ok({ success: true, deletedCount: builds.length })
    } catch (error: any) {
      console.error('[PortfolioBuildController] deleteMany error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * PATCH /api/portfolio-build/:id/layout
   * Update the photo order (and optionally remove photos) for a completed build,
   * and/or the grid presentation settings (columns / gap / fill space).
   * Both `photoIds` and `gridSettings` are optional, but at least one is required.
   */
  public async updateLayout({ params, request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const service = new PortfolioBuildService()
      const buildId = Number(params.id)
      if (!Number.isInteger(buildId) || buildId <= 0) {
        return response.badRequest({ error: 'Invalid build ID.' })
      }
      const build = await service.getStatus(buildId, user.id)

      if (!build) {
        return response.notFound({ error: 'Build not found.' })
      }

      if (build.status !== 'completed') {
        return response.badRequest({ error: 'Can only update layout of completed builds.' })
      }

      const body = request.body()
      const photoIds = body.photoIds
      const hasPhotoIds = photoIds !== undefined && photoIds !== null
      const hasGridSettings = body.gridSettings !== undefined && body.gridSettings !== null

      if (!hasPhotoIds && !hasGridSettings) {
        return response.badRequest({
          error: 'At least one of photoIds or gridSettings must be provided.',
        })
      }

      let gridSettings: PortfolioGridSettings | undefined
      if (hasGridSettings) {
        try {
          gridSettings = this.parseGridSettings(body.gridSettings)
        } catch (err: any) {
          return response.badRequest({ error: err.message })
        }
      }

      let newPhotoIds: number[] | undefined
      if (hasPhotoIds) {
        if (!Array.isArray(photoIds)) {
          return response.badRequest({ error: 'photoIds must be an array.' })
        }

        newPhotoIds = photoIds.map((id: any) => Number(id))
        if (newPhotoIds.some((id) => !Number.isInteger(id) || id <= 0)) {
          return response.badRequest({
            error: 'photoIds must contain only positive numeric ids.',
          })
        }

        // Build a thumbnail map from the existing build result
        const originalItemsMap = new Map(
          (build.result?.photoItems ?? []).map((item: any) => [Number(item.id), item])
        )

        // Any IDs not present in the original result must be verified to belong to
        // the user's catalog (defense against IDOR) and their thumbnails resolved.
        const unknownIds = newPhotoIds.filter((id) => !originalItemsMap.has(id))
        if (unknownIds.length > 0) {
          const photos = await Photo.query()
            .whereIn('id', unknownIds)
            .where('user_id', user.id)
            .select(['id', 'thumbnail_name'])

          if (photos.length !== unknownIds.length) {
            const foundIds = new Set(photos.map((p) => p.id))
            const invalidIds = unknownIds.filter((id) => !foundIds.has(id))
            return response.badRequest({
              error: `photoIds contains IDs that don't belong to the current user: ${invalidIds.join(', ')}`,
            })
          }

          for (const photo of photos) {
            originalItemsMap.set(photo.id, { id: photo.id, thumbnailUrl: photo.thumbnailUrl })
          }
        }

        const newPhotoItems = newPhotoIds
          .map((id: number) => originalItemsMap.get(id))
          .filter(Boolean)

        build.result = {
          ...build.result!,
          photoIds: newPhotoIds,
          photoItems: newPhotoItems,
        }
      }

      if (gridSettings) {
        build.config = { ...build.config, gridSettings }
      }

      await build.save()

      return response.ok({
        success: true,
        photoIds: newPhotoIds ?? build.result?.photoIds ?? [],
        gridSettings: build.config.gridSettings ?? null,
      })
    } catch (error: any) {
      console.error('[PortfolioBuildController] updateLayout error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * Validate the grid presentation settings sent by the detail view. Ranges
   * mirror the toolbar controls (2–6 columns, 0–60px gap).
   */
  private parseGridSettings(raw: any): PortfolioGridSettings {
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('gridSettings must be an object.')
    }

    const columns = Number(raw.columns)
    if (!Number.isInteger(columns) || columns < 2 || columns > 6) {
      throw new Error('gridSettings.columns must be an integer between 2 and 6.')
    }

    const gap = Number(raw.gap)
    if (!Number.isFinite(gap) || gap < 0 || gap > 60) {
      throw new Error('gridSettings.gap must be a number between 0 and 60.')
    }

    if (typeof raw.fillAvailableSpace !== 'boolean') {
      throw new Error('gridSettings.fillAvailableSpace must be a boolean.')
    }

    return { columns, gap: Math.round(gap), fillAvailableSpace: raw.fillAvailableSpace }
  }

  /**
   * GET /api/portfolio-build/eligibility
   * Check if the user is eligible to start a build. Accepts an optional
   * `targetSize` query parameter to evaluate eligibility for a specific size
   * (matches the dynamic pool requirement computed in the service).
   */
  public async eligibility({ request, response, auth }: HttpContext) {
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

      const rawTargetSize = request.qs().targetSize
      let targetSize: number | undefined
      if (rawTargetSize !== undefined && rawTargetSize !== null && rawTargetSize !== '') {
        const parsed = Number(rawTargetSize)
        if (!Number.isFinite(parsed) || parsed < 10 || parsed > 60) {
          return response.badRequest({ error: 'targetSize must be a number between 10 and 60.' })
        }
        targetSize = parsed
      }

      const service = new PortfolioBuildService()
      const result = await service.validateBuildEligibility(user.id, targetSize)

      return response.ok(result)
    } catch (error: any) {
      console.error('[PortfolioBuildController] eligibility error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * POST /api/portfolio-build/manual
   * Create a manually-curated (empty) portfolio. No AI pipeline runs.
   * The user will add/remove photos through the detail view.
   */
  public async createManual({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const body = request.body()
      const rawName = typeof body.name === 'string' ? body.name.trim() : ''
      if (rawName.length === 0) {
        return response.badRequest({ error: 'name is required.' })
      }
      const name = rawName.slice(0, 200)

      let description: string | undefined
      if (typeof body.description === 'string' && body.description.trim().length > 0) {
        description = body.description.trim().slice(0, 2000)
      }

      const service = new PortfolioBuildService()
      const setId = await this.parseAndValidateSetId(body.setId, user.id)
      const build = await service.createManual(user.id, name, description, setId)

      return response.ok({
        success: true,
        buildId: build.id,
        setId: build.setId,
        status: build.status,
      })
    } catch (error: any) {
      if (error.message?.includes('Portfolio set not found')) {
        return response.notFound({ error: error.message })
      }
      if (error.message?.includes('setId must be')) {
        return response.badRequest({ error: error.message })
      }
      console.error('[PortfolioBuildController] createManual error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/portfolio-build/estimate-credits
   * Estimate the credit cost for a build config. Used by the wizard to show a
   * live, backend-authoritative cost estimate as the user adjusts settings.
   *
   * Query params: targetSize, coherenceMode, sequencing, stylePreferences
   */
  public async estimateCredits({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()

      const qs = request.qs()

      const rawTargetSize = Number(qs.targetSize)
      if (!Number.isFinite(rawTargetSize) || rawTargetSize < 10 || rawTargetSize > 60) {
        return response.badRequest({ error: 'targetSize must be a number between 10 and 60.' })
      }

      const coherenceMode = qs.coherenceMode ?? 'free'
      const VALID_COHERENCE_MODES = ['free', 'visual', 'chromatic', 'narrative', 'heterogeneous']
      if (!VALID_COHERENCE_MODES.includes(coherenceMode)) {
        return response.badRequest({ error: `Invalid coherenceMode: ${coherenceMode}` })
      }

      const sequencing = qs.sequencing === 'true' || qs.sequencing === '1'
      const stylePreferences =
        typeof qs.stylePreferences === 'string' && qs.stylePreferences.trim().length > 0
          ? qs.stylePreferences.trim()
          : undefined

      const config = {
        targetSize: rawTargetSize,
        coherenceMode: coherenceMode as any,
        sequencing,
        stylePreferences,
        weights: {},
      }

      const credits = PortfolioBuildService.estimateCredits(config)
      return response.ok({ credits })
    } catch (error: any) {
      console.error('[PortfolioBuildController] estimateCredits error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/portfolio-build/default-weights
   * Returns the canonical default weight vector (0..1 slider scale) that the
   * wizard should display as its initial state. This is the single source of
   * truth — the frontend must NOT hard-code these values.
   */
  public async getDefaultWeights({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const weights = PortfolioBuildService.getDefaultWeights(user.profiles)
      return response.ok({ weights })
    } catch (error: any) {
      console.error('[PortfolioBuildController] getDefaultWeights error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  // ── Validation ─────────────────────────────────────────────

  /**
   * POST /api/portfolio-build/preview-style-weights
   * Parse a free-text style description into an emphasize/deemphasize set
   * plus the resulting weight vector (in the 0..1 slider range). Used by the
   * wizard to give the user a live preview before they commit to a build.
   */
  public async previewStyleWeights({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user as any

      const body = request.body()
      const raw = body.stylePreferences
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        return response.badRequest({
          error: 'stylePreferences must be a non-empty string.',
        })
      }
      const stylePreferences = raw.trim().slice(0, 1000)

      const service = new PortfolioBuildService()
      const result = await service.previewStyleWeights(stylePreferences, user?.profiles)
      return response.ok(result)
    } catch (error: any) {
      console.error('[PortfolioBuildController] previewStyleWeights error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  private parseAndValidateConfig(body: any, userProfile: string | null): PortfolioBuildConfig {
    const variant: PromptVariant = getPromptVariant(userProfile)
    const validScoreFields = getArtisticExternalKeys(variant)
    const scoreFieldAliases = getScoreInternalToExternal(variant)

    const name =
      body.name && typeof body.name === 'string' ? body.name.trim().slice(0, 200) : undefined

    const targetSize = Number(body.targetSize)
    if (!Number.isFinite(targetSize) || targetSize < 10 || targetSize > 60) {
      throw new Error('targetSize must be between 10 and 60.')
    }

    const hasStylePreferences =
      typeof body.stylePreferences === 'string' && body.stylePreferences.trim().length > 0

    const rawWeights = body.weights
    if (rawWeights !== undefined && rawWeights !== null) {
      if (typeof rawWeights !== 'object') {
        throw new Error('weights must be an object.')
      }
    } else if (!hasStylePreferences) {
      throw new Error('Either "weights" or "stylePreferences" must be provided.')
    }

    // Normalize aliased field names (e.g. strangeness → originality)
    let weights: Record<string, number> | undefined
    if (rawWeights && typeof rawWeights === 'object') {
      weights = {}
      for (const [field, value] of Object.entries(rawWeights)) {
        const canonical = scoreFieldAliases[field] ?? field
        if (!validScoreFields.includes(canonical)) {
          throw new Error(`Invalid weight field: ${field}`)
        }
        if (typeof value !== 'number' || value < 0 || value > 10) {
          throw new Error(`Weight for ${field} must be a number between 0 and 10.`)
        }
        weights[canonical] = value
      }
    }

    const coherenceMode = body.coherenceMode ?? 'free'
    if (!VALID_COHERENCE_MODES.includes(coherenceMode)) {
      throw new Error(`Invalid coherenceMode: ${coherenceMode}`)
    }

    const sequencing = Boolean(body.sequencing ?? false)

    const config: PortfolioBuildConfig = {
      ...(name ? { name } : {}),
      targetSize,
      // `weights` may be undefined here; the caller resolves it from
      // stylePreferences before actually starting the build.
      weights: weights as Record<string, number>,
      coherenceMode,
      sequencing,
    }

    if (hasStylePreferences) {
      config.stylePreferences = body.stylePreferences.trim().slice(0, 1000)
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

  private async parseAndValidateSetId(rawSetId: any, userId: number): Promise<number | null> {
    if (rawSetId === undefined || rawSetId === null || rawSetId === '') {
      return null
    }

    const setId = Number(rawSetId)
    if (!Number.isFinite(setId)) {
      throw new Error('setId must be a valid number.')
    }

    const set = await PortfolioBuildSet.query().where('id', setId).where('userId', userId).first()
    if (!set) {
      throw new Error('Portfolio set not found.')
    }

    return setId
  }
}
