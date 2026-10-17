import path from 'node:path'
import pLimit from 'p-limit'
import db from '@adonisjs/lucid/services/db'
import Photo from '#models/photo'
import HealthPhotoService from '#services/health_photo_service'
import type AnalyzerProcess from '#models/analyzer/analyzerProcess'
import { extractAllTasks } from '../../app/analyzer_packages.js'
import { deletePhotoFiles, isDesktopFileKey, signPhotoUploads } from '../cloud_functions.js'
import { ensureLocalThumb, isThumbKey, readLocalThumb } from '../thumbnails.js'
import { mainFromOriginal, originalStat } from '../originals.js'

/**
 * La main (la copia de ~1800 px que sube la web) y la miniatura solo están en R2 para analizar. Al
 * terminar el análisis se borran de R2; la miniatura queda en el disco (ver ../thumbnails) y, si
 * una foto vuelve a analizarse, se suben de nuevo: la main generada desde el original.
 */

// Una foto está analizada del todo cuando pasa las comprobaciones de salud de todas las tareas
// del análisis completo, las mismas que deciden los reintentos automáticos. Se calcula al usarla:
// analyzer_packages importa (indirectamente) este módulo y aún no está listo al cargarlo.
const fullAnalysisTasks = () => extractAllTasks('process').filter((task) => !task.isGlobal)

function passes(checks: { label: string; ok: boolean }[], pattern: string) {
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '\\d+') + '$')
    return checks.filter((c) => regex.test(c.label)).every((c) => c.ok)
  }
  return checks.find((c) => c.label === pattern)?.ok ?? false
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Fotos del proceso que pasan las comprobaciones de salud de todas las tareas del análisis. */
export async function fullyAnalyzedPhotoIds(process: AnalyzerProcess): Promise<number[]> {
  const tasks = fullAnalysisTasks()
  const reports = await HealthPhotoService.healthForProcess(process)
  return reports
    .filter((report) =>
      tasks.every((task) => (task.checks ?? []).every((check: string) => passes(report.checks, check)))
    )
    .map((report) => report.photoId)
}

/**
 * Al terminar un análisis (con sus reintentos): borra de R2 la main y la miniatura de las fotos del
 * proceso que quedaron analizadas del todo (`analyzedIds`, si ya se calcularon). La miniatura solo
 * se borra si su copia local está en el disco. Las fotos que fallaron conservan las dos para un
 * reintento posterior.
 */
export async function releaseAnalysisImages(process: AnalyzerProcess, analyzedIds?: number[]) {
  if (process.isPreprocess || !process.userId) return
  try {
    const analyzed = analyzedIds ?? (await fullyAnalyzedPhotoIds(process))

    let mains = 0
    let thumbs = 0
    let failed = 0
    for (const ids of chunks(analyzed, 1000)) {
      const rows: {
        id: number
        name: string
        thumbnail_name: string
        main_deleted_at: Date | null
        thumb_deleted_at: Date | null
      }[] = await db
        .from('photos')
        .whereIn('id', ids)
        .whereNull('deleted_at')
        .where((query) => query.whereNull('main_deleted_at').orWhereNull('thumb_deleted_at'))
        .select('id', 'name', 'thumbnail_name', 'main_deleted_at', 'thumb_deleted_at')

      const mainKeys = new Map<string, number>()
      const thumbKeys = new Map<string, number>()
      for (const row of rows) {
        if (!row.main_deleted_at && isDesktopFileKey(row.name)) mainKeys.set(row.name, row.id)
        if (!row.thumb_deleted_at && isThumbKey(row.thumbnail_name) && (await ensureLocalThumb(row.thumbnail_name))) {
          thumbKeys.set(row.thumbnail_name, row.id)
        }
      }
      const keys = [...mainKeys.keys(), ...thumbKeys.keys()]
      if (keys.length === 0) continue

      const failedKeys = new Set(await deletePhotoFiles(process.userId, keys))
      const doneMains = [...mainKeys].filter(([key]) => !failedKeys.has(key)).map(([, id]) => id)
      const doneThumbs = [...thumbKeys].filter(([key]) => !failedKeys.has(key)).map(([, id]) => id)
      if (doneMains.length > 0) await db.from('photos').whereIn('id', doneMains).update({ main_deleted_at: new Date() })
      if (doneThumbs.length > 0) await db.from('photos').whereIn('id', doneThumbs).update({ thumb_deleted_at: new Date() })
      mains += doneMains.length
      thumbs += doneThumbs.length
      failed += failedKeys.size
    }
    if (mains > 0 || thumbs > 0 || failed > 0) {
      console.log(
        `[PhotoDeletion -> AfterAnalysis] proceso ${process.id}: ${mains} main y ${thumbs} miniaturas borradas de R2` +
          (failed > 0 ? `, ${failed} archivos no se pudieron borrar` : '')
      )
    }
  } catch (error) {
    console.error(`[PhotoDeletion -> AfterAnalysis] proceso ${process.id}: ${(error as Error).message}`)
  }
}

function mainFormat(key: string): ['jpeg' | 'webp' | 'png', string] {
  const extension = path.extname(key).toLowerCase()
  if (extension === '.webp') return ['webp', 'image/webp']
  if (extension === '.png') return ['png', 'image/png']
  return ['jpeg', 'image/jpeg']
}

async function upload(url: string, contentType: string, body: Buffer) {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) })
  if (!response.ok) throw new Error(`R2 respondió ${response.status}`)
}

/**
 * Antes de analizar: las fotos del proceso que ya no tienen la main o la miniatura en R2 las
 * recuperan con la misma clave. La miniatura se sube desde su copia local. La main se genera desde
 * el original del disco; si no se encuentra, se sube la miniatura en su lugar, para que el análisis
 * pueda hacerse con menos resolución.
 */
export async function restoreAnalysisImages(process: AnalyzerProcess) {
  if (!process.userId) return
  const userId = process.userId
  const photos = await Photo.query()
    .where('analyzer_process_id', process.id)
    .where((query) => query.whereNotNull('main_deleted_at').orWhereNotNull('thumb_deleted_at'))
  if (photos.length === 0) return

  let fromOriginal = 0
  let fromThumbnail = 0
  let thumbs = 0
  let failed = 0
  const limit = pLimit(4)
  await Promise.all(
    photos.map((photo) =>
      limit(async () => {
        if (!isDesktopFileKey(photo.name) || !isThumbKey(photo.thumbnailName)) return
        try {
          const [format, contentType] = mainFormat(photo.name)
          const [mainUrl, thumbUrl] = await signPhotoUploads(userId, photo.name, photo.thumbnailName, contentType)
          const thumbnail = await readLocalThumb(photo.thumbnailName)

          if (photo.thumbDeletedAt) {
            if (!thumbnail) throw new Error('falta la miniatura en el disco')
            await upload(thumbUrl, contentType, thumbnail)
            await db.from('photos').where('id', photo.id).update({ thumb_deleted_at: null })
            thumbs++
          }

          if (photo.mainDeletedAt) {
            if (photo.originalPath && (await originalStat(photo.originalPath))) {
              await upload(mainUrl, contentType, await mainFromOriginal(photo.originalPath, format))
              fromOriginal++
            } else {
              if (!thumbnail) throw new Error('no hay original ni miniatura en el disco')
              await upload(mainUrl, contentType, thumbnail)
              fromThumbnail++
            }
            await db.from('photos').where('id', photo.id).update({ main_deleted_at: null })
          }
        } catch (error) {
          failed++
          console.warn(`[AnalysisImages] No se pudieron recuperar las imágenes de la foto ${photo.id}: ${(error as Error).message}`)
        }
      })
    )
  )
  console.log(
    `[AnalysisImages] proceso ${process.id}: ${thumbs} miniaturas subidas; main recuperada de ${fromOriginal} originales y ${fromThumbnail} miniaturas` +
      (failed > 0 ? `; ${failed} fallaron` : '')
  )
}
