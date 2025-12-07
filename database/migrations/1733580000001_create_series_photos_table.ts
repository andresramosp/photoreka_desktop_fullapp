import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'series_photos'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('series_id').unsigned().references('id').inTable('series').onDelete('CASCADE')
      table.integer('photo_id').unsigned().references('id').inTable('photos').onDelete('CASCADE')
      table.integer('order').unsigned().notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.unique(['series_id', 'photo_id'])
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
