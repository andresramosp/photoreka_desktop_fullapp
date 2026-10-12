// @ts-nocheck

import AnalyzerProcess, { AnalyzerMode } from '#models/analyzer/analyzerProcess'
import ModelsService from './models_service.js'
import Photo from '#models/photo'
import { Exception } from '@adonisjs/core/exceptions'
import Logger, { LogLevel } from '../utils/logger.js'
import PhotoImageService from './photo_image_service.js'
import { CacheInvalidationService } from './cache_invalidation_service.js'
import chalk from 'chalk' // ← NUEVO
import PhotoManager from '../managers/photo_manager.js'
import HealthPhotoService from './health_photo_service.js'
import { has } from 'lodash'
import { packages } from '../analyzer_packages.js'
import { VisionDescriptionTask } from '#models/analyzer/visionDescriptionTask'
import { TagTask } from '#models/analyzer/tagTask'
import { ChunkTask } from '#models/analyzer/chunkTask'
import { MetadataTask } from '#models/analyzer/metadataTask'
import { PaletteMetadataTask } from '#models/analyzer/paletteMetadataTask'
import { VisualEmbeddingTask } from '#models/analyzer/visualEmbeddingTask'
import { VisualColorEmbeddingTask } from '#models/analyzer/visualColorEmbeddingTask'
import { GlobalEmbeddingsTagsTask } from '#models/analyzer/globalEmbeddingsTagsTask'
import UsageService from '#services/usage_service'
import LightroomFolderMirrorService from '#services/lightroom_folder_mirror_service'
import AnalyzerPoolService from '#services/analyzer_pool_service'

const logger = Logger.getInstance('AnalyzerProcess')
logger.setLevel(LogLevel.DEBUG)

export default class AnalyzerProcessRunner {
  private process: AnalyzerProcess
  private modelsService: ModelsService
  private photoImageService: PhotoImageService
  private photoManager: PhotoManager
  private originalMode: AnalyzerMode = 'adding'
  private forceNotify: boolean = false

  constructor() {
    this.process = new AnalyzerProcess()
    this.modelsService = new ModelsService()
    this.photoManager = new PhotoManager()
    this.photoImageService = PhotoImageService.getInstance()
  }

  /** ────────────────────────────────────
   *  INICIALIZACIÓN Y EJECUCIÓN PRINCIPAL
   * ──────────────────────────────────── */

  public async initProcess(
    photosForProcess: Photo[],
    packageId: string,
    mode: AnalyzerMode = 'adding',
    fastMode: boolean,
    processId?: number,
    userId?: string
  ) {
    const finalUserId = userId

    await CacheInvalidationService.onPhotoListChanged(finalUserId)

    if (
      (mode === 'retry_process' || mode === 'remake_process' || mode === 'admin_retry') &&
      processId
    ) {
      this.process = await AnalyzerProcess.query()
        .where('id', processId)
        .preload('photos')
        .firstOrFail()

      // Para retry/remake, usar el userId original del proceso
      await this.process.initialize(
        photosForProcess,
        packageId,
        mode,
        fastMode,
        this.process.userId!!
      )
    } else {
      // Para nuevos procesos, usar el userId pasado como parámetro
      await this.process.initialize(
        photosForProcess,
        packageId,
        mode,
        fastMode,
        Number(finalUserId)
      )
    }

    this.originalMode = mode

    await this.changeStage(
      `Proceso Iniciado | Paquete: ${packageId} | Modo ${mode}`,
      'vision_tasks'
    )
  }

  /**
   * Ejecuta todas las tasks: primero las no globales, luego las globales
   */
  public async runAll() {
    const { hasFailed } = await this.run()
    await this.runGlobal()
    await this.regularizeScores()
    return { hasFailed }
  }

  /**
   * Regularización de scores artísticos tras el análisis (fotos casi idénticas que
   * el LLM puntuó distinto por haber caído en lotes diferentes).
   *
   * Escribe los scores corregidos directamente: al terminar esto, lo que ve el
   * usuario ya está regularizado. El original queda en `artistic_scores_raw`.
   *
   * Exactamente la misma pasada que el botón de Admin: el pool de las fotos más
   * recientes del usuario (`recentPoolLimit`), no solo las recién analizadas. Sembrarlo
   * con el proceso dejaba fuera los grupos que no tocaba ninguna foto nueva; y el tope
   * de recientes es lo que mantiene tratable el emparejado por dhash en catálogos
   * grandes.
   *
   * Está deliberadamente desacoplado del pipeline: no es una task, se importa de
   * forma dinámica, está apagado salvo que SCORES_SMOOTHING_ENABLED=true y nunca
   * propaga un error — si falla, el análisis se da por bueno igual.
   */
  private async regularizeScores() {
    const { isSmoothingEnabled } = await import('#config/score_smoothing')
    if (!isSmoothingEnabled()) return
    if (!this.process || this.process.isPreprocess) return

    const userId = this.process.userId
    if (!userId) return

    try {
      // Si el proceso no dejó ninguna foto, no hay nada nuevo que pueda cambiar el
      // resultado: el catálogo ya está regularizado por la pasada anterior.
      const total = await this.getTotalProcessPhotos()
      if (total === 0) return

      const { default: ScoreSmoothingService } = await import('#services/score_smoothing_service')
      const report = await new ScoreSmoothingService().runForUser(userId)

      logger.info(
        `[ScoreSmoothing] user=${userId} catalogo=${report.photosWithScores} grafo=${report.photosInGraph} ` +
          `grupos=${report.groups} fotos_ajustadas=${report.photosChanged} (${report.durationMs} ms)`
      )
    } catch (error) {
      logger.error(
        `[ScoreSmoothing] Error regularizando scores del usuario ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  /**
   * Devuelve el id del proceso actual (disponible tras initProcess).
   */
  public getProcessId(): string | number | undefined {
    return this.process?.id
  }

  /**
   * Fuerza el envío del email de finalización aunque el modo del proceso
   * (p.ej. admin_retry) no lo haría por defecto. Usado por el retry manual
   * de Admin cuando el admin marca "notificar al usuario".
   */
  public setForceNotify(value: boolean) {
    this.forceNotify = value
  }

  /**
   * Marca el proceso como encolado (pool lleno). No ejecuta ninguna task.
   */
  public async markQueued() {
    if (!this.process) throw new Exception('[ERROR] No process found')
    this.process.currentStage = 'queued'
    await this.process.save()
  }

  /**
   * Re-prepara un proceso que quedó en cola (`queued`) reutilizando su fila
   * existente, para poder lanzarlo manualmente desde Admin como una ejecución
   * normal ('adding'): cuenta uso y envía email de finalización.
   */
  public async prepareQueuedForRun(processId: number) {
    this.process = await AnalyzerProcess.query()
      .where('id', processId)
      .preload('photos')
      .firstOrFail()

    const photos = this.process.photos || []
    await this.process.initialize(
      photos,
      this.process.packageId,
      'adding',
      this.process.isFastMode,
      this.process.userId ?? undefined
    )
    this.originalMode = 'adding'
    return this.process
  }

  /**
   * Ejecuta runAll y libera el slot del pool al terminar (incluye auto-retries).
   * Mantiene vivo un heartbeat mientras corre, de modo que el slot no se reclama
   * por antigüedad: solo se libera al terminar (finally) o si la instancia muere
   * y el heartbeat deja de latir.
   * Pensado para usarse fire-and-forget tras adquirir un slot.
   */
  public async runAllAndReleasePool() {
    const processId = this.process?.id
    const heartbeat = processId ? AnalyzerPoolService.startHeartbeat(processId) : null
    try {
      return await this.runAll()
    } finally {
      AnalyzerPoolService.stopHeartbeat(heartbeat)
      if (processId) {
        await AnalyzerPoolService.release(processId)
      }
    }
  }

  /**
   * Ejecuta solo las tasks que NO son globales (isGlobal === false)
   */
  public async run() {
    if (!this.process || !this.process.tasks) throw new Exception('[ERROR] No process found')

    const tasks = this.process.tasks.filter((t) => !t.isGlobal)
    if (tasks.length === 0) {
      logger.info('No hay tareas para ejecutar en este proceso')
      return { hasFailed: false, processId: this.process.id }
    }
    // Precargar health en paralelo solo si es retry
    if (this.process.mode === 'retry_process' || this.process.mode === 'admin_retry') {
      await this.changeStage('*** Precargando health de fotos ***')
      await this.process.preloadPhotoHealthBatch()
    }

    // CAMBIO: Usar stages directamente en lugar de getTaskList
    const pkg = packages.find((p) => p.id === this.process.packageId)
    if (!pkg || !pkg.stages) {
      throw new Exception(`Package ${this.process.packageId} not found or has no stages`)
    }

    // Asignar isPreprocess al proceso
    this.process.isPreprocess = pkg.isPreprocess || false

    // Ejecutar stages directamente
    await this.executeStages(pkg.stages)

    await HealthPhotoService.updateSheetWithHealth(this.process)

    const hasFailed = this.hasFailedPhotos()
    const isAdminRetryFlow =
      this.process.mode === 'admin_retry' || this.originalMode === 'admin_retry'
    const finalStage = hasFailed && !isAdminRetryFlow ? 'failed' : 'finished'

    await this.changeStage('***  Proceso Completado ***', finalStage)

    // Incrementar contador acumulativo de fotos analizadas (solo para procesos no-preprocess y modos nuevos)
    if (!this.process.isPreprocess && this.process.userId) {
      const shouldCount = ![
        'overwrite_metadata',
        'remake_all',
        'remake_task',
        'remake_process',
        'retry_process',
        'admin_retry',
      ].includes(this.process.mode)
      if (shouldCount) {
        const totalPhotos = await this.getTotalProcessPhotos()
        if (totalPhotos > 0) {
          await UsageService.incrementAnalyzedPhotosUsed(this.process.userId, totalPhotos)
          logger.info(
            `Incrementado contador de fotos analizadas en ${totalPhotos} para usuario ${this.process.userId}`
          )
        }
      }
    }

    // Usar el userId del proceso para invalidar cache
    const processUserId = this.process.userId?.toString()
    const totalForCache = await this.getTotalProcessPhotos()
    await CacheInvalidationService.onAnalysisCompleted(processUserId, totalForCache)

    // Limpiar cache de health solo si se precargó
    if (this.process.mode === 'retry_process' || this.process.mode === 'admin_retry') {
      this.process.clearHealthCache()
    }

    // No lanzar autoRetry para admin_retry (el admin decide manualmente)
    if (this.process.mode !== 'admin_retry') {
      await this.handleAutoRetry()
    }

    return { hasFailed, processId: this.process.id }
  }

  /**
   * Ejecuta una lista de stages secuencialmente
   */
  private async executeStages(stages: any[], level: number = 0): Promise<void> {
    for (const stage of stages) {
      try {
        await this.executeStage(stage, level)
        // // delay forzado para pruebas
        // await this.sleep(60000 * 2)
      } catch (error) {
        const stageDescription = `stage ${stage.type} (${stage.tasks?.length || 0} items)`
        const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
        logger.error(`Error en ${stageDescription}: ${errMsg}`)
      }
    }
  }

  /**
   * Ejecuta un stage (parallel o sequential)
   */
  private async executeStage(stage: any, level: number): Promise<void> {
    const indent = '  '.repeat(level)
    const stageType = stage.type || 'unknown'
    const stageDescription = `${stageType.toUpperCase()} STAGE (${stage.tasks?.length || 0} items)`

    await this.changeStage(
      `${indent}*** Iniciando ${stageDescription} *** | ${this.process.mode.toUpperCase()}`
    )

    if (stage.type === 'parallel') {
      // Ejecutar todas las tasks/stages en paralelo
      const parallelPromises = stage.tasks.map(async (item: any) => {
        const itemDesc = this.getItemDescription(item)
        try {
          if (this.isTaskDefinition(item)) {
            const task = this.createTask(item)
            await this.executeSingleTask(task, level + 1, true)
          } else {
            await this.executeStage(item, level + 1)
          }
        } catch (error) {
          const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
          logger.error(`Error en ${itemDesc} (parallel): ${errMsg}`)
        }
      })

      await Promise.all(parallelPromises)
    } else if (stage.type === 'sequential') {
      // Ejecutar las tasks/stages secuencialmente
      for (const item of stage.tasks) {
        const itemDesc = this.getItemDescription(item)
        try {
          if (this.isTaskDefinition(item)) {
            const task = this.createTask(item)
            await this.executeSingleTask(task, level + 1)
          } else {
            await this.executeStage(item, level + 1)
          }
        } catch (error) {
          const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
          logger.error(`Error en ${itemDesc} (sequential): ${errMsg}`)
        }
      }
    }

    await this.changeStage(`${indent}*** ${stageDescription} completado ***`)
  }

  /**
   * Ejecuta una tarea individual
   */
  private async executeSingleTask(
    task: any,
    level: number,
    isParallel: boolean = false
  ): Promise<void> {
    const indent = '  '.repeat(level)
    const taskName = task.getName()
    const executionType = isParallel ? 'paralelo' : 'secuencial'

    const pendingPhotos = await task.prepare(this.process)

    if (pendingPhotos.length) {
      if (!isParallel) {
        await this.changeStage(
          `${indent}*** Iniciando tarea ${executionType} *** | ${taskName} | Fotos: ${pendingPhotos.length} | ${this.process.mode.toUpperCase()}`,
          task.name
        )
      }

      logger.info(
        `${indent}-> Ejecutando ${taskName} en ${executionType} | Fotos: ${pendingPhotos.length}`
      )
      try {
        await task.process(pendingPhotos, this.process)
        logger.info(`${indent}-> Completado ${taskName}`)
      } catch (error) {
        const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
        logger.error(`${indent}-> ERROR en tarea ${taskName}: ${errMsg}`)
        throw error // re-throw para que executeStage lo capture también
      }

      if (!isParallel) {
        await this.changeStage(`${indent}*** Tarea ${executionType} completada *** | ${taskName}`)
      }
    } else {
      logger.info(`${indent}-> Saltando ${taskName} (sin fotos pendientes)`)
    }
  }

  /**
   * Determina si un item es una definición de tarea (no una instancia)
   */
  private isTaskDefinition(item: any): boolean {
    return (
      item && typeof item === 'object' && item.name && item.type && !item.getName // No es una instancia de tarea
    )
  }

  /**
   * Crea una instancia de tarea desde su definición
   */
  private createTask(taskData: any): any {
    let task: any
    switch (taskData.type) {
      case 'VisionDescriptionTask':
        task = new VisionDescriptionTask(this.process)
        break
      case 'TagTask':
        task = new TagTask(this.process)
        break
      case 'ChunkTask':
        task = new ChunkTask(this.process)
        break
      case 'MetadataTask':
        task = new MetadataTask(this.process)
        break
      case 'PaletteMetadataTask':
        task = new PaletteMetadataTask(this.process)
        break
      case 'VisualEmbeddingTask':
        task = new VisualEmbeddingTask(this.process)
        break
      case 'VisualColorEmbeddingTask':
        task = new VisualColorEmbeddingTask(this.process)
        break
      case 'GlobalEmbeddingsTagsTask':
        task = new GlobalEmbeddingsTagsTask(this.process)
        break
      default:
        throw new Error(`Unknown task type: ${taskData.type}`)
    }

    Object.assign(task, taskData)
    return task
  }

  /**
   * Obtiene una descripción legible del item para logging
   */
  private getItemDescription(item: any): string {
    if (this.isTaskDefinition(item)) {
      return `tarea ${item.name}`
    } else if (item.type && item.tasks) {
      return `stage ${item.type} (${item.tasks.length} items)`
    } else {
      return 'item desconocido'
    }
  }

  /**
   * Ejecuta solo las tasks globales (isGlobal === true)
   * Estas tasks no requieren pendingPhotos, solo process() y commit()
   */
  public async runGlobal() {
    if (!this.process || !this.process.tasks) throw new Exception('[ERROR] No process found')

    for (const task of this.process.tasks.filter((t) => t.isGlobal)) {
      try {
        await this.changeStage(
          `*** Iniciando tarea GLOBAL *** | ${task.getName()} | ${this.process.mode.toUpperCase()}`,
          task.name
        )
        await task.process(null, this.process) // process solo recibe el proceso
        await task.commit() // commit sin argumentos
        await this.changeStage(`*** Tarea GLOBAL completada *** | ${task.getName()}`)
      } catch (error) {
        logger.error(`Error en tarea GLOBAL ${task.name}:`, error)
      }
    }
  }

  private async changeStage(message: string, nextStage: string = null) {
    logger.info(message, false)
    if (nextStage) {
      this.process.currentStage = nextStage
      await this.process.save()
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private hasFailedPhotos = () => {
    const sheet = this.process.processSheet || {}
    return Object.values(sheet).some((task: any) => (task?.completed ?? 0) < (task?.total ?? 0))
  }

  /**
   * Cuenta las fotos asociadas al proceso (consulta directa a DB)
   */
  private async getTotalProcessPhotos(): Promise<number> {
    const result = await Photo.query()
      .where('analyzer_process_id', this.process.id)
      .count('* as total')
    return Number(result[0]?.$extras?.total || 0)
  }

  /**
   * Trigger post-analysis side-effects that should run once when the
   * analysis pipeline reaches a terminal state for a non-preprocess process.
   * Currently materializes Lightroom folder-mirror collections.
   */
  private finalizeAnalysisSideEffects() {
    if (!this.process || this.process.isPreprocess) return
    const processId = this.process.id
    const userId = this.process.userId
    if (!processId || !userId) return

    LightroomFolderMirrorService.materializeForProcess(Number(processId), Number(userId)).catch(
      (e) =>
        logger.error(
          `Error materializing Lightroom folder mirror: ${e instanceof Error ? e.message : String(e)}`
        )
    )
  }

  // NUEVO: Función privada para manejar el autoRetry
  private async handleAutoRetry() {
    const shouldNotify =
      (this.originalMode === 'adding' || this.forceNotify) && !this.process.isPreprocess

    if (this.process.autoRetry) {
      // Verificar si hay fotos pendientes en alguna tarea
      const hayFallidas = this.hasFailedPhotos()
      const maxAttempts = this.process.maxAttempts ?? 3
      const attempts = this.process.attempts ?? 0
      if (hayFallidas && attempts < maxAttempts) {
        logger.info(
          `AutoRetry activo: lanzando retry_process automáticamente (hay fotos fallidas, intento ${attempts + 1}/${maxAttempts})...`
        )
        this.process.mode = 'retry_process'
        this.process.attempts = attempts + 1
        await this.process.save()
        await this.run()
      } else if (hayFallidas) {
        logger.info(
          `autoRetry: se alcanzó el máximo de intentos (${maxAttempts}). El proceso se marca como 'finished'.`
        )
        this.process.currentStage = 'finished'
        await this.process.save()
        if (shouldNotify) this.finalizeAnalysisSideEffects()
      } else {
        logger.info('autoRetry activo, pero no hay fotos fallidas. No se lanza retry_process.')
        if (shouldNotify) this.finalizeAnalysisSideEffects()
      }
    } else {
      if (shouldNotify) this.finalizeAnalysisSideEffects()
    }
  }

  /**
   * Sends a completion notification email to the user with a summary of the analysis
   */
  /**
   * En modo 'adding', impide que un usuario lance dos procesos a la vez.
   * Devuelve el AnalyzerProcess en curso (currentStage distinto de finished) o null.
   */
  public static async findRunningAddingProcess(mode: AnalyzerMode, targetUserId: number) {
    if (mode !== 'adding') {
      return null
    }

    const runningProcess = await AnalyzerProcess.query()
      .where('user_id', targetUserId)
      .whereNotIn('current_stage', ['finished'])
      .first()

    if (!runningProcess) {
      return null
    }

    logger.info(
      `Usuario ${targetUserId} ya tiene un proceso en curso (${runningProcess.id}, stage: ${runningProcess.currentStage}). Se rechaza el nuevo análisis.`
    )

    return runningProcess
  }
}
