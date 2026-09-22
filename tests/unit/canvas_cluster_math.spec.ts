import { test } from '@japa/runner'
import {
  agglomerativeLabels,
  chooseClusters,
  clusterHierarchy,
  classicalMds,
  clusterLayout,
  distanceMatrix,
  normalize,
} from '../../app/utils/canvas_cluster_math.js'

/** Deterministic pseudo-random in [-1, 1). */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s / 0xffffffff) * 2 - 1
  }
}

/** `count` unit vectors around each of `centres`, jittered by `spread`. */
function blobs(centres: number[][], count: number, spread: number, seed = 7): number[][] {
  const rnd = lcg(seed)
  const out: number[][] = []
  for (const centre of centres) {
    for (let i = 0; i < count; i++) {
      out.push(normalize(centre.map((x) => x + rnd() * spread)))
    }
  }
  return out
}

function groupsOf(labels: number[]): Map<number, number[]> {
  const groups = new Map<number, number[]>()
  labels.forEach((label, i) => {
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(i)
  })
  return groups
}

test.group('canvas_cluster_math', () => {
  test('recovers three well separated blobs with the right members', ({ assert }) => {
    const centres = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ]
    const vectors = blobs(centres, 12, 0.25)
    const { labels, k } = chooseClusters(distanceMatrix(vectors))

    assert.equal(k, 3)
    const groups = groupsOf(labels)
    // Each blob's twelve members share one label.
    for (let b = 0; b < 3; b++) {
      const label = labels[b * 12]
      const members = groups.get(label)!
      assert.equal(members.length, 12)
      assert.isTrue(members.every((i) => Math.floor(i / 12) === b))
    }
  })

  test('keeps fewer than four photos as one group', ({ assert }) => {
    const vectors = blobs([[1, 0], [0, 1]], 1, 0.1)
    vectors.push(normalize([1, 1]))
    const { labels, k } = chooseClusters(distanceMatrix(vectors))
    assert.equal(k, 1)
    assert.deepEqual(labels, [0, 0, 0])
  })

  test('partitions for fewer groups coarsen the finer ones', ({ assert }) => {
    const vectors = blobs(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 1, 0],
      ],
      5,
      0.2
    )
    const byK = agglomerativeLabels(distanceMatrix(vectors), [2, 3, 4])
    const fine = groupsOf(byK.get(4)!)
    const coarse = byK.get(2)!
    for (const members of fine.values()) {
      const labels = new Set(members.map((i) => coarse[i]))
      assert.equal(labels.size, 1)
    }
  })

  test('hierarchy has one partition per k up to the cap and suggests the elbow', ({
    assert,
  }) => {
    const vectors = blobs(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      6,
      0.2
    )
    const { partitions, suggestedK } = clusterHierarchy(distanceMatrix(vectors), {
      maxGroups: 8,
    })
    assert.deepEqual([...partitions.keys()], [1, 2, 3, 4, 5, 6, 7, 8])
    assert.equal(suggestedK, 3)
    for (const [k, labels] of partitions) {
      assert.equal(new Set(labels).size, k)
    }
    // Twelve photos cap the ladder at six groups.
    const small = clusterHierarchy(distanceMatrix(vectors.slice(0, 12)))
    assert.equal(Math.max(...small.partitions.keys()), 6)
  })

  test('one far-off photo does not make "everything else" the suggested split', ({
    assert,
  }) => {
    const vectors = blobs(
      [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ],
      15,
      0.3
    )
    vectors.push(normalize([0, 0, 0, 1]))
    const { partitions, suggestedK } = clusterHierarchy(distanceMatrix(vectors))

    assert.isAtLeast(suggestedK, 3)
    // The three blobs are told apart at the suggested level.
    const labels = partitions.get(suggestedK)!
    const blobLabels = [0, 15, 30].map((start) => labels[start])
    assert.equal(new Set(blobLabels).size, 3)
  })

  test('MDS reproduces pairwise distances of a planar configuration', ({ assert }) => {
    const points = [
      [0, 0],
      [3, 0],
      [0, 4],
      [3, 4],
    ]
    const dist = points.map((p) => points.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))
    const coords = classicalMds(dist)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const d = Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1])
        assert.closeTo(d, dist[i][j], 1e-6)
      }
    }
  })

  test('cloud layout keeps groups apart and members inside their disc', ({ assert }) => {
    const centres = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]
    const vectors = blobs(centres, 10, 0.3)
    const dist = distanceMatrix(vectors)
    const { labels, k } = chooseClusters(dist)
    const { positions, centres: laidOut } = clusterLayout(vectors, labels, k)

    assert.lengthOf(positions, vectors.length)
    assert.lengthOf(laidOut, k)

    const radius = 0.8 * Math.sqrt(10)
    positions.forEach(([x, y], i) => {
      const [cx, cy] = laidOut[labels[i]]
      assert.isAtMost(Math.hypot(x - cx, y - cy), radius + 1e-6)
    })
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        const d = Math.hypot(laidOut[a][0] - laidOut[b][0], laidOut[a][1] - laidOut[b][1])
        assert.isAtLeast(d, 2 * radius + 1.5 - 1e-6)
      }
    }
  })

  test('identical photos get a ring of centres instead of a collapsed layout', ({ assert }) => {
    const vectors = Array.from({ length: 8 }, () => [1, 0, 0])
    const labels = [0, 0, 1, 1, 2, 2, 3, 3]
    const { centres } = clusterLayout(vectors, labels, 4)
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        const d = Math.hypot(centres[a][0] - centres[b][0], centres[a][1] - centres[b][1])
        assert.isAbove(d, 1)
      }
    }
  })
})
