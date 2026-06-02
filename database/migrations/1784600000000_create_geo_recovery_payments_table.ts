import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geo_recovery_payments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      // The geo-recovery Redis session ID (not a FK — session lives in Redis)
      table.string('session_id').notNullable().index()
      table.string('stripe_session_id').nullable().unique()
      table.string('stripe_payment_intent_id').nullable()
      table.integer('photo_count').notNullable()
      table.decimal('amount_eur', 10, 2).notNullable()
      // 'pending' | 'completed' | 'failed'
      table.string('status', 20).notNullable().defaultTo('pending')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
