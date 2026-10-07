import { BaseSchema } from '@adonisjs/lucid/schema'

/** Free-trial orders: judged like paid ones, but never charged nor emailed. */
export default class extends BaseSchema {
  protected tableName = 'picks_sessions'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_free').notNullable().defaultTo(false)
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_free')
    })
  }
}
