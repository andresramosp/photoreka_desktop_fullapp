import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'photos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Nullable with no default: existing rows stay NULL and are treated as
      // confirmed (legacy photos). Only the upload pipeline sets `false`
      // explicitly, and the confirm endpoint promotes it to `true`.
      table.boolean('confirmed').nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('confirmed')
    })
  }
}
