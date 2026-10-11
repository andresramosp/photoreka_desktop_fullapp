import type { HttpContext } from '@adonisjs/core/http'
import redis from '@adonisjs/redis/services/main'
import logger from '@adonisjs/core/services/logger'
import ModelsService from '#services/models_service'
import UsageService from '#services/usage_service'
import PaymentService from '#services/payment_service'
import UserCostService from '#services/user_cost_service'
import CatalogController from '#controllers/catalog_controller'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import { getTaskList } from '../../app/analyzer_packages.js'
import { CostTracker, createTrackedModelsService } from '../../app/utils/cost_tracker.js'
import { ANALYSIS_TASK_METHODS, COMPUTE_METHODS } from '../gateway_methods.js'

/** Lotes de OpenAI: de quién es cada uno, para que solo su dueño lo consulte. */
const BATCH_OWNER_TTL_SECONDS = 7 * 24 * 3600
const batchOwnerKey = (batchId: string) => `gateway:batch:${batchId}`

/** Modelos fijos que usa la tarea de tags (tagTask.ts); el resto sale de la configuración de la tarea. */
const TAG_TASK_MODELS = ['gpt-5-nano', 'gemini-2.5-flash-lite']

class GatewayRejection extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}

export default class GatewayController {
  async health({ response }: HttpContext) {
    return response.ok({ ok: true })
  }

  async compute({ auth, request, response }: HttpContext) {
    const user = auth.use('api').user!
    const { method, args } = request.only(['method', 'args'])
    if (!COMPUTE_METHODS.includes(method)) return response.badRequest({ message: `Método no permitido: ${method}` })
    const service = new ModelsService() as any
    try {
      return response.ok(await service[method](...(Array.isArray(args) ? args : [])))
    } catch (error) {
      logger.error(`[gateway] compute ${method} (usuario ${user.id}): ${(error as Error).message}`)
      return response.internalServerError({ message: `Fallo en ${method}` })
    }
  }

  /**
   * Funciones del análisis. El escritorio manda la identidad de la tarea (paquete y nombre) y
   * los datos; el prompt y el esquema se reconstruyen aquí desde analyzer_packages.
   */
  async analysis({ auth, request, response }: HttpContext) {
    const user = auth.use('api').user!
    const { method, packageId, taskName, userProfile, processId, args = [] } = request.all()
    try {
      if (!ANALYSIS_TASK_METHODS.includes(method)) throw new GatewayRejection(`Método no permitido: ${method}`)
      const task = this.findTask(packageId, taskName, userProfile)
      const tracker = new CostTracker('photo_analysis')
      const service = createTrackedModelsService(new ModelsService(), tracker, task) as any

      let result: any
      switch (method) {
        case 'getGPTResponse':
        case 'getQwenResponse': {
          await this.assertQuota(user.id)
          const [content, modelName, , temperature, cache] = args
          this.assertModel(task, modelName)
          const { prompt, responseFormat } = this.promptFor(task, userProfile, content)
          result = await service[method](prompt, content, modelName, method === 'getGPTResponse' ? responseFormat : null, temperature, cache)
          break
        }
        case 'getGeminiResponse': {
          await this.assertQuota(user.id)
          const [images, modelName, options, cache] = args
          this.assertModel(task, modelName)
          const { prompt } = this.promptFor(task, userProfile, images)
          result = await service.getGeminiResponse(prompt, images, modelName, options, cache)
          break
        }
        case 'submitGPTBatch': {
          await this.assertQuota(user.id)
          const requests = (args[0] as any[]).map((request) => this.withBatchPrompt(task, userProfile, request))
          const batchId = await service.submitGPTBatch(requests)
          await redis.set(batchOwnerKey(batchId), String(user.id), 'EX', BATCH_OWNER_TTL_SECONDS)
          result = batchId
          break
        }
        case 'getBatchStatus':
        case 'getBatchResults': {
          const owner = await redis.get(batchOwnerKey(args[0]))
          if (owner !== String(user.id)) throw new GatewayRejection('Lote desconocido', 404)
          result = await service[method](args[0])
          break
        }
      }

      const cost = tracker.getSummary().totalCostInEur
      if (cost > 0) {
        UserCostService.record(user.id, 'photo_analysis', cost, 1, {
          task: taskName,
          referenceId: processId ? String(processId) : undefined,
          metadata: { source: 'desktop', method },
        }).catch((error) => logger.warn(`[gateway] no se pudo registrar el coste: ${error.message}`))
      }
      return response.ok(result ?? null)
    } catch (error) {
      if (error instanceof GatewayRejection) return response.status(error.status).send({ message: error.message })
      logger.error(`[gateway] analysis ${method} ${packageId}/${taskName} (usuario ${user.id}): ${(error as Error).message}`)
      return response.internalServerError({ message: `Fallo en ${method}` })
    }
  }

  async signUpload({ auth, request, response }: HttpContext) {
    const user = auth.use('api').user!
    const { key, thumbnailKey, contentType } = request.only(['key', 'thumbnailKey', 'contentType'])
    const ownKey = (k: unknown, prefix: string) =>
      typeof k === 'string' && k.startsWith(`${prefix}/${user.id}/`) && !k.includes('..')
    if (!ownKey(key, 'main') || !ownKey(thumbnailKey, 'thumbs')) return response.forbidden({ message: 'Clave ajena' })
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return response.badRequest({ message: 'Tipo no permitido' })
    const [uploadUrl, thumbnailUploadUrl] = await (new CatalogController() as any).generateUploadUrls(key, thumbnailKey, contentType)
    return response.ok({ uploadUrl, thumbnailUploadUrl })
  }

  async quotaCheck({ auth, request, response }: HttpContext) {
    const photoCount = Number(request.input('photoCount'))
    if (!Number.isInteger(photoCount) || photoCount <= 0) return response.badRequest({ message: 'photoCount inválido' })
    return response.ok({ ok: await UsageService.hasCapacityToAnalyze(auth.use('api').user!.id, photoCount) })
  }

  async quotaConsume({ auth, request, response }: HttpContext) {
    const user = auth.use('api').user!
    const amount = Number(request.input('amount'))
    if (!Number.isInteger(amount) || amount <= 0) return response.badRequest({ message: 'amount inválido' })
    await UsageService.incrementAnalyzedPhotosUsed(user.id, amount)
    await user.refresh()
    return response.ok({ account: await this.account(user) })
  }

  // ─── Reconstrucción de tareas ─────────────────────────────────────────────

  private findTask(packageId: string, taskName: string, userProfile: string): any {
    const process = new AnalyzerProcess()
    process.packageId = packageId
    process.userProfile = userProfile || 'general'
    let tasks: any[]
    try {
      tasks = getTaskList(packageId, process).flat()
    } catch {
      throw new GatewayRejection(`Paquete desconocido: ${packageId}`)
    }
    const task = tasks.find((t) => t.name === taskName)
    if (!task) throw new GatewayRejection(`Tarea desconocida: ${packageId}/${taskName}`)
    return task
  }

  private isVisionTask(task: any) {
    return Array.isArray(task.prompts)
  }

  private assertModel(task: any, modelName: string) {
    const allowed = this.isVisionTask(task) ? [task.modelName, task.retryModel].filter(Boolean) : TAG_TASK_MODELS
    if (!allowed.includes(modelName)) throw new GatewayRejection(`Modelo no permitido para ${task.name}: ${modelName}`)
  }

  /** El prompt de la tarea solo depende del nº de fotos del lote y del perfil del usuario. */
  private promptFor(task: any, userProfile: string, content: unknown) {
    if (!this.isVisionTask(task)) return { prompt: task.prompt as string, responseFormat: null }
    const photoCount = Array.isArray(content) ? content.length : 1
    const batch = Array.from({ length: photoCount }, (_, i) => ({ id: i }))
    const profile = userProfile || 'general'
    const first = task.prompts[0]
    const prompt = typeof first === 'function' ? first(batch, profile) : first
    const schema = task.responseSchema ? task.responseSchema(batch, profile) : null
    const responseFormat = schema ? { type: 'json_schema', json_schema: { name: 'batch_result', strict: true, schema } } : null
    return { prompt, responseFormat }
  }

  private withBatchPrompt(task: any, userProfile: string, request: any) {
    if (!this.isVisionTask(task)) throw new GatewayRejection('Esta tarea no usa lotes')
    this.assertModel(task, request.body?.model)
    const userMessage = (request.body.messages as any[]).find((m) => m.role === 'user')
    const { prompt, responseFormat } = this.promptFor(task, userProfile, userMessage?.content)
    const body: any = { ...request.body, messages: [{ role: 'system', content: prompt }, userMessage] }
    if (responseFormat) body.response_format = responseFormat
    return { ...request, body }
  }

  private async assertQuota(userId: number) {
    const usage = await UsageService.getUsage(userId)
    if (!usage || !usage.analyzedPhotosRemaining || usage.analyzedPhotosRemaining <= 0) {
      throw new GatewayRejection('Cuota de análisis agotada', 402)
    }
  }

  /** Mismo formato que el perfil de la API de la nube (CloudAccount en el escritorio). */
  private async account(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      isEmailConfirmed: user.isEmailConfirmed,
      hasCompletedPurchase: await PaymentService.hasCompletedPurchase(user.id),
      preferredSource: user.preferredSource,
      profiles: user.profiles,
      usage: await UsageService.getUsage(user.id),
    }
  }
}
