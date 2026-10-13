import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pLimit from 'p-limit'
import db from '@adonisjs/lucid/services/db'

/**
 * Originales en el disco del usuario, como en Lightroom: la foto guarda dónde estaba el archivo al
 * importarlo; el visor, las descargas y el reanálisis lo leen de ahí. R2 solo conserva la miniatura
 * (y la main hasta que termina el análisis).
 */

/** Los mismos formatos que acepta la importación. */
const ORIGINAL_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const SAMPLE_BYTES = 64 * 1024

// Lado largo de lo que se sirve al visor, Framer, atlas y PDF: algo más que la antigua main
// (1800 px) sin cargar en memoria fotos de 24 megapíxeles.
const VIEW_MAX_EDGE = 2048

// Igual que la main que sube la web (web/src/config/uploadConfig.js).
const MAIN_MAX_EDGE = 1800
const MAIN_MAX_BYTES = 512000

export type OriginalFile = { path: string; size: number; fingerprint: string }

/**
 * Huella del archivo: tamaño más los primeros y los últimos 64 KB. Es barata de calcular y basta
 * para reconocer el mismo archivo aunque se haya movido o renombrado.
 */
async function fingerprintFile(file: string, size: number): Promise<string> {
  const handle = await fs.open(file, 'r')
  try {
    const hash = crypto.createHash('sha256').update(`${size}:`)
    const head = Buffer.alloc(Math.min(SAMPLE_BYTES, size))
    await handle.read(head, 0, head.length, 0)
    hash.update(head)
    if (size > SAMPLE_BYTES) {
      const tail = Buffer.alloc(Math.min(SAMPLE_BYTES, size - SAMPLE_BYTES))
      await handle.read(tail, 0, tail.length, size - tail.length)
      hash.update(tail)
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

/** Ruta, tamaño y huella del original que indica la web al importar; null si no es una imagen accesible. */
export async function describeOriginal(input: unknown): Promise<OriginalFile | null> {
  if (typeof input !== 'string' || !path.isAbsolute(input)) return null
  if (!ORIGINAL_EXTENSIONS.has(path.extname(input).toLowerCase())) return null
  try {
    const stat = await fs.stat(input)
    if (!stat.isFile()) return null
    return { path: input, size: stat.size, fingerprint: await fingerprintFile(input, stat.size) }
  } catch {
    return null
  }
}

export async function originalStat(file: string | null | undefined) {
  if (!file) return null
  try {
    const stat = await fs.stat(file)
    return stat.isFile() ? stat : null
  } catch {
    return null
  }
}

// ─── URL local del original ──────────────────────────────────────────────────

// La imagen la pide un <img>, que no lleva el token de sesión; la firma impide que otra página
// abierta en el equipo recorra las fotos por id.
function signature(photoId: number) {
  return crypto
    .createHmac('sha256', process.env.APP_KEY ?? '')
    .update(`original:${photoId}`)
    .digest('hex')
    .slice(0, 32)
}

export function localOriginalUrl(photoId: number) {
  return `http://127.0.0.1:${process.env.PORT}/api/photos/${photoId}/original?s=${signature(photoId)}`
}

export function isValidOriginalSignature(photoId: number, given: unknown) {
  if (typeof given !== 'string') return false
  const expected = Buffer.from(signature(photoId))
  const actual = Buffer.from(given)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

// ─── Imágenes generadas a partir del original ────────────────────────────────

/** JPEG reducido y orientado para mostrar en la app. */
export function viewableOriginal(file: string): Promise<Buffer> {
  return sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: VIEW_MAX_EDGE, height: VIEW_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer()
}

/** Main para analizar, con el mismo tamaño y peso máximo que la que sube la web al importar. */
export async function mainFromOriginal(file: string, format: 'jpeg' | 'webp' | 'png'): Promise<Buffer> {
  const resized = sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: MAIN_MAX_EDGE, height: MAIN_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
  if (format === 'png') return resized.png().toBuffer()
  const step = format === 'webp' ? 7 : 10
  let quality = format === 'webp' ? 82 : 90
  for (;;) {
    const output = await resized.clone()[format]({ quality }).toBuffer()
    if (output.length <= MAIN_MAX_BYTES || quality - step < 30) return output
    quality -= step
  }
}

// ─── Originales que no se encuentran ─────────────────────────────────────────

type LinkedRow = { id: number; original_path: string; original_size: string | number; original_fingerprint: string }

async function missingOriginals(userId: number) {
  const rows: LinkedRow[] = await db
    .from('photos')
    .where('user_id', userId)
    .whereNull('deleted_at')
    .whereNotNull('original_path')
    .select('id', 'original_path', 'original_size', 'original_fingerprint')
  const limit = pLimit(32)
  const found = await Promise.all(rows.map((row) => limit(async () => (await originalStat(row.original_path)) !== null)))
  return { linked: rows.length, missing: rows.filter((_, i) => !found[i]) }
}

/** Cuántas fotos tienen original enlazado y cuántas de ellas no lo encuentran ahora. */
export async function originalsSummary(userId: number) {
  const { linked, missing } = await missingOriginals(userId)
  return { linked, missing: missing.length }
}

/**
 * Busca en una carpeta (y, si se pide, en sus subcarpetas) los originales que ya no están donde se
 * importaron: compara primero el tamaño y, si coincide, la huella. Devuelve cuántos encontró y
 * cuántos faltan.
 */
export async function locateOriginals(userId: number, folder: string, { recursive = true } = {}) {
  const { missing } = await missingOriginals(userId)
  const bySize = new Map<number, Map<string, number[]>>()
  for (const row of missing) {
    if (!row.original_fingerprint || row.original_size === null) continue
    const size = Number(row.original_size)
    const byFingerprint = bySize.get(size) ?? new Map<string, number[]>()
    byFingerprint.set(row.original_fingerprint, [...(byFingerprint.get(row.original_fingerprint) ?? []), row.id])
    bySize.set(size, byFingerprint)
  }

  let found = 0
  const pending = [folder]
  while (pending.length > 0 && bySize.size > 0) {
    const dir = pending.pop()!
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (recursive) pending.push(full)
        continue
      }
      if (!entry.isFile() || !ORIGINAL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      const stat = await originalStat(full)
      const candidates = stat ? bySize.get(stat.size) : undefined
      if (!stat || !candidates) continue
      const fingerprint = await fingerprintFile(full, stat.size).catch(() => '')
      const ids = candidates.get(fingerprint)
      if (!ids) continue
      await db.from('photos').whereIn('id', ids).update({ original_path: full })
      found += ids.length
      candidates.delete(fingerprint)
      if (candidates.size === 0) bySize.delete(stat.size)
    }
  }

  return { found, missing: missing.length - found }
}

/**
 * Enlaza la foto con el archivo que elige el usuario, solo si es el mismo original (misma huella).
 * Después busca en esa carpeta, sin bajar a subcarpetas, los demás originales perdidos: si se movió
 * una carpeta entera, se arreglan todos de una vez.
 */
export async function relinkOriginal(userId: number, photoId: number, file: unknown) {
  const photo = await db
    .from('photos')
    .where('id', photoId)
    .where('user_id', userId)
    .whereNull('deleted_at')
    .select('original_fingerprint')
    .first()
  if (!photo) return { status: 'not_found' as const }
  const original = await describeOriginal(file)
  if (!original || !photo.original_fingerprint || original.fingerprint !== photo.original_fingerprint) {
    return { status: 'different_file' as const }
  }
  await db.from('photos').where('id', photoId).update({ original_path: original.path })
  const nearby = await locateOriginals(userId, path.dirname(original.path), { recursive: false })
  return { status: 'linked' as const, alsoFound: nearby.found, missing: nearby.missing }
}
