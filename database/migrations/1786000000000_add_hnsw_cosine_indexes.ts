import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Every similarity query orders by cosine distance (`<=>`), and pgvector only uses an index
 * built with the same operator class: an index without `vector_cosine_ops` defaults to L2 and
 * is silently ignored. These live in a migration so a rebuilt database gets them back.
 *
 * CONCURRENTLY so writes are not blocked while they build, hence no transaction.
 *
 * With the default 64MB of maintenance_work_mem the graph stops fitting after ~50k rows and
 * the build continues on disk several times slower (hours for descriptions_chunks). The
 * session-only SET keeps the build in memory; the server setting is untouched.
 *
 * A parallel build shares that memory through /dev/shm, which containers (Railway) cap far
 * below it and the build fails with "could not resize shared memory segment". A single
 * process keeps the graph in its own memory instead.
 */
export default class extends BaseSchema {
  static disableTransactions = true

  public async up() {
    this.schema.raw('SET max_parallel_maintenance_workers = 0')
    this.schema.raw(`SET maintenance_work_mem = '1536MB'`)
    this.schema.raw(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_embedding_hnsw_cosine_idx ON tags USING hnsw (embedding vector_cosine_ops)'
    )
    this.schema.raw(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS photos_embedding_hnsw_cosine_idx ON photos USING hnsw (embedding vector_cosine_ops)'
    )
    this.schema.raw(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS descriptions_chunks_embedding_hnsw_cosine_idx ON descriptions_chunks USING hnsw (embedding vector_cosine_ops)'
    )
    this.schema.raw('RESET maintenance_work_mem')
    this.schema.raw('RESET max_parallel_maintenance_workers')
  }

  public async down() {
    this.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS descriptions_chunks_embedding_hnsw_cosine_idx')
    this.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS photos_embedding_hnsw_cosine_idx')
    this.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS tags_embedding_hnsw_cosine_idx')
  }
}
