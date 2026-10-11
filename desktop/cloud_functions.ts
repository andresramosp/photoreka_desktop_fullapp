import db from '@adonisjs/lucid/services/db'
import CloudAccountService from './services/cloud_account_service.js'

/**
 * Funciones con nombre del servicio de la nube del escritorio (proyecto Desktop/gateway).
 * Es la única salida a la nube de la API local, aparte del inicio de sesión, y solo cubre lo que
 * necesita claves o la cuenta: modelos de lenguaje, firma de subidas a R2 y cuota de análisis.
 */

export class CloudFunctionError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

/**
 * Tarea de análisis que hace la llamada. El servicio busca con ella su configuración en
 * analyzer_packages y compone allí el prompt y el esquema de respuesta.
 */
export type AnalysisTaskRef = {
  userId: number | null
  packageId: string
  taskName: string
  userProfile: string
  processId?: string
}

function baseUrl(): string {
  const url = process.env.PHOTOREKA_GATEWAY
  if (!url) throw new Error('Falta la variable PHOTOREKA_GATEWAY')
  return url.replace(/\/+$/, '')
}

/**
 * Token del usuario indicado o, si no se indica (cálculos sin usuario a mano), el de la última
 * sesión sincronizada: el escritorio es de un usuario.
 */
async function tokenFor(userId?: number | null): Promise<string> {
  let id = userId ?? null
  if (!id) {
    const row = await db.from('cloud_sessions').orderBy('synced_at', 'desc').select('user_id').first()
    id = row?.user_id ?? null
  }
  const token = id ? await CloudAccountService.cloudToken(id) : null
  if (!token) throw new CloudFunctionError('No hay sesión de la nube: inicia sesión de nuevo', 401)
  return token
}

async function call<T = any>(path: string, body: unknown, userId?: number | null): Promise<T> {
  const response = await fetch(`${baseUrl()}/gateway${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${await tokenFor(userId)}`,
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new CloudFunctionError(data?.message || `El servicio respondió ${response.status}`, response.status)
  }
  return data as T
}

function analysis(task: AnalysisTaskRef, method: string, args: unknown[]) {
  const { userId, ...identity } = task
  return call('/analysis', { method, ...identity, args }, userId)
}

// ─── Análisis de fotos ───────────────────────────────────────────────────────

/** Descripción de un lote de imágenes con Gemini (imágenes en base64, formato inlineData). */
export function describeImagesWithGemini(task: AnalysisTaskRef, images: unknown[], modelName: string, options: Record<string, unknown>) {
  return analysis(task, 'getGeminiResponse', [images, modelName, options, false])
}

/** Descripción de un lote de imágenes con un modelo de OpenAI (imágenes por URL). */
export function describeImagesWithGPT(task: AnalysisTaskRef, images: unknown[], modelName: string) {
  return analysis(task, 'getGPTResponse', [images, modelName, null, 0, false])
}

/** Descripción de un lote de imágenes con Qwen (imágenes por URL). */
export function describeImagesWithQwen(task: AnalysisTaskRef, images: unknown[], modelName: string) {
  return analysis(task, 'getQwenResponse', [images, modelName, null, 0, false])
}

/** Tags de una foto a partir de su descripción. */
export function extractTagsWithGPT(task: AnalysisTaskRef, description: string, modelName: string) {
  return analysis(task, 'getGPTResponse', [description, modelName, null, 0.1, false])
}

export function extractTagsWithGemini(task: AnalysisTaskRef, description: string, modelName: string) {
  return analysis(task, 'getGeminiResponse', [[description], modelName, null, false])
}

/**
 * Lote diferido de OpenAI. Cada petición lleva solo el modelo, sus parámetros y las imágenes;
 * el servicio añade a cada una el prompt de sistema y el esquema de la tarea.
 */
export function submitAnalysisBatch(task: AnalysisTaskRef, requests: unknown[]): Promise<string> {
  return analysis(task, 'submitGPTBatch', [requests])
}

export function analysisBatchStatus(task: AnalysisTaskRef, batchId: string): Promise<string> {
  return analysis(task, 'getBatchStatus', [batchId])
}

export function analysisBatchResults(task: AnalysisTaskRef, batchId: string): Promise<any[]> {
  return analysis(task, 'getBatchResults', [batchId])
}

// ─── Subidas y cuota ─────────────────────────────────────────────────────────

/** URLs firmadas para subir una foto y su miniatura a la carpeta desktop/ de R2. */
export async function signPhotoUploads(userId: number, key: string, thumbnailKey: string, contentType: string) {
  const { uploadUrl, thumbnailUploadUrl } = await call('/uploads/sign', { key, thumbnailKey, contentType }, userId)
  return [uploadUrl as string, thumbnailUploadUrl as string] as const
}

export async function hasAnalysisQuota(userId: number, photoCount: number): Promise<boolean> {
  const { ok } = await call('/quota/check', { photoCount }, userId)
  return ok === true
}

/** Descuenta fotos analizadas de la cuenta y devuelve la cuenta actualizada. */
export async function consumeAnalysisQuota(userId: number, amount: number) {
  const { account } = await call('/quota/consume', { amount }, userId)
  return account
}
