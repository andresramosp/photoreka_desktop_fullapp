import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import type { PhotoStatus } from '#models/photo'
import { deletePhotoFiles, isDesktopFileKey } from '#desktop/cloud_functions'

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

  /**
   * Escritorio: los archivos se borran en el servicio de la nube, que también limpia la copia de B2
   * y solo acepta claves de la carpeta del escritorio del usuario (R2 es el de producción). Las
   * fotos con otras claves, como las importadas de un volcado de producción, conservan sus
   * archivos: de ellas solo se borra la fila local.
   */
  private static async deleteCloudFiles(
    photos: PhotoDeletionRow[],
    logPrefix: string,
    dryRun: boolean
  ): Promise<{ success: boolean; deletedKeys: number }> {
    const keysByUser = new Map<number, Set<string>>()
    let foreignKeys = 0
    for (const photo of photos) {
      for (const key of [photo.name, photo.thumbnail_name]) {
        if (!key) continue
        if (!isDesktopFileKey(key) || !photo.user_id) {
          foreignKeys++
          continue
        }
        if (!keysByUser.has(photo.user_id)) keysByUser.set(photo.user_id, new Set())
        keysByUser.get(photo.user_id)!.add(key)
      }
    }
    if (foreignKeys > 0) {
      console.log(`[${logPrefix}] ${foreignKeys} archivo(s) fuera de la carpeta del escritorio: no se tocan`)
    }

    const total = [...keysByUser.values()].reduce((n, keys) => n + keys.size, 0)
    if (total === 0) return { success: true, deletedKeys: 0 }
    if (dryRun) {
      console.log(`[${logPrefix}] [DRY RUN] Would delete ${total} file(s) in the cloud`)
      return { success: true, deletedKeys: total }
    }

    let deleted = 0
    try {
      for (const [userId, keys] of keysByUser) {
        const failed = await deletePhotoFiles(userId, [...keys])
        deleted += keys.size - failed.length
        if (failed.length > 0) {
          logger.error(`[${logPrefix}] La nube no pudo borrar ${failed.length} archivo(s): %o`, failed)
          return { success: false, deletedKeys: deleted }
        }
      }
      console.log(`[${logPrefix}] Deleted ${deleted} file(s) in the cloud`)
      return { success: true, deletedKeys: deleted }
    } catch (error) {
      logger.error(`[${logPrefix}] Failed deleting files in the cloud: %o`, error)
      return { success: false, deletedKeys: deleted }
    }
  }

  /**
   * Core hard-deletion method. It first deletes the files in the cloud (see deleteCloudFiles);
   * if that succeeds it deletes the database rows in batches.
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

    const filesResult = await this.deleteCloudFiles(photos, logPrefix, dryRun)
    if (!filesResult.success) {
      logger.error(
        `[${logPrefix}] Skipping DB hard-delete because file deletion did not complete cleanly`
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
   * Escritorio: las fotos se borran al momento (ver PhotoManager.deletePhotos). Esta pasada
   * reintenta las que quedaron marcadas como borradas porque falló su borrado, por ejemplo sin
   * conexión con la nube, y después limpia las cuentas dadas de baja que ya no tienen fotos.
   *
   * @param dryRun If true, simulates the deletion without affecting R2 or the database.
   */
  static async processPendingSoftDeleted(dryRun: boolean = false) {
    const pending = await db
      .from('photos as p')
      .leftJoin('analyzer_processes as ap', 'ap.id', 'p.analyzer_process_id')
      .whereNotNull('p.deleted_at')
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

    if (pending.length === 0) {
      console.log('[PhotoDeletion] No soft-deleted photos pending hard delete')
    }

    const result = await this.hardDeletePhotosInBatches(
      pending,
      dryRun,
      'PhotoDeletion -> PendingRetry'
    )

    await this.purgeDeletedUsers(dryRun)

    return { totalPending: pending.length, ...result }
  }

  /**
   * Hard-deletes "orphan" upload rows:  /**
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
   * and from the DB immediately.
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
