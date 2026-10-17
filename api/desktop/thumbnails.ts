import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Miniaturas en el disco del usuario. Cada foto guarda su miniatura al importarla, con el mismo
 * nombre que su clave de R2; al terminar el análisis se borra de R2 y esta copia pasa a ser la
 * única. La API desktop la lee de aquí para pintarla y para mandarla a la API gateway.
 */

const THUMB_KEY = /^desktop\/thumbs\/(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/

export const MAX_THUMB_BYTES = 1024 * 1024

export const isThumbKey = (key: unknown): key is string => typeof key === 'string' && THUMB_KEY.test(key)

function thumbsDir() {
  return process.env.PHOTOREKA_THUMBS_DIR || path.join(process.cwd(), 'thumbs')
}

/** Ruta local de una miniatura; null si la clave no tiene el formato exacto (nunca sale de la carpeta). */
function thumbPath(key: string): string | null {
  const match = key.match(THUMB_KEY)
  return match ? path.join(thumbsDir(), match[1], match[2]) : null
}

export async function readLocalThumb(key: string): Promise<Buffer | null> {
  const file = thumbPath(key)
  if (!file) return null
  try {
    return await fs.readFile(file)
  } catch {
    return null
  }
}

export async function hasLocalThumb(key: string): Promise<boolean> {
  const file = thumbPath(key)
  if (!file) return false
  try {
    return (await fs.stat(file)).isFile()
  } catch {
    return false
  }
}

/** Tipo de imagen por sus primeros bytes; null si no es JPEG, PNG ni WebP. */
export function imageMimeType(data: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

/** Escribe la miniatura de forma atómica: nunca queda un archivo a medias con el nombre final. */
export async function writeLocalThumb(key: string, data: Buffer) {
  const file = thumbPath(key)
  if (!file) throw new Error('Clave de miniatura inválida')
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(temp, data)
  await fs.rename(temp, file)
}

export async function copyLocalThumb(from: string, to: string) {
  const source = thumbPath(from)
  const target = thumbPath(to)
  if (!source || !target) throw new Error('Clave de miniatura inválida')
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(source, target)
}

export async function deleteLocalThumbs(keys: string[]) {
  for (const key of keys) {
    const file = thumbPath(key)
    if (file) await fs.rm(file, { force: true })
  }
}

/** Descarga de R2 la miniatura y la guarda en el disco, si aún no está. */
export async function ensureLocalThumb(key: string): Promise<boolean> {
  if (await hasLocalThumb(key)) return true
  if (!isThumbKey(key) || !process.env.IMAGES_WORKER) return false
  try {
    const response = await fetch(`https://${process.env.IMAGES_WORKER}/${key}`, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return false
    const data = Buffer.from(await response.arrayBuffer())
    if (!imageMimeType(data)) return false
    await writeLocalThumb(key, data)
    return true
  } catch {
    return false
  }
}

/** La miniatura en base64 para mandarla a la API gateway; null si no está ni en el disco ni en R2. */
export async function thumbBase64(key: string): Promise<string | null> {
  if (!(await ensureLocalThumb(key))) return null
  const data = await readLocalThumb(key)
  return data ? data.toString('base64') : null
}

// La imagen la pide un <img>, que no lleva el token de sesión; la firma impide que otra página
// abierta en el equipo recorra las miniaturas.
function signature(key: string) {
  return crypto
    .createHmac('sha256', process.env.APP_KEY ?? '')
    .update(`thumb:${key}`)
    .digest('hex')
    .slice(0, 32)
}

export function localThumbUrl(key: string) {
  return `http://127.0.0.1:${process.env.PORT}/api/${key}?s=${signature(key)}`
}

export function isValidThumbSignature(key: string, given: unknown) {
  if (typeof given !== 'string') return false
  const expected = Buffer.from(signature(key))
  const actual = Buffer.from(given)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
