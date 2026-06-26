import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Terms of Service / content-policy acceptance evidence.
      table.string('tos_accepted_version', 50).nullable()
      table.timestamp('tos_accepted_at').nullable()
      table.string('tos_accepted_ip', 64).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tos_accepted_version')
      table.dropColumn('tos_accepted_at')
      table.dropColumn('tos_accepted_ip')
    })
  }
}
