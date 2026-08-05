// ══════════════════════════════════════════════════════════════
// ADMIN · Regularización de scores por usuario.
//
// Envoltorio fino sobre ScoreSmoothingService: lanza el trabajo en segundo
// plano (una pasada completa sobre 10k fotos tarda minutos, porque el kNN es
// exacto dentro del catálogo) y guarda el último informe para que el panel
// pueda consultarlo cuando termine.
// ══════════════════════════════════════════════════════════════

import User from '#models/user'
import Photo from '#models/photo'
import db from '@adonisjs/lucid/services/db'
import HealthRepairTracker from '#services/admin/health_repair_tracker'
import ScoreSmoothingService, { type SmoothingReport } from '#services/score_smoothing_service'
import { getNeighborStrategy } from '#config/score_smoothing'

export type SmoothingAction = 'run' | 'revert'

/**
 * Aplicar NO admite ajustes finos a propósito: los valores que se escriben son
 * siempre los de `config/score_smoothing.ts` y las variables de entorno. Los
 * controles de la pantalla son solo para simular; para cambiar lo que se aplica
 * se toca la config y se vuelve a lanzar.
 */
export interface LaunchOptions {
  action?: SmoothingAction
  dryRun?: boolean
}

interface StoredReport {
  report: SmoothingReport | null
  reverted: { photosAffected: number } | null
  finishedAt: string
  error: string | null
}

/**
 * Una foto corregida por el regularizador. El antes es `artistic_scores_raw` y el
 * después son los scores activos: no hay nada más que leer, porque aplicar es
 * escribir. El desplazamiento de cada criterio es la resta.
 */
export interface AppliedPhoto {
  id: number
  thumbnailUrl: string | null
  originalFileName: string | null
  /** Valores originales del LLM. */
  before: Record<string, number>
  /** Valores corregidos, que son los que ve el usuario. */
  after: Record<string, number>
  /** Desplazamiento por criterio: `after - before`. */
  moved: Record<string, number>
  totalShift: number
}

export interface AppliedPage {
  photos: AppliedPhoto[]
  total: number
  page: number
  perPage: number
}

/** Convierte un objeto de scores (los valores pueden venir como texto) a números. */
function toNumberMap(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (!value || typeof value !== 'object') return result
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(raw)
    if (Number.isFinite(num)) result[key] = num
  }
  return result
}

/** Último informe por usuario. En memoria: es un diagnóstico, no un dato de negocio. */
const lastReports = new Map<number, StoredReport>()

export default class AdminScoreSmoothingService {
  /**
   * Lanza la regularización (o la vuelta al original) para un usuario.
   * Devuelve inmediatamente con un taskId consultable en /api/admin/health/tasks.
   */
  static async launch(userId: number, options: LaunchOptions = {}) {
    const user = await User.find(userId)
    if (!user) return null

    const action: SmoothingAction = options.action ?? 'run'
    const dryRun = options.dryRun ?? false
    const strategy = getNeighborStrategy()

    const label =
      action === 'revert'
        ? `Devolviendo los scores originales del LLM al usuario #${userId}`
        : `${dryRun ? 'Simulando' : 'Aplicando'} regularización de scores (${strategy}) para el usuario #${userId}`

    const taskId = HealthRepairTracker.start('score-smoothing', 1, label)
    const service = new ScoreSmoothingService()

    const work =
      action === 'revert'
        ? service.revert(userId).then((result) => {
            lastReports.set(userId, {
              report: null,
              reverted: { photosAffected: result.photosAffected },
              finishedAt: new Date().toISOString(),
              error: null,
            })
            return `Revertidas al original ${result.photosAffected} fotos`
          })
        : service.runForUser(userId, { dryRun }).then((report) => {
            lastReports.set(userId, {
              report,
              reverted: null,
              finishedAt: new Date().toISOString(),
              error: null,
            })
            return (
              `${dryRun ? 'Simulación' : 'Regularización'}: ${report.photosChanged} fotos ajustadas ` +
              `de ${report.photosInGraph} en grafo (${report.groups} grupos)`
            )
          })

    work
      .then((message) => HealthRepairTracker.complete(taskId, message))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        lastReports.set(userId, {
          report: null,
          reverted: null,
          finishedAt: new Date().toISOString(),
          error: message,
        })
        HealthRepairTracker.fail(taskId, message)
      })

    return { taskId, action, dryRun, strategy }
  }

  /** Último informe conocido de un usuario (null si nunca se ha ejecutado en este proceso). */
  static getLastReport(userId: number): StoredReport | null {
    return lastReports.get(userId) ?? null
  }

  /**
   * Vista previa sobre una MUESTRA del catálogo del usuario. Síncrona y sin escribir
   * nada: sirve para inspeccionar a ojo qué grupos forma cada método antes de
   * aplicarlo a todo. Los grupos de las fotos sembradas se resuelven completos, así
   * que lo que se ve es exactamente lo que haría una pasada entera sobre ellos.
   */
  static async previewForUser(
    userId: number,
    options: {
      sampleSize?: number
      maxGroups?: number
      sampleSeed?: string | number
    } = {}
  ): Promise<SmoothingReport | null> {
    const user = await User.find(userId)
    if (!user) return null

    const sampleSize = Math.min(Math.max(options.sampleSize ?? 300, 1), 5000)
    const sampleSeed = String(options.sampleSeed ?? '1')

    // Muestra pseudoaleatoria pero REPETIBLE: ordenar por random() daría fotos
    // distintas en cada llamada y sería imposible comparar dos métodos, porque
    // cambiaría la muestra a la vez que el método. Con el hash del id + semilla, la
    // misma semilla devuelve siempre las mismas fotos, repartidas por el catálogo.
    const rows = await db.rawQuery(
      `
      SELECT id
      FROM photos
      WHERE user_id = :userId
        AND deleted_at IS NULL
        AND confirmed IS NOT FALSE
        AND descriptions->'artistic_scores' IS NOT NULL
      ORDER BY md5(id::text || :sampleSeed)
      LIMIT :sampleSize
      `,
      { userId: String(userId), sampleSize, sampleSeed }
    )

    const seedIds = rows.rows.map((row: any) => Number(row.id))
    if (seedIds.length === 0) {
      return null
    }

    // Sin overrides: método y umbrales salen siempre de la config del backend, para
    // que lo que se simula sea exactamente lo que se aplicaría.
    return new ScoreSmoothingService().runForUser(userId, {
      seedIds,
      dryRun: true,
      includeGroups: true,
      maxGroups: options.maxGroups ?? 40,
    })
  }

  /**
   * Fotos del usuario que el regularizador dejó con valores distintos a los del LLM.
   * No recalcula ni toca el grafo: compara las dos claves que hay escritas.
   */
  static async appliedForUser(
    userId: number,
    options: { page?: number; perPage?: number } = {}
  ): Promise<AppliedPage | null> {
    const user = await User.find(userId)
    if (!user) return null

    const perPage = Math.min(Math.max(options.perPage ?? 24, 1), 100)
    const page = Math.max(options.page ?? 1, 1)

    // Solo cuentan las corregidas: si los dos juegos coinciden, no hay nada que ver.
    // Se emparejan por criterio y se suma la diferencia, que es lo que ordena la
    // lista — y por eso va en SQL: decide QUÉ página se trae.
    const changedExpr = `descriptions->'artistic_scores'
                         IS DISTINCT FROM descriptions->'artistic_scores_raw'`
    const shiftExpr = `(SELECT COALESCE(SUM(ABS(now.value::numeric - was.value::numeric)), 0)
                          FROM jsonb_each_text(descriptions->'artistic_scores') AS now
                          JOIN jsonb_each_text(descriptions->'artistic_scores_raw') AS was
                            ON was.key = now.key)`

    // El scope del modelo ya descarta borradas y no confirmadas.
    const result = await Photo.query()
      .where('user_id', userId)
      // jsonb_exists en vez del operador nativo de pertenencia de clave, que Knex
      // tomaría por un binding posicional. Por lo mismo, ese operador tampoco puede
      // aparecer suelto ni dentro de un comentario SQL.
      .whereRaw("jsonb_exists(descriptions, 'artistic_scores_raw')")
      .whereRaw(changedExpr)
      .orderByRaw(`${shiftExpr} DESC, id ASC`)
      .paginate(page, perPage)

    const photos: AppliedPhoto[] = result.all().map((photo) => {
      const descriptions = (photo.descriptions ?? {}) as Record<string, any>
      const before = toNumberMap(descriptions.artistic_scores_raw)
      const after = toNumberMap(descriptions.artistic_scores)

      const moved: Record<string, number> = {}
      let totalShift = 0
      for (const [key, original] of Object.entries(before)) {
        const shift = Number(((after[key] ?? original) - original).toFixed(2))
        if (shift === 0) continue
        moved[key] = shift
        totalShift += Math.abs(shift)
      }

      return {
        id: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
        originalFileName: photo.originalFileName,
        before,
        after,
        moved,
        totalShift: Number(totalShift.toFixed(2)),
      }
    })

    return { photos, total: result.total, page, perPage }
  }

  /**
   * Vista previa (o aplicación real) acotada a las fotos de un proceso de análisis.
   * Es el mismo camino que corre automáticamente al terminar un análisis, así que
   * sirve para ver exactamente qué habría hecho.
   */
  static async previewForProcess(
    processId: string | number,
    options: { dryRun?: boolean; maxGroups?: number } = {}
  ): Promise<SmoothingReport | null> {
    const photos = await Photo.query()
      .where('analyzer_process_id', processId)
      .select('id', 'user_id')
    if (photos.length === 0) return null

    const userId = photos[0].userId
    if (!userId) return null

    return new ScoreSmoothingService().runForUser(userId, {
      seedIds: photos.map((photo) => photo.id),
      dryRun: options.dryRun ?? true,
      includeGroups: true,
      maxGroups: options.maxGroups ?? 40,
    })
  }
}
