import Photo from '#models/photo'
import User from '#models/user'

export enum UsageTier {
  BASIC = 'BASIC',
  PROMOTIONAL = 'PROMOTIONAL',
}

/** Credits awarded to the inviter when their invited friend successfully registers */
export const INVITE_REFERRAL_BONUS_CREDITS = 500

/** Analysis photos awarded to the inviter when their invited friend successfully registers */
export const INVITE_REFERRAL_BONUS_PHOTOS = 200

export const UsageTierLimits: Record<
  UsageTier,
  Omit<Usage, 'creditsUsed' | 'analyzedPhotosUsed'>
> = {
  [UsageTier.BASIC]: {
    photosLimit: 50000,
    analyzedPhotosLimit: 200,
    creditsAvailable: 1000,
  },

  [UsageTier.PROMOTIONAL]: {
    photosLimit: 50000,
    analyzedPhotosLimit: 1000,
    creditsAvailable: 1500,
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
/**
 * Daily free-usage allowance ("bolsa gratuita diaria").
 * `date` is the YYYY-MM-DD the counters belong to; when it no longer matches
 * today the bag is considered reset. `used` maps a FreeShotCategory to the
 * number of free shots already consumed today.
 */
export type FreeShotsState = {
  date: string
  used: Record<string, number>
}

export type Usage = {
  // Límites configurados
  photosLimit: number // Cantidad de fotos permitidas
  analyzedPhotosLimit: number // Cantidad de fotos analizadas permitidas
  creditsAvailable: number // Créditos disponibles
  creditsUsed: number // Créditos gastados
  analyzedPhotosUsed: number // Contador acumulativo de fotos analizadas (no se reduce al borrar)

  // Bolsa gratuita diaria de usos por categoría (se resetea cada día)
  freeShots?: FreeShotsState

  // Datos calculados (opcionales)
  photosUsage?: number // Fotos actualmente subidas
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
      // Fallback para usuarios legacy sin usage asignado
      baseUsage = getDefaultUsageByTier(UsageTier.BASIC)
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
   * Verifica si el usuario tiene capacidad suficiente para analizar `photoCount` fotos
   */
  static async hasCapacityToAnalyze(userId: number, photoCount: number): Promise<boolean> {
    const usage = await this.getUsage(userId)
    if (!usage || !usage.analyzedPhotosRemaining) return false

    return photoCount <= usage.analyzedPhotosRemaining
  }

  /**
   * Verifica si el usuario tiene créditos suficientes
   */
  static async hasEnoughCredits(userId: number, requiredCredits: number): Promise<boolean> {
    const usage = await this.getBaseUsage(userId)
    if (!usage) return false

    const remaining = usage.creditsAvailable - (usage.creditsUsed || 0)
    return remaining >= requiredCredits
  }

  /**
   * Añade créditos bonus al balance disponible del usuario (sin afectar creditsUsed)
   */
  static async addBonusCredits(userId: number, amount: number): Promise<void> {
    const currentUsage = await this.getBaseUsage(userId)
    if (!currentUsage) return

    currentUsage.creditsAvailable = (currentUsage.creditsAvailable || 0) + amount
    await this.updateUsage(userId, currentUsage)

    console.log(
      `[UsageService] Added ${amount} bonus credits to user ${userId}. New available credits: ${currentUsage.creditsAvailable}`
    )
  }

  /**
   * Incrementa el límite de fotos analizadas del usuario (bonus por referido)
   */
  static async addBonusAnalysisPhotos(userId: number, amount: number): Promise<void> {
    const currentUsage = await this.getBaseUsage(userId)
    if (!currentUsage) return

    currentUsage.analyzedPhotosLimit = (currentUsage.analyzedPhotosLimit || 0) + amount
    await this.updateUsage(userId, currentUsage)

    console.log(
      `[UsageService] Added ${amount} bonus analysis photos to user ${userId}. New analyzed photos limit: ${currentUsage.analyzedPhotosLimit}`
    )
  }
}
