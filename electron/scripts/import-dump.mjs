// Fase 0: crea la base del escritorio con sus propias migraciones y le pasa, desde una copia
// de la base local (pg_dump -Fc), solo los datos de un usuario y solo de las tablas locales.
// Uso: node scripts/import-dump.mjs <ruta.dump> [userId]
// Sin userId se queda con el usuario que más fotos tiene.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { LocalPostgres } from '../src/postgres.mjs'
import { startApi } from '../src/api.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(here, '../resources/postgres/bin')
const DATA_ROOT = path.resolve(here, '../../data/runtime')
const API_DIR = path.resolve(here, '../../api/build')
const STAGING = 'staging_import'
const [dumpPath, userIdArg] = process.argv.slice(2)

if (!dumpPath || !fs.existsSync(dumpPath)) {
  console.error('Uso: node scripts/import-dump.mjs <ruta.dump> [userId]')
  process.exit(1)
}

const pg = new LocalPostgres({ binDir: BIN, dataRoot: DATA_ROOT, log: () => {} })
const db = await pg.start()
// UTF8 explícito: en Windows psql usaría la página de códigos de la consola y el texto con
// caracteres fuera de ella (emojis, japonés...) se corrompería o haría fallar la copia.
const env = { ...process.env, PGPASSWORD: db.password, PGCLIENTENCODING: 'UTF8' }
const conn = ['-h', '127.0.0.1', '-p', String(db.port), '-U', db.user]

const psql = (sql, database = db.database) =>
  execFileSync(path.join(BIN, 'psql.exe'), [...conn, '-d', database, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).toString().trim()

const step = async (label, fn) => {
  const t = Date.now()
  const result = await fn()
  console.log(`${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`)
  return result
}

// Copia filas entre las dos bases con COPY en streaming, sin ficheros intermedios.
function pipeCopy(selectSql, table, columns) {
  return new Promise((resolve, reject) => {
    const out = spawn(path.join(BIN, 'psql.exe'), [...conn, '-d', STAGING, '-v', 'ON_ERROR_STOP=1', '-c', `COPY (${selectSql}) TO STDOUT`], { env, windowsHide: true })
    const into = spawn(path.join(BIN, 'psql.exe'), [...conn, '-d', db.database, '-v', 'ON_ERROR_STOP=1', '-c', `COPY ${table} (${columns}) FROM STDIN`], { env, windowsHide: true })
    let errors = ''
    out.stderr.on('data', (d) => (errors += d))
    into.stderr.on('data', (d) => (errors += d))
    out.stdout.pipe(into.stdin)
    let pending = 2
    const done = (code) => {
      if (code !== 0) return reject(new Error(`COPY ${table}: ${errors.trim()}`))
      if (--pending === 0) resolve()
    }
    out.once('exit', done)
    into.once('exit', done)
  })
}

const columnsOf = (table, database) =>
  psql(`SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}'`, database)
    .split(',')
    .filter(Boolean)

// Orden de dependencias y filtro de filas de cada tabla local. :uid = id del usuario.
const userPhotos = 'SELECT id FROM photos WHERE user_id = :uid'
const TABLES = [
  ['users', 'id = :uid'],
  ['auth_access_tokens', 'tokenable_id = :uid'],
  ['analyzer_processes', `user_id = :uid OR id IN (SELECT analyzer_process_id FROM photos WHERE user_id = :uid)`],
  ['geocode_cache', 'id IN (SELECT inferred_location_id FROM photos WHERE user_id = :uid)'],
  ['photos', 'user_id = :uid'],
  ['detections_photos', `photo_id IN (${userPhotos})`],
  ['tags', `id IN (SELECT tag_id FROM tags_photos WHERE photo_id IN (${userPhotos}))`],
  ['tags_photos', `photo_id IN (${userPhotos})`],
  ['descriptions_chunks', `photo_id IN (${userPhotos})`],
  ['collection_sets', 'user_id = :uid'],
  ['collections', 'user_id = :uid'],
  ['collection_photos', 'collection_id IN (SELECT id FROM collections WHERE user_id = :uid)'],
  ['series_sets', 'user_id = :uid'],
  ['series', 'user_id = :uid'],
  ['series_photos', 'series_id IN (SELECT id FROM series WHERE user_id = :uid)'],
  ['conversations', 'user_id = :uid'],
  ['conversation_messages', 'conversation_id IN (SELECT id FROM conversations WHERE user_id = :uid)'],
  ['canvases', 'user_id = :uid'],
  ['portfolio_build_sets', 'user_id = :uid'],
  ['portfolio_builds', 'user_id = :uid'],
  ['cache_invalidation_watermarks', 'user_id = :uid'],
  ['cost_logs', 'user_id = :uid'],
  ['public_items', 'user_id = :uid'],
]

try {
  await step('Bases vacías', () => {
    psql(`DROP DATABASE IF EXISTS ${db.database} WITH (FORCE)`, 'postgres')
    psql(`DROP DATABASE IF EXISTS ${STAGING} WITH (FORCE)`, 'postgres')
    psql(`CREATE DATABASE ${db.database}`, 'postgres')
    psql(`CREATE DATABASE ${STAGING}`, 'postgres')
  })

  await step('Esquema del escritorio (migraciones propias)', async () => {
    const api = await startApi({ apiDir: API_DIR, dataRoot: DATA_ROOT, db, log: () => {} })
    await api.stop()
    console.log(`  ${psql('SELECT count(*) FROM adonis_schema')} migraciones aplicadas`)
  })

  // Sin índices ni claves en la base auxiliar: solo se lee una vez.
  await step('Copia completa en la base auxiliar', () => {
    execFileSync(path.join(BIN, 'pg_restore.exe'), [...conn, '-d', STAGING, '--no-owner', '--no-acl', '--section=pre-data', '--section=data', '-j', '4', dumpPath], { env, stdio: ['ignore', 'inherit', 'inherit'] })
  })

  const userId = Number(userIdArg) || Number(psql('SELECT user_id FROM photos WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY count(*) DESC LIMIT 1', STAGING))
  console.log(`Usuario: ${userId} (${psql(`SELECT count(*) FROM photos WHERE user_id = ${userId}`, STAGING)} fotos)`)

  // Los índices HNSW se quitan durante la carga y se rehacen al final: construirlos de una vez
  // es mucho más rápido que mantenerlos fila a fila.
  const hnswIndexes = psql(`SELECT indexname || '|' || indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexdef ILIKE '%USING hnsw%'`)
    .split('\n').filter(Boolean).map((row) => row.split('|'))
  for (const [name] of hnswIndexes) psql(`DROP INDEX ${name}`)

  await step('Datos del usuario a la base del escritorio', async () => {
    for (const [table, filter] of TABLES) {
      const target = columnsOf(table, db.database)
      const source = new Set(columnsOf(table, STAGING))
      const common = target.filter((c) => source.has(c))
      const missing = target.filter((c) => !source.has(c))
      const extra = [...source].filter((c) => !target.includes(c))
      if (missing.length) console.log(`  ${table}: columnas sin origen, quedan por defecto: ${missing.join(', ')}`)
      // Columnas de la base local que ninguna migración crea: deriva entre la base y el código.
      if (extra.length) console.log(`  ${table}: columnas de la copia que no están en las migraciones: ${extra.join(', ')}`)
      const cols = common.map((c) => `"${c}"`).join(',')
      const t = Date.now()
      await pipeCopy(`SELECT ${cols} FROM ${table} WHERE ${filter.replaceAll(':uid', String(userId))}`, table, cols)
      const count = psql(`SELECT count(*) FROM ${table}`)
      console.log(`  ${table}: ${count} filas (${((Date.now() - t) / 1000).toFixed(1)} s)`)
    }
  })

  await step('Índices HNSW', () => {
    for (const [, definition] of hnswIndexes) psql(`SET maintenance_work_mem = '512MB'; ${definition}`)
  })

  await step('Secuencias de ids', () => {
    for (const [table] of TABLES) {
      if (!columnsOf(table, db.database).includes('id')) continue
      psql(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT COALESCE(max(id), 0) FROM ${table}), 1))`)
    }
  })

  await step('Borrar la base auxiliar', () => psql(`DROP DATABASE ${STAGING} WITH (FORCE)`, 'postgres'))
  await step('VACUUM ANALYZE', () => psql('VACUUM ANALYZE'))

  console.log('\nTamaños:')
  console.log(psql(`
    SELECT relname || ': ' || pg_size_pretty(pg_total_relation_size(oid)) || ' (' || reltuples::bigint || ' filas)'
    FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
    ORDER BY pg_total_relation_size(oid) DESC LIMIT 10`))
  console.log(`Base completa: ${psql(`SELECT pg_size_pretty(pg_database_size('${db.database}'))`)}`)
} finally {
  await pg.stop()
}
