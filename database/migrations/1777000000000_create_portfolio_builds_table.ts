import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'portfolio_builds'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .enum('status', [
          'pending',
          'parsing',
          'recall',
          'evaluating',
          'refining',
          'sequencing',
          'completed',
          'failed',
        ])
        .notNullable()
        .defaultTo('pending')
      table.jsonb('config').notNullable()
      table.jsonb('parsed_filters').nullable()
      table.jsonb('result').nullable()
      table.decimal('cost_eur', 10, 6).notNullable().defaultTo(0)
      table.integer('progress').notNullable().defaultTo(0)
      table.text('error').nullable()
      table.timestamp('started_at').nullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.index(['user_id'], 'idx_portfolio_builds_user_id')
      table.index(['status'], 'idx_portfolio_builds_status')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
