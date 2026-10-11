import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const DB_USER = 'photoreka'
const DB_NAME = 'photoreka'

function freePort(preferred) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => {
      const fallback = net.createServer()
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address()
        fallback.close(() => resolve(port))
      })
    })
    server.listen(preferred, '127.0.0.1', () => server.close(() => resolve(preferred)))
  })
}

// Postgres en Windows abre rutas con la página de códigos ANSI: un carácter que no exista en
// ella (p. ej. "Ł" en un Windows en español, o japonés) llega como "?". Si la ruta no es ASCII,
// se usa su nombre corto 8.3, que Windows mantiene en ASCII.
function ansiSafePath(dir) {
  if (/^[\x00-\x7F]*$/.test(dir)) return dir
  fs.mkdirSync(dir, { recursive: true })
  const short = execFileSync('cmd.exe', ['/d', '/c', `for %I in ("${dir}") do @echo %~sI`], { windowsVerbatimArguments: true })
    .toString()
    .trim()
  if (!/^[\x00-\x7F]+$/.test(short)) {
    throw new Error(`La carpeta ${dir} tiene caracteres que la base de datos no admite y este disco no genera nombres cortos.`)
  }
  return short
}

export class LocalPostgres {
  constructor({ binDir, dataRoot: dataRootInput, log = console.log }) {
    const dataRoot = ansiSafePath(path.resolve(dataRootInput))
    this.binDir = ansiSafePath(path.resolve(binDir))
    this.dataDir = path.join(dataRoot, 'pgdata')
    this.logFile = path.join(dataRoot, 'postgres.log')
    this.secretsFile = path.join(dataRoot, 'postgres.json')
    this.log = log
  }

  exe(name) {
    return path.join(this.binDir, `${name}.exe`)
  }

  readSecrets() {
    if (fs.existsSync(this.secretsFile)) return JSON.parse(fs.readFileSync(this.secretsFile, 'utf8'))
    const secrets = { password: crypto.randomBytes(24).toString('hex') }
    fs.mkdirSync(path.dirname(this.secretsFile), { recursive: true })
    fs.writeFileSync(this.secretsFile, JSON.stringify(secrets))
    return secrets
  }

  async init() {
    if (fs.existsSync(path.join(this.dataDir, 'PG_VERSION'))) return false
    const { password } = this.readSecrets()
    const pwFile = path.join(path.dirname(this.dataDir), 'pw.tmp')
    fs.writeFileSync(pwFile, password)
    try {
      // Locale C: evita depender de la configuración regional de Windows del usuario.
      await run(this.exe('initdb'), [
        '-D', this.dataDir,
        '-U', DB_USER,
        `--pwfile=${pwFile}`,
        '-A', 'scram-sha-256',
        '-E', 'UTF8',
        '--locale=C',
      ])
    } finally {
      fs.rmSync(pwFile, { force: true })
    }
    return true
  }

  async isRunning() {
    try {
      await run(this.exe('pg_ctl'), ['status', '-D', this.dataDir])
      return true
    } catch {
      return false
    }
  }

  async start() {
    const created = await this.init()
    // Una instancia que quedó viva tras un cierre brusco se para antes de arrancar otra.
    if (await this.isRunning()) await this.stop()

    this.port = await freePort(54329)
    const options = [
      `-p ${this.port}`,
      '-c listen_addresses=127.0.0.1',
      '-c max_connections=60',
      '-c shared_buffers=256MB',
    ].join(' ')
    const started = Date.now()
    await this.pgCtlStart(options)
    this.log(`[postgres] arrancado en el puerto ${this.port} en ${Date.now() - started} ms${created ? ' (base nueva)' : ''}`)

    await this.ensureDatabase()
    return this.connection()
  }

  // En Windows, postgres hereda las tuberías de pg_ctl y las mantiene abiertas: execFile
  // no resolvería nunca. Sin tuberías y esperando a la salida de pg_ctl, sí.
  pgCtlStart(options) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.exe('pg_ctl'),
        ['start', '-w', '-t', '60', '-D', this.dataDir, '-l', this.logFile, '-o', options],
        { stdio: 'ignore', windowsHide: true }
      )
      child.once('error', reject)
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`pg_ctl start terminó con código ${code}; ver ${this.logFile}`))
      )
    })
  }

  async ensureDatabase() {
    const { password } = this.readSecrets()
    const env = { ...process.env, PGPASSWORD: password }
    const base = ['-h', '127.0.0.1', '-p', String(this.port), '-U', DB_USER, '-d', 'postgres', '-tAc']
    const { stdout } = await run(this.exe('psql'), [...base, `SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`], { env })
    if (stdout.trim() !== '1') {
      await run(this.exe('psql'), [...base, `CREATE DATABASE ${DB_NAME}`], { env })
      this.log(`[postgres] base de datos ${DB_NAME} creada`)
    }
  }

  connection() {
    const { password } = this.readSecrets()
    return { host: '127.0.0.1', port: this.port, user: DB_USER, password, database: DB_NAME }
  }

  async stop() {
    try {
      await run(this.exe('pg_ctl'), ['stop', '-D', this.dataDir, '-m', 'fast', '-w', '-t', '30'])
      this.log('[postgres] parado')
    } catch (error) {
      this.log(`[postgres] no se pudo parar limpiamente: ${error.message}`)
    }
  }
}
