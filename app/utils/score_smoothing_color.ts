// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING — ¿las dos fotos tienen el mismo revelado?
//
// Sustituye al filtro de etiquetas del LLM (`visual_aspects.palette` y
// `visual_aspects.temperature`), que se apoyaba en la misma fuente cuya
// inconsistencia este motor existe para corregir: bastaba con que el LLM
// llamara "color" a una foto en blanco y negro para que la pareja pasara.
//
// Se compara el `color_histogram` de la foto: histograma 2D conjunto de OpenCV
// sobre HSV, 16 bins de tono × 4 de saturación, aplanado en orden `h * 4 + s` y
// normalizado en L2. El canal V NO entra en el cálculo, así que esto ve virajes
// de tono y desaturación pero NO exposición ni contraste.
//
// La comprobación es doble porque el histograma tiene un sumidero: OpenCV pone
// H = 0 cuando S = 0, así que todo lo acromático —negros, blancos, grises— cae
// en la misma celda. Fundido en un solo número, dos fotos con mucha zona oscura
// se parecen mucho tengan el color que tengan. Separado en dos, cada mitad mide
// una cosa distinta y su umbral significa algo:
//
//   1. masa insaturada (fila s = 0) → mono contra color, decolorido
//   2. intersección del resto       → viraje de tono, temperatura
//
// Basta con que falle una para que la pareja sea una versión y no una toma.
// ══════════════════════════════════════════════════════════════

import type { ColorGradeConfig } from '#config/score_smoothing'

/** Geometría del vector, fijada por el servicio Python que lo calcula. */
export const HUE_BINS = 16
export const SAT_BINS = 4
export const HISTOGRAM_LENGTH = HUE_BINS * SAT_BINS

/**
 * Deja el histograma normalizado en L1, que es lo que permite leer cada bin como
 * "fracción de la imagen" y hace que los dos umbrales sean cifras comparables
 * entre fotos. Llega en L2 desde `cv2.normalize`, así que hay que rehacerlo.
 *
 * Devuelve `null` ante cualquier vector que no sirva (longitud rara, valores no
 * finitos, negativos o todo a cero), y quien llame decide qué hacer con eso.
 */
export function parseColorHistogram(raw: unknown): number[] | null {
  if (raw === null || raw === undefined) return null

  let values: unknown = raw
  if (typeof raw === 'string') {
    try {
      values = JSON.parse(raw)
    } catch {
      return null
    }
  }

  if (!Array.isArray(values) || values.length !== HISTOGRAM_LENGTH) return null

  const histogram = new Array<number>(HISTOGRAM_LENGTH)
  let total = 0
  for (let i = 0; i < HISTOGRAM_LENGTH; i++) {
    const value = Number(values[i])
    if (!Number.isFinite(value) || value < 0) return null
    histogram[i] = value
    total += value
  }
  if (total <= 0) return null

  for (let i = 0; i < HISTOGRAM_LENGTH; i++) histogram[i] /= total
  return histogram
}

/**
 * Fracción de la imagen sin saturación: la fila `s = 0` entera. Una foto en
 * blanco y negro da ~1 (OpenCV manda todo gris a la celda 0); una saturada, algo
 * cercano a 0. Es la señal que sustituye a `palette`, y la única que sobrevive
 * cuando una de las dos fotos no tiene color con el que comparar tonos.
 */
export function unsaturatedMass(histogram: number[]): number {
  let mass = 0
  for (let hue = 0; hue < HUE_BINS; hue++) mass += histogram[hue * SAT_BINS]
  return mass
}

/**
 * Los bins CON color, renormalizados entre ellos. Sacar la fila `s = 0` es lo
 * que quita de en medio el pico acromático, que si no domina la intersección y
 * tapa el viraje de tono, que es justo lo que se quiere medir aquí.
 *
 * Devuelve `null` cuando apenas queda color: en una foto monocroma el tono no
 * significa nada y la decisión ya la ha tomado la masa insaturada.
 */
export function chromaticProfile(histogram: number[], minChromaticMass: number): number[] | null {
  const chromatic: number[] = []
  let total = 0

  for (let hue = 0; hue < HUE_BINS; hue++) {
    for (let sat = 1; sat < SAT_BINS; sat++) {
      const value = histogram[hue * SAT_BINS + sat]
      chromatic.push(value)
      total += value
    }
  }

  if (total < minChromaticMass) return null
  return chromatic.map((value) => value / total)
}

/**
 * Intersección de histograma: la fracción de masa que ambos comparten (suma de
 * mínimos). Va de 0 a 1 y es lineal, al revés que el coseno, que sobre vectores
 * no negativos se dispara en cuanto comparten un bin dominante y deja todo el
 * interés apretado en la última centésima.
 */
export function histogramIntersection(first: number[], second: number[]): number {
  let shared = 0
  for (let i = 0; i < first.length; i++) shared += Math.min(first[i], second[i])
  return shared
}

/**
 * Falla cerrado: sin histograma no se puede afirmar que dos fotos compartan
 * revelado. Es más blando que el filtro al que sustituye —aquel tiraba la pareja
 * entera y esta solo la degrada a `version`— así que las fotos sin el dato
 * siguen agrupando, solo que casi sin corregirse.
 */
export function isSameColorGrade(
  first: number[] | null,
  second: number[] | null,
  config: ColorGradeConfig
): boolean {
  if (!first || !second) return false

  if (Math.abs(unsaturatedMass(first) - unsaturatedMass(second)) > config.maxUnsaturatedMassDelta) {
    return false
  }

  const firstChromatic = chromaticProfile(first, config.minChromaticMass)
  const secondChromatic = chromaticProfile(second, config.minChromaticMass)
  // Alguna de las dos es monocroma: sin tono que comparar, manda la primera
  // comprobación, que ya ha dicho que las dos están igual de desaturadas.
  if (!firstChromatic || !secondChromatic) return true

  return histogramIntersection(firstChromatic, secondChromatic) >= config.minChromaticIntersection
}
