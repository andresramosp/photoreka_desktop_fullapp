import { EigenvalueDecomposition, Matrix } from 'ml-matrix'

/**
 * PCA exacta (puntuaciones de las `k` primeras componentes), equivalente a sklearn.PCA salvo el
 * signo de cada componente, que no cambia las distancias. Con más muestras que dimensiones se
 * descompone la covarianza; si no, la matriz de Gram, que es más pequeña. Con `maxFitRows`, las
 * componentes se calculan con una muestra de ese tamaño y se proyectan todas las filas.
 */
export function pcaScores(
  rows: number[][],
  k: number,
  options: { maxFitRows?: number; random?: () => number } = {}
): number[][] {
  const n = rows.length
  const d = rows[0].length
  let fitRows = rows
  if (options.maxFitRows && n > options.maxFitRows) {
    const random = options.random ?? Math.random
    fitRows = rows
      .map((row) => ({ row, r: random() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, options.maxFitRows)
      .map(({ row }) => row)
  }
  const m = fitRows.length
  const mean = new Float64Array(d)
  for (const row of fitRows) for (let j = 0; j < d; j++) mean[j] += row[j] / m
  const center = (row: number[]) => Float64Array.from(row, (x, j) => x - mean[j])
  const centered = fitRows.map(center)

  const byGram = m < d
  const size = byGram ? m : d
  const product = new Matrix(size, size)
  if (byGram) {
    for (let a = 0; a < m; a++) {
      for (let b = a; b < m; b++) {
        let sum = 0
        for (let j = 0; j < d; j++) sum += centered[a][j] * centered[b][j]
        product.set(a, b, sum)
        product.set(b, a, sum)
      }
    }
  } else {
    const acc = new Float64Array(d * d)
    for (const row of centered) {
      for (let a = 0; a < d; a++) {
        const x = row[a]
        if (x === 0) continue
        const offset = a * d
        for (let b = a; b < d; b++) acc[offset + b] += x * row[b]
      }
    }
    for (let a = 0; a < d; a++) {
      for (let b = a; b < d; b++) {
        product.set(a, b, acc[a * d + b])
        product.set(b, a, acc[a * d + b])
      }
    }
  }

  const evd = new EigenvalueDecomposition(product, { assumeSymmetric: true })
  const values = evd.realEigenvalues
  const vectors = evd.eigenvectorMatrix
  const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]).slice(0, k)

  if (byGram) {
    // Ejes en el espacio original: v_c = Xᵀ u_c / sqrt(lambda_c).
    const axes = order.map((c) => {
      const scale = Math.sqrt(Math.max(values[c], 0))
      const axis = new Float64Array(d)
      if (scale === 0) return axis
      centered.forEach((row, i) => {
        const u = vectors.get(i, c) / scale
        for (let j = 0; j < d; j++) axis[j] += row[j] * u
      })
      return axis
    })
    return rows.map((row) => {
      const x = center(row)
      return axes.map((axis) => x.reduce((s, v, j) => s + v * axis[j], 0))
    })
  }
  return rows.map((row) => {
    const x = center(row)
    return order.map((c) => {
      let sum = 0
      for (let j = 0; j < d; j++) sum += x[j] * vectors.get(j, c)
      return sum
    })
  })
}
