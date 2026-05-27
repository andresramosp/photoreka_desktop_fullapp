import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cache_invalidation_watermarks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // One row per user — user_id is both PK and FK (no surrogate id needed)
      table.integer('user_id').primary()

      // Signed accumulator: +N on analysis, -N on deletion.
      // Triggers invalidation when |net_delta| >= threshold.
      table.integer('net_delta').notNullable().defaultTo(0)

      // Unsigned accumulator: always +=|N| regardless of direction.
      // Catches "60 analyzed + 60 deleted = 0 net but 120 real changes" cases.
      table.integer('churn_delta').notNullable().defaultTo(0)

      // Timestamp of the last time expensive caches were actually invalidated.
      table.timestamp('last_invalidated_at', { useTz: true }).nullable()

      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
