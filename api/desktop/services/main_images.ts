import path from 'node:path'
import pLimit from 'p-limit'
import db from '@adonisjs/lucid/services/db'
import Photo from '#models/photo'
import HealthPhotoService from '#services/health_photo_service'
import type AnalyzerProcess from '#models/analyzer/analyzerProcess'
import { extractAllTasks } from '../../app/analyzer_packages.js'
import { copyPhotoFiles, deletePhotoFiles, isDesktopFileKey, signPhotoUploads } from '../cloud_functions.js'
import { mainFromOriginal, originalStat } from '../originals.js'

/**
 * La main (la copia de ~1800 px que sube la web) solo hace falta para analizar. Al terminar el
 * análisis se borra de R2 y, si una foto vuelve a analizarse, se genera de nuevo desde el original.
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
 * Al terminar un análisis (con sus reintentos): borra de R2 la main de las fotos del proceso que
 * quedaron analizadas del todo (`analyzedIds`, si ya se calcularon). Las que fallaron la conservan
 * para un reintento posterior.
 */
export async function releaseMainImages(process: AnalyzerProcess, analyzedIds?: number[]) {
  if (process.isPreprocess || !process.userId) return
  try {
    const analyzed = analyzedIds ?? (await fullyAnalyzedPhotoIds(process))

    let deleted = 0
    let failed = 0
    for (const ids of chunks(analyzed, 1000)) {
      const rows: { id: number; name: string }[] = await db
        .from('photos')
        .whereIn('id', ids)
        .whereNull('main_deleted_at')
        .whereNull('deleted_at')
        .select('id', 'name')
      const own = rows.filter((row) => isDesktopFileKey(row.name))
      if (own.length === 0) continue
      const failedKeys = new Set(await deletePhotoFiles(process.userId, own.map((row) => row.name)))
      const done = own.filter((row) => !failedKeys.has(row.name)).map((row) => row.id)
      if (done.length > 0) await db.from('photos').whereIn('id', done).update({ main_deleted_at: new Date() })
      deleted += done.length
      failed += failedKeys.size
    }
    if (deleted > 0 || failed > 0) {
      console.log(
        `[PhotoDeletion -> MainAfterAnalysis] proceso ${process.id}: ${deleted} main borradas de R2` +
          (failed > 0 ? `, ${failed} no se pudieron borrar` : '')
      )
    }
  } catch (error) {
    console.error(`[PhotoDeletion -> MainAfterAnalysis] proceso ${process.id}: ${(error as Error).message}`)
  }
}

function mainFormat(key: string): ['jpeg' | 'webp' | 'png', string] {
  const extension = path.extname(key).toLowerCase()
  if (extension === '.webp') return ['webp', 'image/webp']
  if (extension === '.png') return ['png', 'image/png']
  return ['jpeg', 'image/jpeg']
}

/**
 * Antes de analizar: las fotos del proceso cuya main ya se borró la recuperan con la misma clave.
 * Se genera desde el original del disco; si no se encuentra, se copia la miniatura para que el
 * análisis pueda hacerse, con menos resolución.
 */
export async function restoreMainImages(process: AnalyzerProcess) {
  if (!process.userId) return
  const userId = process.userId
  const photos = await Photo.query().where('analyzer_process_id', process.id).whereNotNull('main_deleted_at')
  if (photos.length === 0) return

  let fromOriginal = 0
  let fromThumbnail = 0
  let failed = 0
  const limit = pLimit(4)
  await Promise.all(
    photos.map((photo) =>
      limit(async () => {
        if (!isDesktopFileKey(photo.name) || !isDesktopFileKey(photo.thumbnailName)) return
        try {
          if (photo.originalPath && (await originalStat(photo.originalPath))) {
            const [format, contentType] = mainFormat(photo.name)
            const image = await mainFromOriginal(photo.originalPath, format)
            const [uploadUrl] = await signPhotoUploads(userId, photo.name, photo.thumbnailName, contentType)
            const upload = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': contentType },
              body: new Uint8Array(image),
            })
            if (!upload.ok) throw new Error(`R2 respondió ${upload.status}`)
            fromOriginal++
          } else {
            await copyPhotoFiles(userId, [{ from: photo.thumbnailName, to: photo.name }])
            fromThumbnail++
          }
          await db.from('photos').where('id', photo.id).update({ main_deleted_at: null })
        } catch (error) {
          failed++
          console.warn(`[MainImages] No se pudo recuperar la main de la foto ${photo.id}: ${(error as Error).message}`)
        }
      })
    )
  )
  console.log(
    `[MainImages] proceso ${process.id}: main recuperada de ${fromOriginal} originales y ${fromThumbnail} miniaturas` +
      (failed > 0 ? `; ${failed} fallaron` : '')
  )
}
