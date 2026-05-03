import { invalidateCache, invalidateCacheByPattern } from '../decorators/withCache.js'

/**
 * Centralized cache invalidation policies.
 * All cache invalidation in the app should go through this service — never call
 * invalidateCache/invalidateCacheByPattern directly from controllers or managers.
 *
 * Three event tiers:
 *  - onPhotoListChanged  → photo list stale (upload, note edit, swap — pre-analysis)
 *  - onPhotosDeleted     → photo list + search index + tags stale
 *  - onAnalysisCompleted → everything including UMAP/3D/portfolio (expensive reductions)
 */
export class CacheInvalidationService {
  /**
   * Called when photos are uploaded or their metadata changes in place
   * (no structural change to tags or search embeddings yet).
   * Does NOT invalidate search index — unanalyzed photos aren't searchable.
   * Used by: catalog_controller (upload, note, swap), analyzer_service.initProcess
   */
  static async onPhotoListChanged(userId: string): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
  }

  /**
   * Called when photos are soft-deleted.
   * Tags may be affected; UMAP/3D is NOT invalidated here — wait for onAnalysisCompleted.
   * Used by: photo_manager.deletePhotos
   */
  static async onPhotosDeleted(userId: string): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
  }

  /**
   * Called when an analysis pipeline (or global reprocess) finishes.
   * Invalidates everything including expensive dimensional-reduction caches.
   * Used by: analyzer_service.runAll
   */
  static async onAnalysisCompleted(userId: string): Promise<void> {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
    await invalidateCache(`getTagsByUser_${userId}`)
    await invalidateCacheByPattern(`getPhotosFor3DView_${userId}_*`)
    await invalidateCacheByPattern(`get3DPhotos:${userId}:*`)
    await invalidateCacheByPattern(`getTagCloud:${userId}:*`)
    await invalidateCacheByPattern(`portfolioEmbeddings:*:${userId}`)
  }
}
