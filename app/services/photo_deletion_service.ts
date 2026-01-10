import Photo from '#models/photo'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

export default class PhotoDeletionService {
  /**
   * Physically delete all soft-deleted photos in batches
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

      // Process each photo in the batch sequentially
      for (const photo of photos) {
        totalProcessed++

        try {
          const photoId = photo.id
          const deletedAt = photo.deleted_at

          logger.info(
            `[PhotoDeletion] [${totalProcessed}] Processing photo ID: ${photoId} (deleted at: ${deletedAt})`
          )

          if (dryRun) {
            logger.info(`[PhotoDeletion]   [DRY RUN] Would delete photo record from database`)
            totalDeleted++
            continue
          }

          // Delete record from database (CASCADE will handle related records)
          // Note: R2 files are already deleted during soft delete in PhotoManager
          await db.from('photos').where('id', photoId).delete()
          logger.info(`[PhotoDeletion]   ✓ Deleted photo record from database (ID: ${photoId})`)

          totalDeleted++
        } catch (error: any) {
          totalErrors++
          logger.error(`[PhotoDeletion]   ✗ Error deleting photo ${photo.id}: ${error.message}`)
          // Continue with next photo
        }
      }

      logger.info(
        `[PhotoDeletion] Batch completed. Progress: ${totalDeleted} deleted, ${totalErrors} errors`
      )

      // Small delay between batches to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

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
}
