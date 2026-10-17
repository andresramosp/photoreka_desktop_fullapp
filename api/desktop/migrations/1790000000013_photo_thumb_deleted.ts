import { BaseSchema } from '@adonisjs/lucid/schema'

// Cuándo se borró la miniatura de R2 al terminar el análisis; desde entonces solo está en el disco.
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('photos', (table) => {
      table.timestamp('thumb_deleted_at', { useTz: true })
    })
  }

  async down() {
    this.schema.alterTable('photos', (table) => {
      table.dropColumn('thumb_deleted_at')
    })
  }
}
