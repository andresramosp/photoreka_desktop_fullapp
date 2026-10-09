import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // When the user was warned that the account will be deleted for inactivity.
      // Kept as evidence and to compute when the grace period ends.
      table.timestamp('inactivity_notice_sent_at').nullable().defaultTo(null)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('inactivity_notice_sent_at')
    })
  }
}
