import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'photos'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        ALTER TABLE ${this.tableName}
        ADD COLUMN color_histogram VECTOR(64),
        ADD COLUMN color_histogram_dominant VECTOR(64)
      `)
    })
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN IF EXISTS color_histogram`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP COLUMN IF EXISTS color_histogram_dominant`)
  }
}
