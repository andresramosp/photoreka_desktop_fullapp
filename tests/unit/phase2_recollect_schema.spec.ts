import { test } from '@japa/runner'
import { buildFinalAnswerSchema } from '#services/langchain_agent_service'

/**
 * The re-collection escape hatch is a per-pass CONTRACT, not a prompt suggestion: Phase 2
 * can ask to re-collect only on the pass where the schema carries `recollect_note`, and the
 * orchestrator runs the second pass with the field gone so a third round is impossible (see
 * `chat`). These tests pin the gate at the schema level — structure only, no model behavior,
 * so nothing here depends on any particular query.
 */

const has = (schema: any, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(schema.properties, field) && schema.required.includes(field)

test.group('buildFinalAnswerSchema — recollection gate', () => {
  test('omits recollect_note by default (second pass / normal turn)', ({ assert }) => {
    const schema = buildFinalAnswerSchema({ hasCanvasPartition: false })
    assert.isFalse(has(schema, 'recollect_note'))
    // The ordinary contract is untouched.
    assert.isTrue(has(schema, 'text'))
    assert.isTrue(has(schema, 'photo_groups'))
  })

  test('adds recollect_note as a required field on the first pass', ({ assert }) => {
    const schema = buildFinalAnswerSchema({ hasCanvasPartition: false }, true)
    assert.isTrue(has(schema, 'recollect_note'))
    assert.equal(schema.properties.recollect_note.type, 'string')
    // Everything the base schema required is still required.
    assert.isTrue(has(schema, 'text'))
    assert.isTrue(has(schema, 'selection_title'))
    assert.isTrue(has(schema, 'photo_groups'))
  })

  test('composes with the canvas-partition transform', ({ assert }) => {
    const schema = buildFinalAnswerSchema({ hasCanvasPartition: true }, true)
    // The recollection field is present…
    assert.isTrue(has(schema, 'recollect_note'))
    // …and the partition contract still holds: a group answers with group_id, not photo_ids.
    const groupItem = schema.properties.photo_groups.items
    assert.isTrue(groupItem.required.includes('group_id'))
    assert.isFalse(groupItem.required.includes('photo_ids'))
  })

  test('canvas transform alone leaves recollect_note out', ({ assert }) => {
    const schema = buildFinalAnswerSchema({ hasCanvasPartition: true })
    assert.isFalse(has(schema, 'recollect_note'))
    assert.isTrue(schema.properties.photo_groups.items.required.includes('group_id'))
  })
})
