/**
 * HDBSCAN como la biblioteca hdbscan del servicio Python, con su configuración de uso: distancia
 * euclídea, alpha 1 y selección "eom" sin cluster único, con cluster_selection_epsilon opcional.
 * Sigue sus pasos: distancia de núcleo al min_samples-ésimo vecino, árbol de expansión mínima de
 * la distancia de alcance mutuo, árbol de enlace simple, árbol condensado, estabilidad, selección
 * por exceso de masa, búsqueda por épsilon y etiquetado (-1 = ruido).
 *
 * El árbol no depende de épsilon: se construye una vez y se puede seleccionar con varios valores.
 */

export type HdbscanOptions = { minClusterSize: number; minSamples: number }

type CondensedRow = { parent: number; child: number; lambda: number; size: number }
type Linkage = [number, number, number, number][]

function flatten(points: number[][]) {
  const dim = points[0].length
  const flat = new Float64Array(points.length * dim)
  points.forEach((p, i) => flat.set(p, i * dim))
  return { flat, dim }
}

/** Distancia al k-ésimo vecino más cercano (el propio punto cuenta como el primero), con árbol k-d. */
function kthNeighborDistances(flat: Float64Array, n: number, dim: number, k: number) {
  const order = Int32Array.from({ length: n }, (_, i) => i)
  type Node = { start: number; end: number; axis: number; split: number; left?: Node; right?: Node }
  const build = (start: number, end: number): Node => {
    if (end - start <= 16) return { start, end, axis: -1, split: 0 }
    let axis = 0
    let widest = -1
    for (let d = 0; d < dim; d++) {
      let min = Infinity
      let max = -Infinity
      for (let i = start; i < end; i++) {
        const v = flat[order[i] * dim + d]
        if (v < min) min = v
        if (v > max) max = v
      }
      if (max - min > widest) {
        widest = max - min
        axis = d
      }
    }
    const slice = Array.from(order.subarray(start, end)).sort((a, b) => flat[a * dim + axis] - flat[b * dim + axis])
    order.set(slice, start)
    const mid = (start + end) >> 1
    return { start, end, axis, split: flat[order[mid] * dim + axis], left: build(start, mid), right: build(mid, end) }
  }
  const root = build(0, n)

  const result = new Float64Array(n)
  const best = new Float64Array(k)
  for (let q = 0; q < n; q++) {
    best.fill(Infinity)
    const visit = (node: Node) => {
      if (node.axis === -1) {
        for (let i = node.start; i < node.end; i++) {
          const p = order[i]
          let sum = 0
          for (let d = 0; d < dim; d++) {
            const diff = flat[q * dim + d] - flat[p * dim + d]
            sum += diff * diff
          }
          if (sum < best[k - 1]) {
            let j = k - 1
            while (j > 0 && best[j - 1] > sum) {
              best[j] = best[j - 1]
              j--
            }
            best[j] = sum
          }
        }
        return
      }
      const diff = flat[q * dim + node.axis] - node.split
      const [near, far] = diff < 0 ? [node.left!, node.right!] : [node.right!, node.left!]
      visit(near)
      if (diff * diff < best[k - 1]) visit(far)
    }
    visit(root)
    result[q] = Math.sqrt(best[k - 1])
  }
  return result
}

/** Árbol de expansión mínima (Prim denso) de la distancia de alcance mutuo, ordenado por peso. */
function mutualReachabilityMst(flat: Float64Array, n: number, dim: number, core: Float64Array) {
  // Se trabaja con cuadrados (mismo orden, sin raíces) y solo con los puntos aún fuera del árbol.
  const core2 = core.map((c) => c * c)
  const best = new Float64Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  const pending = Int32Array.from({ length: n - 1 }, (_, i) => i + 1)
  let remaining = n - 1
  const edges: [number, number, number][] = []
  let current = 0
  while (remaining > 0) {
    let nextPos = -1
    let nextDist = Infinity
    const base = current * dim
    const coreCurrent = core2[current]
    for (let p = 0; p < remaining; p++) {
      const j = pending[p]
      const other = j * dim
      let reach = 0
      for (let d = 0; d < dim; d++) {
        const diff = flat[base + d] - flat[other + d]
        reach += diff * diff
      }
      if (coreCurrent > reach) reach = coreCurrent
      if (core2[j] > reach) reach = core2[j]
      if (reach < best[j]) {
        best[j] = reach
        from[j] = current
      }
      if (best[j] < nextDist) {
        nextDist = best[j]
        nextPos = p
      }
    }
    const next = pending[nextPos]
    // Peso exacto: la raíz de un cuadrado puede no devolver la distancia de núcleo original.
    const a = from[next] * dim
    let sum = 0
    for (let d = 0; d < dim; d++) sum += (flat[a + d] - flat[next * dim + d]) ** 2
    edges.push([from[next], next, Math.max(Math.sqrt(sum), core[from[next]], core[next])])
    pending[nextPos] = pending[--remaining]
    current = next
  }
  return edges.sort((a, b) => a[2] - b[2])
}

/** Árbol de enlace simple: filas [izquierda, derecha, distancia, tamaño]; el nodo n+i es la fila i. */
function singleLinkage(edges: [number, number, number][], n: number): Linkage {
  const parent = Int32Array.from({ length: 2 * n - 1 }, (_, i) => i)
  const size = new Int32Array(2 * n - 1).fill(1)
  const find = (x: number) => {
    let root = x
    while (parent[root] !== root) root = parent[root]
    while (parent[x] !== root) {
      const up = parent[x]
      parent[x] = root
      x = up
    }
    return root
  }
  return edges.map(([a, b, delta], i) => {
    const ra = find(a)
    const rb = find(b)
    const node = n + i
    parent[ra] = node
    parent[rb] = node
    size[node] = size[ra] + size[rb]
    return [ra, rb, delta, size[node]]
  })
}

function bfsFromHierarchy(hierarchy: Linkage, root: number, n: number) {
  const result: number[] = []
  let toProcess = [root]
  while (toProcess.length) {
    for (const x of toProcess) result.push(x)
    const next: number[] = []
    for (const x of toProcess) if (x >= n) next.push(hierarchy[x - n][0], hierarchy[x - n][1])
    toProcess = next
  }
  return result
}

function condenseTree(hierarchy: Linkage, n: number, minClusterSize: number) {
  const root = 2 * hierarchy.length
  const relabel = new Int32Array(root + 1)
  relabel[root] = n
  let nextLabel = n + 1
  const ignore = new Uint8Array(root + 1)
  const rows: CondensedRow[] = []
  const countOf = (node: number) => (node >= n ? hierarchy[node - n][3] : 1)
  const dropPoints = (parentLabel: number, from: number, lambda: number) => {
    for (const sub of bfsFromHierarchy(hierarchy, from, n)) {
      if (sub < n) rows.push({ parent: parentLabel, child: sub, lambda, size: 1 })
      ignore[sub] = 1
    }
  }

  for (const node of bfsFromHierarchy(hierarchy, root, n)) {
    if (ignore[node] || node < n) continue
    const [left, right, distance] = hierarchy[node - n]
    const lambda = distance > 0 ? 1 / distance : Infinity
    const leftCount = countOf(left)
    const rightCount = countOf(right)
    if (leftCount >= minClusterSize && rightCount >= minClusterSize) {
      relabel[left] = nextLabel++
      rows.push({ parent: relabel[node], child: relabel[left], lambda, size: leftCount })
      relabel[right] = nextLabel++
      rows.push({ parent: relabel[node], child: relabel[right], lambda, size: rightCount })
    } else if (leftCount < minClusterSize && rightCount < minClusterSize) {
      dropPoints(relabel[node], left, lambda)
      dropPoints(relabel[node], right, lambda)
    } else if (leftCount < minClusterSize) {
      relabel[right] = relabel[node]
      dropPoints(relabel[node], left, lambda)
    } else {
      relabel[left] = relabel[node]
      dropPoints(relabel[node], right, lambda)
    }
  }
  return rows
}

function computeStability(tree: CondensedRow[], root: number) {
  const births = new Map<number, number>([[root, 0]])
  for (const row of tree) {
    const birth = births.get(row.child)
    if (birth === undefined || row.lambda < birth) births.set(row.child, row.lambda)
  }
  const stability = new Map<number, number>()
  for (const row of tree) {
    if (row.parent >= root) stability.set(row.parent, 0)
  }
  for (const row of tree) {
    stability.set(row.parent, stability.get(row.parent)! + (row.lambda - births.get(row.parent)!) * row.size)
  }
  return stability
}

function selectClusters(clusterTree: CondensedRow[], baseStability: Map<number, number>, root: number, epsilon: number) {
  const stability = new Map(baseStability)
  const children = new Map<number, number[]>()
  const parentOf = new Map<number, number>()
  const birthEps = new Map<number, number>()
  for (const row of clusterTree) {
    if (!children.has(row.parent)) children.set(row.parent, [])
    children.get(row.parent)!.push(row.child)
    parentOf.set(row.child, row.parent)
    birthEps.set(row.child, 1 / row.lambda)
  }
  const descendants = (node: number) => {
    const out: number[] = []
    let queue = [node]
    while (queue.length) {
      out.push(...queue)
      queue = queue.flatMap((c) => children.get(c) ?? [])
    }
    return out
  }

  const nodes = [...stability.keys()].filter((c) => c !== root).sort((a, b) => b - a)
  const isCluster = new Map(nodes.map((c) => [c, true]))
  for (const node of nodes) {
    const subtree = (children.get(node) ?? []).reduce((s, c) => s + stability.get(c)!, 0)
    if (subtree > stability.get(node)!) {
      isCluster.set(node, false)
      stability.set(node, subtree)
    } else {
      for (const sub of descendants(node)) if (sub !== node) isCluster.set(sub, false)
    }
  }

  const selected = nodes.filter((c) => isCluster.get(c)).sort((a, b) => a - b)
  if (epsilon === 0 || clusterTree.length === 0) return new Set(selected)

  const traverseUpwards = (leaf: number): number => {
    const parent = parentOf.get(leaf)!
    if (parent === root) return leaf
    return birthEps.get(parent)! > epsilon ? parent : traverseUpwards(parent)
  }
  const chosen = new Set<number>()
  const processed = new Set<number>()
  for (const leaf of selected) {
    if (birthEps.get(leaf)! < epsilon) {
      if (processed.has(leaf)) continue
      const up = traverseUpwards(leaf)
      chosen.add(up)
      for (const sub of descendants(up)) if (sub !== up) processed.add(sub)
    } else {
      chosen.add(leaf)
    }
  }
  return chosen
}

/** Etiqueta de cada punto: su cluster seleccionado más cercano hacia la raíz, o -1 (ruido). */
function label(parentOf: Map<number, number>, clusters: Set<number>, n: number) {
  const labelOf = new Map([...clusters].sort((a, b) => a - b).map((c, i) => [c, i]))
  return Array.from({ length: n }, (_, point) => {
    let node = parentOf.get(point)
    while (node !== undefined && !clusters.has(node)) node = parentOf.get(node)
    return node === undefined ? -1 : labelOf.get(node)!
  })
}

/** Construye el árbol y devuelve una función que etiqueta los puntos para un épsilon dado. */
export function hdbscanTree(points: number[][], options: HdbscanOptions): (epsilon: number) => number[] {
  const n = points.length
  if (n < 2) return () => new Array(n).fill(-1)
  const minSamples = Math.max(1, Math.min(n - 1, options.minSamples))
  const { flat, dim } = flatten(points)
  const core = kthNeighborDistances(flat, n, dim, minSamples + 1)
  const hierarchy = singleLinkage(mutualReachabilityMst(flat, n, dim, core), n)
  const tree = condenseTree(hierarchy, n, options.minClusterSize)
  if (tree.length === 0) return () => new Array(n).fill(-1)

  const root = n
  const stability = computeStability(tree, root)
  const clusterTree = tree.filter((r) => r.size > 1)
  const parentOf = new Map(tree.map((r) => [r.child, r.parent]))
  return (epsilon) => label(parentOf, selectClusters(clusterTree, stability, root, epsilon), n)
}
