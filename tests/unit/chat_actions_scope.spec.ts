import { test } from '@japa/runner'
import ChatActionsService from '#services/chat_actions_service'
import {
  validateActions,
  type ActionsGroundingContext,
  type GroundedPhotoGroup,
} from '../../app/utils/chat_actions_catalog.js'

/**
 * Phase 3 photo SCOPE — which photos a suggested action actually covers, and what it is
 * called.
 *
 * The bug these tests pin down: on a turn where the assistant showed four groups, a
 * `create_series` came back titled "Digital Solitude" (one group) but carrying all eleven
 * photos (every group). Title and scope were two free slots filled by the same weak model,
 * and they drifted apart.
 *
 * The contract now: an organizing action covers exactly ONE group and is NAMED after it;
 * a canvas over the whole selection is appended programmatically with the curator's own
 * umbrella title; and a scope that cannot be resolved drops the action instead of widening
 * it. The suggester writes no names at all.
 */

const range = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i)

/** Reaches the private helpers under test without booting a DB. */
const svc = () => new ChatActionsService() as any

const buildGroups = (
  groups: Array<{ id?: number; label: string; photoIds: number[]; rejected?: boolean }>,
  attached: number[] = []
): GroundedPhotoGroup[] => svc().buildGroundedGroups(groups, attached)

const SELECTION_TITLE = 'Ritmos urbanos'

/** Grounding context over exactly the photos the given groups/ids cover. */
const contextFor = (
  photoGroups: GroundedPhotoGroup[],
  flatIds: number[] = [],
  selectionTitle = SELECTION_TITLE
): ActionsGroundingContext => {
  const ids =
    photoGroups.length > 0
      ? [...new Set(photoGroups.flatMap((g) => g.photoIds))]
      : [...new Set(flatIds)]
  return {
    photos: ids.map((id) => ({ id, filename: `p${id}.jpg` })),
    photoGroups,
    selectionTitle,
    collections: [{ id: 7, name: 'Street' }],
    series: [],
    portfolios: [],
  }
}

/** Runs the suggester's raw output through validation AND both programmatic passes. */
const runFull = (raw: any[], ctx: ActionsGroundingContext, attached: number[] = []) => {
  const { actions, trace } = validateActions(raw, ctx)
  const withView = svc().appendSinglePhotoViewAction(actions, ctx, attached, trace)
  return { actions: svc().appendCanvasAction(withView, ctx, trace), trace }
}

const URBAN = { id: 1, label: 'Digital Solitude', photoIds: [34142, 34166, 34217] }
const SACRED = { id: 2, label: 'Sacred Rhythms', photoIds: [34526, 34575, 34601] }
const REJECTED = { id: 3, label: 'Descartadas', photoIds: [35114, 35127], rejected: true }

test.group('Phase 3 action scope | one group per action', () => {
  test('a create covers exactly the named group and is named after it', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = validateActions(
      [{ type: 'create_series', params: { groupId: 1 } }],
      ctx
    )

    assert.lengthOf(actions, 1)
    assert.equal(actions[0].params.title, 'Digital Solitude')
    assert.deepEqual(actions[0].params.photoIds, URBAN.photoIds)
    assert.equal(actions[0].params.groupId, 1)
    assert.equal(actions[0].params.groupLabel, 'Digital Solitude')
  })

  test('the suggester cannot supply its own name', ({ assert }) => {
    // The old failure: title "Digital Solitude" + scope of every group. A title the model
    // writes is simply ignored — the name always comes from the scope.
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = validateActions(
      [{ type: 'create_collection', params: { groupId: 2, title: 'Inventado' } }],
      ctx
    )

    assert.equal(actions[0].params.title, 'Sacred Rhythms')
    assert.deepEqual(actions[0].params.photoIds, SACRED.photoIds)
  })

  test('an unknown groupId drops the action rather than widening it', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions, trace } = validateActions(
      [{ type: 'create_collection', params: { groupId: 99 } }],
      ctx
    )

    assert.lengthOf(actions, 0)
    assert.match(trace[0], /unresolvable scope/)
  })

  test('naming no group at all, with several to choose from, drops the action', ({ assert }) => {
    // Silence is not a choice when there is something to disambiguate. This is the exact
    // path that used to mean "every group".
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = validateActions([{ type: 'create_series', params: {} }], ctx)

    assert.lengthOf(actions, 0)
  })

  test('with a single group there is nothing to disambiguate, so silence resolves to it', ({
    assert,
  }) => {
    const ctx = contextFor(buildGroups([URBAN]))

    const { actions } = validateActions([{ type: 'create_series', params: {} }], ctx)

    assert.equal(actions[0].params.title, 'Digital Solitude')
    assert.deepEqual(actions[0].params.photoIds, URBAN.photoIds)
  })

  test('photo ids in the wrong slot snap to the one group holding them', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = validateActions(
      [{ type: 'create_collection', params: { photoIds: [34526] } }],
      ctx
    )

    assert.equal(actions[0].params.groupId, 2)
    assert.deepEqual(actions[0].params.photoIds, SACRED.photoIds)
  })

  test('photo ids straddling two groups are ambiguous, so the action is dropped', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = validateActions(
      [{ type: 'create_collection', params: { photoIds: [34142, 34526] } }],
      ctx
    )

    assert.lengthOf(actions, 0)
  })

  test('add_to_collection is likewise scoped to one group', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = validateActions(
      [{ type: 'add_to_collection', params: { collectionId: 7, groupId: 1 } }],
      ctx
    )

    assert.deepEqual(actions[0].params.photoIds, URBAN.photoIds)
    assert.equal(actions[0].params.groupLabel, 'Digital Solitude')
  })
})

test.group('Phase 3 action scope | rejected groups', () => {
  test('a rejected group cannot be named', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, REJECTED]))

    const { actions } = validateActions(
      [{ type: 'create_collection', params: { groupId: 3 } }],
      ctx
    )

    assert.lengthOf(actions, 0)
  })

  test('a rejected group is never the implicit single group', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, REJECTED]))

    const { actions } = validateActions([{ type: 'create_series', params: {} }], ctx)

    // URBAN is the only SELECTABLE group, so silence resolves to it — not to the pile.
    assert.equal(actions[0].params.groupId, 1)
    assert.notIncludeMembers(actions[0].params.photoIds, REJECTED.photoIds)
  })

  test('a turn whose only group is the discard pile offers no organizing action', ({ assert }) => {
    const ctx = contextFor(buildGroups([REJECTED]))

    const { actions } = validateActions([{ type: 'create_collection', params: {} }], ctx)

    assert.lengthOf(actions, 0)
  })
})

test.group('Phase 3 action scope | the programmatic canvas', () => {
  test('fills a free slot with the whole selection, named by the curator', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = runFull([{ type: 'create_series', params: { groupId: 1 } }], ctx)

    const canvas = actions.find((a: any) => a.type === 'create_canvas')
    assert.exists(canvas)
    assert.equal(canvas.params.title, SELECTION_TITLE)
    assert.deepEqual(canvas.params.photoIds, [...URBAN.photoIds, ...SACRED.photoIds])
  })

  test('the canvas never includes the discard pile', ({ assert }) => {
    const KEEP = { id: 1, label: 'Digital Solitude', photoIds: range(1, 5) }
    const ctx = contextFor(buildGroups([KEEP, REJECTED]))

    const { actions } = runFull([], ctx)

    const canvas = actions.find((a: any) => a.type === 'create_canvas')
    assert.deepEqual(canvas.params.photoIds, KEEP.photoIds)
  })

  test('a selection too small to arrange gets no board', ({ assert }) => {
    // URBAN alone is 3 photos — that is not a set, it is just photos.
    const ctx = contextFor(buildGroups([URBAN]))

    const { actions, trace } = runFull([], ctx)

    assert.notExists(actions.find((a: any) => a.type === 'create_canvas'))
    assert.isTrue(trace.some((t: string) => /create_canvas — skipped: only 3 photo/.test(t)))
  })

  test('it rides alongside a full slate rather than competing for a slot', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions } = runFull(
      [
        { type: 'create_series', params: { groupId: 1 } },
        { type: 'create_collection', params: { groupId: 2 } },
        { type: 'search_photos', params: { query: 'calles' } },
      ],
      ctx
    )

    // MAX_ACTIONS caps the SUGGESTER at 3; the board is offered on top of them.
    assert.lengthOf(actions, 4)
    assert.equal(actions[3].type, 'create_canvas')
  })

  test('without a curator title there is nothing to call the board, so it is skipped', ({
    assert,
  }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]), [], '')

    const { actions, trace } = runFull([], ctx)

    assert.lengthOf(actions, 0)
    assert.isTrue(trace.some((t: string) => /create_canvas — skipped/.test(t)))
  })

  test('the suggester cannot propose a canvas itself', ({ assert }) => {
    const ctx = contextFor(buildGroups([URBAN, SACRED]))

    const { actions, trace } = validateActions(
      [{ type: 'create_canvas', params: { groupId: 1, title: 'Mío' } }],
      ctx
    )

    assert.lengthOf(actions, 0)
    assert.match(trace[0], /not in the catalog/)
  })
})

test.group('Phase 3 action scope | the programmatic atlas view', () => {
  const LONE = 34142

  test('a lone attached photo always gets its atlas view', ({ assert }) => {
    const ctx = contextFor([], [LONE])

    const { actions } = runFull([{ type: 'search_photos', params: { query: 'calles' } }], ctx, [
      LONE,
    ])

    const view = actions.find((a: any) => a.type === 'view_photo')
    assert.exists(view)
    assert.equal(view.params.photoId, LONE)
    assert.equal(view.params.view, '2d')
    assert.equal(view.params.filename, `p${LONE}.jpg`)
  })

  test('it also fires when the assistant answered with groups of its own', ({ assert }) => {
    // The attached photo is folded in as a synthetic trailing group, but it is still the one
    // photo the user asked about.
    const ctx = contextFor(buildGroups([URBAN], [LONE]))

    const { actions } = runFull([], ctx, [LONE])

    assert.exists(actions.find((a: any) => a.type === 'view_photo'))
  })

  test('several attached photos are not one photo, so no atlas view', ({ assert }) => {
    const ctx = contextFor([], URBAN.photoIds)

    const { actions } = runFull([], ctx, URBAN.photoIds)

    assert.notExists(actions.find((a: any) => a.type === 'view_photo'))
  })

  test('a photo that is not the user’s is never opened', ({ assert }) => {
    // Grounding context holds no such photo — the ownership query didn't return it.
    const ctx = contextFor([], [LONE])

    const { actions } = runFull([], ctx, [99999])

    assert.notExists(actions.find((a: any) => a.type === 'view_photo'))
  })

  test('it rides in the slot the board cannot fill', ({ assert }) => {
    const ctx = contextFor([], [LONE])

    const { actions } = runFull(
      [
        { type: 'search_photos', params: { query: 'calles' } },
        { type: 'open_view', params: { view: 'tagcloud' } },
        { type: 'open_view', params: { view: 'world-map' } },
      ],
      ctx,
      [LONE]
    )

    // One photo is below MIN_CANVAS_PHOTOS, so there is no board to compete with.
    assert.lengthOf(actions, 4)
    assert.equal(actions[3].type, 'view_photo')
    assert.notExists(actions.find((a: any) => a.type === 'create_canvas'))
  })

  test('the suggester cannot propose an atlas view itself', ({ assert }) => {
    const ctx = contextFor([], [LONE])

    const { actions, trace } = validateActions(
      [{ type: 'view_photo', params: { photoId: LONE, view: '2d' } }],
      ctx
    )

    assert.lengthOf(actions, 0)
    assert.match(trace[0], /not in the catalog/)
  })
})

test.group('Phase 3 action scope | flat turns and large sets', () => {
  test('a flat turn is scoped by photoIds and named with the curator title', ({ assert }) => {
    const ctx = contextFor([], range(1, 60))

    const { actions } = validateActions(
      [{ type: 'create_series', params: { photoIds: [1, 2, 3] } }],
      ctx
    )

    assert.equal(actions[0].params.title, SELECTION_TITLE)
    assert.deepEqual(actions[0].params.photoIds, [1, 2, 3])
    assert.isUndefined(actions[0].params.groupId)
  })

  test('a flat turn with many photos and no photoIds covers all of them', ({ assert }) => {
    const ctx = contextFor([], range(1, 60))

    const { actions } = validateActions([{ type: 'create_collection', params: {} }], ctx)

    assert.lengthOf(actions[0].params.photoIds, 60)
  })

  test('photos the user attached become their own selectable group', ({ assert }) => {
    const groups = buildGroups([URBAN], [900, 901])

    assert.lengthOf(groups, 2)
    assert.deepEqual(groups[1].photoIds, [900, 901])

    const { actions } = validateActions(
      [{ type: 'create_collection', params: { groupId: groups[1].id } }],
      contextFor(groups)
    )
    assert.deepEqual(actions[0].params.photoIds, [900, 901])
  })

  test('a group larger than the prompt listing budget is still covered whole', ({ assert }) => {
    // The prompt lists ~40 photos, but the model selects the group by NUMBER — so the
    // photos it never saw listed must still travel with the group.
    const groups = buildGroups([{ id: 1, label: 'Serie larga', photoIds: range(1, 150) }])

    assert.lengthOf(groups[0].photoIds, 150)

    const { actions } = validateActions(
      [{ type: 'create_collection', params: { groupId: 1 } }],
      contextFor(groups)
    )
    assert.lengthOf(actions[0].params.photoIds, 150)
  })

  test('a group beyond the grounding budget is dropped whole, never half-covered', ({ assert }) => {
    const groups = buildGroups([{ id: 1, label: 'Enorme', photoIds: range(1, 250) }])

    // Better no chip than a chip that silently files 200 of the 250 photos on screen.
    assert.lengthOf(groups, 0)
  })

  test('the prompt lists a bounded number of photos and says what it left out', ({ assert }) => {
    const groups = buildGroups([{ id: 1, label: 'Serie larga', photoIds: range(1, 150) }])
    const photos = groups[0].photoIds.map((id) => ({
      id,
      originalFileName: `p${id}.jpg`,
      descriptions: { context: 'A scene.' },
    }))

    const prompt: string = svc().buildUserContent({
      assistantText: 'Here are your photos.',
      historyText: '',
      photos,
      photoGroups: groups,
      collections: [],
      series: [],
      portfolios: [],
    })

    const listed = prompt.split('\n').filter((l) => l.startsWith('- id ')).length
    assert.isBelow(listed, 60)
    assert.include(prompt, 'Group #1 "Serie larga" (150 photos)')
    assert.include(prompt, 'including group #1 covers all 150')
  })
})
