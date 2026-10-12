import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('analyzer_processes', (table) => {
      table.increments('id')
      table.string('package_id')
      table.jsonb('process_sheet')
      table.string('mode')
      table.string('current_stage')
      table.boolean('is_fast_mode')
      table.boolean('is_preprocess')
      table.integer('user_id').references('id').inTable('users').onDelete('SET NULL')
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
      table.text('notes')
    })

    this.schema.createTable('geocode_cache', (table) => {
      table.increments('id')
      table.string('query_normalized', 200).notNullable().unique()
      table.string('provider', 20).notNullable()
      table.decimal('lat', 10, 7).notNullable()
      table.decimal('lng', 10, 7).notNullable()
      table.string('formatted_address', 500).notNullable()
      table.string('place_id', 200)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.string('granularity', 10)
      table.string('place')
      table.string('city')
      table.string('region')
      table.string('country')
    })

    this.schema.createTable('photos', (table) => {
      table.increments('id')
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE')
      table.jsonb('descriptions')
      table.integer('analyzer_process_id').references('id').inTable('analyzer_processes')
      table.string('title')
      table.string('name')
      table.string('original_file_name')
      table.string('thumbnail_name')
      table.string('model')
      table.text('url')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.specificType('embedding', 'vector(512)')
      table.specificType('color_histogram', 'vector(64)')
      table.specificType('color_histogram_dominant', 'vector(64)')
      table.timestamp('deleted_at', { useTz: true }).index()
      table.string('dhash', 16)
      table.integer('inferred_location_id').references('id').inTable('geocode_cache').onDelete('SET NULL')
      table.string('upload_ip', 45).defaultTo(null)
      table.boolean('confirmed')
      table.string('flag')
      table.index(['user_id', 'flag'])
    })

    this.schema.createTable('detections_photos', (table) => {
      table.increments('id')
      table.integer('photo_id').notNullable().references('id').inTable('photos').onDelete('CASCADE')
      table.float('x1').notNullable()
      table.float('y1').notNullable()
      table.float('x2').notNullable()
      table.float('y2').notNullable()
      table.string('category').notNullable()
      table.float('score')
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable('detections_photos')
    this.schema.dropTable('photos')
    this.schema.dropTable('geocode_cache')
    this.schema.dropTable('analyzer_processes')
  }
}
