import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'collections'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Hierarchical folder path used to dedupe collections mirrored from
      // external sources (e.g. Lightroom catalog folders).
      // Example: ['2026', 'cliente1'] for an LR folder "<root>/2026/cliente1".
      table.jsonb('source_folder_path').nullable()
      table.index(['user_id'], 'collections_user_id_index')
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['user_id'], 'collections_user_id_index')
      table.dropColumn('source_folder_path')
    })
  }
}
