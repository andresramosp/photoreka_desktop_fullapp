// Compila la web apuntando a la API local del escritorio.
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { API_PORT } from '../src/api.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.resolve(here, '../../web')
const api = `http://127.0.0.1:${API_PORT}`

execSync('npx vite build', {
  cwd: webDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_MAIN_API_BASE_URL: api,
    VITE_ANALYZER_API_BASE_URL: api,
    VITE_API_URL: api,
    VITE_ANALYZER_WS_URL: `ws://127.0.0.1:${API_PORT}`,
    VITE_API_WS_URL: `ws://127.0.0.1:${API_PORT}`,
    VITE_MAINTENANCE_MODE: 'false',
    VITE_UPLOAD_FORMAT: 'webp',
    VITE_MIN_PHOTOS_FIRST_ANALYSIS: '20',
    VITE_FIRST_ANALYSIS_MINIMUM_MODE: 'recommendation',
  },
})
