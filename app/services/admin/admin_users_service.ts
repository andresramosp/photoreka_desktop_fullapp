import User from '#models/user'
import Photo from '#models/photo'
import AdminPaymentsService from '#services/admin/admin_payments_service'
import PhotoDeletionService from '#services/photo_deletion_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3'
import logger from '@adonisjs/core/services/logger'

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
}

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
  totalCostEur: number
  usage: Record<string, any> | null
  contentViolations: Record<string, any>[] | null
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
    // Subquery for photo counts per user
    const photoCountsSub = db
      .from('photos')
      .select('user_id')
      .count('* as photos_count')
      .whereNull('deleted_at')
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

    // Get photo counts in one query
    const photoCounts = await photoCountsSub
    const countsMap = new Map<number, number>()
    for (const row of photoCounts) {
      countsMap.set(row.user_id, Number(row.photos_count))
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
      totalCostEur: costMap.get(u.id) ?? 0,
      usage: u.usage,
      photosReviewedAt: u.photosReviewedAt?.toISO() ?? null,
      contentViolations: u.contentViolations ?? null,
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
    const paymentSummary = await AdminPaymentsService.getUserSummary(userId)

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
      totalCostEur,
      usage: user.usage,
      costSummary,
      avatar: user.avatar,
      googleId: user.googleId,
      catalogPatterns: user.catalogPatterns,
      paymentSummary,
      photosReviewedAt: user.photosReviewedAt?.toISO() ?? null,
      contentViolations: user.contentViolations ?? null,
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
   * If runSchedulerNow is true, immediately triggers photo physical deletion and user hard-delete
   * instead of waiting for the scheduled run.
   */
  static async deleteUser(userId: number, runSchedulerNow: boolean = false): Promise<void> {
    const user = await User.findOrFail(userId)

    if (user.role === 'admin') {
      throw new Error('Cannot delete admin users')
    }

    const now = new Date()

    // Fetch photo file names for R2 cleanup (all photos, including already soft-deleted)
    const photos = await db.from('photos').where('user_id', userId).select('name', 'thumbnail_name')

    // Delete files from R2
    const objectsToDelete: { Key: string }[] = []
    for (const p of photos) {
      if (p.name) objectsToDelete.push({ Key: p.name })
      if (p.thumbnail_name) objectsToDelete.push({ Key: p.thumbnail_name })
    }
    if (objectsToDelete.length > 0) {
      s3.send(
        new DeleteObjectsCommand({
          Bucket: process.env.R2_BUCKET,
          Delete: { Objects: objectsToDelete, Quiet: true },
        })
      ).catch((err) => {
        logger.warn('[AdminDeleteUser] Failed to delete R2 objects: %o', err)
      })
    }

    await db
      .from('photos')
      .where('user_id', userId)
      .whereNull('deleted_at')
      .update({ deleted_at: now })

    // Soft-delete the user
    user.deletedAt = DateTime.fromJSDate(now)
    user.isActive = false
    await user.save()

    if (runSchedulerNow) {
      PhotoDeletionService.deletePhysically().catch((err) => {
        logger.error('[AdminDeleteUser] Immediate scheduler run failed: %o', err)
      })
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
  static async getPhotos(
    userId: number
  ): Promise<{ id: number; thumbnailUrl: string; originalFileName: string | null }[]> {
    const photos = await Photo.query()
      .where('user_id', userId)
      .whereNull('deleted_at')
      .select('id', 'thumbnail_name', 'original_file_name')
      .orderBy('id', 'desc')

    return photos.map((p: any) => ({
      id: p.id,
      thumbnailUrl: p.thumbnailUrl,
      originalFileName: p.originalFileName ?? null,
    }))
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
        'created_at'
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
