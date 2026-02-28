import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversation_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('conversations')
        .onDelete('CASCADE')
      table.enu('role', ['user', 'assistant']).notNullable()
      table.text('content').notNullable()
      table.json('context_photo_ids').nullable()
      table.json('photo_groups').nullable()
      table.boolean('is_error').defaultTo(false)
      table.decimal('cost_eur', 10, 6).nullable()
      table.jsonb('metadata').defaultTo('{}')
      table.timestamp('created_at')

      table.index(['conversation_id', 'created_at'], 'idx_conv_messages_conv_created')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
