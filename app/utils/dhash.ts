import sharp from 'sharp'

const PHASH_SIZE = 8 // 8x8 = 64-bit hash
const DCT_SIZE = 32 // Resize image to 32x32 before DCT

// Pre-compute DCT cosine coefficients for performance
const cosTable: number[][] = []
for (let k = 0; k < DCT_SIZE; k++) {
  cosTable[k] = []
  for (let n = 0; n < DCT_SIZE; n++) {
    cosTable[k][n] = Math.cos((Math.PI / DCT_SIZE) * (n + 0.5) * k)
  }
}

/**
 * 1D DCT-II, computing only the first `outputSize` coefficients.
 */
function dct1D(input: number[], outputSize: number): number[] {
  const N = input.length
  const output: number[] = new Array(outputSize)
  for (let k = 0; k < outputSize; k++) {
    let sum = 0
    for (let n = 0; n < N; n++) {
      sum += input[n] * cosTable[k][n]
    }
    output[k] = sum
  }
  return output
}

/**
 * Computes a pHash (perceptual hash) using DCT.
 *
 * 1. Resize to 32×32 grayscale
 * 2. Apply 2D DCT
 * 3. Keep top-left 8×8 low-frequency coefficients (skip DC at [0][0])
 * 4. Threshold against median → 63 bits (padded to 64-bit hex string)
 *
 * Unlike dHash, pHash captures frequency content and never degenerates
 * for uniform/dark images — the median-based threshold guarantees ~31 bits set.
 *
 * Returns a 64-bit hash as a hex string (16 chars).
 */
export async function computeDHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer)
    .greyscale()
    .resize(DCT_SIZE, DCT_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()

  // Build 32×32 matrix
  const matrix: number[][] = []
  for (let y = 0; y < DCT_SIZE; y++) {
    matrix[y] = []
    for (let x = 0; x < DCT_SIZE; x++) {
      matrix[y][x] = pixels[y * DCT_SIZE + x]
    }
  }

  // Row DCT: only compute first 8 coefficients per row (all we need for columns)
  const rowDCT: number[][] = []
  for (let y = 0; y < DCT_SIZE; y++) {
    rowDCT[y] = dct1D(matrix[y], PHASH_SIZE)
  }

  // Column DCT: for each of the 8 columns, compute first 8 coefficients
  const dct: number[][] = Array.from({ length: PHASH_SIZE }, () => new Array(PHASH_SIZE))
  for (let x = 0; x < PHASH_SIZE; x++) {
    const column: number[] = []
    for (let y = 0; y < DCT_SIZE; y++) {
      column.push(rowDCT[y][x])
    }
    const dctCol = dct1D(column, PHASH_SIZE)
    for (let y = 0; y < PHASH_SIZE; y++) {
      dct[y][x] = dctCol[y]
    }
  }

  // Collect 63 low-frequency coefficients (8×8 minus DC term at [0][0])
  const lowFreq: number[] = []
  for (let y = 0; y < PHASH_SIZE; y++) {
    for (let x = 0; x < PHASH_SIZE; x++) {
      if (y === 0 && x === 0) continue // skip DC
      lowFreq.push(dct[y][x])
    }
  }

  // Median threshold — guarantees ~31 bits set regardless of image content
  const sorted = [...lowFreq].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  // Build hash
  let hash = 0n
  let bitIndex = 0
  for (let y = 0; y < PHASH_SIZE; y++) {
    for (let x = 0; x < PHASH_SIZE; x++) {
      if (y === 0 && x === 0) continue
      if (dct[y][x] > median) {
        hash |= 1n << BigInt(bitIndex)
      }
      bitIndex++
    }
  }

  return hash.toString(16).padStart(16, '0')
}

/**
 * Computes the Hamming distance between two hash hex strings.
 */
export function hammingDistance(hashA: string, hashB: string): number {
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

/** Max Hamming distance to consider two images as duplicates */
export const DHASH_DUPLICATE_THRESHOLD = 7.5
