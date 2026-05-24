import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'photos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('inferred_location_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('geocode_cache')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('inferred_location_id')
    })
  }
}
