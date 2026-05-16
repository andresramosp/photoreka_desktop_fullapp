import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().nullable().references('id').inTable('users')
      table.string('user_email_snapshot', 255).nullable()
      table.string('stripe_session_id').unique().nullable()
      table.string('stripe_payment_intent_id').unique().nullable()
      table.enum('type', ['photo_package', 'credits']).notNullable()
      table.string('package_id').notNullable()
      table.integer('analyzed_photos_granted').notNullable().defaultTo(0)
      table.integer('credits_granted').notNullable().defaultTo(0)
      table.decimal('amount_eur', 10, 2).notNullable()
      table
        .enum('status', ['pending', 'completed', 'failed', 'refunded'])
        .notNullable()
        .defaultTo('pending')
      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.index(['user_id'], 'idx_payments_user_id')
      table.index(['status'], 'idx_payments_status')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
