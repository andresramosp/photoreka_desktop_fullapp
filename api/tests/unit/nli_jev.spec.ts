import { test } from '@japa/runner'
import { applyLogicProximities, labelToLogicProximity } from '../../app/utils/nli_jev.js'

// Mirrors ScoringService.adjustProximities: entailment surfaces strictly above it.
const LOGIC_THRESHOLD = 1

test.group('nli_jev | label contract', () => {
  test('labelToLogicProximity puts entailment above the threshold and the rest at or below it', ({
    assert,
  }) => {
    for (const c of [0.01, 0.5, 1]) {
      assert.isAbove(labelToLogicProximity('entailment', c), LOGIC_THRESHOLD)
      assert.isBelow(labelToLogicProximity('contradiction', c), LOGIC_THRESHOLD)
    }
    assert.equal(labelToLogicProximity('neutral', 0.99), LOGIC_THRESHOLD)
    assert.equal(labelToLogicProximity('entailment', 1), 2)
    assert.equal(labelToLogicProximity('contradiction', 1), 0)
  })

  test('confidence preserves ranking gradation inside each class', ({ assert }) => {
    assert.isAbove(
      labelToLogicProximity('entailment', 0.9),
      labelToLogicProximity('entailment', 0.6)
    )
    assert.isBelow(
      labelToLogicProximity('contradiction', 0.9),
      labelToLogicProximity('contradiction', 0.6)
    )
  })
})

test.group('nli_jev | applyLogicProximities', () => {
  test('keeps every input in order with all fields, adding embeddingsProximity and logicProximity', ({
    assert,
  }) => {
    const texts = [
      { name: 'tabby', proximity: 0.8, group: 'animals' },
      { name: 'pet', proximity: 0.7, group: 'animals' },
    ]
    const logic = new Map([
      ['tabby', 1.9],
      ['pet', 1],
    ])

    const out = applyLogicProximities(texts, logic)

    assert.deepEqual(out, [
      {
        name: 'tabby',
        proximity: 0.8,
        group: 'animals',
        embeddingsProximity: 0.8,
        logicProximity: 1.9,
      },
      {
        name: 'pet',
        proximity: 0.7,
        group: 'animals',
        embeddingsProximity: 0.7,
        logicProximity: 1,
      },
    ])
  })

  test('a candidate without a verdict never surfaces as entailment', ({ assert }) => {
    const out = applyLogicProximities(
      [
        { name: 'dropped', proximity: 1.7 },
        { name: 'negative', proximity: -0.3 },
        { name: 'missing', proximity: undefined },
      ],
      new Map()
    )

    assert.equal(out[0].logicProximity, 1)
    assert.equal(out[1].logicProximity, 0)
    assert.equal(out[2].logicProximity, 0)
    for (const t of out) assert.isAtMost(t.logicProximity, LOGIC_THRESHOLD)
  })

  test('duplicate names share the same verdict', ({ assert }) => {
    const out = applyLogicProximities(
      [
        { name: 'tabby', proximity: 0.8, group: 'a' },
        { name: 'tabby', proximity: 0.6, group: 'b' },
      ],
      new Map([['tabby', 1.8]])
    )

    assert.equal(out[0].logicProximity, 1.8)
    assert.equal(out[1].logicProximity, 1.8)
    assert.equal(out[1].embeddingsProximity, 0.6)
  })
})
