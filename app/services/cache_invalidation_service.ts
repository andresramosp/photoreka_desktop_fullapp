import { invalidateCache, invalidateCacheByPattern } from '../decorators/withCache.js'
import db from '@adonisjs/lucid/services/db'
import ThreeDManager from '../managers/3d_manager.js'
import TagCloudManager from '../managers/tagcloud_manager.js'

/**
 * Centralized cache invalidation policies.
 * All cache invalidation in the app should go through this service — never call
 * invalidateCache/invalidateCacheByPattern directly from controllers or managers.
 *
 * Three event tiers:
 *  - onPhotoListChanged  → photo list stale (upload, note edit, swap — pre-analysis)
 *  - onPhotosDeleted     → photo list + search index + tags + 3D/tagcloud/portfolio stale
 *  - onAnalysisCompleted → everything including UMAP/3D/portfolio (expensive reductions)
 *
 * Expensive caches (getPhotosFor3DView, get3DPhotos, getTagCloud, reportEmbeddings) use a
 * per-user DB watermark. They are only invalidated once the accumulated delta of analyzed photos
 * (uploads/analysis positive, deletions negative) reaches EXPENSIVE_CACHE_DELTA_THRESHOLD in
 * either net or churn terms. The 2-week TTL on the decorator acts as an absolute safety net.
 *
 * Watermark columns (cache_invalidation_watermarks):
 *  - net_delta   : signed sum — +N on analysis, -N on deletion
 *  - churn_delta : unsigned sum — always +=|N|, catches 60+60=120 real changes netting to 0
 *  - has_payload : whether the user currently has any expensive-cache-backed data at all
 */

/** Number of analyzed-photo changes that must accumulate before flushing expensive caches */
const EXPENSIVE_CACHE_DELTA_THRESHOLD = 10

/**
 * The four caches that are expensive to recompute (UMAP/3D/portfolio projections).
 * Everything else (photo lists, search, scoring, duplicates) is invalidated immediately.
 */
const EXPENSIVE_CACHE_PATTERNS: ReadonlyArray<(userId: string) => string> = [
  (userId) => `getPhotosFor3DView_${userId}_*`,
  (userId) => `get3DPhotos:${userId}:*`,
  (userId) => `getTagCloud:${userId}:*`,
  (userId) => `reportEmbeddings:*:${userId}`,
]

/**
 * Canonical dashboard preview variants to keep warm after expensive invalidation.
 * Tune these values to match front-end preview requests.
 */
const WARMUP_2D_VARIANTS: ReadonlyArray<{ chunkName: string; limit: number; outputDims: number }> =
  [
    { chunkName: 'general', limit: 500, outputDims: 2 }, // dashboard 2D view
    { chunkName: 'general', limit: 10000, outputDims: 2 }, // full 2D view
    { chunkName: 'general', limit: 10000, outputDims: 3 }, // full 3D view
  ]

const WARMUP_TAGCLOUD_VARIANTS: ReadonlyArray<{
  outputDims: number
  minPhotoCount: number
  limit: number
}> = [
  { outputDims: 2, minPhotoCount: 1, limit: 5000 }, // dashboard tagcloud
  { outputDims: 2, minPhotoCount: 1, limit: 10000 }, // full tagcloud
]

type InvalidationOptions = {
  skipExpensiveWarmup?: boolean
}

export class CacheInvalidationService {
  /**
   * Called when photos are uploaded or their metadata changes in place
   * (no structural change to tags or search embeddings yet).
   * Does NOT invalidate search index — unanalyzed photos aren't searchable.
   * Used by: catalog_controller (upload, note, swap), analyzer_service.initProcess,
   *          photo_manager.deletePhotos (when all deleted photos were still 'uploaded')
   */
  static async onPhotoListChanged(userId: string): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)
    console.log(
      `[CacheInvalidation] onPhotoListChanged: Invalidated photo list caches for user ${userId}`
    )
  }

  static async onPhotosGeolocationUpdate(userId: string): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    console.log(
      `[CacheInvalidation] onPhotosGeolocationUpdate: Invalidated photo list caches for user ${userId}`
    )
  }

  /**
   * Called when analyzed photos are soft-deleted.
   * Immediately invalidates correctness-critical caches (search, scoring, tags, duplicates).
   * Expensive visual caches (3D, tagcloud, portfolio) are deferred via the watermark.
   * Used by: photo_manager.deletePhotos
   * @param photoCount Number of already-analyzed photos deleted (unanalyzed photos don't feed expensive caches).
   */
  static async onPhotosDeleted(
    userId: string,
    photoCount: number = 1,
    options: InvalidationOptions = {}
  ): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCacheByPattern(`searchByTagsDirect:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
    await invalidateCacheByPattern(`getScoredPhotosByTagsAndDesc:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTags:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotoImageByFullQuery:${userId}:*`)
    await invalidateCacheByPattern(`searchByPhotos:${userId}:*`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)

    const invalidated = await this.maybeInvalidateExpensiveCaches(
      userId,
      -photoCount,
      false,
      options.skipExpensiveWarmup ?? false
    )
    console.log(
      `[CacheInvalidation] onPhotosDeleted: user=${userId} photoCount=${photoCount} expensiveInvalidated=${invalidated}`
    )
  }

  /**
   * Called when soft-deleted photos are restored.
   * Invalidates the same caches as deletion, but increments the watermark.
   */
  static async onPhotosRestored(
    userId: string,
    photoCount: number = 1,
    options: InvalidationOptions = {}
  ): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCacheByPattern(`searchByTagsDirect:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
    await invalidateCacheByPattern(`getScoredPhotosByTagsAndDesc:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTags:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotoImageByFullQuery:${userId}:*`)
    await invalidateCacheByPattern(`searchByPhotos:${userId}:*`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)

    const invalidated = await this.maybeInvalidateExpensiveCaches(
      userId,
      +photoCount,
      false,
      options.skipExpensiveWarmup ?? false
    )
    console.log(
      `[CacheInvalidation] onPhotosRestored: user=${userId} photoCount=${photoCount} expensiveInvalidated=${invalidated}`
    )
  }

  /**
   * Called when an analysis pipeline (or global reprocess) finishes.
   * Immediately invalidates correctness-critical caches.
   * Expensive visual caches (3D, tagcloud, portfolio) are deferred via the watermark.
   * Used by: analyzer_service.runAll
   * @param photoCount Number of photos analysed in this run.
   */
  static async onAnalysisCompleted(
    userId: string,
    photoCount: number = 1,
    options: InvalidationOptions = {}
  ): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCacheByPattern(`searchByTagsDirect:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
    await invalidateCacheByPattern(`getScoredPhotosByTagsAndDesc:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTags:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotoImageByFullQuery:${userId}:*`)
    await invalidateCacheByPattern(`searchByPhotos:${userId}:*`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)

    const invalidated = await this.maybeInvalidateExpensiveCaches(
      userId,
      +photoCount,
      false,
      options.skipExpensiveWarmup ?? false
    )
    console.log(
      `[CacheInvalidation] onAnalysisCompleted: user=${userId} photoCount=${photoCount} expensiveInvalidated=${invalidated}`
    )
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Atomically increments the per-user watermark by `signedDelta`, then checks
   * whether either accumulator (net or churn) has crossed the threshold.
   * If it has, all four expensive cache patterns are flushed and the watermark
   * is reset to zero.
   *
   * The upsert is a single SQL statement so concurrent requests can't lose an
   * increment — the worst case is two requests both see the threshold crossed
   * and both flush, which is safe (idempotent).
   *
   * @param signedDelta  +N for analysis/upload events, -N for deletions.
   * @returns            true if expensive caches were invalidated this call.
   */
  private static async maybeInvalidateExpensiveCaches(
    userId: string,
    signedDelta: number,
    force: boolean = false,
    skipWarmup: boolean = false
  ): Promise<boolean> {
    const absDelta = Math.abs(signedDelta)
    const currentHasPayload = await this.hasExpensiveCachePayload(userId)

    const previousStateResult = await db.rawQuery<{ rows: { has_payload: boolean }[] }>(
      `SELECT has_payload
       FROM cache_invalidation_watermarks
       WHERE user_id = :userId`,
      { userId: Number(userId) }
    )

    const previousHasPayload = Boolean(previousStateResult.rows[0]?.has_payload)
    const crossedPayloadBoundary = previousHasPayload !== currentHasPayload

    // Atomic upsert: insert first row or increment existing deltas in one round-trip.
    const result = await db.rawQuery<{
      rows: { net_delta: number; churn_delta: number; has_payload: boolean }[]
    }>(
      `INSERT INTO cache_invalidation_watermarks (
         user_id,
         net_delta,
         churn_delta,
         has_payload,
         updated_at
       )
       VALUES (:userId, :signedDelta, :absDelta, :currentHasPayload, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         net_delta   = cache_invalidation_watermarks.net_delta   + :signedDelta,
         churn_delta = cache_invalidation_watermarks.churn_delta + :absDelta,
         has_payload = :currentHasPayload,
         updated_at  = NOW()
       RETURNING net_delta, churn_delta, has_payload`,
      { userId: Number(userId), signedDelta, absDelta, currentHasPayload }
    )

    const { net_delta, churn_delta, has_payload } = result.rows[0]

    const shouldInvalidate =
      force ||
      crossedPayloadBoundary ||
      Math.abs(net_delta) >= EXPENSIVE_CACHE_DELTA_THRESHOLD ||
      churn_delta >= EXPENSIVE_CACHE_DELTA_THRESHOLD

    if (!shouldInvalidate) {
      console.log(
        `[CacheInvalidation] Expensive caches deferred for user ${userId} ` +
          `(` +
          `net_delta=${net_delta}, ` +
          `churn_delta=${churn_delta}, ` +
          `has_payload=${has_payload}, ` +
          `threshold=${EXPENSIVE_CACHE_DELTA_THRESHOLD}` +
          `)`
      )
      return false
    }

    // Reset watermark before flushing so a concurrent request that also crossed
    // the threshold will start accumulating from 0, not from the old values.
    await db.rawQuery(
      `UPDATE cache_invalidation_watermarks
       SET net_delta = 0,
           churn_delta = 0,
           has_payload = :currentHasPayload,
           last_invalidated_at = NOW(),
           updated_at = NOW()
       WHERE user_id = :userId`,
      { userId: Number(userId), currentHasPayload }
    )

    for (const pattern of EXPENSIVE_CACHE_PATTERNS) {
      await invalidateCacheByPattern(pattern(userId))
    }

    if (skipWarmup) {
      console.log(
        `[CacheInvalidation] Warm-up skipped for user ${userId} due to invalidation options`
      )
    } else {
      await this.warmExpensiveDashboardCaches(userId)
    }

    console.log(
      `[CacheInvalidation] Expensive caches INVALIDATED for user ${userId} ` +
        `(` +
        `net_delta=${net_delta}, ` +
        `churn_delta=${churn_delta}, ` +
        `has_payload=${has_payload}, ` +
        `boundary_crossed=${crossedPayloadBoundary}, ` +
        `threshold=${EXPENSIVE_CACHE_DELTA_THRESHOLD}` +
        `)`
    )
    return true
  }

  /**
   * Detects whether any expensive cache can currently return non-empty data.
   * This lets us invalidate immediately on 0 -> >0 and >0 -> 0 transitions,
   * without lowering the normal watermark threshold for steady-state churn.
   */
  private static async hasExpensiveCachePayload(userId: string): Promise<boolean> {
    const result = await db.rawQuery<{ rows: { has_payload: boolean }[] }>(
      `SELECT (
         EXISTS (
           SELECT 1
           FROM photos p
           WHERE p.user_id = :userId
             AND p.deleted_at IS NULL
             AND (
               p.embedding IS NOT NULL
               OR p.descriptions IS NOT NULL
             )
         )
         OR EXISTS (
           SELECT 1
           FROM descriptions_chunks dc
           JOIN photos p ON p.id = dc.photo_id
           WHERE p.user_id = :userId
             AND p.deleted_at IS NULL
             AND dc.embedding IS NOT NULL
         )
         OR EXISTS (
           SELECT 1
           FROM tags t
           JOIN tags_photos tp ON tp.tag_id = t.id
           JOIN photos p ON p.id = tp.photo_id
           WHERE p.user_id = :userId
             AND p.deleted_at IS NULL
             AND t.embedding IS NOT NULL
         )
       ) AS has_payload`,
      { userId: Number(userId) }
    )

    return Boolean(result.rows[0]?.has_payload)
  }

  /**
   * Rebuild selected dashboard preview caches immediately after invalidation so
   * front requests don't pay cold-start cost.
   */
  private static async warmExpensiveDashboardCaches(userId: string): Promise<void> {
    const threeDManager = new ThreeDManager()
    const tagCloudManager = new TagCloudManager()

    const warmups: Promise<unknown>[] = []

    for (const variant of WARMUP_2D_VARIANTS) {
      warmups.push(
        threeDManager.get3DPhotos(userId, variant.chunkName, variant.limit, variant.outputDims)
      )
    }

    for (const variant of WARMUP_TAGCLOUD_VARIANTS) {
      warmups.push(
        tagCloudManager.getTagCloud(
          userId,
          variant.outputDims,
          variant.minPhotoCount,
          variant.limit
        )
      )
    }

    const settled = await Promise.allSettled(warmups)
    const failed = settled.filter((result) => result.status === 'rejected').length

    if (failed > 0) {
      console.warn(
        `[CacheInvalidation] Warm-up completed with ${failed}/${settled.length} failures for user ${userId}`
      )
      return
    }

    console.log(
      `[CacheInvalidation] Warm-up completed for user ${userId} (${settled.length} cache variants)`
    )
  }

  static async invalidateAll(
    userId: string | number,
    options: InvalidationOptions = {}
  ): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCache(`getTagsByUser_${userId}`)

    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCacheByPattern(`searchByTagsDirect:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTagsAndDesc:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTags:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotoImageByFullQuery:${userId}:*`)
    await invalidateCacheByPattern(`searchByPhotos:${userId}:*`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)

    await this.maybeInvalidateExpensiveCaches(
      String(userId),
      0,
      true,
      options.skipExpensiveWarmup ?? false
    )

    console.log(`[CacheInvalidation] invalidateAll: Invalidated ALL caches for user ${userId}`)
  }
}
