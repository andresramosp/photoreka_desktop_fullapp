import { BaseSchema } from '@adonisjs/lucid/schema'

// El cupo mensual de geocodificación es común a todos los usuarios y lo lleva el servicio de la
// nube contra producción; la tabla provisional local deja de usarse.
export default class extends BaseSchema {
  async up() {
    this.schema.dropTable('geocoding_monthly_usage')
  }

  async down() {
    this.schema.createTable('geocoding_monthly_usage', (table) => {
      table.increments('id')
      table.string('provider', 20).notNullable()
      table.string('year_month', 7).notNullable()
      table.integer('call_count').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.unique(['provider', 'year_month'])
    })
  }
}
