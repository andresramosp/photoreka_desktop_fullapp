import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('stripe_price_id').nullable()
      table.string('stripe_product_id').nullable()
      table.string('product_name').nullable()

      table.index(['stripe_price_id'], 'idx_payments_stripe_price_id')
      table.index(['stripe_product_id'], 'idx_payments_stripe_product_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['stripe_product_id'], 'idx_payments_stripe_product_id')
      table.dropIndex(['stripe_price_id'], 'idx_payments_stripe_price_id')
      table.dropColumn('product_name')
      table.dropColumn('stripe_product_id')
      table.dropColumn('stripe_price_id')
    })
  }
}