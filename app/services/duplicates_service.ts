import Photo from '#models/photo'
import VectorService from '#services/vector_service'
import CpuWorkerPool from '#services/cpu_worker_pool'
import { computeDHash, DHASH_DUPLICATE_THRESHOLD } from '../utils/dhash.js'
import { withCache } from '../decorators/withCache.js'
import { hashNumberIds } from '../utils/cache_key.js'
import axios from 'axios'
import pLimit from 'p-limit'

export type DuplicateScope = 'workspace' | 'lightbox'

export default class DuplicatesService {
  /**
   * Find exact/near-exact duplicates using perceptual hash (pHash/dHash).
   * Detects pixel-level duplicates and minor re-saves, but NOT aggressive crops/edits.
   * Returns a map of { photoId → [matchingPhotoIds] }.
   *
   * Implementation note:
   *   The heavy comparison runs in the CPU worker using a banded index over the
   *   64-bit hash. The hash is partitioned into threshold + 1 disjoint bands, so
   *   any pair within the Hamming threshold must share at least one full band and
   *   becomes a candidate. Only those candidates are verified with the exact
   *   Hamming distance, avoiding the previous all-vs-all scan in the common case.
   */
  @withCache({
    provider: 'redis',
    ttl: 60 * 60 * 12,
    key: (userId: string, newPhotoIds?: number[], scope: DuplicateScope = 'lightbox') =>
      `checkSimilarDuplicates:${userId}:${scope}:${hashNumberIds(newPhotoIds ?? [])}`,
  })
  public async checkSimilarDuplicates(
    userId: string,
    newPhotoIds?: number[],
    scope: DuplicateScope = 'lightbox'
  ): Promise<Record<number, number[]>> {
    let userPhotos: Photo[]

    if (scope === 'workspace') {
      userPhotos = await Photo.query()
        .where('user_id', userId)
        .whereHas('analyzerProcess', (query) => {
          query.where('is_preprocess', false).where('current_stage', 'finished')
        })
    } else {
      userPhotos = await Photo.query().where('user_id', userId)
    }

    const photosToCheck =
      !newPhotoIds || newPhotoIds.length === 0
        ? userPhotos
        : userPhotos.filter((p) => newPhotoIds.includes(p.id))

    const limit = pLimit(10)
    const photoHashes: { id: number; hash: string }[] = []

    await Promise.all(
      userPhotos.map((photo) =>
        limit(async () => {
          try {
            let hash = photo.dhash
            if (!hash) {
              const res = await axios.get(photo.thumbnailUrl, { responseType: 'arraybuffer' })
              const buffer = Buffer.from(res.data)
              hash = await computeDHash(buffer)
              photo.dhash = hash
              await photo.save()
            }
            photoHashes.push({ id: photo.id, hash })
          } catch {
            // skip photo if unreachable
          }
        })
      )
    )

    const photosToCheckIds = photosToCheck.map((p) => p.id)
    return CpuWorkerPool.run<Record<number, number[]>>('dhash_compare', {
      photoHashes,
      photosToCheckIds,
      threshold: DHASH_DUPLICATE_THRESHOLD,
    })
  }

  /**
   * Find duplicates of the same capture event using only the EXIF dateTaken field.
   *
   * Two photos are considered the same capture when their dateTaken values
   * truncated to the second are identical. This is robust against aggressive
   * post-processing, color grading, format conversions, and crops — none of
   * those operations change the in-camera timestamp written at capture time.
   *
   * Photos without dateTaken are skipped.
   *
   * Algorithm: O(n) — group all user photos by their normalised date key into a
   * Map, then for each candidate resolve its group in O(1).
   *
   * Returns a map of { photoId → [matchingPhotoIds] }.
   */
  @withCache({
    provider: 'redis',
    ttl: 60 * 60 * 12,
    key: (userId: string, newPhotoIds?: number[], scope: DuplicateScope = 'lightbox') =>
      `checkExactDuplicates:${userId}:${scope}:${hashNumberIds(newPhotoIds ?? [])}`,
  })
  public async checkExactDuplicates(
    userId: string,
    newPhotoIds?: number[],
    scope: DuplicateScope = 'lightbox'
  ): Promise<Record<number, number[]>> {
    const t0 = performance.now()
    let userPhotos: Photo[]

    // Select only the two columns we actually use — avoids pulling embedding,
    // colorHistogram, colorHistogramDominant, etc. (large serialised vectors)
    // which are the real reason a 5k-photo query takes 15 s.
    if (scope === 'workspace') {
      userPhotos = await Photo.query()
        .select('id', 'descriptions')
        .where('user_id', userId)
        .whereHas('analyzerProcess', (query) => {
          query.where('is_preprocess', false).where('current_stage', 'finished')
        })
    } else {
      userPhotos = await Photo.query().select('id', 'descriptions').where('user_id', userId)
    }
    const t1 = performance.now()
    console.log(
      `[DuplicatesService.findByDate] DB query: ${(t1 - t0).toFixed(0)} ms — ${userPhotos.length} photos loaded`
    )

    const photosToCheck =
      !newPhotoIds || newPhotoIds.length === 0
        ? userPhotos
        : userPhotos.filter((p) => newPhotoIds.includes(p.id))
    const t2 = performance.now()
    console.log(
      `[DuplicatesService.findByDate] Candidate filter: ${(t2 - t1).toFixed(0)} ms — ${photosToCheck.length} candidates`
    )

    // Build a date → photoId[] index in O(n)
    const byDate = new Map<string, number[]>()
    for (const photo of userPhotos) {
      const exif = (photo.descriptions?.EXIF ?? {}) as Record<string, any>
      const dateKey = normalizeDate(exif.dateTaken)
      if (!dateKey) continue
      const group = byDate.get(dateKey)
      if (group) {
        group.push(photo.id)
      } else {
        byDate.set(dateKey, [photo.id])
      }
    }
    const t3 = performance.now()
    const photosWithDate = [...byDate.values()].reduce((s, g) => s + g.length, 0)
    console.log(
      `[DuplicatesService.findByDate] Index build: ${(t3 - t2).toFixed(0)} ms — ${byDate.size} unique dates, ${photosWithDate} photos have dateTaken`
    )

    // For each candidate, look up its group — O(1) per photo
    const results: Record<number, number[]> = {}
    for (const candidate of photosToCheck) {
      const exif = (candidate.descriptions?.EXIF ?? {}) as Record<string, any>
      const dateKey = normalizeDate(exif.dateTaken)
      if (!dateKey) continue

      const group = byDate.get(dateKey) ?? []
      const matches = group.filter((id) => id !== candidate.id)
      if (matches.length > 0) {
        results[candidate.id] = matches
      }
    }
    const t4 = performance.now()
    console.log(
      `[DuplicatesService.findByDate] Lookup: ${(t4 - t3).toFixed(0)} ms — ${Object.keys(results).length} photos with matches`
    )
    console.log(`[DuplicatesService.findByDate] TOTAL: ${(t4 - t0).toFixed(0)} ms`)

    return results
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a date value to an ISO string truncated to the second,
 * so minor sub-second differences (e.g. from different parsers) are ignored.
 */
function normalizeDate(raw: string | number | null | undefined): string | null {
  if (!raw) return null

  let ts: number
  if (typeof raw === 'number') {
    ts = raw
  } else {
    // Native EXIF format: "YYYY:MM:DD HH:MM:SS" (no timezone, assumed camera-local).
    // Date.parse cannot handle this; rewrite to ISO 8601 before parsing.
    const exif = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (exif) {
      ts = Date.parse(`${exif[1]}-${exif[2]}-${exif[3]}T${exif[4]}:${exif[5]}:${exif[6]}Z`)
    } else {
      ts = Date.parse(raw)
    }
  }

  if (isNaN(ts)) return null
  // Truncate to the second — exact integer arithmetic, no floating-point error.
  return new Date(Math.floor(ts / 1000) * 1000).toISOString()
}
