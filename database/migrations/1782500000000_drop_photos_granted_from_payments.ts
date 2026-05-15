import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('photos_granted')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('photos_granted').notNullable().defaultTo(0)
    })
  }
}
