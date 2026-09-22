/**
 * Clustering and 2D layout for a small set of photo vectors (a canvas board, 2-500 photos).
 *
 * Everything here is deterministic and runs in-process: at this scale an O(n^3) pass over
 * the distance matrix costs milliseconds, and the atlas' UMAP would only add noise (its
 * neighbourhood parameters assume thousands of points).
 */

const EPSILON = 1e-9

export function normalize(vector: number[]): number[] {
  let norm = 0
  for (const x of vector) norm += x * x
  norm = Math.sqrt(norm)
  if (norm < EPSILON) return vector.map(() => 0)
  return vector.map((x) => x / norm)
}

/** Cosine distance between two unit vectors, clamped to [0, 2]. */
export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return Math.min(2, Math.max(0, 1 - dot))
}

export function distanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(vectors[i], vectors[j])
      dist[i][j] = d
      dist[j][i] = d
    }
  }
  return dist
}

/**
 * Ward-linkage agglomerative clustering. Returns one label array per requested k (keyed
 * by k), all read off the same merge sequence, so the partition for k groups is always a
 * coarsening of the one for k + 1.
 *
 * Ward rather than average linkage because on real embeddings average linkage peels the
 * outliers off one at a time ([44, 1], [42, 2, 1], ...) and never splits the bulk, while
 * the eye sees two or three masses. Ward merges by the increase in within-group variance,
 * which is what yields balanced groups. It is defined on squared Euclidean distances;
 * `dist` is cosine distance between unit vectors, which is exactly half of that, and the
 * Lance-Williams update below is linear, so the constant does not matter.
 */
export function agglomerativeLabels(dist: number[][], ks: number[]): Map<number, number[]> {
  return wardMerges(dist, ks).labelsByK
}

/**
 * The Ward merge sequence: labels per requested k, plus `mergeCost[k]`, the cost of the
 * merge that turned k + 1 groups into k. Costs grow along the sequence; a sudden jump at
 * k means going below k groups merges two masses that did not belong together.
 */
export function wardMerges(
  dist: number[][],
  ks: number[]
): { labelsByK: Map<number, number[]>; mergeCost: Map<number, number> } {
  const n = dist.length
  const wanted = new Set(ks.filter((k) => k >= 1 && k <= n))
  const out = new Map<number, number[]>()
  const mergeCost = new Map<number, number>()

  // Cluster-level distances (Lance-Williams, Ward), sizes and members.
  const linkage = dist.map((row) => row.slice())
  const size = new Array(n).fill(1)
  const members: number[][] = Array.from({ length: n }, (_, i) => [i])
  const alive = new Set<number>(Array.from({ length: n }, (_, i) => i))

  const snapshot = () => {
    const labels = new Array(n).fill(0)
    let g = 0
    for (const c of alive) {
      for (const m of members[c]) labels[m] = g
      g++
    }
    return labels
  }

  if (wanted.has(n)) out.set(n, snapshot())

  while (alive.size > 1) {
    let bestA = -1
    let bestB = -1
    let best = Infinity
    for (const a of alive) {
      for (const b of alive) {
        if (b <= a) continue
        if (linkage[a][b] < best) {
          best = linkage[a][b]
          bestA = a
          bestB = b
        }
      }
    }

    const sizeA = size[bestA]
    const sizeB = size[bestB]
    for (const c of alive) {
      if (c === bestA || c === bestB) continue
      const sizeC = size[c]
      const merged =
        ((sizeA + sizeC) * linkage[bestA][c] +
          (sizeB + sizeC) * linkage[bestB][c] -
          sizeC * best) /
        (sizeA + sizeB + sizeC)
      linkage[bestA][c] = merged
      linkage[c][bestA] = merged
    }
    members[bestA] = members[bestA].concat(members[bestB])
    size[bestA] += size[bestB]
    alive.delete(bestB)

    mergeCost.set(alive.size, best)
    if (wanted.has(alive.size)) out.set(alive.size, snapshot())
  }

  return { labelsByK: out, mergeCost }
}

/**
 * Elbow of the Ward dendrogram inside [minK, maxK]: the k whose next merge (to k - 1
 * groups) costs the most relative to the one that produced it. Ties and flat sequences
 * resolve to the smaller k.
 */
export function elbowK(mergeCost: Map<number, number>, minK: number, maxK: number): number {
  let bestK = minK
  let bestRatio = -Infinity
  for (let k = minK; k <= maxK; k++) {
    const below = mergeCost.get(k - 1)
    const here = mergeCost.get(k)
    if (below === undefined || here === undefined) continue
    const ratio = here < EPSILON ? (below < EPSILON ? 1 : Infinity) : below / here
    if (ratio > bestRatio + EPSILON) {
      bestRatio = ratio
      bestK = k
    }
  }
  return bestK
}

export interface ChooseClustersOptions {
  minGroups?: number
  maxGroups?: number
}

/**
 * The whole ladder of partitions, one per k from 1 up to `maxGroups` (capped at half the
 * photos, so a group is never forced below two members on average), read off a single
 * Ward pass so each coarser level merges groups of the finer one.
 *
 * `suggestedK` is the elbow of the merge costs, looked for between 2 and roughly
 * sqrt(n / 2) groups (3 for 16 photos, 5 for 45, 6 for 71, never above `maxGroups`): the
 * default is the coarse reading of the set, and the finer levels are there for the user
 * to dial in. Silhouette was tried for this and discarded: on real embeddings it is flat
 * (0.1 to 0.25 for every k) and its argmax jumps between 2 and 8 with the criterion,
 * while the elbow picks the 2 or 3 masses the eye sees. Fewer than four photos are one
 * group.
 */
export function clusterHierarchy(
  dist: number[][],
  options: ChooseClustersOptions = {}
): { partitions: Map<number, number[]>; suggestedK: number } {
  const n = dist.length
  const partitions = new Map<number, number[]>()
  if (n === 0) return { partitions, suggestedK: 0 }

  const maxGroups = Math.max(1, Math.min(options.maxGroups ?? 8, Math.floor(n / 2)))
  const ks: number[] = []
  for (let k = 1; k <= maxGroups; k++) ks.push(k)
  const { labelsByK, mergeCost } = wardMerges(dist, ks)
  for (const k of ks) partitions.set(k, labelsByK.get(k) ?? new Array(n).fill(0))

  let suggestedK = 1
  if (n >= 4 && maxGroups >= 2) {
    const minK = Math.min(maxGroups, Math.max(2, options.minGroups ?? 2))
    const maxK = Math.max(minK, Math.min(maxGroups, Math.round(Math.sqrt(n / 2))))
    suggestedK = elbowK(mergeCost, minK, maxK)
  }
  return { partitions, suggestedK }
}

/** The suggested level of `clusterHierarchy`, as labels plus its k. */
export function chooseClusters(
  dist: number[][],
  options: ChooseClustersOptions = {}
): { labels: number[]; k: number } {
  const { partitions, suggestedK } = clusterHierarchy(dist, options)
  if (suggestedK === 0) return { labels: [], k: 0 }
  return { labels: partitions.get(suggestedK)!, k: suggestedK }
}

/**
 * Classical (Torgerson) MDS to 2D via power iteration on the double-centred squared
 * distance matrix. Deterministic start vectors, so the same input yields the same layout.
 */
export function classicalMds(dist: number[][]): number[][] {
  const n = dist.length
  if (n === 0) return []
  if (n === 1) return [[0, 0]]

  const sq = dist.map((row) => row.map((d) => d * d))
  const rowMean = sq.map((row) => row.reduce((s, x) => s + x, 0) / n)
  const grandMean = rowMean.reduce((s, x) => s + x, 0) / n
  const b: number[][] = sq.map((row, i) =>
    row.map((x, j) => -0.5 * (x - rowMean[i] - rowMean[j] + grandMean))
  )

  const coords: number[][] = Array.from({ length: n }, () => [0, 0])
  for (let axis = 0; axis < 2; axis++) {
    let v = Array.from({ length: n }, (_, i) => Math.cos(i * 1.7 + axis) + 0.1 * (i + 1))
    v = normalize(v)
    let lambda = 0
    for (let iter = 0; iter < 300; iter++) {
      const next = new Array(n).fill(0)
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let j = 0; j < n; j++) s += b[i][j] * v[j]
        next[i] = s
      }
      lambda = next.reduce((s, x, i) => s + x * v[i], 0)
      const normalized = normalize(next)
      let delta = 0
      for (let i = 0; i < n; i++) delta += Math.abs(normalized[i] - v[i])
      v = normalized
      if (delta < 1e-10) break
    }
    const scale = Math.sqrt(Math.max(0, lambda))
    for (let i = 0; i < n; i++) coords[i][axis] = v[i] * scale
    // Deflate so the next pass finds the following component.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) b[i][j] -= lambda * v[i] * v[j]
    }
  }
  return coords
}

/** Radius (in photo cells) a group of `size` photos spreads over in the cloud layout. */
function groupRadius(size: number): number {
  return size <= 1 ? 0 : 0.8 * Math.sqrt(size)
}

/** Clear band kept between two groups' discs, in photo cells. */
const GROUP_GAP_CELLS = 1.5

/**
 * Cloud layout in "photo cell" units: group centres by MDS of the centroids, spread apart
 * until their discs do not touch; each member by MDS within its group, scaled to the
 * group's disc. Proximity reads as similarity inside a group and between groups, while
 * the groups themselves stay visibly apart.
 */
export function clusterLayout(
  vectors: number[][],
  labels: number[],
  k: number
): { positions: number[][]; centres: number[][] } {
  const n = vectors.length
  if (n === 0) return { positions: [], centres: [] }

  const groups: number[][] = Array.from({ length: k }, () => [])
  labels.forEach((label, i) => groups[label].push(i))

  const dims = vectors[0].length
  const centroids = groups.map((idx) => {
    const sum = new Array(dims).fill(0)
    for (const i of idx) for (let d = 0; d < dims; d++) sum[d] += vectors[i][d]
    return normalize(sum.map((x) => x / Math.max(1, idx.length)))
  })
  const radii = groups.map((idx) => groupRadius(idx.length))

  let centres = classicalMds(distanceMatrix(centroids))
  if (k > 1) {
    // Identical centroids collapse MDS to a point: fall back to a ring.
    let degenerate = false
    for (let i = 0; i < k && !degenerate; i++) {
      for (let j = i + 1; j < k; j++) {
        const d = Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1])
        if (d < EPSILON) {
          degenerate = true
          break
        }
      }
    }
    if (degenerate) {
      centres = groups.map((_, i) => {
        const angle = (2 * Math.PI * i) / k
        return [Math.cos(angle), Math.sin(angle)]
      })
    }
    // Scale so the mean centre distance matches the mean disc separation needed: the MDS
    // proportions survive (a single factor set by the tightest pair would push every
    // other pair several times further than needed). Then separate only the pairs whose
    // discs still touch, each by just the missing distance.
    const needed = (i: number, j: number) => radii[i] + radii[j] + GROUP_GAP_CELLS
    const gap = (i: number, j: number) =>
      Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1])
    let sumDistance = 0
    let sumNeeded = 0
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        sumDistance += gap(i, j)
        sumNeeded += needed(i, j)
      }
    }
    const base = sumDistance > EPSILON ? sumNeeded / sumDistance : 1
    centres = centres.map(([x, y]) => [x * base, y * base])
    for (let iter = 0; iter < 200; iter++) {
      let moved = false
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          const d = gap(i, j)
          const missing = needed(i, j) - d
          if (missing <= EPSILON) continue
          const [ux, uy] =
            d > EPSILON
              ? [(centres[j][0] - centres[i][0]) / d, (centres[j][1] - centres[i][1]) / d]
              : [Math.cos(i + j), Math.sin(i + j)]
          centres[i] = [centres[i][0] - (ux * missing) / 2, centres[i][1] - (uy * missing) / 2]
          centres[j] = [centres[j][0] + (ux * missing) / 2, centres[j][1] + (uy * missing) / 2]
          moved = true
        }
      }
      if (!moved) break
    }
  } else {
    centres = [[0, 0]]
  }

  const positions: number[][] = Array.from({ length: n }, () => [0, 0])
  groups.forEach((idx, g) => {
    const local = classicalMds(distanceMatrix(idx.map((i) => vectors[i])))
    let maxNorm = 0
    for (const [x, y] of local) maxNorm = Math.max(maxNorm, Math.hypot(x, y))
    const factor = maxNorm > EPSILON ? radii[g] / maxNorm : 0
    idx.forEach((i, m) => {
      positions[i] = [centres[g][0] + local[m][0] * factor, centres[g][1] + local[m][1] * factor]
    })
  })

  return { positions, centres }
}
