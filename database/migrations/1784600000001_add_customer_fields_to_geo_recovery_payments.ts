import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geo_recovery_payments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('customer_email').nullable()
      table.string('stripe_customer_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('customer_email')
      table.dropColumn('stripe_customer_id')
    })
  }
}
