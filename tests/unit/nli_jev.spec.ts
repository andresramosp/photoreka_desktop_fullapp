import { test } from '@japa/runner'
import {
  applyLogicProximities,
  buildJevNliRequest,
  coerceNLILabel,
  labelToLogicProximity,
  parseJevNliAnswers,
  NLI_LABELS,
} from '../../app/utils/nli_jev.js'

// Mirrors ScoringService.adjustProximities: entailment surfaces strictly above it.
const LOGIC_THRESHOLD = 1

test.group('nli_jev | buildJevNliRequest', () => {
  test('one choice question per candidate, keyed by position, with the three NLI labels', ({
    assert,
  }) => {
    const { questions } = buildJevNliRequest('cat', ['tabby', 'pet', 'open desert'], 'tag')

    assert.deepEqual(Object.keys(questions), ['c0', 'c1', 'c2'])
    for (const q of Object.values(questions)) {
      assert.equal(q.type, 'choice')
      assert.sameMembers(Object.keys(q.criteria), [...NLI_LABELS])
    }
  })

  test('each question embeds its own candidate and the term, so no question depends on indexing state', ({
    assert,
  }) => {
    const { questions } = buildJevNliRequest('dog', ['golden retriever', 'grass field'], 'tag')

    assert.include(questions.c0.instructions, '"golden retriever"')
    assert.include(questions.c0.instructions, '"dog"')
    assert.include(questions.c1.instructions, '"grass field"')
    assert.notInclude(questions.c1.instructions, 'golden retriever')
  })

  test('state carries the term and the directional rules, including the hypernym trap', ({
    assert,
  }) => {
    const { state } = buildJevNliRequest('cat', ['pet'], 'tag')

    assert.equal(state.term, 'cat')
    assert.equal(state.input_type, 'tags')
    assert.isTrue(state.rules.some((r) => /hypernym trap/i.test(r)))
    assert.isTrue(state.rules.some((r) => /unrelated is not contradiction/i.test(r)))
  })

  test('tag and desc requests differ only in input-type guidance and the conjunction rule', ({
    assert,
  }) => {
    const tag = buildJevNliRequest('cats and kids', ['a busy market'], 'tag')
    const desc = buildJevNliRequest('cats and kids', ['a busy market'], 'desc')

    assert.equal(tag.state.input_type, 'tags')
    assert.equal(desc.state.input_type, 'description fragments')
    assert.isFalse(tag.state.rules.some((r) => /conjunction rule/i.test(r)))
    assert.isTrue(desc.state.rules.some((r) => /conjunction rule/i.test(r)))
    assert.notInclude(tag.questions.c0.criteria.entailment, 'every one of them')
    assert.include(desc.questions.c0.criteria.entailment, 'every one of them')
    assert.include(desc.questions.c0.instructions, 'description fragment')
  })

  test('criteria describe the label as a concrete situation, not a bare adjective', ({
    assert,
  }) => {
    const { questions } = buildJevNliRequest('cat', ['pet'], 'tag')
    const { entailment, neutral, contradiction } = questions.c0.criteria

    assert.match(entailment, /MORE SPECIFIC/)
    assert.match(neutral, /BROADER category/)
    assert.match(contradiction, /mutual exclusivity/)
    for (const text of [entailment, neutral, contradiction]) assert.include(text, '"cat"')
  })

  test('empty candidate list yields a request with no questions', ({ assert }) => {
    const { questions } = buildJevNliRequest('cat', [], 'tag')
    assert.deepEqual(questions, {})
  })
})

test.group('nli_jev | parseJevNliAnswers', () => {
  test('reads the label from choice and the confidence from its probability', ({ assert }) => {
    const verdicts = parseJevNliAnswers(
      {
        c0: {
          type: 'choice',
          choice: 'entailment',
          probabilities: { entailment: 0.91, neutral: 0.08, contradiction: 0.01 },
          confidence: 0.6,
        },
      },
      1
    )

    assert.deepEqual(verdicts, [{ id: 0, label: 'entailment', confidence: 0.91 }])
  })

  test('falls back to confidence, then to 0.5, when probabilities are missing', ({ assert }) => {
    const verdicts = parseJevNliAnswers(
      {
        c0: { type: 'choice', choice: 'neutral', confidence: 0.7 },
        c1: { type: 'choice', choice: 'contradiction' },
      },
      2
    )

    assert.deepEqual(verdicts, [
      { id: 0, label: 'neutral', confidence: 0.7 },
      { id: 1, label: 'contradiction', confidence: 0.5 },
    ])
  })

  test('drops answers with unknown keys, ids outside the batch, wrong type or unknown label', ({
    assert,
  }) => {
    const verdicts = parseJevNliAnswers(
      {
        c0: { type: 'choice', choice: 'entailment', probabilities: { entailment: 1 } },
        c5: { type: 'choice', choice: 'entailment', probabilities: { entailment: 1 } },
        other: { type: 'choice', choice: 'entailment' },
        c1: { type: 'noul', noul: 0.9 },
        c2: { type: 'choice', choice: 'maybe' },
      },
      3
    )

    assert.deepEqual(verdicts, [{ id: 0, label: 'entailment', confidence: 1 }])
  })

  test('clamps probabilities into [0, 1] and orders verdicts by id', ({ assert }) => {
    const verdicts = parseJevNliAnswers(
      {
        c2: { type: 'choice', choice: 'entailment', probabilities: { entailment: 1.4 } },
        c0: { type: 'choice', choice: 'contradiction', probabilities: { contradiction: -0.2 } },
      },
      3
    )

    assert.deepEqual(
      verdicts.map((v) => v.id),
      [0, 2]
    )
    assert.equal(verdicts[0].confidence, 0)
    assert.equal(verdicts[1].confidence, 1)
  })

  test('tolerates non-object payloads', ({ assert }) => {
    assert.deepEqual(parseJevNliAnswers(undefined, 3), [])
    assert.deepEqual(parseJevNliAnswers(null, 3), [])
    assert.deepEqual(parseJevNliAnswers('nope', 3), [])
    assert.deepEqual(parseJevNliAnswers([], 3), [])
  })
})

test.group('nli_jev | label contract', () => {
  test('coerceNLILabel accepts prefixes and casing, rejects anything else', ({ assert }) => {
    assert.equal(coerceNLILabel('Entailment'), 'entailment')
    assert.equal(coerceNLILabel(' entails '), 'entailment')
    assert.equal(coerceNLILabel('CONTRADICTION'), 'contradiction')
    assert.equal(coerceNLILabel('neutral'), 'neutral')
    assert.isNull(coerceNLILabel('unrelated'))
    assert.isNull(coerceNLILabel(undefined))
    assert.isNull(coerceNLILabel(42))
  })

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

test.group('nli_jev | end-to-end batch pipeline', () => {
  test('a Jev answers map for one batch flows into the ScoringService contract', ({ assert }) => {
    const term = 'cat'
    const candidates = ['tabby', 'domestic animals', 'empty landscape, no animals', 'grass field']
    const { questions } = buildJevNliRequest(term, candidates, 'tag')
    assert.lengthOf(Object.keys(questions), candidates.length)

    const answers = {
      c0: { type: 'choice', choice: 'entailment', probabilities: { entailment: 0.95 } },
      c1: { type: 'choice', choice: 'neutral', probabilities: { neutral: 0.8 } },
      c2: { type: 'choice', choice: 'contradiction', probabilities: { contradiction: 0.9 } },
      // c3 dropped by the model on purpose
    }

    const logicByName = new Map<string, number>()
    for (const v of parseJevNliAnswers(answers, candidates.length)) {
      logicByName.set(candidates[v.id], labelToLogicProximity(v.label, v.confidence))
    }
    const out = applyLogicProximities(
      candidates.map((name) => ({ name, proximity: 1.2 })),
      logicByName
    )

    const surfaced = out.filter((t) => t.logicProximity > LOGIC_THRESHOLD).map((t) => t.name)
    assert.deepEqual(surfaced, ['tabby'])
    assert.closeTo(out[0].logicProximity, 1.95, 1e-9)
    assert.equal(out[1].logicProximity, 1)
    assert.closeTo(out[2].logicProximity, 0.1, 1e-9)
    assert.equal(out[3].logicProximity, 1, 'dropped candidate clamps to the threshold')
  })
})
