import { invalidateCache, invalidateCacheByPattern } from '../decorators/withCache.js'

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
 * Expensive caches (get3DPhotos, getTagCloud) are only invalidated when photoCount >= this
 * threshold. Below it the 2-week TTL set on the decorator acts as a safety net.
 */
const EXPENSIVE_CACHE_DELETE_THRESHOLD = 5
const EXPENSIVE_CACHE_ANALYSIS_THRESHOLD = 2
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

  /**
   * Called when photos are soft-deleted.
   * Tags may be affected; UMAP/3D is NOT invalidated here — wait for onAnalysisCompleted.
   * Used by: photo_manager.deletePhotos
   * @param photoCount Number of photos deleted. Expensive caches are only invalidated when >= EXPENSIVE_CACHE_THRESHOLD.
   */
  static async onPhotosDeleted(userId: string, photoCount: number = 1): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
    await invalidateCacheByPattern(`getPhotosFor3DView_${userId}_*`)
    if (photoCount >= EXPENSIVE_CACHE_DELETE_THRESHOLD) {
      await invalidateCacheByPattern(`get3DPhotos:${userId}:*`)
      await invalidateCacheByPattern(`getTagCloud:${userId}:*`)
    }
    await invalidateCacheByPattern(`portfolioEmbeddings:*:${userId}`)
    await invalidateCacheByPattern(`getScoredPhotosByTagsAndDesc:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTags:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotoImageByFullQuery:${userId}:*`)
    await invalidateCacheByPattern(`searchByPhotos:${userId}:*`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)
    console.log(
      `[CacheInvalidation] onPhotosDeleted: Invalidated caches for user ${userId} (photoCount=${photoCount}, expensive=${photoCount >= EXPENSIVE_CACHE_DELETE_THRESHOLD})`
    )
  }

  /**
   * Called when an analysis pipeline (or global reprocess) finishes.
   * Invalidates everything including expensive dimensional-reduction caches.
   * Used by: analyzer_service.runAll
   * @param photoCount Number of photos analysed. Expensive caches are only invalidated when >= EXPENSIVE_CACHE_THRESHOLD.
   */
  static async onAnalysisCompleted(userId: string, photoCount: number = 1): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCache(`getPhotosPreview_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
    await invalidateCacheByPattern(`getPhotosFor3DView_${userId}_*`)
    if (photoCount >= EXPENSIVE_CACHE_ANALYSIS_THRESHOLD) {
      await invalidateCacheByPattern(`get3DPhotos:${userId}:*`)
      await invalidateCacheByPattern(`getTagCloud:${userId}:*`)
    }
    await invalidateCacheByPattern(`portfolioEmbeddings:*:${userId}`)
    await invalidateCacheByPattern(`getScoredPhotosByTagsAndDesc:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotosByTags:${userId}:*`)
    await invalidateCacheByPattern(`getScoredPhotoImageByFullQuery:${userId}:*`)
    await invalidateCacheByPattern(`searchByPhotos:${userId}:*`)
    await invalidateCacheByPattern(`checkSimilarDuplicates:${userId}:*`)
    await invalidateCacheByPattern(`checkExactDuplicates:${userId}:*`)
    console.log(
      `[CacheInvalidation] onAnalysisCompleted: Invalidated all caches for user ${userId} (photoCount=${photoCount}, expensive=${photoCount >= EXPENSIVE_CACHE_ANALYSIS_THRESHOLD})`
    )
  }
}
