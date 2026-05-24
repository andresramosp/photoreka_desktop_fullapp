import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import axios from 'axios'
import { DateTime } from 'luxon'
import Photo from '#models/photo'
import GeocodeCache from '#models/geocode_cache'
import GeocodingService from '../services/geocoding_service.js'
import PhotoManager from '../managers/photo_manager.js'
import { CacheInvalidationService } from '#services/cache_invalidation_service'

/**
 * Monthly free-session cap for Mapbox Search Box autocomplete.
 * Mapbox gives 450 free sessions/month; no fallback provider yet.
 */
const MAPBOX_SESSION_MONTHLY_LIMIT = 450
const MAPBOX_SESSION_PROVIDER_KEY = 'mapbox_session'

type LocationGranularity = 'place' | 'city' | 'region' | 'country'

/**
 * Maps Mapbox Search Box feature_type to our internal LocationGranularity.
 * Mapbox types: address, poi, street, neighborhood, locality, postcode, place, district, region, country
 */
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

export default class GeocodingController {
  /**
   * Proxy Mapbox Search Box "suggest" requests.
   * No billable event occurs here — a session is billed only when "retrieve" is called.
   * The client must supply a UUID session_token that lives for the duration of one popup.
   */
  public async suggest({ request, response, auth }: HttpContext) {
    await auth.use('api').authenticate()

    const query = String(request.input('query', '')).trim()
    const sessionToken = String(request.input('session_token', '')).trim()
    const language = String(request.input('language', 'en'))
    const country = request.input('country', undefined)

    if (!query || query.length < 2) {
      return response.ok({ suggestions: [] })
    }

    if (!sessionToken) {
      return response.badRequest({ error: 'session_token is required' })
    }

    const key = process.env.MAPBOX_ACCESS_TOKEN
    if (!key) {
      return response.serviceUnavailable({ error: 'Geocoding not configured' })
    }

    // Check the geocode cache for an exact match on this query before hitting Mapbox
    const normalized = GeocodingService.normalizeQuery(query)
    const cached = await GeocodeCache.findBy('query_normalized', normalized)
    if (cached) {
      console.log(
        `[GeocodingController] suggest cache hit for "${query}" — address="${cached.formattedAddress}"`
      )
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
        '[GeocodingController] suggest error:',
        error instanceof Error ? error.message : String(error)
      )
      return response.serviceUnavailable({ error: 'Autocomplete service unavailable' })
    }
  }

  /**
   * Retrieve a selected suggestion from Mapbox Search Box.
   * This finalises the session and is the billable event.
   * One session counter is incremented per call; if the monthly limit is reached
   * the request is rejected (caller should fall back to a different provider).
   */
  public async retrieve({ request, response, auth }: HttpContext) {
    await auth.use('api').authenticate()

    const mapboxId = String(request.input('mapbox_id', '')).trim()
    const sessionToken = String(request.input('session_token', '')).trim()

    if (!mapboxId || !sessionToken) {
      return response.badRequest({ error: 'mapbox_id and session_token are required' })
    }

    const key = process.env.MAPBOX_ACCESS_TOKEN
    if (!key) {
      return response.serviceUnavailable({ error: 'Geocoding not configured' })
    }

    // Check the geocode cache by place_id before consuming a session
    const cachedByPlace = await GeocodeCache.query().where('place_id', mapboxId).first()
    if (cachedByPlace) {
      console.log(
        `[GeocodingController] retrieve cache hit for mapbox_id="${mapboxId}" — address="${cachedByPlace.formattedAddress}"`
      )
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

    // Reserve one session against the monthly quota before calling the API
    const reserved = await this.reserveSession()
    if (!reserved) {
      console.warn('[GeocodingController] Mapbox autocomplete session limit reached for this month')
      return response.tooManyRequests({
        error: 'Monthly autocomplete session limit reached. Try again next month.',
      })
    }

    try {
      const res = await axios.get(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`,
        {
          params: { access_token: key, session_token: sessionToken },
          timeout: 8_000,
        }
      )

      const feature = res.data?.features?.[0]
      if (!feature) {
        return response.unprocessableEntity({ error: 'No result for this location' })
      }

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

      // Persist to geocode_cache so future retrieves (and suggests) are served from DB
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
        console.log(
          `[GeocodingController] Cached retrieve result for "${normalizedAddress}" — mapbox_id="${mapboxId}" id=${geocodeCacheId}`
        )
      } catch {
        // Race condition — row already exists, fetch its id
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
        '[GeocodingController] retrieve error:',
        error instanceof Error ? error.message : String(error)
      )
      return response.serviceUnavailable({ error: 'Geocoding service unavailable' })
    }
  }

  /**
   * Point a photo at a geocode_cache row (by id) to correct its displayed location.
   *
   * The geocode_cache table is append-only from the app's perspective — coordinates
   * are never mutated here. Correcting a photo simply re-points its FK to the row
   * that was returned by the /retrieve endpoint.
   */
  public async updatePhotoLocation({ params, request, response, auth }: HttpContext) {
    await auth.use('api').authenticate()
    const user = auth.use('api').user! as any

    const photo = await Photo.query().where('id', params.id).where('user_id', user.id).first()

    if (!photo) {
      return response.notFound({ error: 'Photo not found' })
    }

    const geocodeCacheId = Number(request.input('geocodeCacheId'))
    if (!Number.isInteger(geocodeCacheId) || geocodeCacheId <= 0) {
      return response.badRequest({ error: 'geocodeCacheId must be a positive integer' })
    }

    const cacheRow = await GeocodeCache.find(geocodeCacheId)
    if (!cacheRow) {
      return response.notFound({ error: 'Geocode cache entry not found' })
    }

    // Re-point the photo FK — no geocode_cache coordinates are touched
    photo.inferredLocationId = geocodeCacheId
    await photo.save()

    // Annotate EXIF only for photos that already had AI inference metadata
    const existingInference = (photo.descriptions as any)?.EXIF?.aiLocationInference ?? null
    if (existingInference) {
      const manager = new PhotoManager()
      await manager.updatePhotoDescriptions(String(photo.id), {
        EXIF: {
          aiLocationInference: {
            reliability: existingInference.reliability,
            inferredAt: existingInference.inferredAt,
            proximityLocated: existingInference.proximityLocated,
            proximitySourcePhotoId: existingInference.proximitySourcePhotoId,
            correctedByUser: true,
            correctedAt: new Date().toISOString(),
          },
        },
      })
    }

    const updated = await Photo.query().where('id', photo.id).preload('inferredLocation').first()

    CacheInvalidationService.onPhotosGeolocationUpdate(user.id)
    return response.ok({ success: true, photo: updated?.serialize() })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Quota helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Atomically reserve one Mapbox Search Box session against the monthly cap.
   * Uses the same geocoding_monthly_usage table used for geocoding call counts,
   * with the special provider key "mapbox_session".
   */
  private async reserveSession(): Promise<boolean> {
    const yearMonth = DateTime.now().toFormat('yyyy-MM')
    console.log(
      `[GeocodingController] reserveSession() month=${yearMonth} limit=${MAPBOX_SESSION_MONTHLY_LIMIT}`
    )
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

      const reserved = (result.rows?.length ?? 0) > 0
      if (reserved) {
        console.log(
          `[GeocodingController] Session reserved — usage=${result.rows[0]?.call_count}/${MAPBOX_SESSION_MONTHLY_LIMIT} for ${yearMonth}`
        )
      } else {
        console.warn(
          `[GeocodingController] Session limit reached — ${MAPBOX_SESSION_MONTHLY_LIMIT} sessions used for ${yearMonth}`
        )
      }
      return reserved
    } catch (error) {
      console.warn(
        `[GeocodingController] Could not reserve session: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }
}
