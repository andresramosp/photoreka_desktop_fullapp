import { BaseSchema } from '@adonisjs/lucid/schema'

// Los costes de los modelos de lenguaje se registran y se cobran en la nube (gateway/cost_logs de
// producción); el escritorio ya no escribe ni lee la tabla local ni el historial del usuario.
export default class extends BaseSchema {
  async up() {
    this.schema.dropTable('cost_logs')
    this.schema.alterTable('users', (table) => {
      table.dropColumn('cost_history')
    })
  }

  async down() {
    this.schema.alterTable('users', (table) => {
      table.jsonb('cost_history')
    })
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
  }
}
