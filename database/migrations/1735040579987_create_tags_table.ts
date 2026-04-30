import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tags'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE ${this.tableName} (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          "group" VARCHAR(255),
          embedding VECTOR(384),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (name, "group") 
        )
      `)

      await db.rawQuery(`
        CREATE INDEX tags_embedding_idx ON ${this.tableName} USING ivfflat (embedding) WITH (lists = 100)
      `)
    })
  }

  async down() {
    this.schema.raw(`DROP TABLE ${this.tableName}`)
    this.schema.raw(`DROP INDEX IF EXISTS tags_embedding_idx`)
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
