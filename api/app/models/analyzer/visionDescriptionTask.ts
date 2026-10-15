import { DescriptionType, PhotoDescriptions, photoAssetUrl } from '#models/photo'
import Photo from '#models/photo'
import PhotoManager from '../../managers/photo_manager.js'
import { AnalyzerTask } from './analyzerTask.js'
import Logger, { LogLevel } from '../../utils/logger.js'
import AnalyzerProcess from './analyzerProcess.js'
import pLimit from 'p-limit'
import { isGpt5ReasoningModel, ModelName } from '#services/models_service'
import {
  analysisBatchResults,
  analysisBatchStatus,
  describeImagesWithGemini,
  describeImagesWithGPT,
  describeImagesWithQwen,
  submitAnalysisBatch,
} from '#desktop/cloud_functions'

const logger = Logger.getInstance('AnalyzerProcess', 'VisionDescriptionTask')
logger.setLevel(LogLevel.DEBUG)

/** Clave que ocupa la imagen `index` (0-based) en la respuesta con schema. */
const schemaKeyFor = (index: number) => `image_${index + 1}`

export class VisionDescriptionTask extends AnalyzerTask {
  /**
   * La tarea tiene esquema de respuesta en el servicio de la nube: la respuesta es un objeto
   * con una clave por imagen y se mapea por clave en vez de por posición.
   */
  declare keyedResponse?: boolean
  declare resolution: 'low' | 'high' | 'medium'
  declare sequential: boolean
  declare imagesPerRequest: number
  declare imageUrlSource?: 'original' | 'thumbnail'
  declare retryModel?: ModelName
  declare promptDependentField: DescriptionType
  declare promptsNames: DescriptionType[]
  declare data: Record<number, Record<string, string>>
  declare complete: boolean
  declare analyzerProcess: AnalyzerProcess
  declare visualAspects: boolean
  failedRequests: Photo[] = []

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private ensureNonEmptyResult(response: any, modelName: ModelName): any {
    const result = response?.result
    const isEmptyObject =
      result &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      Object.keys(result).length === 0

    if (isEmptyObject) {
      throw new Error(`Parsed empty JSON object from ${modelName} (likely truncated)`)
    }

    return response
  }

  private getPhotoImageUrl(photo: Photo): string {
    if (this.imageUrlSource === 'thumbnail' && photo.thumbnailUrl) {
      return photo.thumbnailUrl
    }

    // La descarga el proveedor desde la nube: la main de R2, no la URL local del original.
    return photoAssetUrl(photo.name)
  }

  async process(pendingPhotos: Photo[], analyzerProcess: AnalyzerProcess): Promise<void> {
    this.analyzerProcess = analyzerProcess
    // Limpiar requests fallidos al inicio del proceso
    this.failedRequests = []

    logger.debug(`VisionDescriptionTask usando perfil: ${analyzerProcess.userProfile || 'general'}`)

    // const threshold =
    // analyzerProcess.mode === 'retry_process' ? this.imagesPerRequest * 2 : this.imagesPerRequest
    const threshold = 200
    if (this.batchAPI && pendingPhotos.length > threshold) {
      await this.processWithBatchAPI(pendingPhotos)
    } else {
      await this.processWithDirectAPI(pendingPhotos)
    }

    // Limpiar al final del proceso completo
    this.failedRequests = []
  }

  private async processWithDirectAPI(pendingPhotos: Photo[]): Promise<void> {
    if (!this.data) this.data = {}

    const batches: Photo[][] = []
    for (let i = 0; i < pendingPhotos.length; i += this.imagesPerRequest) {
      const batch = pendingPhotos.slice(i, i + this.imagesPerRequest)
      batches.push(batch)
    }

    const maxConcurrency = 3 // Número de batches simultáneos
    const limit = pLimit(maxConcurrency)

    const processBatch = async (batch: Photo[]) => {
      let response: any
      let lastError: unknown = null
      const userProfile = this.analyzerProcess.userProfile || 'general'
      logger.debug(
        `Llamando a ${this.model} para ${batch.length} imágenes con perfil ${userProfile}...`
      )

      const urls = batch.map((p) => this.getPhotoImageUrl(p))
      const uniqueUrls = new Set(urls).size
      logger.debug(
        `[DIAG_SEND] ${this.name} | model=${this.modelName} | photos=${batch.length} | ` +
          `ids=[${batch.map((p) => p.id).join(',')}] | resolution=${this.resolution} | ` +
          `source=${this.imageUrlSource ?? 'original'} | uniqueUrls=${uniqueUrls}/${urls.length} | ` +
          `emptyUrls=${urls.filter((u) => !u).length}`
      )
      if (uniqueUrls !== urls.length || urls.some((u) => !u)) {
        logger.error(
          `[DIAG_URLS] ${this.name} | URLs no distintas o vacías | ${JSON.stringify(
            batch.map((p) => ({ id: p.id, url: this.getPhotoImageUrl(p) }))
          )}`
        )
      }

      const maxAttempts = this.retryModel ? 2 : 1

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const currentModelName = attempt > 1 && this.retryModel ? this.retryModel : this.modelName

        try {
          response = await this.executeModelTask(batch, currentModelName)
          break
        } catch (err) {
          lastError = err
          logger.error(
            `Error en ${currentModelName} para ${batch.length} imágenes (intento ${attempt}/${maxAttempts}): ${this.formatError(err)}`
          )

          if (attempt < maxAttempts) {
            logger.warn(
              `Reintentando ${this.name} con modelo alternativo ${this.retryModel} tras fallo de ${this.modelName}`
            )
          }
        }
      }

      if (!response) {
        logger.error(
          `No se pudo completar ${this.name} para ${batch.length} imágenes con ${this.modelName}${this.retryModel ? ` ni con ${this.retryModel}` : ''}: ${this.formatError(lastError)}`
        )
        return
      }

      // Fotos de referencia para este batch (Gemini usa validPhotos, el resto el batch original)
      const referencePhotos: Photo[] = response.validPhotos || batch
      const payload = response.result

      const savedPhotos = this.keyedResponse
        ? this.mapByKey(payload, referencePhotos)
        : this.mapByPosition(payload, referencePhotos)

      if (savedPhotos.length) {
        await this.commit(savedPhotos)
        logger.debug(`Datos salvados ${this.model} para ${savedPhotos.length} imágenes`)
      }

      const pendingIds = referencePhotos.filter((p) => !savedPhotos.includes(p)).map((p) => p.id)
      if (pendingIds.length) {
        logger.error(
          `[UNSAVED] ${this.name} (${this.modelName}): ${pendingIds.length}/${referencePhotos.length} ` +
            `foto(s) sin resultado utilizable, quedan pendientes para el retry: [${pendingIds.join(', ')}]`
        )
      }
    }

    // Un lote no puede tumbar la task: cualquier fallo inesperado deja SOLO sus fotos
    // pendientes para el retry, sin abortar los demás lotes ni descartar sus commits.
    const runBatchSafely = async (batch: Photo[]) => {
      try {
        await processBatch(batch)
      } catch (err) {
        logger.error(
          `[BATCH_FAILED] ${this.name} (${this.modelName}): fallo inesperado procesando ` +
            `[${batch.map((p) => p.id).join(', ')}], quedan pendientes: ${this.formatError(err)}`
        )
      }
    }

    if (this.sequential) {
      for (let i = 0; i < batches.length; i++) {
        await runBatchSafely(batches[i])
        // Limpiar la referencia del batch procesado
        batches[i] = []
      }
    } else {
      await Promise.all(batches.map((batch) => limit(() => runBatchSafely(batch))))
    }

    // Limpiar array de batches
    batches.length = 0
  }

  private async processWithBatchAPI(pendingPhotos: Photo[]): Promise<void> {
    if (!this.data) this.data = {}

    const imagesPerBatch = 200
    const maxConcurrency = 6 // Número de batches simultáneos

    // Divide las fotos en batches de 200
    const batches: Photo[][] = []
    for (let i = 0; i < pendingPhotos.length; i += imagesPerBatch) {
      batches.push(pendingPhotos.slice(i, i + imagesPerBatch))
    }

    const limit = pLimit(maxConcurrency)

    // Ejecuta todos los batches con concurrencia limitada
    const batchPromises = batches.map((batchPhotos) =>
      limit(() => this.processSingleBatch(batchPhotos))
    )

    await Promise.all(batchPromises)

    // Limpiar array de batches
    batches.length = 0

    // Si hay fallos, reprocesar con DirectAPI
    if (this.failedRequests.length > 0) {
      logger.warn(`Reprocesando ${this.failedRequests.length} imágenes fallidas con DirectAPI`)
      await this.processWithDirectAPI(this.failedRequests)
      this.failedRequests = []
    }
  }

  /**
   * Respuesta con schema: objeto { image_1: {...}, ... }. La clave identifica la
   * imagen, así que un descuadre nunca desalinea: solo deja fotos sin guardar.
   */
  private mapByKey(payload: any, referencePhotos: Photo[]): Photo[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      logger.error(
        `[SCHEMA_SHAPE] ${this.name} (${this.modelName}): se esperaba un objeto con claves ` +
          `image_N y llegó ${Array.isArray(payload) ? 'un array' : typeof payload}. Batch sin guardar.`
      )
      return []
    }

    const saved: Photo[] = []
    const missingKeys: string[] = []

    referencePhotos.forEach((photo, index) => {
      const key = schemaKeyFor(index)
      const item = payload[key]
      if (!item || typeof item !== 'object') {
        missingKeys.push(key)
        return
      }
      this.data[photo.id] = { ...this.data[photo.id], ...item }
      saved.push(photo)
    })

    const extraKeys = Object.keys(payload).filter(
      (k) => !referencePhotos.some((_, i) => schemaKeyFor(i) === k)
    )
    if (missingKeys.length || extraKeys.length) {
      logger.error(
        `[SCHEMA_KEYS] ${this.name} (${this.modelName}): claves inesperadas | ` +
          `faltan=[${missingKeys.join(',')}] | sobran=[${extraKeys.join(',')}]`
      )
    }

    return saved
  }

  /**
   * Respuesta clásica en array, mapeada por posición. Un descuadre en el número de
   * items hace ambigua la correspondencia item->foto, así que no se guarda nada y el
   * batch entero se deja pendiente: preferimos reintentar a escribir scores cruzados.
   */
  private mapByPosition(payload: any, referencePhotos: Photo[]): Photo[] {
    if (!Array.isArray(payload) || payload.length === 0) {
      logger.error(
        `[NO_RESULT] ${this.name} (${this.modelName}): sin resultados válidos para el batch ` +
          `(${referencePhotos.length} foto(s)).`
      )
      return []
    }

    if (payload.length !== referencePhotos.length) {
      logger.error(
        `[COUNT_MISMATCH] ${this.name} (${this.modelName}): ${payload.length} items para ` +
          `${referencePhotos.length} imágenes. La correspondencia item->foto es ambigua; ` +
          `no se guarda nada y el batch se deja pendiente.`
      )
      return []
    }

    referencePhotos.forEach((photo, index) => {
      this.data[photo.id] = { ...this.data[photo.id], ...payload[index] }
    })
    return [...referencePhotos]
  }

  async commit(batch: Photo[]): Promise<void> {
    try {
      const photoManager = new PhotoManager()
      const photoIds = batch.map((p) => p.id)

      await Promise.all(
        photoIds.map((photoId: number) => {
          const descriptions = this.visualAspects
            ? { visual_aspects: this.data[photoId] }
            : this.data[photoId]
          if (!isNaN(Number(photoId)) && this.data[photoId]) {
            return photoManager.updatePhotoDescriptions(
              photoId.toString(),
              descriptions as PhotoDescriptions
            )
          }
          return Promise.resolve(null)
        })
      )

      for (const photoId of photoIds) {
        delete this.data[photoId]
      }
    } catch (err) {
      logger.error(`Error guardando datos de VisionTask: ${this.formatError(err)}`)
    }
  }

  private async processSingleBatch(batchPhotos: Photo[]): Promise<void> {
    const imagesPerRequest = this.imagesPerRequest
    const maxRetries = 1
    let attempt = 0
    let completed = false
    let batchId: string | null = null
    let status = 'in_progress'
    let requests: any[] = []

    const isGpt5NonChat = isGpt5ReasoningModel(this.modelName)

    while (attempt < maxRetries && !completed) {
      // Generar requests en cada intento para evitar side effects
      requests = []
      for (let j = 0; j < batchPhotos.length; j += imagesPerRequest) {
        const batch = batchPhotos.slice(j, j + imagesPerRequest)
        const customId = batch.map((p) => p.id).join('-')
        // Sin prompt de sistema ni esquema: el servicio de la nube los añade a cada petición.
        const userContent = batch.map((photo) => ({
          type: 'image_url',
          image_url: {
            url: this.getPhotoImageUrl(photo),
            detail: this.resolution,
          },
        }))
        const body: any = {
          model: this.modelName,
          messages: [{ role: 'user', content: userContent }],
        }
        if (!isGpt5NonChat) {
          body.temperature = 0.1
          body.max_tokens = 15000
        } else {
          body.reasoning_effort = 'low'
          body.verbosity = 'low'
        }
        requests.push({
          custom_id: customId,
          method: 'POST',
          url: '/v1/chat/completions',
          body,
        })
      }

      batchId = await submitAnalysisBatch(this.cloudTask(), requests)
      logger.debug(
        `Batch con id ${batchId} en espera para ${batchPhotos.length} imágenes (intento ${attempt + 1}/${maxRetries})`
      )

      status = 'in_progress'
      // Espera hasta que el batch cambie de estado o se agoten los reintentos
      while (status === 'in_progress' || status === 'finalizing' || status === 'validating') {
        await this.sleep(8000)
        try {
          status = await analysisBatchStatus(this.cloudTask(), batchId)
        } catch (error) {
          logger.error(`Error al obtener status del batch ${batchId}: ${this.formatError(error)}`)
        }
      }
      if (status === 'completed') {
        completed = true
      } else {
        attempt++
        if (attempt < maxRetries) {
          logger.warn(
            `El batch ${batchId} no se completó (status: ${status}). Reintentando (${attempt}/${maxRetries})...`
          )
        }
      }
    }

    if (!completed || !batchId) {
      logger.error(
        `El batch${batchId ? ' ' + batchId : ''} ha fallado tras ${maxRetries} reintentos.`
      )
      return
    }

    logger.debug(`Batch con id ${batchId} resuelto`)

    const results = await analysisBatchResults(this.cloudTask(), batchId)

    results.forEach((res: any) => {
      try {
        const items = res.items || []
        const photoIds = res.custom_id.split('-').map(Number)

        if (items.length !== photoIds.length) {
          logger.error(`Batch mismatch ${res.custom_id}: ${items.length} vs ${photoIds.length}`)
          logger.error(`Items structure: ${JSON.stringify(items, null, 2)}`)
          this.failedRequests.push(...batchPhotos.filter((photo) => photoIds.includes(photo.id)))
          return
        }
        items.forEach((photoResult: any, idx: number) => {
          const photoId = photoIds[idx]
          this.data[photoId] = { ...this.data[photoId], ...photoResult }
        })
      } catch (err) {
        logger.error(
          `Error procesando resultado del batch para fotos ${res.custom_id}: ${this.formatError(err)}`
        )
      }
    })

    // Limpiar results para liberar memoria
    results.length = 0

    await this.commit(batchPhotos)
    logger.debug(`Datos salvados del batch para ${batchPhotos.length} imágenes`)
  }

  private getModelTypeForModel(modelName: ModelName) {
    if (modelName.startsWith('gemini')) return 'Gemini'
    if (modelName.startsWith('qwen')) return 'Qwen'
    if (
      modelName.startsWith('gpt') ||
      modelName.startsWith('deepseek') ||
      modelName.startsWith('grok')
    ) {
      return 'GPT'
    }

    return this.model
  }

  private async executeModelTask(batch: Photo[], modelName: ModelName): Promise<any> {
    const modelType = this.getModelTypeForModel(modelName)

    try {
      if (modelType === 'GPT') {
        const images = batch.map((photo) => ({
          type: 'image_url',
          image_url: {
            url: this.getPhotoImageUrl(photo),
            detail: this.resolution,
          },
        }))
        const response = await describeImagesWithGPT(this.cloudTask(), images, modelName)
        if (!response) {
          throw new Error(`Respuesta vacía de ${modelName}`)
        }
        return this.ensureNonEmptyResult(response, modelName)
      } else if (modelType === 'Qwen') {
        const images = batch.map((photo) => ({
          type: 'image_url',
          image_url: {
            url: this.getPhotoImageUrl(photo),
            detail: this.resolution,
          },
        }))
        const response = await describeImagesWithQwen(this.cloudTask(), images, modelName)
        if (!response) {
          throw new Error(`Respuesta vacía de ${modelName}`)
        }
        return this.ensureNonEmptyResult(response, modelName)
      } else if (modelType === 'Gemini') {
        // Gemini recibe las imágenes en línea, pero las descarga de R2 la nube a partir de su clave:
        // así la nube sabe qué foto analiza y la cobra una sola vez.
        const keyOf = (photo: Photo) =>
          this.imageUrlSource === 'thumbnail' && photo.thumbnailName ? photo.thumbnailName : photo.name
        const result = await describeImagesWithGemini(this.cloudTask(), batch.map(keyOf), modelName, {
          temperature: 0.1,
          mediaResolution:
            this.resolution == 'high' ? 'MEDIA_RESOLUTION_HIGH' : 'MEDIA_RESOLUTION_MEDIUM',
        })

        // Las fotos que no están en R2 se quedan sin resultado y pendientes para el reintento.
        if (result && result.result) {
          const missing = new Set<string>(result.missingKeys ?? [])
          if (missing.size > 0) {
            logger.debug(`${missing.size} fotos no disponibles en R2, continuando sin ellas`)
          }
          result.validPhotos = batch.filter((photo) => !missing.has(keyOf(photo)))
        }

        if (!result) {
          throw new Error(`Respuesta vacía de ${modelName}`)
        }

        return this.ensureNonEmptyResult(result, modelName)
      } else {
        throw new Error(`Modelo no soportado: ${modelName}`)
      }
    } catch (error) {
      logger.error(`Error en executeModelTask para modelo ${modelName}: ${this.formatError(error)}`)
      throw error
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
