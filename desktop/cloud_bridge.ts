import logger from '@adonisjs/core/services/logger'
import ModelsService from '#services/models_service'
import UsageService from '#services/usage_service'
import CatalogController from '#controllers/catalog_controller'
import { VisionDescriptionTask } from '#models/analyzer/visionDescriptionTask'
import { TagTask } from '#models/analyzer/tagTask'
import { createTrackedModelsService } from '../app/utils/cost_tracker.js'
import CloudAccountService from './services/cloud_account_service.js'
import { callGateway } from './gateway_client.js'
import { ANALYSIS_TASK_METHODS, COMPUTE_METHODS, LLM_METHODS, WARMUP_METHODS } from './gateway_methods.js'

/**
 * Puente con la nube (solo en modo desktop): todo lo que necesita claves o secretos se pide al
 * servicio de la nube. Es el único sitio donde el escritorio se aparta del código de App en
 * tiempo de ejecución; ver README de Desktop.
 */

const proto = ModelsService.prototype as any

// Cálculo (Python, RunPod): se reenvía tal cual con el token del usuario.
for (const method of COMPUTE_METHODS) {
  proto[method] = function (...args: any[]) {
    return callGateway('/compute', { method, args })
  }
}

for (const method of WARMUP_METHODS) {
  proto[method] = async () => true
}

// Red de seguridad: ninguna llamada directa a un modelo sale del escritorio. Las que hagan
// falta pasan por funciones con nombre del servicio, que componen el prompt allí.
for (const method of LLM_METHODS) {
  proto[method] = async function () {
    throw new Error(`[escritorio] ${method} no está disponible sin una función de la nube`)
  }
}

/**
 * ModelsService de una tarea de análisis: envía al servicio la identidad de la tarea y los
 * datos (imágenes, descripción), nunca el prompt ni el esquema de respuesta, que el servicio
 * reconstruye con su propia copia de analyzer_packages.
 */
function remoteTaskModels(task: any): ModelsService {
  const service = new ModelsService() as any
  const process = task.analyzerProcess
  const call = (method: string, args: any[]) =>
    callGateway(
      '/analysis',
      {
        method,
        packageId: process.packageId,
        taskName: task.name,
        userProfile: process.userProfile || 'general',
        processId: process.id,
        args,
      },
      process.userId
    )

  for (const method of ANALYSIS_TASK_METHODS) {
    service[method] = (...args: any[]) => {
      switch (method) {
        case 'getGPTResponse':
        case 'getQwenResponse':
          // (prompt, contenido, modelo, formato de respuesta, temperatura, caché)
          return call(method, [args[1], args[2], null, args[4], args[5]])
        case 'getGeminiResponse':
          // (prompt, imágenes, modelo, opciones, caché)
          return call(method, [args[1], args[2], args[3], args[4]])
        case 'submitGPTBatch':
          return call(method, [stripBatchPrompts(args[0])])
        default:
          return call(method, args)
      }
    }
  }
  return createTrackedModelsService(service, process.costTracker, task)
}

/** Quita de cada petición del lote el prompt de sistema y el esquema; el servicio los pone. */
function stripBatchPrompts(requests: any[]) {
  return requests.map((request) => {
    const { response_format: _schema, ...body } = request.body
    return { ...request, body: { ...body, messages: body.messages.filter((m: any) => m.role !== 'system') } }
  })
}

for (const TaskClass of [VisionDescriptionTask, TagTask] as any[]) {
  const originalProcess = TaskClass.prototype.process
  TaskClass.prototype.process = function (...args: any[]) {
    this.modelsService = remoteTaskModels(this)
    return originalProcess.apply(this, args)
  }
}

// Subidas a R2 en su propia carpeta (desktop/main/<id>/, desktop/thumbs/<id>/): ninguna
// limpieza de la nube que recorra main/<id>/ contra la base de producción puede tocarlas.
const originalPhotoKeys = (CatalogController.prototype as any).generatePhotoKeys
;(CatalogController.prototype as any).generatePhotoKeys = function (...args: any[]) {
  const keys = originalPhotoKeys.apply(this, args)
  return { ...keys, key: `desktop/${keys.key}`, thumbnailKey: `desktop/${keys.thumbnailKey}` }
}

// El servicio firma las URLs (el secreto no está en el escritorio).
;(CatalogController.prototype as any).generateUploadUrls = async function (key: string, thumbnailKey: string, contentType: string) {
  const { uploadUrl, thumbnailUploadUrl } = await callGateway('/uploads/sign', { key, thumbnailKey, contentType })
  return [uploadUrl, thumbnailUploadUrl] as const
}

// Cuota de análisis: la manda la cuenta de la nube.
const usage = UsageService as any
usage.hasCapacityToAnalyze = async (userId: number, photoCount: number) => {
  const { ok } = await callGateway('/quota/check', { photoCount }, userId)
  return ok === true
}
usage.incrementAnalyzedPhotosUsed = async (userId: number, amount: number) => {
  const { account } = await callGateway('/quota/consume', { amount }, userId)
  await CloudAccountService.saveAccount(account).catch((error) =>
    logger.warn(`[cloud] cuota descontada, pero no se pudo copiar la cuenta: ${error.message}`)
  )
}
