import { DescriptionType, PhotoDescriptions } from '#models/photo'
import Photo from '#models/photo'
import PhotoManager from '../../managers/photo_manager.js'
import { AnalyzerTask } from './analyzerTask.js'
import Logger, { LogLevel } from '../../utils/logger.js'
import AnalyzerProcess from './analyzerProcess.js'
import pLimit from 'p-limit'
import { MediaResolution } from '@google/genai'
import PhotoImageService from '../../services/photo_image_service.js'

const logger = Logger.getInstance('AnalyzerProcess', 'VisionDescriptionTask')
logger.setLevel(LogLevel.DEBUG)

type PromptFunction = (photos: Photo[], userProfile?: string) => string
type Prompt = string | PromptFunction

export class VisionDescriptionTask extends AnalyzerTask {
  declare prompts: Prompt[]
  declare resolution: 'low' | 'high' | 'medium'
  declare sequential: boolean
  declare imagesPerRequest: number
  declare promptDependentField: DescriptionType
  declare promptsNames: DescriptionType[]
  declare data: Record<number, Record<string, string>>
  declare complete: boolean
  declare analyzerProcess: AnalyzerProcess
  declare visualAspects: boolean
  failedRequests: Photo[] = []

  async process(pendingPhotos: Photo[], analyzerProcess: AnalyzerProcess): Promise<void> {
    this.analyzerProcess = analyzerProcess
    this.failedRequests = []

    logger.debug(`VisionDescriptionTask usando perfil: ${analyzerProcess.userProfile || 'general'}`)

    const threshold = 2
    if (this.batchAPI && pendingPhotos.length > threshold) {
      await this.processWithBatchAPI(pendingPhotos)
    } else {
      await this.processWithDirectAPI(pendingPhotos)
    }

    this.failedRequests = []
  }

  /* =========================
     DIRECT API
     ========================= */

  private async processWithDirectAPI(pendingPhotos: Photo[]): Promise<void> {
    if (!this.data) this.data = {}

    const batches: Photo[][] = []
    for (let i = 0; i < pendingPhotos.length; i += this.imagesPerRequest) {
      const batch = pendingPhotos.slice(i, i + this.imagesPerRequest)
      batches.push(batch)
    }

    const maxConcurrency = 3
    const limit = pLimit(maxConcurrency)

    const processBatch = async (batch: Photo[]) => {
      let response: any
      const userProfile = this.analyzerProcess.userProfile || 'general'
      const injectedPrompts: any = this.prompts.map((p) =>
        typeof p === 'function' ? p(batch, userProfile) : p
      )

      logger.debug(
        `Llamando a ${this.model} para ${batch.length} imágenes con perfil ${userProfile}...`
      )

      try {
        if (this.model === 'GPT' || this.model === 'Qwen' || this.model === 'Gemini') {
          response = await this.executeModelTask(injectedPrompts, batch)
        } else {
          throw new Error(`Modelo no soportado: ${this.model}`)
        }
      } catch (err) {
        logger.error(`Error en ${this.model} para ${batch.length} imágenes:`, err)
        return
      }

      if (response && response.result && response.result.length > 0) {
        if (this.model === 'Gemini' && response.validPhotos) {
          response.result.forEach((res: any, photoIndex: number) => {
            const photoId = response.validPhotos[photoIndex].id
            this.data[photoId] = { ...this.data[photoId], ...res }
          })
          await this.commit(response.validPhotos)
        } else {
          response.result.forEach((res: any, photoIndex: number) => {
            const photoId = batch[photoIndex].id
            this.data[photoId] = { ...this.data[photoId], ...res }
          })
          await this.commit(batch)
        }
      } else {
        logger.warn(`No se obtuvieron resultados válidos para el batch de ${batch.length} imágenes`)
      }
    }

    if (this.sequential) {
      for (let i = 0; i < batches.length; i++) {
        await processBatch(batches[i])
        batches[i] = []
      }
    } else {
      await Promise.all(batches.map((batch) => limit(() => processBatch(batch))))
    }

    batches.length = 0
  }

  /* =========================
     BATCH API
     ========================= */

  private async processWithBatchAPI(pendingPhotos: Photo[]): Promise<void> {
    if (!this.data) this.data = {}

    const imagesPerBatch = 200
    const maxConcurrency = 6

    const batches: Photo[][] = []
    for (let i = 0; i < pendingPhotos.length; i += imagesPerBatch) {
      batches.push(pendingPhotos.slice(i, i + imagesPerBatch))
    }

    const limit = pLimit(maxConcurrency)

    const batchPromises = batches.map((batchPhotos) =>
      limit(() => this.processSingleBatch(batchPhotos))
    )

    await Promise.all(batchPromises)

    batches.length = 0

    if (this.failedRequests.length > 0) {
      logger.warn(`Reprocesando ${this.failedRequests.length} imágenes fallidas con DirectAPI`)
      await this.processWithDirectAPI(this.failedRequests)
      this.failedRequests = []
    }
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
      logger.error(`Error guardando datos de VisionTask:`, err)
    }
  }

  private async processSingleBatch(batchPhotos: Photo[]): Promise<void> {
    const userProfile = this.analyzerProcess.userProfile || 'general'
    const prompts = this.prompts.map((p) =>
      typeof p === 'function' ? p(batchPhotos, userProfile) : p
    )

    if (this.model === 'Gemini') {
      await this.processSingleBatchGemini(batchPhotos, prompts)
    } else {
      await this.processSingleBatchGPT(batchPhotos, prompts)
    }
  }

  /* =========================
     GEMINI BATCH (OFICIAL)
     ========================= */

  private async processSingleBatchGemini(batchPhotos: Photo[], prompts: string[]): Promise<void> {
    const imagesPerRequest = this.imagesPerRequest
    const requests: any[] = []

    const photoImageService = PhotoImageService.getInstance()
    const validImages = await photoImageService.getValidPhotosWithImages(batchPhotos, false)

    const failedPhotos = batchPhotos.filter(
      (photo) => !validImages.some((vi) => vi.photo.id === photo.id)
    )
    if (failedPhotos.length > 0) {
      this.failedRequests.push(...failedPhotos)
    }

    if (validImages.length === 0) {
      logger.warn('No se pudieron obtener imágenes para ninguna foto del batch')
      return
    }

    for (let j = 0; j < validImages.length; j += imagesPerRequest) {
      const chunk = validImages.slice(j, j + imagesPerRequest)
      const key = chunk.map((item) => item.photo.id).join('-')

      const parts = [
        { text: prompts[0] },
        ...chunk.map((item) => ({
          inlineData: {
            mimeType: 'image/png',
            data: item.base64,
          },
        })),
      ]

      const request = {
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 15000,
          responseMimeType: 'application/json',
        },
      }

      requests.push({ key, request })
    }

    let batchName: string | null = null
    try {
      batchName = await this.modelsService.submitGeminiBatch(requests, `Photos_Batch_${Date.now()}`)
    } catch (error) {
      logger.error(`Error al enviar batch Gemini:`, error)
      this.failedRequests.push(...batchPhotos)
      return
    }

    if (!batchName) {
      logger.error(`No se pudo crear el batch Gemini`)
      this.failedRequests.push(...batchPhotos)
      return
    }

    logger.debug(`Batch Gemini creado: ${batchName}`)

    let state: string | undefined = 'RUNNING'
    let attempts = 0
    const maxAttempts = 180

    while (
      (state === 'RUNNING' ||
        state === 'PENDING' ||
        state === 'VALIDATING' ||
        state === 'FINALIZING') &&
      attempts < maxAttempts
    ) {
      await this.sleep(5000)
      attempts++
      state = await this.modelsService.getGeminiBatchStatus(batchName)
      logger.debug(`Estado batch ${batchName}: ${state}`)
    }

    if (state !== 'SUCCEEDED') {
      logger.error(`Batch Gemini ${batchName} terminó en estado ${state}`)
      this.failedRequests.push(...batchPhotos)
      return
    }

    let rawResults: any[] = []
    try {
      rawResults = await this.modelsService.getGeminiBatchResultsInline(batchName)
    } catch (error) {
      logger.error(`Error obteniendo resultados del batch Gemini:`, error)
      this.failedRequests.push(...batchPhotos)
      return
    }

    rawResults.forEach((line: any) => {
      const key = line.key
      const response = line.response

      if (!key || !response?.candidates?.length) return

      const photoIds = key.split('-').map(Number)
      const parts = response.candidates[0]?.content?.parts || []
      const textPart = parts.find((p: any) => p.text)

      if (!textPart) return

      try {
        const parsed = JSON.parse(textPart.text)
        photoIds.forEach((photoId) => {
          this.data[photoId] = { ...this.data[photoId], ...parsed }
        })
      } catch (e) {
        logger.error(`Error parseando JSON Gemini batch (${key}):`, e)
      }
    })

    const validPhotoIds = validImages.map((v) => v.photo.id)
    const photosToCommit = batchPhotos.filter((p) => validPhotoIds.includes(p.id))

    if (photosToCommit.length > 0) {
      await this.commit(photosToCommit)
      logger.debug(`Datos salvados del batch Gemini para ${photosToCommit.length} imágenes`)
    }
  }

  /* =========================
     GPT BATCH
     ========================= */

  private async processSingleBatchGPT(batchPhotos: Photo[], prompts: string[]): Promise<void> {
    const imagesPerRequest = this.imagesPerRequest
    const maxRetries = 1
    let attempt = 0
    let completed = false
    let batchId: string | null = null
    let status = 'in_progress'
    let requests: any[] = []

    const isGpt5NonChat = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.1'].includes(this.modelName)

    while (attempt < maxRetries && !completed) {
      requests = []
      for (let j = 0; j < batchPhotos.length; j += imagesPerRequest) {
        const batch = batchPhotos.slice(j, j + imagesPerRequest)
        const customId = batch.map((p) => p.id).join('-')
        const userContent = batch.map((photo) => ({
          type: 'image_url',
          image_url: {
            url: photo.originalUrl,
            detail: this.resolution,
          },
        }))

        const body: any = {
          model: this.modelName,
          messages: [
            { role: 'system', content: prompts[0] },
            { role: 'user', content: userContent },
          ],
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

      batchId = await this.modelsService.submitGPTBatch(requests)

      status = 'in_progress'
      while (status === 'in_progress' || status === 'finalizing' || status === 'validating') {
        await this.sleep(8000)
        status = await this.modelsService.getBatchStatus(batchId)
      }

      if (status === 'completed') completed = true
      else attempt++
    }

    if (!completed || !batchId) {
      this.failedRequests.push(...batchPhotos)
      return
    }

    const results = await this.modelsService.getBatchResults(batchId)

    results.forEach((res: any) => {
      const items = res.items || []
      const photoIds = res.custom_id.split('-').map(Number)

      if (items.length !== photoIds.length) {
        this.failedRequests.push(...batchPhotos.filter((p) => photoIds.includes(p.id)))
        return
      }

      items.forEach((photoResult: any, idx: number) => {
        const photoId = photoIds[idx]
        this.data[photoId] = { ...this.data[photoId], ...photoResult }
      })
    })

    await this.commit(batchPhotos)
  }

  /* =========================
     DIRECT MODEL CALL
     ========================= */

  private async executeModelTask(prompts: string[], batch: Photo[]): Promise<any> {
    const prompt = prompts[0]

    try {
      if (this.model === 'GPT') {
        const images = batch.map((photo) => ({
          type: 'image_url',
          image_url: {
            url: photo.originalUrl,
            detail: this.resolution,
          },
        }))

        return await this.modelsService.getGPTResponse(
          prompt,
          images,
          this.modelName,
          null,
          0,
          false
        )
      } else if (this.model === 'Qwen') {
        const images = batch.map((photo) => ({
          type: 'image_url',
          image_url: {
            url: photo.originalUrl,
            detail: this.resolution,
          },
        }))

        return await this.modelsService.getQwenResponse(
          prompt,
          images,
          'qwen-vl-max',
          null,
          0,
          false
        )
      } else if (this.model === 'Gemini') {
        const photoImageService = PhotoImageService.getInstance()
        const validImages = await photoImageService.getValidPhotosWithImages(batch, false)

        if (validImages.length === 0) return { result: [] }

        const imagesWithIds = validImages.map(({ photo, base64 }) => ({
          photo,
          imageData: {
            inlineData: {
              mimeType: 'image/png',
              data: base64,
            },
          },
        }))

        const images = imagesWithIds.map((item) => item.imageData)
        const validPhotos = imagesWithIds.map((item) => item.photo)

        const result = await this.modelsService.getGeminiResponse(
          prompt,
          images,
          this.modelName,
          {
            temperature: 0.1,
            mediaResolution:
              this.resolution == 'high'
                ? MediaResolution.MEDIA_RESOLUTION_HIGH
                : MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          },
          false
        )

        images.forEach((img) => (img.inlineData.data = ''))
        images.length = 0

        if (result && result.result) {
          result.validPhotos = validPhotos
        }

        return result
      } else {
        throw new Error(`Modelo no soportado: ${this.model}`)
      }
    } catch (error) {
      logger.error(`Error en executeModelTask para modelo ${this.model}:`, error)
      return { result: [] }
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
