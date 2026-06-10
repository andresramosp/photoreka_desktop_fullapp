import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cache_invalidation_watermarks'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('has_payload').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('has_payload')
    })
  }
}
