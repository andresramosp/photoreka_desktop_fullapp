import { BaseSchema } from '@adonisjs/lucid/schema'

export default class CreateCostLogsTable extends BaseSchema {
  protected tableName = 'cost_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('category', 50).notNullable() // photo_analysis, chat, search, portfolio_review, other
      table.float('cost_in_eur').notNullable()
      table.integer('calls').notNullable().defaultTo(1)
      table.string('model', 100).nullable()
      table.string('task', 100).nullable()
      table.string('reference_id', 100).nullable() // analyzer_process.id, conversation_id, etc.
      table.jsonb('metadata').nullable() // tokens breakdown, extra context
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Indexes for temporal queries
      table.index(['created_at'], 'idx_cost_logs_created_at')
      table.index(['user_id', 'created_at'], 'idx_cost_logs_user_created')
      table.index(['category', 'created_at'], 'idx_cost_logs_category_created')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
