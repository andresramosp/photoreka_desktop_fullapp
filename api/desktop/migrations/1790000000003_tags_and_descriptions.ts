import { BaseSchema } from '@adonisjs/lucid/schema'

// HNSW solo en tags. Medido con el catálogo mayor (60k fotos, 245k tags): emparejar cada tag
// nuevo del análisis baja de ~180 ms a ~5 ms. En descripciones y fotos la búsqueda exacta
// tarda ~0,3 s y el índice ahorraría unas décimas a cambio de ~680 MB, así que no se crea.
export default class extends BaseSchema {
  async up() {
    // El vocabulario de tags es local: solo contiene los tags de las fotos de este usuario.
    this.schema.createTable('tags', (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.string('group')
      table.specificType('embedding', 'vector(384)')
      table.timestamp('created_at', { useTz: false }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: false }).defaultTo(this.now())
      table.unique(['name', 'group'], { indexName: 'tags_name_group_key' })
    })
    this.schema.raw(
      'CREATE INDEX tags_embedding_hnsw_cosine_idx ON tags USING hnsw (embedding vector_cosine_ops)'
    )

    this.schema.createTable('tags_photos', (table) => {
      table.increments('id')
      table.integer('photo_id').notNullable().references('id').inTable('photos').onDelete('CASCADE')
      table.integer('tag_id').notNullable().references('id').inTable('tags').onDelete('CASCADE')
      table.string('category')
      table.string('area')
      table.integer('parent_id').references('id').inTable('tags_photos').onDelete('SET NULL')
      table.unique(['photo_id', 'tag_id', 'category'])
      table.index(['tag_id'], 'tags_photos_tag_id_idx')
    })

    this.schema.createTable('descriptions_chunks', (table) => {
      table.increments('id')
      table.integer('photo_id').notNullable()
      table.text('chunk')
      table.string('category', 128)
      table.string('area', 32)
      table.specificType('embedding', 'vector(384)')
      table.foreign('photo_id', 'fk_photo').references('id').inTable('photos').onDelete('CASCADE')
      table.index(['photo_id', 'category'])
    })
  }

  async down() {
    this.schema.dropTable('descriptions_chunks')
    this.schema.dropTable('tags_photos')
    this.schema.dropTable('tags')
  }
}
