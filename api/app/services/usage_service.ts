import db from '@adonisjs/lucid/services/db'
import Photo from '#models/photo'
import User from '#models/user'
import logger from '@adonisjs/core/services/logger'
import { cloudAccount, hasAnalysisQuota, isDesktopFileKey } from '#desktop/cloud_functions'
import CloudAccountService from '#desktop/services/cloud_account_service'

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
    photosLimit: 100000,
    analyzedPhotosLimit: 100,
    creditsAvailable: 500,
  },

  [UsageTier.PROMOTIONAL]: {
    photosLimit: 100000,
    analyzedPhotosLimit: 500,
    creditsAvailable: 1000,
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

export type WelcomePack = { photos: number; credits: number }

/**
 * Free option of the profile wizard's packs step: the BASIC tier's analysis
 * photos and credits. With no photos in BASIC there is no free option and the
 * wizard offers only paid packs.
 */
export function getWelcomePack(): WelcomePack | null {
  const { analyzedPhotosLimit, creditsAvailable } = UsageTierLimits[UsageTier.BASIC]
  return analyzedPhotosLimit > 0 ? { photos: analyzedPhotosLimit, credits: creditsAvailable } : null
}

/**
 * Invited users get their invite's tier on sign-up and skip the packs step.
 * Everyone else starts without analysis photos or credits: the packs step
 * grants them, either as the free welcome pack or as a purchase.
 */
export function getRegistrationUsage(inviteTier: UsageTier | null): Usage {
  if (inviteTier) return getDefaultUsageByTier(inviteTier)
  return {
    ...getDefaultUsageByTier(UsageTier.BASIC),
    analyzedPhotosLimit: 0,
    creditsAvailable: 0,
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

  // Eligió el paquete de bienvenida gratuito en el wizard de perfil
  welcomePackClaimed?: boolean

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
   * Concede el paquete de bienvenida (opción gratuita del wizard). Solo se puede
   * reclamar sin cuota de análisis: quien ya tiene fotos (invitado, comprador o
   * que ya lo reclamó) no recibe nada. El bloqueo de la fila evita que dos
   * peticiones simultáneas lo concedan dos veces.
   */
  static async claimWelcomePack(userId: number): Promise<boolean> {
    const pack = getWelcomePack()
    if (!pack) return false

    return db.transaction(async (trx) => {
      const user = await User.query({ client: trx }).where('id', userId).forUpdate().firstOrFail()
      const usage = user.usage
      if (!usage || usage.analyzedPhotosLimit > 0) return false

      usage.analyzedPhotosLimit = pack.photos
      usage.creditsAvailable = (usage.creditsAvailable || 0) + pack.credits
      usage.welcomePackClaimed = true
      user.usage = { ...usage }
      await user.useTransaction(trx).save()
      return true
    })
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
   * Escritorio: la nube descuenta cada foto mientras se analiza. Al terminar un análisis solo se
   * copia la cuenta, para que la cuota que se ve en la app esté al día.
   */
  static async refreshAnalyzedPhotosUsed(userId: number): Promise<void> {
    await cloudAccount(userId)
      .then((account) => CloudAccountService.saveAccount(account))
      .catch((error) => logger.warn(`[cloud] no se pudo refrescar la cuenta: ${error.message}`))
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
   * Verifica si el usuario tiene capacidad suficiente para analizar estas fotos. Escritorio: lo
   * decide la nube, que solo cuenta las fotos que aún no se han pagado (por su clave de R2).
   */
  static async hasCapacityToAnalyze(userId: number, photos: { name: string }[]): Promise<boolean> {
    const keys = photos.map((photo) => photo.name).filter(isDesktopFileKey)
    if (keys.length === 0) return true
    return hasAnalysisQuota(userId, keys)
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
