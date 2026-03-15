import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_activities'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('level')
      table.dropColumn('ip_address')
      table.dropColumn('user_agent')
      table.dropColumn('endpoint')
      table.dropColumn('status_code')
      table.dropColumn('response_time')
      table.dropColumn('updated_at')
    })

    // Drop old unused index on level
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['level', 'created_at'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('level', 20).defaultTo('info')
      table.string('ip_address', 45).nullable()
      table.text('user_agent').nullable()
      table.string('endpoint', 500).nullable()
      table.integer('status_code').nullable()
      table.integer('response_time').nullable()
      table.timestamp('updated_at')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.index(['level', 'created_at'])
    })
  }
}
