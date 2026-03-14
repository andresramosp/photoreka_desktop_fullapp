import UsageService from '#services/usage_service'

// ─── Constants ───────────────────────────────────────────

/** 1 credit = €0.01 */
const EUR_PER_CREDIT = 0.01

// ─── Service ─────────────────────────────────────────────

export default class CreditService {
  /**
   * Convert a EUR cost to credits (rounded up, minimum 1).
   */
  static eurToCredits(costEur: number): number {
    if (costEur <= 0) return 0
    return Math.max(1, Math.ceil(costEur / EUR_PER_CREDIT))
  }

  /**
   * Get remaining credits for a user.
   */
  static async getRemaining(userId: number): Promise<number> {
    const usage = await UsageService.getBaseUsage(userId)
    if (!usage) return 0
    return Math.max(0, usage.creditsAvailable - usage.creditsUsed)
  }

  /**
   * Check if user can afford an estimated credit cost.
   * With no argument, checks if the user has any credits left (≥ 1).
   */
  static async canAfford(userId: number, estimatedCredits: number = 1): Promise<boolean> {
    const remaining = await this.getRemaining(userId)
    return remaining >= estimatedCredits
  }

  /**
   * Charge credits based on a EUR cost.
   * Returns the number of credits charged.
   */
  static async charge(userId: number, costEur: number): Promise<number> {
    const credits = this.eurToCredits(costEur)
    if (credits <= 0) return 0
    await UsageService.incrementCreditsUsed(userId, credits)
    return credits
  }

  /**
   * Charge a fixed number of credits for a preset-cost operation
   * (e.g. search precise = N credits).
   */
  static async chargeFixed(userId: number, credits: number): Promise<void> {
    if (credits <= 0) return
    await UsageService.incrementCreditsUsed(userId, credits)
  }
}
