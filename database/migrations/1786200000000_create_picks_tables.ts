import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Photoreka Picks: anonymous scoring orders. Unlike geo-recovery (Redis, 7 days),
 * results live in Postgres because buyers can reopen them for a month.
 */
export default class extends BaseSchema {
  public async up() {
    this.schema.createTable('picks_sessions', (table) => {
      table.uuid('id').primary()
      // open → processing → completed | failed
      table.string('status', 20).notNullable().defaultTo('open')
      // Photos in the last quote (also the size of abandoned checkouts).
      table.integer('ordered_count').notNullable()
      // Photos paid for: only the first paid_count registered photos are judged.
      table.integer('paid_count').nullable()
      table.string('customer_email').nullable()
      table.timestamp('paid_at', { useTz: true }).nullable()
      table.timestamp('upload_completed_at', { useTz: true }).nullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('email_sent_at', { useTz: true }).nullable()
      table.text('error').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['status'])
      table.index(['created_at'])
    })

    this.schema.createTable('picks_photos', (table) => {
      table.bigIncrements('id')
      table
        .uuid('session_id')
        .notNullable()
        .references('id')
        .inTable('picks_sessions')
        .onDelete('CASCADE')
      table.string('client_photo_id', 64).notNullable()
      table.string('r2_key', 255).notNullable()
      table.string('original_name', 255).notNullable()
      table.integer('width').notNullable()
      table.integer('height').notNullable()
      // pending → judged | failed
      table.string('status', 12).notNullable().defaultTo('pending')
      table.smallint('attempts').notNullable().defaultTo(0)
      table.jsonb('scores').nullable()
      table.text('critique').nullable()
      // null = not classified; [] = classified, fits no genre
      table.jsonb('genres').nullable()
      table.timestamp('judged_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      table.unique(['session_id', 'client_photo_id'])
      table.index(['session_id', 'status'])
      table.index(['session_id', 'judged_at'])
    })

    this.schema.createTable('picks_payments', (table) => {
      table.increments('id')
      table
        .uuid('session_id')
        .notNullable()
        .references('id')
        .inTable('picks_sessions')
        .onDelete('CASCADE')
      table.string('stripe_payment_intent_id').nullable().unique()
      table.string('stripe_customer_id').nullable()
      table.string('customer_email').nullable()
      table.integer('photo_count').notNullable()
      table.decimal('amount_eur', 10, 2).notNullable()
      // pending | completed | failed
      table.string('status', 20).notNullable().defaultTo('pending')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['session_id'])
      table.index(['status', 'created_at'])
    })

    this.schema.createTable('picks_cost_logs', (table) => {
      table.increments('id')
      table
        .uuid('session_id')
        .notNullable()
        .references('id')
        .inTable('picks_sessions')
        .onDelete('CASCADE')
      table.string('model', 64).notNullable()
      // scores | genres
      table.string('task', 32).notNullable()
      table.integer('photos').notNullable()
      table.decimal('cost_in_eur', 12, 6).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      table.index(['session_id'])
    })
  }

  public async down() {
    this.schema.dropTable('picks_cost_logs')
    this.schema.dropTable('picks_payments')
    this.schema.dropTable('picks_photos')
    this.schema.dropTable('picks_sessions')
  }
}
