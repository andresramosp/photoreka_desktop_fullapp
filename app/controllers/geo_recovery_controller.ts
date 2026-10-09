/**
 * Anonymous, paid one-shot endpoint set for the "geo-recovery" standalone product.
 * Self-contained: copies the R2 upload-worker signing logic from CatalogController
 * so we don't refactor production code paths.
 *
 * R2 layout: geo-recovery/{sessionId}/{clientPhotoId}.{ext}
 * Cloudflare R2 lifecycle rule should expire this prefix after ~7 days.
 */

import crypto from 'node:crypto'
import axios from 'axios'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

import GeoRecoverySessionService, {
  GEO_RECOVERY_MAX_PHOTOS_PER_SESSION,
  type GeoRecoveryPhotoEntry,
  type GeoRecoverySessionState,
} from '#services/geo_recovery_session_service'
import GeoRecoveryInferenceService from '#services/geo_recovery_inference_service'
import GeoRecoveryPaymentService, {
  computeAmountCents,
  PRICE_PER_PHOTO_EUR,
} from '#services/geo_recovery_payment_service'
import GeoRecoveryAssessmentService, {
  ASSESS_MAX_PHOTOS,
  type AssessPhotoInput,
} from '#services/geo_recovery_assessment_service'
import GeocodeCache from '#models/geocode_cache'
import GeocodingService from '#services/geocoding_service'

const UPLOAD_URL_TTL_SECONDS = 60 * 15
// Thumbs are produced in-browser before upload; the original image never leaves
// the client. We accept jpeg/png/webp because the resizer can output any of them
// depending on VITE_UPLOAD_FORMAT.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const R2_PREFIX = 'geo-recovery'

// Shared with GeocodingController via geocoding_monthly_usage table — same key
// keeps both flows counting against the same Mapbox session budget.
const MAPBOX_SESSION_MONTHLY_LIMIT = 450
const MAPBOX_SESSION_PROVIDER_KEY = 'mapbox_session'

type LocationGranularity = 'place' | 'city' | 'region' | 'country'

function mapboxFeatureTypeToGranularity(featureType: string | undefined): LocationGranularity {
  switch (featureType) {
    case 'address':
    case 'poi':
    case 'street':
    case 'neighborhood':
    case 'locality':
      return 'place'
    case 'postcode':
    case 'place':
      return 'city'
    case 'district':
    case 'region':
      return 'region'
    case 'country':
      return 'country'
    default:
      return 'city'
  }
}

export default class GeoRecoveryController {
  private sessionService = new GeoRecoverySessionService()
  private inferenceService = new GeoRecoveryInferenceService()
  private assessmentService = new GeoRecoveryAssessmentService()
  private paymentService = new GeoRecoveryPaymentService()

  // ── Endpoints ──────────────────────────────────────────────────────────────

  // ── Assessment (anonymous, no session required) ─────────────────────────────

  public async assess({ request, response }: HttpContext) {
    const { images } = request.only(['images']) as { images?: any[] }
    if (!Array.isArray(images) || images.length === 0) {
      return response.badRequest({ error: 'images array is required' })
    }

    const limited = images.slice(0, ASSESS_MAX_PHOTOS)
    const parsed: AssessPhotoInput[] = []

    for (let i = 0; i < limited.length; i++) {
      const raw = limited[i]
      if (typeof raw?.data !== 'string' || raw.data.length === 0) continue
      const mimeType: AssessPhotoInput['mimeType'] = ALLOWED_MIME_TYPES.includes(raw.mimeType)
        ? (raw.mimeType as AssessPhotoInput['mimeType'])
        : 'image/jpeg'
      parsed.push({ id: i + 1, data: raw.data, mimeType })
    }

    if (parsed.length === 0) {
      return response.badRequest({ error: 'No valid images provided' })
    }

    try {
      const summary = await this.assessmentService.assess(parsed)
      return response.ok(summary)
    } catch (error: any) {
      console.error('[GeoRecovery] assess error:', error)
      return response.internalServerError({ error: 'Assessment failed' })
    }
  }

  public async createSession({ response }: HttpContext) {
    try {
      const { sessionToken, state } = await this.sessionService.create()
      return response.created({
        sessionToken,
        sessionId: state.sessionId,
        maxPhotos: GEO_RECOVERY_MAX_PHOTOS_PER_SESSION,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      })
    } catch (error: any) {
      console.error('[GeoRecovery] createSession error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  /**
   * Creates a free-run session (no payment required).
   * Enforces two best-effort daily limits via Redis:
   *   • 1 free run per IP per day
   *   • 10 free runs globally per day
   */
  public async freeSession({ request, response }: HttpContext) {
    const clientIp =
      request.header('x-forwarded-for')?.split(',')[0]?.trim() || request.ip() || 'unknown'
    try {
      const result = await this.sessionService.createFree(clientIp)
      if ('error' in result) {
        const message =
          result.error === 'ip_limit'
            ? 'You have already used your free analysis today. Come back tomorrow.'
            : 'Free analyses are fully booked for today. Come back tomorrow.'
        return response.tooManyRequests({ error: message, code: result.error.toUpperCase() })
      }
      return response.created({
        sessionToken: result.sessionToken,
        sessionId: result.state.sessionId,
        maxPhotos: GEO_RECOVERY_MAX_PHOTOS_PER_SESSION,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      })
    } catch (error: any) {
      console.error('[GeoRecovery] freeSession error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  public async getUploadUrl({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const { clientPhotoId, contentType } = request.only(['clientPhotoId', 'contentType'])
    if (typeof clientPhotoId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(clientPhotoId)) {
      return response.badRequest({ error: 'Invalid clientPhotoId' })
    }
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return response.badRequest({ error: 'Unsupported content type' })
    }

    const ext =
      contentType === 'image/png' ? '.png' : contentType === 'image/webp' ? '.webp' : '.jpg'
    const r2Key = `${R2_PREFIX}/${session.sessionId}/${clientPhotoId}${ext}`
    const uploadUrl = this.buildUploadWorkerUrl(r2Key, contentType)
    if (!uploadUrl) {
      return response.internalServerError({ error: 'Upload worker not configured' })
    }

    return response.ok({ uploadUrl, r2Key })
  }

  public async registerPhotos({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    // The browser only uploads after paying (or opening a free run), and the paid
    // count is the ceiling: without it, paying for one photo could register 5,000.
    if (!session.paid) {
      return response.paymentRequired({ error: 'Payment required before uploading photos' })
    }

    const { photos } = request.only(['photos']) as { photos?: any[] }
    if (!Array.isArray(photos) || photos.length === 0) {
      return response.badRequest({ error: 'photos array is required' })
    }

    const sanitized: GeoRecoveryPhotoEntry[] = []
    const seen = new Set(session.photos.map((p) => p.clientPhotoId))

    for (const raw of photos) {
      const clientPhotoId = typeof raw?.clientPhotoId === 'string' ? raw.clientPhotoId : null
      const r2Key = typeof raw?.r2Key === 'string' ? raw.r2Key : null
      const mime = typeof raw?.mime === 'string' ? raw.mime : null
      const originalName = typeof raw?.originalName === 'string' ? raw.originalName : null
      const takenAtMs = Number.isFinite(raw?.takenAtMs) ? Number(raw.takenAtMs) : null

      if (!clientPhotoId || !r2Key || !mime || !originalName) continue
      if (!ALLOWED_MIME_TYPES.includes(mime as any)) continue
      if (!r2Key.startsWith(`${R2_PREFIX}/${session.sessionId}/`)) continue
      if (seen.has(clientPhotoId)) continue

      seen.add(clientPhotoId)
      sanitized.push({
        clientPhotoId,
        r2Key,
        mime,
        originalName: originalName.slice(0, 255),
        takenAtMs,
      })
    }

    if (sanitized.length === 0) {
      return response.badRequest({ error: 'No valid photo entries to register' })
    }

    const merged = [...session.photos, ...sanitized]
    const photoLimit = session.photoLimit ?? GEO_RECOVERY_MAX_PHOTOS_PER_SESSION
    if (merged.length > photoLimit) {
      return response.badRequest({
        error: `Too many photos (this session covers ${photoLimit})`,
      })
    }

    session.photos = merged
    await this.sessionService.save(session)

    const imagesWorker = (process.env.IMAGES_WORKER ?? '').trim()
    const base = imagesWorker
      ? imagesWorker.startsWith('http')
        ? imagesWorker.replace(/\/+$/, '')
        : `https://${imagesWorker.replace(/\/+$/, '')}`
      : null
    const photoUrls: Record<string, string> = {}
    if (base) {
      for (const p of sanitized) {
        photoUrls[p.clientPhotoId] = `${base}/${p.r2Key}`
      }
    }

    return response.ok({ photoCount: session.photos.length, photoUrls })
  }

  /**
   * Creates a Stripe PaymentIntent and returns the client_secret.
   * The frontend mounts the Payment Element with this secret.
   * Photos have NOT been uploaded yet — photoCount comes from the request body.
   * POST /api/geo-recovery/payment-intent
   */
  public async createPaymentIntent({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    if (session.paid) {
      return response.badRequest({ error: 'Session is already paid' })
    }

    const { photoCount } = request.only(['photoCount'])
    const count = Number(photoCount)
    if (!Number.isInteger(count) || count < 1) {
      return response.badRequest({ error: 'photoCount must be a positive integer' })
    }

    try {
      const result = await this.paymentService.createPaymentIntent(session.sessionId, count)
      return response.ok(result)
    } catch (error: any) {
      console.error('[GeoRecovery] createPaymentIntent error:', error)
      return response.internalServerError({ error: 'Failed to create payment intent' })
    }
  }

  /**
   * Returns the price breakdown for the current session.
   * GET /api/geo-recovery/price
   */
  public async price({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const photoCount = session.photos.length
    const amountCents = computeAmountCents(photoCount)
    return response.ok({
      photoCount,
      amountCents,
      amountEur: amountCents / 100,
      pricePerPhotoEur: PRICE_PER_PHOTO_EUR,
    })
  }

  /**
   * Verifies a Stripe PaymentIntent and marks the geo-recovery session as paid.
   * Called by the frontend immediately after stripe.confirmPayment() succeeds,
   * before uploading files — closes the webhook race condition.
   * POST /api/geo-recovery/confirm-payment
   */
  public async confirmPayment({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const { stripePaymentIntentId, customerEmail } = request.only([
      'stripePaymentIntentId',
      'customerEmail',
    ])
    if (typeof stripePaymentIntentId !== 'string' || !stripePaymentIntentId) {
      return response.badRequest({ error: 'stripePaymentIntentId is required' })
    }

    const normalizedCustomerEmail =
      typeof customerEmail === 'string' && customerEmail.trim().length > 0
        ? customerEmail.trim()
        : undefined

    try {
      const confirmed = await this.paymentService.confirmPaymentIntent(
        stripePaymentIntentId,
        session.sessionId,
        normalizedCustomerEmail
      )
      if (!confirmed) {
        return response.unprocessableEntity({ error: 'Payment could not be confirmed' })
      }
      return response.ok({ confirmed: true })
    } catch (error: any) {
      console.error('[GeoRecovery] confirmPayment error:', error)
      return response.internalServerError({ error: 'Payment confirmation failed' })
    }
  }

  public async start({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    if (!session.paid) {
      return response.paymentRequired({ error: 'Payment required before starting analysis' })
    }
    if (session.photos.length === 0) {
      return response.badRequest({ error: 'No photos registered for this session' })
    }

    try {
      const job = await this.inferenceService.start(session.sessionId)
      return response.accepted({ job })
    } catch (error: any) {
      if (error.message?.includes('already running')) {
        return response.conflict({ error: error.message })
      }
      console.error('[GeoRecovery] start error:', error)
      return response.internalServerError({ error: error.message })
    }
  }

  public async job({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const [job, results] = await Promise.all([
      this.inferenceService.getJob(session.sessionId),
      this.inferenceService.getResults(session.sessionId),
    ])
    return response.ok({ job, results })
  }

  // ── Geocoding proxy (session-token-gated, used by the in-map correction popup) ─
  // These mirror GeocodingController.suggest/retrieve verbatim, swapping out the
  // JWT auth check for a geo-recovery session token check. They share the same
  // Mapbox monthly session counter (provider key "mapbox_session") and the same
  // geocode_cache table as the main app so quotas and cached lookups stay aligned.

  public async geocodingSuggest({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const query = String(request.input('query', '')).trim()
    const sessionToken = String(request.input('session_token', '')).trim()
    const language = String(request.input('language', 'en'))
    const country = request.input('country', undefined)

    if (!query || query.length < 2) return response.ok({ suggestions: [] })
    if (!sessionToken) return response.badRequest({ error: 'session_token is required' })

    const key = process.env.MAPBOX_ACCESS_TOKEN
    if (!key) return response.serviceUnavailable({ error: 'Geocoding not configured' })

    const normalized = GeocodingService.normalizeQuery(query)
    const cached = await GeocodeCache.findBy('query_normalized', normalized)
    if (cached) {
      return response.ok({
        suggestions: [],
        cachedResult: {
          lat: Number(cached.lat),
          lng: Number(cached.lng),
          formattedAddress: cached.formattedAddress,
          placeId: cached.placeId,
        },
      })
    }

    try {
      const params: Record<string, string | number | boolean> = {
        q: query,
        access_token: key,
        session_token: sessionToken,
        language,
        types: 'address,street,place,region,country',
        limit: 5,
      }
      if (country) params.country = String(country)

      const res = await axios.get('https://api.mapbox.com/search/searchbox/v1/suggest', {
        params,
        timeout: 8_000,
      })
      return response.ok({ suggestions: res.data?.suggestions ?? [] })
    } catch (error) {
      console.warn(
        '[GeoRecoveryController] suggest error:',
        error instanceof Error ? error.message : String(error)
      )
      return response.serviceUnavailable({ error: 'Autocomplete service unavailable' })
    }
  }

  public async geocodingRetrieve({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const mapboxId = String(request.input('mapbox_id', '')).trim()
    const sessionToken = String(request.input('session_token', '')).trim()
    if (!mapboxId || !sessionToken) {
      return response.badRequest({ error: 'mapbox_id and session_token are required' })
    }

    const key = process.env.MAPBOX_ACCESS_TOKEN
    if (!key) return response.serviceUnavailable({ error: 'Geocoding not configured' })

    const cachedByPlace = await GeocodeCache.query().where('place_id', mapboxId).first()
    if (cachedByPlace) {
      return response.ok({
        geocodeCacheId: cachedByPlace.id,
        lat: Number(cachedByPlace.lat),
        lng: Number(cachedByPlace.lng),
        formattedAddress: cachedByPlace.formattedAddress,
        placeId: cachedByPlace.placeId,
        granularity: (cachedByPlace.granularity as LocationGranularity | null) ?? 'city',
        fromCache: true,
      })
    }

    const reserved = await this.reserveMapboxSession()
    if (!reserved) {
      return response.tooManyRequests({
        error: 'Monthly autocomplete session limit reached. Try again next month.',
      })
    }

    try {
      const res = await axios.get(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
        { params: { access_token: key, session_token: sessionToken }, timeout: 8_000 }
      )
      const feature = res.data?.features?.[0]
      if (!feature) return response.unprocessableEntity({ error: 'No result for this location' })

      const [lng, lat] = feature.geometry?.coordinates ?? []
      if (lat == null || lng == null) {
        return response.unprocessableEntity({ error: 'Could not extract coordinates' })
      }

      const address =
        feature.properties?.full_address ??
        feature.properties?.place_formatted ??
        feature.properties?.name ??
        ''
      const placeIdResult: string | null = feature.properties?.mapbox_id ?? null
      const granularity = mapboxFeatureTypeToGranularity(feature.properties?.feature_type)

      const normalizedAddress = GeocodingService.normalizeQuery(String(address))
      let geocodeCacheId: number | null = null
      try {
        const created = await GeocodeCache.create({
          queryNormalized: normalizedAddress,
          provider: 'mapbox',
          lat: Number(lat),
          lng: Number(lng),
          formattedAddress: String(address),
          placeId: placeIdResult,
          granularity,
        })
        geocodeCacheId = created.id
      } catch {
        const existing = await GeocodeCache.findBy('query_normalized', normalizedAddress)
        geocodeCacheId = existing?.id ?? null
      }

      return response.ok({
        geocodeCacheId,
        lat: Number(lat),
        lng: Number(lng),
        formattedAddress: String(address),
        placeId: placeIdResult,
        granularity,
      })
    } catch (error) {
      console.warn(
        '[GeoRecoveryController] retrieve error:',
        error instanceof Error ? error.message : String(error)
      )
      return response.serviceUnavailable({ error: 'Geocoding service unavailable' })
    }
  }

  private async reserveMapboxSession(): Promise<boolean> {
    const yearMonth = DateTime.now().toFormat('yyyy-MM')
    try {
      await db.rawQuery(
        `INSERT INTO geocoding_monthly_usage (provider, year_month, call_count, created_at, updated_at)
         VALUES (?, ?, 0, NOW(), NOW())
         ON CONFLICT (provider, year_month) DO NOTHING`,
        [MAPBOX_SESSION_PROVIDER_KEY, yearMonth]
      )
      const result = await db.rawQuery(
        `UPDATE geocoding_monthly_usage
         SET call_count = call_count + 1, updated_at = NOW()
         WHERE provider = ? AND year_month = ? AND call_count < ?
         RETURNING call_count`,
        [MAPBOX_SESSION_PROVIDER_KEY, yearMonth, MAPBOX_SESSION_MONTHLY_LIMIT]
      )
      return (result.rows?.length ?? 0) > 0
    } catch (error) {
      console.warn(
        '[GeoRecoveryController] reserveMapboxSession error:',
        error instanceof Error ? error.message : String(error)
      )
      return false
    }
  }

  // ── Auth helper ────────────────────────────────────────────────────────────

  private async requireSession(
    request: HttpContext['request'],
    response: HttpContext['response']
  ): Promise<GeoRecoverySessionState | null> {
    const token = request.header('authorization') ?? request.header('x-geo-recovery-session')
    const session = await this.sessionService.loadFromToken(token)
    if (!session) {
      response.unauthorized({ error: 'Invalid or expired session token' })
      return null
    }
    return session
  }

  // ── R2 upload-worker signing (copied from CatalogController, see notes above) ──

  private getUploadWorkerBaseUrl(): string | null {
    const rawBaseUrl = process.env.R2_UPLOAD_WORKER_URL || process.env.IMAGES_WORKER
    if (!rawBaseUrl || !process.env.R2_UPLOAD_WORKER_SECRET) return null
    const trimmed = rawBaseUrl.trim().replace(/\/+$/, '')
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    return `https://${trimmed}`
  }

  private buildUploadWorkerSignature(key: string, contentType: string, expiresAt: number): string {
    const secret = process.env.R2_UPLOAD_WORKER_SECRET
    if (!secret) throw new Error('R2 upload worker secret is not configured')
    return crypto
      .createHmac('sha256', secret)
      .update(`${key}\n${contentType}\n${expiresAt}`)
      .digest('hex')
  }

  private buildUploadWorkerUrl(key: string, contentType: string): string | null {
    const baseUrl = this.getUploadWorkerBaseUrl()
    if (!baseUrl) return null
    const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS
    const url = new URL(`/upload/${encodeURIComponent(key)}`, `${baseUrl}/`)
    url.searchParams.set('contentType', contentType)
    url.searchParams.set('expires', String(expiresAt))
    url.searchParams.set('signature', this.buildUploadWorkerSignature(key, contentType, expiresAt))
    return url.toString()
  }
}
