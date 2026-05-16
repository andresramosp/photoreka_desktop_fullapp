import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'portfolio_builds'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('set_id')
        .unsigned()
        .references('id')
        .inTable('portfolio_build_sets')
        .onDelete('SET NULL')
        .nullable()
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('set_id')
    })
  }
}
