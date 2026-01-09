import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Email confirmation fields
      table.timestamp('email_confirmed_at').nullable()
      table.string('email_confirmation_token', 100).nullable().unique()
      table.timestamp('email_confirmation_sent_at').nullable()

      // Password reset fields
      table.string('password_reset_token', 100).nullable().unique()
      table.timestamp('password_reset_expires_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('email_confirmed_at')
      table.dropColumn('email_confirmation_token')
      table.dropColumn('email_confirmation_sent_at')
      table.dropColumn('password_reset_token')
      table.dropColumn('password_reset_expires_at')
    })
  }
}
