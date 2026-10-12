import sharp from 'sharp'

/**
 * Histogramas de color como los del servicio Python (/color-histograms): HSV de OpenCV en 8 bits,
 * 16 bins de tono por 4 de saturación, normalizado L2, y la versión "dominante" que conserva solo
 * los 4 tonos con más peso. Se guardan y se comparan con los ya calculados, así que replican
 * OpenCV paso a paso (conversión con tablas de enteros, tablas de bins y normalización en float32).
 */

const HUE_BINS = 16
const SAT_BINS = 4
const DOMINANT_N = 4

// cv::RGB2HSV_b: divisiones por tabla con 12 bits de coma fija.
const HSV_SHIFT = 12
const ROUND = 1 << (HSV_SHIFT - 1)
const SDIV = Array.from({ length: 256 }, (_, i) => (i ? Math.round((255 << HSV_SHIFT) / i) : 0))
const HDIV = Array.from({ length: 256 }, (_, i) => (i ? Math.round((180 << HSV_SHIFT) / (6 * i)) : 0))

// cv::calcHistLookupTables_8u para rangos uniformes [0,180) y [0,256).
const histLookup = (bins: number, high: number) => {
  const a = bins / high
  return Array.from({ length: 256 }, (_, j) => (j < high ? Math.max(Math.min(Math.floor(j * a), bins - 1), 0) : -1))
}
const HUE_BIN = histLookup(HUE_BINS, 180)
const SAT_BIN = histLookup(SAT_BINS, 256)

export function hsvOf(r: number, g: number, b: number): [number, number, number] {
  const v = Math.max(r, g, b)
  const diff = v - Math.min(r, g, b)
  const s = (diff * SDIV[v] + ROUND) >> HSV_SHIFT
  let h = v === r ? g - b : v === g ? b - r + 2 * diff : r - g + 4 * diff
  h = (h * HDIV[diff] + ROUND) >> HSV_SHIFT
  if (h < 0) h += 180
  return [h, s, v]
}

async function decodeRgb(base64: string) {
  const { data } = await sharp(Buffer.from(base64, 'base64'), { failOn: 'none' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  return data
}

function histogramOf(rgb: Buffer) {
  const counts = new Float32Array(HUE_BINS * SAT_BINS)
  for (let p = 0; p < rgb.length; p += 3) {
    const [h, s] = hsvOf(rgb[p], rgb[p + 1], rgb[p + 2])
    counts[HUE_BIN[h] * SAT_BINS + SAT_BIN[s]] += 1
  }
  // cv::normalize(NORM_L2): norma en doble precisión, escala aplicada en float32.
  let sumSquares = 0
  for (const c of counts) sumSquares += c * c
  const scale = Math.fround(sumSquares > 0 ? 1 / Math.sqrt(sumSquares) : 0)
  return counts.map((c) => Math.fround(c * scale))
}

function dominantOf(hist: Float32Array): number[] {
  const hueSums = Array.from({ length: HUE_BINS }, (_, h) => {
    let sum = 0
    for (let s = 0; s < SAT_BINS; s++) sum = Math.fround(sum + hist[h * SAT_BINS + s])
    return { h, sum }
  })
  // sorted(reverse=True) de Python es estable: a igual peso, primero el tono más bajo.
  const top = hueSums.sort((x, y) => y.sum - x.sum || x.h - y.h).slice(0, DOMINANT_N)
  const reduced = new Array(hist.length).fill(0)
  for (const { h } of top) {
    for (let s = 0; s < SAT_BINS; s++) reduced[h * SAT_BINS + s] = hist[h * SAT_BINS + s]
  }
  return reduced
}

export async function colorHistograms(images: { id: any; base64: string }[]) {
  const embeddings = []
  for (const { id, base64 } of images) {
    if (!id || !base64) continue
    const hist = histogramOf(await decodeRgb(base64))
    embeddings.push({ id, embedding_full: Array.from(hist), embedding_dominant: dominantOf(hist) })
  }
  return { embeddings }
}
