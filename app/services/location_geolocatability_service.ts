/**
 * LocationGeolocatabilityService
 *
 * Scores each photo without a location based on its visual_aspects
 * (both LLM-derived and metadata-derived) and returns a forecast split
 * into three tiers:
 *   - good   : score >= 60  → high probability of successful geolocation
 *   - medium : 35 ≤ score < 60  → mixed signals, possible but uncertain
 *   - poor   : score < 35   → unlikely to produce a useful result
 *
 * The algorithm is purely heuristic and runs entirely in-memory — no
 * additional DB queries beyond the initial photo fetch are required.
 */

import Photo from '#models/photo'

// ── Aspect → score tables ──────────────────────────────────────────────────

const GENRE_SCORES: Record<string, number> = {
  documentary: 30,
  landscape: 30,
  street: 25,
  abstract: -30,
  fashion: -25,
  product: -25,
  advertising: -20,
  food: -20,
  lifestyle: -15,
  portrait: -10,
}

const FOCUS_SCORES: Record<string, number> = {
  nitid: 15,
  blurry: -15,
}

const LIGHTING_SCORES: Record<string, number> = {
  'natural': 15,
  'backlit': 8,
  'side lit': 5,
  'frontlit': 3,
  'artificial': -15,
}

const LIGHTING_SCHEME_SCORES: Record<string, number> = {
  'balanced': 5,
  'high key': 0,
  'low key': -8,
}

const PALETTE_SCORES: Record<string, number> = {
  'color': 8,
  'black and white': -5,
  'monochrome': -8,
}

const DEPTH_OF_FIELD_SCORES: Record<string, number> = {
  deep: 10,
  medium: 3,
  shallow: -10,
}

const STYLISTIC_SCORES: Record<string, number> = {
  'bokeh': -15,
  'motion blur': -8,
  'silhouettes': -8,
  'long exposure': -5,
  'grain': -3,
}

const FRAMING_SCORES: Record<string, number> = {
  'wide shot': 10,
  'medium shot': 3,
  'close-up': -10,
}

// ── Tier thresholds ────────────────────────────────────────────────────────

const GOOD_THRESHOLD = 60
const MEDIUM_THRESHOLD = 35

export type GeolocatabilityTier = 'good' | 'medium' | 'poor'

export interface GeolocatabilityForecast {
  total: number
  good: { count: number; percentage: number }
  medium: { count: number; percentage: number }
  poor: { count: number; percentage: number }
  /** True when the majority of photos score poorly — warn the user before proceeding. */
  lowSuccessWarning: boolean
}

// ── Service ────────────────────────────────────────────────────────────────

export default class LocationGeolocatabilityService {
  /**
   * Score a single photo's visual_aspects object.
   * Returns a value in [0, 100].
   * Photos with no analysed aspects at all default to 50 (genuinely unknown).
   */
  public static scorePhoto(descriptions: Record<string, any> | null | undefined): number {
    const va = descriptions?.visual_aspects as Record<string, string[]> | null | undefined
    if (!va || Object.keys(va).length === 0) return 50

    let score = 50

    score += this.applyAspect(va.genre, GENRE_SCORES)
    score += this.applyAspect(va.focus, FOCUS_SCORES)
    score += this.applyAspect(va.lighting, LIGHTING_SCORES)
    score += this.applyAspect(va.lighting_scheme, LIGHTING_SCHEME_SCORES)
    score += this.applyAspect(va.palette, PALETTE_SCORES)
    score += this.applyAspect(va.depth_of_field, DEPTH_OF_FIELD_SCORES)
    score += this.applyAspect(va.stylistic, STYLISTIC_SCORES)
    score += this.applyAspect(va.framing, FRAMING_SCORES)

    return Math.min(100, Math.max(0, Math.round(score)))
  }

  public static tierForScore(score: number): GeolocatabilityTier {
    if (score >= GOOD_THRESHOLD) return 'good'
    if (score >= MEDIUM_THRESHOLD) return 'medium'
    return 'poor'
  }

  /**
   * Compute the full forecast for a set of photos.
   */
  public static forecast(photos: Photo[]): GeolocatabilityForecast {
    const total = photos.length
    if (total === 0) {
      return {
        total: 0,
        good: { count: 0, percentage: 0 },
        medium: { count: 0, percentage: 0 },
        poor: { count: 0, percentage: 0 },
        lowSuccessWarning: false,
      }
    }

    let goodCount = 0
    let mediumCount = 0
    let poorCount = 0

    for (const photo of photos) {
      const score = this.scorePhoto(photo.descriptions as Record<string, any> | null | undefined)
      const tier = this.tierForScore(score)
      if (tier === 'good') goodCount++
      else if (tier === 'medium') mediumCount++
      else poorCount++
    }

    const pct = (n: number) => Math.round((n / total) * 100)

    const lowSuccessWarning = (goodCount + mediumCount) / total < 0.3

    return {
      total,
      good: { count: goodCount, percentage: pct(goodCount) },
      medium: { count: mediumCount, percentage: pct(mediumCount) },
      poor: { count: poorCount, percentage: pct(poorCount) },
      lowSuccessWarning,
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Sum scores for every value present in the aspect array.
   * Ignores values not listed in the table (neutral contribution).
   */
  private static applyAspect(
    values: string[] | string | null | undefined,
    table: Record<string, number>
  ): number {
    if (!values) return 0
    const arr = Array.isArray(values) ? values : [values]
    return arr.reduce((acc, v) => acc + (table[v] ?? 0), 0)
  }
}
