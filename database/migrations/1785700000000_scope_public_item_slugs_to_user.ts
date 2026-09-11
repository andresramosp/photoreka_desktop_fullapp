import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'public_items'

  public async up() {
    // Public pages moved from photoreka.com/:slug to photoreka.com/:username/:slug,
    // so a slug only has to be unique within its author. This is also what makes
    // username.photoreka.com/:slug possible without touching the data again.
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['slug'])
      table.unique(['user_id', 'slug'])
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['user_id', 'slug'])
      table.unique(['slug'])
    })
  }
}
