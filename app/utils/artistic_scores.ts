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
 * A stored score as a number, or null when it is absent or unusable.
 * Accepts both stored shapes; anything non-numeric (null, '', 'n/a') yields null,
 * which callers should treat as "no score", never as a zero.
 */
export function toScoreNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : null
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
