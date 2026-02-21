import Photo from '#models/photo'

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export const VISUAL_ASPECTS_CONFIG = [
  {
    key: 'genre',
    label: 'Genre',
    values: ['abstract', 'documentary', 'street', 'landscape', 'portrait'],
  },
  {
    key: 'framing',
    label: 'Framing',
    values: ['close-up', 'medium shot', 'wide shot'],
  },
  {
    key: 'focus',
    label: 'Focus',
    values: ['blurry', 'nitid'],
  },
  {
    key: 'lighting',
    label: 'Lighting',
    values: ['natural', 'artificial', 'backlit', 'frontlit', 'side lit'],
  },
  {
    key: 'lighting_scheme',
    label: 'Lighting Scheme',
    values: ['low key', 'high key', 'balanced'],
  },
  {
    key: 'depth_of_field',
    label: 'Depth of Field',
    values: ['shallow', 'deep', 'medium'],
  },
  {
    key: 'perspective',
    label: 'Perspective',
    values: ['normal', 'high angle', 'low angle'],
  },
  {
    key: 'stylistic',
    label: 'Stylistic',
    values: ['long exposure', 'motion blur', 'silhouettes', 'bokeh', 'grain'],
  },
  {
    key: 'orientation',
    label: 'Orientation',
    values: ['portrait', 'landscape', 'square'],
  },
  {
    key: 'temperature',
    label: 'Temperature',
    values: ['warm', 'cold', 'neutral'],
  },
  {
    key: 'palette',
    label: 'Palette',
    values: ['color', 'black and white'],
  },
]

export const ARTISTIC_SCORES_CONFIG = {
  fundamentals: {
    label: 'Fundamentals',
    description: 'Core evaluation criteria',
    criteria: ['aesthetic_quality', 'composition', 'storytelling', 'candidness'],
  },
  bonus: {
    label: 'Bonus',
    description: 'Additional evaluation aspects',
    criteria: ['strangeness', 'message', 'humor', 'visual_games'],
  },
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface VisualAspectBreakdownItem {
  value: string
  count: number
}

export interface VisualAspectStat {
  key: string
  label: string
  /** Number of photos that have at least one value for this aspect */
  totalPhotos: number
  /** Number of distinct values with at least one photo (used for sorting) */
  activeBarsCount: number
  breakdown: VisualAspectBreakdownItem[]
}

export interface ScoreConsistency {
  label: string
  description: string
  stdDev: number
}

export interface ArtisticScoreStat {
  criterion: string
  /** Average score rounded to 1 decimal */
  mean: number
  /** Population std deviation rounded to 2 decimals */
  stdDev: number
  /** Photos that have this score */
  count: number
  /** Total photos for this user */
  total: number
  /** Human-readable rating (e.g. "Excellent", "Good") */
  rating: string
  consistency: ScoreConsistency
}

export interface ArtisticScoresStats {
  totalPhotos: number
  fundamentals: ArtisticScoreStat[]
  bonus: ArtisticScoreStat[]
}

export interface ScoreEvolutionBin {
  /** ISO string of the bin centre */
  date: string
  average: number
  count: number
  min: number
  max: number
}

export interface ScoreEvolutionSeries {
  criterion: string
  /** Total photos that have both a date and a score for this criterion */
  totalPhotos: number
  bins: ScoreEvolutionBin[]
}

// ─────────────────────────────────────────────────────────────
// StatsService
// ─────────────────────────────────────────────────────────────

export default class StatsService {
  // ── Helpers ──────────────────────────────────────────────

  private getScoreRating(mean: number): string {
    if (mean >= 8) return 'Excellent'
    if (mean >= 6.5) return 'Good'
    if (mean >= 5) return 'Average'
    if (mean >= 3.5) return 'Below Average'
    return 'Poor'
  }

  private getConsistency(stdDev: number): { label: string; description: string } {
    if (stdDev <= 0.5)
      return {
        label: 'Very Consistent',
        description: 'Very little variation across photos',
      }
    if (stdDev <= 1.0)
      return {
        label: 'Mostly Consistent',
        description: 'Minor variation across photos',
      }
    if (stdDev <= 1.5)
      return {
        label: 'Variable',
        description: 'Noticeable variation across photos',
      }
    return {
      label: 'Highly Variable',
      description: 'Large variation across photos',
    }
  }

  // ── Visual Aspects ────────────────────────────────────────

  async getVisualAspectsStats(userId: number): Promise<VisualAspectStat[]> {
    const photos = await Photo.query().where('user_id', userId).select('id', 'descriptions')

    const stats: VisualAspectStat[] = VISUAL_ASPECTS_CONFIG.map((aspect) => {
      const valueCounts: Record<string, number> = {}
      for (const v of aspect.values) valueCounts[v] = 0

      let totalPhotosWithAspect = 0

      for (const photo of photos) {
        const aspects = (photo.descriptions?.visual_aspects ?? {}) as Record<string, any>
        const raw = aspects[aspect.key]
        if (!raw) continue

        const arr: string[] = Array.isArray(raw) ? raw : [raw]
        if (arr.length === 0) continue

        totalPhotosWithAspect++
        for (const v of arr) {
          if (Object.prototype.hasOwnProperty.call(valueCounts, v)) {
            valueCounts[v]++
          }
        }
      }

      const breakdown: VisualAspectBreakdownItem[] = aspect.values
        .map((v) => ({ value: v, count: valueCounts[v] }))
        .sort((a, b) => b.count - a.count)

      const activeBarsCount = breakdown.filter((b) => b.count > 0).length

      return {
        key: aspect.key,
        label: aspect.label,
        totalPhotos: totalPhotosWithAspect,
        activeBarsCount,
        breakdown,
      }
    })

    // Aspects with more variety (active bars) first — matches front-end sort
    return stats.sort((a, b) => b.activeBarsCount - a.activeBarsCount)
  }

  // ── Artistic Scores ───────────────────────────────────────

  async getArtisticScoresStats(userId: number): Promise<ArtisticScoresStats> {
    const photos = await Photo.query().where('user_id', userId).select('id', 'descriptions')

    const totalPhotos = photos.length

    const computeStat = (criterion: string): ArtisticScoreStat => {
      const scores = photos
        .map((p) => {
          const s = p.descriptions?.artistic_scores as Record<string, number> | undefined
          return s?.[criterion]
        })
        .filter((v): v is number => v !== undefined && v !== null)

      const count = scores.length
      const sum = scores.reduce((a, b) => a + b, 0)
      const mean = count > 0 ? Math.round((sum / count) * 10) / 10 : 0

      const variance =
        count > 0 ? scores.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count : 0
      const stdDev = Math.round(Math.sqrt(variance) * 100) / 100

      const consistency = this.getConsistency(stdDev)
      const rating = this.getScoreRating(mean)

      return {
        criterion,
        mean,
        stdDev,
        count,
        total: totalPhotos,
        rating,
        consistency: { ...consistency, stdDev },
      }
    }

    return {
      totalPhotos,
      fundamentals: ARTISTIC_SCORES_CONFIG.fundamentals.criteria.map(computeStat),
      bonus: ARTISTIC_SCORES_CONFIG.bonus.criteria.map(computeStat),
    }
  }

  // ── Artistic Scores Evolution ─────────────────────────────

  async getArtisticScoresEvolution(
    userId: number,
    criteria: string[]
  ): Promise<ScoreEvolutionSeries[]> {
    const photos = await Photo.query().where('user_id', userId).select('id', 'descriptions')

    const computeSeries = (criterion: string): ScoreEvolutionSeries => {
      // 1. Extract timestamp + score, filter invalids, sort ascending
      const points = photos
        .map((p) => {
          const exif = p.descriptions?.EXIF as Record<string, any> | undefined
          const rawDate = exif?.dateTaken
          const ts = rawDate ? new Date(rawDate).getTime() : NaN
          const scores = p.descriptions?.artistic_scores as Record<string, number> | undefined
          const score = scores?.[criterion]
          return { ts, score }
        })
        .filter(
          (item): item is { ts: number; score: number } =>
            !isNaN(item.ts) && item.score !== undefined && item.score !== null
        )
        .sort((a, b) => a.ts - b.ts)

      if (points.length === 0) {
        return { criterion, totalPhotos: 0, bins: [] }
      }

      // 2. Temporal range
      const minDate = points[0].ts
      const maxDate = points[points.length - 1].ts
      const range = maxDate - minDate

      // 3. Adaptive bin size
      const DAY = 24 * 60 * 60 * 1000
      let binSize: number
      if (range < 7 * DAY) {
        binSize = DAY // < 1 week → daily bins
      } else if (range < 60 * DAY) {
        binSize = 7 * DAY // 1-8 weeks → weekly bins
      } else if (range < 365 * DAY) {
        binSize = 30 * DAY // 2-12 months → monthly bins
      } else {
        binSize = 90 * DAY // > 1 year → quarterly bins
      }

      // 4. Cap to 30 data points
      let numBins = Math.ceil(range / binSize) || 1
      numBins = Math.min(numBins, 30)
      binSize = range / numBins

      // 5. Create empty bins
      const bins = Array.from({ length: numBins }, (_, i) => ({
        start: minDate + i * binSize,
        end: minDate + (i + 1) * binSize,
        centre: minDate + i * binSize + binSize / 2,
        scores: [] as number[],
      }))

      // 6. Distribute photos into bins
      for (const { ts, score } of points) {
        const idx = Math.min(Math.floor((ts - minDate) / binSize), numBins - 1)
        if (idx >= 0) bins[idx].scores.push(score)
      }

      // 7. Compute stats per bin, drop empty bins
      const resultBins: ScoreEvolutionBin[] = bins
        .filter((b) => b.scores.length > 0)
        .map((b) => ({
          date: new Date(b.centre).toISOString(),
          average: parseFloat(
            (b.scores.reduce((sum, s) => sum + s, 0) / b.scores.length).toFixed(2)
          ),
          count: b.scores.length,
          min: Math.min(...b.scores),
          max: Math.max(...b.scores),
        }))

      return { criterion, totalPhotos: points.length, bins: resultBins }
    }

    return criteria.map(computeSeries)
  }
}
