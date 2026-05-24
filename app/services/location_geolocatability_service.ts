/**
 * LocationGeolocatabilityService
 *
 * Heuristics for two different geolocation-related tasks over visual_aspects:
 *
 * - `scorePhoto()` is still used internally as a soft ranking/tiebreaker
 * - `classify()` / `assess()` perform the binary plausible-vs-discarded split
 *
 * Everything runs entirely in-memory — no additional DB queries beyond the
 * initial photo fetch are required.
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

// ── Binary classification — discard rules ────────────────────────────────────

/**
 * A single condition within a discard rule.
 * Matches when aspect `key` contains at least one value listed in `anyOf`.
 *
 * Set `exclusive: true` to also require that the aspect contains NO values
 * outside of `anyOf` — i.e. the only values present must be the listed ones.
 */
interface AspectCondition {
  aspect: string
  anyOf: string[]
  /** When true, no value outside `anyOf` may be present in the aspect. */
  exclusive?: boolean
}

/**
 * A discard rule fires when ALL of its conditions match simultaneously.
 * Rules are ANDed together; within each condition the values are ORed.
 *
 * Example: rule fires only when genre is 'fashion' AND lighting is 'artificial'.
 */
interface DiscardRule {
  /** Stable identifier — used in the classification result for traceability. */
  name: string
  conditions: AspectCondition[]
}

interface GeolocatabilityClassification {
  plausible: Photo[]
  discarded: { photo: Photo; matchedRules: string[] }[]
}

export interface GeolocatabilityAssessment {
  total: number
  plausible: { count: number; percentage: number }
  discarded: { count: number; percentage: number }
  /** True when most candidate photos are discarded by the binary rules. */
  lowSuccessWarning: boolean
}

/**
 * Default rules. A photo is discarded (group B) if it matches at least one.
 *
 * Rules can be overridden by passing a custom array to `classify()`.
 */
const DISCARD_RULES: DiscardRule[] = [
  // ── Genre-only disqualifiers ─────────────────────────────────────────────
  // These genres are inherently location-agnostic regardless of other aspects.
  {
    name: 'abstract_genre_with_stylistic',
    conditions: [
      { aspect: 'genre', anyOf: ['abstract'] },
      { aspect: 'stylistic', anyOf: ['bokeh', 'motion blur', 'silhouettes', 'long exposure'] },
    ],
  },
  {
    name: 'abstract_genre_closeup',
    conditions: [
      { aspect: 'genre', anyOf: ['abstract'] },
      { aspect: 'framing', anyOf: ['close-up'] },
    ],
  },
  {
    name: 'landscape_only_black_and_white',
    conditions: [
      { aspect: 'genre', anyOf: ['landscape'], exclusive: true },
      { aspect: 'palette', anyOf: ['black and white'] },
    ],
  },
  {
    name: 'landscape_only_stylistic',
    conditions: [
      { aspect: 'genre', anyOf: ['landscape'], exclusive: true },
      { aspect: 'stylistic', anyOf: ['bokeh', 'motion blur', 'silhouettes', 'long exposure'] },
    ],
  },
  {
    name: 'black_and_white_stylistic',
    conditions: [
      { aspect: 'palette', anyOf: ['black and white'] },
      { aspect: 'stylistic', anyOf: ['motion blur', 'silhouettes', 'long exposure'] },
    ],
  },
  {
    name: 'portrait_genre_closeup',
    conditions: [
      { aspect: 'genre', anyOf: ['portrait'] },
      { aspect: 'framing', anyOf: ['close-up'] },
    ],
  },
  {
    name: 'studio_subject_genre',
    conditions: [{ aspect: 'genre', anyOf: ['product', 'advertising'] }],
  },

  // ── Genre + artificial lighting ───────────────────────────────────────────
  // These genres can occasionally appear outdoors, so we only discard when
  // artificial lighting confirms a controlled indoor environment.
  {
    name: 'indoor_fashion',
    conditions: [
      { aspect: 'genre', anyOf: ['fashion'] },
      { aspect: 'lighting', anyOf: ['artificial'] },
    ],
  },
  {
    name: 'indoor_food',
    conditions: [
      { aspect: 'genre', anyOf: ['food'] },
      { aspect: 'lighting', anyOf: ['artificial'] },
    ],
  },
  {
    name: 'indoor_lifestyle',
    conditions: [
      { aspect: 'genre', anyOf: ['lifestyle'] },
      { aspect: 'lighting', anyOf: ['artificial'] },
    ],
  },
  {
    name: 'indoor_portrait',
    conditions: [
      { aspect: 'genre', anyOf: ['portrait'] },
      { aspect: 'lighting', anyOf: ['artificial'] },
    ],
  },

  // ── Framing + lighting combo ──────────────────────────────────────────────
  // Extreme close-ups under artificial light are overwhelmingly studio shots.
  {
    name: 'closeup_artificial',
    conditions: [
      { aspect: 'framing', anyOf: ['close-up'] },
      { aspect: 'lighting', anyOf: ['artificial'] },
    ],
  },

  // ── Isolated-subject combo ────────────────────────────────────────────────
  // Heavy bokeh + shallow DoF + a person-centric genre means the background
  // is fully obliterated — no location signal can be extracted.
  {
    name: 'bokeh_shallow_person',
    conditions: [
      { aspect: 'stylistic', anyOf: ['bokeh'] },
      { aspect: 'depth_of_field', anyOf: ['shallow'] },
      { aspect: 'genre', anyOf: ['portrait', 'fashion'] },
    ],
  },
]

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

  // ── Binary classification ─────────────────────────────────────────────────

  /**
   * Classify photos into two groups using discard rules.
   *
   * - plausible   → no rule matched; proceed with geolocation
   * - discarded   → at least one rule matched; skip geolocation
   *
   * Photos with no analysed visual_aspects are treated as plausible
   * (benefit of the doubt — absence of evidence is not evidence of absence).
   *
   * A custom `rules` array can be supplied to override the defaults.
   */
  public static classify(
    photos: Photo[],
    rules: DiscardRule[] = DISCARD_RULES
  ): GeolocatabilityClassification {
    const plausible: Photo[] = []
    const discarded: { photo: Photo; matchedRules: string[] }[] = []

    for (const photo of photos) {
      const va = (photo.descriptions as Record<string, any> | null | undefined)?.visual_aspects as
        | Record<string, string | string[]>
        | null
        | undefined

      const matchedRules = rules
        .filter((rule) => this.ruleMatches(rule, va))
        .map((rule) => rule.name)

      if (matchedRules.length > 0) {
        discarded.push({ photo, matchedRules })
      } else {
        plausible.push(photo)
      }
    }

    return { plausible, discarded }
  }

  public static assess(
    photos: Photo[],
    rules: DiscardRule[] = DISCARD_RULES
  ): GeolocatabilityAssessment {
    const classification = this.classify(photos, rules)
    const total = photos.length
    const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100))
    const plausibleCount = classification.plausible.length
    const discardedCount = classification.discarded.length

    return {
      total,
      plausible: { count: plausibleCount, percentage: pct(plausibleCount) },
      discarded: { count: discardedCount, percentage: pct(discardedCount) },
      lowSuccessWarning: total > 0 && plausibleCount / total < 0.5,
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Returns true when every condition in the rule is satisfied by the
   * photo's visual_aspects map.
   */
  private static ruleMatches(
    rule: DiscardRule,
    va: Record<string, string | string[]> | null | undefined
  ): boolean {
    if (!va) return false
    return rule.conditions.every((cond) => {
      const raw = va[cond.aspect]
      if (raw === undefined || raw === null) return false
      const arr = Array.isArray(raw) ? raw : [raw]
      const hasMatch = cond.anyOf.some((v) => arr.includes(v))
      if (!hasMatch) return false
      if (cond.exclusive) return arr.every((v) => cond.anyOf.includes(v))
      return true
    })
  }

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
