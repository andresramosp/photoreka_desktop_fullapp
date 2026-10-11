import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('collection_sets', (table) => {
      table.increments('id')
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.integer('parent_set_id').references('id').inTable('collection_sets').onDelete('SET NULL')
      table.string('name').notNullable()
      table.text('description')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })

    this.schema.createTable('collections', (table) => {
      table.increments('id')
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE').index()
      table.string('name').notNullable()
      table.text('description')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.jsonb('source_folder_path')
      table.integer('set_id').references('id').inTable('collection_sets').onDelete('SET NULL')
    })

    this.schema.createTable('collection_photos', (table) => {
      table.increments('id')
      table.integer('collection_id').references('id').inTable('collections').onDelete('CASCADE')
      table.integer('photo_id').references('id').inTable('photos').onDelete('CASCADE')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.unique(['collection_id', 'photo_id'])
    })

    this.schema.createTable('series_sets', (table) => {
      table.increments('id')
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.integer('parent_set_id').references('id').inTable('series_sets').onDelete('SET NULL')
      table.string('name').notNullable()
      table.text('description')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })

    this.schema.createTable('series', (table) => {
      table.increments('id')
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.string('name').notNullable()
      table.text('description')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.integer('set_id').references('id').inTable('series_sets').onDelete('SET NULL')
    })

    this.schema.createTable('series_photos', (table) => {
      table.increments('id')
      table.integer('series_id').references('id').inTable('series').onDelete('CASCADE')
      table.integer('photo_id').references('id').inTable('photos').onDelete('CASCADE')
      table.integer('order').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.unique(['series_id', 'photo_id'])
    })
  }

  async down() {
    this.schema.dropTable('series_photos')
    this.schema.dropTable('series')
    this.schema.dropTable('series_sets')
    this.schema.dropTable('collection_photos')
    this.schema.dropTable('collections')
    this.schema.dropTable('collection_sets')
  }
}
