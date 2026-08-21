import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'photos'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE ${this.tableName}
        ADD COLUMN embedding VECTOR(512)
      `)
    })
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN IF EXISTS embedding`)
  }
}
