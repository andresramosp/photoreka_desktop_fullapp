// ══════════════════════════════════════════════════════════════
// EXIF — cómo se lee un campo de la toma, y de dónde.
//
// El EXIF no tiene una sola forma: los dos caminos de subida guardan cosas
// distintas bajo `descriptions.EXIF`.
//
//   web (utils/exifUtils.js)           → { camera: { make, model, lens },
//                                          settings: { iso, aperture, focalLength, ... } }
//   plugin Lightroom (ExifService.lua) → { camera: 'Canon EOS 90D', lens,
//                                          iso, aperture, focalLength, ... }
//
// Por eso los alias llevan rutas con punto y van ordenados: el campo específico
// de la ruta web primero y el string plano del plugin de reserva. Quien lea un
// campo con `exif.iso` a secas se deja fuera medio catálogo sin enterarse.
//
// Este fichero es solo el ACCESO. Lo que cada consumidor decide con el valor
// —qué tolerancia acepta, qué veta— es suyo: score_smoothing_metadata compara
// parejas, stats_service agrega el catálogo.
// ══════════════════════════════════════════════════════════════

export type ExifData = Record<string, any> | null | undefined

/**
 * `camera.model` va antes que `camera` para que en la ruta web gane el campo
 * específico; cuando `camera` es el string plano del plugin, `camera.model` no
 * resuelve y cae al alias de reserva.
 */
export const CAMERA_MODEL_ALIASES = [
  'camera.model',
  'cameraModel',
  'CameraModel',
  'model',
  'Model',
  'camera',
]
export const CAMERA_MAKE_ALIASES = ['camera.make', 'cameraMake', 'CameraMake', 'make', 'Make']
export const ISO_ALIASES = ['settings.iso', 'iso', 'ISO']
export const APERTURE_ALIASES = ['settings.aperture', 'aperture', 'FNumber', 'fNumber']
export const FOCAL_LENGTH_ALIASES = [
  'settings.focalLength',
  'focalLength',
  'FocalLength',
  'focal_length',
]

/** Lee una ruta con punto, y solo se queda con texto o números. */
export function readExifPath(exif: ExifData, path: string): string | number | null {
  if (!exif) return null

  let value: unknown = exif
  for (const segment of path.split('.')) {
    if (value === null || typeof value !== 'object') return null
    value = (value as Record<string, unknown>)[segment]
  }

  return typeof value === 'string' || typeof value === 'number' ? value : null
}

/** Primer alias que resuelve a algo. */
export function readExifAlias(exif: ExifData, aliases: readonly string[]): string | number | null {
  for (const alias of aliases) {
    const value = readExifPath(exif, alias)
    if (value !== null && String(value).trim() !== '') return value
  }

  return null
}

/**
 * Acepta 48, '48', '48mm', '48.0 mm', 'f/5.6' y racionales como '1/206'; cualquier
 * otra cosa devuelve null. No filtra por signo — quien necesite un valor útil de
 * cámara usa `parsePositiveExifNumber`.
 */
export function parseExifNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null

  const normalized = raw.trim().replace(',', '.')
  const fraction = normalized.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    return denominator !== 0 ? numerator / denominator : null
  }

  const match = normalized.match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

/** Un ISO, una apertura o una focal de 0 o menos no existen: son ruido del fichero. */
export function parsePositiveExifNumber(raw: unknown): number | null {
  const value = parseExifNumber(raw)
  return value !== null && value > 0 ? value : null
}

/** Lee un campo numérico de la toma resolviendo los alias de las dos formas. */
export function readExifNumber(exif: ExifData, aliases: readonly string[]): number | null {
  return parsePositiveExifNumber(readExifAlias(exif, aliases))
}

/**
 * La marca del EXIF suele traer la razón social entera ("NIKON CORPORATION",
 * "OLYMPUS IMAGING CORP."). Se recorta para que la comparación con el modelo
 * funcione: sin esto, "NIKON CORPORATION" + "NIKON D850" acaba en el
 * trabalenguas "NIKON CORPORATION NIKON D850".
 */
const MAKE_SUFFIX =
  /\s+(?:corporation|corp\.?|company|co\.?|ltd\.?|inc\.?|imaging|electronics|optical|gmbh|s\.a\.?)$/gi

function normalizeMake(raw: string | number): string {
  let text = String(raw).trim().replace(/\s+/g, ' ')
  let previous: string
  do {
    previous = text
    text = text.replace(MAKE_SUFFIX, '').trim()
  } while (text !== previous && text)
  return text
}

/**
 * "SONY" + "ILCE-7C" → "SONY ILCE-7C", pero "Canon" + "Canon EOS 90D" no se
 * duplica: hay cuerpos que ya traen la marca dentro del modelo.
 */
export function buildCameraLabel(exif: ExifData): string | null {
  const model = readExifAlias(exif, CAMERA_MODEL_ALIASES)
  if (model === null) return null

  const modelText = String(model).trim().replace(/\s+/g, ' ')
  if (!modelText) return null

  const make = readExifAlias(exif, CAMERA_MAKE_ALIASES)
  const makeText = make === null ? '' : normalizeMake(make)
  if (!makeText || modelText.toLowerCase().startsWith(makeText.toLowerCase())) return modelText

  return `${makeText} ${modelText}`
}
