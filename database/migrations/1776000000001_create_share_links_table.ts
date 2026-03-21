import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'share_links'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.enum('resource_type', ['series', 'collection', 'atlas_3d', 'atlas_2d']).notNullable()
      table.integer('resource_id').nullable() // null for atlas_3d/atlas_2d (global per user)
      table.string('slug', 100).notNullable()
      table.boolean('is_active').defaultTo(false)
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      // Each user can have only one share link per resource
      table.unique(['user_id', 'resource_type', 'resource_id'])
      // Slugs must be unique per user (to avoid conflicts in URL namespace)
      table.unique(['user_id', 'slug'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
