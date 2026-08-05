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
import { CacheInvalidationService } from '#services/cache_invalidation_service'
import { hammingDistance } from '../utils/dhash.js'
import { dhashCompare } from '../utils/dhash_compare.js'
import { isSameCapture, isSameShot } from '../utils/score_smoothing_metadata.js'
import { isSameColorGrade, parseColorHistogram } from '../utils/score_smoothing_color.js'
import {
  SMOOTHING_CONFIG,
  SMOOTHING_VERSION,
  getCriterionProfile,
  getNeighborStrategy,
  type CriterionProfileMode,
  type NeighborStrategy,
} from '#config/score_smoothing'
import {
  smoothScores,
  buildCliques,
  formatLikeSample,
  isExactSimilarityGroup,
  type SmoothingNeighbor,
  type SmoothingNode,
} from '../utils/score_smoothing_math.js'

/** Saltos máximos al expandir componentes desde las semillas de un análisis. */
const MAX_EXPANSION_HOPS = 3
const PERSIST_CHUNK = 200
/** Longitud del dhash, para normalizar la distancia de Hamming a un 0-1. */
const DHASH_BITS = 64

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

/** Clave canónica de una pareja, independiente del orden. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
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
  /** Corte de similitud coseno para CLIP. Por defecto, el de la config. */
  simThreshold?: number
  /** Corte de distancia de Hamming para dHash. Por defecto, el de la config. */
  dhashThreshold?: number
  /** Cuántos movimientos mayores incluir en el informe. */
  topMovers?: number
  /** Adjunta los grupos con miniaturas y el antes/después (para la vista de admin). */
  includeGroups?: boolean
  /** Cuántos grupos devolver, de mayor a menor movimiento. */
  maxGroups?: number
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
}

/**
 * Grupo de casi-duplicados: TODAS sus fotos son vecinas entre sí, así que cada una
 * influye en todas las demás y en ninguna otra. Es la misma unidad que usa el motor
 * para calcular, de modo que lo que se ve es exactamente lo que se ha calculado.
 */
export interface PreviewGroup {
  size: number
  avgSim: number
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
  /** Cuántos son revelados distintos de la misma captura. */
  versionGroups: number
  largestGroup: number
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
  /** Tipo original de cada clave, para reescribir igual que estaba. */
  types: Record<string, 'string' | 'number'>
  /** Objeto raw tal cual se debe persistir en artistic_scores_raw. */
  rawStored: Record<string, unknown>
}

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
   */
  public async runForUser(
    userId: number | string,
    options: SmoothingRunOptions = {}
  ): Promise<SmoothingReport> {
    const startedAt = Date.now()
    const dryRun = options.dryRun ?? false
    const strategy = options.strategy ?? getNeighborStrategy()
    const simThreshold = options.simThreshold ?? SMOOTHING_CONFIG.simThreshold
    const dhashThreshold = options.dhashThreshold ?? SMOOTHING_CONFIG.dhashThreshold
    const topMoversLimit = options.topMovers ?? 30

    const catalog = await this.loadCatalog(userId)
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
      dhashThreshold
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
    // sí, así que cada una influye en todas las demás y en nadie más. Es a la vez lo
    // que calcula el motor y lo que se pinta en el admin.
    const seedSet = new Set(seedIds)
    const groups = buildCliques(adjacency, SMOOTHING_CONFIG.maxGroupSize).filter(
      (group) => !options.seedIds?.length || group.some((id) => seedSet.has(id))
    )

    // Solo de las fotos que han acabado en algún grupo, no del catálogo entero:
    // después de agrupar quedan los casi-duplicados y son una fracción mínima.
    const signals = await this.loadPhotoSignals(groups.flat())

    const nodes: SmoothingNode[] = []
    const groupOfNode = new Map<number, number>()
    const groupModes = new Map<number, CriterionProfileMode>()

    for (const [groupIndex, members] of groups.entries()) {
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

      // Las señales deciden el perfil, no el reparto: dos revelados de la misma
      // toma siguen siendo vecinos, solo cambia cuánto se les deja corregir.
      const mode = this.gradeModeFor(members, groupNodes, signals)
      for (const node of groupNodes) node.profileMode = mode
      groupModes.set(groupIndex, mode)

      for (const node of groupNodes) {
        nodes.push(node)
        const id = node.id
        groupOfNode.set(id, groupIndex)
      }
    }

    const outcome = smoothScores(nodes, SMOOTHING_CONFIG)

    const updates: { id: number; patch: Record<string, unknown> }[] = []
    for (const node of nodes) {
      const result = outcome.nodes.get(node.id)!
      if (!result.changed) continue
      const row = catalogById.get(node.id)!
      updates.push({ id: node.id, patch: this.buildPatch(row, result.values) })
    }

    if (!dryRun && updates.length > 0) {
      await this.persist(updates)
      await CacheInvalidationService.onAnalysisCompleted(String(userId), updates.length)
    }

    const previewGroups = options.includeGroups
      ? await this.buildPreviewGroups(groups, groupModes, nodes, outcome, options.maxGroups ?? 40)
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

  private async loadCatalog(userId: number | string): Promise<CatalogRow[]> {
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
      `,
      { userId: String(userId) }
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

      rows.push({ id: Number(row.id), raw, types, rawStored: stored })
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

    return edges.filter((edge) =>
      isSameShot(
        signals.get(edge.src)?.exif ?? null,
        signals.get(edge.dst)?.exif ?? null,
        SMOOTHING_CONFIG
      )
    )
  }

  /**
   * Perfil del grupo. Tres preguntas encadenadas, en este orden:
   *
   *  1. Si alguna pareja sale de disparos DISTINTOS, el grupo es una ráfaga y no
   *     unas versiones — por muy distinto que sea su color, que ahí es la luz
   *     cambiando y no una edición. Va a `default`.
   *  2. Si todas comparten disparo y alguna discrepa en revelado, es `version`.
   *  3. Si además comparten huella exacta, es el mismo archivo dos veces: no queda
   *     una sola señal que pueda justificar una diferencia de scores. `duplicate`.
   *
   * Se decide por grupo y no por foto: todas son vecinas entre sí y se corrigen
   * contra la misma mediana, así que perfiles mixtos serían incoherentes — la que
   * se moviera arrastraría a la que no.
   */
  private gradeModeFor(
    members: number[],
    groupNodes: SmoothingNode[],
    signals: Map<number, PhotoSignals>
  ): CriterionProfileMode {
    let differentGrade = false

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const first = signals.get(members[i])
        const second = signals.get(members[j])

        if (
          !isSameCapture(
            first?.exif ?? null,
            second?.exif ?? null,
            SMOOTHING_CONFIG.sameCaptureToleranceSeconds
          )
        ) {
          return 'default'
        }

        if (
          !isSameColorGrade(
            first?.histogram ?? null,
            second?.histogram ?? null,
            SMOOTHING_CONFIG.colorGrade
          )
        ) {
          differentGrade = true
        }
      }
    }

    if (differentGrade) return 'version'
    return isExactSimilarityGroup(groupNodes) ? 'duplicate' : 'default'
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
    dhashThreshold: number
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
    const dhashEdges = strategy === 'clip' ? null : await this.dhashEdges(userId, dhashThreshold)

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
    threshold: number
  ): Promise<Map<string, number>> {
    const result = await db.rawQuery(
      `
      SELECT id, dhash
      FROM photos
      WHERE user_id = :userId
        AND deleted_at IS NULL
        AND confirmed IS NOT FALSE
        AND dhash IS NOT NULL
      `,
      { userId: String(userId) }
    )

    const photoHashes: { id: number; hash: string }[] = result.rows.map((row: any) => ({
      id: Number(row.id),
      hash: row.dhash,
    }))
    const hashById = new Map<number, string>(photoHashes.map((p) => [p.id, p.hash]))
    if (photoHashes.length === 0) return new Map()

    // En línea, no en el worker de CPU: este trabajo ya corre en segundo plano y el
    // índice por bandas tarda milisegundos incluso con decenas de miles de hashes.
    const matches = dhashCompare({
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
   * Grupos de casi-duplicados listos para pintar en el admin: cada uno con sus fotos,
   * su miniatura y los valores antes y después. Se devuelven los que más se mueven,
   * que son los que hay que revisar a ojo para validar el umbral de similitud.
   */
  private async buildPreviewGroups(
    groups: number[][],
    groupModes: Map<number, CriterionProfileMode>,
    nodes: SmoothingNode[],
    outcome: ReturnType<typeof smoothScores>,
    maxGroups: number
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
          after: result.values,
        })
      }

      if (photos.length < 2) continue
      previews.push({
        size: photos.length,
        avgSim: Number((simSum / photos.length).toFixed(4)),
        changedPhotos,
        totalShift: Number(totalShift.toFixed(2)),
        mode: groupModes.get(groupIndex) ?? 'default',
        photos: photos.sort((a, b) => a.id - b.id),
      })
    }

    // Primero los grupos donde algo se mueve, y dentro de esos, los que más. Los
    // de revelado distinto se mueven poco por diseño, así que se cuelan arriba a
    // propósito: son los que hay que mirar para validar el corte del histograma.
    const selected = previews
      .sort(
        (a, b) =>
          Number(b.mode === 'version') - Number(a.mode === 'version') ||
          b.totalShift - a.totalShift ||
          b.size - a.size
      )
      .slice(0, maxGroups)

    const photoIds = selected.flatMap((g) => g.photos.map((p) => p.id))
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
