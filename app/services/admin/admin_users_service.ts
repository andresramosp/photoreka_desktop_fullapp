import User from '#models/user'
import Photo from '#models/photo'
import PhotoManager from '../../managers/photo_manager.js'
import AdminPaymentsService from '#services/admin/admin_payments_service'
import AdminInactiveUsersService from '#services/admin/admin_inactive_users_service'
import type { CleanupStatus } from '#services/admin/admin_inactive_users_service'
import PhotoDeletionService from '#services/photo_deletion_service'
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import LightroomFolderMirrorService from '#services/lightroom_folder_mirror_service'
import type { MaterializeSummary } from '#services/lightroom_folder_mirror_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

function parseEnvNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  const cleaned = value.replace(/^["']|["']$/g, '')
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

const PHOTO_DELETION_RETENTION_DAYS = parseEnvNumber(process.env.PHOTO_DELETION_RETENTION_DAYS, 7)

export interface CreditLedgerRow {
  id: number
  category: string
  task: string | null
  model: string | null
  costInEur: number
  creditsCharged: number
  marginMultiplier: number | null
  referenceId: string | null
  createdAt: string
  isFree: boolean
  creditsWaived: number | null
}

export interface AdminUserListItem {
  id: number
  name: string
  email: string
  role: string
  isActive: boolean
  provider: string | null
  preferredSource: string | null
  profiles: string | null
  emailConfirmedAt: string | null
  photosReviewedAt: string | null
  createdAt: string
  updatedAt: string
  // Computed
  photosCount: number
  /** Fotos totalmente analizadas (mismo criterio que PhotoManager.onlyProcessed) */
  analyzedPhotosCount: number
  /** Fotos subidas al lightbox que todavía no han pasado por un análisis real */
  lightboxPhotosCount: number
  deletedPhotosCount: number
  totalCostEur: number
  usage: Record<string, any> | null
  contentViolations: Record<string, any>[] | null
  /** Latest logged action or API token use (falls back to createdAt) */
  lastActivityAt: string | null
  /** Has at least one completed payment */
  hasPaid: boolean
  inactivityNoticeSentAt: string | null
  /** Position in the inactive-account cleanup flow (null = not concerned) */
  cleanupStatus: CleanupStatus
}

export interface AdminUserDetail extends AdminUserListItem {
  costSummary: {
    totalCostEur: number
    byCategory: Record<string, { costInEur: number; calls: number }>
  } | null
  avatar: string | null
  googleId: string | null
  catalogPatterns: Record<string, any> | null
  paymentSummary: Record<string, any>
}

export default class AdminUsersService {
  /**
   * List all users with basic stats
   */
  static async list(filters?: {
    search?: string
    role?: string
    isActive?: string
    provider?: string
    sortBy?: string
    sortDir?: string
  }): Promise<AdminUserListItem[]> {
    // Fotos vivas por usuario y, de esas, las totalmente analizadas. Lo que no está
    // analizado es justo lo que el usuario ve en el lightbox.
    const photoCountsSub = db
      .from('photos')
      .select('user_id')
      .count('* as photos_count')
      .whereNull('deleted_at')
      .groupBy('user_id')

    const analyzedCountsSub = new PhotoManager()
      .onlyProcessed(Photo.query().whereNull('deleted_at'))
      .select('user_id')
      .count('* as analyzed_count')
      .groupBy('user_id')

    const deletedCountsSub = db
      .from('photos')
      .select('user_id')
      .count('* as deleted_count')
      .whereNotNull('deleted_at')
      .groupBy('user_id')

    let query = User.query().orderBy('created_at', 'desc')

    if (filters?.search) {
      const term = `%${filters.search}%`
      query = query.where((q) => {
        q.whereILike('name', term).orWhereILike('email', term)
      })
    }

    if (filters?.role) {
      query = query.where('role', filters.role)
    }

    if (filters?.isActive !== undefined && filters.isActive !== '') {
      query = query.where('isActive', filters.isActive === 'true')
    }

    if (filters?.provider) {
      query = query.where('provider', filters.provider)
    }

    if (filters?.sortBy) {
      const dir = (filters.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
      query = query.orderBy(filters.sortBy, dir)
    }

    const users = await query

    const photoCounts = await photoCountsSub
    const countsMap = new Map<number, number>()
    for (const row of photoCounts) {
      countsMap.set(row.user_id, Number(row.photos_count))
    }

    const analyzedCounts = await analyzedCountsSub
    const analyzedMap = new Map<number, number>()
    for (const row of analyzedCounts) {
      analyzedMap.set(row.userId, Number(row.$extras.analyzed_count))
    }

    const deletedCounts = await deletedCountsSub
    const deletedMap = new Map<number, number>()
    for (const row of deletedCounts) {
      deletedMap.set(row.user_id, Number(row.deleted_count))
    }

    // Get total cost per user from cost_logs
    const costRows = await db.rawQuery(`
      SELECT user_id, COALESCE(SUM(cost_in_eur), 0)::float AS total_cost
      FROM cost_logs
      GROUP BY user_id
    `)
    const costMap = new Map<number, number>()
    for (const row of costRows.rows) {
      costMap.set(row.user_id, row.total_cost)
    }

    const signalsMap = await AdminInactiveUsersService.getActivitySignals()

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      provider: u.provider,
      preferredSource: u.preferredSource,
      profiles: u.profiles,
      emailConfirmedAt: u.emailConfirmedAt?.toISO() ?? null,
      createdAt: u.createdAt.toISO()!,
      updatedAt: u.updatedAt.toISO()!,
      photosCount: countsMap.get(u.id) || 0,
      analyzedPhotosCount: analyzedMap.get(u.id) || 0,
      lightboxPhotosCount: (countsMap.get(u.id) || 0) - (analyzedMap.get(u.id) || 0),
      deletedPhotosCount: deletedMap.get(u.id) || 0,
      totalCostEur: costMap.get(u.id) ?? 0,
      usage: u.usage,
      photosReviewedAt: u.photosReviewedAt?.toISO() ?? null,
      contentViolations: u.contentViolations ?? null,
      lastActivityAt: signalsMap.get(u.id)?.lastActivityAt?.toISO() ?? null,
      hasPaid: signalsMap.get(u.id)?.hasPaid ?? false,
      inactivityNoticeSentAt: u.inactivityNoticeSentAt?.toISO() ?? null,
      cleanupStatus: AdminInactiveUsersService.getCleanupStatus(
        u,
        countsMap.get(u.id) || 0,
        signalsMap.get(u.id)
      ),
    }))
  }

  /**
   * Get a single user with full detail
   */
  static async getDetail(userId: number): Promise<AdminUserDetail | null> {
    const user = await User.find(userId)
    if (!user) return null

    const photosCountResult = await Photo.query()
      .where('userId', userId)
      .whereNull('deletedAt')
      .count('* as total')
    const photosCount = Number(photosCountResult[0]?.$extras.total || 0)

    const analyzedCountResult = await new PhotoManager()
      .onlyProcessed(Photo.query().where('userId', userId).whereNull('deletedAt'))
      .count('* as total')
    const analyzedPhotosCount = Number(analyzedCountResult[0]?.$extras.total || 0)
    const lightboxPhotosCount = photosCount - analyzedPhotosCount

    const deletedCountResult = await db
      .from('photos')
      .where('user_id', userId)
      .whereNotNull('deleted_at')
      .count('* as total')
    const deletedPhotosCount = Number(deletedCountResult[0]?.total || 0)
    const paymentSummary = await AdminPaymentsService.getUserSummary(userId)
    const signalsMap = await AdminInactiveUsersService.getActivitySignals([userId])
    const signals = signalsMap.get(userId)

    // Compute cost summary from cost_logs
    const costRows = await db.rawQuery(
      `SELECT category,
              COALESCE(SUM(cost_in_eur), 0)::float AS cost_eur,
              COALESCE(SUM(calls), 0)::int AS calls
       FROM cost_logs
       WHERE user_id = ?
       GROUP BY category`,
      [userId]
    )
    const byCategory: Record<string, { costInEur: number; calls: number }> = {}
    let totalCostEur = 0
    for (const row of costRows.rows) {
      byCategory[row.category] = { costInEur: row.cost_eur, calls: row.calls }
      totalCostEur += row.cost_eur
    }
    const costSummary = totalCostEur > 0 ? { totalCostEur, byCategory } : null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      provider: user.provider,
      preferredSource: user.preferredSource,
      profiles: user.profiles,
      emailConfirmedAt: user.emailConfirmedAt?.toISO() ?? null,
      createdAt: user.createdAt.toISO()!,
      updatedAt: user.updatedAt.toISO()!,
      photosCount,
      analyzedPhotosCount,
      lightboxPhotosCount,
      deletedPhotosCount,
      totalCostEur,
      usage: user.usage,
      costSummary,
      avatar: user.avatar,
      googleId: user.googleId,
      catalogPatterns: user.catalogPatterns,
      paymentSummary,
      photosReviewedAt: user.photosReviewedAt?.toISO() ?? null,
      contentViolations: user.contentViolations ?? null,
      lastActivityAt: signals?.lastActivityAt?.toISO() ?? null,
      hasPaid: signals?.hasPaid ?? false,
      inactivityNoticeSentAt: user.inactivityNoticeSentAt?.toISO() ?? null,
      cleanupStatus: AdminInactiveUsersService.getCleanupStatus(user, photosCount, signals),
    }
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
   * Soft-delete a user and their photos.
   * If runSchedulerNow is true, immediately hard-deletes every processed photo of
   * the user (including ones they had already soft-deleted) and purges the user
   * row and its dependent data, instead of waiting for the retention scheduler.
   */
  static async deleteUser(userId: number, runSchedulerNow: boolean = false): Promise<void> {
    const user = await User.findOrFail(userId)

    if (user.role === 'admin') {
      throw new Error('Cannot delete admin users')
    }

    const now = new Date()

    const photos = await db
      .from('photos')
      .where('user_id', userId)
      .select('id', 'name', 'thumbnail_name', 'analyzer_process_id', 'deleted_at')

    const uploadedPhotos = photos.filter((photo) => !photo.analyzer_process_id)
    const processedPhotoIds = photos
      .filter((photo) => Boolean(photo.analyzer_process_id) && !photo.deleted_at)
      .map((photo) => photo.id)

    const uploadedDeleteResult = await PhotoDeletionService.hardDeletePhotosInBatches(
      uploadedPhotos,
      false,
      'AdminDeleteUser -> UploadedImmediateDelete'
    )

    if (processedPhotoIds.length > 0) {
      await db.from('photos').whereIn('id', processedPhotoIds).update({ deleted_at: now })
      logger.info(
        '[AdminDeleteUser] Scheduled processed photo IDs for hard delete after retention window: %o',
        processedPhotoIds
      )
    }

    logger.info(
      '[AdminDeleteUser] Immediate uploaded deletions=%d processed scheduled=%d immediate errors=%d',
      uploadedDeleteResult.deletedIds.length,
      processedPhotoIds.length,
      uploadedDeleteResult.totalErrors
    )

    // Soft-delete the user
    user.deletedAt = DateTime.fromJSDate(now)
    user.isActive = false
    await user.save()

    if (runSchedulerNow) {
      try {
        const immediatePurgeResult = await PhotoDeletionService.deleteSoftDeletedPhotosNow(
          photos.filter((photo) => Boolean(photo.analyzer_process_id)).map((photo) => photo.id)
        )

        logger.info(
          '[AdminDeleteUser] Immediate processed purge found=%d deleted=%d errors=%d',
          immediatePurgeResult.totalFound,
          immediatePurgeResult.totalDeleted,
          immediatePurgeResult.totalErrors
        )
      } catch (err) {
        logger.error('[AdminDeleteUser] Immediate processed purge failed: %o', err)
      }
    }
  }

  /**
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

  /**
   * Get all soft-deleted photos for a user.
   */
  static async getDeletedPhotos(userId: number): Promise<
    {
      id: number
      thumbnailUrl: string | null
      originalFileName: string | null
      deletedAt: string
      retentionEndsAt: string
      timeRemainingMs: number
    }[]
  > {
    const rows = await db
      .from('photos')
      .where('user_id', userId)
      .whereNotNull('deleted_at')
      .select('id', 'thumbnail_name', 'original_file_name', 'deleted_at')
      .orderBy('deleted_at', 'desc')

    const nowMs = DateTime.now().toMillis()

    return rows.map((row: any) => {
      const deletedAtDate =
        row.deleted_at instanceof Date ? row.deleted_at : new Date(row.deleted_at)
      const deletedAt = DateTime.fromJSDate(deletedAtDate)
      const retentionEndsAt = deletedAt.plus({ days: PHOTO_DELETION_RETENTION_DAYS })
      const timeRemainingMs = Math.max(0, retentionEndsAt.toMillis() - nowMs)
      const thumbnailUrl = row.thumbnail_name
        ? `https://${process.env.IMAGES_WORKER}/${row.thumbnail_name}`
        : null

      return {
        id: row.id,
        thumbnailUrl,
        originalFileName: row.original_file_name ?? null,
        deletedAt: deletedAt.toISO()!,
        retentionEndsAt: retentionEndsAt.toISO()!,
        timeRemainingMs,
      }
    })
  }

  /**
   * Restore soft-deleted photos for a user.
   */
  static async restoreDeletedPhotos(
    userId: number,
    ids: number[]
  ): Promise<{ restoredIds: number[]; restoredCount: number }> {
    if (ids.length === 0) {
      return { restoredIds: [], restoredCount: 0 }
    }

    const photos = await db
      .from('photos')
      .where('user_id', userId)
      .whereIn('id', ids)
      .whereNotNull('deleted_at')
      .select('id', 'analyzer_process_id')

    const restoredIds = photos.map((photo: any) => photo.id)
    if (restoredIds.length === 0) {
      return { restoredIds: [], restoredCount: 0 }
    }

    await db.from('photos').whereIn('id', restoredIds).update({ deleted_at: null })

    const analyzedCount = photos.filter((photo: any) => Boolean(photo.analyzer_process_id)).length
    if (analyzedCount > 0) {
      await CacheInvalidationService.onPhotosRestored(String(userId), analyzedCount)
    } else {
      await CacheInvalidationService.onPhotoListChanged(String(userId))
    }

    return { restoredIds, restoredCount: restoredIds.length }
  }

  /**
   * Paginated credit ledger for a user.
   * Returns only rows where credits_charged IS NOT NULL.
   */
  static async getCreditLedger(
    userId: number,
    page: number = 1,
    limit: number = 30,
    filters?: { category?: string; dateFrom?: string; dateTo?: string }
  ): Promise<{
    rows: CreditLedgerRow[]
    meta: { total: number; perPage: number; currentPage: number; lastPage: number }
    summary: { totalCredits: number; totalCostEur: number }
  }> {
    let query = db
      .from('cost_logs')
      .where('user_id', userId)
      .whereNotNull('credits_charged')
      .orderBy('created_at', 'desc')

    if (filters?.category) {
      query = query.where('category', filters.category)
    }
    if (filters?.dateFrom) {
      query = query.where('created_at', '>=', filters.dateFrom)
    }
    if (filters?.dateTo) {
      // Include the full dateTo day
      const endOfDay = DateTime.fromISO(filters.dateTo).endOf('day').toISO()!
      query = query.where('created_at', '<=', endOfDay)
    }

    let summaryQuery = db.from('cost_logs').where('user_id', userId).whereNotNull('credits_charged')

    if (filters?.category) summaryQuery = summaryQuery.where('category', filters.category)
    if (filters?.dateFrom) summaryQuery = summaryQuery.where('created_at', '>=', filters.dateFrom)
    if (filters?.dateTo) {
      summaryQuery = summaryQuery.where(
        'created_at',
        '<=',
        DateTime.fromISO(filters.dateTo).endOf('day').toISO()!
      )
    }

    const [summaryRow] = await summaryQuery
      .clone()
      .sum('credits_charged as total_credits')
      .sum('cost_in_eur as total_cost_eur')

    const total = await summaryQuery.clone().count('* as total').first()

    const totalCount = Number(total?.total ?? 0)
    const lastPage = Math.max(1, Math.ceil(totalCount / limit))
    const offset = (page - 1) * limit

    const rows = await query
      .select(
        'id',
        'category',
        'task',
        'model',
        'cost_in_eur',
        'credits_charged',
        'margin_multiplier',
        'reference_id',
        'created_at',
        'metadata'
      )
      .limit(limit)
      .offset(offset)

    return {
      rows: rows.map((r: any) => ({
        id: r.id,
        category: r.category,
        task: r.task ?? null,
        model: r.model ?? null,
        costInEur: Number(r.cost_in_eur),
        creditsCharged: Number(r.credits_charged),
        marginMultiplier: r.margin_multiplier != null ? Number(r.margin_multiplier) : null,
        referenceId: r.reference_id ?? null,
        createdAt: new Date(r.created_at).toISOString(),
        isFree: r.metadata?.free === true,
        creditsWaived:
          r.metadata?.creditsWaived !== null && r.metadata?.creditsWaived !== undefined
            ? Number(r.metadata.creditsWaived)
            : null,
      })),
      meta: {
        total: totalCount,
        perPage: limit,
        currentPage: page,
        lastPage,
      },
      summary: {
        totalCredits: Number(summaryRow?.total_credits ?? 0),
        totalCostEur: Number(summaryRow?.total_cost_eur ?? 0),
      },
    }
  }
}
