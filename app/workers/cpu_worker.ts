import { parentPort, workerData } from 'node:worker_threads'

/**
 * CPU Worker entry point.
 *
 * Receives { taskName, payload } via workerData and dispatches
 * to the appropriate handler. Add new CPU-heavy tasks here.
 */

// ── Task: dhash_compare ─────────────────────────────────────────────
// Pairwise Hamming distance comparison of dHash strings.

function hammingDistance(hashA: string, hashB: string): number {
  const a = BigInt('0x' + hashA)
  const b = BigInt('0x' + hashB)
  let xor = a ^ b
  let distance = 0
  while (xor > 0n) {
    distance += Number(xor & 1n)
    xor >>= 1n
  }
  return distance
}

interface DHashComparePayload {
  photoHashes: { id: number; hash: string }[]
  photosToCheckIds: number[]
  threshold: number
}

function dhashCompare(payload: DHashComparePayload): Record<number, number[]> {
  const { photoHashes, photosToCheckIds, threshold } = payload
  const checkSet = new Set(photosToCheckIds)
  const results: Record<number, number[]> = {}

  for (let i = 0; i < photoHashes.length; i++) {
    for (let j = i + 1; j < photoHashes.length; j++) {
      const a = photoHashes[i]
      const b = photoHashes[j]
      const dist = hammingDistance(a.hash, b.hash)

      if (dist <= threshold) {
        if (checkSet.has(a.id)) {
          if (!results[a.id]) results[a.id] = []
          results[a.id].push(b.id)
        }
        if (checkSet.has(b.id)) {
          if (!results[b.id]) results[b.id] = []
          results[b.id].push(a.id)
        }
      }
    }
  }

  return results
}

// ── Task registry ───────────────────────────────────────────────────
// Add new CPU-heavy tasks here as functions and register them below.

const tasks: Record<string, (payload: any) => unknown> = {
  dhash_compare: dhashCompare,
}

// ── Dispatch ────────────────────────────────────────────────────────

const { taskName, payload } = workerData as { taskName: string; payload: unknown }

const handler = tasks[taskName]
if (!handler) {
  throw new Error(`Unknown CPU worker task: ${taskName}`)
}

const result = handler(payload)
parentPort?.postMessage(result)
