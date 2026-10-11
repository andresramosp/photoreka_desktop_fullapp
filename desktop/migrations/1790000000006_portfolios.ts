import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('portfolio_build_sets', (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.integer('parent_set_id').references('id').inTable('portfolio_build_sets').onDelete('SET NULL')
      table.string('name').notNullable()
      table.text('description')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })

    this.schema.createTable('portfolio_builds', (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table
        .enu('status', ['pending', 'parsing', 'recall', 'evaluating', 'refining', 'sequencing', 'completed', 'failed'])
        .notNullable()
        .defaultTo('pending')
      table.jsonb('config').notNullable()
      table.jsonb('parsed_filters')
      table.jsonb('result')
      table.decimal('cost_eur', 10, 6).notNullable().defaultTo(0)
      table.integer('progress').notNullable().defaultTo(0)
      table.text('error')
      table.timestamp('started_at', { useTz: true })
      table.timestamp('completed_at', { useTz: true })
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.integer('set_id').references('id').inTable('portfolio_build_sets').onDelete('SET NULL')
      table.index(['status'], 'idx_portfolio_builds_status')
      table.index(['user_id'], 'idx_portfolio_builds_user_id')
    })
  }

  async down() {
    this.schema.dropTable('portfolio_builds')
    this.schema.dropTable('portfolio_build_sets')
  }
}
