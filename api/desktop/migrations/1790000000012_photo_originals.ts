import { BaseSchema } from '@adonisjs/lucid/schema'

// Originales en el disco del usuario, como en Lightroom: dónde estaba el archivo al importarlo,
// su tamaño y su huella (para reconocerlo si se mueve), y cuándo se borró la main de R2.
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('photos', (table) => {
      table.text('original_path')
      table.bigInteger('original_size')
      table.string('original_fingerprint', 64)
      table.timestamp('main_deleted_at', { useTz: true })
    })
  }

  async down() {
    this.schema.alterTable('photos', (table) => {
      table.dropColumn('original_path')
      table.dropColumn('original_size')
      table.dropColumn('original_fingerprint')
      table.dropColumn('main_deleted_at')
    })
  }
}
