// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING — motor matemático puro (sin DB, sin IO).
//
// La regla completa, para cada barra de cada foto:
//
//   1. Se calcula la mediana del grupo (la foto y sus casi-duplicados).
//   2. Si ya está a menos de `tol` de esa mediana → no se mueve nada.
//   3. Si está más lejos → se acerca solo hasta quedar a `tol`, no hasta
//      la mediana.
//   4. Ese movimiento se recorta por `maxShift`, medido siempre contra el
//      valor original del LLM. Si el margen se acaba antes, se queda donde
//      haya llegado.
//
// Propiedades que el diseño garantiza y que los tests verifican:
//  1. Un grupo que ya está de acuerdo no se toca (movimiento exactamente 0).
//  2. Ninguna barra se aleja de su valor original más que su tope.
//  3. Al terminar, todas las fotos del grupo quedan como mucho a `tol` de la
//     mediana: `tol` es literalmente la variedad que sobrevive.
//  4. Idempotencia: la salida depende solo de (valores originales, grafo).
//     Reejecutar no vuelve a mover nada.
// ══════════════════════════════════════════════════════════════

import {
  getCriterionProfile,
  type CriterionProfileMode,
  type ResolvedCriterionProfile,
  type SmoothingConfig,
} from '#config/score_smoothing'

/** Resuelve el perfil de un criterio. Inyectable para probar y para overrides por ejecución. */
export type ProfileResolver = (key: string, mode?: CriterionProfileMode) => ResolvedCriterionProfile

export interface SmoothingNeighbor {
  id: number
  /**
   * Parecido con el nodo, ya filtrado por el umbral, normalizado a 0-1 sea cual sea
   * el método (coseno CLIP, o 1 − distancia_hamming/64 en dhash). Solo se usa para
   * informar: la similitud es una puerta de entrada al grupo, no un peso.
   */
  sim: number
}

export interface SmoothingNode {
  id: number
  /** Scores originales del LLM, ya parseados a número. */
  raw: Record<string, number>
  neighbors: SmoothingNeighbor[]
  /**
   * Selecciona los valores declarados para el revelado del grupo: `default` si
   * todas comparten color, `version` si alguien lo tocó. Lo decide el servicio,
   * que es quien tiene los histogramas.
   */
  profileMode?: CriterionProfileMode
}

export interface NodeOutcome {
  id: number
  /** Valores finales redondeados a 1 decimal (todas las claves, movidas o no). */
  values: Record<string, number>
  /** Solo las claves que se mueven: delta con signo respecto al original. */
  moved: Record<string, number>
  neighborCount: number
  /** Similitud media con los vecinos (0 si no tiene). */
  avgSim: number
  changed: boolean
}

export interface SmoothingOutcome {
  nodes: Map<number, NodeOutcome>
  iterations: number
  converged: boolean
}

/**
 * Mediana simple del multiconjunto (self + vecinos). Deliberadamente NO ponderada
 * por similitud: con pesos, el propio nodo domina en grupos pequeños y un par nunca
 * llegaría a moverse. Dentro del grupo, todos los vecinos valen igual.
 */
export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Grupo completo cuyas parejas tienen TODAS similitud exacta. Con dHash eso es una
 * distancia de Hamming de 0: la misma huella de luminancia, bit a bit.
 *
 * Por sí sola no prueba nada —una conversión a blanco y negro conserva la
 * luminancia y también da 0— así que solo se usa junto a las otras dos señales,
 * misma captura y mismo revelado. Es la tercera pata de `duplicate`.
 */
export function isExactSimilarityGroup(nodes: SmoothingNode[]): boolean {
  if (nodes.length < 2) return false
  const ids = new Set(nodes.map((node) => node.id))

  return nodes.every((node) => {
    const groupNeighbors = node.neighbors.filter((neighbor) => ids.has(neighbor.id))
    return (
      groupNeighbors.length === nodes.length - 1 &&
      groupNeighbors.every((neighbor) => neighbor.sim >= 1 - 1e-9)
    )
  })
}

/**
 * Segunda pasada sobre una pareja que la huella perceptual ya ha propuesto: ¿se parecen
 * de verdad? `clipSim` es el coseno de los embeddings, que no comparte el punto ciego
 * del pHash — ese "mancha clara compacta sobre fondo plano" con el que dos fotos sin
 * nada en común caen a 8 bits de distancia (ver `config/score_smoothing`).
 *
 * Falla ABIERTO, como todos los vetos del motor: sin embedding en alguna de las dos no
 * se puede afirmar que sean fotos distintas, así que decide quien decidía antes. Solo
 * `isSameColorGrade` falla cerrado, y por el motivo contrario — aquel responde "¿consta
 * que comparten revelado?" y sin el dato no consta.
 *
 * Quien llama es responsable de aplicarlo solo a `default`: un `version` legítimo puede
 * bajar el coseno por el revelado, y `duplicate` ya trae prueba propia.
 */
export function isVerifiedSimilar(clipSim: number | null, threshold: number): boolean {
  if (clipSim === null) return true
  return clipSim >= threshold
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Ejecuta el suavizado sobre un conjunto cerrado de nodos (una o varias componentes
 * conexas ya resueltas). Los vecinos que no estén en `nodes` se ignoran, así que el
 * llamador debe pasar componentes completas para que el resultado sea el mismo que
 * daría una pasada global.
 */
export function smoothScores(
  nodes: SmoothingNode[],
  config: SmoothingConfig,
  profileFor: ProfileResolver = getCriterionProfile
): SmoothingOutcome {
  const byId = new Map<number, SmoothingNode>(nodes.map((n) => [n.id, n]))

  // Estado vivo de la iteración, arrancando siempre desde los valores originales.
  const current = new Map<number, Record<string, number>>(nodes.map((n) => [n.id, { ...n.raw }]))

  // Vecinos efectivos: solo los que existen en este subgrafo.
  const edges = new Map<number, SmoothingNeighbor[]>(
    nodes.map((n) => [n.id, n.neighbors.filter((nb) => byId.has(nb.id) && nb.id !== n.id)])
  )

  let iterations = 0
  let converged = false

  for (let iter = 0; iter < config.maxIterations; iter++) {
    iterations = iter + 1
    const next = new Map<number, Record<string, number>>()
    let maxDelta = 0

    for (const node of nodes) {
      const neighbors = edges.get(node.id)!
      const values = current.get(node.id)!
      const updated: Record<string, number> = { ...values }

      if (neighbors.length === 0) {
        next.set(node.id, updated)
        continue
      }

      for (const key of Object.keys(node.raw)) {
        const self = values[key]
        if (!Number.isFinite(self)) continue

        const neighborValues: number[] = []
        for (const nb of neighbors) {
          const v = current.get(nb.id)?.[key]
          if (Number.isFinite(v)) neighborValues.push(v as number)
        }
        if (neighborValues.length === 0) continue

        const profile = profileFor(key, node.profileMode)
        const m = median([self, ...neighborValues])
        const d = self - m

        // Se acerca solo hasta quedar a `tol` de la mediana, nunca hasta la mediana
        // (salvo que tol sea 0). Si ya está dentro, `excess` es 0 y no se mueve nada.
        const excess = Math.max(0, Math.abs(d) - profile.tol)
        let candidate = self - Math.sign(d) * excess

        // Tope duro medido SIEMPRE contra el valor original: no se acumula entre
        // iteraciones ni entre ejecuciones.
        const raw = node.raw[key]
        candidate = clamp(candidate, raw - profile.maxShift, raw + profile.maxShift)
        candidate = clamp(candidate, config.scoreMin, config.scoreMax)

        updated[key] = candidate
        maxDelta = Math.max(maxDelta, Math.abs(candidate - self))
      }

      next.set(node.id, updated)
    }

    for (const [id, values] of next) current.set(id, values)

    if (maxDelta < config.epsilon) {
      converged = true
      break
    }
  }

  const outcome = new Map<number, NodeOutcome>()
  for (const node of nodes) {
    const neighbors = edges.get(node.id)!
    const finalValues = current.get(node.id)!
    const values: Record<string, number> = {}
    const moved: Record<string, number> = {}

    for (const key of Object.keys(node.raw)) {
      const raw = node.raw[key]
      let final = finalValues[key] ?? raw

      // El redondeo a un decimal es lo ÚLTIMO que pasa, así que puede empujar la
      // barra fuera de su tope: con `maxShift` acabado en .x5, un valor recortado
      // justo al límite (1.0 + 1.25 = 2.25) redondea hacia fuera y acaba a 1.3 del
      // original. Como el desvío del redondeo es de 0.05 como mucho, basta con
      // caerse al décimo de dentro.
      const profile = profileFor(key, node.profileMode)
      if (Math.abs(round1(final) - raw) - profile.maxShift > 1e-9) {
        final = round1(final) - Math.sign(final - raw) * 0.1
      }
      // El mínimo se mide sobre el movimiento REAL, no sobre el redondeado: si no,
      // un desplazamiento de 0.05 acabaría escribiéndose como un cambio de 0.1.
      // El epsilon evita que un movimiento de exactamente 0.1 se descarte por el
      // error de coma flotante (|8.0 − 8.1| sale 0.0999…).
      if (Math.abs(final - raw) >= config.minWrite - 1e-9) {
        values[key] = round1(final)
        moved[key] = round1(values[key] - raw)
      } else {
        values[key] = round1(raw)
      }
    }

    const avgSim =
      neighbors.length > 0 ? neighbors.reduce((acc, nb) => acc + nb.sim, 0) / neighbors.length : 0

    outcome.set(node.id, {
      id: node.id,
      values,
      moved,
      neighborCount: neighbors.length,
      avgSim,
      changed: Object.keys(moved).length > 0,
    })
  }

  return { nodes: outcome, iterations, converged }
}

/**
 * Reescribe un valor conservando el tipo que tenía en la base de datos. Los scores
 * conviven hoy como string ("7.5", que es lo que impone el schema del LLM) y como
 * number en filas antiguas, y hay consumidores que comprueban `typeof === 'number'`.
 * Cambiar el tipo al corregir rompería esos filtros de forma silenciosa.
 */
export function formatLikeSample(sample: unknown, value: number): string | number {
  return typeof sample === 'string' ? String(value) : value
}

/**
 * Parte el grafo en grupos donde CADA foto es vecina de TODAS las demás.
 *
 * Es la unidad de trabajo del motor y también la que se pinta: así lo que se ve es
 * exactamente lo que se calcula. La alternativa —componentes conexas— encadena
 * fotos que no se parecen entre sí (A~B, B~C sin que A~C) y produce grupos que
 * mezclan cosas que nada tienen que ver.
 *
 * Cada foto pertenece a un único grupo. El reparto es voraz y determinista: se
 * empieza por las fotos con más vecinos y, dentro de cada una, se admiten los
 * vecinos más parecidos que además sean vecinos de todos los ya admitidos.
 */
export function buildCliques(
  adjacency: Map<number, SmoothingNeighbor[]>,
  maxSize: number
): number[][] {
  const neighborSets = new Map<number, Set<number>>()
  for (const [id, list] of adjacency) {
    neighborSets.set(id, new Set(list.map((nb) => nb.id)))
  }

  const order = [...adjacency.keys()].sort((a, b) => {
    const sizeDiff = (neighborSets.get(b)?.size ?? 0) - (neighborSets.get(a)?.size ?? 0)
    return sizeDiff !== 0 ? sizeDiff : a - b
  })

  const assigned = new Set<number>()
  const cliques: number[][] = []

  for (const seed of order) {
    if (assigned.has(seed)) continue

    const members = [seed]
    const candidates = [...(adjacency.get(seed) ?? [])]
      .filter((nb) => !assigned.has(nb.id) && neighborSets.has(nb.id))
      .sort((a, b) => b.sim - a.sim || a.id - b.id)

    for (const candidate of candidates) {
      if (members.length >= maxSize) break
      const candidateNeighbors = neighborSets.get(candidate.id)!
      if (members.every((member) => candidateNeighbors.has(member))) {
        members.push(candidate.id)
      }
    }

    if (members.length < 2) continue
    for (const member of members) assigned.add(member)
    cliques.push(members.sort((a, b) => a - b))
  }

  return cliques
}
