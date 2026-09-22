/**
 * artistic_scores.ts
 * -----------------------------------------------------------------
 * Reading `descriptions.artistic_scores`.
 *
 * The column holds a mix of shapes: roughly a third of the catalog stores `"6.0"`
 * where the rest stores `6`, because the analyzer's response schema declares the
 * scores as strings while older photos were written as numbers. Both are the same
 * score; only the JSON type differs.
 *
 * That difference is invisible until something does arithmetic, and then it produces
 * three DIFFERENT wrong answers from the same data:
 *
 *   - `typeof v === 'number'` — the defensive-looking guard, and the only one that
 *     causes silent damage: the value is discarded, so the photo ranks nowhere, gets
 *     no tag, contributes to no average. It fails without an error.
 *   - `sum + v` — concatenates (`0 + "6.0"` → `"06.0"`), so a mean becomes NaN.
 *   - `v < 7`, `a - b`, `Math.min(...)` — JS coerces, and these happen to be right.
 *
 * Every read goes through here so no consumer has to know any of that, and so none
 * of them re-derives it slightly differently. This is a READ-side adapter over data
 * that already exists: it does not normalise what gets written, and it stays needed
 * for as long as the stored mix does.
 * -----------------------------------------------------------------
 */

/**
 * Un tercer shape, más raro que `6` y `"6.0"`: el modelo mete la justificación
 * dentro del propio valor — `"2 – Serious, almost archival tone…"`. El score sí
 * está ahí, siempre delante, así que tirarlo entero pierde señal real (esa foto
 * queda con la media sesgada, un 0 en ese eje del embedding y sin tag).
 *
 * La regla es deliberadamente estrecha: el número tiene que abrir la cadena y
 * terminar donde empieza algo que no es número, y caer en la escala 0–10. Así
 * `"7.5 – Solid composition"` da 7.5, pero `"shot in 2020"` no da nada y
 * `"2020 – Tokyo"` tampoco: no se adivina un score de un texto cualquiera.
 *
 * `eligibleQuery` en insights_controller aplica esta misma regla en SQL, donde
 * no puede llamar aquí. Si cambia una, cambia la otra.
 */
const LEADING_SCORE = /^([0-9]+(?:\.[0-9]+)?)(?:[^0-9.]|$)/
const MIN_SCORE = 0
const MAX_SCORE = 10

/**
 * A stored score as a number, or null when it is absent or unusable.
 * Accepts both stored shapes; anything non-numeric (null, '', 'n/a') yields null,
 * which callers should treat as "no score", never as a zero.
 */
export function toScoreNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null

  // `Number(' ')` es 0, no NaN: sin este trim un valor en blanco puntuaría cero.
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const value = Number(trimmed)
  if (Number.isFinite(value)) return value

  const leading = trimmed.match(LEADING_SCORE)
  if (!leading) return null
  const extracted = Number(leading[1])
  return extracted >= MIN_SCORE && extracted <= MAX_SCORE ? extracted : null
}

/**
 * Every usable score of a photo as numbers, keys untouched (still the internal
 * storage names). Returns null when the photo has no usable score at all, so an
 * unanalyzed photo stays distinguishable from one scoring zeros.
 */
export function normalizeArtisticScores(scores: unknown): Record<string, number> | null {
  if (!scores || typeof scores !== 'object') return null
  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(scores as Record<string, unknown>)) {
    const value = toScoreNumber(raw)
    if (value !== null) result[key] = value
  }
  return Object.keys(result).length > 0 ? result : null
}

/**
 * Weighted mean of a photo's scores under a weight vector (internal keys → weight): the
 * number behind the Global Rating for a profile. Criteria the photo has no usable score
 * for drop out of both sums, so a missing score never counts as a zero. Null when no
 * weighted criterion is scored at all.
 */
export function weightedScore(
  scores: Record<string, unknown> | null | undefined,
  weights: Readonly<Record<string, number>>
): number | null {
  if (!scores) return null
  let weightedSum = 0
  let usedWeight = 0
  for (const [key, weight] of Object.entries(weights)) {
    const value = toScoreNumber(scores[key])
    if (value === null) continue
    weightedSum += value * weight
    usedWeight += weight
  }
  return usedWeight > 0 ? weightedSum / usedWeight : null
}
