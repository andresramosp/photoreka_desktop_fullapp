// ══════════════════════════════════════════════════════════════
// Colapso de casi-duplicados en una lista de resultados.
//
// Dos fotogramas de la misma toma ocupan dos huecos de una parrilla y dicen lo
// mismo. Esto los reduce a uno, el mejor situado según el orden que entra.
//
// Es un FILTRO, no un selector: sólo quita, nunca reordena ni elige entre
// candidatos. Por eso puede correr antes de cualquier ordenación y no interactúa
// con nada más del pipeline que lo llame.
//
// Invariantes (esto es todo lo que hay que verificar):
//   1. salida ⊆ entrada
//   2. preserva el orden relativo de la entrada
//   3. entrada no vacía ⇒ salida no vacía (siempre queda un representante por grupo)
//   4. ante cualquier fallo, salida === entrada (la función es la identidad)
// ══════════════════════════════════════════════════════════════

import { dhashCompare } from './dhash_compare.js'

/**
 * Distancia de Hamming máxima para considerar dos fotos el mismo fotograma.
 *
 * Deliberadamente MÁS ESTRICTO que `DHASH_DUPLICATE_THRESHOLD` (7.5), que está
 * calibrado para la detección de duplicados, donde el usuario revisa y decide.
 * Aquí el filtro esconde una foto sin dejar rastro, así que un falso positivo
 * cuesta mucho más que un falso negativo.
 *
 * Además el hash es un pHash DCT que descarta el término DC y umbraliza contra la
 * mediana (ver `utils/dhash.ts`), así que lo poco que conserva es "mancha clara
 * compacta sobre fondo plano en la posición (x,y)": dos nocturnas SIN RELACIÓN con
 * ese perfil caen a 2-8 bits. A 4 se colapsa el mismo fotograma (re-guardados,
 * exportaciones, recortes mínimos, ráfagas con la cámara quieta) y no la misma escena.
 *
 * Si se sube de aquí, hay que corroborar con otra señal barata (EXIF dateTaken
 * dentro de la misma ventana de captura) antes de fiarse del hash a solas.
 */
export const NEAR_DUPLICATE_HAMMING_THRESHOLD = 7.5

export interface CollapseResult {
  ids: number[]
  /** Cuántos IDs se han quitado. 0 significa que la lista sale intacta. */
  collapsed: number
}

/**
 * Colapsa grupos de casi-duplicados conservando, de cada grupo, el primero que
 * aparece en `orderedIds` — es decir el mejor situado según el orden entrante,
 * sea relevancia, un `order_by` explícito o el orden de un filtro.
 *
 * Las fotos sin hash en `hashById` sobreviven siempre: la ausencia de dato nunca
 * es motivo de descarte.
 *
 * El descarte es relativo al representante REALMENTE conservado, no transitivo: si
 * A≈B y B≈C pero A≉C, se conservan A y C. Un encadenamiento de parecidos no es un
 * grupo de duplicados.
 */
export function collapseNearDuplicates(
  orderedIds: number[],
  hashById: Map<number, string>,
  threshold: number = NEAR_DUPLICATE_HAMMING_THRESHOLD
): CollapseResult {
  if (orderedIds.length < 2) return { ids: orderedIds, collapsed: 0 }

  const photoHashes: { id: number; hash: string }[] = []
  for (const id of orderedIds) {
    const hash = hashById.get(id)
    if (hash) photoHashes.push({ id, hash })
  }
  if (photoHashes.length < 2) return { ids: orderedIds, collapsed: 0 }

  let matches: Record<number, number[]>
  try {
    matches = dhashCompare({
      photoHashes,
      photosToCheckIds: photoHashes.map((entry) => entry.id),
      threshold,
    })
  } catch {
    return { ids: orderedIds, collapsed: 0 } // invariante 4
  }

  const kept: number[] = []
  const keptSet = new Set<number>()
  const dropped = new Set<number>()

  for (const id of orderedIds) {
    if (dropped.has(id)) continue
    kept.push(id)
    keptSet.add(id)

    for (const neighborId of matches[id] ?? []) {
      if (!keptSet.has(neighborId)) dropped.add(neighborId)
    }
  }

  return { ids: kept, collapsed: orderedIds.length - kept.length }
}
