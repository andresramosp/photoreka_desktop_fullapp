import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geocoding_monthly_usage'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('provider', 20).notNullable()
      table.string('year_month', 7).notNullable() // "YYYY-MM", e.g. "2026-05"
      table.integer('call_count').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['provider', 'year_month'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
