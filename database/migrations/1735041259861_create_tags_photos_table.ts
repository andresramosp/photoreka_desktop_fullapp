import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tags_photos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('photo_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('photos')
        .onDelete('CASCADE')
      table
        .integer('tag_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tags')
        .onDelete('CASCADE')
      table.string('category')
      table.string('area')
      table
        .integer('parent_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('tags_photos')
        .onDelete('SET NULL')

      table.unique(['photo_id', 'tag_id', 'category'])
      // El unique de arriba cubre las busquedas que parten de photo_id, pero no
      // las que parten de tag_id: Postgres no indexa las claves foraneas por su
      // cuenta, solo el lado referenciado.
      table.index(['tag_id'], 'tags_photos_tag_id_idx')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
