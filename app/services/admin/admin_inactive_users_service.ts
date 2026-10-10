import User from '#models/user'
import MailService from '#services/mail_service'
import { NO_ACTIVITY_EMAILS } from '#config/no_activity_emails'
import { inactivityDeletionNoticeTemplate } from '../../utils/email_templates.js'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'

/**
 * Policy for cleaning up abandoned free accounts. Mirrored in the Terms of
 * Service / Privacy Policy (landing) — keep both in sync if these change.
 */
export const INACTIVITY_CLEANUP_POLICY = {
  inactiveMonths: 4,
  /** Strictly more than this many live photos. */
  minPhotos: 10,
  /** Days between the notice email and the deletion. */
  graceDays: 30,
}

/**
 * TEMPORARY: while set, every notice goes to this address instead of the user.
 * Set to null to send notices to the real users.
 */
const NOTICE_RECIPIENT_OVERRIDE: string | null = null

export interface UserActivitySignals {
  lastActivityAt: DateTime | null
  hasPaid: boolean
}

export type NoticeSkipReason =
  | 'not_found'
  | 'admin'
  | 'untracked'
  | 'paid'
  | 'recently_active'
  | 'few_photos'
  | 'already_notified'

export type CleanupStatus = 'candidate' | 'notified' | 'ready' | null

export interface NoticeResult {
  sent: number[]
  skipped: { userId: number; reason: NoticeSkipReason }[]
  failed: { userId: number; error: string }[]
}

export default class AdminInactiveUsersService {
  /**
   * Last activity (logged actions + API token usage) and paid status per user.
   * Impersonation tokens are ignored so an admin peeking at an account does not
   * make it look active.
   */
  static async getActivitySignals(userIds?: number[]): Promise<Map<number, UserActivitySignals>> {
    const filter = userIds ? 'AND u.id = ANY(?)' : ''
    const result = await db.rawQuery(
      `
      SELECT u.id,
             GREATEST(u.created_at, a.last_activity, t.last_token_use) AS last_activity_at,
             EXISTS (
               SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'
             ) AS has_paid
      FROM users u
      LEFT JOIN (
        SELECT user_id, MAX(created_at) AS last_activity
        FROM user_activities
        GROUP BY user_id
      ) a ON a.user_id = u.id
      LEFT JOIN (
        SELECT tokenable_id, MAX(last_used_at) AS last_token_use
        FROM auth_access_tokens
        WHERE name IS DISTINCT FROM 'impersonation'
        GROUP BY tokenable_id
      ) t ON t.tokenable_id = u.id
      WHERE u.deleted_at IS NULL ${filter}
      `,
      userIds ? [userIds] : []
    )

    const map = new Map<number, UserActivitySignals>()
    for (const row of result.rows) {
      map.set(row.id, {
        lastActivityAt: row.last_activity_at
          ? DateTime.fromJSDate(new Date(row.last_activity_at))
          : null,
        hasPaid: Boolean(row.has_paid),
      })
    }
    return map
  }

  /**
   * A notice only counts while the user has stayed away since it was sent:
   * any activity afterwards cancels the pending deletion.
   */
  static isNoticePending(noticeSentAt: DateTime | null, lastActivityAt: DateTime | null): boolean {
    if (!noticeSentAt) return false
    return !lastActivityAt || lastActivityAt <= noticeSentAt
  }

  static getSkipReason(
    user: User,
    photosCount: number,
    signals: UserActivitySignals | undefined
  ): NoticeSkipReason | null {
    if (user.role === 'admin') return 'admin'
    // Activity for these accounts is never logged, so they always look idle.
    if (NO_ACTIVITY_EMAILS.has(user.email)) return 'untracked'
    if (signals?.hasPaid) return 'paid'

    const cutoff = DateTime.now().minus({ months: INACTIVITY_CLEANUP_POLICY.inactiveMonths })
    const lastActivityAt = signals?.lastActivityAt ?? user.createdAt
    if (lastActivityAt > cutoff) return 'recently_active'

    if (photosCount <= INACTIVITY_CLEANUP_POLICY.minPhotos) return 'few_photos'
    if (this.isNoticePending(user.inactivityNoticeSentAt, lastActivityAt)) return 'already_notified'
    return null
  }

  /**
   * Where the user stands in the cleanup flow:
   * - candidate: eligible, not warned yet
   * - notified: warned, grace period still running
   * - ready: warned, grace period over and no activity since → can be deleted
   */
  static getCleanupStatus(
    user: User,
    photosCount: number,
    signals: UserActivitySignals | undefined
  ): CleanupStatus {
    const skipReason = this.getSkipReason(user, photosCount, signals)
    if (skipReason === null) return 'candidate'
    if (skipReason !== 'already_notified') return null

    const graceEndsAt = user.inactivityNoticeSentAt!.plus({
      days: INACTIVITY_CLEANUP_POLICY.graceDays,
    })
    return graceEndsAt <= DateTime.now() ? 'ready' : 'notified'
  }

  /**
   * Email each eligible user that their account will be deleted after the grace
   * period. Eligibility is re-checked here so the admin UI can never notify a
   * paying or recently active user by mistake.
   */
  static async sendDeletionNotices(userIds: number[]): Promise<NoticeResult> {
    const result: NoticeResult = { sent: [], skipped: [], failed: [] }
    if (userIds.length === 0) return result

    const users = await User.query().whereIn('id', userIds)
    const usersById = new Map(users.map((u) => [u.id, u]))
    const signals = await this.getActivitySignals(userIds)

    const photoRows = await db
      .from('photos')
      .select('user_id')
      .count('* as total')
      .whereIn('user_id', userIds)
      .whereNull('deleted_at')
      .groupBy('user_id')
    const photoCounts = new Map<number, number>(
      photoRows.map((row: any) => [row.user_id, Number(row.total)])
    )

    const mailService = new MailService()
    const deletionDate = DateTime.now().plus({ days: INACTIVITY_CLEANUP_POLICY.graceDays })
    const loginUrl = process.env.FRONTEND_URL || 'https://app.photoreka.com'

    for (const userId of userIds) {
      const user = usersById.get(userId)
      if (!user) {
        result.skipped.push({ userId, reason: 'not_found' })
        continue
      }

      const photosCount = photoCounts.get(userId) ?? 0
      const userSignals = signals.get(userId)
      const skipReason = this.getSkipReason(user, photosCount, userSignals)
      if (skipReason) {
        result.skipped.push({ userId, reason: skipReason })
        continue
      }

      try {
        await mailService.sendEmail({
          from: 'Photoreka <hello@photoreka.com>',
          to: NOTICE_RECIPIENT_OVERRIDE ?? user.email,
          subject: `Your Photoreka account will be deleted on ${deletionDate.toFormat('MMMM d, yyyy')}`,
          body: inactivityDeletionNoticeTemplate(user.name, {
            lastActivityAt: (userSignals?.lastActivityAt ?? user.createdAt).toFormat('MMMM yyyy'),
            photosCount,
            deletionDate: deletionDate.toFormat('MMMM d, yyyy'),
            inactiveMonths: INACTIVITY_CLEANUP_POLICY.inactiveMonths,
            loginUrl,
          }),
        })
        user.inactivityNoticeSentAt = DateTime.now()
        await user.save()
        result.sent.push(userId)
      } catch (error) {
        logger.error('[InactivityNotice] Failed to notify user %d: %o', userId, error)
        result.failed.push({ userId, error: (error as Error).message })
      }
    }

    logger.info(
      '[InactivityNotice] sent=%d skipped=%d failed=%d',
      result.sent.length,
      result.skipped.length,
      result.failed.length
    )
    return result
  }
}
