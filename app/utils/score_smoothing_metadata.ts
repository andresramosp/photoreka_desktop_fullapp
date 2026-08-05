// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING — qué dicen los metadatos de la cámara sobre dos fotos.
//
// Dos preguntas distintas, y conviene no mezclarlas:
//
//   isSameShot    → ¿pueden ser siquiera la misma toma? Si no, no agrupan.
//   isSameCapture → ¿salen del MISMO disparo? Requisito para ser versiones.
//
// Las dos funcionan por VETO: cada señal solo puede descartar, nunca aprobar.
// Un campo ausente no opina, y si no hay ninguno la decisión se la queda el
// dhash. Ese es el motivo de que no exista un "matchingFields > 0 → true": el
// modelo de cámara es el mismo en todo el catálogo de un fotógrafo, así que
// aprobar por ahí era sellar cualquier pareja que llegara.
//
// OJO con la forma del EXIF: los dos caminos de subida guardan cosas distintas.
//
//   web (utils/exifUtils.js)          → { camera: { make, model, lens },
//                                         settings: { focalLength, ... } }
//   plugin Lightroom (ExifService.lua) → { camera: 'Canon EOS 90D', lens,
//                                          focalLength, ... }
//
// Por eso los alias llevan rutas con punto. Cuando `camera` es el string plano
// del plugin, `camera.model` no resuelve y cae al alias `camera`; cuando es el
// objeto de la web, `camera` no es texto y lo descarta el filtro de tipo.
// ══════════════════════════════════════════════════════════════

type ExifData = Record<string, unknown> | null | undefined

export interface ShotMatchConfig {
  maxDateTakenDeltaSeconds: number
  maxFocalLengthRatio: number
}

/**
 * Campos de hardware que no cambian dentro de una misma toma. Solo vetan: si los
 * dos los tienen y no coinciden, no puede ser la misma foto.
 *
 * El orden importa. `camera.model` va antes que `camera` para que en la ruta web
 * gane el campo específico y el string plano del plugin quede de reserva.
 */
const STABLE_METADATA_FIELDS = [
  ['bodySerialNumber', 'BodySerialNumber', 'cameraSerialNumber', 'serialNumber'],
  ['camera.model', 'cameraModel', 'CameraModel', 'model', 'Model', 'camera'],
  ['camera.make', 'cameraMake', 'CameraMake', 'make', 'Make'],
  ['camera.lens', 'lensModel', 'LensModel', 'lens', 'Lens'],
] as const

/**
 * La distancia focal es el mejor veto que hay, y por una razón concreta: ISO,
 * apertura y obturación las mueve el automatismo entre disparo y disparo, pero la
 * focal solo se mueve si alguien toca el objetivo. En una ráfaga real es idéntica
 * siempre; si cambia, hubo reencuadre y son dos fotos distintas.
 */
const FOCAL_LENGTH_FIELDS = [
  'settings.focalLength',
  'focalLength',
  'FocalLength',
  'focal_length',
] as const

/** Lee una ruta con punto, y solo se queda con texto o números. */
function readPath(exif: ExifData, path: string): string | number | null {
  if (!exif) return null

  let value: unknown = exif
  for (const segment of path.split('.')) {
    if (value === null || typeof value !== 'object') return null
    value = (value as Record<string, unknown>)[segment]
  }

  return typeof value === 'string' || typeof value === 'number' ? value : null
}

/** Primer alias que resuelve, normalizado para poder compararlo. */
function firstValue(exif: ExifData, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const value = readPath(exif, alias)
    if (value === null) continue
    const normalized = String(value).trim().toLowerCase().replace(/\s+/g, ' ')
    if (normalized) return normalized
  }

  return null
}

/** Acepta 48, '48', '48mm' y '48.0 mm'; cualquier otra cosa no opina. */
function parseFocalLength(raw: string | number | null): number | null {
  if (raw === null) return null

  const value = typeof raw === 'number' ? raw : Number(String(raw).match(/\d+(\.\d+)?/)?.[0])
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseDateTaken(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string' || !raw.trim()) return null

  const nativeExif = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  const timestamp = nativeExif
    ? Date.parse(
        `${nativeExif[1]}-${nativeExif[2]}-${nativeExif[3]}T${nativeExif[4]}:${nativeExif[5]}:${nativeExif[6]}Z`
      )
    : Date.parse(raw)

  return Number.isFinite(timestamp) ? timestamp : null
}

/**
 * Capa 1 — ¿pueden ser la misma toma? Un `false` corta la arista: no agrupan de
 * ninguna manera, ni como ráfaga ni como versiones.
 *
 * Sin ningún metadato comparable devuelve `true`, y entonces decide el dhash solo.
 * Es deliberado: exigir EXIF dejaría fuera catálogos enteros.
 */
export function isSameShot(first: ExifData, second: ExifData, config: ShotMatchConfig): boolean {
  const firstTakenAt = parseDateTaken(first?.dateTaken)
  const secondTakenAt = parseDateTaken(second?.dateTaken)
  if (firstTakenAt !== null && secondTakenAt !== null) {
    if (Math.abs(firstTakenAt - secondTakenAt) > config.maxDateTakenDeltaSeconds * 1000) {
      return false
    }
  }

  const firstFocal = parseFocalLength(readAny(first, FOCAL_LENGTH_FIELDS))
  const secondFocal = parseFocalLength(readAny(second, FOCAL_LENGTH_FIELDS))
  if (firstFocal !== null && secondFocal !== null) {
    // Relativa, no exacta: los dos caminos de subida guardan el valor en formatos
    // distintos y un 47.9 contra 48 no puede cortar un grupo bueno.
    const drift = Math.abs(firstFocal - secondFocal) / Math.max(firstFocal, secondFocal)
    if (drift > config.maxFocalLengthRatio) return false
  }

  for (const aliases of STABLE_METADATA_FIELDS) {
    const firstField = firstValue(first, aliases)
    const secondField = firstValue(second, aliases)
    if (firstField !== null && secondField !== null && firstField !== secondField) return false
  }

  return true
}

/** Primer alias con valor, sin normalizar (para los que se parsean como número). */
function readAny(exif: ExifData, aliases: readonly string[]): string | number | null {
  for (const alias of aliases) {
    const value = readPath(exif, alias)
    if (value !== null) return value
  }

  return null
}

/**
 * Capa 2 — ¿salen las dos del mismo disparo? Es lo que separa "dos revelados de
 * una foto" de "dos fotos de una ráfaga", y decide si el grupo puede ser `version`.
 *
 * El criterio es la hora del obturador, que el revelado NO toca: virar una foto,
 * pasarla a blanco y negro o reexportarla conserva su `dateTaken`. Si dos archivos
 * difieren, son dos disparos y no pueden ser versiones el uno del otro.
 *
 * Al revés no es prueba: EXIF guarda la hora al segundo, así que una ráfaga a 10
 * fps reparte varios fotogramas dentro del mismo segundo. Por eso esto es solo la
 * mitad del criterio — la otra la pone el histograma de color.
 */
export function isSameCapture(
  first: ExifData,
  second: ExifData,
  toleranceSeconds: number
): boolean {
  const firstTakenAt = parseDateTaken(first?.dateTaken)
  const secondTakenAt = parseDateTaken(second?.dateTaken)
  // Sin fecha en alguna de las dos no se puede negar que sean el mismo disparo.
  if (firstTakenAt === null || secondTakenAt === null) return true

  return Math.abs(firstTakenAt - secondTakenAt) <= toleranceSeconds * 1000
}
