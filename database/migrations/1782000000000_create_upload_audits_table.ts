import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'upload_audits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()

      // Intentionally NOT foreign keys: this is an immutable evidence/provenance
      // log that must survive user and photo deletion (legal preservation).
      table.integer('user_id').unsigned().notNullable().index()
      table.integer('photo_id').unsigned().nullable().index()

      table.string('object_key', 512).notNullable()
      table.string('thumbnail_key', 512).nullable()
      table.string('original_file_name', 1024).nullable()
      table.string('content_type', 100).nullable()

      table.string('upload_ip', 64).nullable()
      table.string('user_agent', 1024).nullable()

      // Insert-only: no updated_at on purpose.
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
