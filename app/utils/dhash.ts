import sharp from 'sharp'

const DHASH_SIZE = 8

/**
 * Computes a dHash (difference hash) for an image buffer.
 * Resize to 9x8 grayscale, then compare adjacent horizontal pixels.
 * Returns a 64-bit hash as a hex string (16 chars).
 */
export async function computeDHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer)
    .greyscale()
    .resize(DHASH_SIZE + 1, DHASH_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()

  let hash = 0n
  for (let row = 0; row < DHASH_SIZE; row++) {
    for (let col = 0; col < DHASH_SIZE; col++) {
      const left = pixels[row * (DHASH_SIZE + 1) + col]
      const right = pixels[row * (DHASH_SIZE + 1) + col + 1]
      if (left > right) {
        hash |= 1n << BigInt(row * DHASH_SIZE + col)
      }
    }
  }

  return hash.toString(16).padStart(16, '0')
}

/**
 * Computes the Hamming distance between two dHash hex strings.
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
export const DHASH_DUPLICATE_THRESHOLD = 10
