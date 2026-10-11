import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { app, BrowserWindow, dialog, Menu, safeStorage, session, shell } from 'electron'
import { LocalPostgres } from './postgres.mjs'
import { startApi, readEnvFile, WEB_PORT } from './api.mjs'
import { serveWeb } from './static.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dev = !app.isPackaged
const repoRoot = path.resolve(here, '../..')

const paths = {
  pgBin: dev ? path.resolve(here, '../resources/postgres/bin') : path.join(process.resourcesPath, 'postgres', 'bin'),
  api: dev ? path.join(repoRoot, 'api', 'build') : path.join(process.resourcesPath, 'api.asar'),
  web: dev ? path.join(repoRoot, 'web', 'dist') : path.join(process.resourcesPath, 'web'),
  data: dev ? path.join(repoRoot, 'data', 'runtime') : app.getPath('userData'),
  extraEnv: dev
    ? path.resolve(here, '../.env.local')
    : [path.join(process.resourcesPath, 'app.env'), path.join(app.getPath('userData'), '.env.local')],
}

const log = (line) => {
  console.log(line)
  fs.appendFileSync(path.join(paths.data, 'desktop.log'), `${new Date().toISOString()} ${line}\n`)
}

// Dos instancias pelearían por la misma carpeta de datos de Postgres.
if (!app.requestSingleInstanceLock()) app.quit()

let postgres
let api
let webServer
let mainWindow

// Clave con la que la API cifra el token de la nube. Se guarda protegida con el cifrado del
// usuario de Windows (DPAPI vía safeStorage), así que otra cuenta del equipo no puede leerla.
function secretKey() {
  const file = path.join(paths.data, 'secret.key')
  if (fs.existsSync(file)) return safeStorage.decryptString(fs.readFileSync(file))
  if (!safeStorage.isEncryptionAvailable()) throw new Error('El cifrado del sistema no está disponible')
  const key = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(file, safeStorage.encryptString(key))
  return key
}

async function boot() {
  fs.mkdirSync(paths.data, { recursive: true })
  const started = Date.now()

  postgres = new LocalPostgres({ binDir: paths.pgBin, dataRoot: paths.data, log })
  const db = await postgres.start()
  api = await startApi({ apiDir: paths.api, dataRoot: paths.data, db, secretKey: secretKey(), extraEnvFile: paths.extraEnv, log })
  webServer = await serveWeb({ webDir: paths.web, port: WEB_PORT })

  log(`[desktop] todo listo en ${Date.now() - started} ms`)
}

// Fase 0: el worker de imágenes solo sirve a peticiones con Referer de photoreka.com.
// Pendiente: añadir el origen del escritorio a su lista y quitar esto.
function allowImagesWorker() {
  const worker = readEnvFile(paths.extraEnv).IMAGES_WORKER
  if (!worker) return
  const host = worker.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`https://${host}/*`] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, Referer: 'https://app.photoreka.com/' } })
  })
}

// Solo en desarrollo: si no hay sesión, entra con el token de scripts/dev-token.mjs (catálogo importado).
function useDevToken() {
  const file = path.join(paths.data, 'dev-token.txt')
  if (!dev || !fs.existsSync(file)) return
  const token = fs.readFileSync(file, 'utf8').trim()
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(
      `if (!localStorage.getItem('auth_token')) { localStorage.setItem('auth_token', ${JSON.stringify(token)}); location.replace('/') }`
    )
  })
}

// Solo en desarrollo: crear data/runtime/capture.request guarda en window.png lo que muestra la
// ventana (solo su contenido, sin capturar la pantalla).
function watchCaptureRequests() {
  if (!dev) return
  const request = path.join(paths.data, 'capture.request')
  setInterval(async () => {
    if (!fs.existsSync(request) || !mainWindow) return
    fs.rmSync(request, { force: true })
    const image = await mainWindow.webContents.capturePage()
    fs.writeFileSync(path.join(paths.data, 'window.png'), image.toPNG())
  }, 1000)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Photoreka',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${WEB_PORT}`)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  useDevToken()
  mainWindow.loadURL(`http://127.0.0.1:${WEB_PORT}/`)
}

// Sin el menú por defecto de Electron (File, Edit, View...).
Menu.setApplicationMenu(null)

app.whenReady().then(async () => {
  try {
    allowImagesWorker()
    await boot()
    createWindow()
    watchCaptureRequests()
  } catch (error) {
    log(`[desktop] error al arrancar: ${error.stack || error.message}`)
    dialog.showErrorBox('Photoreka no pudo arrancar', `${error.message}\n\nRegistro: ${paths.data}`)
    await shutdown()
    app.exit(1)
  }
})

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  webServer?.close()
  await api?.stop()
  await postgres?.stop()
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', async (event) => {
  if (shuttingDown) return
  event.preventDefault()
  await shutdown()
  app.exit(0)
})
