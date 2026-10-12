import { BaseSchema } from '@adonisjs/lucid/schema'

// Sesión de la cuenta de la nube de cada usuario local. El id del usuario local es el de su
// cuenta en la nube. El token se guarda cifrado con la clave que Electron protege con el
// cifrado del sistema (DESKTOP_SECRET_KEY).
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('cloud_sessions', (table) => {
      table.integer('user_id').primary().references('id').inTable('users').onDelete('CASCADE')
      table.text('token_encrypted').notNullable()
      // Último perfil recibido de la nube (cuota, créditos, compras...).
      table.jsonb('account')
      table.timestamp('synced_at', { useTz: true })
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable('cloud_sessions')
  }
}
