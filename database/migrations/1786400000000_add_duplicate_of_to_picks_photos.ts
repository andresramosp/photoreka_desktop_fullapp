import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Exact copies in an upload (same thumbnail bytes) are registered once more as
 * `status = 'duplicate'` pointing at the photo that is judged, so the jury never
 * scores the same image twice with slightly different numbers.
 */
export default class extends BaseSchema {
  protected tableName = 'picks_photos'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // client_photo_id of the judged photo this one is an exact copy of
      table.string('duplicate_of', 64).nullable()
      table.index(['session_id', 'duplicate_of'])
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['session_id', 'duplicate_of'])
      table.dropColumn('duplicate_of')
    })
  }
}
