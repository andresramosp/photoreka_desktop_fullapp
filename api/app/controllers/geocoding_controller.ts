import type { HttpContext } from '@adonisjs/core/http'
import Photo from '#models/photo'
import GeocodeCache from '#models/geocode_cache'
import GeocodingService from '../services/geocoding_service.js'
import PhotoManager from '../managers/photo_manager.js'
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import { CloudFunctionError, retrievePlace, suggestPlaces } from '#desktop/cloud_functions'

type LocationGranularity = 'place' | 'city' | 'region' | 'country'

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

    // Escritorio: Mapbox lo consulta la nube, que tiene la clave.
    const user = auth.use('api').user!
    try {
      return response.ok(
        await suggestPlaces(user.id, { query, session_token: sessionToken, language, country })
      )
    } catch (error) {
      if (error instanceof CloudFunctionError) return response.status(error.status).send(error.data ?? {})
      throw error
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

    // Escritorio: la nube consulta Mapbox y lleva el cupo mensual de sesiones, común a todos.
    const user = auth.use('api').user!
    let place: any
    try {
      place = await retrievePlace(user.id, { mapbox_id: mapboxId, session_token: sessionToken })
    } catch (error) {
      if (error instanceof CloudFunctionError) return response.status(error.status).send(error.data ?? {})
      throw error
    }
    const { lat, lng, formattedAddress, placeId, granularity } = place

    // Persist to geocode_cache so future retrieves (and suggests) are served from DB
    const normalizedAddress = GeocodingService.normalizeQuery(String(formattedAddress))
    let geocodeCacheId: number | null = null
    try {
      const created = await GeocodeCache.create({
        queryNormalized: normalizedAddress,
        provider: 'mapbox',
        lat: Number(lat),
        lng: Number(lng),
        formattedAddress: String(formattedAddress),
        placeId,
        granularity,
      })
      geocodeCacheId = created.id
    } catch {
      // Race condition — row already exists, fetch its id
      const existing = await GeocodeCache.findBy('query_normalized', normalizedAddress)
      geocodeCacheId = existing?.id ?? null
    }

    return response.ok({ geocodeCacheId, lat: Number(lat), lng: Number(lng), formattedAddress, placeId, granularity })
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
}
