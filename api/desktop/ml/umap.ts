import { UMAP } from 'umap-js'
import { pcaScores } from './pca.js'

/**
 * UMAP como el de umap-learn que usa el servicio Python, sobre umap-js (que ya reproduce su grafo
 * difuso y su optimización) con tres ajustes para acercarlo a umap-learn:
 * - con menos de 4096 puntos, vecinos exactos en vez de aproximados, como umap-learn;
 * - los parámetros a y b de la curva se ajustan bien (el ajuste de umap-js trata mal los puntos
 *   por debajo de minDist);
 * - inicialización PCA, escalada como en umap-learn. umap-learn usa por defecto la espectral,
 *   que no tiene equivalente en JavaScript; la PCA es su alternativa documentada.
 * No es idéntico al de Python (ninguna ejecución lo es entre bibliotecas distintas), pero es el
 * mismo algoritmo con los mismos parámetros.
 */

export type UmapOptions = {
  nNeighbors: number
  minDist: number
  spread: number
  nComponents: number
  seed: number
}

/** Generador reproducible (mulberry32), para que una misma entrada dé siempre el mismo resultado. */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(random: () => number) {
  const u = 1 - random()
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Distancia coseno de umap-learn (también con vectores nulos). */
export function cosineDistance(x: number[], y: number[]) {
  let dot = 0
  let nx = 0
  let ny = 0
  for (let i = 0; i < x.length; i++) {
    dot += x[i] * y[i]
    nx += x[i] * x[i]
    ny += y[i] * y[i]
  }
  if (nx === 0 && ny === 0) return 0
  if (nx === 0 || ny === 0) return 1
  return 1 - dot / Math.sqrt(nx * ny)
}

/**
 * a y b de la curva 1 / (1 + a·x^(2b)) que mejor imita la caída exponencial desplazada
 * (find_ab_params de umap-learn, mínimos cuadrados con Levenberg-Marquardt desde a = b = 1).
 */
export function findAB(spread: number, minDist: number) {
  const xs = Array.from({ length: 300 }, (_, i) => (spread * 3 * i) / 299)
  const ys = xs.map((x) => (x < minDist ? 1 : Math.exp(-(x - minDist) / spread)))
  const residuals = (a: number, b: number) => xs.map((x, i) => 1 / (1 + a * x ** (2 * b)) - ys[i])
  const cost = (a: number, b: number) => residuals(a, b).reduce((s, r) => s + r * r, 0)

  let a = 1
  let b = 1
  let lambda = 1e-3
  let current = cost(a, b)
  for (let iter = 0; iter < 1000; iter++) {
    // Jacobiano de los residuos respecto a (a, b).
    let jaa = 0
    let jab = 0
    let jbb = 0
    let ga = 0
    let gb = 0
    const r = residuals(a, b)
    xs.forEach((x, i) => {
      if (x === 0) return
      const p = x ** (2 * b)
      const denom = (1 + a * p) ** 2
      const da = -p / denom
      const db = (-a * p * 2 * Math.log(x)) / denom
      jaa += da * da
      jab += da * db
      jbb += db * db
      ga += da * r[i]
      gb += db * r[i]
    })
    let improved = false
    while (lambda < 1e12) {
      const maa = jaa * (1 + lambda)
      const mbb = jbb * (1 + lambda)
      const det = maa * mbb - jab * jab
      const stepA = (-ga * mbb + gb * jab) / det
      const stepB = (-gb * maa + ga * jab) / det
      const next = cost(a + stepA, b + stepB)
      if (Number.isFinite(next) && next < current) {
        const relative = (current - next) / Math.max(current, 1e-300)
        a += stepA
        b += stepB
        current = next
        lambda = Math.max(lambda / 10, 1e-12)
        improved = relative > 1e-14
        break
      }
      lambda *= 10
    }
    if (!improved) break
  }
  return { a, b }
}

/** k vecinos exactos (incluido el propio punto) por distancia coseno. */
function exactNeighbors(data: number[][], k: number) {
  const indices: number[][] = []
  const distances: number[][] = []
  for (const row of data) {
    const bestIdx = new Array(k).fill(-1)
    const bestDist = new Array(k).fill(Infinity)
    data.forEach((other, j) => {
      const d = cosineDistance(row, other)
      if (d >= bestDist[k - 1]) return
      let pos = k - 1
      while (pos > 0 && bestDist[pos - 1] > d) {
        bestDist[pos] = bestDist[pos - 1]
        bestIdx[pos] = bestIdx[pos - 1]
        pos--
      }
      bestDist[pos] = d
      bestIdx[pos] = j
    })
    indices.push(bestIdx)
    distances.push(bestDist)
  }
  return { indices, distances }
}

/** init="pca" de umap-learn: PCA, escala a coordenada máxima 10 con algo de ruido, y luego a [0, 10]. */
function pcaInit(data: number[][], nComponents: number, random: () => number) {
  const scores = pcaScores(data, nComponents, { maxFitRows: 10000, random }).map((row) => {
    const padded = row.slice(0, nComponents)
    while (padded.length < nComponents) padded.push(0)
    return padded
  })
  let maxAbs = 0
  for (const row of scores) for (const v of row) maxAbs = Math.max(maxAbs, Math.abs(v))
  const expansion = maxAbs > 0 ? 10 / maxAbs : 1
  const noisy = scores.map((row) => row.map((v) => v * expansion + normal(random) * 0.0001))
  for (let c = 0; c < nComponents; c++) {
    let min = Infinity
    let max = -Infinity
    for (const row of noisy) {
      min = Math.min(min, row[c])
      max = Math.max(max, row[c])
    }
    for (const row of noisy) row[c] = max > min ? (10 * (row[c] - min)) / (max - min) : 0
  }
  return noisy
}

/**
 * Descenso de gradiente de umap-js (optimizeLayoutStep) con arrays tipados: las mismas
 * operaciones y la misma secuencia aleatoria, varias veces más rápido con catálogos grandes.
 */
function optimizeLayout(state: any, random: () => number) {
  const rows: number[][] = state.headEmbedding
  const n = rows.length
  const dim = rows[0].length
  const emb = new Float64Array(n * dim)
  rows.forEach((row, i) => emb.set(row, i * dim))
  const head = Int32Array.from(state.head)
  const tail = Int32Array.from(state.tail)
  const perSample = Float64Array.from(state.epochsPerSample)
  const perNegative = perSample.map((e) => e / NEGATIVE_SAMPLE_RATE)
  const nextSample = Float64Array.from(perSample)
  const nextNegative = Float64Array.from(perNegative)
  const { a, b, nEpochs, nVertices } = state
  const clip = (x: number) => (x > 4 ? 4 : x < -4 ? -4 : x)
  let alpha = 1

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    for (let i = 0; i < perSample.length; i++) {
      if (nextSample[i] > epoch) continue
      const j = head[i] * dim
      const k = tail[i] * dim
      let d2 = 0
      for (let d = 0; d < dim; d++) {
        const diff = emb[j + d] - emb[k + d]
        d2 += diff * diff
      }
      let coeff = 0
      if (d2 > 0) coeff = (-2 * a * b * Math.pow(d2, b - 1)) / (a * Math.pow(d2, b) + 1)
      for (let d = 0; d < dim; d++) {
        const grad = clip(coeff * (emb[j + d] - emb[k + d]))
        emb[j + d] += grad * alpha
        emb[k + d] += -grad * alpha
      }
      nextSample[i] += perSample[i]

      const negatives = Math.floor((epoch - nextNegative[i]) / perNegative[i])
      for (let p = 0; p < negatives; p++) {
        const vertex = Math.floor(random() * nVertices)
        const o = vertex * dim
        let nd2 = 0
        for (let d = 0; d < dim; d++) {
          const diff = emb[j + d] - emb[o + d]
          nd2 += diff * diff
        }
        let negCoeff = 0
        if (nd2 > 0) negCoeff = (2 * b) / ((0.001 + nd2) * (a * Math.pow(nd2, b) + 1))
        else if (head[i] === vertex) continue
        for (let d = 0; d < dim; d++) {
          const grad = negCoeff > 0 ? clip(negCoeff * (emb[j + d] - emb[o + d])) : 4
          emb[j + d] += grad * alpha
        }
      }
      nextNegative[i] += negatives * perNegative[i]
    }
    alpha = 1 - epoch / nEpochs
  }
  return rows.map((_, i) => Array.from(emb.subarray(i * dim, (i + 1) * dim)))
}

const NEGATIVE_SAMPLE_RATE = 5

export function umapEmbed(data: number[][], options: UmapOptions): number[][] {
  const random = seededRandom(options.seed)
  const umap = new UMAP({
    nComponents: options.nComponents,
    nNeighbors: options.nNeighbors,
    minDist: options.minDist,
    spread: options.spread,
    nEpochs: data.length <= 10000 ? 500 : 200,
    distanceFn: cosineDistance,
    random,
  })
  if (data.length < 4096) {
    const { indices, distances } = exactNeighbors(data, options.nNeighbors)
    umap.setPrecomputedKNN(indices, distances)
  }
  umap.initializeFit(data)

  // umap-js mantiene referencias a las filas de su incrustación: se sobrescriben en su sitio.
  const init = pcaInit(data, options.nComponents, random)
  const embedding = umap.getEmbedding()
  embedding.forEach((row, i) => row.forEach((_, c) => (row[c] = init[i][c])))
  const state = (umap as any).optimizationState
  Object.assign(state, findAB(options.spread, options.minDist))
  return optimizeLayout(state, random)
}
