// Prepara en stage/ lo que el instalador lleva de la API: la compilación con solo sus
// dependencias de producción, empaquetada en api.asar, y los valores no secretos de .env.local como app.env.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import asar from '@electron/asar'

const here = path.dirname(fileURLToPath(import.meta.url))

// Herramientas de compilación que @adonisjs/core trae como dependencia; solo las usan los
// comandos build/serve/test, y las importa de forma opcional.
const BUILD_ONLY_PACKAGES = ['typescript', '@adonisjs/assembler', '@poppinss/chokidar-ts']
// Archivos que nunca se ejecutan. Las licencias se conservan.
const JUNK_FILE = /\.(d\.ts|d\.mts|d\.cts|map|md|markdown)$/i
const JUNK_DIR = new Set(['test', 'tests', '__tests__', '.github', 'coverage', 'benchmark', 'benchmarks'])

function pruneNodeModules(root) {
  let files = 0
  let bytes = 0
  for (const name of BUILD_ONLY_PACKAGES) fs.rmSync(path.join(root, name), { recursive: true, force: true })
  const walk = (dir, depthInPackage) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') walk(full, -1)
        // Solo carpetas de tests/docs en la raíz de cada paquete, donde no hay código de ejecución.
        else if (depthInPackage === 0 && JUNK_DIR.has(entry.name)) fs.rmSync(full, { recursive: true, force: true })
        else walk(full, entry.name.startsWith('@') && depthInPackage === -1 ? -1 : depthInPackage + 1)
      } else if (JUNK_FILE.test(entry.name) && !/^licen[cs]e/i.test(entry.name)) {
        bytes += fs.statSync(full).size
        files++
        fs.rmSync(full)
      }
    }
  }
  walk(root, -1)
  console.log(`Poda: ${files} archivos y ${(bytes / 1048576).toFixed(0)} MB fuera, más ${BUILD_ONLY_PACKAGES.join(', ')}`)
}
const stage = path.resolve(here, '../stage')
const apiBuild = path.resolve(here, '../../api/build')

fs.rmSync(stage, { recursive: true, force: true })
fs.cpSync(apiBuild, path.join(stage, 'api'), {
  recursive: true,
  filter: (src) => !/[\\/](tests|node_modules)([\\/]|$)/.test(path.relative(apiBuild, src)),
})
execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: path.join(stage, 'api'), stdio: 'inherit' })
pruneNodeModules(path.join(stage, 'api', 'node_modules'))

// Un solo archivo en lugar de ~15.000: instalar y arrancar por primera vez es mucho más rápido
// porque Windows no abre ni analiza cada archivo. Los binarios nativos de sharp van fuera.
await asar.createPackageWithOptions(path.join(stage, 'api'), path.join(stage, 'api.asar'), { unpack: '**/@img/**' })

const envLocal = path.resolve(here, '../.env.local')
if (fs.existsSync(envLocal)) {
  const publicVars = fs.readFileSync(envLocal, 'utf8').split(/\r?\n/).filter((l) => /^IMAGES_WORKER=/.test(l))
  fs.writeFileSync(path.join(stage, 'app.env'), publicVars.join('\n') + '\n')
}
console.log(`API preparada en ${stage}`)
