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
import { VisualDetectionTask } from '#models/analyzer/visualDetectionTask'
import { GlobalEmbeddingsTagsTask } from '#models/analyzer/globalEmbeddingsTagsTask'
import UsageService from '#services/usage_service'
import UserCostService from '#services/user_cost_service'
import User from '#models/user'
import MailService from '#services/mail_service'
import { analysisCompleteTemplate } from '../utils/email_templates.js'
import LightroomFolderMirrorService from '#services/lightroom_folder_mirror_service'
import { measureServiceCost } from '../utils/railway_cost_calculator.js'

const logger = Logger.getInstance('AnalyzerProcess')
logger.setLevel(LogLevel.DEBUG)

export default class AnalyzerProcessRunner {
  private process: AnalyzerProcess
  private modelsService: ModelsService
  private photoImageService: PhotoImageService
  private photoManager: PhotoManager
  private originalMode: AnalyzerMode = 'adding'
  private measurementStartIso: string | null = null
  private measurementCommandsPrinted: boolean = false

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
    if (!this.measurementStartIso) {
      this.measurementStartIso = new Date().toISOString()
      logger.info(`[COST_MEASURE] Analysis window start (UTC): ${this.measurementStartIso}`)
    }

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
    return { hasFailed }
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

    await this.changeStage('***  Proceso Completado ***', 'finished')

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

    const attemptSummary = this.process.costTracker.getSummary()

    // Registrar coste en el historial del usuario
    // (incluido admin_retry: el coste es real, solo no se descuenta del crédito del usuario)
    // Enviamos solo el delta del intento actual (attemptSummary) para no
    // triplicar el coste en el histórico del usuario / cost_logs en cada retry.
    if (this.process.userId && attemptSummary.totalCostInEur > 0) {
      UserCostService.recordSummary(this.process.userId, attemptSummary, this.process.id).catch(
        () => {}
      )
    }

    // Reset del tracker para que el siguiente intento (auto-retry) registre
    // solo su propio delta en vez de volver a acumular desde cero.
    this.process.costTracker.reset()

    // Limpiar cache de health solo si se precargó
    if (this.process.mode === 'retry_process' || this.process.mode === 'admin_retry') {
      this.process.clearHealthCache()
    }

    // No lanzar autoRetry para admin_retry (el admin decide manualmente)
    if (this.process.mode !== 'admin_retry') {
      await this.handleAutoRetry()
    } else {
      this.autoMeasureComputeCost()
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

      this.process.costTracker.setCurrentTask(task.name)
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
      case 'VisualDetectionTask':
        task = new VisualDetectionTask(this.process)
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
        this.process.costTracker.setCurrentTask(task.name)
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
    return Object.values(sheet).some(
      (task: any) => Array.isArray(task.pendingPhotoIds) && task.pendingPhotoIds.length > 0
    )
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
    const shouldNotify = this.originalMode === 'adding' && !this.process.isPreprocess

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
        this.run()
      } else if (hayFallidas) {
        logger.info(
          `autoRetry: se alcanzó el máximo de intentos (${maxAttempts}). El proceso se marca como 'finished'.`
        )
        this.process.currentStage = 'finished'
        await this.process.save()
        this.autoMeasureComputeCost()
        if (shouldNotify) {
          this.sendAnalysisCompleteEmail().catch((e) =>
            logger.error(
              `Error enviando email tras autoRetry max: ${e instanceof Error ? e.message : String(e)}`
            )
          )
          this.finalizeAnalysisSideEffects()
        }
      } else {
        logger.info('autoRetry activo, pero no hay fotos fallidas. No se lanza retry_process.')
        this.autoMeasureComputeCost()
        if (shouldNotify) {
          this.sendAnalysisCompleteEmail().catch((e) =>
            logger.error(
              `Error enviando email tras autoRetry ok: ${e instanceof Error ? e.message : String(e)}`
            )
          )
          this.finalizeAnalysisSideEffects()
        }
      }
    } else {
      this.autoMeasureComputeCost()
      if (shouldNotify) {
        this.sendAnalysisCompleteEmail().catch((e) =>
          logger.error(
            `Error enviando email de análisis: ${e instanceof Error ? e.message : String(e)}`
          )
        )
        this.finalizeAnalysisSideEffects()
      }
    }
  }

  /**
   * Sends a completion notification email to the user with a summary of the analysis
   */
  private async sendAnalysisCompleteEmail() {
    try {
      const userId = this.process.userId
      if (!userId) {
        logger.warn('sendAnalysisCompleteEmail: userId vacío, abortando')
        return
      }

      logger.debug(`sendAnalysisCompleteEmail: buscando usuario ${userId}`)
      const user = await User.find(userId)
      if (!user || !user.email) {
        logger.warn(
          `sendAnalysisCompleteEmail: usuario no encontrado o sin email (userId: ${userId})`
        )
        return
      }

      logger.debug(`sendAnalysisCompleteEmail: contando fotos del proceso ${this.process.id}`)
      const totalProcessPhotos = await this.getTotalProcessPhotos()
      const failedPhotos = 0
      const processedPhotos = totalProcessPhotos

      logger.debug(`sendAnalysisCompleteEmail: contando fotos totales del usuario ${userId}`)
      const totalResult = await Photo.query().where('user_id', userId).count('* as total')
      const totalUserPhotos = Number(totalResult[0]?.$extras?.total || 0)

      const frontendUrl = process.env.FRONTEND_URL || 'https://app.photoreka.com'
      const processUrl = `${frontendUrl}/import-area#processing`

      logger.debug(
        `sendAnalysisCompleteEmail: generando template (processed: ${processedPhotos}, total: ${totalUserPhotos})`
      )
      const html = analysisCompleteTemplate(
        user.name || 'there',
        processedPhotos,
        failedPhotos,
        totalUserPhotos,
        processUrl
      )

      logger.debug(`sendAnalysisCompleteEmail: enviando email a ${user.email}`)
      const mailService = new MailService()
      await mailService.sendEmail({
        from: 'Photoreka <hello@photoreka.com>',
        to: user.email,
        subject: `Your photo analysis is complete${failedPhotos > 0 ? ' (with some issues)' : ''}`,
        body: html,
      })

      logger.info(`Email de análisis completado enviado a ${user.email} (userId: ${userId})`)
    } catch (error) {
      const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
      logger.error(`Error enviando email de análisis completado: ${errMsg}`)
    }
  }

  private autoMeasureComputeCost() {
    if (this.measurementCommandsPrinted) return
    this.measurementCommandsPrinted = true

    const startIso =
      this.measurementStartIso ||
      (this.process?.createdAt?.toISO ? this.process.createdAt.toISO() : new Date().toISOString())
    const endIso = new Date().toISOString()
    const environmentName = process.env.RAILWAY_ENVIRONMENT_NAME || 'real'
    const processId = this.process?.id || 'unknown'

    logger.info(`[COST_MEASURE] Analysis window end (UTC): ${endIso}`)
    logger.info(`[COST_MEASURE] PROCESS_ID: ${processId} | START: ${startIso} | END: ${endIso}`)

    // All Railway services to measure — add env vars for DB and Python in Railway dashboard
    const services: string[] = [process.env.RAILWAY_SERVICE_NAME || 'photoreka_analyzer_api']
    if (process.env.RAILWAY_DB_SERVICE_NAME) services.push(process.env.RAILWAY_DB_SERVICE_NAME)
    if (process.env.RAILWAY_PYTHON_SERVICE_NAME)
      services.push(process.env.RAILWAY_PYTHON_SERVICE_NAME)

    // Print manual fallback commands for all services
    console.log('')
    console.log('================ COST MEASUREMENT COMMANDS ================')
    console.log(`[COST_MEASURE] PROCESS_ID: ${processId}`)
    console.log(`[COST_MEASURE] START_UTC: ${startIso}`)
    console.log(`[COST_MEASURE] END_UTC:   ${endIso}`)
    for (const svc of services) {
      const metricsFile = `metrics-process-${processId}-${svc}.json`
      console.log(`-- Service: ${svc}`)
      console.log(
        `npx @railway/cli@4.11.0 metrics --service ${svc} --environment ${environmentName} --since "${startIso}" --until "${endIso}" --cpu --memory --raw --json > ${metricsFile}`
      )
      console.log(
        `node ace railway:compute-cost --metrics-file ${metricsFile} --memory-unit mb --verbose`
      )
    }
    console.log('===========================================================')
    console.log('')

    // Auto-fetch and calculate cost for all services in parallel (fire-and-forget)
    Promise.all(services.map((svc) => measureServiceCost(svc, environmentName, startIso, endIso)))
      .then((results) => {
        const total = results.reduce((sum, r) => sum + r.totalCostUsd, 0)
        console.log('')
        console.log('================ AUTO COMPUTE COST RESULT ================')
        console.log(`[COST_MEASURE] PROCESS_ID: ${processId}`)
        for (const r of results) {
          if (r.error) {
            console.log(`  [${r.service}] ERROR: ${r.error}`)
          } else {
            console.log(
              `  [${r.service}] CPU: ${r.cpuVcpuMinutes.toFixed(4)} vCPU-min | RAM: ${r.memoryGbMinutes.toFixed(4)} GB-min | Cost: $${r.totalCostUsd.toFixed(6)}`
            )
          }
        }
        console.log(`  TOTAL estimated cost: $${total.toFixed(6)} USD`)
        console.log('===========================================================')
        console.log('')
        logger.info(
          `[COST_MEASURE] Total estimated infra cost for process ${processId}: $${total.toFixed(6)} USD`
        )
      })
      .catch((err) => {
        logger.error(
          `[COST_MEASURE] Failed to auto-calculate cost: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      })
  }
}
