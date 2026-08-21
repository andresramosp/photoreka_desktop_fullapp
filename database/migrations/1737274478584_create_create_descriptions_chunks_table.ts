import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'descriptions_chunks'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE ${this.tableName} (
          id SERIAL PRIMARY KEY,
          photo_id INTEGER NOT NULL,
          chunk TEXT,
          category VARCHAR(128),
          area VARCHAR(32),
          embedding VECTOR(384),
          CONSTRAINT fk_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
        )
      `)
    })
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
