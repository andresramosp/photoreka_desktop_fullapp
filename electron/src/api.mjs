import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'

export const API_PORT = 47821
export const WEB_PORT = 47820

// Variables opcionales (worker de imágenes y, en desarrollo, claves) en ficheros .env que git
// ignora: CLAVE=valor por línea. Con varios ficheros, los posteriores mandan.
export function readEnvFile(files) {
  const vars = {}
  for (const file of [files].flat()) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
  return vars
}

function appKey(dataRoot) {
  const file = path.join(dataRoot, 'app_key')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'))
  return fs.readFileSync(file, 'utf8').trim()
}

function waitForHttp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`La API no respondió en ${timeoutMs} ms`))
        else setTimeout(attempt, 300)
      })
    }
    attempt()
  })
}

// Direcciones públicas de la nube; un fichero .env puede cambiarlas (por ejemplo, a local).
const CLOUD_DEFAULTS = {
  PHOTOREKA_CLOUD_API: 'https://curatorlabapi-production.up.railway.app',
  PHOTOREKA_CLOUD_APP: 'https://app.photoreka.com',
  PHOTOREKA_GATEWAY: 'https://photorekagatewayapi-real.up.railway.app',
}

export async function startApi({ apiDir: apiDirInput, dataRoot, db, secretKey, modelsDir, extraEnvFile, log = console.log }) {
  const apiDir = path.resolve(apiDirInput)
  const env = {
    // Sin heredar process.env completo: la API solo ve lo que el escritorio le da.
    SystemRoot: process.env.SystemRoot,
    PATH: process.env.PATH,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PHOTOREKA_DESKTOP: '1',
    PORT: String(API_PORT),
    HOST: '127.0.0.1',
    APP_KEY: appKey(dataRoot),
    LOG_LEVEL: 'info',
    APP_NAME: 'photoreka-desktop',
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    DB_DATABASE: db.database,
    DB_POOL_MAX: '20',
    REDIS_URL: 'redis://memory',
    GOOGLE_CLIENT_ID: 'desktop',
    GOOGLE_CLIENT_SECRET: 'desktop',
    GOOGLE_OAUTH_REDIRECT_URI: `http://127.0.0.1:${API_PORT}/api/auth/google/callback`,
    FRONTEND_URL: `http://127.0.0.1:${WEB_PORT}`,
    DESKTOP_SECRET_KEY: secretKey,
    PHOTOREKA_MODELS_DIR: modelsDir,
    ...CLOUD_DEFAULTS,
    ...readEnvFile(extraEnvFile),
  }

  const started = Date.now()
  // cwd fuera de apiDir: dentro de un .asar no hay carpetas reales. Adonis localiza sus
  // archivos a partir de bin/server.js, no del directorio de trabajo.
  const child = spawn(process.execPath, [path.join(apiDir, 'bin', 'server.js')], {
    cwd: dataRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const logStream = fs.createWriteStream(path.join(dataRoot, 'api.log'), { flags: 'a' })
  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)
  // Al registro corto: el arranque y cada borrado de fotos (qué se borra y si falló).
  const summary = /Migraciones|Error ejecutando migraciones|started HTTP server|\[PhotoDeletion -> |\[PhotoManager -> ImmediateDelete\]|startup deletion/i
  const forward = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (summary.test(line)) log(`[api] ${line.trim().slice(0, 300)}`)
    }
  }
  child.stdout.on('data', forward)
  child.stderr.on('data', forward)

  const exited = new Promise((_, reject) =>
    child.once('exit', (code) => reject(new Error(`La API terminó con código ${code}; ver ${path.join(dataRoot, 'api.log')}`)))
  )
  await Promise.race([waitForHttp(API_PORT, 120000), exited])
  log(`[api] lista en el puerto ${API_PORT} en ${Date.now() - started} ms`)

  return {
    child,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve()
        child.once('exit', () => resolve())
        child.kill()
      }),
  }
}
