import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import PublicItem from '#models/public_item'
import PortfolioBuild from '#models/portfolio_build'
import Photo from '#models/photo'
import User from '#models/user'
import type { PortfolioGridSettings } from '#models/portfolio_build'
import { resolvePublicSlug } from '../utils/public_slug.js'

/**
 * A username owns the first path segment of the site (photoreka.com/:username),
 * so it can never shadow an app route.
 */
const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'canvas',
  'catalog',
  'chat',
  'collections',
  'confirm-email',
  'dashboard',
  'geo-recovery',
  'import-area',
  'insights',
  'login',
  'logout',
  'maintenance',
  'photos',
  'portfolios',
  'pricing',
  'profile',
  'register',
  'reset-password',
  'search',
  'series',
  'settings',
  'signup',
  'static',
  'trash',
  'u',
  'workspace',
  'www',
])

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

/**
 * Mirrors the frontend's auto-sizing so a portfolio that was never given an
 * explicit layout still publishes with the columns its owner sees.
 */
function autoColumns(photoCount: number): number {
  if (photoCount <= 9) return 3
  if (photoCount <= 16) return 4
  if (photoCount <= 30) return 5
  return 6
}

export default class PublicItemsController {
  /**
   * PUT /api/me/username
   * Claim the handle the public page is served under. Changing it moves every
   * published page the user has, so the frontend warns before calling this.
   */
  public async claimUsername({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const raw = String(request.input('username') ?? '')
        .trim()
        .toLowerCase()

      if (!USERNAME_RE.test(raw)) {
        return response.badRequest({
          error: '3 to 30 characters: lowercase letters, numbers and dashes.',
        })
      }

      if (RESERVED_USERNAMES.has(raw)) {
        return response.badRequest({ error: 'That username is not available.' })
      }

      const taken = await User.query().where('username', raw).whereNot('id', user.id).first()
      if (taken) {
        return response.badRequest({ error: 'That username is already taken.' })
      }

      user.username = raw
      await user.save()

      return response.ok({ username: raw })
    } catch (error: any) {
      console.error('[PublicItemsController] claimUsername error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * POST /api/public-items
   * Publish a portfolio. Idempotent: re-publishing an already public portfolio
   * refreshes its ratios and keeps the slug, so shared links never break.
   */
  public async store({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      if (!user.username) {
        return response.badRequest({
          error: 'Pick a username before publishing.',
          code: 'USERNAME_REQUIRED',
        })
      }

      const { itemType, itemId, slug, aspectRatios } = request.only([
        'itemType',
        'itemId',
        'slug',
        'aspectRatios',
      ])

      if (itemType !== 'portfolio') {
        return response.badRequest({ error: 'Only portfolios can be published for now.' })
      }

      const buildId = Number(itemId)
      if (!Number.isInteger(buildId) || buildId <= 0) {
        return response.badRequest({ error: 'Invalid itemId.' })
      }

      const build = await PortfolioBuild.query()
        .where('id', buildId)
        .where('userId', user.id)
        .first()

      if (!build) {
        return response.notFound({ error: 'Portfolio not found.' })
      }

      if (build.status !== 'completed') {
        return response.badRequest({ error: 'Only completed portfolios can be published.' })
      }

      const photoIds = build.result?.photoIds ?? []
      if (photoIds.length === 0) {
        return response.badRequest({ error: 'An empty portfolio cannot be published.' })
      }

      // Publishing is the moment the presentation gets pinned: a portfolio whose
      // layout was never saved would otherwise render with the frontend's
      // auto-sizing, which the public page has no way to know about.
      if (!build.config.gridSettings) {
        const gridSettings: PortfolioGridSettings = {
          columns: autoColumns(photoIds.length),
          gap: 30,
          fillAvailableSpace: true,
        }
        build.config = { ...build.config, gridSettings }
        await build.save()
      }

      const ratios = this.parseAspectRatios(aspectRatios)

      const existing = await PublicItem.query()
        .where('userId', user.id)
        .where('itemType', 'portfolio')
        .where('itemId', buildId)
        .first()

      if (existing) {
        if (ratios) existing.aspectRatios = ratios
        if (slug) existing.slug = await resolvePublicSlug(String(slug), user.id, existing.id)
        await existing.save()
        return response.ok({ publicItem: this.format(existing, user.username) })
      }

      const last = await PublicItem.query()
        .where('userId', user.id)
        .orderBy('sortOrder', 'desc')
        .first()

      const desiredSlug = String(slug || build.config.name || `portfolio-${buildId}`)

      const created = await PublicItem.create({
        userId: user.id,
        itemType: 'portfolio',
        itemId: buildId,
        slug: await resolvePublicSlug(desiredSlug, user.id, null),
        sortOrder: (last?.sortOrder ?? -1) + 1,
        aspectRatios: ratios,
        publishedAt: DateTime.now(),
      })

      return response.created({ publicItem: this.format(created, user.username) })
    } catch (error: any) {
      console.error('[PublicItemsController] store error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * DELETE /api/public-items/:id
   */
  public async destroy({ params, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const item = await PublicItem.query()
        .where('id', Number(params.id))
        .where('userId', user.id)
        .first()

      if (!item) {
        return response.notFound({ error: 'Published item not found.' })
      }

      await item.delete()
      return response.ok({ success: true })
    } catch (error: any) {
      console.error('[PublicItemsController] destroy error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/public-items
   * The caller's own published items, for the share controls.
   */
  public async index({ response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      const items = await PublicItem.query().where('userId', user.id).orderBy('sortOrder', 'asc')

      return response.ok({
        username: user.username ?? null,
        publicItems: items.map((item) => this.format(item, user.username)),
      })
    } catch (error: any) {
      console.error('[PublicItemsController] index error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/public/:username  (no auth)
   * The author's index: every portfolio they published, in their own order.
   */
  public async showProfile({ params, response }: HttpContext) {
    try {
      const user = await this.findByUsername(params.username)
      if (!user) return response.notFound({ error: 'Not found.' })

      const items = await PublicItem.query()
        .where('userId', user.id)
        .where('itemType', 'portfolio')
        .orderBy('sortOrder', 'asc')

      if (items.length === 0) {
        return response.ok({ username: user.username, displayName: user.name, items: [] })
      }

      const builds = await PortfolioBuild.query()
        .whereIn(
          'id',
          items.map((item) => item.itemId)
        )
        .where('userId', user.id)
        .where('status', 'completed')

      const buildById = new Map(builds.map((build) => [build.id, build]))

      // One query for every cover rather than one per portfolio.
      const coverIds = builds
        .map((build) => build.result?.photoIds?.[0])
        .filter((id): id is number => Number.isInteger(id))

      const covers = coverIds.length
        ? await Photo.query().whereIn('id', coverIds).where('user_id', user.id)
        : []
      const coverById = new Map(covers.map((photo) => [photo.id, photo]))

      const payload = items
        .map((item) => {
          const build = buildById.get(item.itemId)
          if (!build) return null
          const photoIds = build.result?.photoIds ?? []
          const cover = coverById.get(photoIds[0])
          return {
            slug: item.slug,
            title: build.config.name || `Portfolio #${build.id}`,
            description: build.config.description ?? null,
            photoCount: photoIds.length,
            coverUrl: cover?.thumbnailUrl ?? null,
            publishedAt: item.publishedAt?.toISO() ?? null,
          }
        })
        .filter(Boolean)

      return response.ok({
        username: user.username,
        displayName: user.name,
        items: payload,
      })
    } catch (error: any) {
      console.error('[PublicItemsController] showProfile error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * GET /api/public/:username/:slug  (no auth)
   * Photos are rehydrated from the catalog rather than served from the build's
   * stored photoItems: those carry URLs baked at build time, may miss
   * originalUrl, and keep ids of photos deleted since.
   */
  public async showItem({ params, response }: HttpContext) {
    try {
      const user = await this.findByUsername(params.username)
      if (!user) return response.notFound({ error: 'Not found.' })

      const item = await PublicItem.query()
        .where('userId', user.id)
        .where('slug', String(params.slug).toLowerCase())
        .first()

      if (!item || item.itemType !== 'portfolio') {
        return response.notFound({ error: 'Not found.' })
      }

      const build = await PortfolioBuild.query()
        .where('id', item.itemId)
        .where('userId', user.id)
        .first()

      if (!build || build.status !== 'completed') {
        return response.notFound({ error: 'Not found.' })
      }

      const orderedIds: number[] = build.result?.photoIds ?? []
      const photos = orderedIds.length
        ? await Photo.query().whereIn('id', orderedIds).where('user_id', user.id)
        : []

      const byId = new Map(photos.map((photo) => [photo.id, photo]))
      const ratios = item.aspectRatios || {}

      // Public payload on purpose: no descriptions, filenames, embeddings or EXIF.
      const orderedPhotos = orderedIds
        .map((id) => byId.get(id))
        .filter((photo): photo is Photo => Boolean(photo))
        .map((photo) => ({
          id: photo.id,
          title: photo.title,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
          aspectRatio: ratios[String(photo.id)] ?? null,
        }))

      if (orderedPhotos.length === 0) {
        return response.notFound({ error: 'Not found.' })
      }

      return response.ok({
        type: 'portfolio',
        username: user.username,
        displayName: user.name,
        slug: item.slug,
        title: build.config.name || `Portfolio #${build.id}`,
        description: build.config.description ?? null,
        publishedAt: item.publishedAt?.toISO() ?? null,
        gridSettings: build.config.gridSettings ?? {
          columns: autoColumns(orderedPhotos.length),
          gap: 30,
          fillAvailableSpace: true,
        },
        photos: orderedPhotos,
      })
    } catch (error: any) {
      console.error('[PublicItemsController] showItem error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  private async findByUsername(raw: any) {
    const username = String(raw ?? '')
      .trim()
      .toLowerCase()
    if (!username) return null
    return User.query().whereRaw('LOWER(username) = ?', [username]).first()
  }

  private parseAspectRatios(raw: any): Record<string, number> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(raw)) {
      const id = Number(key)
      const ratio = Number(value)
      if (Number.isInteger(id) && id > 0 && Number.isFinite(ratio) && ratio > 0 && ratio < 100) {
        out[String(id)] = Math.round(ratio * 10000) / 10000
      }
    }
    return Object.keys(out).length > 0 ? out : null
  }

  private format(item: PublicItem, username: string | null) {
    return {
      id: item.id,
      itemType: item.itemType,
      itemId: item.itemId,
      slug: item.slug,
      username,
      sortOrder: item.sortOrder,
      publishedAt: item.publishedAt?.toISO() ?? null,
    }
  }
}
