import { BaseSchema } from '@adonisjs/lucid/schema'

// Provisionales: su sitio es la nube, pero el código actual las usa en flujos normales.
// - cost_logs: se escribe tras cada llamada a un LLM; se va con las funciones de IA en la nube.
// - public_items: estado de publicación de portfolios; se va con la publicación por instantáneas.
// - geocoding_monthly_usage: cupo global de geocodificación; se va con la geocodificación en la nube.
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('cost_logs', (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('category', 50).notNullable()
      table.float('cost_in_eur').notNullable()
      table.integer('calls').notNullable().defaultTo(1)
      table.string('model', 100)
      table.string('task', 100)
      table.string('reference_id', 100)
      table.jsonb('metadata')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.decimal('credits_charged', 12, 4)
      table.float('margin_multiplier')
      table.index(['category', 'created_at'], 'idx_cost_logs_category_created')
      table.index(['created_at'], 'idx_cost_logs_created_at')
      table.index(['user_id', 'created_at'], 'idx_cost_logs_user_created')
    })

    this.schema.createTable('public_items', (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('item_type').notNullable()
      table.integer('item_id').notNullable()
      table.string('slug').notNullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.jsonb('aspect_ratios')
      table.timestamp('published_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.unique(['user_id', 'item_type', 'item_id'])
      table.unique(['user_id', 'slug'])
      table.index(['user_id', 'sort_order'])
    })

    this.schema.createTable('geocoding_monthly_usage', (table) => {
      table.increments('id')
      table.string('provider', 20).notNullable()
      table.string('year_month', 7).notNullable()
      table.integer('call_count').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.unique(['provider', 'year_month'])
    })
  }

  async down() {
    this.schema.dropTable('geocoding_monthly_usage')
    this.schema.dropTable('public_items')
    this.schema.dropTable('cost_logs')
  }
}
