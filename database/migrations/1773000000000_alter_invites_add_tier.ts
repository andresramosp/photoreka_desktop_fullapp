import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invites'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('tier', 50).notNullable().defaultTo('BASIC')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tier')
    })
  }
}
