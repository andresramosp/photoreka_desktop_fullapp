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

    try {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: process.env.R2_BUCKET,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        })
      )

      const errors = (result.Errors || []).filter((error) => Boolean(error.Key))
      if (errors.length > 0) {
        logger.error(`[${logPrefix}] R2 deletion reported key-level errors: %o`, errors)
        return { success: false, deletedKeys: 0 }
      }

      console.log(
        `[${logPrefix}] Deleted ${objectsToDelete.length} R2 object(s) for photo IDs [${photos.map((p) => p.id).join(', ')}]`
      )
      return { success: true, deletedKeys: objectsToDelete.length }
    } catch (error) {
      logger.error(`[${logPrefix}] Failed deleting R2 objects: %o`, error)
      return { success: false, deletedKeys: 0 }
    }
  }

  static async hardDeletePhotosNow(
    photos: PhotoDeletionRow[],
    dryRun: boolean = false,
    logPrefix: string = 'PhotoDeletion'
  ) {
    if (photos.length === 0) {
      return { totalDeleted: 0, totalErrors: 0, deletedIds: [] as number[] }
    }

    const photoIds = photos.map((photo) => photo.id)
    console.log(
      `[${logPrefix}] Hard-deleting ${photos.length} photo(s): [${this.formatPhotoIdsForLog(photos)}]`
    )

    const r2Result = await this.deleteR2Objects(photos, logPrefix, dryRun)
    if (!r2Result.success) {
      logger.error(
        `[${logPrefix}] Skipping DB hard-delete because R2 deletion did not complete cleanly`
      )
      return { totalDeleted: 0, totalErrors: photoIds.length, deletedIds: [] as number[] }
    }

    if (dryRun) {
      console.log(
        `[${logPrefix}] [DRY RUN] Would hard-delete DB rows for photo IDs [${photoIds.join(', ')}]`
      )
      return { totalDeleted: photoIds.length, totalErrors: 0, deletedIds: photoIds }
    }

    try {
      await db.from('photos').whereIn('id', photoIds).delete()
      console.log(`[${logPrefix}] Hard-deleted DB rows for photo IDs [${photoIds.join(', ')}]`)
      return { totalDeleted: photoIds.length, totalErrors: 0, deletedIds: photoIds }
    } catch (error) {
      logger.error(`[${logPrefix}] Failed deleting DB rows: %o`, error)
      return { totalDeleted: 0, totalErrors: photoIds.length, deletedIds: [] as number[] }
    }
  }

  private static async logSkippedRetainedPhotos(retentionCutoff: Date, retentionDays: number) {
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
      console.log('[PhotoDeletion] No retained photos skipped by retention window')
      return
    }

    console.log(
      `[PhotoDeletion] Skipping ${skipped.length} retained photo(s) still inside the ${retentionDays}-day retention window: [${this.formatPhotoIdsForLog(skipped)}]`
    )
  }

  /**
   * Hard-delete uploaded photos immediately and retained/analyzed photos only
   * after the retention window has elapsed. R2 cleanup happens in the same pass
   * right before the DB hard-delete.
   */
  static async deletePhysically(
    batchSize: number = 50,
    dryRun: boolean = false,
    retentionDays: number = 7
  ) {
    const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    console.log('[PhotoDeletion] Starting physical deletion pass')
    console.log(`[PhotoDeletion] Batch size: ${batchSize}`)
    console.log(`[PhotoDeletion] Dry run: ${dryRun ? 'YES' : 'NO'}`)
    console.log(`[PhotoDeletion] Retention days for retained photos: ${retentionDays}`)
    console.log(`[PhotoDeletion] Retention cutoff: ${retentionCutoff.toISOString()}`)

    let totalProcessed = 0
    let totalDeleted = 0
    let totalErrors = 0

    await this.logSkippedRetainedPhotos(retentionCutoff, retentionDays)

    while (true) {
      const uploadedPhotos = await db
        .from('photos')
        .whereNotNull('deleted_at')
        .whereNull('analyzer_process_id')
        .orderBy('deleted_at', 'asc')
        .limit(batchSize)
        .select('id', 'user_id', 'name', 'thumbnail_name', 'deleted_at', 'analyzer_process_id')

      if (uploadedPhotos.length === 0) {
        break
      }

      console.log(
        `[PhotoDeletion] Cleaning up ${uploadedPhotos.length} soft-deleted uploaded photo(s) immediately: [${this.formatPhotoIdsForLog(uploadedPhotos)}]`
      )

      const result = await this.hardDeletePhotosNow(
        uploadedPhotos,
        dryRun,
        'PhotoDeletion -> UploadedImmediateCleanup'
      )
      totalProcessed += uploadedPhotos.length
      totalDeleted += result.totalDeleted
      totalErrors += result.totalErrors
    }

    while (true) {
      const photos = await db
        .from('photos as p')
        .leftJoin('analyzer_processes as ap', 'ap.id', 'p.analyzer_process_id')
        .whereNotNull('p.deleted_at')
        .whereNotNull('p.analyzer_process_id')
        .where('p.deleted_at', '<=', retentionCutoff)
        .orderBy('p.deleted_at', 'asc')
        .limit(batchSize)
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

      if (photos.length === 0) {
        console.log('[PhotoDeletion] No more retained photos eligible for hard delete')
        break
      }

      console.log(
        `[PhotoDeletion] Hard-deleting retained batch of ${photos.length} photo(s): [${this.formatPhotoIdsForLog(photos)}]`
      )

      const result = await this.hardDeletePhotosNow(
        photos,
        dryRun,
        'PhotoDeletion -> RetainedHardDelete'
      )
      totalDeleted += result.totalDeleted
      totalErrors += result.totalErrors

      totalProcessed += photos.length
    }

    // Purge soft-deleted users whose photos have all been cleaned up
    await this.purgeDeletedUsers(dryRun)

    // Final summary
    console.log('[PhotoDeletion] ═══════════════════════════════════════')
    console.log('[PhotoDeletion] Physical deletion process completed')
    console.log(`[PhotoDeletion] Total photos processed: ${totalProcessed}`)
    console.log(`[PhotoDeletion] Total photos deleted: ${totalDeleted}`)
    console.log(`[PhotoDeletion] Total errors: ${totalErrors}`)
    if (dryRun) {
      logger.warn('[PhotoDeletion] This was a DRY RUN - no actual deletions were performed')
    }
    console.log('[PhotoDeletion] ═══════════════════════════════════════')

    return {
      totalProcessed,
      totalDeleted,
      totalErrors,
      retentionDays,
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
   * and from the DB immediately instead of entering the retained scheduler flow.
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

    const result = await this.hardDeletePhotosNow(
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
   * Hard-delete soft-deleted users whose photos are all gone.
   * Nullifies payments.user_id (email already captured in user_email_snapshot).
   * Removes the user row — re-registration is not blocked by a kept row.
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
