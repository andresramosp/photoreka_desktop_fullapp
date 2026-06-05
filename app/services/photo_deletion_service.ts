import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3'
import type { PhotoStatus } from '#models/photo'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

type PhotoDeletionRow = {
  id: number
  user_id?: number | null
  name: string | null
  thumbnail_name: string | null
  deleted_at?: Date | string | null
  analyzer_process_id?: string | null
  analyzer_mode?: string | null
  analyzer_current_stage?: string | null
  analyzer_is_preprocess?: boolean | null
}

// PhotoDeletionService: physical deletion of soft-deleted photos + orphan sweep.
export default class PhotoDeletionService {
  private static readonly R2_DELETE_BATCH_SIZE = 128
  private static readonly R2_DELETE_MAX_RETRIES = 3
  private static readonly R2_DELETE_BASE_DELAY_MS = 500
  private static readonly HARD_DELETE_BATCH_SIZE = 50

  private static resolveStatus(photo: PhotoDeletionRow): PhotoStatus | null {
    if (!photo.analyzer_process_id) {
      return 'uploaded'
    }

    if (['admin_retry', 'overwrite_metadata'].includes(photo.analyzer_mode || '')) {
      return 'processed'
    }

    if (photo.analyzer_current_stage === 'failed') {
      return photo.analyzer_is_preprocess ? 'preprocessing' : 'preprocessed'
    }

    if (photo.analyzer_is_preprocess) {
      return 'preprocessed'
    }

    return photo.analyzer_current_stage === 'finished' ? 'processed' : 'processing'
  }

  private static formatPhotoIdsForLog(photos: PhotoDeletionRow[]): string {
    return photos
      .map((photo) => {
        const status = this.resolveStatus(photo) || 'unknown'
        return `${photo.id}:${status}`
      })
      .join(', ')
  }

  private static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private static shouldRetryR2Delete(error: any): boolean {
    const statusCode = error?.$metadata?.httpStatusCode
    const errorName = String(error?.name || '')

    return (
      statusCode === 429 || (statusCode >= 500 && statusCode < 600) || errorName === 'TimeoutError'
    )
  }

  private static async deleteR2Objects(
    photos: PhotoDeletionRow[],
    logPrefix: string,
    dryRun: boolean
  ): Promise<{ success: boolean; deletedKeys: number }> {
    const objectsToDelete = Array.from(
      new Set(
        photos.flatMap((photo) => [photo.name, photo.thumbnail_name].filter((key) => Boolean(key)))
      )
    ).map((Key) => ({ Key: Key as string }))

    if (objectsToDelete.length === 0) {
      console.log(
        `[${logPrefix}] No R2 objects to delete for photo IDs [${photos.map((p) => p.id).join(', ')}]`
      )
      return { success: true, deletedKeys: 0 }
    }

    if (dryRun) {
      console.log(
        `[${logPrefix}] [DRY RUN] Would delete ${objectsToDelete.length} R2 object(s) for photo IDs [${photos.map((p) => p.id).join(', ')}]`
      )
      return { success: true, deletedKeys: objectsToDelete.length }
    }

    const BATCH_SIZE = this.R2_DELETE_BATCH_SIZE
    let totalDeleted = 0

    try {
      for (let i = 0; i < objectsToDelete.length; i += BATCH_SIZE) {
        const batch = objectsToDelete.slice(i, i + BATCH_SIZE)
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1
        let result

        for (let attempt = 1; attempt <= this.R2_DELETE_MAX_RETRIES; attempt++) {
          try {
            result = await s3.send(
              new DeleteObjectsCommand({
                Bucket: process.env.R2_BUCKET,
                Delete: {
                  Objects: batch,
                  Quiet: true,
                },
              })
            )
            break
          } catch (error) {
            if (!this.shouldRetryR2Delete(error) || attempt === this.R2_DELETE_MAX_RETRIES) {
              throw error
            }

            const delayMs = this.R2_DELETE_BASE_DELAY_MS * 2 ** (attempt - 1)
            logger.warn(
              `[${logPrefix}] R2 delete batch ${batchNumber} failed on attempt ${attempt}/${this.R2_DELETE_MAX_RETRIES}. Retrying in ${delayMs}ms: %o`,
              error
            )
            await this.sleep(delayMs)
          }
        }

        const errors = (result?.Errors || []).filter((error) => Boolean(error.Key))

        if (errors.length > 0) {
          logger.error(
            `[${logPrefix}] R2 deletion reported key-level errors in batch ${batchNumber}: %o`,
            errors
          )

          return {
            success: false,
            deletedKeys: totalDeleted,
          }
        }

        totalDeleted += batch.length

        console.log(`[${logPrefix}] Deleted batch ${batchNumber} (${batch.length} object(s))`)
      }

      console.log(
        `[${logPrefix}] Deleted ${totalDeleted} R2 object(s) for photo IDs [${photos.map((p) => p.id).join(', ')}]`
      )

      return {
        success: true,
        deletedKeys: totalDeleted,
      }
    } catch (error) {
      logger.error(`[${logPrefix}] Failed deleting R2 objects: %o`, error)

      return {
        success: false,
        deletedKeys: totalDeleted,
      }
    }
  }

  /**
   * Core hard-deletion method. It first deletes all associated R2 objects and,
   * if successful, proceeds to delete the database rows in batches. This ensures
   * that database rows are only removed if their corresponding files are gone.
   *
   * @param photos The photo rows to hard-delete.
   * @param dryRun If true, simulates the deletion without affecting R2 or the database.
   * @param logPrefix A prefix for log messages.
   * @param batchSize The size of each batch for database row deletion.
   * @returns An object with the results of the deletion (counts of deleted, errors, and IDs).
   */
  static async hardDeletePhotosInBatches(
    photos: PhotoDeletionRow[],
    dryRun: boolean = false,
    logPrefix: string = 'PhotoDeletion',
    batchSize?: number
  ) {
    if (photos.length === 0) {
      return { totalDeleted: 0, totalErrors: 0, deletedIds: [] as number[] }
    }

    const deleteBatchSize = batchSize && batchSize > 0 ? batchSize : this.HARD_DELETE_BATCH_SIZE
    const totalBatches = Math.ceil(photos.length / deleteBatchSize)
    const deletedIds: number[] = []
    let totalDeleted = 0
    let totalErrors = 0

    console.log(
      `[${logPrefix}] Hard-deleting ${photos.length} photo(s) in ${totalBatches} batch(es)`
    )

    const r2Result = await this.deleteR2Objects(photos, logPrefix, dryRun)
    if (!r2Result.success) {
      logger.error(
        `[${logPrefix}] Skipping DB hard-delete because R2 deletion did not complete cleanly`
      )
      return { totalDeleted: 0, totalErrors: photos.length, deletedIds: [] as number[] }
    }

    for (let i = 0; i < photos.length; i += deleteBatchSize) {
      const batch = photos.slice(i, i + deleteBatchSize)
      const batchNumber = Math.floor(i / deleteBatchSize) + 1
      const batchIds = batch.map((photo) => photo.id)

      console.log(
        `[${logPrefix}] Hard-deleting batch ${batchNumber}/${totalBatches} (${batch.length} photo(s)): [${this.formatPhotoIdsForLog(batch)}]`
      )

      if (dryRun) {
        console.log(
          `[${logPrefix}] [DRY RUN] Would hard-delete DB rows for photo IDs [${batchIds.join(', ')}]`
        )
        totalDeleted += batchIds.length
        deletedIds.push(...batchIds)
        continue
      }

      try {
        await db.from('photos').whereIn('id', batchIds).delete()
        console.log(`[${logPrefix}] Hard-deleted DB rows for photo IDs [${batchIds.join(', ')}]`)
        totalDeleted += batchIds.length
        deletedIds.push(...batchIds)
      } catch (error) {
        logger.error(`[${logPrefix}] Failed deleting DB rows for batch ${batchNumber}: %o`, error)
        totalErrors += batchIds.length
      }
    }

    return { totalDeleted, totalErrors, deletedIds }
  }

  /**
   * Logs information about soft-deleted photos that are skipped from hard-deletion
   * because they are still within the configured retention period.
   * @param retentionCutoff The date before which photos are considered eligible for deletion.
   * @param retentionDays The configured retention period in days.
   */
  private static async logSkippedProcessedPhotos(retentionCutoff: Date, retentionDays: number) {
    const skipped = await db
      .from('photos as p')
      .leftJoin('analyzer_processes as ap', 'ap.id', 'p.analyzer_process_id')
      .whereNotNull('p.deleted_at')
      .whereNotNull('p.analyzer_process_id')
      .where('p.deleted_at', '>', retentionCutoff)
      .orderBy('p.deleted_at', 'asc')
      .select(
        'p.id',
        'p.deleted_at',
        'p.analyzer_process_id',
        'ap.mode as analyzer_mode',
        'ap.current_stage as analyzer_current_stage',
        'ap.is_preprocess as analyzer_is_preprocess'
      )

    if (skipped.length === 0) {
      console.log('[PhotoDeletion] No processed photos skipped by retention window')
      return
    }

    console.log(
      `[PhotoDeletion] Skipping ${skipped.length} processed photo(s) still inside the ${retentionDays}-day retention window: [${this.formatPhotoIdsForLog(skipped)}]`
    )
  }

  /**
   * Finds and hard-deletes soft-deleted photos in two buckets:
   * 1) "processed" photos older than the configured retention period.
   * 2) "uploaded" photos (no analyzer process) that were already soft-deleted.
   *
   * Bucket (2) is an eventual-consistency fallback for request-time background
   * deletions of uploaded photos, ensuring rows are eventually hard-deleted even
   * if the immediate background task fails.
   *
   * @param dryRun If true, simulates the deletion without affecting R2 or the database.
   * @param retentionDays The number of days to retain soft-deleted processed photos.
   * @returns An object summarizing the results of the cleanup pass.
   */
  static async processSoftDeletedRetentionWindow(
    dryRun: boolean = false,
    retentionDays: number = 7
  ) {
    const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    console.log('[PhotoDeletion] Starting retention-window cleanup pass')
    console.log(`[PhotoDeletion] Dry run: ${dryRun ? 'YES' : 'NO'}`)
    console.log(`[PhotoDeletion] Retention days for processed photos: ${retentionDays}`)
    console.log(`[PhotoDeletion] Retention cutoff: ${retentionCutoff.toISOString()}`)

    await this.logSkippedProcessedPhotos(retentionCutoff, retentionDays)

    const processedPhotos = await db
      .from('photos as p')
      .leftJoin('analyzer_processes as ap', 'ap.id', 'p.analyzer_process_id')
      .whereNotNull('p.deleted_at')
      .whereNotNull('p.analyzer_process_id')
      .where('p.deleted_at', '<=', retentionCutoff)
      .orderBy('p.deleted_at', 'asc')
      .select(
        'p.id',
        'p.user_id',
        'p.name',
        'p.thumbnail_name',
        'p.deleted_at',
        'p.analyzer_process_id',
        'ap.mode as analyzer_mode',
        'ap.current_stage as analyzer_current_stage',
        'ap.is_preprocess as analyzer_is_preprocess'
      )

    if (processedPhotos.length === 0) {
      console.log('[PhotoDeletion] No processed photos eligible for hard delete')
    }

    const processedResult = await this.hardDeletePhotosInBatches(
      processedPhotos,
      dryRun,
      'PhotoDeletion -> ProcessedHardDelete'
    )

    const uploadedSoftDeletedPhotos = await db
      .from('photos')
      .whereNotNull('deleted_at')
      .whereNull('analyzer_process_id')
      .orderBy('deleted_at', 'asc')
      .select('id', 'user_id', 'name', 'thumbnail_name', 'deleted_at', 'analyzer_process_id')

    if (uploadedSoftDeletedPhotos.length === 0) {
      console.log('[PhotoDeletion] No soft-deleted uploaded photos pending hard delete')
    }

    const uploadedResult = await this.hardDeletePhotosInBatches(
      uploadedSoftDeletedPhotos,
      dryRun,
      'PhotoDeletion -> UploadedSoftDeletedFallback'
    )

    const totalProcessed = processedPhotos.length
    const totalUploadedFallback = uploadedSoftDeletedPhotos.length
    const totalDeleted = processedResult.totalDeleted + uploadedResult.totalDeleted
    const totalErrors = processedResult.totalErrors + uploadedResult.totalErrors

    // Purge soft-deleted users whose photos have all been cleaned up
    await this.purgeDeletedUsers(dryRun)

    // Final summary
    console.log('[PhotoDeletion] ═══════════════════════════════════════')
    console.log('[PhotoDeletion] Retention-window cleanup completed')
    console.log(`[PhotoDeletion] Total photos processed: ${totalProcessed}`)
    console.log(`[PhotoDeletion] Total uploaded fallback candidates: ${totalUploadedFallback}`)
    console.log(`[PhotoDeletion] Total photos deleted: ${totalDeleted}`)
    console.log(`[PhotoDeletion] Total errors: ${totalErrors}`)
    if (dryRun) {
      logger.warn('[PhotoDeletion] This was a DRY RUN - no actual deletions were performed')
    }
    console.log('[PhotoDeletion] ═══════════════════════════════════════')

    return {
      totalProcessed,
      totalUploadedFallback,
      totalDeleted,
      totalErrors,
      retentionDays,
    }
  }

  /**
   * Immediately hard-deletes specific processed photos that are already soft-deleted.
   * This bypasses the retention cutoff selection, but only for the explicitly
   * provided IDs.
   *
   * @param photoIds The soft-deleted processed photo IDs to purge immediately.
   * @param dryRun If true, simulates the deletion without affecting R2 or the database.
   * @returns An object summarizing the targeted deletion pass.
   */
  static async deleteSoftDeletedPhotosNow(photoIds: number[], dryRun: boolean = false) {
    if (photoIds.length === 0) {
      return { totalFound: 0, totalDeleted: 0, totalErrors: 0, deletedIds: [] as number[] }
    }

    const processedPhotos = await db
      .from('photos as p')
      .leftJoin('analyzer_processes as ap', 'ap.id', 'p.analyzer_process_id')
      .whereIn('p.id', photoIds)
      .whereNotNull('p.deleted_at')
      .whereNotNull('p.analyzer_process_id')
      .orderBy('p.deleted_at', 'asc')
      .select(
        'p.id',
        'p.user_id',
        'p.name',
        'p.thumbnail_name',
        'p.deleted_at',
        'p.analyzer_process_id',
        'ap.mode as analyzer_mode',
        'ap.current_stage as analyzer_current_stage',
        'ap.is_preprocess as analyzer_is_preprocess'
      )

    if (processedPhotos.length === 0) {
      console.log(
        '[PhotoDeletion -> ImmediateSoftDeletePurge] No soft-deleted processed photos found'
      )
      return { totalFound: 0, totalDeleted: 0, totalErrors: 0, deletedIds: [] as number[] }
    }

    const result = await this.hardDeletePhotosInBatches(
      processedPhotos,
      dryRun,
      'PhotoDeletion -> ImmediateSoftDeletePurge'
    )

    await this.purgeDeletedUsers(dryRun)

    return {
      totalFound: processedPhotos.length,
      totalDeleted: result.totalDeleted,
      totalErrors: result.totalErrors,
      deletedIds: result.deletedIds,
    }
  }

  /**
   * Hard-deletes "orphan" upload rows: photos that were created by the upload
   * pipeline (`confirmed = false`) but were never confirmed by the client after
   * the configured age threshold. These rows point at R2 objects that either
   * never finished uploading or only partially landed.
   *
   * SAFETY: only rows with `confirmed = false` are touched. Legacy photos
   * (`confirmed = null`) and confirmed photos (`confirmed = true`) are excluded
   * by the strict equality, since in PostgreSQL `confirmed = false` never
   * matches NULL. Already soft-deleted rows are skipped via `deleted_at IS NULL`.
   * Uploaded rows have no analysis relations yet, so they are deleted from R2
   * and from the DB immediately instead of entering the processed retention flow.
   *
   * @param ageMinutes The minimum age in minutes for an unconfirmed photo to be considered an orphan.
   * @param dryRun If true, simulates the deletion without affecting R2 or the database.
   * @returns An object with the total found and hard-deleted orphan counts.
   */
  static async sweepUnconfirmedOrphans(ageMinutes: number = 60, dryRun: boolean = false) {
    const cutoff = new Date(Date.now() - ageMinutes * 60 * 1000)

    const baseQuery = () =>
      db
        .from('photos')
        .where('confirmed', false)
        .whereNull('deleted_at')
        .where('created_at', '<', cutoff)

    const candidates = await baseQuery().count('* as total').first()
    const total = Number(candidates?.total ?? 0)

    if (total === 0) {
      console.log('[PhotoDeletion -> OrphanSweep] No unconfirmed orphans older than threshold')
      return { total: 0, hardDeleted: 0 }
    }

    console.log(
      `[PhotoDeletion -> OrphanSweep] Found ${total} unconfirmed orphan(s) older than ${ageMinutes} min` +
        (dryRun ? ' [DRY RUN]' : '')
    )

    const orphanRows = await baseQuery().select('id', 'user_id', 'name', 'thumbnail_name')
    const affectedUserIds: string[] = orphanRows.map((r: any) => String(r.user_id)).filter(Boolean)

    const result = await this.hardDeletePhotosInBatches(
      orphanRows,
      dryRun,
      'PhotoDeletion -> OrphanSweep'
    )
    console.log(
      `[PhotoDeletion -> OrphanSweep] Hard-deleted ${result.totalDeleted} unconfirmed orphan(s)`
    )

    // Invalidate photo-list caches for every affected user.
    // Orphans are never analyzed, so onPhotoListChanged is the correct (lighter) event.
    if (!dryRun && result.totalDeleted > 0) {
      for (const userId of affectedUserIds) {
        await CacheInvalidationService.onPhotoListChanged(userId)
      }
    }

    return { total, hardDeleted: result.totalDeleted, errors: result.totalErrors }
  }

  /**
   * Finds soft-deleted users who have no remaining photos in the database and
   * permanently deletes them and their associated data (series, collections, etc.).
   * Payments are anonymized by nullifying the user_id.
   *
   * @param dryRun If true, only logs the users that would be purged.
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
      console.log('[PhotoDeletion] No soft-deleted users to clean up')
      return
    }

    const userIds = users.map((u: any) => u.id)
    console.log(
      `[PhotoDeletion] Cleaning up data for ${userIds.length} soft-deleted user(s): [${userIds.join(', ')}]`
    )

    if (dryRun) {
      console.log(`[PhotoDeletion] [DRY RUN] Would clean up ${userIds.length} user(s)`)
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
    // Nullify payments.user_id — email is preserved in user_email_snapshot for auditing
    await db.from('payments').whereIn('user_id', userIds).update({ user_id: null })
    // Hard-delete user rows. The email is retained in user_email_snapshot on payment records.
    await db.from('users').whereIn('id', userIds).delete()

    console.log(
      `[PhotoDeletion] ✓ Hard-deleted ${userIds.length} user(s) and nullified their payments`
    )
  }
}
