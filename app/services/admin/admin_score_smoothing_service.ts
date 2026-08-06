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
   * Pasada sobre el catálogo ENTERO del usuario, devolviendo todos los grupos. Es el
   * mismo cálculo tanto si se simula como si se ejecuta: lo único que cambia es si
   * escribe. Sin muestra y sin tope, porque recortar escondería justo lo que falta.
   *
   * Cada foto lleva lo que hay escrito (`current`) junto a lo que se escribiría
   * (`after`): comparar los dos es lo único que separa lo hecho de lo pendiente, así
   * que no hay nada que guardar entre una llamada y la siguiente.
   *
   * Es síncrona a propósito: en catálogos grandes tarda minutos y el que la lanza
   * espera mirando. Aquí no hay tarea de fondo que seguir.
   */
  static async runForUser(
    userId: number,
    options: { dryRun?: boolean } = {}
  ): Promise<SmoothingReport | null> {
    const user = await User.find(userId)
    if (!user) return null

    // Sin overrides: método y umbrales salen siempre de la config del backend, para
    // que lo que se simula sea exactamente lo que se aplica.
    return new ScoreSmoothingService().runForUser(userId, {
      dryRun: options.dryRun ?? true,
      includeGroups: true,
      maxGroups: 0,
    })
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
