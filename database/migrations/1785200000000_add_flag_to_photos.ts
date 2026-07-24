import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'photos'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // 'picked' | 'rejected' | null (sin marcar)
      table.string('flag').nullable()
      table.index(['user_id', 'flag'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['user_id', 'flag'])
      table.dropColumn('flag')
    })
  }
}
