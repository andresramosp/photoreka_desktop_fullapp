import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Photo from '../photo.js'
import User from '../user.js'
import { AnalyzerTask } from './analyzerTask.js'
import { getTaskList } from '../../analyzer_packages.js'
import Logger, { LogLevel } from '../../utils/logger.js'

const logger = Logger.getInstance('AnalyzerProcess')
logger.setLevel(LogLevel.DEBUG)

export type AnalyzerMode =
  | 'adding'
  | 'overwrite_metadata'
  | 'remake_all'
  | 'remake_task'
  | 'remake_process'
  | 'retry_process'
  | 'admin_retry'
  | 'upgrade_with_package'
export type ModelType = 'GPT' | 'Molmo' | 'Qwen' | 'Gemini'
export type StageType =
  | 'init'
  | 'queued'
  | 'clip_embeddings'
  | 'vision_context_story_accents'
  | 'tags_context_story'
  | 'tags_visual_accents'
  | 'chunks_context_story_visual_accents'
  | 'visual_color_embedding_task'
  | 'finished'
  | 'failed'
/**
 * Progreso por task. Solo contadores: el estado real de cada foto vive en la tabla
 * `photos` y se recalcula por health checks.
 */
export type ProcessSheet = {
  [taskName: string]: {
    completed: number
    total: number
  }
}

import HealthPhotoService from '../../services/health_photo_service.js'

export default class AnalyzerProcess extends BaseModel {
  // Cache de health para fotos
  private healthCache: Map<number, any> = new Map()

  /**
   * Precarga el health de todas las fotos del proceso en paralelo y lo cachea.
   * VERSIÓN LENTA: Usa queries individuales por foto. Considerar usar preloadPhotoHealthBatch.
   * @deprecated Usar preloadPhotoHealthBatch para mejor rendimiento
   */
  public async preloadPhotoHealth(): Promise<void> {
    if (this.healthCache.size > 0) return // Ya está cacheado
    if (!this.photos || this.photos.length === 0) return
    const photoIds = this.photos.map((p: any) => p.id)
    const healthArr = await Promise.all(
      photoIds.map((photoId) => HealthPhotoService.photoHealth(photoId))
    )
    photoIds.forEach((id, idx) => {
      this.healthCache.set(id, healthArr[idx])
    })
    logger.info(`Health precargado para ${photoIds.length} fotos`)
  }

  /**
   * Precarga el health de todas las fotos del proceso usando batch queries optimizadas.
   * VERSIÓN RÁPIDA: 30-50x más rápido que preloadPhotoHealth.
   * NOTA: Requiere que this.photos ya esté cargado (ej: await process.load('photos'))
   */
  public async preloadPhotoHealthBatch(): Promise<void> {
    if (this.healthCache.size > 0) return // Ya está cacheado

    const photoIds = (this.photos || []).map((p: any) => p.id)
    if (photoIds.length === 0) return

    // Una sola llamada batch optimizada
    const healthReports = await HealthPhotoService.healthForPhotoIdsBatch(photoIds)

    // Cachear todos los resultados
    healthReports.forEach((report) => {
      this.healthCache.set(report.photoId, report)
    })

    logger.info(`Health precargado (batch) para ${photoIds.length} fotos`)
  }

  /**
   * Devuelve el health de una foto desde el cache
   */
  public getPhotoHealthFromCache(photoId: number): any {
    return this.healthCache.get(photoId)
  }

  /**
   * Limpia el cache de health
   */
  public clearHealthCache(): void {
    this.healthCache.clear()
  }
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare packageId: string

  @column()
  declare mode: AnalyzerMode

  @column()
  declare processSheet: ProcessSheet | null

  declare tasks: AnalyzerTask[] | null

  @column()
  declare currentStage: StageType | null

  @column()
  declare userId: number | null

  declare userProfile: string | null

  declare autoRetry: boolean | null

  declare maxAttempts: number | null

  declare attempts: number | null

  @column()
  declare isFastMode: boolean

  @column()
  declare isPreprocess: boolean

  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => Photo, {
    foreignKey: 'analyzerProcessId',
  })
  declare photos: HasMany<typeof Photo>

  public async initialize(
    photosForProcess: Photo[],
    packageId: string,
    mode: AnalyzerMode = 'adding',
    isFastMode: boolean,
    userId?: number
  ) {
    this.mode = mode
    this.packageId =
      (this.mode === 'retry_process' || this.mode === 'admin_retry') && this.packageId
        ? this.packageId
        : packageId

    // Cargar el perfil del usuario si está disponible
    if (userId) {
      const user = await User.find(userId)
      this.userProfile = user?.profiles || 'general'
      logger.info(`Usuario ${userId} con perfil: ${this.userProfile}`)
    } else {
      this.userProfile = 'general'
      logger.info('Sin userId, usando perfil por defecto: general')
    }

    // Obtener la estructura de tareas con grupos paralelos
    const taskStructure = getTaskList(this.packageId, this)

    // Aplanar la estructura para mantener compatibilidad con el resto del código
    // que espera un array plano de tareas
    this.tasks = taskStructure.flat()

    this.currentStage = 'init'
    this.autoRetry = this.mode !== 'admin_retry'
    this.maxAttempts = 2
    this.isFastMode = isFastMode
    this.userId = userId || null
    await this.save()

    await this.setProcessPhotos(photosForProcess)
    if (this.mode !== 'retry_process' && this.mode !== 'admin_retry') {
      this.initializeProcessSheet()
      await this.save()
    }
  }

  private async setProcessPhotos(photos: Photo[]) {
    const newPhotosIds = photos.map((p) => p.id)

    // Desasociar fotos que ya no están en el proceso
    await Photo.query()
      .where('analyzer_process_id', this.id)
      .whereNotIn('id', newPhotosIds)
      .update({ analyzer_process_id: null })

    // Asociar nuevas fotos al proceso
    await Photo.query().whereIn('id', newPhotosIds).update({ analyzer_process_id: this.id })

    // Recargar el proceso con las fotos preload
    const updatedProcess = await AnalyzerProcess.query()
      .where('id', this.id)
      .preload('photos')
      .firstOrFail()

    this.photos = updatedProcess.photos
    await this.save()
  }

  private initializeProcessSheet() {
    if (!this.tasks) return
    const total = this.photos.length
    const sheet: ProcessSheet = {}
    for (const task of this.tasks) {
      sheet[task.name] = { completed: 0, total }
    }
    this.processSheet = sheet
  }

  /** Suma fotos completadas de una task. Los lotes que llegan aquí no se solapan. */
  public async markPhotosCompleted(taskName: string, photoIds: number[]) {
    const task = this.processSheet?.[taskName]
    if (!task) return

    task.completed = Math.min(task.total ?? 0, (task.completed ?? 0) + photoIds.length)
    await this.save()
  }

  /** Fija el progreso absoluto de una task. Lo usa el recálculo por health. */
  public setTaskProgress(taskName: string, completed: number, total: number) {
    if (!this.processSheet) this.processSheet = {}
    this.processSheet[taskName] = { completed, total }
  }
}
