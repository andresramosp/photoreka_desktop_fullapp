/**
 * Produces a compact, stable hash for a numeric ID array.
 * Useful for cache keys where serializing huge arrays is expensive.
 */
export function hashNumberIds(ids: number[]): string {
  if (!ids.length) return '0_0_0_0'

  const sorted = [...ids].sort((a, b) => a - b)
  // djb2-style hash: fast and stable enough for cache key discrimination.
  let hash = 5381
  for (const id of sorted) {
    hash = ((hash << 5) + hash + id) >>> 0
  }

  return `${sorted.length}_${hash}_${sorted[0]}_${sorted[sorted.length - 1]}`
}
