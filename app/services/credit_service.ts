import UsageService from '#services/usage_service'

// ─── Constants ───────────────────────────────────────────

/** 1 credit = €0.001 */
const EUR_PER_CREDIT = 0.001

/** Default margin applied on top of the raw EUR cost for variable-cost LLM usage. */
export const DEFAULT_COST_MARGIN_PERCENT = 30

// ─── Fixed credit costs ─────────────────────────────────

/** Pessimistic fixed credit cost for RunPod GPU in precise mode */
export const PRECISE_GPU_CREDITS = 5

/** Fixed credit cost for on-the-fly CLIP embedding from a cropped region */
export const CLIP_CROP_CREDITS = 5

// ─── Service ─────────────────────────────────────────────

export default class CreditService {
  /**
   * Margin percent applied to variable EUR costs before converting them to credits.
   * Override with CREDIT_MARGIN_PERCENT if needed.
   */
  static getCostMarginPercent(): number {
    const configuredPercent = Number(process.env.CREDIT_MARGIN_PERCENT)

    if (!Number.isFinite(configuredPercent) || configuredPercent < 0) {
      return DEFAULT_COST_MARGIN_PERCENT
    }

    return configuredPercent
  }

  /**
   * Apply the configured pricing margin to a raw EUR cost.
   */
  static applyMargin(costEur: number): number {
    if (costEur <= 0) return 0

    const multiplier = 1 + this.getCostMarginPercent() / 100
    return costEur * multiplier
  }

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
    const credits = this.eurToCredits(this.applyMargin(costEur))
    if (credits <= 0) return 0
    await UsageService.incrementCreditsUsed(userId, credits)
    return credits
  }

  /**
   * Convert a credit amount back to its estimated EUR cost (without margin).
   * Useful for recording fixed charges in cost_logs at their approximate real cost.
   */
  static creditsToEstimatedEur(credits: number): number {
    return credits * EUR_PER_CREDIT
  }

  /**
   * Charge a fixed number of credits for a preset-cost operation
   * (e.g. search precise = N credits).
   */
  static async chargeFixed(userId: number, credits: number): Promise<void> {
    if (credits <= 0) return
    await UsageService.incrementCreditsUsed(userId, credits)
  }

  /**
   * Atomically check affordability and charge a fixed number of credits.
   * Returns `true` if the user could afford it and was charged,
   * `false` if they lacked sufficient credits (nothing is charged).
   */
  static async tryChargeFixed(userId: number, credits: number): Promise<boolean> {
    if (credits <= 0) return true
    const remaining = await this.getRemaining(userId)
    if (remaining < credits) return false
    await UsageService.incrementCreditsUsed(userId, credits)
    return true
  }
}
