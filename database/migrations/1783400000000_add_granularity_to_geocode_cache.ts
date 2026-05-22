import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geocode_cache'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('granularity', 10).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('granularity')
    })
  }
}
