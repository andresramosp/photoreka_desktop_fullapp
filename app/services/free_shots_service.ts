import UsageService from '#services/usage_service'
import type { FreeShotsState } from '#services/usage_service'

/**
 * Tool categories eligible for a daily free allowance ("bolsa gratuita diaria").
 *
 * These are a subset of {@link import('#services/credit_service').CostCategory}
 * and are billed purely by number of uses (shots) per day, regardless of the
 * underlying compute cost.
 */
export type FreeShotCategory =
  | 'SEARCH'
  | 'SEARCH_PRECISE'
  | 'SEARCH_BY_PHOTO'
  | 'CHAT'
  | 'CHAT_KNOWLEDGE_ASSISTANT'

/**
 * Number of free uses granted per category, per user, per day.
 *
 * The whole point of this bag is that it is consumed BEFORE any real credits:
 * while a category still has free shots left, the operation runs without any
 * `canAfford` check and without charging credits (the cost is still recorded
 * for analytics). The bag resets every calendar day (UTC).
 */
export const FREE_DAILY_SHOTS: Record<FreeShotCategory, number> = {
  SEARCH: 2,
  SEARCH_PRECISE: 1,
  SEARCH_BY_PHOTO: 5,
  CHAT: 1,
  CHAT_KNOWLEDGE_ASSISTANT: 5,
}

/** Current day as YYYY-MM-DD (UTC), used to scope and auto-reset the bag daily. */
function currentDay(): string {
  return new Date().toISOString().split('T')[0]
}

/** Return a fresh (or carried-over) bag for today, resetting if the stored day is stale. */
function bagForToday(existing: FreeShotsState | undefined): FreeShotsState {
  const today = currentDay()
  if (!existing || existing.date !== today) {
    return { date: today, used: {} }
  }
  return existing
}

export default class FreeShotsService {
  /**
   * Try to consume one free daily shot for the given category.
   *
   * Returns `true` if a free shot was available and has been consumed (caller
   * should skip credit affordability checks and credit charges), or `false` if
   * the daily allowance is exhausted (caller should fall back to normal billing).
   *
   * The bag lives in the user's `usage` object and resets when the stored day no
   * longer matches today.
   */
  static async tryConsume(userId: number, category: FreeShotCategory): Promise<boolean> {
    const limit = FREE_DAILY_SHOTS[category]
    if (!limit || limit <= 0) return false

    const usage = await UsageService.getBaseUsage(userId)
    if (!usage) return false

    const bag = bagForToday(usage.freeShots)
    const used = bag.used[category] ?? 0
    if (used >= limit) return false

    bag.used[category] = used + 1
    usage.freeShots = bag
    await UsageService.updateUsage(userId, usage)
    return true
  }

  /**
   * Remaining free shots per category for a user today (for UI display).
   */
  static async getRemaining(userId: number): Promise<Record<FreeShotCategory, number>> {
    const categories = Object.keys(FREE_DAILY_SHOTS) as FreeShotCategory[]
    const result = {} as Record<FreeShotCategory, number>

    const usage = await UsageService.getBaseUsage(userId)
    const bag = bagForToday(usage?.freeShots)

    categories.forEach((category) => {
      const used = bag.used[category] ?? 0
      result[category] = Math.max(0, FREE_DAILY_SHOTS[category] - used)
    })
    return result
  }
}
