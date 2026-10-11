// Prepara en stage/ lo que el instalador lleva de la API: la compilación con solo sus
// dependencias de producción, y los valores no secretos de .env.local como app.env.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const stage = path.resolve(here, '../stage')
const apiBuild = path.resolve(here, '../../api/build')

fs.rmSync(stage, { recursive: true, force: true })
fs.cpSync(apiBuild, path.join(stage, 'api'), {
  recursive: true,
  filter: (src) => !/[\\/](tests|node_modules)([\\/]|$)/.test(path.relative(apiBuild, src)),
})
execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: path.join(stage, 'api'), stdio: 'inherit' })

const envLocal = path.resolve(here, '../.env.local')
if (fs.existsSync(envLocal)) {
  const publicVars = fs.readFileSync(envLocal, 'utf8').split(/\r?\n/).filter((l) => /^IMAGES_WORKER=/.test(l))
  fs.writeFileSync(path.join(stage, 'app.env'), publicVars.join('\n') + '\n')
}
console.log(`API preparada en ${stage}`)
