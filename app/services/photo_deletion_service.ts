import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

export default class PhotoDeletionService {
  /**
   * Physically delete all soft-deleted photos in batches,
   * cleaning up R2 files before removing DB rows.
   * Then purge soft-deleted users whose photos are all gone.
   */
  static async deletePhysically(batchSize: number = 50, dryRun: boolean = false) {
    logger.info('[PhotoDeletion] Starting physical deletion of ALL soft-deleted photos')
    logger.info(`[PhotoDeletion] Batch size: ${batchSize}`)
    logger.info(`[PhotoDeletion] Dry run: ${dryRun ? 'YES' : 'NO'}`)

    let totalProcessed = 0
    let totalDeleted = 0
    let totalErrors = 0

    while (true) {
      // Fetch next batch of photos to delete (ALL photos with deleted_at)
      const photos = await db
        .from('photos')
        .whereNotNull('deleted_at')
        .limit(batchSize)
        .select('id', 'name', 'thumbnail_name', 'deleted_at')

      if (photos.length === 0) {
        logger.info('[PhotoDeletion] No more photos to delete')
        break
      }

      logger.info(`[PhotoDeletion] Processing batch of ${photos.length} photos...`)

      if (!dryRun) {
        // Hard-delete photo rows in bulk (CASCADE cleans junction tables)
        // Note: R2 files are already deleted at soft-delete time (PhotoManager / admin deleteUser)
        const photoIds = photos.map((p: any) => p.id)
        try {
          await db.from('photos').whereIn('id', photoIds).delete()
          totalDeleted += photoIds.length
          logger.info(`[PhotoDeletion] Deleted ${photoIds.length} photo rows from DB`)
        } catch (error: any) {
          totalErrors += photoIds.length
          logger.error(`[PhotoDeletion] Error deleting photo batch: ${error.message}`)
        }
      } else {
        totalDeleted += photos.length
        logger.info(`[PhotoDeletion] [DRY RUN] Would delete ${photos.length} photos`)
      }

      totalProcessed += photos.length

      // Small delay between batches to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Purge soft-deleted users whose photos have all been cleaned up
    await this.purgeDeletedUsers(dryRun)

    // Final summary
    logger.info('[PhotoDeletion] ═══════════════════════════════════════')
    logger.info('[PhotoDeletion] Physical deletion process completed')
    logger.info(`[PhotoDeletion] Total photos processed: ${totalProcessed}`)
    logger.info(`[PhotoDeletion] Total photos deleted: ${totalDeleted}`)
    logger.info(`[PhotoDeletion] Total errors: ${totalErrors}`)
    if (dryRun) {
      logger.warn('[PhotoDeletion] This was a DRY RUN - no actual deletions were performed')
    }
    logger.info('[PhotoDeletion] ═══════════════════════════════════════')

    return {
      totalProcessed,
      totalDeleted,
      totalErrors,
    }
  }

  /**
   * Clean up remaining data for soft-deleted users whose photos are all gone.
   * The user row is kept (soft-deleted) to block re-registration with the same email.
   */
  private static async purgeDeletedUsers(dryRun: boolean) {
    // Find soft-deleted users with zero remaining photos
    const users = await db
      .from('users')
      .whereNotNull('users.deleted_at')
      .leftJoin('photos', 'photos.user_id', 'users.id')
      .groupBy('users.id')
      .havingRaw('COUNT(photos.id) = 0')
      .select('users.id')

    if (users.length === 0) {
      logger.info('[PhotoDeletion] No soft-deleted users to clean up')
      return
    }

    const userIds = users.map((u: any) => u.id)
    logger.info(
      `[PhotoDeletion] Cleaning up data for ${userIds.length} soft-deleted user(s): [${userIds.join(', ')}]`
    )

    if (dryRun) {
      logger.info(`[PhotoDeletion] [DRY RUN] Would clean up ${userIds.length} user(s)`)
      return
    }

    // Delete all dependent data that isn't covered by the photo cascade
    await db.from('series').whereIn('user_id', userIds).delete()
    await db.from('collections').whereIn('user_id', userIds).delete()
    await db.from('conversations').whereIn('user_id', userIds).delete()
    await db.from('canvases').whereIn('user_id', userIds).delete()
    await db.from('cost_logs').whereIn('user_id', userIds).delete()
    await db.from('user_activities').whereIn('user_id', userIds).delete()
    await db.from('analyzer_processes').whereIn('user_id', userIds).update({ user_id: null })
    await db.from('auth_access_tokens').whereIn('tokenable_id', userIds).delete()

    logger.info(`[PhotoDeletion] ✓ Cleaned up data for ${userIds.length} user(s)`)
  }
}
