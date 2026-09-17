import UsageService from '#services/usage_service'

// ─── Constants ───────────────────────────────────────────

/** 1 credit = €0.001 */
const EUR_PER_CREDIT = 0.001

/**
 * Billing categories for differentiated margin multipliers.
 */
export type CostCategory =
  | 'GEO_INFERENCE'
  | 'SEARCH'
  | 'SEARCH_PRECISE'
  | 'SEARCH_INSIGHTS'
  | 'SEARCH_BY_PHOTO'
  | 'PORTFOLIO_BUILD'
  | 'CHAT'
  | 'CHAT_KNOWLEDGE_ASSISTANT'
  | 'NOTED_TAGS_GENERATION'

/**
 * Per-category billing multipliers applied to raw EUR cost.
 *
 * Override individual categories via env vars:
 *   CREDIT_MARGIN_MULTIPLIER_GEO_INFERENCE
 *   CREDIT_MARGIN_MULTIPLIER_SEARCH
 *   CREDIT_MARGIN_MULTIPLIER_SEARCH_PRECISE
 *   CREDIT_MARGIN_MULTIPLIER_SEARCH_INSIGHTS
 *   CREDIT_MARGIN_MULTIPLIER_SEARCH_BY_PHOTO
 *   CREDIT_MARGIN_MULTIPLIER_PORTFOLIO_BUILD
 *   CREDIT_MARGIN_MULTIPLIER_CHAT
 *   CREDIT_MARGIN_MULTIPLIER_CHAT_KNOWLEDGE_ASSISTANT
 *   CREDIT_MARGIN_MULTIPLIER_NOTED_TAGS_GENERATION
 *
 * A global CREDIT_MARGIN_MULTIPLIER env var serves as fallback for any
 * category that has no per-category override set.
 */
export const COST_MULTIPLIERS: Record<CostCategory, number> = {
  GEO_INFERENCE: 2, //2.5,
  SEARCH: 2,
  SEARCH_PRECISE: 1.75,
  SEARCH_INSIGHTS: 2,
  SEARCH_BY_PHOTO: 2,
  PORTFOLIO_BUILD: 2.25, //2.5,
  CHAT: 1.75, //2.25,
  CHAT_KNOWLEDGE_ASSISTANT: 1,
  // Tags derivados de una nota personal: una sola llamada barata sobre <=50
  // palabras. El margen se queda bajo a propósito — la nota es trabajo del
  // usuario, no una consulta que le resolvamos nosotros.
  NOTED_TAGS_GENERATION: 1.25,
}

// ─── Fixed credit costs ─────────────────────────────────

/**
 * Fixed credit cost for one RunPod BERT cross-encoder NLI call (the GPU engine
 * in LogicInferenceService). Charged directly by the service itself — see
 * LogicInferenceService.adjustProximitiesByContextInferenceByBert — since it's a
 * flat retail price (margin already baked in), not a raw cost to run through
 * CreditService.charge's margin multiplier.
 */
export const LOGIC_GPU_CREDITS = 20

/**
 * Affordability gate for precise search. The real cost is charged post-search
 * from the cost tracker (SEARCH_PRECISE margin); this is only the minimum balance
 * required to start one, so users can't run a precise search with an empty wallet.
 */
export const SEARCH_PRECISE_MIN_CREDITS = 50

/** Fixed credit cost for on-the-fly CLIP embedding from a cropped region */
export const CLIP_CROP_CREDITS = 5

/** Fixed credit cost per requested photo similarity result */
export const PHOTO_SIMILARITY_RESULT_CREDITS = 0.01

/** Minimum fixed credit cost for a photo similarity search */
export const PHOTO_SIMILARITY_MIN_CREDITS = 0.1

/**
 * Flat upfront affordability estimate for a Search Insights page. Insights run one
 * LLM call per photo on every page, so a single page costs well over 1 credit; this
 * is only the affordability gate, the real cost is charged post-search from the tracker.
 */
export const SEARCH_INSIGHTS_MIN_CREDITS = 20

// ─── Service ─────────────────────────────────────────────

export default class CreditService {
  /**
   * Billing multiplier for a given cost category.
   *
   * Resolution order:
   *   1. CREDIT_MARGIN_MULTIPLIER_<CATEGORY> per-category env var
   *   2. CREDIT_MARGIN_MULTIPLIER global env var (applies to all categories)
   *   3. COST_MULTIPLIERS[category] code default
   */
  static getCostMultiplier(category: CostCategory): number {
    const categoryVal = Number(process.env[`CREDIT_MARGIN_MULTIPLIER_${category}`])
    if (Number.isFinite(categoryVal) && categoryVal >= 1) return categoryVal

    const globalVal = Number(process.env.CREDIT_MARGIN_MULTIPLIER)
    if (Number.isFinite(globalVal) && globalVal >= 1) return globalVal

    return COST_MULTIPLIERS[category]
  }

  /**
   * Apply the configured pricing margin for a given category to a raw EUR cost.
   */
  static applyMargin(costEur: number, category: CostCategory): number {
    if (costEur <= 0) return 0

    return costEur * this.getCostMultiplier(category)
  }

  /**
   * Convert a EUR cost to credits (with 4 decimal places, minimum 0.0001).
   */
  static eurToCredits(costEur: number): number {
    if (costEur <= 0) return 0
    return Math.round((costEur / EUR_PER_CREDIT) * 10000) / 10000
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
   * Charge credits based on a EUR cost for a given cost category.
   * The category-specific margin multiplier is applied before conversion.
   * Returns the number of credits charged.
   */
  static async charge(userId: number, costEur: number, category: CostCategory): Promise<number> {
    const credits = this.eurToCredits(this.applyMargin(costEur, category))
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
   * Charge a fixed number of credits for a preset-cost operation.
   *
   * ⚠️  The caller is responsible for ensuring that `credits` already includes
   * the commercial margin. Use one of:
   *   - A constant whose value was set with margin baked in (e.g. PRECISE_GPU_CREDITS).
   *   - `eurToCredits(applyMargin(rawCost))` to compute it explicitly.
   *   - `PortfolioBuildService.estimateCredits(config)` for portfolio builds.
   *
   * Do NOT call this with `eurToCredits(rawCost)` — that charges at cost with no margin.
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
