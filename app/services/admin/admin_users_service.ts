import User from '#models/user'
import Photo from '#models/photo'
import db from '@adonisjs/lucid/services/db'

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
  createdAt: string
  updatedAt: string
  // Computed
  photosCount: number
  totalCostEur: number
  usage: Record<string, any> | null
  costHistory: Record<string, any> | null
}

export interface AdminUserDetail extends AdminUserListItem {
  avatar: string | null
  googleId: string | null
  catalogPatterns: Record<string, any> | null
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
      totalCostEur: u.costHistory?.totalCostInEur ?? 0,
      usage: u.usage,
      costHistory: u.costHistory,
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
      totalCostEur: user.costHistory?.totalCostInEur ?? 0,
      usage: user.usage,
      costHistory: user.costHistory,
      avatar: user.avatar,
      googleId: user.googleId,
      catalogPatterns: user.catalogPatterns,
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
   * Delete a user and their associated data
   */
  static async deleteUser(userId: number): Promise<void> {
    const user = await User.findOrFail(userId)

    if (user.role === 'admin') {
      throw new Error('Cannot delete admin users')
    }

    // Soft-delete photos
    const deletedAt = new Date()
    db.from('photos').where('user_id', userId).update({ deleted_at: deletedAt })

    // Delete the user
    await user.delete()
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
}
