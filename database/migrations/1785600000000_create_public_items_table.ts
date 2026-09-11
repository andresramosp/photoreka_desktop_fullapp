import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'public_items'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      // Polymorphic on purpose: series join this table later without a migration.
      // No FK on item_id, so publishers must clean up on item deletion.
      table.string('item_type').notNullable()
      table.integer('item_id').unsigned().notNullable()
      // Unique across every user so photoreka.com/:slug resolves on its own.
      // Relaxing this to (user_id, slug) is what unlocks user.photoreka.com.
      table.string('slug').notNullable().unique()
      table.integer('sort_order').notNullable().defaultTo(0)
      // Aspect ratios keyed by photo id, captured from the publisher's browser so
      // the public grid lays out before any image loads.
      table.jsonb('aspect_ratios').nullable()
      table.timestamp('published_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      table.unique(['user_id', 'item_type', 'item_id'])
      table.index(['user_id', 'sort_order'])
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
