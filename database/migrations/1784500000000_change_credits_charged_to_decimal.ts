import { BaseSchema } from '@adonisjs/lucid/schema'

export default class ChangeCreditsChargedToDecimal extends BaseSchema {
  protected tableName = 'cost_logs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.decimal('credits_charged', 12, 4).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('credits_charged').nullable().alter()
    })
  }
}
