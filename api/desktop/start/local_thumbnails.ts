import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import pLimit from 'p-limit'
import { deletePhotoFiles } from '../cloud_functions.js'
import { ensureLocalThumb, isThumbKey, localThumbUrl } from '../thumbnails.js'

/**
 * Al arrancar, pone al día las fotos de antes de guardar las miniaturas en el disco: descarga las que
 * falten, borra de R2 las de fotos ya analizadas (las que ya no tienen main en R2) y cambia por la
 * ruta local las URLs de miniaturas de R2 guardadas dentro de canvas, portfolios y conversaciones.
 * Cuando ya está todo al día, solo comprueba que las miniaturas existen en el disco.
 */

const JSON_COLUMNS: [table: string, column: string][] = [
  ['canvases', 'data'],
  ['portfolio_builds', 'result'],
  ['conversations', 'metadata'],
  ['conversation_messages', 'metadata'],
]

async function downloadMissing() {
  const rows: { thumbnail_name: string }[] = await db
    .from('photos')
    .whereNull('deleted_at')
    .whereNull('thumb_deleted_at')
    .where('thumbnail_name', 'like', 'desktop/thumbs/%')
    .select('thumbnail_name')
  const limit = pLimit(8)
  const results = await Promise.all(rows.map((row) => limit(() => ensureLocalThumb(row.thumbnail_name))))
  return results.filter((ok) => !ok).length
}

async function releaseAnalyzed() {
  const rows: { id: number; user_id: number; thumbnail_name: string }[] = await db
    .from('photos')
    .whereNull('deleted_at')
    .whereNull('thumb_deleted_at')
    .whereNotNull('main_deleted_at')
    .where('thumbnail_name', 'like', 'desktop/thumbs/%')
    .select('id', 'user_id', 'thumbnail_name')
  const byUser = new Map<number, { id: number; key: string }[]>()
  for (const row of rows) {
    if (!isThumbKey(row.thumbnail_name) || !(await ensureLocalThumb(row.thumbnail_name))) continue
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, [])
    byUser.get(row.user_id)!.push({ id: row.id, key: row.thumbnail_name })
  }
  let released = 0
  for (const [userId, photos] of byUser) {
    const failed = new Set(await deletePhotoFiles(userId, photos.map((photo) => photo.key)))
    const done = photos.filter((photo) => !failed.has(photo.key)).map((photo) => photo.id)
    if (done.length > 0) await db.from('photos').whereIn('id', done).update({ thumb_deleted_at: new Date() })
    released += done.length
  }
  return released
}

async function rewriteStoredUrls() {
  const prefix = `https://${process.env.IMAGES_WORKER}/`
  const rewrite = (value: any): any => {
    if (typeof value === 'string') {
      const key = value.startsWith(prefix) ? value.slice(prefix.length) : null
      return key && isThumbKey(key) ? localThumbUrl(key) : value
    }
    if (Array.isArray(value)) return value.map(rewrite)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]))
    }
    return value
  }
  let updated = 0
  for (const [table, column] of JSON_COLUMNS) {
    const rows: { id: number; value: any }[] = await db
      .from(table)
      .whereRaw(`??::text like ?`, [column, `%${prefix}desktop/thumbs/%`])
      .select('id', `${column} as value`)
    for (const row of rows) {
      await db
        .from(table)
        .where('id', row.id)
        .update({ [column]: JSON.stringify(rewrite(row.value)) })
      updated++
    }
  }
  return updated
}

app.ready(async () => {
  if (!process.env.IMAGES_WORKER) return
  try {
    const missing = await downloadMissing()
    const released = await releaseAnalyzed()
    const rewritten = await rewriteStoredUrls()
    if (missing > 0 || released > 0 || rewritten > 0) {
      logger.info(
        `[PhotoDeletion -> LocalThumbnails] ${released} miniaturas de fotos analizadas borradas de R2; ` +
          `${rewritten} registros con URLs de miniaturas actualizados; ${missing} miniaturas no se pudieron descargar`
      )
    }
  } catch (error) {
    logger.error(`[PhotoDeletion -> LocalThumbnails] ${(error as Error).message}`)
  }
})
