import Photo from '#models/photo'
import User from '#models/user'

export enum UsageTier {
  TESTER = 'TESTER',
  PROMOTIONAL = 'PROMOTIONAL',
  BASIC = 'BASIC',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
}

export const UsageTierLimits: Record<
  UsageTier,
  Omit<Usage, 'creditsUsed' | 'analyzedPhotosUsed'>
> = {
  [UsageTier.TESTER]: {
    photosLimit: 2000,
    analyzedPhotosLimit: 2000,
    creditsAvailable: 100,
  },
  [UsageTier.PROMOTIONAL]: {
    photosLimit: 1000,
    analyzedPhotosLimit: 1000,
    creditsAvailable: 50,
  },
  [UsageTier.BASIC]: {
    photosLimit: 100,
    analyzedPhotosLimit: 100,
    creditsAvailable: 1000,
  },
  [UsageTier.PRO]: {
    photosLimit: 1000,
    analyzedPhotosLimit: 1000,
    creditsAvailable: 10000,
  },
  [UsageTier.PREMIUM]: {
    photosLimit: 10000,
    analyzedPhotosLimit: 10000,
    creditsAvailable: 100000,
  },
}

export function getDefaultUsageByTier(tier: UsageTier): Usage {
  const limits = UsageTierLimits[tier]
  return {
    ...limits,
    creditsUsed: 0,
    analyzedPhotosUsed: 0,
  }
}
export type Usage = {
  // Límites configurados
  photosLimit: number // Cantidad de fotos permitidas
  analyzedPhotosLimit: number // Cantidad de fotos analizadas permitidas
  creditsAvailable: number // Créditos disponibles
  creditsUsed: number // Créditos gastados
  analyzedPhotosUsed: number // Contador acumulativo de fotos analizadas (no se reduce al borrar)

  // Datos calculados (opcionales para compatibilidad)
  photosUsage?: number // Fotos actualmente subidas
  analyzedPhotosUsage?: number // Total acumulativo de fotos analizadas
  photosRemaining?: number // Fotos restantes por subir
  analyzedPhotosRemaining?: number // Análisis restantes
}

export default class UsageService {
  /**
   * Obtiene el usage básico del usuario desde la BD
   */
  static async getBaseUsage(userId: number): Promise<Usage | null> {
    const user = await User.findOrFail(userId)
    return user.usage
  }

  /**
   * Obtiene el usage extendido con datos calculados desde la BD
   */
  static async getUsage(userId: number): Promise<Usage | null> {
    let baseUsage = await this.getBaseUsage(userId)
    if (!baseUsage) {
      // Si el usuario no tiene usage, asignar el tier máximo y guardar
      const { UsageTier, getDefaultUsageByTier } = await import('#services/usage_service')
      baseUsage = getDefaultUsageByTier(UsageTier.TESTER)
      const user = await User.findOrFail(userId)
      user.usage = baseUsage
      await user.save()
    }

    // Conteo actual de fotos para límite de subida
    const photosUsageResult = await Photo.query().where('userId', userId).count('* as total')
    const photosUsage = Number(photosUsageResult[0]?.$extras.total || 0)

    // Usar contador acumulativo para análisis (no se reduce al borrar fotos)
    const analyzedPhotosUsed = baseUsage.analyzedPhotosUsed || 0

    return {
      ...baseUsage,
      photosUsage,
      analyzedPhotosUsage: analyzedPhotosUsed,
      photosRemaining: Math.max(0, baseUsage.photosLimit - photosUsage),
      analyzedPhotosRemaining: Math.max(0, baseUsage.analyzedPhotosLimit - analyzedPhotosUsed),
    }
  }

  /**
   * Actualiza el usage base del usuario
   */
  static async updateUsage(userId: number, usage: Usage): Promise<void> {
    const user = await User.findOrFail(userId)
    user.usage = usage
    await user.save()
  }

  /**
   * Incrementa los créditos usados
   */
  static async incrementCreditsUsed(userId: number, amount: number): Promise<void> {
    const currentUsage = await this.getBaseUsage(userId)
    if (!currentUsage) return

    currentUsage.creditsUsed += amount
    await this.updateUsage(userId, currentUsage)
  }

  /**
   * Incrementa el contador acumulativo de fotos analizadas
   */
  static async incrementAnalyzedPhotosUsed(userId: number, amount: number): Promise<void> {
    const currentUsage = await this.getBaseUsage(userId)
    if (!currentUsage) return

    currentUsage.analyzedPhotosUsed = (currentUsage.analyzedPhotosUsed || 0) + amount
    await this.updateUsage(userId, currentUsage)
  }

  /**
   * Verifica si el usuario puede subir más fotos
   */
  static async canUploadPhotos(userId: number): Promise<boolean> {
    const usage = await this.getUsage(userId)
    if (!usage || usage.photosRemaining === undefined) return false

    return usage.photosRemaining > 0
  }

  /**
   * Verifica si el usuario puede analizar más fotos
   */
  static async canAnalyzePhotos(userId: number): Promise<boolean> {
    const usage = await this.getUsage(userId)
    if (!usage || usage.analyzedPhotosRemaining === undefined) return false

    return usage.analyzedPhotosRemaining > 0
  }

  /**
   * Verifica si el usuario tiene créditos suficientes
   */
  static async hasEnoughCredits(userId: number, requiredCredits: number): Promise<boolean> {
    const usage = await this.getBaseUsage(userId)
    if (!usage) return false

    return usage.creditsAvailable >= requiredCredits
  }
}
