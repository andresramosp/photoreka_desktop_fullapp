import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('deleted_at').nullable()
      table.index(['deleted_at'], 'idx_users_deleted_at')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['deleted_at'], 'idx_users_deleted_at')
      table.dropColumn('deleted_at')
    })
  }
}
