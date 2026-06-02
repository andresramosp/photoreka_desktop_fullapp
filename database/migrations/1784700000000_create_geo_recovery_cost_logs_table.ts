import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateGeoRecoveryCostLogsTable extends BaseSchema {
  protected tableName = 'geo_recovery_cost_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .integer('geo_recovery_payment_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('geo_recovery_payments')
        .onDelete('CASCADE')
      table.string('category', 50).notNullable() // location_inference, other
      table.float('cost_in_eur').notNullable()
      table.integer('calls').notNullable().defaultTo(1)
      table.string('model', 100).nullable()
      table.string('task', 100).nullable()
      table.string('reference_id', 100).nullable() // jobId, sessionId, etc.
      table.jsonb('metadata').nullable() // tokens breakdown, extra context
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Indexes for queries
      table.index(['created_at'], 'idx_geo_recovery_cost_logs_created_at')
      table.index(
        ['geo_recovery_payment_id', 'created_at'],
        'idx_geo_recovery_cost_logs_payment_created'
      )
      table.index(['category', 'created_at'], 'idx_geo_recovery_cost_logs_category_created')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
