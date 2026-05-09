import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cached_embeddings'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE TABLE ${this.tableName} (
          text           TEXT PRIMARY KEY,
          embedding_text VECTOR(384),
          embedding_clip VECTOR(512),
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
    })
  }

  async down() {
    this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
