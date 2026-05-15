// @ts-nocheck

import Payment from '#models/payment'
import db from '@adonisjs/lucid/services/db'

type PaymentFilters = {
  page?: number
  limit?: number
  search?: string
  status?: string
  type?: string
  userId?: number | string
}

const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded']
const PAYMENT_TYPES = ['photo_package', 'credits']

export default class AdminPaymentsService {
  private static round(n: number): number {
    return Math.round(Number(n || 0) * 100) / 100
  }

  static async getOverview() {
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    const totalsRow = await db.rawQuery(`
      SELECT
        COUNT(*)::int AS total_payments,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_payments,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_payments,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_payments,
        COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_payments,
        COUNT(DISTINCT user_id) FILTER (WHERE status = 'completed')::int AS paying_users,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'completed'), 0)::float AS net_revenue_eur,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'refunded'), 0)::float AS refunded_eur,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'pending'), 0)::float AS pending_eur,
        COALESCE(AVG(amount_eur) FILTER (WHERE status = 'completed'), 0)::float AS avg_order_eur,
        COALESCE(SUM(analyzed_photos_granted) FILTER (WHERE status = 'completed'), 0)::int AS analyzed_photos_granted,
        COALESCE(SUM(credits_granted) FILTER (WHERE status = 'completed'), 0)::int AS credits_granted
      FROM payments
    `)

    const periodRows = await db.rawQuery(
      `
      SELECT
        COALESCE(SUM(amount_eur) FILTER (
          WHERE status = 'completed' AND created_at >= ? AND created_at < ?
        ), 0)::float AS this_month_revenue_eur,
        COALESCE(SUM(amount_eur) FILTER (
          WHERE status = 'completed' AND created_at >= ? AND created_at < ?
        ), 0)::float AS last_month_revenue_eur
      FROM payments
    `,
      [
        thisMonthStart.toISOString(),
        nextMonthStart.toISOString(),
        lastMonthStart.toISOString(),
        thisMonthStart.toISOString(),
      ]
    )

    const statusRows = await db.rawQuery(`
      SELECT
        status,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount_eur), 0)::float AS amount_eur
      FROM payments
      GROUP BY status
      ORDER BY count DESC
    `)

    const typeRows = await db.rawQuery(`
      SELECT
        type,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'completed'), 0)::float AS revenue_eur,
        COALESCE(SUM(analyzed_photos_granted) FILTER (WHERE status = 'completed'), 0)::int AS analyzed_photos_granted,
        COALESCE(SUM(credits_granted) FILTER (WHERE status = 'completed'), 0)::int AS credits_granted
      FROM payments
      GROUP BY type
      ORDER BY revenue_eur DESC
    `)

    const monthlyRows = await db.rawQuery(
      `
      SELECT
        to_char(created_at, 'YYYY-MM') AS month,
        type,
        COUNT(*)::int AS count,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'completed'), 0)::float AS revenue_eur,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'refunded'), 0)::float AS refunded_eur
      FROM payments
      WHERE created_at >= ?
      GROUP BY month, type
      ORDER BY month
    `,
      [twelveMonthsAgo.toISOString()]
    )

    const monthlyMap: Record<string, any> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = { month: key, revenueEur: 0, refundedEur: 0, count: 0, byType: {} }
    }

    for (const row of monthlyRows.rows) {
      if (!monthlyMap[row.month]) continue
      monthlyMap[row.month].revenueEur += Number(row.revenue_eur || 0)
      monthlyMap[row.month].refundedEur += Number(row.refunded_eur || 0)
      monthlyMap[row.month].count += Number(row.count || 0)
      monthlyMap[row.month].byType[row.type] = this.round(
        (monthlyMap[row.month].byType[row.type] || 0) + Number(row.revenue_eur || 0)
      )
    }

    const topUserRows = await db.rawQuery(`
      SELECT
        p.user_id,
        u.name,
        u.email,
        COUNT(*)::int AS payment_count,
        COALESCE(SUM(p.amount_eur) FILTER (WHERE p.status = 'completed'), 0)::float AS revenue_eur,
        COALESCE(SUM(p.amount_eur) FILTER (WHERE p.status = 'refunded'), 0)::float AS refunded_eur,
        MAX(p.created_at) AS last_payment_at
      FROM payments p
      LEFT JOIN users u ON u.id = p.user_id
      GROUP BY p.user_id, u.name, u.email
      ORDER BY revenue_eur DESC, payment_count DESC
      LIMIT 15
    `)

    const totals = totalsRow.rows[0] || {}
    const periods = periodRows.rows[0] || {}
    const thisMonthRevenue = Number(periods.this_month_revenue_eur || 0)
    const lastMonthRevenue = Number(periods.last_month_revenue_eur || 0)

    return {
      totals: {
        totalPayments: Number(totals.total_payments || 0),
        completedPayments: Number(totals.completed_payments || 0),
        pendingPayments: Number(totals.pending_payments || 0),
        failedPayments: Number(totals.failed_payments || 0),
        refundedPayments: Number(totals.refunded_payments || 0),
        payingUsers: Number(totals.paying_users || 0),
        netRevenueEur: this.round(totals.net_revenue_eur),
        refundedEur: this.round(totals.refunded_eur),
        pendingEur: this.round(totals.pending_eur),
        thisMonthRevenueEur: this.round(thisMonthRevenue),
        lastMonthRevenueEur: this.round(lastMonthRevenue),
        monthOverMonthPct:
          lastMonthRevenue > 0
            ? this.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
            : null,
        avgOrderEur: this.round(totals.avg_order_eur),
        analyzedPhotosGranted: Number(totals.analyzed_photos_granted || 0),
        creditsGranted: Number(totals.credits_granted || 0),
      },
      monthly: Object.values(monthlyMap).map((m: any) => ({
        ...m,
        revenueEur: this.round(m.revenueEur),
        refundedEur: this.round(m.refundedEur),
      })),
      byStatus: PAYMENT_STATUSES.map((status) => {
        const row = statusRows.rows.find((r: any) => r.status === status)
        return {
          status,
          count: Number(row?.count || 0),
          amountEur: this.round(row?.amount_eur),
        }
      }),
      byType: PAYMENT_TYPES.map((type) => {
        const row = typeRows.rows.find((r: any) => r.type === type)
        return {
          type,
          count: Number(row?.count || 0),
          revenueEur: this.round(row?.revenue_eur),
          analyzedPhotosGranted: Number(row?.analyzed_photos_granted || 0),
          creditsGranted: Number(row?.credits_granted || 0),
        }
      }),
      topUsers: topUserRows.rows.map((row: any) => ({
        id: Number(row.user_id),
        name: row.name || 'Deleted user',
        email: row.email || '—',
        paymentCount: Number(row.payment_count || 0),
        revenueEur: this.round(row.revenue_eur),
        refundedEur: this.round(row.refunded_eur),
        lastPaymentAt: row.last_payment_at ? new Date(row.last_payment_at).toISOString() : null,
      })),
    }
  }

  static async list(filters: PaymentFilters = {}) {
    const page = Math.max(Number(filters.page || 1), 1)
    const limit = Math.min(Math.max(Number(filters.limit || 30), 1), 100)

    const countQuery = db.from('payments as p').leftJoin('users as u', 'u.id', 'p.user_id')
    this.applyFilters(countQuery, filters)
    const countRow = await countQuery.count('* as total').first()
    const total = Number(countRow?.total || 0)

    const query = db
      .from('payments as p')
      .leftJoin('users as u', 'u.id', 'p.user_id')
      .select(
        'p.id',
        'p.user_id',
        'u.name as user_name',
        'u.email as user_email',
        'p.stripe_session_id',
        'p.stripe_payment_intent_id',
        'p.type',
        'p.package_id',
        'p.stripe_price_id',
        'p.stripe_product_id',
        'p.product_name',
        'p.analyzed_photos_granted',
        'p.credits_granted',
        'p.amount_eur',
        'p.status',
        'p.created_at',
        'p.updated_at'
      )
      .orderBy('p.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)

    this.applyFilters(query, filters)

    const rows = await query

    return {
      payments: rows.map((row: any) => this.serializePaymentRow(row)),
      meta: {
        total,
        perPage: limit,
        currentPage: page,
        lastPage: Math.max(Math.ceil(total / limit), 1),
      },
    }
  }

  static async getUserSummary(userId: number) {
    const totalsRow = await db.rawQuery(
      `
      SELECT
        COUNT(*)::int AS total_payments,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_payments,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_payments,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_payments,
        COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_payments,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'completed'), 0)::float AS total_paid_eur,
        COALESCE(SUM(amount_eur) FILTER (WHERE status = 'refunded'), 0)::float AS refunded_eur,
        COALESCE(SUM(analyzed_photos_granted) FILTER (WHERE status = 'completed'), 0)::int AS analyzed_photos_granted,
        COALESCE(SUM(credits_granted) FILTER (WHERE status = 'completed'), 0)::int AS credits_granted,
        MAX(created_at) AS last_payment_at
      FROM payments
      WHERE user_id = ?
    `,
      [userId]
    )

    const recent = await Payment.query()
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(8)
    const totals = totalsRow.rows[0] || {}

    return {
      totalPayments: Number(totals.total_payments || 0),
      completedPayments: Number(totals.completed_payments || 0),
      pendingPayments: Number(totals.pending_payments || 0),
      failedPayments: Number(totals.failed_payments || 0),
      refundedPayments: Number(totals.refunded_payments || 0),
      totalPaidEur: this.round(totals.total_paid_eur),
      refundedEur: this.round(totals.refunded_eur),
      analyzedPhotosGranted: Number(totals.analyzed_photos_granted || 0),
      creditsGranted: Number(totals.credits_granted || 0),
      lastPaymentAt: totals.last_payment_at ? new Date(totals.last_payment_at).toISOString() : null,
      recent: recent.map((payment) => ({
        id: payment.id,
        type: payment.type,
        status: payment.status,
        productName: payment.productName,
        amountEur: this.round(payment.amountEur),
        analyzedPhotosGranted: payment.analyzedPhotosGranted,
        creditsGranted: payment.creditsGranted,
        createdAt: payment.createdAt.toISO(),
      })),
    }
  }

  private static applyFilters(query: any, filters: PaymentFilters) {
    if (filters.status && PAYMENT_STATUSES.includes(filters.status)) {
      query.where('p.status', filters.status)
    }

    if (filters.type && PAYMENT_TYPES.includes(filters.type)) {
      query.where('p.type', filters.type)
    }

    if (filters.userId) {
      query.where('p.user_id', Number(filters.userId))
    }

    if (filters.search) {
      const term = `%${filters.search}%`
      query.where((q: any) => {
        q.where('u.name', 'ilike', term)
          .orWhere('u.email', 'ilike', term)
          .orWhere('p.product_name', 'ilike', term)
          .orWhere('p.stripe_session_id', 'ilike', term)
          .orWhere('p.stripe_payment_intent_id', 'ilike', term)
      })
    }
  }

  private static serializePaymentRow(row: any) {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      userName: row.user_name || 'Deleted user',
      userEmail: row.user_email || '—',
      stripeSessionId: row.stripe_session_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      type: row.type,
      packageId: row.package_id,
      stripePriceId: row.stripe_price_id,
      stripeProductId: row.stripe_product_id,
      productName: row.product_name,
      analyzedPhotosGranted: Number(row.analyzed_photos_granted || 0),
      creditsGranted: Number(row.credits_granted || 0),
      amountEur: this.round(row.amount_eur),
      status: row.status,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    }
  }
}
