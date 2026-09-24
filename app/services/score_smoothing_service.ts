// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING SERVICE
//
// Regulariza `descriptions.artistic_scores` entre fotos casi idénticas.
// Totalmente desacoplado del analyzer: no es una task del pipeline, no
// depende de AnalyzerProcess y puede ejecutarse solo (comando o admin).
//
// Contrato de datos (dos claves dentro del JSONB `descriptions`, sin migración):
//   artistic_scores      → los valores corregidos, que son los que lee el producto
//   artistic_scores_raw  → salida literal del LLM, ancla intocable
//
// No hay tercer campo ni valores "guardados a la espera": aplicar es escribir. El
// desplazamiento de cada barra se deduce restando las dos claves, y revertir es
// copiar el ancla encima. Como siempre se recalcula desde el ancla, reejecutar
// sobre un catálogo sin cambios da exactamente el mismo resultado.
// ══════════════════════════════════════════════════════════════

import db from '@adonisjs/lucid/services/db'
import Photo from '#models/photo'
import VectorService from '#services/vector_service'
import CpuWorkerPool from '#services/cpu_worker_pool'
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import { hammingDistance } from '../utils/dhash.js'
import { captureEvidence, isSameShot } from '../utils/score_smoothing_metadata.js'
import { isSameColorGrade, parseColorHistogram } from '../utils/score_smoothing_color.js'
import { fetchThumbFingerprints } from '../utils/score_smoothing_thumb.js'
import { normalizeArtisticScores } from '../utils/artistic_scores.js'
import {
  SMOOTHING_CONFIG,
  SMOOTHING_VERSION,
  getCriterionProfile,
  getNeighborStrategy,
  type CriterionProfileMode,
  type NeighborStrategy,
  type PerceptualDateOverrideConfig,
} from '#config/score_smoothing'
import {
  smoothScores,
  buildCliques,
  formatLikeSample,
  isVerifiedSimilar,
  type SmoothingNeighbor,
  type SmoothingNode,
} from '../utils/score_smoothing_math.js'

/** Saltos máximos al expandir componentes desde las semillas de un análisis. */
const MAX_EXPANSION_HOPS = 3
const PERSIST_CHUNK = 200
/** Longitud del dhash, para normalizar la distancia de Hamming a un 0-1. */
const DHASH_BITS = 64
/**
 * Parejas por consulta al verificar con CLIP. El coste real es despreciable —39.164
 * parejas de un catálogo de 22.574 fotos salen en 289 ms— así que el troceado no es
 * por tiempo sino para que ni el tamaño de la sentencia ni la memoria dependan del
 * tamaño del catálogo.
 */
const CLIP_VERIFY_CHUNK = 10_000
/** Cuántas parejas descartadas se detallan en el log antes de resumir el resto. */
const CLIP_LOG_SAMPLE = 25

interface Edge {
  src: number
  dst: number
  sim: number
}

/** Lo que hace falta de cada foto para decidir si agrupa y con qué perfil. */
interface PhotoSignals {
  histogram: number[] | null
  exif: Record<string, unknown> | null
}

/** Una foto de la que no se cargó nada: no aporta ninguna señal. */
const EMPTY_SIGNALS: PhotoSignals = { histogram: null, exif: null }

/**
 * De más a menos evidencia. El orden es el del reparto: una foto entra en el grupo de
 * su relación más fuerte, y las demás ya no la ven.
 */
const RELATION_ORDER: readonly CriterionProfileMode[] = ['duplicate', 'version', 'default']

/**
 * Qué relación sostiene la evidencia de UNA pareja, o `null` si no sostiene ninguna y
 * la pareja no debe agrupar. Es la pieza central del reparto: el modo es una propiedad
 * de la arista, no del grupo.
 *
 * Antes se decidía por grupo recorriendo todas sus parejas, y bastaba una sola pareja
 * sin evidencia para tumbar a las demás — con grupos grandes eso se llevaba por delante
 * casi todos los `version` legítimos. Al colgarlo de la arista, cada grupo sale
 * homogéneo por construcción y ninguna foto puede contaminar a las otras.
 */
function relationFor(
  first: PhotoSignals,
  second: PhotoSignals,
  sim: number,
  sameFile: boolean,
  clipSim: number | null
): CriterionProfileMode | null {
  const relation = relationEvidence(first, second, sim, sameFile)
  if (relation !== 'default') return relation

  // Último filtro, y solo aquí. `default` es la relación que sostiene menos evidencia:
  // la única que se apoya en la huella perceptual a secas, que tiene un falso positivo
  // que ningún umbral de Hamming separa (ver `clipVerifyThreshold`). Los otros dos
  // modos afirman algo sobre la procedencia del archivo y ya traen prueba propia, así
  // que este veto no les toca — a `version` lo borraría entero.
  //
  // Sin embedding en alguna de las dos, `clipSim` es `null` y el veto no opina.
  return isVerifiedSimilar(clipSim, SMOOTHING_CONFIG.clipVerifyThreshold) ? 'default' : null
}

/** El veredicto por evidencia, sin la verificación CLIP que solo afecta a `default`. */
function relationEvidence(
  first: PhotoSignals,
  second: PhotoSignals,
  sim: number,
  sameFile: boolean
): CriterionProfileMode {
  // La vía de los bytes entra por delante de todo porque es la evidencia más fuerte
  // que existe: si los dos archivos son idénticos, ni la hora ni el histograma
  // pueden añadir nada — son iguales por construcción.
  if (sameFile) return 'duplicate'

  if (captureEvidence(first.exif, second.exif, SMOOTHING_CONFIG) !== 'confirmed') return 'default'
  if (!isSameColorGrade(first.histogram, second.histogram, SMOOTHING_CONFIG.colorGrade)) {
    return 'version'
  }

  // Misma captura y mismo revelado: solo es el mismo archivo si además la huella
  // perceptual es idéntica. Como el modo es por arista, un clique del grafo
  // `duplicate` ya garantiza que TODAS sus parejas están probadas, sin comprobarlo
  // aparte — cada una por su vía, esta o la de los bytes.
  return sim >= 1 - 1e-9 ? 'duplicate' : 'default'
}

/** El mismo grafo sin las fotos que ya tienen grupo, ni las aristas que las apuntan. */
function prunedGraph(
  graph: Map<number, SmoothingNeighbor[]>,
  assigned: Set<number>
): Map<number, SmoothingNeighbor[]> {
  const pruned = new Map<number, SmoothingNeighbor[]>()

  for (const [id, neighbors] of graph) {
    if (assigned.has(id)) continue
    const kept = neighbors.filter((neighbor) => !assigned.has(neighbor.id))
    if (kept.length > 0) pruned.set(id, kept)
  }

  return pruned
}

/** Clave canónica de una pareja, independiente del orden. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * Coseno CLIP de un grupo: la media y el de su pareja más floja. Solo hay valores en
 * los grupos `default`, que son los únicos a los que se les pregunta.
 */
function clipStats(
  members: number[],
  clipSims: Map<string, number>
): { avg: number | null; min: number | null } {
  const values: number[] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const sim = clipSims.get(pairKey(members[i], members[j]))
      if (sim !== undefined) values.push(sim)
    }
  }

  if (values.length === 0) return { avg: null, min: null }

  const total = values.reduce((sum, value) => sum + value, 0)
  return {
    avg: Number((total / values.length).toFixed(4)),
    min: Number(Math.min(...values).toFixed(4)),
  }
}

/** Igual que `pairKey` pero para mapas locales, sin construir cadenas. */
function pairIndex(a: number, b: number): number {
  return a < b ? a * 1e9 + b : b * 1e9 + a
}

/**
 * A partir de qué parecido se considera un grupo "prácticamente el mismo fotograma",
 * que es la muestra con la que se estima el ruido del evaluador. Las dos escalas no
 * son comparables: en dhash, 0.98 equivale a una distancia de 1 bit.
 */
function tightSimFor(strategy: NeighborStrategy): number {
  return strategy === 'dhash' ? 0.98 : 0.995
}

export interface SmoothingRunOptions {
  /** Si se pasan, solo se procesan sus componentes conexas. Si no, el catálogo entero. */
  seedIds?: number[]
  /** Calcula y reporta sin escribir nada en base de datos. */
  dryRun?: boolean
  /** Método de vecindad. Por defecto, el del flag de entorno. */
  strategy?: NeighborStrategy
  /**
   * Tope del pool: solo las N fotos más recientes por `created_at`. Por defecto, el de
   * la config (`recentPoolLimit`); `0` = sin tope, el catálogo entero. La pasada normal
   * —automática y admin— hereda el default; solo la lupa de un proceso concreto del
   * admin lo pone a 0, porque va sembrada y el proceso puede ser antiguo.
   */
  poolLimit?: number
  /** Corte de similitud coseno para CLIP. Por defecto, el de la config. */
  simThreshold?: number
  /** Corte de distancia de Hamming para dHash. Por defecto, el de la config. */
  dhashThreshold?: number
  /** Cuántos movimientos mayores incluir en el informe. */
  topMovers?: number
  /** Adjunta los grupos con miniaturas y el antes/después (para la vista de admin). */
  includeGroups?: boolean
  /** Cuántos grupos devolver, de mayor a menor movimiento. `0` = todos. */
  maxGroups?: number
  /**
   * Resolver las miniaturas de los grupos. Se apaga cuando el resultado se guarda
   * entero para paginarlo después: la miniatura solo hace falta en la página que se
   * pinta, y traerla para miles de fotos sería una consulta enorme y desperdiciada.
   */
  withThumbnails?: boolean
}

/** Una foto dentro de un grupo, con sus valores antes y después. */
export interface PreviewPhoto {
  id: number
  thumbnailUrl: string | null
  originalFileName: string | null
  neighbors: number
  /** Los demás miembros del grupo: todos son vecinos suyos. */
  neighborIds: number[]
  avgSim: number
  before: Record<string, number>
  after: Record<string, number>
  /**
   * Lo que hay escrito ahora mismo en `artistic_scores`. Comparado con `after` dice
   * si esta foto ya está aplicada o si sigue pendiente, sin guardar nada en ningún
   * sitio: la respuesta la tiene siempre la base de datos.
   */
  current: Record<string, number>
}

/**
 * Grupo de casi-duplicados: TODAS sus fotos son vecinas entre sí, así que cada una
 * influye en todas las demás y en ninguna otra. Es la misma unidad que usa el motor
 * para calcular, de modo que lo que se ve es exactamente lo que se ha calculado.
 */
export interface PreviewGroup {
  size: number
  avgSim: number
  /**
   * Coseno CLIP medio y el de la pareja MÁS FLOJA del grupo. `null` en `duplicate` y
   * `version`, donde el veto no se aplica y por tanto no se ha preguntado — no es que
   * salga 0, es que CLIP no opina ahí (ver `clipVerifyThreshold`).
   *
   * El mínimo es el que sirve para cazar falsos positivos: un grupo grande puede tener
   * una media alta y colgando una foto que no pinta nada.
   */
  avgClipSim: number | null
  minClipSim: number | null
  changedPhotos: number
  /** Suma de todos los desplazamientos del grupo; ordena los grupos por interés. */
  totalShift: number
  /** Revelado del grupo: `version` si alguna pareja no comparte color. */
  mode: CriterionProfileMode
  photos: PreviewPhoto[]
}

export interface CriterionStat {
  criterion: string
  photosMoved: number
  avgAbsShift: number
  maxAbsShift: number
  crossedSeven: number
  /** Ruido estimado del LLM: desviación típica dentro de grupos muy compactos. */
  noiseSigma: number | null
  noiseSamples: number
}

export interface TopMover {
  photoId: number
  criterion: string
  from: number
  to: number
  delta: number
  neighbors: number
  avgSim: number
}

export interface SmoothingReport {
  userId: number
  dryRun: boolean
  strategy: NeighborStrategy
  /** Corte efectivo usado en esta ejecución (coseno o Hamming, según estrategia). */
  threshold: number
  version: string
  photosWithScores: number
  photosInGraph: number
  groups: number
  /** Cuántos de esos grupos son el mismo archivo repetido. */
  duplicateGroups: number
  /**
   * Parejas que llegaron a `duplicate` por la vía de los bytes, es decir, las que la
   * ruta del EXIF habría dejado en `default`. Mide exactamente lo que rescata esa
   * segunda vía: si sale 0, no está haciendo nada en este catálogo.
   */
  sameFilePairs: number
  /**
   * Parejas que el dhash proponía y la verificación CLIP ha tumbado. Es la medida
   * directa de `clipVerifyThreshold`: si sale 0, el corte no está haciendo nada en este
   * catálogo; si se dispara, está cortando de más.
   */
  clipRejectedPairs: number
  /** Cuántos son revelados distintos de la misma captura. */
  versionGroups: number
  largestGroup: number
  /**
   * Fotos que esta pasada escribiría, que es lo mismo que decir las que aún NO
   * están aplicadas: si el catálogo ya está regularizado, es 0 aunque haya miles
   * corregidas. No cuenta cuántas están corregidas, sino cuántas faltan.
   */
  photosChanged: number
  barsChanged: number
  iterations: number
  converged: boolean
  perCriterion: CriterionStat[]
  topMovers: TopMover[]
  simHistogram: Record<string, number>
  durationMs: number
  /** Solo cuando se pide `includeGroups`. */
  previewGroups?: PreviewGroup[]
}

interface CatalogRow {
  id: number
  /** Valores base (raw si existe, si no los activos) ya parseados. */
  raw: Record<string, number>
  /** Lo que hay escrito AHORA en `artistic_scores`, ya parseado. */
  current: Record<string, number>
  /** Tipo original de cada clave, para reescribir igual que estaba. */
  types: Record<string, 'string' | 'number'>
  /** Objeto raw tal cual se debe persistir en artistic_scores_raw. */
  rawStored: Record<string, unknown>
}

/**
 * ¿Lo que hay escrito coincide ya con lo que produciría esta pasada? Se compara
 * contra el objeto que se persistiría —no contra los valores en bruto— para que la
 * respuesta sea exactamente "¿haría falta un UPDATE?".
 */
function alreadyStored(
  current: Record<string, number>,
  computed: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(computed)) {
    const num = Number(value)
    if (!Number.isFinite(num)) continue
    const stored = current[key]
    if (stored === undefined || Math.abs(stored - num) > 1e-6) return false
  }
  return true
}

/** Lo que esta pasada dejaría escrito en una foto, frente a lo que hay escrito ya. */
interface PlannedWrite {
  after: Record<string, number>
  current: Record<string, number>
}

/** Los valores numéricos de un objeto de scores; ignora lo que no sea número. */
function numericScores(stored: Record<string, unknown>): Record<string, number> {
  return normalizeArtisticScores(stored) ?? {}
}

/**
 * Devuelve el turno al event loop. El trabajo pesado de aquí es CPU en el hilo
 * principal, y mientras corre la API no responde a NADA: no basta con lanzarlo en
 * segundo plano, porque "segundo plano" en Node sigue siendo este mismo hilo. Se
 * intercala entre fases y cada pocos cientos de elementos en los bucles que crecen
 * con el catálogo.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Cada cuántos elementos se cede el turno dentro de un bucle largo. */
const YIELD_EVERY = 500

/**
 * Una ejecución con escritura por usuario, en cola. Ahora que cada análisis lanza
 * una pasada sobre el pool de recientes, dos análisis seguidos del mismo usuario se
 * solaparían: el mismo cálculo dos veces y dos tandas de UPDATE sobre las mismas
 * filas. El resultado no se corrompe —siempre se recalcula desde el ancla— pero es
 * trabajo tirado, así que se serializa.
 */
const writeRuns = new Map<string, Promise<unknown>>()

export default class ScoreSmoothingService {
  private vectorService = new VectorService()

  /**
   * Callback opcional de progreso de la fase de grafo, que es la cara: en catálogos
   * grandes son minutos. La usa el comando para no dejar la consola muda.
   */
  public onGraphProgress?: (done: number, total: number) => void

  /**
   * Ejecuta el regularizador para un usuario. Siempre parte de los valores
   * originales del LLM, así que reejecutarlo sobre un catálogo sin cambios
   * produce exactamente el mismo resultado (idempotente).
   *
   * Las ejecuciones que escriben se encolan por usuario; las simulaciones no, porque
   * no pueden pisar nada y quien las lanza está esperando la respuesta.
   */
  public async runForUser(
    userId: number | string,
    options: SmoothingRunOptions = {}
  ): Promise<SmoothingReport> {
    if (options.dryRun) return this.executeRun(userId, options)

    const key = String(userId)
    const previous = writeRuns.get(key)
    const current = (previous ?? Promise.resolve()).then(() => this.executeRun(userId, options))

    // En la cola va la versión que nunca rechaza: un fallo no puede llevarse por
    // delante a los que esperan detrás.
    const link = current.then(
      () => {},
      () => {}
    )
    writeRuns.set(key, link)
    link.then(() => {
      if (writeRuns.get(key) === link) writeRuns.delete(key)
    })

    return current
  }

  private async executeRun(
    userId: number | string,
    options: SmoothingRunOptions = {}
  ): Promise<SmoothingReport> {
    const startedAt = Date.now()
    const dryRun = options.dryRun ?? false
    const strategy = options.strategy ?? getNeighborStrategy()
    const simThreshold = options.simThreshold ?? SMOOTHING_CONFIG.simThreshold
    const dhashThreshold = options.dhashThreshold ?? SMOOTHING_CONFIG.dhashThreshold
    const topMoversLimit = options.topMovers ?? 30

    // El pool de la pasada automática: las N más recientes. Se resuelve UNA vez y se
    // pasa a `loadCatalog` y `dhashEdges` para que el catálogo y el grafo vean el mismo
    // conjunto. `null` = sin tope (comando y admin). Es lo que mantiene tratable el
    // emparejado dhash a partir de ~40k fotos (ver `recentPoolLimit`).
    const poolLimit = options.poolLimit ?? SMOOTHING_CONFIG.recentPoolLimit
    const poolIds = await this.resolvePoolIds(userId, poolLimit)

    const catalog = await this.loadCatalog(userId, poolIds)
    const catalogById = new Map(catalog.map((row) => [row.id, row]))

    const seedIds =
      options.seedIds && options.seedIds.length > 0
        ? options.seedIds.filter((id) => catalogById.has(id))
        : catalog.map((row) => row.id)

    const { adjacency, edgeSims } = await this.buildGraph(
      userId,
      seedIds,
      !options.seedIds?.length,
      strategy,
      simThreshold,
      dhashThreshold,
      poolIds
    )

    // Solo fotos con scores pueden participar.
    for (const [id, list] of adjacency) {
      if (!catalogById.has(id)) {
        adjacency.delete(id)
        continue
      }
      adjacency.set(
        id,
        list.filter((nb) => catalogById.has(nb.id))
      )
    }

    // El grupo es la unidad de todo: dentro de él, TODAS las fotos son vecinas entre
    // sí Y comparten relación, así que cada una influye en todas las demás y en nadie
    // más. Es a la vez lo que calcula el motor y lo que se pinta en el admin.
    const seedSet = new Set(seedIds)
    const { groups, groupModes, sameFilePairs, clipRejectedPairs, clipSims } =
      await this.buildRelationGroups(adjacency, strategy, (group) =>
        !options.seedIds?.length ? true : group.some((id) => seedSet.has(id))
      )

    const nodes: SmoothingNode[] = []
    const groupOfNode = new Map<number, number>()

    for (const [groupIndex, members] of groups.entries()) {
      if (groupIndex % YIELD_EVERY === 0) await yieldToEventLoop()
      const simById = new Map<number, number>()
      for (const id of members) {
        for (const nb of adjacency.get(id) ?? []) {
          if (members.includes(nb.id)) simById.set(pairIndex(id, nb.id), nb.sim)
        }
      }

      const groupNodes: SmoothingNode[] = members.map((id) => {
        const row = catalogById.get(id)!
        return {
          id,
          raw: row.raw,
          neighbors: members
            .filter((other) => other !== id)
            .map((other) => ({ id: other, sim: simById.get(pairIndex(id, other)) ?? 0 })),
        }
      })

      // El modo ya viene decidido del reparto: el grupo ES un clique de aristas de
      // esa relación, así que todas sus parejas la comparten.
      const mode = groupModes.get(groupIndex) ?? 'default'
      for (const node of groupNodes) node.profileMode = mode

      for (const node of groupNodes) {
        nodes.push(node)
        const id = node.id
        groupOfNode.set(id, groupIndex)
      }
    }

    await yieldToEventLoop()
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG)
    await yieldToEventLoop()

    // Lo que ESTA pasada dejaría escrito en cada foto del grafo, ya con el formato
    // definitivo, junto a lo que hay escrito ahora. Es lo que se compara para saber
    // si una foto ya está aplicada, así que la simulación no puede desviarse ni un
    // decimal de lo que escribiría la ejecución.
    const planned = new Map<number, PlannedWrite>()
    const updates: { id: number; patch: Record<string, unknown> }[] = []

    let patched = 0
    for (const node of nodes) {
      if (++patched % YIELD_EVERY === 0) await yieldToEventLoop()
      const result = outcome.nodes.get(node.id)!
      const row = catalogById.get(node.id)!
      const patch = this.buildPatch(row, result.values)
      const scores = patch.artistic_scores as Record<string, unknown>
      planned.set(node.id, { after: numericScores(scores), current: row.current })

      // Se escribe cuando lo calculado difiere de lo ESCRITO, no solo de los valores
      // originales. Si una pasada anterior dejó una corrección que el motor ya no
      // produce —porque el grupo cambió al borrar o subir fotos—, hay que devolver la
      // foto a su sitio; con la condición antigua esa foto quedaba desviada para
      // siempre y relanzar nunca llegaba a cero pendientes.
      if (!result.changed && alreadyStored(row.current, scores)) continue
      updates.push({ id: node.id, patch })
    }

    if (!dryRun && updates.length > 0) {
      await this.persist(updates)

      // Lo escrito ya ES lo calculado. Sin esto, el informe de una ejecución seguiría
      // diciendo que todo está pendiente, porque los valores activos se leyeron antes
      // de escribirlos.
      for (const update of updates) {
        const write = planned.get(update.id)
        if (write) write.current = write.after
      }

      await CacheInvalidationService.onAnalysisCompleted(String(userId), updates.length)
    }

    const previewGroups = options.includeGroups
      ? await this.buildPreviewGroups(groups, groupModes, nodes, outcome, planned, clipSims, {
          maxGroups: options.maxGroups ?? 40,
          withThumbnails: options.withThumbnails ?? true,
        })
      : undefined

    return {
      previewGroups,
      userId: Number(userId),
      dryRun,
      strategy,
      threshold: strategy === 'dhash' ? dhashThreshold : simThreshold,
      version: SMOOTHING_VERSION,
      photosWithScores: catalog.length,
      photosInGraph: nodes.length,
      groups: groups.length,
      duplicateGroups: [...groupModes.values()].filter((mode) => mode === 'duplicate').length,
      sameFilePairs,
      clipRejectedPairs,
      versionGroups: [...groupModes.values()].filter((mode) => mode === 'version').length,
      largestGroup: groups.reduce((max, group) => Math.max(max, group.length), 0),
      photosChanged: updates.length,
      barsChanged: nodes.reduce(
        (acc, n) => acc + Object.keys(outcome.nodes.get(n.id)!.moved).length,
        0
      ),
      iterations: outcome.iterations,
      converged: outcome.converged,
      perCriterion: this.criterionStats(groups, nodes, outcome, catalogById, tightSimFor(strategy)),
      topMovers: this.topMovers(nodes, outcome, topMoversLimit),
      simHistogram: this.histogram(edgeSims),
      durationMs: Date.now() - startedAt,
    }
  }

  /**
   * Deshace la corrección: copia el original del LLM encima de los scores activos.
   * Un solo UPDATE, sin recalcular. Solo toca las fotos que están corregidas, así
   * que relanzarlo no hace nada.
   *
   * Volver a corregir después no necesita nada guardado: se relanza el motor, que
   * parte del mismo ancla y da el mismo resultado.
   */
  public async revert(
    userId?: number | string
  ): Promise<{ photosAffected: number; userIds: number[] }> {
    const bindings: Record<string, unknown> = {}
    let userFilter = ''
    if (userId !== undefined) {
      userFilter = 'AND user_id = :userId'
      bindings.userId = String(userId)
    }

    const result = await db.rawQuery(
      `
      UPDATE photos
      SET descriptions = descriptions
        || jsonb_build_object('artistic_scores', descriptions->'artistic_scores_raw')
      WHERE deleted_at IS NULL
        ${userFilter}
        -- jsonb_exists en vez del operador nativo de clave, que Knex tomaría por
        -- un binding posicional (tampoco puede aparecer en un comentario).
        AND jsonb_exists(descriptions, 'artistic_scores_raw')
        AND descriptions->'artistic_scores'
            IS DISTINCT FROM descriptions->'artistic_scores_raw'
      RETURNING user_id
      `,
      bindings
    )

    const userIds = [...new Set<number>(result.rows.map((row: any) => Number(row.user_id)))]
    const photosAffected = result.rows.length

    // Los scores alimentan búsqueda, 3D, portfolio y estadísticas: hay que invalidar
    // por usuario, uno a uno, porque las cachés están particionadas así.
    for (const affectedUserId of userIds) {
      await CacheInvalidationService.onAnalysisCompleted(String(affectedUserId), photosAffected, {
        skipExpensiveWarmup: userIds.length > 1,
      })
    }

    return { photosAffected, userIds }
  }

  /** Cuántas fotos pasaron por el motor y cuántas quedaron con valores distintos. */
  public async status(userId?: number | string): Promise<{
    photosProcessed: number
    photosCorrected: number
    users: number
  }> {
    const bindings: Record<string, unknown> = {}
    let userFilter = ''
    if (userId !== undefined) {
      userFilter = 'AND user_id = :userId'
      bindings.userId = String(userId)
    }

    const result = await db.rawQuery(
      `
      SELECT
        COUNT(*)::int AS processed,
        COUNT(*) FILTER (
          WHERE descriptions->'artistic_scores'
                IS DISTINCT FROM descriptions->'artistic_scores_raw'
        )::int AS corrected,
        COUNT(DISTINCT user_id)::int AS users
      FROM photos
      WHERE deleted_at IS NULL
        ${userFilter}
        AND jsonb_exists(descriptions, 'artistic_scores_raw')
      `,
      bindings
    )

    const row = result.rows[0] ?? {}
    return {
      photosProcessed: Number(row.processed ?? 0),
      photosCorrected: Number(row.corrected ?? 0),
      users: Number(row.users ?? 0),
    }
  }

  // ─── Carga ────────────────────────────────────────────────────────────────

  /**
   * Los ids del pool: las `limit` fotos más recientes por `created_at` que pueden
   * participar (con scores Y con dhash), o `null` si no hay tope. Se resuelve una sola
   * vez y se pasa a `loadCatalog` y `dhashEdges` para que el catálogo y el grafo caigan
   * exactamente sobre el mismo conjunto — dos `LIMIT` sueltos podrían discrepar en el
   * borde por empates de fecha, y ahí el desempate por `id` los alinea.
   *
   * Es el recorte que mantiene tratable la pasada automática: encoger el corpus es lo
   * único que baja el coste del emparejado dhash (ver `dhashEdges`). Heurística de
   * nivelado, no fórmula — ver `recentPoolLimit`.
   */
  private async resolvePoolIds(
    userId: number | string,
    limit: number
  ): Promise<number[] | null> {
    if (!limit || limit <= 0) return null

    const result = await db.rawQuery(
      `
      SELECT id
      FROM photos
      WHERE user_id = :userId
        AND deleted_at IS NULL
        AND confirmed IS NOT FALSE
        AND dhash IS NOT NULL
        AND descriptions->'artistic_scores' IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT :limit
      `,
      { userId: String(userId), limit }
    )

    return result.rows.map((row: any) => Number(row.id))
  }

  private async loadCatalog(
    userId: number | string,
    poolIds: number[] | null
  ): Promise<CatalogRow[]> {
    const bindings: Record<string, unknown> = { userId: String(userId) }
    let poolFilter = ''
    if (poolIds) {
      poolFilter = 'AND id = ANY(:poolIds)'
      bindings.poolIds = poolIds
    }

    const result = await db.rawQuery(
      `
      SELECT id,
             descriptions->'artistic_scores' AS scores,
             descriptions->'artistic_scores_raw' AS raw
      FROM photos
      WHERE user_id = :userId
        AND deleted_at IS NULL
        AND confirmed IS NOT FALSE
        AND descriptions->'artistic_scores' IS NOT NULL
        ${poolFilter}
      `,
      bindings
    )

    const rows: CatalogRow[] = []
    for (const row of result.rows) {
      // El ancla es `raw` si la foto ya pasó por el motor; si no, los activos.
      const stored = (row.raw ?? row.scores) as Record<string, unknown> | null
      if (!stored || typeof stored !== 'object') continue

      const raw: Record<string, number> = {}
      const types: Record<string, 'string' | 'number'> = {}
      for (const [key, value] of Object.entries(stored)) {
        const num = Number(value)
        if (!Number.isFinite(num)) continue
        raw[key] = num
        types[key] = typeof value === 'string' ? 'string' : 'number'
      }
      if (Object.keys(raw).length === 0) continue

      const active = (row.scores ?? {}) as Record<string, unknown>
      const current = typeof active === 'object' && active ? numericScores(active) : {}

      rows.push({ id: Number(row.id), raw, current, types, rawStored: stored })
    }

    return rows
  }

  /**
   * Señales por foto: histograma ya normalizado en L1 y EXIF crudo. Un `null` en
   * cualquiera de los dos significa "no se puede afirmar nada", no "son distintas".
   */
  private async loadPhotoSignals(photoIds: number[]): Promise<Map<number, PhotoSignals>> {
    const signals = new Map<number, PhotoSignals>()
    if (photoIds.length === 0) return signals

    const result = await db.rawQuery(
      `SELECT id, color_histogram, descriptions->'EXIF' AS exif
       FROM photos
       WHERE id = ANY(:photoIds)`,
      { photoIds }
    )

    for (const row of result.rows) {
      signals.set(Number(row.id), {
        histogram: parseColorHistogram(row.color_histogram),
        exif: row.exif ?? null,
      })
    }

    return signals
  }

  /**
   * Veto de metadatos: descarta las parejas que no pueden ser la misma toma por
   * mucho que el dhash o CLIP las den por parecidas. El caso que lo motiva son dos
   * disparos consecutivos con el zoom girado de por medio — la escena se parece en
   * luminancia, pero 125 mm y 48 mm no son el mismo encuadre.
   */
  private async filterBySameShot(edges: Edge[]): Promise<Edge[]> {
    if (edges.length === 0) return edges

    const ids = [...new Set(edges.flatMap((edge) => [edge.src, edge.dst]))]
    const signals = await this.loadPhotoSignals(ids)
    const override = SMOOTHING_CONFIG.perceptualDateOverride

    const kept: Edge[] = []
    // Aristas que caen SOLO por la fecha: candidatas a que un parecido perceptual
    // extremo levante el veto. Las que además discrepan en focal o cuerpo no entran
    // aquí — ese veto se queda, no es un artefacto de metadato.
    const dateOnlyRejects: Edge[] = []

    for (const edge of edges) {
      const first = signals.get(edge.src)?.exif ?? null
      const second = signals.get(edge.dst)?.exif ?? null
      if (isSameShot(first, second, SMOOTHING_CONFIG)) {
        kept.push(edge)
      } else if (
        override.enabled &&
        isSameShot(first, second, SMOOTHING_CONFIG, { ignoreDateTaken: true })
      ) {
        dateOnlyRejects.push(edge)
      }
    }

    if (dateOnlyRejects.length === 0) return kept

    const rescued = await this.rescueByPerceptualMatch(dateOnlyRejects, override)
    return [...kept, ...rescued]
  }

  /**
   * De las aristas que `isSameShot` tumbó SOLO por la fecha, conserva las que son el
   * MISMO contenido a la vista: dhash de muy pocos bits Y coseno CLIP muy alto, los dos
   * a la vez porque el dhash tiene un falso positivo que solo CLIP tapa (ver
   * `clipVerifyThreshold`). Sin dhash o sin embedding en alguna de las dos no se
   * rescata: falla cerrado.
   */
  private async rescueByPerceptualMatch(
    edges: Edge[],
    override: PerceptualDateOverrideConfig
  ): Promise<Edge[]> {
    const ids = [...new Set(edges.flatMap((edge) => [edge.src, edge.dst]))]

    // dhash y coseno se piden directos a la BD para no depender de qué mide `edge.sim`
    // (dhash o CLIP según la estrategia activa).
    const hashRows = await db.rawQuery(
      `SELECT id, dhash FROM photos WHERE id = ANY(:ids) AND dhash IS NOT NULL`,
      { ids }
    )
    const dhashById = new Map<number, string>()
    for (const row of hashRows.rows) dhashById.set(Number(row.id), String(row.dhash))

    const clip = await this.clipCosines(edges)

    return edges.filter((edge) => {
      const firstHash = dhashById.get(edge.src)
      const secondHash = dhashById.get(edge.dst)
      if (!firstHash || !secondHash) return false
      if (hammingDistance(firstHash, secondHash) > override.maxDhashBits) return false

      const cosine = clip.get(pairKey(edge.src, edge.dst))
      return cosine !== undefined && cosine >= override.minClip
    })
  }

  /**
   * Coseno CLIP de una lista de parejas, calculado en Postgres. Las parejas sin
   * embedding en alguna de las dos no salen del JOIN y quedan fuera del mapa.
   */
  private async clipCosines(edges: Edge[]): Promise<Map<string, number>> {
    const sims = new Map<string, number>()

    for (let offset = 0; offset < edges.length; offset += CLIP_VERIFY_CHUNK) {
      const chunk = edges.slice(offset, offset + CLIP_VERIFY_CHUNK)
      const result = await db.rawQuery(
        `SELECT p.a AS a, p.b AS b, 1 - (pa.embedding <=> pb.embedding) AS sim
         FROM unnest(:firstIds::int[], :secondIds::int[]) AS p(a, b)
         JOIN photos pa ON pa.id = p.a
         JOIN photos pb ON pb.id = p.b
         WHERE pa.embedding IS NOT NULL
           AND pb.embedding IS NOT NULL`,
        {
          firstIds: chunk.map((edge) => edge.src),
          secondIds: chunk.map((edge) => edge.dst),
        }
      )
      for (const row of result.rows) {
        sims.set(pairKey(Number(row.a), Number(row.b)), Number(row.sim))
      }
    }

    return sims
  }

  /**
   * Reparte el grafo en grupos homogéneos, cada uno con su modo.
   *
   * Se etiqueta CADA ARISTA con la relación que su evidencia sostiene (`relationFor`)
   * y se cliquea un grafo por relación, de más a menos evidencia. Como una foto entra
   * en el grupo de su relación más fuerte y desaparece de los demás, cada grupo sale
   * homogéneo por construcción: todas sus parejas comparten relación.
   *
   * Esto sustituye a un veredicto por grupo que recorría todas las parejas y bastaba
   * que una fallara para tumbar a las demás. Con grupos grandes aquello se llevaba por
   * delante casi todos los `version` buenos, y el daño crecía con el tamaño del grupo.
   * Ahora una foto sin evidencia se va a su propio grupo `default` en vez de arrastrar
   * a las que sí la tienen.
   */
  private async buildRelationGroups(
    adjacency: Map<number, SmoothingNeighbor[]>,
    strategy: NeighborStrategy,
    keepGroup: (members: number[]) => boolean
  ): Promise<{
    groups: number[][]
    groupModes: Map<number, CriterionProfileMode>
    sameFilePairs: number
    clipRejectedPairs: number
    clipSims: Map<string, number>
  }> {
    const signals = await this.loadPhotoSignals([...adjacency.keys()])
    const sameFile = await this.resolveSameFilePairs(adjacency, signals, strategy)
    const clipSims = await this.resolveClipSims(adjacency, signals, sameFile, strategy)

    const graphs = new Map<CriterionProfileMode, Map<number, SmoothingNeighbor[]>>(
      RELATION_ORDER.map((mode) => [mode, new Map<number, SmoothingNeighbor[]>()])
    )
    /** Las que tumba CLIP, con las dos cifras que hacen falta para juzgarlo. */
    const clipRejected = new Map<string, { clip: number; sim: number }>()

    // Las aristas son simétricas y `relationFor` también, así que las dos direcciones
    // de una pareja caen siempre en el mismo grafo — o se caen las dos.
    let labelled = 0
    for (const [id, neighbors] of adjacency) {
      if (++labelled % YIELD_EVERY === 0) await yieldToEventLoop()
      for (const neighbor of neighbors) {
        const key = pairKey(id, neighbor.id)
        const relation = relationFor(
          signals.get(id) ?? EMPTY_SIGNALS,
          signals.get(neighbor.id) ?? EMPTY_SIGNALS,
          neighbor.sim,
          sameFile.has(key),
          clipSims.get(key) ?? null
        )
        // Sin relación que sostenga la pareja, la arista no entra en ningún grafo: las
        // dos fotos siguen su camino y, si no les queda ninguna otra, no se agrupan ni
        // se tocan. No es lo mismo que degradarlas a `default`, que es lo que se está
        // descartando aquí.
        //
        // Hoy la única forma de llegar aquí es que CLIP haya tumbado la pareja, así que
        // contarlas es medir exactamente lo que hace `clipVerifyThreshold`.
        if (relation === null) {
          clipRejected.set(key, { clip: clipSims.get(key) ?? 0, sim: neighbor.sim })
          continue
        }

        const graph = graphs.get(relation)!
        graph.set(id, [...(graph.get(id) ?? []), neighbor])
      }
    }

    const groups: number[][] = []
    const groupModes = new Map<number, CriterionProfileMode>()
    const assigned = new Set<number>()

    for (const mode of RELATION_ORDER) {
      await yieldToEventLoop()
      const graph = prunedGraph(graphs.get(mode)!, assigned)

      for (const members of buildCliques(graph, SMOOTHING_CONFIG.maxGroupSize)) {
        // Se marcan como asignadas aunque el grupo no se conserve: si esta foto ya
        // agrupó por una relación más fuerte, no puede reaparecer en una más débil.
        for (const id of members) assigned.add(id)
        if (!keepGroup(members)) continue

        groupModes.set(groups.length, mode)
        groups.push(members)
      }
    }

    this.logClipRejections(clipRejected)

    return {
      groups,
      groupModes,
      sameFilePairs: sameFile.size,
      clipRejectedPairs: clipRejected.size,
      clipSims,
    }
  }

  /**
   * Qué ha tirado la verificación CLIP, al log. Sin esto el corte se toca a ciegas: el
   * contador del informe dice CUÁNTAS, y esto dice CUÁLES — que es lo único que permite
   * abrir las dos fotos y decidir si el corte está bien puesto.
   *
   * Se listan por los DOS extremos, porque responden a preguntas distintas:
   *
   *   · las peores      → ¿está cazando basura de verdad? Son las que confirman que la
   *                       capa hace algo, y las más rápidas de verificar a ojo.
   *   · las del borde   → ¿está cortando de más? Aquí es donde vive el error del umbral:
   *                       una pareja legítima a 0.79 se pierde sin dejar rastro.
   *
   * Solo la parte del medio se resume, que es la que no aporta nada para calibrar.
   */
  private logClipRejections(rejected: Map<string, { clip: number; sim: number }>) {
    if (rejected.size === 0) return

    const threshold = SMOOTHING_CONFIG.clipVerifyThreshold
    console.log(`[score-smoothing] CLIP descarta ${rejected.size} parejas (coseno < ${threshold})`)

    const sorted = [...rejected.entries()].sort(([, a], [, b]) => a.clip - b.clip)
    const half = Math.floor(CLIP_LOG_SAMPLE / 2)
    const worst = sorted.slice(0, half)
    // Si no llegan para las dos listas, no se parte: se enseñan todas una sola vez.
    const borderline = sorted.length > CLIP_LOG_SAMPLE ? sorted.slice(-half) : sorted.slice(half)

    const line = ([key, { clip, sim }]: [string, { clip: number; sim: number }]) => {
      const [first, second] = key.split(':')
      console.log(
        `[score-smoothing]   #${first} ↔ #${second}  clip ${clip.toFixed(3)}  ` +
          `dhash ${sim.toFixed(3)} (${Math.round((1 - sim) * DHASH_BITS)} bits)`
      )
    }

    console.log('[score-smoothing]  las más flagrantes:')
    worst.forEach(line)

    const skipped = sorted.length - worst.length - borderline.length
    if (skipped > 0) console.log(`[score-smoothing]   … ${skipped} parejas intermedias`)

    console.log('[score-smoothing]  las que rozan el corte (aquí se ve si corta de más):')
    borderline.forEach(line)
  }

  /**
   * Las parejas que resultan ser el MISMO archivo, resueltas comparando los bytes de
   * su miniatura en R2. Es la segunda vía hacia `duplicate`, para las que el EXIF no
   * puede juzgar (ver `utils/score_smoothing_thumb`).
   *
   * Dos filtros antes de tocar la red, y los dos importan:
   *
   *   · `unknown` y no `contradicted`. Solo se le ofrece la vía a quien no tiene
   *     prueba, nunca a quien tiene prueba en contra: si el EXIF dice que son dos
   *     disparos distintos, ya está decidido y no hay nada que reabrir.
   *   · el prefiltro de parecido, que aquí no es evidencia sino ahorro — la prueba
   *     son los bytes, así que puede ser más laxo que el `sim >= 1` de la ruta normal.
   *
   * Y el coste sale por FOTO, no por pareja: la huella se pide una vez por foto y
   * todas las comparaciones que la usen son ya igualdad de cadenas.
   */
  private async resolveSameFilePairs(
    adjacency: Map<number, SmoothingNeighbor[]>,
    signals: Map<number, PhotoSignals>,
    strategy: NeighborStrategy
  ): Promise<Set<string>> {
    const config = SMOOTHING_CONFIG.duplicateByBytes
    const sameFile = new Set<string>()
    if (!config.enabled) return sameFile

    const minSim = strategy === 'dhash' ? config.minSim.dhash : config.minSim.clip

    const candidates = new Map<string, [number, number]>()
    for (const [id, neighbors] of adjacency) {
      for (const neighbor of neighbors) {
        if (neighbor.sim < minSim) continue

        const key = pairKey(id, neighbor.id)
        if (candidates.has(key)) continue

        const evidence = captureEvidence(
          signals.get(id)?.exif ?? null,
          signals.get(neighbor.id)?.exif ?? null,
          SMOOTHING_CONFIG
        )
        if (evidence !== 'unknown') continue

        candidates.set(key, [id, neighbor.id])
      }
    }

    if (candidates.size === 0) return sameFile

    const photoIds = [...new Set([...candidates.values()].flat())].sort((a, b) => a - b)
    const fingerprints = await this.loadThumbFingerprints(photoIds.slice(0, config.maxPhotos))

    for (const [key, [first, second]] of candidates) {
      const firstPrint = fingerprints.get(first)
      // Una foto sin huella no opina: no se empareja con nadie, ni siquiera con otra
      // que tampoco la tenga.
      if (!firstPrint) continue
      if (firstPrint === fingerprints.get(second)) sameFile.add(key)
    }

    return sameFile
  }

  /**
   * Coseno CLIP de las parejas que van a decidirse en `default`. Es la segunda pasada
   * que verifica lo que el dhash propone: la huella empareja por "mancha clara sobre
   * fondo plano" y hay parejas que pasan cualquier umbral de Hamming sin parecerse en
   * nada (ver `clipVerifyThreshold`).
   *
   * Barato por dos motivos, y los dos importan:
   *
   *   · No busca nada. Los embeddings ya están escritos en `photos.embedding`, y la
   *     lista de parejas llega cerrada del grafo, así que esto es un `<=>` por pareja
   *     y no el kNN sobre el catálogo entero que hace la estrategia `clip`. Medido:
   *     289 ms para las 39.164 parejas de un catálogo de 22.574 fotos.
   *   · El coseno se calcula EN POSTGRES. Traerse los vectores a Node da el mismo
   *     resultado (desvío 7e-7) pero mueve 93 MB de texto; así vuelve un float por
   *     pareja.
   *
   * Solo se pregunta por las parejas que lo necesitan: las que ya tienen prueba de
   * EXIF o de bytes se van a `version` o `duplicate` y el veto no las toca.
   */
  private async resolveClipSims(
    adjacency: Map<number, SmoothingNeighbor[]>,
    signals: Map<number, PhotoSignals>,
    sameFile: Set<string>,
    strategy: NeighborStrategy
  ): Promise<Map<string, number>> {
    const sims = new Map<string, number>()
    const candidates = new Map<string, [number, number]>()

    for (const [id, neighbors] of adjacency) {
      for (const neighbor of neighbors) {
        const key = pairKey(id, neighbor.id)
        if (candidates.has(key) || sims.has(key)) continue

        const relation = relationEvidence(
          signals.get(id) ?? EMPTY_SIGNALS,
          signals.get(neighbor.id) ?? EMPTY_SIGNALS,
          neighbor.sim,
          sameFile.has(key)
        )
        if (relation !== 'default') continue

        // Con `clip` o `both` la propuesta YA es el coseno: preguntarlo otra vez sería
        // preguntar dos veces lo mismo.
        if (strategy !== 'dhash') {
          sims.set(key, neighbor.sim)
          continue
        }

        candidates.set(key, [id, neighbor.id])
      }
    }

    const pairs = [...candidates.values()]
    for (let offset = 0; offset < pairs.length; offset += CLIP_VERIFY_CHUNK) {
      const chunk = pairs.slice(offset, offset + CLIP_VERIFY_CHUNK)
      // Las parejas sin embedding en alguna de las dos no salen del JOIN, y su ausencia
      // en el mapa es lo que hace que el veto falle abierto.
      const result = await db.rawQuery(
        `SELECT p.a AS a, p.b AS b, 1 - (pa.embedding <=> pb.embedding) AS sim
         FROM unnest(:firstIds::int[], :secondIds::int[]) AS p(a, b)
         JOIN photos pa ON pa.id = p.a
         JOIN photos pb ON pb.id = p.b
         WHERE pa.embedding IS NOT NULL
           AND pb.embedding IS NOT NULL`,
        {
          firstIds: chunk.map(([first]) => first),
          secondIds: chunk.map(([, second]) => second),
        }
      )

      for (const row of result.rows) {
        sims.set(pairKey(Number(row.a), Number(row.b)), Number(row.sim))
      }
    }

    return sims
  }

  /** Huella de la miniatura de cada foto, resolviendo antes su clave en el bucket. */
  private async loadThumbFingerprints(photoIds: number[]): Promise<Map<number, string>> {
    if (photoIds.length === 0) return new Map()

    const result = await db.rawQuery(
      `SELECT id, thumbnail_name
       FROM photos
       WHERE id = ANY(:photoIds)
         AND thumbnail_name IS NOT NULL`,
      { photoIds }
    )

    return fetchThumbFingerprints(
      result.rows.map((row: any) => ({ id: Number(row.id), key: String(row.thumbnail_name) }))
    )
  }

  /**
   * Grafo de parejas de casi-duplicados. En una ejecución sembrada se dan un par de
   * saltos extra para conocer también las aristas ENTRE los vecinos: sin eso no se
   * puede saber quién es vecino de quién y los grupos no se podrían formar.
   */
  private async buildGraph(
    userId: number | string,
    seedIds: number[],
    fullRun: boolean,
    strategy: NeighborStrategy,
    simThreshold: number,
    dhashThreshold: number,
    poolIds: number[] | null
  ): Promise<{ adjacency: Map<number, SmoothingNeighbor[]>; edgeSims: number[] }> {
    const adjacency = new Map<number, SmoothingNeighbor[]>()
    const edgeSims: number[] = []
    const seen = new Set<string>()

    const addEdge = (a: number, b: number, sim: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      if (!seen.has(key)) {
        seen.add(key)
        edgeSims.push(sim)
      }
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const list = adjacency.get(from) ?? []
        if (!list.some((nb) => nb.id === to)) {
          list.push({ id: to, sim })
          adjacency.set(from, list)
        }
      }
    }

    // dhash compara todo el catálogo de una vez y es barato, así que no necesita
    // expandirse por saltos: el grafo completo ya está resuelto en la primera pasada.
    const dhashEdges =
      strategy === 'clip' ? null : await this.dhashEdges(userId, dhashThreshold, poolIds)

    let frontier = seedIds
    const known = new Set<number>(seedIds)
    const hops = fullRun ? 1 : MAX_EXPANSION_HOPS

    for (let hop = 0; hop < hops && frontier.length > 0; hop++) {
      const candidates = await this.strategyEdges(
        userId,
        frontier,
        strategy,
        dhashEdges,
        simThreshold
      )
      // Los vetos van aquí y no dentro de dhashEdges para que valgan también con
      // CLIP, que es la estrategia por defecto y hasta ahora no filtraba nada.
      const edges = await this.filterBySameShot(candidates)

      const next: number[] = []
      for (const edge of edges) {
        addEdge(edge.src, edge.dst, edge.sim)
        if (!known.has(edge.dst)) {
          known.add(edge.dst)
          next.push(edge.dst)
        }
      }
      frontier = next
    }

    return { adjacency, edgeSims }
  }

  /** Aristas de las semillas según el método elegido. */
  private async strategyEdges(
    userId: number | string,
    seeds: number[],
    strategy: NeighborStrategy,
    dhashEdges: Map<string, number> | null,
    simThreshold: number
  ): Promise<Edge[]> {
    if (strategy === 'dhash') {
      return this.filterDhashEdges(seeds, dhashEdges!)
    }

    const clipEdges = await this.vectorService.findNearestPhotoNeighbors(
      userId,
      seeds,
      SMOOTHING_CONFIG.k,
      simThreshold,
      this.onGraphProgress
    )

    if (strategy === 'clip') return clipEdges

    // 'both': solo sobreviven las parejas que los dos métodos aceptan. Elimina los
    // falsos positivos de CLIP (dos productos distintos sobre el mismo fondo) a
    // costa de perder las ráfagas donde la cámara se movió, que dhash no ve.
    return clipEdges.filter((edge) => dhashEdges!.has(pairKey(edge.src, edge.dst)))
  }

  /**
   * Todas las parejas de casi-duplicados del usuario según dhash. Reutiliza el
   * comparador con índice por bandas del worker de CPU (el mismo que la detección
   * de duplicados), que evita el todos-contra-todos.
   */
  private async dhashEdges(
    userId: number | string,
    threshold: number,
    poolIds: number[] | null
  ): Promise<Map<string, number>> {
    const bindings: Record<string, unknown> = { userId: String(userId) }
    let poolFilter = ''
    if (poolIds) {
      poolFilter = 'AND id = ANY(:poolIds)'
      bindings.poolIds = poolIds
    }

    const result = await db.rawQuery(
      `
      SELECT id, dhash
      FROM photos
      WHERE user_id = :userId
        AND deleted_at IS NULL
        AND confirmed IS NOT FALSE
        AND dhash IS NOT NULL
        ${poolFilter}
      `,
      bindings
    )

    const photoHashes: { id: number; hash: string }[] = result.rows.map((row: any) => ({
      id: Number(row.id),
      hash: row.dhash,
    }))
    const hashById = new Map<number, string>(photoHashes.map((p) => [p.id, p.hash]))
    if (photoHashes.length === 0) return new Map()

    // En el worker de CPU, no en línea: el índice por bandas no es gratis a este
    // umbral. Con 22.5k hashes son ~60 s de CPU pura —y crece más que lineal—, así
    // que ejecutarlo aquí congela el event loop y con él toda la API durante un
    // minuto largo. Correr "en segundo plano" no salva de eso: sigue siendo el mismo
    // hilo. Si no hay worker compilado (desarrollo), el pool lo hace en línea.
    const matches = await CpuWorkerPool.run<Record<number, number[]>>('dhash_compare', {
      photoHashes,
      photosToCheckIds: photoHashes.map((p) => p.id),
      threshold,
    })

    // La distancia se recalcula solo para las parejas ya emparejadas (son pocas) y se
    // normaliza a 0-1 para que el informe hable el mismo idioma que CLIP.
    const edges = new Map<string, number>()
    for (const [rawId, neighborIds] of Object.entries(matches)) {
      const id = Number(rawId)
      for (const neighborId of neighborIds) {
        const key = pairKey(id, neighborId)
        if (edges.has(key)) continue
        const a = hashById.get(id)
        const b = hashById.get(neighborId)
        if (!a || !b) continue
        edges.set(key, 1 - hammingDistance(a, b) / DHASH_BITS)
      }
    }

    this.onGraphProgress?.(photoHashes.length, photoHashes.length)
    return edges
  }

  /** Convierte el mapa global de parejas dhash en aristas de las semillas dadas. */
  private filterDhashEdges(seeds: number[], dhashEdges: Map<string, number>): Edge[] {
    const seedSet = new Set(seeds)
    const edges: Edge[] = []

    for (const [key, sim] of dhashEdges) {
      const [a, b] = key.split(':').map(Number)
      if (seedSet.has(a)) edges.push({ src: a, dst: b, sim })
      if (seedSet.has(b)) edges.push({ src: b, dst: a, sim })
    }

    return edges
  }

  // ─── Escritura ────────────────────────────────────────────────────────────

  /**
   * Lo que se escribe: los valores corregidos como scores activos y el original del
   * LLM como ancla. Nada más — el desplazamiento de cada barra es la resta.
   */
  private buildPatch(row: CatalogRow, smoothedValues: Record<string, number>) {
    const smoothed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(smoothedValues)) {
      smoothed[key] = formatLikeSample(row.rawStored[key], value)
    }
    // Claves que el motor no toca (p. ej. de otra variante) se conservan tal cual.
    for (const [key, value] of Object.entries(row.rawStored)) {
      if (!(key in smoothed)) smoothed[key] = value
    }

    return { artistic_scores: smoothed, artistic_scores_raw: row.rawStored }
  }

  private async persist(updates: { id: number; patch: Record<string, unknown> }[]): Promise<void> {
    for (let i = 0; i < updates.length; i += PERSIST_CHUNK) {
      const chunk = updates.slice(i, i + PERSIST_CHUNK)
      const values = chunk.map(() => '(?::int, ?::jsonb)').join(', ')
      const bindings = chunk.flatMap((u) => [u.id, JSON.stringify(u.patch)])

      // Merge superficial: reemplaza solo las dos claves del patch y deja intactas
      // EXIF, context, story, visual_aspects, notes… El `- 'scores_smoothing'`
      // barra la traza que escribían las versiones anteriores del motor.
      await db.rawQuery(
        `UPDATE photos p
         SET descriptions = (COALESCE(p.descriptions, '{}'::jsonb) - 'scores_smoothing') || v.patch
         FROM (VALUES ${values}) AS v(id, patch)
         WHERE p.id = v.id`,
        bindings
      )
    }
  }

  // ─── Informe ──────────────────────────────────────────────────────────────

  private criterionStats(
    groups: number[][],
    nodes: SmoothingNode[],
    outcome: ReturnType<typeof smoothScores>,
    catalogById: Map<number, CatalogRow>,
    tightSim: number
  ): CriterionStat[] {
    const stats = new Map<string, { shifts: number[]; crossedSeven: number }>()

    for (const node of nodes) {
      const result = outcome.nodes.get(node.id)!
      for (const [key, delta] of Object.entries(result.moved)) {
        const entry = stats.get(key) ?? { shifts: [], crossedSeven: 0 }
        entry.shifts.push(Math.abs(delta))
        const before = node.raw[key]
        const after = result.values[key]
        if ((before >= 7 && after < 7) || (before < 7 && after >= 7)) entry.crossedSeven++
        stats.set(key, entry)
      }
    }

    const noise = this.noiseEstimate(groups, nodes, catalogById, tightSim)
    const keys = new Set([...stats.keys(), ...noise.keys()])

    return [...keys]
      .map((criterion) => {
        const entry = stats.get(criterion) ?? { shifts: [], crossedSeven: 0 }
        const n = entry.shifts.length
        const sigma = noise.get(criterion)
        return {
          criterion,
          photosMoved: n,
          avgAbsShift: n ? Number((entry.shifts.reduce((a, b) => a + b, 0) / n).toFixed(3)) : 0,
          maxAbsShift: n ? Number(Math.max(...entry.shifts).toFixed(3)) : 0,
          crossedSeven: entry.crossedSeven,
          noiseSigma: sigma ? Number(sigma.sigma.toFixed(3)) : null,
          noiseSamples: sigma?.samples ?? 0,
        }
      })
      .sort((a, b) => b.photosMoved - a.photosMoved)
  }

  /**
   * Ruido del evaluador: dispersión de los valores ORIGINALES dentro de grupos muy
   * compactos (prácticamente el mismo fotograma). Ahí la diferencia real es ~0, así
   * que lo que se mide es la inconsistencia del LLM en ese criterio.
   */
  private noiseEstimate(
    groups: number[][],
    nodes: SmoothingNode[],
    catalogById: Map<number, CatalogRow>,
    tightSim: number
  ): Map<string, { sigma: number; samples: number }> {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const variances = new Map<string, number[]>()

    for (const group of groups) {
      if (group.length < 2) continue

      const sims = group.flatMap((id) => (nodeById.get(id)?.neighbors ?? []).map((nb) => nb.sim))
      const avgSim = sims.reduce((a, b) => a + b, 0) / (sims.length || 1)
      if (avgSim < tightSim) continue

      const keys = new Set<string>()
      for (const id of group) {
        for (const key of Object.keys(catalogById.get(id)?.raw ?? {})) keys.add(key)
      }

      for (const key of keys) {
        const values = group
          .map((id) => catalogById.get(id)?.raw[key])
          .filter((v): v is number => Number.isFinite(v))
        if (values.length < 2) continue
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
        const list = variances.get(key) ?? []
        list.push(variance)
        variances.set(key, list)
      }
    }

    const result = new Map<string, { sigma: number; samples: number }>()
    for (const [key, list] of variances) {
      const pooled = list.reduce((a, b) => a + b, 0) / list.length
      result.set(key, { sigma: Math.sqrt(pooled), samples: list.length })
    }
    return result
  }

  /**
   * Grupos de casi-duplicados listos para pintar en el admin: cada uno con sus fotos
   * y los valores antes y después. Van ordenados de más a menos movimiento, que es el
   * orden en el que hay que revisarlos a ojo para validar el umbral de similitud.
   */
  private async buildPreviewGroups(
    groups: number[][],
    groupModes: Map<number, CriterionProfileMode>,
    nodes: SmoothingNode[],
    outcome: ReturnType<typeof smoothScores>,
    planned: Map<number, PlannedWrite>,
    clipSims: Map<string, number>,
    options: { maxGroups: number; withThumbnails: boolean }
  ): Promise<PreviewGroup[]> {
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const previews: PreviewGroup[] = []

    for (const [groupIndex, group] of groups.entries()) {
      const photos: PreviewPhoto[] = []
      let totalShift = 0
      let changedPhotos = 0
      let simSum = 0

      for (const id of group) {
        const member = nodeById.get(id)
        const result = outcome.nodes.get(id)
        if (!member || !result) continue

        for (const delta of Object.values(result.moved)) totalShift += Math.abs(delta)
        if (result.changed) changedPhotos++
        simSum += result.avgSim

        photos.push({
          id,
          thumbnailUrl: null, // se rellena después, en una sola consulta
          originalFileName: null,
          neighbors: result.neighborCount,
          neighborIds: member.neighbors.map((nb) => nb.id),
          avgSim: Number(result.avgSim.toFixed(4)),
          before: member.raw,
          // El valor con el formato con el que se persistiría, no el flotante en
          // bruto: así comparar `after` con `current` responde exactamente a
          // "¿esta foto ya está hecha o falta por escribir?".
          after: planned.get(id)?.after ?? result.values,
          current: planned.get(id)?.current ?? {},
        })
      }

      if (photos.length < 2) continue
      const clip = clipStats(group, clipSims)
      previews.push({
        size: photos.length,
        avgSim: Number((simSum / photos.length).toFixed(4)),
        avgClipSim: clip.avg,
        minClipSim: clip.min,
        changedPhotos,
        totalShift: Number(totalShift.toFixed(2)),
        mode: groupModes.get(groupIndex) ?? 'default',
        photos: photos.sort((a, b) => a.id - b.id),
      })
    }

    // Primero los grupos donde algo se mueve, y dentro de esos, los que más. Los
    // de revelado distinto se mueven poco por diseño, así que se cuelan arriba a
    // propósito: son los que hay que mirar para validar el corte del histograma.
    const sorted = previews.sort(
      (a, b) =>
        Number(b.mode === 'version') - Number(a.mode === 'version') ||
        b.totalShift - a.totalShift ||
        b.size - a.size
    )
    // `maxGroups: 0` = todos. Lo usa la simulación del admin, que guarda el plan
    // entero y lo pagina después: recortar aquí escondería justo lo que falta.
    const selected = options.maxGroups > 0 ? sorted.slice(0, options.maxGroups) : sorted

    const photoIds = options.withThumbnails
      ? selected.flatMap((g) => g.photos.map((p) => p.id))
      : []
    if (photoIds.length > 0) {
      // El modelo calcula thumbnailUrl a partir del worker de imágenes; se reutiliza
      // en vez de recomponer la URL a mano.
      const rows = await Photo.query()
        .whereIn('id', photoIds)
        .select('id', 'thumbnail_name', 'original_file_name')
      const byId = new Map(rows.map((row) => [row.id, row]))

      for (const group of selected) {
        for (const photo of group.photos) {
          const row = byId.get(photo.id)
          photo.thumbnailUrl = row?.thumbnailUrl ?? null
          photo.originalFileName = row?.originalFileName ?? null
        }
      }
    }

    return selected
  }

  private topMovers(
    nodes: SmoothingNode[],
    outcome: ReturnType<typeof smoothScores>,
    limit: number
  ): TopMover[] {
    const movers: TopMover[] = []

    for (const node of nodes) {
      const result = outcome.nodes.get(node.id)!
      for (const [criterion, delta] of Object.entries(result.moved)) {
        movers.push({
          photoId: node.id,
          criterion,
          from: node.raw[criterion],
          to: result.values[criterion],
          delta,
          neighbors: result.neighborCount,
          avgSim: Number(result.avgSim.toFixed(4)),
        })
      }
    }

    return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit)
  }

  /** Reparto del parecido de las parejas. Los tramos cubren las dos escalas (CLIP y dhash). */
  private histogram(sims: number[]): Record<string, number> {
    const buckets: Record<string, number> = {
      '<0.90': 0,
      '0.90-0.95': 0,
      '0.95-0.98': 0,
      '0.98-0.99': 0,
      '0.99-0.995': 0,
      '0.995-1': 0,
    }
    for (const sim of sims) {
      if (sim < 0.9) buckets['<0.90']++
      else if (sim < 0.95) buckets['0.90-0.95']++
      else if (sim < 0.98) buckets['0.95-0.98']++
      else if (sim < 0.99) buckets['0.98-0.99']++
      else if (sim < 0.995) buckets['0.99-0.995']++
      else buckets['0.995-1']++
    }
    return buckets
  }

  /** Perfil efectivo de un criterio; expuesto para informes y admin. */
  public static profileFor(key: string) {
    return getCriterionProfile(key)
  }
}
