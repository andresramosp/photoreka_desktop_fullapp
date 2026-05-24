import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geocode_cache'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('place').nullable()
      table.string('city').nullable()
      table.string('region').nullable()
      table.string('country').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('place')
      table.dropColumn('city')
      table.dropColumn('region')
      table.dropColumn('country')
    })
  }
}
