import GeocodeCache from '#models/geocode_cache'
import { geocodeInCloud } from '#desktop/cloud_functions'

/**
 * Escritorio: la geocodificación la hace el servicio de la nube, que tiene las claves de los
 * proveedores y lleva el cupo mensual gratuito, común a todos los usuarios. Aquí queda la caché
 * local (geocode_cache), a la que apuntan las ubicaciones de las fotos: se consulta primero y
 * guarda lo que devuelve la nube.
 */

export type GeocodingProvider = 'google' | 'mapbox'
export type GeocodingGranularity = 'place' | 'city' | 'region' | 'country'

/**
 * A successfully geocoded location as returned by the cache or a provider.
 */
export interface GeocodedLocation {
  lat: number
  lng: number
  formattedAddress: string
  placeId: string | null
  /** Full English country name as returned by the geocoding provider (e.g. "Indonesia", "France"). */
  country?: string
}

/**
 * Result of a geocode() call, including whether it was served from the DB cache.
 * fromCache=true means no external API call was made and no cost was incurred.
 */
export interface GeocodingResult {
  result: GeocodedLocation | null
  fromCache: boolean
  provider?: GeocodingProvider
  externalCalls: number
  /** True when the result came after a configured fallback attempt. */
  usedFallback?: boolean
  /** ID of the geocode_cache row backing this result (when result is not null). */
  cacheId?: number
}

/**
 * Structured geocoding input that maps directly to Mapbox's structured query params.
 *
 * Mapbox param mapping:
 *   street  ← inferredPlace  (famous street or landmark name)
 *   place   ← inferredCity   (city / town)
 *   region  ← inferredRegion (state / province / autonomous community)
 *   country ← inferredCountry
 */
export interface StructuredGeocodeInput {
  street?: string
  place?: string
  region?: string
  country?: string
}

export interface GeocodeRequestOptions {
  language?: string
  preferredCountry?: string
  structured?: StructuredGeocodeInput
  granularity?: GeocodingGranularity | null
  allowFallback?: boolean
}

export default class GeocodingService {
  /** @param userId cuenta de la nube que hace las consultas. */
  constructor(private userId: number) {}

  /** Always €0 — geocoding exclusively uses provider free tiers. */
  static get costEurPerRequest(): number {
    return 0
  }

  /**
   * Normalise a geocoding query for use as a cache key.
   * Lowercases and collapses whitespace so that semantically identical
   * queries (e.g. "Paris, France" and "paris,  france") share a cache entry.
   */
  static normalizeQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  /** Caché local primero; si no está, la nube, y lo que devuelva se guarda en la caché local. */
  async geocode(query: string, options: GeocodeRequestOptions = {}): Promise<GeocodingResult> {
    const normalized = GeocodingService.normalizeQuery(query)

    const cached = await GeocodeCache.findBy('query_normalized', normalized)
    if (cached) {
      return {
        result: {
          lat: Number(cached.lat),
          lng: Number(cached.lng),
          formattedAddress: cached.formattedAddress,
          placeId: cached.placeId,
        },
        fromCache: true,
        provider: cached.provider as GeocodingProvider,
        externalCalls: 0,
        cacheId: cached.id,
      }
    }

    const remote: GeocodingResult = await geocodeInCloud(this.userId, query, { ...options })
    if (!remote.result || !remote.provider) return remote
    const cacheId = await this.cacheResult(
      normalized,
      remote.provider,
      remote.result,
      options.granularity ?? null,
      options.structured ?? null
    )
    return { ...remote, cacheId: cacheId ?? undefined }
  }

  private async cacheResult(
    normalized: string,
    provider: GeocodingProvider,
    result: GeocodedLocation,
    granularity: string | null = null,
    structured?: StructuredGeocodeInput | null
  ): Promise<number | null> {
    try {
      const row = await GeocodeCache.create({
        queryNormalized: normalized,
        provider,
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        placeId: result.placeId,
        granularity,
        // In Mapbox structured params: street=place-level, place=city-level
        place: structured?.street ?? null,
        city: structured?.place ?? null,
        region: structured?.region ?? null,
        country: structured?.country ?? null,
      })
      return row.id
    } catch {
      // Race condition on unique index — row already exists, fetch it
      const existing = await GeocodeCache.findBy('query_normalized', normalized).catch(() => null)
      return existing?.id ?? null
    }
  }
}
