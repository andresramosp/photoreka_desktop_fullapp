import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('conversations', (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('title')
      table.boolean('is_archived').defaultTo(false)
      table.jsonb('metadata').defaultTo('{}')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.jsonb('selected_photo_ids')
      table.boolean('curation_mode').notNullable().defaultTo(false)
      table.index(['user_id', 'updated_at'], 'idx_conversations_user_updated')
    })

    this.schema.createTable('conversation_messages', (table) => {
      table.increments('id')
      table.integer('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE')
      table.enu('role', ['user', 'assistant']).notNullable()
      table.text('content').notNullable()
      table.json('context_photo_ids')
      table.json('photo_groups')
      table.boolean('is_error').defaultTo(false)
      table.decimal('cost_eur', 10, 6)
      table.jsonb('metadata').defaultTo('{}')
      table.timestamp('created_at', { useTz: true })
      table.index(['conversation_id', 'created_at'], 'idx_conv_messages_conv_created')
    })

    this.schema.createTable('canvases', (table) => {
      table.increments('id')
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.string('name').defaultTo('My Canvas')
      table.jsonb('data').notNullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.integer('conversation_id').references('id').inTable('conversations').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.dropTable('canvases')
    this.schema.dropTable('conversation_messages')
    this.schema.dropTable('conversations')
  }
}
