import axios from 'axios'
import { DateTime } from 'luxon'
import GeocodeCache from '#models/geocode_cache'
import db from '@adonisjs/lucid/services/db'

/**
 * Maps a normalised LLM-inferred country name to the alternate names that
 * geocoding APIs may return for the same territory.
 *
 * Two categories:
 *   1. Official renames   — e.g. Turkey → Türkiye (LLM trained on old name)
 *   2. SAR / territories  — e.g. China → Hong Kong (APIs treat HK as a separate entity)
 */
const COUNTRY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // ── Official renames ──────────────────────────────────────────────────────
  'turkey': ['türkiye', 'turkiye'],
  'türkiye': ['turkey'],
  'turkiye': ['turkey'],
  'czechia': ['czech republic'],
  'czech republic': ['czechia'],
  'north macedonia': ['macedonia', 'republic of north macedonia'],
  'macedonia': ['north macedonia'],
  'eswatini': ['swaziland'],
  'swaziland': ['eswatini'],
  'timor-leste': ['east timor'],
  'east timor': ['timor-leste'],
  'cabo verde': ['cape verde'],
  'cape verde': ['cabo verde'],

  // ── SARs and overseas territories treated as separate entities by APIs ────
  // China
  'china': ['hong kong', 'macao', 'macau'],
  // United States
  'united states': [
    'puerto rico',
    'guam',
    'us virgin islands',
    'american samoa',
    'northern mariana islands',
  ],
  'usa': ['puerto rico', 'guam', 'us virgin islands', 'american samoa'],
  // France
  'france': [
    'french polynesia',
    'new caledonia',
    'réunion',
    'reunion',
    'martinique',
    'guadeloupe',
    'french guiana',
    'mayotte',
    'saint barthélemy',
    'saint martin',
  ],
  // Netherlands
  'netherlands': ['aruba', 'curaçao', 'curacao', 'sint maarten', 'caribbean netherlands'],
  // Denmark
  'denmark': ['greenland', 'faroe islands'],
  // New Zealand
  'new zealand': ['cook islands', 'niue'],
  // Australia
  'australia': ['norfolk island', 'christmas island', 'cocos islands', 'cocos (keeling) islands'],
  // United Kingdom
  'united kingdom': [
    'gibraltar',
    'jersey',
    'guernsey',
    'isle of man',
    'bermuda',
    'cayman islands',
    'british virgin islands',
    'turks and caicos islands',
    'falkland islands',
    'saint helena',
  ],
  'uk': ['gibraltar', 'jersey', 'guernsey', 'isle of man'],
  // Norway
  'norway': ['svalbard and jan mayen', 'svalbard'],
  // Finland
  'finland': ['åland islands', 'aland islands'],
}

/**
 * Returns true when `apiCountry` (as returned by a geocoding provider) satisfies
 * the `expected` country preference coming from the LLM inference.
 * Handles official country renames and SAR / overseas territories that geocoding
 * APIs report as independent entities even though they fall under a sovereign state.
 */
function countryMatches(apiCountry: string, expected: string): boolean {
  const a = apiCountry.trim().toLowerCase()
  const e = expected.trim().toLowerCase()
  if (a.includes(e) || e.includes(a)) return true
  const aliases = COUNTRY_NAME_ALIASES[e]
  return aliases !== undefined && aliases.some((alias) => a.includes(alias) || alias.includes(a))
}

export type GeocodingProvider = 'google' | 'mapbox'
export type GeocodingGranularity = 'place' | 'city' | 'region' | 'country'
export type GeocodingFailureReason = 'no_result' | 'country_mismatch' | 'provider_error'

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

interface ProviderGeocodingResult {
  result: GeocodedLocation | null
  failureReason?: GeocodingFailureReason
}

/**
 * Structured geocoding input that maps directly to Mapbox's structured query params.
 * Using these avoids free-text parsing ambiguity (e.g. "Gran Via, Madrid, Spain" matching
 * a village instead of the famous street).
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

interface GeocodingApiPolicy {
  cache_enabled: boolean
  providers: Record<GeocodingProvider, { monthlyRequestLimit: number }>
  defaultProviderOrder: GeocodingProvider[]
  preferredProviderByGranularity: Partial<Record<GeocodingGranularity, GeocodingProvider>>
  fallbackProviders: Record<
    GeocodingProvider,
    Partial<Record<GeocodingFailureReason, GeocodingProvider[]>>
  >
}

export const GEOCODING_API_POLICY: GeocodingApiPolicy = {
  cache_enabled: true,
  providers: {
    mapbox: { monthlyRequestLimit: 99_900 },
    google: { monthlyRequestLimit: 9_900 },
  },
  defaultProviderOrder: ['mapbox', 'google'],
  preferredProviderByGranularity: {
    place: 'google',
  },
  fallbackProviders: {
    mapbox: {
      no_result: ['google'],
      country_mismatch: ['google'],
      provider_error: ['google'],
    },
    google: {
      // no_result: ['mapbox'],
      // country_mismatch: ['mapbox'],
      // provider_error: ['mapbox'],
    },
  },
}

/**
 * Monthly free-tier call caps per provider (with a 100-call safety buffer).
 *   mapbox: 100k/month free → cap at 99,900
 *   google: $200/month credit ≈ 10k requests → cap at 9,900
 */
export const GEOCODING_FREE_TIER_MONTHLY: Record<GeocodingProvider, number> = {
  mapbox: GEOCODING_API_POLICY.providers.mapbox.monthlyRequestLimit,
  google: GEOCODING_API_POLICY.providers.google.monthlyRequestLimit,
}

/**
 * Primary provider (first in the default waterfall). Kept for backward compatibility
 * with cost-record labels - actual geocoding cost is always €0 (free tier).
 */
export const ACTIVE_GEOCODING_PROVIDER: GeocodingProvider =
  GEOCODING_API_POLICY.defaultProviderOrder[0]

export default class GeocodingService {
  /**
   * Always €0 — geocoding exclusively uses provider free tiers.
   * Kept for interface compatibility with cost-tracking callers.
   */
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

  /**
   * Geocode a location query.
   *
   * 1. Looks up the normalised query in the geocode_cache table.
   * 2. On a cache hit, returns the stored result with fromCache=true (no API cost).
   * 3. On a cache miss, builds a provider waterfall from GEOCODING_API_POLICY.
   * 4. Before each external API call, atomically reserves monthly quota for that provider.
   * 5. Failed geocodes only try another provider when policy declares a fallback for the reason.
   *
   * Returns { result: null, fromCache: false } when all providers have exhausted
   * their monthly free tier, when required credentials are missing, or when the
   * provider finds no match.
   */
  async geocode(query: string, options: GeocodeRequestOptions = {}): Promise<GeocodingResult> {
    const language = options.language ?? 'en'
    const normalized = GeocodingService.normalizeQuery(query)
    const providerOrder = this.getProviderOrder(options.granularity)

    console.log(
      `[GeocodingService] geocode() query="${query}" granularity=${options.granularity ?? 'none'} preferredCountry=${options.preferredCountry ?? 'none'} structured=${!!options.structured} language=${language} providerOrder=[${providerOrder.join(', ')}]`
    )

    // 1. DB cache lookup
    const cached = await GeocodeCache.findBy('query_normalized', normalized)
    if (GEOCODING_API_POLICY.cache_enabled && cached) {
      console.log(
        `[GeocodingService] Cache hit for "${query}" — provider=${cached.provider} address="${cached.formattedAddress}" (${cached.lat}, ${cached.lng})`
      )
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

    console.log(`[GeocodingService] Cache miss for "${query}" — proceeding with external API`)

    const attemptedProviders = new Set<GeocodingProvider>()
    let externalCalls = 0

    const tryProviders = async (
      providers: GeocodingProvider[],
      isFallback: boolean
    ): Promise<GeocodingResult | null> => {
      for (const provider of providers) {
        if (attemptedProviders.has(provider)) continue

        if (!this.isProviderConfigured(provider)) {
          console.warn(
            `[GeocodingService] ${provider} is not configured (missing credentials), skipping`
          )
          continue
        }

        console.log(
          `[GeocodingService] Trying provider=${provider} (${isFallback ? 'fallback' : 'primary'}) for "${query}"`
        )

        const reserved = await this.reserveMonthlyRequest(provider)
        if (!reserved) {
          console.warn(
            `[GeocodingService] ${provider} monthly request limit reached — skipping to next provider`
          )
          continue
        }

        attemptedProviders.add(provider)
        externalCalls++

        const raw = await this.callProvider(provider, query, language, options)
        if (raw.result) {
          console.log(
            `[GeocodingService] ${provider} OK — "${raw.result.formattedAddress}" (${raw.result.lat}, ${raw.result.lng}) | externalCalls=${externalCalls} usedFallback=${isFallback}`
          )
          let cacheId: number | undefined
          if (GEOCODING_API_POLICY.cache_enabled) {
            cacheId =
              (await this.cacheResult(
                normalized,
                provider,
                raw.result,
                options.granularity ?? null,
                options.structured ?? null
              )) ?? undefined
          }
          return {
            result: raw.result,
            fromCache: false,
            provider,
            externalCalls,
            usedFallback: isFallback,
            cacheId,
          }
        }

        const failureReason = raw.failureReason ?? 'no_result'
        console.warn(
          `[GeocodingService] ${provider} failed — reason=${failureReason} query="${query}"`
        )

        if (options.allowFallback !== false) {
          const fallbackProviders = this.getFallbackProviders(provider, failureReason)
          if (fallbackProviders.length > 0) {
            console.log(
              `[GeocodingService] Triggering fallback from ${provider} (reason: ${failureReason}) → [${fallbackProviders.join(', ')}]`
            )
            const fallbackResult = await tryProviders(fallbackProviders, true)
            if (fallbackResult) return fallbackResult
          } else {
            console.log(
              `[GeocodingService] No fallback configured for ${provider} + reason=${failureReason}`
            )
          }
        } else {
          console.log(
            `[GeocodingService] Fallback disabled by caller — stopping after ${provider} failure`
          )
        }

        return {
          result: null,
          fromCache: false,
          provider,
          externalCalls,
          usedFallback: isFallback,
        }
      }

      return null
    }

    const result = await tryProviders(providerOrder, false)
    if (!result || !result.result) {
      console.warn(
        `[GeocodingService] All providers exhausted for "${query}" — externalCalls=${externalCalls}`
      )
    }
    return result ?? { result: null, fromCache: false, externalCalls }
  }

  // ---------------------------------------------------------------------------
  // Provider selection & usage tracking
  // ---------------------------------------------------------------------------

  private getProviderOrder(granularity?: GeocodingGranularity | null): GeocodingProvider[] {
    const preferred = granularity
      ? GEOCODING_API_POLICY.preferredProviderByGranularity[granularity]
      : undefined
    const declaredProviders = Object.keys(GEOCODING_API_POLICY.providers) as GeocodingProvider[]
    const defaultOrder = GEOCODING_API_POLICY.defaultProviderOrder
    const ordered = preferred ? [preferred, ...defaultOrder] : [...defaultOrder]

    for (const provider of declaredProviders) {
      if (!ordered.includes(provider)) ordered.push(provider)
    }

    return [...new Set(ordered)]
  }

  private getFallbackProviders(
    provider: GeocodingProvider,
    reason: GeocodingFailureReason
  ): GeocodingProvider[] {
    return GEOCODING_API_POLICY.fallbackProviders[provider]?.[reason] ?? []
  }

  private isProviderConfigured(provider: GeocodingProvider): boolean {
    if (provider === 'mapbox') return !!process.env.MAPBOX_ACCESS_TOKEN
    return !!(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY)
  }

  /**
   * Atomically reserves one monthly request before an external API call.
   * If this returns false, the provider must not be called.
   */
  private async reserveMonthlyRequest(provider: GeocodingProvider): Promise<boolean> {
    const limit = GEOCODING_API_POLICY.providers[provider].monthlyRequestLimit
    if (limit <= 0) return false

    const yearMonth = DateTime.now().toFormat('yyyy-MM')
    console.log(
      `[GeocodingService] reserveMonthlyRequest(${provider}) — limit=${limit} month=${yearMonth}`
    )
    try {
      await db.rawQuery(
        `
          INSERT INTO geocoding_monthly_usage (provider, year_month, call_count, created_at, updated_at)
          VALUES (?, ?, 0, NOW(), NOW())
          ON CONFLICT (provider, year_month) DO NOTHING
        `,
        [provider, yearMonth]
      )

      const result = await db.rawQuery(
        `
          UPDATE geocoding_monthly_usage
          SET call_count = call_count + 1, updated_at = NOW()
          WHERE provider = ? AND year_month = ? AND call_count < ?
          RETURNING call_count
        `,
        [provider, yearMonth, limit]
      )

      const reserved = (result.rows?.length ?? 0) > 0
      if (reserved) {
        const newCount = result.rows[0]?.call_count ?? '?'
        console.log(
          `[GeocodingService] Quota reserved for ${provider} — usage=${newCount}/${limit} for ${yearMonth}`
        )
      } else {
        console.warn(
          `[GeocodingService] Quota exhausted for ${provider} — already at limit=${limit} for ${yearMonth}`
        )
      }
      return reserved
    } catch (error) {
      console.warn(
        `[GeocodingService] Could not reserve monthly quota for ${provider}: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  private async callProvider(
    provider: GeocodingProvider,
    query: string,
    language: string,
    options: GeocodeRequestOptions
  ): Promise<ProviderGeocodingResult> {
    if (provider === 'google') {
      console.log(
        `[GeocodingService] Calling Google Geocoding API — query="${query}" language=${language} preferredCountry=${options.preferredCountry ?? 'none'}`
      )
      return this.callGoogle(query, language, options.preferredCountry)
    }

    if (options.structured) {
      console.log(
        `[GeocodingService] Calling Mapbox structured geocoding — params=${JSON.stringify(options.structured)} language=${language} preferredCountry=${options.preferredCountry ?? 'none'}`
      )
      return this.callMapboxStructured(options.structured, language, options.preferredCountry)
    }

    console.log(
      `[GeocodingService] Calling Mapbox free-text geocoding — query="${query}" language=${language} preferredCountry=${options.preferredCountry ?? 'none'}`
    )
    return this.callMapbox(query, language, options.preferredCountry)
  }

  private async cacheResult(
    normalized: string,
    provider: GeocodingProvider,
    result: GeocodedLocation,
    granularity: string | null = null,
    structured?: { street?: string; place?: string; region?: string; country?: string } | null
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
      console.log(
        `[GeocodingService] Cached result for "${normalized}" — provider=${provider} address="${result.formattedAddress}"`
      )
      return row.id
    } catch {
      // Race condition on unique index — row already exists, fetch it
      try {
        const existing = await GeocodeCache.findBy('query_normalized', normalized)
        return existing?.id ?? null
      } catch {
        return null
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Provider implementations
  // ---------------------------------------------------------------------------

  private async callGoogle(
    query: string,
    language: string,
    preferredCountry?: string
  ): Promise<ProviderGeocodingResult> {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY
    if (!key) return { result: null, failureReason: 'provider_error' }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address: query, key, language },
        timeout: 12_000,
      })
      if (response.data?.status !== 'OK') {
        return {
          result: null,
          failureReason: response.data?.status === 'ZERO_RESULTS' ? 'no_result' : 'provider_error',
        }
      }

      const results: any[] = response.data?.results ?? []
      console.log(
        `[GeocodingService] Google returned ${results.length} candidate(s) for "${query}"`
      )
      if (results.length === 0) return { result: null, failureReason: 'no_result' }

      let chosen = results[0]
      if (preferredCountry) {
        const match = results.find((r) => {
          const countryComp = (r.address_components ?? []).find(
            (c: any) => Array.isArray(c.types) && c.types.includes('country')
          )
          const name = countryComp?.long_name ?? ''
          return countryMatches(name, preferredCountry)
        })
        if (match) {
          chosen = match
          console.log(
            `[GeocodingService] Google: matched preferred country "${preferredCountry}" → "${chosen.formatted_address}"`
          )
        } else {
          console.warn(
            `[GeocodingService] Google: no result matching country "${preferredCountry}" for "${query}" (got ${results.map((r) => r.formatted_address).join(' | ')})`
          )
          return { result: null, failureReason: 'country_mismatch' }
        }
      }

      const location = chosen?.geometry?.location
      if (!location) return { result: null, failureReason: 'no_result' }

      const countryComponent = (chosen?.address_components ?? []).find(
        (c: any) => Array.isArray(c.types) && c.types.includes('country')
      )
      return {
        result: {
          lat: Number(location.lat),
          lng: Number(location.lng),
          formattedAddress: String(chosen.formatted_address),
          placeId: chosen.place_id ?? null,
          country: countryComponent?.long_name ?? undefined,
        },
      }
    } catch (error) {
      console.warn(
        `[GeocodingService] Google geocoding failed for "${query}": ${error instanceof Error ? error.message : String(error)}`
      )
      return { result: null, failureReason: 'provider_error' }
    }
  }

  private async callMapboxStructured(
    params: StructuredGeocodeInput,
    language: string,
    preferredCountry?: string
  ): Promise<ProviderGeocodingResult> {
    const key = process.env.MAPBOX_ACCESS_TOKEN
    if (!key) return { result: null, failureReason: 'provider_error' }

    const queryParams: Record<string, string | number | boolean> = {
      access_token: key,
      language,
      autocomplete: false,
      types: 'address,street,place,region,country',
      limit: preferredCountry ? 5 : 1,
    }
    if (params.street) queryParams.street = params.street
    if (params.place) queryParams.place = params.place
    if (params.region) queryParams.region = params.region
    if (params.country) queryParams.country = params.country

    try {
      const response = await axios.get('https://api.mapbox.com/search/geocode/v6/forward', {
        params: queryParams,
        timeout: 12_000,
      })

      const features: any[] = response.data?.features ?? []
      console.log(
        `[GeocodingService] Mapbox structured returned ${features.length} candidate(s) for ${JSON.stringify(params)}`
      )
      if (features.length === 0) return { result: null, failureReason: 'no_result' }

      let chosen = features[0]
      if (preferredCountry) {
        const match = features.find((f) => {
          const name = f.properties?.context?.country?.name ?? ''
          return countryMatches(name, preferredCountry)
        })
        if (match) {
          chosen = match
          console.log(
            `[GeocodingService] Mapbox structured: matched preferred country "${preferredCountry}" → "${chosen.properties?.full_address ?? chosen.properties?.place_formatted}"`
          )
        } else {
          console.warn(
            `[GeocodingService] Mapbox structured: no result matching country "${preferredCountry}" for ${JSON.stringify(params)} (got ${features.map((f) => f.properties?.context?.country?.name ?? 'unknown').join(' | ')})`
          )
          return { result: null, failureReason: 'country_mismatch' }
        }
      }

      const [lng, lat] = chosen.geometry?.coordinates ?? []
      if (lat === null || lat === undefined || lng === null || lng === undefined) {
        return { result: null, failureReason: 'no_result' }
      }

      return {
        result: {
          lat: Number(lat),
          lng: Number(lng),
          formattedAddress: String(
            chosen.properties?.full_address ?? chosen.properties?.place_formatted ?? ''
          ),
          placeId: chosen.properties?.mapbox_id ?? null,
          country: chosen.properties?.context?.country?.name ?? undefined,
        },
      }
    } catch (error) {
      console.warn(
        `[GeocodingService] Mapbox structured geocoding failed for ${JSON.stringify(params)}: ${error instanceof Error ? error.message : String(error)}`
      )
      return { result: null, failureReason: 'provider_error' }
    }
  }

  private async callMapbox(
    query: string,
    language: string,
    preferredCountry?: string
  ): Promise<ProviderGeocodingResult> {
    const key = process.env.MAPBOX_ACCESS_TOKEN
    if (!key) return { result: null, failureReason: 'provider_error' }

    try {
      const response = await axios.get('https://api.mapbox.com/search/geocode/v6/forward', {
        params: {
          q: query,
          access_token: key,
          language,
          // Request up to 5 candidates when a preferred country is provided so we can
          // pick the best match instead of blindly taking the top result.
          limit: preferredCountry ? 5 : 1,
          types: 'address,street,place,region,country',
          autocomplete: false,
        },
        timeout: 12_000,
      })

      const features: any[] = response.data?.features ?? []
      console.log(
        `[GeocodingService] Mapbox free-text returned ${features.length} candidate(s) for "${query}"`
      )
      if (features.length === 0) return { result: null, failureReason: 'no_result' }

      let chosen = features[0]
      if (preferredCountry) {
        const match = features.find((f) => {
          const name = f.properties?.context?.country?.name ?? ''
          return countryMatches(name, preferredCountry)
        })
        if (match) {
          chosen = match
          console.log(
            `[GeocodingService] Mapbox: matched preferred country "${preferredCountry}" → "${chosen.properties?.full_address ?? chosen.properties?.place_formatted}"`
          )
        } else {
          console.warn(
            `[GeocodingService] Mapbox: no result matching country "${preferredCountry}" for "${query}" (got ${features.map((f) => f.properties?.context?.country?.name ?? 'unknown').join(' | ')})`
          )
          return { result: null, failureReason: 'country_mismatch' }
        }
      }

      // GeoJSON coordinates are [longitude, latitude]
      const [lng, lat] = chosen.geometry?.coordinates ?? []
      if (lat === null || lat === undefined || lng === null || lng === undefined) {
        return { result: null, failureReason: 'no_result' }
      }

      return {
        result: {
          lat: Number(lat),
          lng: Number(lng),
          formattedAddress: String(
            chosen.properties?.full_address ?? chosen.properties?.place_formatted ?? query
          ),
          placeId: chosen.properties?.mapbox_id ?? null,
          country: chosen.properties?.context?.country?.name ?? undefined,
        },
      }
    } catch (error) {
      console.warn(
        `[GeocodingService] Mapbox geocoding failed for "${query}": ${error instanceof Error ? error.message : String(error)}`
      )
      return { result: null, failureReason: 'provider_error' }
    }
  }
}
