import { test } from '@japa/runner'
import { clusterHierarchy, scoreDistanceMatrix } from '../../app/utils/canvas_cluster_math.js'
import { weightedScore } from '../../app/utils/artistic_scores.js'
import { getProfileScoreWeights } from '#config/photo_schema'

/** Bands of the partition for `k`, each as the sorted scores of its members. */
function bandsOf(scores: number[], labels: number[], k: number): number[][] {
  const bands: number[][] = Array.from({ length: k }, () => [])
  labels.forEach((label, i) => bands[label].push(scores[i]))
  return bands.map((band) => band.sort((a, b) => a - b)).sort((a, b) => b[0] - a[0])
}

test.group('canvas_cluster_score', () => {
  test('bands are contiguous in score and ordered best-first', ({ assert }) => {
    const scores = [9.2, 3.1, 8.8, 5.0, 2.7, 9.0, 4.6, 8.5, 5.4, 3.3, 7.9, 2.2]
    const { partitions } = clusterHierarchy(scoreDistanceMatrix(scores))

    for (const [k, labels] of partitions) {
      const bands = bandsOf(scores, labels, k)
      assert.lengthOf(bands, k)
      // Best-first: every score of a band beats every score of the next band.
      for (let b = 0; b + 1 < bands.length; b++) {
        const worstHere = bands[b][0]
        const bestNext = bands[b + 1][bands[b + 1].length - 1]
        assert.isAtLeast(worstHere, bestNext)
      }
    }
  })

  test('three clear score masses come back as the three masses', ({ assert }) => {
    const scores = [9.2, 8.8, 9.0, 8.5, 5.0, 4.6, 5.4, 5.1, 2.7, 3.1, 3.3, 2.2]
    const { partitions } = clusterHierarchy(scoreDistanceMatrix(scores))
    const bands = bandsOf(scores, partitions.get(3)!, 3)
    assert.deepEqual(
      bands.map((band) => band.length),
      [4, 4, 4]
    )
    assert.isAtLeast(bands[0][0], 8.5)
    assert.isAtMost(bands[2][bands[2].length - 1], 3.3)
  })

  test('a coarser level fuses two neighbouring bands of the finer one', ({ assert }) => {
    const scores = [9.2, 3.1, 8.8, 5.0, 2.7, 9.0, 4.6, 8.5, 5.4, 3.3, 7.9, 2.2, 6.1, 6.4]
    const { partitions } = clusterHierarchy(scoreDistanceMatrix(scores))
    for (let k = 2; partitions.has(k + 1); k++) {
      const coarse = partitions.get(k)!
      const fine = partitions.get(k + 1)!
      // Every fine group sits inside exactly one coarse group.
      const parent = new Map<number, number>()
      fine.forEach((label, i) => {
        if (parent.has(label)) assert.equal(parent.get(label), coarse[i])
        else parent.set(label, coarse[i])
      })
    }
  })

  test('overall is the profile-weighted mean and ignores missing criteria', ({ assert }) => {
    const weights = getProfileScoreWeights('street-photography')
    // Street weights every one of these four criteria, on differing ratios.
    const scores = { aesthetic_quality: '8.0', composition: 6, candidness: 10, storytelling: 4 }
    const expected =
      (8 * weights.aesthetic_quality +
        6 * weights.composition +
        10 * weights.candidness +
        4 * weights.storytelling) /
      (weights.aesthetic_quality + weights.composition + weights.candidness + weights.storytelling)
    assert.closeTo(weightedScore(scores, weights)!, expected, 1e-9)
    assert.isNull(weightedScore({ humor: 'n/a' }, weights))
    assert.isNull(weightedScore(null, weights))
  })
})
