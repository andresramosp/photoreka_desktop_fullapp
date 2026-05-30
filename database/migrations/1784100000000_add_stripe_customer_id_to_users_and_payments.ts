import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.string('stripe_customer_id').nullable()
      table.unique(['stripe_customer_id'], 'users_stripe_customer_id_unique')
    })

    this.schema.alterTable('payments', (table) => {
      table.string('stripe_customer_id').nullable()
      table.index(['stripe_customer_id'], 'idx_payments_stripe_customer_id')
    })
  }

  async down() {
    this.schema.alterTable('payments', (table) => {
      table.dropIndex(['stripe_customer_id'], 'idx_payments_stripe_customer_id')
      table.dropColumn('stripe_customer_id')
    })

    this.schema.alterTable('users', (table) => {
      table.dropUnique(['stripe_customer_id'], 'users_stripe_customer_id_unique')
      table.dropColumn('stripe_customer_id')
    })
  }
}
