import { BaseSchema } from '@adonisjs/lucid/schema'

// Esquema de partida del escritorio. Reproduce las tablas locales tal como quedan tras las
// migraciones de App hasta 1786400000000, más lo que producción tiene sin migración (ver README de Desktop).
export default class extends BaseSchema {
  async up() {
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS vector')

    this.schema.createTable('users', (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.string('email').notNullable().unique()
      table.string('password', 180).nullable()
      table.boolean('is_active').defaultTo(true)
      table.string('preferred_source').defaultTo('web')
      table.string('profiles').defaultTo('general')
      table.jsonb('catalog_patterns')
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.jsonb('usage')
      table.timestamp('email_confirmed_at', { useTz: true })
      table.string('email_confirmation_token', 100).unique()
      table.timestamp('email_confirmation_sent_at', { useTz: true })
      table.string('password_reset_token', 100).unique()
      table.timestamp('password_reset_expires_at', { useTz: true })
      table.string('google_id').unique()
      table.string('provider')
      table.string('avatar')
      table.jsonb('cost_history')
      table.string('role', 20).notNullable().defaultTo('user')
      table.timestamp('deleted_at', { useTz: true }).index('idx_users_deleted_at')
      table.string('tos_accepted_version', 50)
      table.timestamp('tos_accepted_at', { useTz: true })
      table.string('tos_accepted_ip', 64)
      table.jsonb('insights_state')
      table.timestamp('photos_reviewed_at', { useTz: true })
      table.jsonb('content_violations')
      table.jsonb('custom_weight_presets')
      table.jsonb('suggested_canvas_state')
      table.timestamp('inactivity_notice_sent_at', { useTz: true })
      table.string('stripe_customer_id').unique()
      // En producción existe sin migración en App (la añadió el commit de portfolios); el modelo User la usa.
      table.string('username', 50).unique()
    })

    this.schema.createTable('auth_access_tokens', (table) => {
      table.increments('id')
      table.integer('tokenable_id').notNullable()
      table.string('type').notNullable()
      table.string('name')
      table.string('hash').notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
      table.timestamp('last_used_at', { useTz: true })
      table.timestamp('expires_at', { useTz: true })
      table.index(['tokenable_id', 'type'])
    })
  }

  async down() {
    this.schema.dropTable('auth_access_tokens')
    this.schema.dropTable('users')
  }
}
