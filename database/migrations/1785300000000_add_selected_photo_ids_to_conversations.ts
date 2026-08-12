import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Selection basket: photo ids the user kept aside while chatting, in the
      // order they were pinned. Null = empty basket.
      table.jsonb('selected_photo_ids').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('selected_photo_ids')
    })
  }
}
