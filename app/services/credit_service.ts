import UsageService from '#services/usage_service'

/**
 * Escritorio: los créditos se cobran en la nube (gateway/desktop/billing). Aquí solo se consulta el
 * saldo de la copia local de la cuenta, para avisos previos que no necesitan ir a la nube.
 */
export default class CreditService {
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
}
