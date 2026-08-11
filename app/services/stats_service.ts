import Photo from '#models/photo'
import { VISUAL_ASPECTS_SCHEMA, getArtisticSchema, type PromptVariant } from '#config/photo_schema'
import { toScoreNumber } from '../utils/artistic_scores.js'
import {
  APERTURE_ALIASES,
  buildCameraLabel,
  FOCAL_LENGTH_ALIASES,
  ISO_ALIASES,
  readExifNumber,
} from '../utils/exif_fields.js'

// Re-export for any consumers that import these directly from stats_service
export { VISUAL_ASPECTS_SCHEMA as VISUAL_ASPECTS_CONFIG }

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

export interface CaptureSettingBucket {
  /** Camera name, or the range label for numeric settings ("401-800", "f/5.6-8") */
  label: string
  count: number
  /** Share among the photos that carry this field, 0-100 with 1 decimal */
  percentage: number
}

export interface CaptureSettingStat {
  /** Photos with a usable value for this field */
  photosWithData: number
  /** Share of the whole catalog carrying this field, 0-100 with 1 decimal */
  coverage: number
  /** Empty ranges are dropped; cameras are capped at the top values + "other" */
  breakdown: CaptureSettingBucket[]
  /** Numeric fields only */
  min?: number
  max?: number
  median?: number
}

export interface CaptureSettingsStats {
  totalPhotos: number
  camera: CaptureSettingStat
  iso: CaptureSettingStat
  aperture: CaptureSettingStat
  focalLength: CaptureSettingStat
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

export interface ScoreTimelineBin {
  /** ISO date (YYYY-MM-DD) of the period start */
  start: string
  /** ISO date (YYYY-MM-DD) of the period end */
  end: string
  /** Photos falling in this period */
  count: number
  /** Mean score per criterion (1 decimal); null when no photo in the period has it */
  averages: Record<string, number | null>
}

export interface ScoreTimelineTrend {
  criterion: string
  /** Count-weighted mean over the first third of the periods */
  first: number | null
  /** Count-weighted mean over the last third of the periods */
  last: number | null
  delta: number | null
  direction: 'improving' | 'declining' | 'stable' | 'insufficient_data'
}

export interface ScoreTimeline {
  criteria: string[]
  granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  /** Approximate days covered by each period */
  periodDays: number
  /** Scored photos that carry a capture date (the ones plotted) */
  totalPhotosWithDate: number
  /** Scored photos with no usable capture date (excluded from the timeline) */
  photosWithoutDate: number
  /** Earliest / latest capture date present, before outlier clamping */
  earliest: string
  latest: string
  /** Photos older/newer than the plotted range, merged into the first/last period */
  foldedBefore: number
  foldedAfter: number
  bins: ScoreTimelineBin[]
  trends: ScoreTimelineTrend[]
}

// ─────────────────────────────────────────────────────────────
// EXIF de la toma (cámara / ISO / apertura / focal)
//
// La lectura de cada campo vive en utils/exif_fields (el EXIF tiene dos formas
// según la ruta de subida). Aquí solo está la agregación. Ninguno de los campos
// está garantizado: cada stat reporta su propia cobertura en vez de asumir el
// catálogo entero.
// ─────────────────────────────────────────────────────────────

/** Rangos con el límite superior INCLUIDO; el último es el desbordamiento. */
interface NumericRange {
  label: string
  max: number
}

const ISO_RANGES: NumericRange[] = [
  { label: '<=100', max: 100 },
  { label: '101-200', max: 200 },
  { label: '201-400', max: 400 },
  { label: '401-800', max: 800 },
  { label: '801-1600', max: 1600 },
  { label: '1601-3200', max: 3200 },
  { label: '3201-6400', max: 6400 },
  { label: '>6400', max: Number.POSITIVE_INFINITY },
]

const APERTURE_RANGES: NumericRange[] = [
  { label: 'f/<2', max: 2 },
  { label: 'f/2-2.8', max: 2.8 },
  { label: 'f/2.8-4', max: 4 },
  { label: 'f/4-5.6', max: 5.6 },
  { label: 'f/5.6-8', max: 8 },
  { label: 'f/8-11', max: 11 },
  { label: 'f/11-16', max: 16 },
  { label: 'f/>16', max: Number.POSITIVE_INFINITY },
]

const FOCAL_LENGTH_RANGES: NumericRange[] = [
  { label: '<16mm (ultra-wide)', max: 15.999 },
  { label: '16-24mm (wide)', max: 24 },
  { label: '24-35mm (wide)', max: 35 },
  { label: '35-50mm (normal)', max: 50 },
  { label: '50-85mm (short tele)', max: 85 },
  { label: '85-135mm (tele)', max: 135 },
  { label: '135-300mm (tele)', max: 300 },
  { label: '>300mm (super tele)', max: Number.POSITIVE_INFINITY },
]

/** Cuántas cámaras distintas se listan antes de agrupar el resto en "other". */
const MAX_CAMERA_BUCKETS = 12

const asPercentage = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0

function computeMedian(sortedValues: number[]): number {
  const middle = Math.floor(sortedValues.length / 2)
  const value =
    sortedValues.length % 2 === 0
      ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
      : sortedValues[middle]
  return Math.round(value * 100) / 100
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

  /**
   * Adaptive temporal binning: picks a natural bin size for the range
   * (daily → quarterly) and then caps the number of bins to `maxBins`,
   * widening them evenly so the whole range is still covered.
   */
  private planBins(range: number, maxBins: number): { binSize: number; numBins: number } {
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

    let numBins = Math.ceil(range / binSize) || 1
    numBins = Math.min(numBins, maxBins)
    return { binSize: range / numBins, numBins }
  }

  /** Every stat below is derived from the same two columns of the user's photos. */
  private loadPhotos(userId: number): Promise<Photo[]> {
    return Photo.query().where('user_id', userId).select('id', 'descriptions')
  }

  // ── Visual Aspects ────────────────────────────────────────

  async getVisualAspectsStats(userId: number): Promise<VisualAspectStat[]> {
    return this.computeVisualAspectsStats(await this.loadPhotos(userId))
  }

  private computeVisualAspectsStats(photos: Photo[]): VisualAspectStat[] {
    const stats: VisualAspectStat[] = VISUAL_ASPECTS_SCHEMA.map((aspect) => {
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

  // ── Capture settings (EXIF) ───────────────────────────────

  async getCaptureSettingsStats(userId: number): Promise<CaptureSettingsStats> {
    return this.computeCaptureSettingsStats(await this.loadPhotos(userId))
  }

  /** Reparte los valores numéricos en rangos fijos y añade min/max/mediana. */
  private buildNumericStat(
    values: number[],
    totalPhotos: number,
    ranges: NumericRange[]
  ): CaptureSettingStat {
    const photosWithData = values.length
    const counts = new Array<number>(ranges.length).fill(0)

    for (const value of values) {
      const index = ranges.findIndex((range) => value <= range.max)
      counts[index === -1 ? ranges.length - 1 : index]++
    }

    const stat: CaptureSettingStat = {
      photosWithData,
      coverage: asPercentage(photosWithData, totalPhotos),
      breakdown: ranges
        .map((range, index) => ({
          label: range.label,
          count: counts[index],
          percentage: asPercentage(counts[index], photosWithData),
        }))
        .filter((bucket) => bucket.count > 0),
    }

    if (photosWithData > 0) {
      const sorted = [...values].sort((a, b) => a - b)
      stat.min = Math.round(sorted[0] * 100) / 100
      stat.max = Math.round(sorted[sorted.length - 1] * 100) / 100
      stat.median = computeMedian(sorted)
    }

    return stat
  }

  private computeCaptureSettingsStats(photos: Photo[]): CaptureSettingsStats {
    const totalPhotos = photos.length

    // Un catálogo grande puede arrastrar decenas de cuerpos por fotos ajenas o
    // escaneadas; se agrupan por nombre normalizado pero se muestra el original.
    const cameraCounts = new Map<string, { label: string; count: number }>()
    const isoValues: number[] = []
    const apertureValues: number[] = []
    const focalLengthValues: number[] = []

    for (const photo of photos) {
      const exif = photo.descriptions?.EXIF as Record<string, any> | undefined
      if (!exif || typeof exif !== 'object') continue

      const camera = buildCameraLabel(exif)
      if (camera) {
        const key = camera.toLowerCase()
        const entry = cameraCounts.get(key)
        if (entry) entry.count++
        else cameraCounts.set(key, { label: camera, count: 1 })
      }

      const iso = readExifNumber(exif, ISO_ALIASES)
      if (iso !== null) isoValues.push(iso)

      const aperture = readExifNumber(exif, APERTURE_ALIASES)
      if (aperture !== null) apertureValues.push(aperture)

      const focalLength = readExifNumber(exif, FOCAL_LENGTH_ALIASES)
      if (focalLength !== null) focalLengthValues.push(focalLength)
    }

    const photosWithCamera = [...cameraCounts.values()].reduce((sum, e) => sum + e.count, 0)
    const rankedCameras = [...cameraCounts.values()].sort((a, b) => b.count - a.count)
    const listedCameras = rankedCameras.slice(0, MAX_CAMERA_BUCKETS)
    const cameraBreakdown: CaptureSettingBucket[] = listedCameras.map((entry) => ({
      label: entry.label,
      count: entry.count,
      percentage: asPercentage(entry.count, photosWithCamera),
    }))

    const otherCount = rankedCameras
      .slice(MAX_CAMERA_BUCKETS)
      .reduce((sum, entry) => sum + entry.count, 0)
    if (otherCount > 0) {
      cameraBreakdown.push({
        label: `other (${rankedCameras.length - MAX_CAMERA_BUCKETS} more cameras)`,
        count: otherCount,
        percentage: asPercentage(otherCount, photosWithCamera),
      })
    }

    return {
      totalPhotos,
      camera: {
        photosWithData: photosWithCamera,
        coverage: asPercentage(photosWithCamera, totalPhotos),
        breakdown: cameraBreakdown,
      },
      iso: this.buildNumericStat(isoValues, totalPhotos, ISO_RANGES),
      aperture: this.buildNumericStat(apertureValues, totalPhotos, APERTURE_RANGES),
      focalLength: this.buildNumericStat(focalLengthValues, totalPhotos, FOCAL_LENGTH_RANGES),
    }
  }

  // ── Artistic Scores ───────────────────────────────────────

  async getArtisticScoresStats(
    userId: number,
    variant: PromptVariant
  ): Promise<ArtisticScoresStats> {
    return this.computeArtisticScoresStats(await this.loadPhotos(userId), variant)
  }

  private computeArtisticScoresStats(photos: Photo[], variant: PromptVariant): ArtisticScoresStats {
    const totalPhotos = photos.length

    const computeStat = (criterion: string): ArtisticScoreStat => {
      const scores = photos
        .map((p) => {
          const s = p.descriptions?.artistic_scores as Record<string, unknown> | undefined
          return toScoreNumber(s?.[criterion])
        })
        .filter((v): v is number => v !== null && v > 0)

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

    const schema = getArtisticSchema(variant)
    return {
      totalPhotos,
      fundamentals: schema
        .find((g) => g.key === 'fundamentals')!
        .criteria.map((c) => computeStat(c.key)),
      bonus: schema.find((g) => g.key === 'bonus')!.criteria.map((c) => computeStat(c.key)),
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
          const scores = p.descriptions?.artistic_scores as Record<string, unknown> | undefined
          const score = toScoreNumber(scores?.[criterion])
          return { ts, score }
        })
        .filter(
          (item): item is { ts: number; score: number } => !isNaN(item.ts) && item.score !== null
        )
        .sort((a, b) => a.ts - b.ts)

      if (points.length === 0) {
        return { criterion, totalPhotos: 0, bins: [] }
      }

      // 2. Temporal range
      const minDate = points[0].ts
      const maxDate = points[points.length - 1].ts
      const range = maxDate - minDate

      // 3-4. Adaptive bin size, capped to 30 data points
      const { binSize, numBins } = this.planBins(range, 30)

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

  /**
   * Same temporal binning as `getArtisticScoresEvolution`, but every criterion
   * shares ONE set of periods so the result can be rendered as a single table
   * (one row per period, one column per criterion) — the text equivalent of the
   * front-end "Score Evolution Over Time" chart.
   */
  async getArtisticScoresTimeline(
    userId: number,
    variant: PromptVariant,
    maxBins = 18
  ): Promise<ScoreTimeline> {
    return this.computeArtisticScoresTimeline(await this.loadPhotos(userId), variant, maxBins)
  }

  private computeArtisticScoresTimeline(
    photos: Photo[],
    variant: PromptVariant,
    maxBins: number
  ): ScoreTimeline {
    const criteria = getArtisticSchema(variant).flatMap((g) => g.criteria.map((c) => c.key))

    // 1. Keep scored photos only; split by whether they carry a capture date
    const points: Array<{ ts: number; scores: Record<string, number> }> = []
    let photosWithoutDate = 0

    for (const photo of photos) {
      const raw = photo.descriptions?.artistic_scores as Record<string, unknown> | undefined
      const scores: Record<string, number> = {}
      for (const criterion of criteria) {
        const value = toScoreNumber(raw?.[criterion])
        if (value !== null && value > 0) scores[criterion] = value
      }
      if (Object.keys(scores).length === 0) continue

      const exif = photo.descriptions?.EXIF as Record<string, any> | undefined
      const ts = exif?.dateTaken ? new Date(exif.dateTaken).getTime() : Number.NaN
      if (Number.isNaN(ts)) {
        photosWithoutDate++
        continue
      }
      points.push({ ts, scores })
    }

    const toIsoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

    if (points.length === 0) {
      return {
        criteria,
        granularity: 'monthly',
        periodDays: 0,
        totalPhotosWithDate: 0,
        photosWithoutDate,
        earliest: '',
        latest: '',
        foldedBefore: 0,
        foldedAfter: 0,
        bins: [],
        trends: [],
      }
    }

    points.sort((a, b) => a.ts - b.ts)

    // 2. Plotted range, clamped to the 1st-99th percentile so a couple of
    //    stray EXIF dates (a 1904 scan, a camera with a wrong clock) can't
    //    stretch the axis and collapse the real history into one period.
    //    Out-of-range photos are still counted — folded into the edge periods.
    const lastIndex = points.length - 1
    let rangeStart = points[Math.floor(lastIndex * 0.01)].ts
    let rangeEnd = points[Math.ceil(lastIndex * 0.99)].ts
    if (rangeEnd <= rangeStart) {
      rangeStart = points[0].ts
      rangeEnd = points[lastIndex].ts
    }
    const foldedBefore = points.filter((p) => p.ts < rangeStart).length
    const foldedAfter = points.filter((p) => p.ts > rangeEnd).length

    const { binSize, numBins } = this.planBins(rangeEnd - rangeStart, maxBins)

    const buckets = Array.from({ length: numBins }, (_, i) => ({
      start: rangeStart + i * binSize,
      end: rangeStart + (i + 1) * binSize,
      count: 0,
      sums: {} as Record<string, { sum: number; n: number }>,
    }))

    for (const { ts, scores } of points) {
      const idx =
        binSize > 0
          ? Math.min(Math.max(Math.floor((ts - rangeStart) / binSize), 0), numBins - 1)
          : 0
      const bucket = buckets[idx]
      bucket.count++
      for (const [criterion, value] of Object.entries(scores)) {
        const agg = (bucket.sums[criterion] ??= { sum: 0, n: 0 })
        agg.sum += value
        agg.n++
      }
    }

    // 3. Materialise non-empty periods
    const bins: ScoreTimelineBin[] = buckets
      .filter((b) => b.count > 0)
      .map((b) => {
        const averages: Record<string, number | null> = {}
        for (const criterion of criteria) {
          const agg = b.sums[criterion]
          averages[criterion] = agg ? Math.round((agg.sum / agg.n) * 10) / 10 : null
        }
        return {
          start: toIsoDay(b.start),
          end: toIsoDay(b.end),
          count: b.count,
          averages,
        }
      })

    // 4. Trend per criterion: first third of periods vs last third
    const sliceSize = Math.max(1, Math.floor(bins.length / 3))
    const head = bins.slice(0, sliceSize)
    const tail = bins.slice(-sliceSize)

    const weightedMean = (slice: ScoreTimelineBin[], criterion: string): number | null => {
      let sum = 0
      let weight = 0
      for (const bin of slice) {
        const value = bin.averages[criterion]
        if (value === null) continue
        sum += value * bin.count
        weight += bin.count
      }
      return weight > 0 ? Math.round((sum / weight) * 10) / 10 : null
    }

    const trends: ScoreTimelineTrend[] = criteria.map((criterion): ScoreTimelineTrend => {
      const first = weightedMean(head, criterion)
      const last = weightedMean(tail, criterion)
      if (bins.length < 2 || first === null || last === null) {
        return { criterion, first, last, delta: null, direction: 'insufficient_data' }
      }
      const delta = Math.round((last - first) * 10) / 10
      const direction: ScoreTimelineTrend['direction'] =
        Math.abs(delta) < 0.2 ? 'stable' : delta > 0 ? 'improving' : 'declining'
      return { criterion, first, last, delta, direction }
    })

    const DAY = 24 * 60 * 60 * 1000
    const periodDays = Math.max(1, Math.round(binSize / DAY))
    const granularity: ScoreTimeline['granularity'] =
      periodDays <= 2
        ? 'daily'
        : periodDays <= 10
          ? 'weekly'
          : periodDays <= 45
            ? 'monthly'
            : periodDays <= 150
              ? 'quarterly'
              : 'yearly'

    return {
      criteria,
      granularity,
      periodDays,
      totalPhotosWithDate: points.length,
      photosWithoutDate,
      earliest: toIsoDay(points[0].ts),
      latest: toIsoDay(points[lastIndex].ts),
      foldedBefore,
      foldedAfter,
      bins,
      trends,
    }
  }

  /**
   * Score stats + score timeline + visual-aspect distribution in ONE pass over
   * the catalog. Calling the three getters separately would re-read every
   * photo's `descriptions` blob three times — for large catalogs that is the
   * dominant cost of the whole report.
   */
  async getCatalogStats(
    userId: number,
    variant: PromptVariant,
    maxBins = 18
  ): Promise<{
    artisticScores: ArtisticScoresStats
    scoreTimeline: ScoreTimeline
    visualAspects: VisualAspectStat[]
    captureSettings: CaptureSettingsStats
  }> {
    const photos = await this.loadPhotos(userId)
    return {
      artisticScores: this.computeArtisticScoresStats(photos, variant),
      scoreTimeline: this.computeArtisticScoresTimeline(photos, variant, maxBins),
      visualAspects: this.computeVisualAspectsStats(photos),
      captureSettings: this.computeCaptureSettingsStats(photos),
    }
  }
}
