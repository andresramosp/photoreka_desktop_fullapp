import { pcaScores } from './pca.js'
import { hdbscanTree } from './hdbscan.js'
import { seededRandom, umapEmbed } from './umap.js'

/**
 * Los dos cálculos del servicio Python que usan UMAP, con su misma preparación de datos y la
 * misma forma de respuesta: /reduce_embeddings_to_3d (atlas 3D y nube de tags) y /get_clusters
 * (revisión de informes). Solo se implementa el camino que usa la API (método "umap"); los
 * valores por defecto son los del servicio.
 */

const l2Normalize = (rows: number[][]) =>
  rows.map((row) => {
    const norm = Math.sqrt(row.reduce((s, v) => s + v * v, 0)) || 1
    return row.map((v) => v / norm)
  })

const clampNeighbors = (requested: number, n: number) => Math.min(Math.max(2, requested), n - 1)
const clampMinDist = (requested: number) => Math.max(0, Math.min(requested, 0.99))

export function reduceEmbeddingsTo3d(payload: any) {
  const method = payload.method ?? 'pca_tsne'
  if (method !== 'umap') throw new Error(`Método de reducción no disponible en el escritorio: ${method}`)
  const items: { id?: any; embedding: number[] }[] = payload.items
  const outputDims = Number(payload.output_dims ?? 3)
  const pcaLimit = Number(payload.umap_n_components_pca ?? 50)
  const randomState = payload.random_state ?? 42

  // El servicio normaliza siempre (L2) cuando no se pide otra normalización, como aquí.
  let matrix = l2Normalize(items.map((item) => item.embedding.map(Number)))
  const n = matrix.length
  const originalDim = n ? matrix[0].length : 0
  const ids = items.map((item, i) => item.id ?? String(i))
  let coords: number[][]

  if (n === 0) {
    coords = []
  } else if (n === 1) {
    coords = [Array.from({ length: outputDims }, (_, i) => matrix[0][i] ?? 0)]
  } else {
    if (n < 4) throw new Error(`UMAP requires at least 4 samples, but only ${n} provided.`)
    if (originalDim > pcaLimit) {
      let components = Math.min(pcaLimit, originalDim, n - 1)
      if (components < 3) components = Math.min(3, originalDim, n)
      matrix = pcaScores(matrix, components)
    }
    coords = umapEmbed(matrix, {
      nNeighbors: clampNeighbors(Number(payload.umap_n_neighbors ?? 15), n),
      minDist: clampMinDist(Number(payload.umap_min_dist ?? 0.1)),
      spread: Number(payload.umap_spread ?? 1),
      nComponents: outputDims,
      seed: Number(randomState),
    })
  }

  return {
    items: ids.map((id, i) => ({ id, embedding_3d: coords[i].map((v) => Math.fround(v)) })),
    meta: {
      method: 'umap',
      original_dimension: originalDim,
      effective_dimension: outputDims,
      n_samples: n,
      random_state: randomState,
      umap_spread: Number(payload.umap_spread ?? 1),
    },
  }
}

const euclidean = (x: number[], y: number[]) => Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0))

export function computeClusters(payload: any) {
  const items: { id: any; embedding: number[] }[] = payload.items ?? []
  if (items.length === 0) throw new Error("'items' list cannot be empty")
  if (payload.dim_reduction_method !== 'umap') {
    throw new Error(`Reducción previa no disponible en el escritorio: ${payload.dim_reduction_method}`)
  }
  const minClusterSize = Number(payload.min_cluster_size ?? 15)
  const minSamples = payload.min_samples == null ? minClusterSize : Number(payload.min_samples)
  const baseEpsilon = Number(payload.cluster_selection_epsilon ?? 0)
  const maxClusters = payload.max_clusters == null ? null : Number(payload.max_clusters)

  const ids = items.map((item) => String(item.id))
  const embeddings = items.map((item) => item.embedding.map(Number))
  const n = embeddings.length
  if (minClusterSize < 2) throw new Error('min_cluster_size debe ser al menos 2')
  if (minClusterSize > n) {
    throw new Error(`min_cluster_size (${minClusterSize}) no puede ser mayor que el número de muestras (${n})`)
  }
  if (n < 4) throw new Error(`UMAP requiere al menos 4 muestras, pero solo hay ${n}`)

  const reduced = umapEmbed(l2Normalize(embeddings), {
    nNeighbors: clampNeighbors(Number(payload.umap_n_neighbors ?? 20), n),
    minDist: clampMinDist(Number(payload.umap_min_dist ?? 0.5)),
    spread: Number(payload.umap_spread ?? 5),
    nComponents: Number(payload.umap_n_components ?? 30),
    seed: 42,
  })

  const run = hdbscanTree(reduced, { minClusterSize, minSamples })
  const countClusters = (labels: number[]) => new Set(labels.filter((l) => l !== -1)).size

  let labels = run(baseEpsilon)
  let effectiveEpsilon = baseEpsilon
  if (maxClusters !== null && maxClusters > 0 && countClusters(labels) > maxClusters) {
    // Igual que el servicio: épsilon creciente, en fracciones de la distancia media entre puntos
    // (de una muestra de hasta 200, aquí con semilla fija para que el resultado sea reproducible).
    const random = seededRandom(42)
    const sample = [...reduced.keys()]
      .map((i) => ({ i, r: random() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, Math.min(200, n))
      .map(({ i }) => reduced[i])
    let total = 0
    let pairs = 0
    for (let a = 0; a < sample.length; a++) {
      for (let b = a + 1; b < sample.length; b++) {
        total += euclidean(sample[a], sample[b])
        pairs++
      }
    }
    const meanDist = pairs ? total / pairs : 0
    const candidates = [0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3].map((f) => Math.max(0, meanDist * f))
    let reached = false
    for (const epsilon of candidates) {
      const attempt = run(epsilon)
      if (countClusters(attempt) <= maxClusters) {
        labels = attempt
        effectiveEpsilon = epsilon
        reached = true
        break
      }
    }
    if (!reached) {
      effectiveEpsilon = candidates[candidates.length - 1]
      labels = run(effectiveEpsilon)
    }
  }

  const noiseCount = labels.filter((l) => l === -1).length
  const clusteredCount = n - noiseCount
  const clusters = [...new Set(labels.filter((l) => l !== -1))]
    .sort((a, b) => a - b)
    .map((label) => {
      const members = labels.flatMap((l, i) => (l === label ? [i] : []))
      // Centroide y distancias sobre los vectores originales, como el servicio.
      const dim = embeddings[0].length
      const centroid = Array.from({ length: dim }, (_, d) => members.reduce((s, i) => s + embeddings[i][d], 0) / members.length)
      const percentage = clusteredCount > 0 ? (members.length / clusteredCount) * 100 : 0
      return {
        cluster_id: label,
        size: members.length,
        percentage: Math.round(percentage * 100) / 100,
        photo_ids: members.map((i) => ids[i]),
        centroid,
        centroid_distances: members.map((i) => euclidean(embeddings[i], centroid)),
      }
    })

  return {
    clusters,
    meta: {
      method: 'hdbscan',
      n_clusters: clusters.length,
      noise_count: noiseCount,
      n_samples: n,
      min_cluster_size: minClusterSize,
      min_samples: minSamples,
      cluster_selection_method: 'eom',
      cluster_selection_epsilon: effectiveEpsilon,
      max_clusters: maxClusters,
      dim_reduction_method: 'umap',
    },
  }
}
