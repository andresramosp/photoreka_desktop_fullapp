import db from '@adonisjs/lucid/services/db'
import CloudAccountService from './services/cloud_account_service.js'

/**
 * Funciones con nombre del servicio de la nube del escritorio (proyecto Desktop/gateway).
 * Es la única salida a la nube de la API local, aparte del inicio de sesión, y solo cubre lo que
 * necesita claves o la cuenta: modelos de lenguaje, cobro de búsquedas, firma de subidas a R2 y
 * cuota de análisis.
 */

export class CloudFunctionError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: any = null
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
    throw new CloudFunctionError(data?.message || `El servicio respondió ${response.status}`, response.status, data)
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

// ─── Notas ───────────────────────────────────────────────────────────────────

/**
 * Tags en bruto de la nota personal de una foto (`null` si el modelo no dio una lista). Se
 * cobran en la nube; sin créditos lanza CloudFunctionError con estado 402.
 */
export async function extractNoteTags(userId: number, note: string): Promise<unknown[] | null> {
  const { tags } = await call('/notes/tags', { note }, userId)
  return Array.isArray(tags) ? tags : null
}

// ─── Ubicación ───────────────────────────────────────────────────────────────

/** Trabajo de inferencia de ubicación en curso en la nube: cada llamada al modelo se cobra a él. */
export type LocationTicket = { id: string; userId: number }

/**
 * Empieza un trabajo de inferencia de ubicación. La nube comprueba que la cuenta tenga los
 * créditos de la estimación (con su margen); si no, CloudFunctionError con estado 402.
 */
export async function startLocationInference(userId: number, estimatedEur: number): Promise<LocationTicket> {
  const { ticket } = await call('/location/start', { estimatedEur }, userId)
  return { id: ticket, userId }
}

/** Ubicación probable de un lote de fotos (por la clave de su imagen en R2), con lo que costó. */
export async function inferPhotoLocations(
  ticket: LocationTicket,
  photos: { id: number; filename: string; key: string }[]
): Promise<{ result: unknown; credits: number; costEur: number }> {
  return call('/location/infer', { ticket: ticket.id, photos }, ticket.userId)
}

/** Geocodificación en la nube (proveedores, caché y cupo mensual de producción). */
export async function geocodeInCloud(userId: number, query: string, options: Record<string, unknown>) {
  return call('/location/geocode', { query, options }, userId)
}

/** Buscador de lugares (Mapbox): sugerencias y lugar elegido. */
export function suggestPlaces(userId: number, body: Record<string, unknown>) {
  return call('/places/suggest', body, userId)
}

export function retrievePlace(userId: number, body: Record<string, unknown>) {
  return call('/places/retrieve', body, userId)
}

// ─── Portfolios ──────────────────────────────────────────────────────────────

/** Construcción de portfolio en curso en la nube: cada llamada al modelo se cobra a ella. */
export type PortfolioTicket = { id: string; userId: number }
/** Foto para el modelo: su línea de metadatos y la clave de su miniatura en R2. */
export type PortfolioCloudPhoto = { id: number; line: string; key: string }
type Charged<T> = { result: T; credits: number; costEur: number }

/** Empieza una construcción; sin créditos, CloudFunctionError con estado 402. */
export async function startPortfolioBuild(userId: number): Promise<PortfolioTicket> {
  const { ticket } = await call('/portfolio/start', {}, userId)
  return { id: ticket, userId }
}

/** Criterios a enfatizar o atenuar según la descripción de estilo (vista previa: no se cobra). */
export async function parsePortfolioStyle(userId: number, stylePreferences: string, userProfile: string | null) {
  const { result } = await call('/portfolio/style', { stylePreferences, userProfile }, userId)
  return result
}

export function parsePortfolioFreetext(ticket: PortfolioTicket, freetext: string): Promise<Charged<any>> {
  return call('/portfolio/freetext', { ticket: ticket.id, freetext }, ticket.userId)
}

export function evaluatePortfolioBatch(
  ticket: PortfolioTicket,
  input: Record<string, unknown> & { photos: PortfolioCloudPhoto[] }
): Promise<Charged<{ decisions: any[]; unavailableImageIds: number[] }>> {
  return call('/portfolio/evaluate', { ticket: ticket.id, ...input }, ticket.userId)
}

export function refinePortfolioBatch(
  ticket: PortfolioTicket,
  input: Record<string, unknown> & { photos: PortfolioCloudPhoto[] }
): Promise<Charged<{ notes?: string; flagged_ids: number[] }>> {
  return call('/portfolio/refine', { ticket: ticket.id, ...input }, ticket.userId)
}

// ─── Informes de patrones ────────────────────────────────────────────────────

/**
 * Foto de la muestra de un grupo: su texto en los informes de historia y contexto, o su nombre y la
 * clave de su miniatura en el general, que va con imágenes.
 */
export type ReportCloudPhoto = { id: number; text?: string; filename?: string; key?: string }

/**
 * Comprueba si el usuario puede lanzar un informe. Son gratis, pero con un tope diario de gasto en
 * la nube: superado, CloudFunctionError con estado 429.
 */
export async function startReport(userId: number) {
  await call('/report/start', {}, userId)
}

/** Patrón de un grupo de fotos; null si el modelo no dio una respuesta válida tras los reintentos. */
export async function analyzeReportCluster(
  userId: number,
  input: { reviewType: string; photos: ReportCloudPhoto[]; existingPatterns: unknown[] }
): Promise<any | null> {
  const { result } = await call('/report/cluster', input, userId)
  return result
}

/** Fusiones entre patrones repetidos; null si el modelo no dio una respuesta válida. */
export async function deduplicateReportPatterns(
  userId: number,
  input: { reviewType: string; patterns: unknown[] }
): Promise<{ merges: any[] } | null> {
  const { result } = await call('/report/deduplicate', input, userId)
  return result
}

// ─── Canvas sugeridos ────────────────────────────────────────────────────────

/**
 * Temas de moodboard a partir de los patrones del informe (gratis, con tope diario en la nube).
 * Devuelve la respuesta del modelo tal cual; null si no la dio.
 */
export async function proposeCanvasThemes(
  userId: number,
  patterns: { title: string; description: string }[],
  profile: string | null
): Promise<any | null> {
  const { result } = await call('/canvas/themes', { patterns, profile }, userId)
  return result
}

// ─── Archivos de fotos en R2 ─────────────────────────────────────────────────

/**
 * R2 es el de producción, compartido con la web: el escritorio solo puede tocar archivos de su
 * carpeta (desktop/). Las fotos con otras claves (por ejemplo, las importadas de un volcado de
 * producción) nunca se envían a la nube para borrar ni copiar.
 */
export const isDesktopFileKey = (key: unknown): key is string => typeof key === 'string' && key.startsWith('desktop/')

/** Borra archivos de la carpeta del escritorio del usuario. Devuelve las claves que no se pudieron borrar. */
export async function deletePhotoFiles(userId: number, keys: string[]): Promise<string[]> {
  const own = keys.filter(isDesktopFileKey)
  if (own.length !== keys.length) throw new Error('Solo se borran archivos de la carpeta del escritorio')
  const failed: string[] = []
  for (let i = 0; i < own.length; i += 256) {
    const response = await call('/photos/files/delete', { keys: own.slice(i, i + 256) }, userId)
    failed.push(...response.failed)
  }
  return failed
}

/** Copia archivos dentro de la carpeta del escritorio del usuario. */
export async function copyPhotoFiles(userId: number, copies: { from: string; to: string }[]) {
  if (!copies.every((c) => isDesktopFileKey(c.from) && isDesktopFileKey(c.to))) {
    throw new Error('Solo se copian archivos de la carpeta del escritorio')
  }
  await call('/photos/files/copy', { copies }, userId)
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

/** La cuenta tal como está ahora en la nube (créditos tras una búsqueda, por ejemplo). */
export async function cloudAccount(userId: number) {
  const { account } = await call('/account', {}, userId)
  return account
}

/** Margen vigente de una categoría de cobro, para que las estimaciones de coste usen el mismo. */
export async function creditMargin(userId: number, category: string): Promise<number> {
  const { margins } = await call('/account', {}, userId)
  return Number(margins?.[category] ?? 1)
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

export type SearchCategory = 'SEARCH' | 'SEARCH_PRECISE'

/** Búsqueda en curso en la nube: cada paso con modelo se cobra a ella. */
export type SearchTicket = { id: string; userId: number }

/**
 * Empieza una búsqueda en la nube. Con créditos devuelve el pase de búsqueda; sin ellos, la
 * búsqueda normal es básica (sin pase: sin modelo de lenguaje ni coste) y la precisa se rechaza
 * con CloudFunctionError de estado 402, con la respuesta de la nube en `data`.
 */
export async function startSearch(userId: number, category: SearchCategory, pagination: boolean) {
  const { mode, ticket, account } = await call('/search/start', { category, pagination }, userId)
  const searchTicket: SearchTicket | null = mode === 'paid' ? { id: ticket, userId } : null
  return { ticket: searchTicket, account }
}

function searchStep(ticket: SearchTicket, path: string, body: Record<string, unknown>) {
  return call(path, { ticket: ticket.id, ...body }, ticket.userId).then((response) => response.result)
}

/** Consulta acortada a `maxWords` palabras para CLIP. */
export function compactSearchQuery(ticket: SearchTicket, query: string, maxWords: number) {
  return searchStep(ticket, '/search/compact', { query, maxWords })
}

/** Resultados en bruto de la consulta sin prefijo, sus metadatos y su estructura. */
export function structureSearchQuery(ticket: SearchTicket, query: string, variant: 'standard' | 'implicit_only') {
  return searchStep(ticket, '/search/structure', { query, variant })
}

/** Veredicto de inferencia lógica de cada candidato frente al término buscado. */
export function classifyEntailment(
  ticket: SearchTicket,
  term: string,
  candidates: string[],
  termsType: 'tag' | 'desc'
): Promise<{ name: string; label: 'entailment' | 'neutral' | 'contradiction'; confidence: number }[]> {
  return searchStep(ticket, '/search/entailment', { term, candidates, termsType })
}
