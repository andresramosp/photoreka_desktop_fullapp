import { test } from '@japa/runner'
import { collapseNearDuplicates } from '../../app/utils/near_duplicates.js'

// Hashes at controlled Hamming distances from a base value.
const BASE = 0xf0f0f0f0f0f0f0f0n
const hex = (bits: bigint) => bits.toString(16).padStart(16, '0')
const flip = (bits: bigint, bitCount: number) => {
  let out = bits
  for (let i = 0; i < bitCount; i++) out ^= 1n << BigInt(i)
  return out
}
const hashes = (entries: Array<[number, bigint]>) =>
  new Map(entries.map(([id, bits]) => [id, hex(bits)]))

test.group('collapseNearDuplicates', () => {
  test('collapses a burst into its best-placed member and leaves the rest untouched', ({
    assert,
  }) => {
    const map = hashes([
      [10, BASE],
      [11, flip(BASE, 2)],
      [12, flip(BASE, 3)],
      [20, 0x0f0f0f0f0f0f0f0fn],
    ])

    const { ids, collapsed } = collapseNearDuplicates([10, 11, 12, 20], map, 4)

    assert.deepEqual(ids, [10, 20])
    assert.equal(collapsed, 2)
  })

  test('the representative is the best placed, not the lowest id', ({ assert }) => {
    const map = hashes([
      [99, BASE],
      [11, flip(BASE, 2)],
    ])

    assert.deepEqual(collapseNearDuplicates([99, 11], map, 4).ids, [99])
  })

  test('similarity chains are not collapsed transitively', ({ assert }) => {
    // #2 is within 3 bits of both, but #1 and #3 are 6 apart: not the same shot.
    const map = hashes([
      [1, BASE],
      [2, flip(BASE, 3)],
      [3, flip(BASE, 6)],
    ])

    assert.deepEqual(collapseNearDuplicates([1, 2, 3], map, 4).ids, [1, 3])
  })

  test('the threshold gates what counts as the same shot', ({ assert }) => {
    const map = hashes([
      [1, BASE],
      [2, flip(BASE, 6)],
    ])

    assert.lengthOf(collapseNearDuplicates([1, 2], map, 4).ids, 2)
    assert.lengthOf(collapseNearDuplicates([1, 2], map, 8).ids, 1)
  })

  // ── The four invariants the search pipeline relies on ──

  test('invariants 1 & 2: the output is a subset that preserves the incoming order', ({
    assert,
  }) => {
    const input = [5, 3, 9, 1, 7]
    const map = hashes([
      [5, BASE],
      [3, flip(BASE, 1)],
      [9, 0x0f0f0f0f0f0f0f0fn],
      [1, flip(BASE, 2)],
      [7, 0x00ff00ff00ff00ffn],
    ])

    const { ids } = collapseNearDuplicates(input, map, 4)

    assert.deepEqual(
      ids,
      input.filter((id) => ids.includes(id))
    )
  })

  test('invariant 3: a non-empty list never comes back empty', ({ assert }) => {
    const identical = BASE
    const map = hashes([1, 2, 3, 4, 5].map((id) => [id, identical] as [number, bigint]))

    const { ids, collapsed } = collapseNearDuplicates([1, 2, 3, 4, 5], map, 4)

    assert.deepEqual(ids, [1])
    assert.equal(collapsed, 4)
  })

  test('invariant 4: missing or malformed hashes degrade to the identity', ({ assert }) => {
    const partial = hashes([[1, BASE]])
    assert.deepEqual(collapseNearDuplicates([1, 2, 3], partial, 4).ids, [1, 2, 3])

    assert.deepEqual(collapseNearDuplicates([1, 2, 3], new Map(), 4).ids, [1, 2, 3])

    const malformed = new Map([
      [1, 'not-a-hash'],
      [2, 'also-bad'],
    ])
    assert.deepEqual(collapseNearDuplicates([1, 2], malformed, 4).ids, [1, 2])
  })

  test('a photo without a stored hash is never dropped', ({ assert }) => {
    // #2 has no hash: it cannot be judged, so it survives next to the collapsed burst.
    const map = hashes([
      [1, BASE],
      [3, flip(BASE, 2)],
    ])

    assert.deepEqual(collapseNearDuplicates([1, 2, 3], map, 4).ids, [1, 2])
  })

  test('trivial inputs are returned as they came', ({ assert }) => {
    assert.deepEqual(collapseNearDuplicates([], new Map(), 4).ids, [])
    assert.deepEqual(collapseNearDuplicates([42], hashes([[42, BASE]]), 4).ids, [42])
  })
})
