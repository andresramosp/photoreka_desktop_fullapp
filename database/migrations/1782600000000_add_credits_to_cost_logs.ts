import { BaseSchema } from '@adonisjs/lucid/schema'

export default class AddCreditsToCostLogs extends BaseSchema {
  protected tableName = 'cost_logs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Credits charged to the user for this operation (after margin)
      table.integer('credits_charged').nullable()
      // Margin multiplier applied (e.g. 2.0, 2.5). null = fixed-price charge with no multiplier
      table.float('margin_multiplier').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('credits_charged')
      table.dropColumn('margin_multiplier')
    })
  }
}
