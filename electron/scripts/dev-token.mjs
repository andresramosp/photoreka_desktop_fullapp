// Desarrollo: crea un token de sesión para el usuario de la base local de pruebas y lo guarda
// en data/runtime/dev-token.txt, que la ventana de Electron usa en modo desarrollo para entrar.
// Mismo formato que @adonisjs/auth: oat_<id en base64url>.<secreto en base64url>, y en la
// base solo el sha256 del secreto.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { LocalPostgres } from '../src/postgres.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../../api/package.json'))
const { Client } = require('pg')
const DATA_ROOT = path.resolve(here, '../../data/runtime')

const pg = new LocalPostgres({ binDir: path.resolve(here, '../resources/postgres/bin'), dataRoot: DATA_ROOT, log: () => {} })
const db = await pg.start()
const client = new Client(db)
await client.connect()
try {
  const user = (await client.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0]
  if (!user) throw new Error('La base local no tiene usuarios')
  const secret = crypto.randomBytes(30).toString('base64url')
  const hash = crypto.createHash('sha256').update(secret).digest('hex')
  const { rows } = await client.query(
    `INSERT INTO auth_access_tokens (tokenable_id, type, name, hash, abilities, created_at, updated_at, expires_at)
     VALUES ($1, 'auth_token', 'desktop-dev', $2, '["*"]', now(), now(), now() + interval '30 days') RETURNING id`,
    [user.id, hash]
  )
  const b64 = (s) => Buffer.from(s).toString('base64url')
  fs.writeFileSync(path.join(DATA_ROOT, 'dev-token.txt'), `oat_${b64(String(rows[0].id))}.${b64(secret)}`)
  console.log(`Token creado para el usuario ${user.id} en data/runtime/dev-token.txt`)
} finally {
  await client.end()
  await pg.stop()
}
