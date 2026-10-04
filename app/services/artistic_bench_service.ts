import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import pLimit from 'p-limit'
import Photo from '#models/photo'
import User from '#models/user'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import { VisionDescriptionTask } from '#models/analyzer/visionDescriptionTask'
import { PRICES, USD_TO_EUR, type ModelName } from '#services/models_service'
import { extractAllTasks } from '../analyzer_packages.js'
import { getArtisticCriteria, getPromptVariant } from '#config/photo_schema'

/**
 * Banco de pruebas de la task vision_artistic: lanza una referencia y varios candidatos
 * sobre cualquier lote de fotos ya subidas y guarda sus notas para compararlas a ojo.
 *
 * Cada modelo recibe la petición de producción (prompt, schema, imágenes por petición,
 * resolución), leída de analyzer_packages y lanzada por la propia VisionDescriptionTask
 * sin guardar nada. Lo único configurable por modelo es la fuente de imagen. La
 * ejecución de referencia se cachea por lote + prompt + modelo + fuente, así que probar
 * otro candidato sobre el mismo lote no vuelve a pagarla.
 */

const TASK_NAME = 'vision_artistic'
const OUT_DIR = 'tmp/artistic-bench'
const SUPPORTED_PREFIXES = ['gpt', 'gemini', 'qwen', 'grok', 'deepseek']
const MAX_PHOTOS = 300
const MAX_CANDIDATES = 8
/** Nota guardada a partir de la cual se considera que el aspecto "está" (para el sorteo). */
const PRESENT_AT = 6.5
/** Nota guardada hasta la cual se considera que el aspecto "no está" (para el sorteo). */
const ABSENT_AT = 4.5
/** Fotos que se reservan, como mucho, por cada grupo escaso en el sorteo. */
const PER_RARE_GROUP = 4

/** Scores de una ejecución: photoId → criterio → nota (null si no es un número válido). */
export type BenchRun = Record<number, Record<string, number | null>>

export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
}

export const PROFILES = [
  'general',
  'commercial',
  'street-photography',
  'documentary',
  'artistic',
] as const

export type ImageSource = 'thumbnail' | 'original'
export type BenchModelSpec = { model: ModelName; imageSource: ImageSource }

export type BenchConfig = {
  photoIds: number[]
  /** null = el perfil del dueño de la primera foto. */
  profile?: string | null
  /** stored = no se lanza nada: la referencia son los artistic_scores guardados de cada foto. */
  reference: BenchModelSpec & { stored?: boolean }
  candidates: BenchModelSpec[]
}

export type ModelRun = { run: BenchRun; costEur: number; seconds: number; failedRequests: number }

export type BenchReport = {
  id: string
  createdAt: string
  userId: number
  profile: string
  keys: string[]
  labels: Record<string, string>
  photos: { id: number; thumbnailUrl: string }[]
  imagesPerRequest: number
  resolution: string
  /** Informes antiguos pueden traer varias ejecuciones; se compara con la primera. */
  reference: BenchModelSpec & { runs: ModelRun[]; stored?: boolean }
  candidates: (BenchModelSpec & { modelRun: ModelRun })[]
}

export class BenchInputError extends Error {}

type Log = (message: string) => void

function taskConfig(): any {
  const config = extractAllTasks('process').find((t) => t.name === TASK_NAME)
  if (!config) throw new Error(`Task ${TASK_NAME} not found in the process package`)
  return config
}

export function supportedModels(): string[] {
  return Object.keys(PRICES)
    .filter((m) => SUPPORTED_PREFIXES.some((p) => m.startsWith(p)))
    .sort()
}

export function benchDefaults() {
  const config = taskConfig()
  return {
    referenceModel: config.modelName as string,
    imageSource: (config.imageUrlSource ?? 'original') as ImageSource,
    imagesPerRequest: config.imagesPerRequest as number,
    resolution: config.resolution as string,
    models: supportedModels(),
    profiles: PROFILES,
  }
}

export async function searchUsers(q: string) {
  const query = db
    .from('users as u')
    .join('photos as p', 'p.user_id', 'u.id')
    .whereNotNull('p.thumbnail_name')
    .whereRaw("p.descriptions->'artistic_scores' is not null")
    .groupBy('u.id', 'u.name', 'u.email', 'u.profiles')
    .select('u.id', 'u.name', 'u.email', 'u.profiles')
    .count('* as photos')
    .orderBy('photos', 'desc')
    .limit(30)
  const term = q.trim()
  if (/^\d+$/.test(term)) query.where('u.id', Number(term))
  else if (term) query.where((w) => w.whereILike('u.email', `%${term}%`).orWhereILike('u.name', `%${term}%`))
  const rows = await query
  return rows.map((r: any) => ({ ...r, photos: Number(r.photos) }))
}

export async function listUserPhotos(userId: number, page: number, perPage: number) {
  const result = await Photo.query()
    .where('user_id', userId)
    .whereNotNull('thumbnail_name')
    .whereRaw("descriptions->'artistic_scores' is not null")
    .orderBy('id', 'desc')
    .paginate(page, perPage)
  return {
    total: result.total,
    page: result.currentPage,
    lastPage: result.lastPage,
    photos: result.all().map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl })),
  }
}

// Nota guardada de un criterio como número; null si el texto no es una cifra. Sin `?` en la
// expresión regular: knex lo tomaría por un parámetro.
const STORED_SCORE = `case when (descriptions->'artistic_scores'->>?) ~ '^\\s*[0-9]+(\\.[0-9]+){0,1}\\s*$'
  then (descriptions->'artistic_scores'->>?)::numeric end`

/** Por debajo de esta proporción en el catálogo, un grupo (con / sin un aspecto) se refuerza. */
const RARE_SHARE = 0.25

export type SampleReinforcement = { key: string; label: string; group: 'present' | 'absent'; count: number }

/**
 * Muestra aleatoria del catálogo. Con `balanced`, hasta la mitad del lote se reserva para
 * los grupos escasos según las notas guardadas (fotos con humor, fotos sin estética
 * notable…), para que el lote tenga ejemplos de los dos tipos en cada aspecto.
 */
export async function sampleUserPhotos(
  userId: number,
  n: number,
  opts: { profile?: string | null; balanced?: boolean } = {}
) {
  const size = Math.min(Math.max(1, n), MAX_PHOTOS)
  const base = () =>
    Photo.query()
      .where('user_id', userId)
      .whereNotNull('thumbnail_name')
      .whereRaw("descriptions->'artistic_scores' is not null")
  const chosen: number[] = []
  const reinforced: SampleReinforcement[] = []

  if (opts.balanced) {
    const profile = opts.profile || (await User.find(userId))?.profiles || 'general'
    const criteria = getArtisticCriteria(getPromptVariant(profile))
    const total = Number((await base().count('* as n'))[0].$extras.n)
    const groups: { key: string; label: string; group: 'present' | 'absent'; cond: string; value: number }[] = []
    for (const c of criteria) {
      for (const [group, cond, value] of [
        ['present', `${STORED_SCORE} >= ?`, PRESENT_AT],
        ['absent', `${STORED_SCORE} <= ?`, ABSENT_AT],
      ] as const) {
        const count = Number(
          (await base().whereRaw(cond, [c.key, c.key, value]).count('* as n'))[0].$extras.n
        )
        if (count > 0 && count / total < RARE_SHARE) {
          groups.push({ key: c.key, label: c.label, group, cond, value })
        }
      }
    }
    const perGroup = groups.length
      ? Math.min(PER_RARE_GROUP, Math.max(1, Math.floor(size / 2 / groups.length)))
      : 0
    for (const g of groups) {
      if (chosen.length >= Math.floor(size / 2)) break
      const rows = await base()
        .whereRaw(g.cond, [g.key, g.key, g.value])
        .whereNotIn('id', chosen)
        .orderByRaw('random()')
        .limit(perGroup)
        .select('id')
      chosen.push(...rows.map((r) => r.id))
      if (rows.length) reinforced.push({ key: g.key, label: g.label, group: g.group, count: rows.length })
    }
  }

  const rest = await base()
    .whereNotIn('id', chosen)
    .orderByRaw('random()')
    .limit(size - chosen.length)
    .select('id')
  const ids = [...chosen, ...rest.map((r) => r.id)]
  // Baraja: los reforzados no deben caer juntos en las mismas peticiones de 8.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }

  const byId = new Map((await Photo.query().whereIn('id', ids)).map((p) => [p.id, p]))
  return {
    photos: ids
      .map((id) => byId.get(id))
      .filter((p): p is Photo => !!p)
      .map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl })),
    reinforced,
  }
}

function validate(config: BenchConfig) {
  const models = new Set(supportedModels())
  const sources = new Set<ImageSource>(['thumbnail', 'original'])
  const ids = config.photoIds
  if (!Array.isArray(ids) || ids.length < 3 || ids.length > MAX_PHOTOS) {
    throw new BenchInputError(`El lote debe tener entre 3 y ${MAX_PHOTOS} fotos`)
  }
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new BenchInputError('IDs de foto no válidos')
  }
  if (!config.reference) throw new BenchInputError('Falta la referencia')
  const stored = config.reference.stored === true
  const specs = [...(stored ? [] : [config.reference]), ...(config.candidates ?? [])]
  if (!config.candidates?.length || config.candidates.length > MAX_CANDIDATES) {
    throw new BenchInputError(`Indica entre 1 y ${MAX_CANDIDATES} candidatos`)
  }
  for (const s of specs) {
    if (!s || !models.has(s.model)) throw new BenchInputError(`Modelo no soportado: ${s?.model}`)
    if (!sources.has(s.imageSource)) throw new BenchInputError(`Fuente no válida: ${s.imageSource}`)
  }
  if (config.profile && !(PROFILES as readonly string[]).includes(config.profile)) {
    throw new BenchInputError(`Perfil no válido: ${config.profile}`)
  }
}

/**
 * Coste como si nada viniera de la caché del proveedor. Repetir el mismo lote acierta en
 * la caché de OpenAI (imágenes incluidas), algo que en producción no pasa porque cada
 * foto se envía una sola vez.
 */
function coldCost(cost: any, model: ModelName): number {
  if (!cost || typeof cost.totalCostInEur !== 'number') return 0
  const price = (PRICES as any)[model]
  const hit = cost.promptCacheHitTokens ?? 0
  if (!price || !hit) return cost.totalCostInEur
  return cost.totalCostInEur + hit * (price.input_cache_miss - price.input_cache_hit) * USD_TO_EUR
}

function createTask(profile: string, imageSource: ImageSource): VisionDescriptionTask {
  const analyzerProcess = new AnalyzerProcess()
  analyzerProcess.userProfile = profile
  const task = new VisionDescriptionTask(analyzerProcess)
  Object.assign(task, taskConfig(), { imageUrlSource: imageSource })
  return task
}

function batchesOf(task: VisionDescriptionTask, photos: Photo[]): Photo[][] {
  const out: Photo[][] = []
  for (let i = 0; i < photos.length; i += task.imagesPerRequest) {
    out.push(photos.slice(i, i + task.imagesPerRequest))
  }
  return out
}

function promptsFor(task: VisionDescriptionTask, batch: Photo[], profile: string): string[] {
  return task.prompts.map((p) => (typeof p === 'function' ? p(batch, profile) : p))
}

/** Lanza el lote como lo haría producción y lee las notas igual que mapByKey. */
async function runModel(
  photos: Photo[],
  spec: BenchModelSpec,
  profile: string,
  log: Log
): Promise<ModelRun> {
  const task = createTask(profile, spec.imageSource)
  const run: BenchRun = {}
  let costEur = 0
  let failedRequests = 0
  const startedAt = Date.now()
  const limit = pLimit(3)

  await Promise.all(
    batchesOf(task, photos).map((batch) =>
      limit(async () => {
        try {
          // Acceso por índice: el método es privado y el banco no debe cambiar la task.
          const response = await task['executeModelTask'](
            promptsFor(task, batch, profile),
            batch,
            spec.model
          )
          costEur += coldCost(response?.cost, spec.model)
          const referencePhotos: Photo[] = response.validPhotos ?? batch
          const payload = response.result
          referencePhotos.forEach((photo, index) => {
            const scores = payload?.[`image_${index + 1}`]?.artistic_scores
            if (!scores || typeof scores !== 'object') return
            run[photo.id] = Object.fromEntries(
              Object.entries(scores).map(([k, v]) => [k, parseScore(v)])
            )
          })
        } catch (err) {
          failedRequests++
          log(
            `${spec.model}: petición fallida para [${batch.map((p) => p.id).join(', ')}]: ` +
              (err instanceof Error ? err.message : String(err))
          )
        }
      })
    )
  )

  return { run, costEur, seconds: (Date.now() - startedAt) / 1000, failedRequests }
}

async function referenceRun(
  photos: Photo[],
  spec: BenchModelSpec,
  profile: string,
  log: Log
): Promise<ModelRun> {
  const task = createTask(profile, spec.imageSource)
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        model: spec.model,
        source: spec.imageSource,
        profile,
        ids: photos.map((p) => p.id),
        prompts: batchesOf(task, photos).map((b) => promptsFor(task, b, profile)),
        schema: task.responseSchema?.(photos.slice(0, task.imagesPerRequest), profile),
        resolution: task.resolution,
      })
    )
    .digest('hex')
    .slice(0, 16)
  const file = path.join(app.makePath(OUT_DIR), `ref-${fingerprint}.json`)
  await fs.mkdir(path.dirname(file), { recursive: true })

  try {
    const cached: ModelRun | undefined = JSON.parse(await fs.readFile(file, 'utf8')).runs?.[0]
    if (cached) {
      log(`Referencia ${spec.model}: reutilizada de la caché`)
      return cached
    }
  } catch {}

  log(`Ejecutando referencia ${spec.model} · ${spec.imageSource}…`)
  const run = await runModel(photos, spec, profile, log)
  await fs.writeFile(file, JSON.stringify({ model: spec.model, runs: [run] }))
  return run
}

/** Referencia sin llamadas: los artistic_scores que cada foto ya tiene en la DB. */
function storedRun(photos: Photo[], keys: string[], log: Log): ModelRun {
  const run: BenchRun = {}
  let without = 0
  for (const photo of photos) {
    const scores = (photo.descriptions as any)?.artistic_scores
    if (!scores || typeof scores !== 'object') {
      without++
      continue
    }
    run[photo.id] = Object.fromEntries(keys.map((k) => [k, parseScore(scores[k])]))
  }
  log(
    `Referencia: puntuaciones guardadas en la DB` +
      (without ? ` (${without} foto(s) sin puntuaciones, no se comparan)` : '')
  )
  return { run, costEur: 0, seconds: 0, failedRequests: 0 }
}

export async function runBench(config: BenchConfig, log: Log): Promise<BenchReport> {
  validate(config)

  const found = await Photo.query().whereIn('id', config.photoIds)
  const byId = new Map(found.map((p) => [p.id, p]))
  const photos = config.photoIds.map((id) => byId.get(id)).filter((p): p is Photo => !!p)
  const missing = config.photoIds.filter((id) => !byId.has(id))
  if (missing.length) log(`Fotos no encontradas, se omiten: ${missing.join(', ')}`)
  if (photos.length < 3) throw new BenchInputError('Quedan menos de 3 fotos válidas en el lote')

  const userId = photos[0].userId
  const profile = config.profile || (await User.find(userId))?.profiles || 'general'
  const criteria = getArtisticCriteria(getPromptVariant(profile))
  const keys = criteria.map((c) => c.key)
  const task = createTask(profile, config.reference.imageSource)

  log(
    `Lote de ${photos.length} fotos · perfil ${profile} · ${task.imagesPerRequest} imágenes/petición · ` +
      `resolución ${task.resolution}`
  )

  const stored = config.reference.stored === true
  const refRun = stored
    ? storedRun(photos, keys, log)
    : await referenceRun(photos, config.reference, profile, log)

  const candidates: BenchReport['candidates'] = []
  for (const spec of config.candidates) {
    log(`Ejecutando ${spec.model} · ${spec.imageSource}…`)
    const modelRun = await runModel(photos, spec, profile, log)
    const scored = Object.keys(modelRun.run).length
    log(
      scored === 0
        ? `${spec.model}: no devolvió ninguna puntuación`
        : `${spec.model}: ${scored} de ${photos.length} fotos puntuadas`
    )
    candidates.push({ ...spec, modelRun })
  }

  const report: BenchReport = {
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
    userId,
    profile,
    keys,
    labels: Object.fromEntries(criteria.map((c) => [c.key, c.label])),
    photos: photos.map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl })),
    imagesPerRequest: task.imagesPerRequest,
    resolution: task.resolution,
    reference: stored
      ? { model: 'guardadas' as ModelName, imageSource: 'thumbnail', stored: true, runs: [refRun] }
      : { model: config.reference.model, imageSource: config.reference.imageSource, runs: [refRun] },
    candidates,
  }
  await fs.mkdir(app.makePath(OUT_DIR), { recursive: true })
  await fs.writeFile(reportPath(report.id), JSON.stringify(report))
  return report
}

function reportPath(id: string): string {
  if (!/^\d+$/.test(id)) throw new BenchInputError('Informe no válido')
  return path.join(app.makePath(OUT_DIR), `report-${id}.json`)
}

async function readReport(file: string): Promise<BenchReport> {
  const r: BenchReport = JSON.parse(await fs.readFile(file, 'utf8'))
  if (!r.labels) {
    const criteria = getArtisticCriteria(getPromptVariant(r.profile))
    r.labels = Object.fromEntries(criteria.map((c) => [c.key, c.label]))
  }
  return r
}

export async function getReport(id: string): Promise<BenchReport> {
  return readReport(reportPath(id))
}

export async function listReports() {
  let files: string[] = []
  try {
    files = await fs.readdir(app.makePath(OUT_DIR))
  } catch {}
  const reports = await Promise.all(
    files
      .filter((f) => /^report-\d+\.json$/.test(f))
      .map(async (f) => {
        try {
          const r = await readReport(path.join(app.makePath(OUT_DIR), f))
          if (!r.id || !r.reference?.runs) return null
          return {
            id: r.id,
            createdAt: r.createdAt,
            userId: r.userId,
            photos: r.photos.length,
            reference: r.reference.stored ? 'Guardada' : r.reference.model,
            candidates: r.candidates.map((c) => ({
              model: c.model,
              imageSource: c.imageSource,
              failed: Object.keys(c.modelRun.run).length === 0,
            })),
          }
        } catch {
          return null
        }
      })
  )
  return reports
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => Number(b.id) - Number(a.id))
}
