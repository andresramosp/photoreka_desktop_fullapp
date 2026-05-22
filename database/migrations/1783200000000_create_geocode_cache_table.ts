import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geocode_cache'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('query_normalized', 200).notNullable()
      table.string('provider', 20).notNullable()
      table.decimal('lat', 10, 7).notNullable()
      table.decimal('lng', 10, 7).notNullable()
      table.string('formatted_address', 500).notNullable()
      table.string('place_id', 200).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['query_normalized'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
