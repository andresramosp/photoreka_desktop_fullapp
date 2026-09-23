import { test } from '@japa/runner'
import {
  buildJevActionsRequest,
  parseJevActionsAnswers,
  rankJevActionCandidates,
  OFFER_THRESHOLD,
  type JevActionsInput,
} from '../../app/utils/chat_actions_jev.js'
import {
  ASPECT_VALUES,
  SCORE_CRITERIA,
  validateActions,
} from '../../app/utils/chat_actions_catalog.js'

/**
 * Phase 3 on Jev: the suggester becomes one typed question per candidate action. These
 * tests pin the two contracts that matter: which questions exist for a given turn (no
 * question = the action is unrepresentable), and that the answers come back in exactly
 * the raw shape `validateActions` already grounds for the LLM engine.
 */

const range = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i)

const input = (over: Partial<JevActionsInput> = {}): JevActionsInput => ({
  assistantText: 'Here are your rainy street shots, grouped by mood.',
  historyText: 'User: show me my rainy street photos',
  photos: range(1, 8).map((id) => ({ id, filename: `p${id}.jpg`, snippet: id <= 2 ? 'A wet street.' : '' })),
  photoGroups: [
    { id: 1, label: 'Neon reflections', photoIds: [1, 2, 3], rejected: false },
    { id: 2, label: 'Umbrellas', photoIds: [4, 5, 6], rejected: false },
    { id: 3, label: 'Rejects', photoIds: [7, 8], rejected: true },
  ],
  collections: [{ id: 10, name: 'Street' }],
  series: [],
  portfolios: [{ id: 30, name: 'Portfolio 2026' }],
  maxListedPhotos: 40,
  ...over,
})

const noul = (v: number) => ({ noul: v })
const pick = (choice: string, p = 0.8) => ({ choice, probabilities: { [choice]: p }, confidence: p })

test.group('chat_actions_jev | buildJevActionsRequest', () => {
  test('one organize block per selectable group; the rejected group gets no questions at all', ({
    assert,
  }) => {
    const { questions } = buildJevActionsRequest(input())
    const keys = Object.keys(questions)

    assert.includeMembers(keys, [
      'create_collection_g1',
      'create_series_g1',
      'add_to_collection_g1',
      'create_collection_g2',
      'add_to_collection_g2',
    ])
    assert.notInclude(keys, 'add_to_series_g1') // no series in the inventory
    assert.isFalse(keys.some((k) => k.endsWith('_g3')))
    assert.isFalse(keys.some((k) => k.endsWith('_flat')))
  })

  test('a flat turn asks about the whole set once; a turn without photos asks no organize question', ({
    assert,
  }) => {
    const flat = Object.keys(buildJevActionsRequest(input({ photoGroups: [] })).questions)
    assert.include(flat, 'create_collection_flat')
    assert.isFalse(flat.some((k) => /_g\d+$/.test(k)))

    const none = Object.keys(
      buildJevActionsRequest(input({ photos: [], photoGroups: [] })).questions
    )
    assert.isFalse(none.some((k) => k.startsWith('create_') || k.startsWith('add_to_')))
    assert.include(none, 'offer_search')
    assert.include(none, 'offer_workspace')
  })

  test('add_to_* and view_target choices are the real inventory plus "none", never free ids', ({
    assert,
  }) => {
    const { questions } = buildJevActionsRequest(input())
    const addTo = questions.add_to_collection_g1 as any
    assert.equal(addTo.type, 'choice')
    assert.sameMembers(Object.keys(addTo.criteria), ['none', '10'])

    const view = questions.view_target as any
    assert.include(Object.keys(view.criteria), 'report')
    assert.include(Object.keys(view.criteria), 'collection:10')
    assert.include(Object.keys(view.criteria), 'portfolio:30')
    assert.notInclude(Object.keys(view.criteria), 'series:1')
  })

  test('one noul per aspect value, so OR-sets within an aspect are expressible', ({ assert }) => {
    const { questions } = buildJevActionsRequest(input())
    const paletteKeys = Object.keys(questions).filter((k) => k.startsWith('ws_aspect_palette_'))
    assert.lengthOf(paletteKeys, ASPECT_VALUES.palette.length)
  })

  test('one threshold pair per score criterion: direction-or-none plus a 10-level cut-off', ({
    assert,
  }) => {
    const { questions } = buildJevActionsRequest(input())
    for (const criterion of SCORE_CRITERIA) {
      const op = questions[`ws_threshold_${criterion}`] as any
      assert.sameMembers(Object.keys(op.criteria), ['none', 'gte', 'lte'])
      const value = questions[`ws_threshold_${criterion}_value`] as any
      assert.equal(value.type, 'score')
      assert.lengthOf(value.criteria, 10)
    }
  })

  test('state lists whole groups with their count and marks the rejected one', ({ assert }) => {
    const { state } = buildJevActionsRequest(input())
    const shown = state.shown_photos as any
    assert.equal(shown.mode, 'groups')
    assert.deepEqual(
      shown.groups.map((g: any) => [g.id, g.photo_count, g.rejected]),
      [
        [1, 3, false],
        [2, 3, false],
        [3, 2, true],
      ]
    )
    assert.equal(shown.groups[0].photos[0].description, 'A wet street.')
    assert.isUndefined(shown.groups[1].photos[0].description)
  })
})

test.group('chat_actions_jev | parseJevActionsAnswers', () => {
  test('nouls at the threshold offer; "none" choices and absent answers offer nothing', ({
    assert,
  }) => {
    const { candidates, search } = parseJevActionsAnswers(
      {
        offer_search: noul(0.2),
        create_collection_g1: noul(OFFER_THRESHOLD),
        create_series_g1: noul(0.49),
        add_to_collection_g1: pick('none'),
        add_to_collection_g2: pick('10', 0.7),
      },
      input()
    )

    assert.isFalse(search.offer)
    assert.deepEqual(
      candidates.map((c) => [c.type, c.params]),
      [
        ['create_collection', { groupId: 1 }],
        ['add_to_collection', { groupId: 2, collectionId: 10 }],
      ]
    )
  })

  test('search is reported, never emitted as an action: the phrase is not Jev\'s to write', ({
    assert,
  }) => {
    const { candidates, search } = parseJevActionsAnswers({ offer_search: noul(0.9) }, input())
    assert.deepEqual(search, { offer: true, probability: 0.9 })
    assert.isFalse(candidates.some((c) => c.type === 'search_photos'))
  })

  test('workspace filters assemble from the field answers; sort beats a weaker genre preset', ({
    assert,
  }) => {
    const bwIdx = ASPECT_VALUES.palette.indexOf('black and white')
    const monoIdx = ASPECT_VALUES.palette.indexOf('monochrome')
    const { candidates } = parseJevActionsAnswers(
      {
        offer_workspace: noul(0.8),
        ws_sort_field: pick('composition', 0.7),
        ws_sort_dir: pick('desc'),
        ws_genre_preset: pick('street', 0.6),
        ws_threshold_aesthetic_quality: pick('gte'),
        ws_threshold_aesthetic_quality_value: {
          score: 6.8,
          probabilities: [0, 0, 0, 0, 0, 0, 0.9, 0.1, 0, 0],
        },
        // Two more criteria: one thresholded from below, one explicitly "none",
        // one with a cut-off answer but no direction (ignored).
        ws_threshold_candidness: pick('lte'),
        ws_threshold_candidness_value: { score: 4.2 },
        ws_threshold_humor: pick('none'),
        ws_threshold_humor_value: { score: 9 },
        ws_threshold_originality_value: { score: 8 },
        [`ws_aspect_palette_${bwIdx}`]: noul(0.9),
        [`ws_aspect_palette_${monoIdx}`]: noul(0.6),
      },
      input()
    )

    assert.lengthOf(candidates, 1)
    assert.deepEqual(candidates[0].params.filters, {
      sort: { field: 'composition', dir: 'desc' },
      scoreFilters: [
        { field: 'aesthetic_quality', op: 'gte', value: 7 },
        { field: 'candidness', op: 'lte', value: 4 },
      ],
      visualAspects: [{ aspect: 'palette', values: ['black and white', 'monochrome'] }],
    })
  })

  test('a genre preset that Jev backs more than the sort wins, and the two never combine', ({
    assert,
  }) => {
    const { candidates } = parseJevActionsAnswers(
      {
        offer_workspace: noul(0.8),
        ws_sort_field: pick('composition', 0.5),
        ws_genre_preset: pick('street', 0.9),
      },
      input()
    )
    assert.deepEqual(candidates[0].params.filters, { genrePreset: 'street' })
  })

  test('an offered workspace with no usable filter is not a candidate', ({ assert }) => {
    const { candidates } = parseJevActionsAnswers(
      { offer_workspace: noul(0.9), ws_sort_field: pick('none'), ws_genre_preset: pick('none') },
      input()
    )
    assert.lengthOf(candidates, 0)
  })

  test('view_target splits "collection:10" into the view and its id', ({ assert }) => {
    const { candidates } = parseJevActionsAnswers(
      { offer_view: noul(0.7), view_target: pick('collection:10') },
      input()
    )
    assert.deepEqual(candidates[0], {
      type: 'open_view',
      params: { view: 'collection', id: 10 },
      probability: 0.7,
      family: 'view',
    })
  })

  test('the raw shape grounds through validateActions exactly like the LLM engine\'s', ({
    assert,
  }) => {
    const inp = input()
    const { candidates } = parseJevActionsAnswers(
      {
        create_series_g2: noul(0.9),
        add_to_collection_g1: pick('10', 0.8),
        offer_view: noul(0.6),
        view_target: pick('portfolio:30'),
      },
      inp
    )
    const { actions } = validateActions(
      rankJevActionCandidates(candidates).map(({ type, params }) => ({ type, params })),
      {
        photos: inp.photos,
        photoGroups: inp.photoGroups,
        selectionTitle: 'Rain',
        collections: inp.collections,
        series: inp.series,
        portfolios: inp.portfolios,
      }
    )

    assert.deepEqual(
      actions.map((a) => [a.type, a.params.photoIds ?? a.params.id]),
      [
        ['create_series', [4, 5, 6]],
        ['open_view', 30],
        ['add_to_collection', [1, 2, 3]],
      ]
    )
    assert.equal(actions[0].params.title, 'Umbrellas')
  })
})

test.group('chat_actions_jev | rankJevActionCandidates', () => {
  test('the best of each family precedes any family\'s second pick', ({ assert }) => {
    const ranked = rankJevActionCandidates([
      { type: 'create_collection', params: { groupId: 1 }, probability: 0.9, family: 'organize' },
      { type: 'create_series', params: { groupId: 2 }, probability: 0.85, family: 'organize' },
      { type: 'create_collection', params: { groupId: 2 }, probability: 0.8, family: 'organize' },
      { type: 'open_view', params: { view: 'report' }, probability: 0.6, family: 'view' },
      { type: 'search_photos', params: { query: 'rain' }, probability: 0.7, family: 'search' },
    ])
    assert.deepEqual(
      ranked.map((c) => `${c.type}@${c.probability}`),
      [
        'create_collection@0.9',
        'search_photos@0.7',
        'open_view@0.6',
        'create_series@0.85',
        'create_collection@0.8',
      ]
    )
  })
})
