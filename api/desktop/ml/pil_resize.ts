/**
 * Réplica del redimensionado bicúbico de Pillow (Resample.c) para RGB de 8 bits: dos pasadas,
 * primero horizontal y luego vertical, con coeficientes en coma fija. Es lo que hace el CLIP de
 * Python (torchvision Resize sobre una imagen PIL); con otro redimensionado los vectores difieren.
 */
const PRECISION_BITS = 32 - 8 - 2
const A = -0.5
const SUPPORT = 2

function bicubic(x: number) {
  x = Math.abs(x)
  if (x < 1) return ((A + 2) * x - (A + 3)) * x * x + 1
  if (x < 2) return (((x - 5) * x + 8) * x - 4) * A
  return 0
}

function coefficients(inSize: number, outSize: number) {
  const scale = inSize / outSize
  const filterscale = Math.max(scale, 1)
  const support = SUPPORT * filterscale
  const ksize = Math.ceil(support) * 2 + 1
  const bounds = new Int32Array(outSize * 2)
  const kk = new Int32Array(outSize * ksize)
  const k = new Float64Array(ksize)
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale
    const ss = 1 / filterscale
    let ww = 0
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0)
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin
    for (let x = 0; x < xmax; x++) {
      const w = bicubic((x + xmin - center + 0.5) * ss)
      k[x] = w
      ww += w
    }
    for (let x = 0; x < xmax; x++) {
      const w = ww !== 0 ? k[x] / ww : k[x]
      kk[xx * ksize + x] =
        w < 0 ? Math.trunc(-0.5 + w * (1 << PRECISION_BITS)) : Math.trunc(0.5 + w * (1 << PRECISION_BITS))
    }
    bounds[xx * 2] = xmin
    bounds[xx * 2 + 1] = xmax
  }
  return { ksize, bounds, kk }
}

function clip8(v: number) {
  const x = Math.trunc(v / 2 ** PRECISION_BITS)
  return x < 0 ? 0 : x > 255 ? 255 : x
}

/** Redimensiona RGB empaquetado (ancho*alto*3) a outW x outH como Image.resize(BICUBIC) de Pillow. */
export function pilResizeBicubic(src: Uint8Array, width: number, height: number, outW: number, outH: number) {
  let data = src
  let w = width
  if (outW !== width) {
    const { ksize, bounds, kk } = coefficients(width, outW)
    const out = new Uint8Array(outW * height * 3)
    for (let y = 0; y < height; y++) {
      for (let xx = 0; xx < outW; xx++) {
        const xmin = bounds[xx * 2]
        const xmax = bounds[xx * 2 + 1]
        let r = 1 << (PRECISION_BITS - 1)
        let g = r
        let b = r
        for (let x = 0; x < xmax; x++) {
          const c = kk[xx * ksize + x]
          const p = (y * w + x + xmin) * 3
          r += data[p] * c
          g += data[p + 1] * c
          b += data[p + 2] * c
        }
        const o = (y * outW + xx) * 3
        out[o] = clip8(r)
        out[o + 1] = clip8(g)
        out[o + 2] = clip8(b)
      }
    }
    data = out
    w = outW
  }
  if (outH !== height) {
    const { ksize, bounds, kk } = coefficients(height, outH)
    const out = new Uint8Array(w * outH * 3)
    for (let yy = 0; yy < outH; yy++) {
      const ymin = bounds[yy * 2]
      const ymax = bounds[yy * 2 + 1]
      for (let x = 0; x < w; x++) {
        let r = 1 << (PRECISION_BITS - 1)
        let g = r
        let b = r
        for (let y = 0; y < ymax; y++) {
          const c = kk[yy * ksize + y]
          const p = ((y + ymin) * w + x) * 3
          r += data[p] * c
          g += data[p + 1] * c
          b += data[p + 2] * c
        }
        const o = (yy * w + x) * 3
        out[o] = clip8(r)
        out[o + 1] = clip8(g)
        out[o + 2] = clip8(b)
      }
    }
    data = out
  }
  return data
}
