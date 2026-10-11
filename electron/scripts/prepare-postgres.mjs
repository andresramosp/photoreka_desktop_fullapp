// Copia a resources/postgres lo mínimo para ejecutar Postgres + pgvector dentro de la app.
// Fase 0: el origen es una instalación local de Postgres 16 (EDB) que ya trae pgvector.
// Para distribuir, el origen serán los binarios oficiales con pgvector compilado en CI.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = process.env.PG_SOURCE || 'C:/Program Files/PostgreSQL/16'
const target = path.resolve(here, '../resources/postgres')

const BIN_EXES = ['postgres.exe', 'initdb.exe', 'pg_ctl.exe', 'psql.exe', 'pg_dump.exe', 'pg_restore.exe', 'pg_isready.exe']
// Runtime de Visual C++: en un Windows limpio puede faltar, así que viaja junto a postgres.exe.
const VC_RUNTIME = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

if (!fs.existsSync(path.join(source, 'lib', 'vector.dll'))) {
  console.error(`No encuentro pgvector en ${source}/lib/vector.dll`)
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })

const binSrc = path.join(source, 'bin')
for (const name of fs.readdirSync(binSrc)) {
  const isDll = name.toLowerCase().endsWith('.dll') && !name.startsWith('wx')
  if (isDll || BIN_EXES.includes(name)) copyFile(path.join(binSrc, name), path.join(target, 'bin', name))
}
for (const name of VC_RUNTIME) {
  const from = path.join('C:/Windows/System32', name)
  if (fs.existsSync(from)) copyFile(from, path.join(target, 'bin', name))
}

const libSrc = path.join(source, 'lib')
for (const name of fs.readdirSync(libSrc)) {
  if (name.toLowerCase().endsWith('.dll')) copyFile(path.join(libSrc, name), path.join(target, 'lib', name))
}

fs.cpSync(path.join(source, 'share'), path.join(target, 'share'), { recursive: true })

console.log(`Postgres preparado en ${target}`)
