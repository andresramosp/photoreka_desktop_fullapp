// Fase 0: mide en la base del escritorio las consultas vectoriales que hace la API
// (vector_service.ts), sin índices HNSW y con ellos, y la memoria de Postgres.
// Uso: node scripts/bench-db.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { LocalPostgres } from '../src/postgres.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../../api/package.json'))
const { Pool } = require('pg')

const BIN = path.resolve(here, '../resources/postgres/bin')
const DATA_ROOT = path.resolve(here, '../../data/runtime')
const WARM_RUNS = 7
const CONCURRENT = 15

const pgServer = new LocalPostgres({ binDir: BIN, dataRoot: DATA_ROOT, log: () => {} })

function postgresMemoryMb() {
  const pid = Number(fs.readFileSync(path.join(DATA_ROOT, 'pgdata', 'postmaster.pid'), 'utf8').split(/\r?\n/)[0])
  const script = `$p = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or $_.ParentProcessId -eq ${pid} }; "{0}|{1}|{2}" -f ($p | Measure-Object WorkingSetSize -Sum).Sum, ($p | Measure-Object PrivatePageCount -Sum).Sum, $p.Count`
  const [ws, priv, count] = execFileSync('powershell.exe', ['-NoProfile', '-Command', script]).toString().trim().split('|').map(Number)
  return { workingSetMb: Math.round(ws / 1048576), privateMb: Math.round(priv / 1048576), processes: count }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function timed(pool, sql, params) {
  const t = performance.now()
  const res = await pool.query(sql, params)
  return { ms: performance.now() - t, rows: res.rowCount }
}

const QUERIES = {
  'Descripciones (búsqueda semántica)': {
    vector: 'chunk',
    sql: `SELECT id, photo_id, chunk, proximity FROM (
            SELECT id, photo_id, chunk, 1 - (embedding <=> $1) AS proximity
            FROM descriptions_chunks WHERE photo_id = ANY($2)
            ORDER BY embedding <=> $1 ASC LIMIT 2000) sub
          WHERE proximity >= 0.3 ORDER BY proximity DESC LIMIT 100`,
  },
  'Tags (búsqueda por tags)': {
    vector: 'tag',
    sql: `WITH similar_tags AS (
            SELECT id AS tag_id, name, "group", 1 - (embedding <=> $1) AS proximity
            FROM tags ORDER BY embedding <=> $1 ASC LIMIT 2000)
          SELECT DISTINCT tags_photos.id, similar_tags.tag_id, similar_tags.name, tags_photos.photo_id,
                 tags_photos.category, similar_tags.proximity
          FROM tags_photos
          JOIN similar_tags ON similar_tags.tag_id = tags_photos.tag_id
          JOIN photos ON photos.id = tags_photos.photo_id
          WHERE photos.deleted_at IS NULL AND similar_tags.proximity >= 0.3 AND photos.id = ANY($2)
          ORDER BY similar_tags.proximity DESC LIMIT 100`,
  },
  'Fotos parecidas (CLIP)': {
    vector: 'photo',
    sql: `SELECT id, proximity FROM (
            SELECT photos.id, 1 - (photos.embedding <=> $1) AS proximity
            FROM photos WHERE photos.deleted_at IS NULL AND photos.id = ANY($2)
            ORDER BY photos.embedding <=> $1 ASC LIMIT 2000) sub
          WHERE proximity >= 0.2 ORDER BY proximity DESC LIMIT 100`,
  },
  'Emparejar un tag nuevo (análisis)': {
    vector: 'tag',
    noPhotoIds: true,
    sql: `SELECT id, 1 - (embedding <=> $1) AS proximity FROM tags ORDER BY embedding <=> $1 LIMIT 5`,
  },
}

async function samples(pool) {
  const pick = async (sql) => (await pool.query(sql)).rows.map((r) => r.v)
  return {
    chunk: await pick(`SELECT embedding::text AS v FROM descriptions_chunks WHERE embedding IS NOT NULL ORDER BY random() LIMIT ${WARM_RUNS + 1}`),
    tag: await pick(`SELECT embedding::text AS v FROM tags WHERE embedding IS NOT NULL ORDER BY random() LIMIT ${Math.max(WARM_RUNS + 1, CONCURRENT)}`),
    photo: await pick(`SELECT embedding::text AS v FROM photos WHERE embedding IS NOT NULL ORDER BY random() LIMIT ${WARM_RUNS + 1}`),
    photoIds: (await pool.query('SELECT array_agg(id) AS ids FROM photos WHERE deleted_at IS NULL')).rows[0].ids,
  }
}

function newPool() {
  const db = pgServer.connection()
  const pool = new Pool({ ...db, max: CONCURRENT + 1 })
  // Los mismos ajustes que pone la API en cada conexión (config/database.ts).
  pool.on('connect', (client) => client.query('SET hnsw.iterative_scan = relaxed_order; SET hnsw.max_scan_tuples = 100000'))
  return pool
}

async function runSuite(label, { cold }) {
  const results = {}
  if (cold) {
    await pgServer.stop()
    await pgServer.start()
  }
  const pool = newPool()
  const s = await samples(pool)
  for (const [name, q] of Object.entries(QUERIES)) {
    const params = (v) => (q.noPhotoIds ? [v] : [v, s.photoIds])
    const vectors = s[q.vector]
    const first = await timed(pool, q.sql, params(vectors[0]))
    const warm = []
    for (let i = 1; i <= WARM_RUNS; i++) warm.push((await timed(pool, q.sql, params(vectors[i % vectors.length]))).ms)
    results[name] = { first: first.ms, warm: median(warm), rows: first.rows }
  }
  const burstStart = performance.now()
  await Promise.all(s.tag.slice(0, CONCURRENT).map((v) => pool.query(QUERIES['Emparejar un tag nuevo (análisis)'].sql, [v])))
  results[`${CONCURRENT} emparejamientos a la vez`] = { warm: performance.now() - burstStart }
  const memory = postgresMemoryMb()
  await pool.end()
  console.log(`\n== ${label}`)
  for (const [name, r] of Object.entries(results)) {
    const first = r.first !== undefined ? `primera ${r.first.toFixed(0)} ms, ` : ''
    console.log(`  ${name}: ${first}mediana ${r.warm.toFixed(0)} ms${r.rows !== undefined ? ` (${r.rows} filas)` : ''}`)
  }
  console.log(`  Memoria de Postgres: ${memory.workingSetMb} MB en uso (${memory.privateMb} MB privados, ${memory.processes} procesos)`)
  return { results, memory }
}

await pgServer.start()
try {
  const admin = newPool()
  const counts = (await admin.query(`SELECT
      (SELECT count(*) FROM photos) AS fotos,
      (SELECT count(*) FROM tags) AS tags,
      (SELECT count(*) FROM tags_photos) AS tags_fotos,
      (SELECT count(*) FROM descriptions_chunks) AS fragmentos,
      pg_size_pretty(pg_database_size(current_database())) AS tamano`)).rows[0]
  console.log('Catálogo:', counts)
  await admin.query('DROP INDEX IF EXISTS bench_tags_hnsw, bench_chunks_hnsw, bench_photos_hnsw')
  await admin.end()

  await runSuite('Sin HNSW, Postgres recién arrancado', { cold: true })
  await runSuite('Sin HNSW, en caliente', { cold: false })

  const build = newPool()
  await build.query("SET maintenance_work_mem = '512MB'")
  for (const [index, table, column] of [['bench_tags_hnsw', 'tags', 'embedding'], ['bench_chunks_hnsw', 'descriptions_chunks', 'embedding'], ['bench_photos_hnsw', 'photos', 'embedding']]) {
    const t = performance.now()
    await build.query(`CREATE INDEX ${index} ON ${table} USING hnsw (${column} vector_cosine_ops)`)
    const size = (await build.query(`SELECT pg_size_pretty(pg_relation_size('${index}')) AS s`)).rows[0].s
    console.log(`Índice HNSW de ${table}: ${((performance.now() - t) / 1000).toFixed(1)} s, ${size}`)
  }
  await build.end()

  await runSuite('Con HNSW, Postgres recién arrancado', { cold: true })
  await runSuite('Con HNSW, en caliente', { cold: false })

  // La base queda como la dejan las migraciones del escritorio.
  const cleanup = newPool()
  await cleanup.query('DROP INDEX IF EXISTS bench_tags_hnsw, bench_chunks_hnsw, bench_photos_hnsw')
  await cleanup.end()
} finally {
  await pgServer.stop()
}
