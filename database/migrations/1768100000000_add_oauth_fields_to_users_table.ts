import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Google OAuth fields
      table.string('google_id').nullable().unique()
      table.string('provider').nullable() // 'email', 'google', etc.
      table.string('avatar').nullable()

      // Make password nullable for OAuth users
      table.string('password', 180).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('google_id')
      table.dropColumn('provider')
      table.dropColumn('avatar')

      // Restore password as not nullable
      table.string('password', 180).notNullable().alter()
    })
  }
}
