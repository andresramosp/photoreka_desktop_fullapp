import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddCostHistoryToUsers extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('cost_history').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('cost_history')
    })
  }
}
