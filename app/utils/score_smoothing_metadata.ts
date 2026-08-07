// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING — qué dicen los metadatos de la cámara sobre dos fotos.
//
// Dos preguntas distintas, y funcionan AL REVÉS la una de la otra:
//
//   isSameShot             → ¿pueden ser siquiera la misma toma? VETA: un campo
//                            ausente no opina y decide el dhash.
//   captureEvidence        → ¿CONSTA que salen del mismo disparo? EXIGE PRUEBA: sin
//                            fecha en las dos, `unknown`. Y distingue eso de un
//                            `contradicted`, que es prueba en contra.
//
// El motivo de la asimetría: agrupar afirma algo de las IMÁGENES y el parecido visual
// basta; `version` y `duplicate` afirman algo de la PROCEDENCIA y eso solo lo sostiene
// el EXIF.
//
// En `isSameShot` tampoco existe un "matchingFields > 0 → true": el modelo de cámara
// es el mismo en todo el catálogo de un fotógrafo, así que aprobar por ahí era sellar
// cualquier pareja que llegara.
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
  maxSettingRatio: number
}

export interface CaptureMatchConfig {
  sameCaptureToleranceSeconds: number
  maxSettingRatio: number
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
 * La focal solo se mueve si alguien toca el objetivo, así que dentro de una misma
 * toma es idéntica siempre; si cambia, hubo reencuadre y son dos fotos distintas.
 * Por eso veta ya en `isSameShot`, antes incluso de agrupar.
 */
const FOCAL_LENGTH_FIELDS = [
  ['settings.focalLength', 'focalLength', 'FocalLength', 'focal_length'],
] as const

/**
 * Los ajustes que el automatismo mueve ENTRE un disparo y el siguiente. Al revés que
 * la focal, estos no dicen nada sobre si dos fotos son la misma toma —en una ráfaga
 * cambian constantemente y siguen siendo la misma escena— así que no vetan ahí. Lo
 * que vetan es el MISMO DISPARO: dos exposiciones distintas no pueden salir del mismo
 * obturador, y un revelado las copia literales del original.
 *
 * Es justo el agujero que deja el reloj: el EXIF guarda la hora al segundo, así que
 * dos fotogramas seguidos comparten `dateTaken` y solo estos campos los separan.
 *
 * Alias dobles porque las dos rutas de subida guardan formas distintas: anidado bajo
 * `settings` en un caso y plano en el otro.
 */
const SHOT_SETTING_FIELDS = [
  ['settings.exposureTime', 'exposureTime', 'ExposureTime'],
  ['settings.iso', 'iso', 'ISO'],
  ['settings.aperture', 'aperture', 'FNumber', 'fNumber'],
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

/** Acepta 48, '48', '48mm', '48.0 mm' y '0.0048'; cualquier otra cosa no opina. */
function parsePositiveNumber(raw: string | number | null): number | null {
  if (raw === null) return null

  const value = typeof raw === 'number' ? raw : Number(String(raw).match(/\d+(\.\d+)?/)?.[0])
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * ¿Alguno de estos campos numéricos discrepa entre las dos fotos? Solo veta cuando las
 * dos lo tienen; si a una le falta, ese campo no opina.
 *
 * La comparación es relativa y no exacta porque los dos caminos de subida guardan los
 * valores en formatos distintos —un 47.9 contra un 48, o 1/206 escrito como racional y
 * como decimal— y ese ruido no puede cortar un grupo bueno. El margen es muy inferior
 * al tercio de paso que separa dos valores reales consecutivos, así que absorbe el
 * formato sin tragarse un cambio de verdad.
 */
function anyFieldDrifts(
  first: ExifData,
  second: ExifData,
  fields: readonly (readonly string[])[],
  maxRatio: number
): boolean {
  for (const aliases of fields) {
    const firstNumber = parsePositiveNumber(readAny(first, aliases))
    const secondNumber = parsePositiveNumber(readAny(second, aliases))
    if (firstNumber === null || secondNumber === null) continue

    const drift = Math.abs(firstNumber - secondNumber) / Math.max(firstNumber, secondNumber)
    if (drift > maxRatio) return true
  }

  return false
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

  if (anyFieldDrifts(first, second, FOCAL_LENGTH_FIELDS, config.maxSettingRatio)) return false

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
 * Lo que el EXIF puede decir sobre el mismo disparo. Son TRES respuestas y no dos
 * porque "no consta" y "consta que no" llevan a sitios distintos: una pareja sin
 * fecha puede todavía probarse por otro camino (comparando los bytes del archivo),
 * mientras que una con fechas distintas ya está resuelta y no admite recurso.
 *
 * Colapsarlas en un solo `false`, como hacía `isConfirmedSameCapture`, hacía
 * imposible saber a cuál de los dos casos había que ofrecerle la segunda vía.
 */
export type CaptureEvidence = 'confirmed' | 'contradicted' | 'unknown'

/**
 * Capa 2 — requisito para que un grupo pueda ser `version` o `duplicate`. Un revelado
 * copia el EXIF del original literal: misma hora de obturador, misma exposición, mismo
 * ISO. Así que dos versiones coinciden en todo eso, y dos disparos distintos no.
 *
 * Dos comprobaciones que se reparten el trabajo:
 *
 *   1. Los ajustes de exposición. Dos exposiciones distintas no salen del mismo
 *      obturador, así que discrepar aquí es prueba EN CONTRA, y vale tanto si hay
 *      fecha como si no. Por eso va primero.
 *   2. La hora del obturador, al segundo exacto. Separa los disparos que caen en
 *      segundos distintos, que son la mayoría. Los ajustes cubren su agujero: el
 *      EXIF no baja del segundo, así que una ráfaga mete varios fotogramas dentro
 *      del mismo y ahí solo los separa que el automatismo moviera algo.
 *
 * Única función del fichero cuya ausencia de datos NO aprueba: sin fecha legible en
 * las dos, `unknown`. Esa foto sigue agrupando y suavizándose en `default`, pero no
 * se cuela en un modo que afirma saber de dónde salió el archivo. Los ajustes sí son
 * veto puro — si faltan, no opinan.
 *
 * Aun así no es prueba completa: una ráfaga con la exposición bloqueada da la misma
 * hora y los mismos ajustes. Para esa, la última palabra la tiene el histograma.
 */
export function captureEvidence(
  first: ExifData,
  second: ExifData,
  config: CaptureMatchConfig
): CaptureEvidence {
  if (anyFieldDrifts(first, second, SHOT_SETTING_FIELDS, config.maxSettingRatio)) {
    return 'contradicted'
  }

  const firstTakenAt = parseDateTaken(first?.dateTaken)
  const secondTakenAt = parseDateTaken(second?.dateTaken)
  // Sin fecha en alguna de las dos no hay nada que corrobore el disparo. No es un
  // "no": es que el EXIF se queda sin argumentos y decide otro.
  if (firstTakenAt === null || secondTakenAt === null) return 'unknown'

  if (Math.abs(firstTakenAt - secondTakenAt) > config.sameCaptureToleranceSeconds * 1000) {
    return 'contradicted'
  }

  return 'confirmed'
}

/** Atajo para el caso de siempre: ¿CONSTA que salen del mismo disparo? */
export function isConfirmedSameCapture(
  first: ExifData,
  second: ExifData,
  config: CaptureMatchConfig
): boolean {
  return captureEvidence(first, second, config) === 'confirmed'
}
