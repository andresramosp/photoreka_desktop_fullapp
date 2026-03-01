import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invites'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('max_uses').notNullable().defaultTo(1)
      table.integer('use_count').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('max_uses')
      table.dropColumn('use_count')
    })
  }
}
