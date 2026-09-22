import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * descriptions_chunks only had its primary key. Every lookup of a photo's chunks for one
 * category (the atlas, the canvas clustering, the search engine) was a sequential scan over
 * the whole table: ~800k rows and ~1.5 GB of heap per query, twice per request.
 *
 * CONCURRENTLY so a deploy does not lock writes while the index builds, which is why the
 * migration runs outside a transaction.
 */
export default class extends BaseSchema {
  static disableTransactions = true

  public async up() {
    this.schema.raw(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS descriptions_chunks_photo_id_category_index ON descriptions_chunks (photo_id, category)'
    )
  }

  public async down() {
    this.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS descriptions_chunks_photo_id_category_index')
  }
}
