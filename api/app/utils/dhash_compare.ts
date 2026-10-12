// ══════════════════════════════════════════════════════════════
// Emparejado de casi-duplicados por dHash.
//
// Generación de candidatos con índice por bandas + verificación exacta de la
// distancia de Hamming. El hash de 64 bits se parte en `umbral + 1` bandas
// disjuntas: dos hashes dentro del umbral comparten forzosamente una banda
// entera, así que solo se verifican esos candidatos en vez de todos contra todos.
//
// Vive aquí, en un módulo puro, porque lo usan dos sitios: el worker de CPU
// (detección de duplicados desde la API, fuera del hilo principal) y el
// regularizador de scores, que corre en segundo plano y lo llama en línea.
// ══════════════════════════════════════════════════════════════

export const HASH_BITS = 64

export interface HashInput {
  id: number
  hash: string
}

export interface DHashComparePayload {
  photoHashes: HashInput[]
  photosToCheckIds: number[]
  threshold: number
}

interface HashEntry {
  id: number
  bits: bigint
}

interface BandRange {
  shift: bigint
  mask: bigint
}

export function hammingDistanceBits(hashA: bigint, hashB: bigint): number {
  let xor = hashA ^ hashB
  let distance = 0
  while (xor > 0n) {
    distance++
    xor &= xor - 1n
  }
  return distance
}

function buildBandRanges(bandCount: number): BandRange[] {
  const ranges: BandRange[] = []
  const baseWidth = Math.floor(HASH_BITS / bandCount)
  const remainder = HASH_BITS % bandCount

  let consumedBits = 0
  for (let index = 0; index < bandCount; index++) {
    const width = baseWidth + (index < remainder ? 1 : 0)
    const remainingBits = HASH_BITS - consumedBits - width
    ranges.push({
      shift: BigInt(remainingBits),
      mask: (1n << BigInt(width)) - 1n,
    })
    consumedBits += width
  }

  return ranges
}

function getBandKey(bits: bigint, range: BandRange): string {
  return ((bits >> range.shift) & range.mask).toString(16)
}

function addMatch(results: Map<number, Set<number>>, sourceId: number, matchId: number) {
  const matches = results.get(sourceId)
  if (matches) {
    matches.add(matchId)
    return
  }

  results.set(sourceId, new Set([matchId]))
}

/** Devuelve { photoId → ids de sus casi-duplicados }. */
export function dhashCompare(payload: DHashComparePayload): Record<number, number[]> {
  const { photoHashes, photosToCheckIds, threshold } = payload
  const checkSet = new Set(photosToCheckIds)
  const maxDistance = Math.max(0, Math.floor(threshold))
  const bandRanges = buildBandRanges(Math.min(HASH_BITS, maxDistance + 1))
  const bandBuckets = bandRanges.map(() => new Map<string, number[]>())
  const results = new Map<number, Set<number>>()
  const entries: HashEntry[] = []

  for (const photo of photoHashes) {
    try {
      entries.push({ id: photo.id, bits: BigInt('0x' + photo.hash) })
    } catch {
      // Skip malformed hashes instead of crashing the worker.
    }
  }

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const candidateIndexes = new Set<number>()

    for (let bandIndex = 0; bandIndex < bandRanges.length; bandIndex++) {
      const bucket = bandBuckets[bandIndex].get(getBandKey(entry.bits, bandRanges[bandIndex]))
      if (!bucket) continue

      for (const candidateIndex of bucket) {
        candidateIndexes.add(candidateIndex)
      }
    }

    for (const candidateIndex of candidateIndexes) {
      const candidate = entries[candidateIndex]
      const dist = hammingDistanceBits(entry.bits, candidate.bits)

      if (dist <= threshold) {
        if (checkSet.has(entry.id)) {
          addMatch(results, entry.id, candidate.id)
        }
        if (checkSet.has(candidate.id)) {
          addMatch(results, candidate.id, entry.id)
        }
      }
    }

    for (let bandIndex = 0; bandIndex < bandRanges.length; bandIndex++) {
      const bandMap = bandBuckets[bandIndex]
      const bandKey = getBandKey(entry.bits, bandRanges[bandIndex])
      const bucket = bandMap.get(bandKey)

      if (bucket) {
        bucket.push(index)
      } else {
        bandMap.set(bandKey, [index])
      }
    }
  }

  const output: Record<number, number[]> = {}
  for (const [photoId, matches] of results.entries()) {
    output[photoId] = [...matches].sort((left, right) => left - right)
  }

  return output
}
