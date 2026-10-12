import User from '#models/user'
import Photo from '#models/photo'
import PhotoDeletionService from '#services/photo_deletion_service'
import LightroomFolderMirrorService from '#services/lightroom_folder_mirror_service'
import type { MaterializeSummary } from '#services/lightroom_folder_mirror_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

export interface AdminPendingDeletionItem {
  id: number
  name: string
  email: string
  role: string
  provider: string | null
  createdAt: string
  deletedAt: string
  /** Photo rows left in the database: while > 0 the account cannot be purged */
  pendingPhotosCount: number
}

export default class AdminUsersService {
  /**
   * Soft-deleted accounts that are still being cleaned up.
   *
   * `list()` cannot return them: the User model filters `deleted_at IS NULL`
   * through its beforeFetch hook. The raw query builder skips that hook, so the
   * admin UI can keep showing the row (struck through) until the purge removes
   * the user and its photos for good.
   */
  static async listPendingDeletion(): Promise<AdminPendingDeletionItem[]> {
    const rows = await db
      .from('users as u')
      .leftJoin('photos as p', 'p.user_id', 'u.id')
      .whereNotNull('u.deleted_at')
      .groupBy('u.id')
      .orderBy('u.deleted_at', 'desc')
      .select('u.id', 'u.name', 'u.email', 'u.role', 'u.provider', 'u.created_at', 'u.deleted_at')
      .count('p.id as pending_photos')

    return rows.map((row: any) => ({
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      provider: row.provider ?? null,
      createdAt: new Date(row.created_at).toISOString(),
      deletedAt: new Date(row.deleted_at).toISOString(),
      pendingPhotosCount: Number(row.pending_photos ?? 0),
    }))
  }

  /**
   * Toggle user active status
   */
  static async toggleActive(userId: number): Promise<{ isActive: boolean }> {
    const user = await User.findOrFail(userId)
    user.isActive = !user.isActive
    await user.save()
    return { isActive: user.isActive }
  }

  /**
   * Soft-delete a user and hard-delete all their photos at once (escritorio: sin ventana de
   * retención). The user row and its data are purged by the next deletion pass.
   */
  static async deleteUser(userId: number): Promise<void> {
    const user = await User.findOrFail(userId)

    if (user.role === 'admin') {
      throw new Error('Cannot delete admin users')
    }

    const photos = await db
      .from('photos')
      .where('user_id', userId)
      .select('id', 'user_id', 'name', 'thumbnail_name', 'analyzer_process_id')

    user.deletedAt = DateTime.now()
    user.isActive = false
    await user.save()

    await db.from('photos').where('user_id', userId).update({ deleted_at: new Date() })
    const result = await PhotoDeletionService.hardDeletePhotosInBatches(
      photos,
      false,
      'AdminDeleteUser -> ImmediateDelete'
    )

    logger.info(
      '[AdminDeleteUser] Deleted photos=%d errors=%d',
      result.deletedIds.length,
      result.totalErrors
    )
  }

  /**
   * Update user usage credits  /**
   * Update user usage credits (analyzedPhotosLimit and creditsAvailable)
   */
  static async updateUsage(
    userId: number,
    updates: { analyzedPhotosLimit?: number; creditsAvailable?: number }
  ): Promise<Record<string, any>> {
    const user = await User.findOrFail(userId)

    const usage = user.usage ?? {
      photosLimit: 500,
      analyzedPhotosLimit: 500,
      creditsAvailable: 1000,
      creditsUsed: 0,
      analyzedPhotosUsed: 0,
    }

    if (updates.analyzedPhotosLimit !== undefined) {
      usage.analyzedPhotosLimit = updates.analyzedPhotosLimit
    }
    if (updates.creditsAvailable !== undefined) {
      usage.creditsAvailable = updates.creditsAvailable
    }

    user.usage = usage
    await user.save()

    return usage
  }

  /**
   * Mark a user's photos as reviewed (sets photos_reviewed_at to now)
   */
  static async markPhotosReviewed(userId: number): Promise<{ photosReviewedAt: string }> {
    const user = await User.findOrFail(userId)
    user.photosReviewedAt = DateTime.now()
    await user.save()
    return { photosReviewedAt: user.photosReviewedAt.toISO()! }
  }

  /**
   * Get all non-deleted photos for a user with their thumbnailUrl
   */
  static async getPhotos(userId: number): Promise<
    {
      id: number
      thumbnailUrl: string
      originalFileName: string | null
      status: 'processed' | 'uploaded'
    }[]
  > {
    const photos = await Photo.query()
      .where('user_id', userId)
      .whereNull('deleted_at')
      .select('id', 'thumbnail_name', 'original_file_name', 'analyzer_process_id')
      .orderBy('id', 'desc')

    return photos.map((p: any) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
      originalFileName: p.originalFileName ?? null,
      status: p.analyzerProcessId ? 'processed' : 'uploaded',
    }))
  }

  /**
   * Materialize Lightroom folder collections for analyzed photos that already
   * carry `descriptions.source.folderPath`. The mirror service is idempotent,
   * so existing collections and photo attachments are reused safely.
   */
  static async materializeLightroomFolders(userId: number): Promise<{
    photoIdsFound: number
    summary: MaterializeSummary
  }> {
    const emptySummary: MaterializeSummary = {
      collectionsCreated: 0,
      collectionsReused: 0,
      photosAttached: 0,
      foldersFound: 0,
    }

    const photos = await Photo.query()
      .where('user_id', userId)
      .whereNull('deleted_at')
      .whereNotNull('analyzer_process_id')
      .whereRaw(
        "CASE WHEN jsonb_typeof(descriptions->'source'->'folderPath') = 'array' THEN jsonb_array_length(descriptions->'source'->'folderPath') > 0 ELSE false END"
      )
      .select('id')

    const photoIds = photos.map((photo) => photo.id)
    if (photoIds.length === 0) {
      return { photoIdsFound: 0, summary: emptySummary }
    }

    const summary = await LightroomFolderMirrorService.materializeForPhotos(userId, photoIds)
    return { photoIdsFound: photoIds.length, summary }
  }


}
