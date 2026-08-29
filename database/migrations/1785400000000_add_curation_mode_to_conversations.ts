import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Progressive exploration, per conversation: when true, every photo request
      // excludes photos already shown in this conversation.
      table.boolean('curation_mode').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('curation_mode')
    })
  }
}
