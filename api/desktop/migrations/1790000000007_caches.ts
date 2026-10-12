import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('cached_embeddings', (table) => {
      table.text('text').primary()
      table.specificType('embedding_text', 'vector(384)')
      table.specificType('embedding_clip', 'vector(512)')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.raw('now()'))
    })

    this.schema.createTable('cache_invalidation_watermarks', (table) => {
      table.integer('user_id').primary()
      table.integer('net_delta').notNullable().defaultTo(0)
      table.integer('churn_delta').notNullable().defaultTo(0)
      table.timestamp('last_invalidated_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.boolean('has_payload').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.dropTable('cache_invalidation_watermarks')
    this.schema.dropTable('cached_embeddings')
  }
}
