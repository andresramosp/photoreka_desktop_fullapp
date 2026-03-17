// @ts-nocheck

import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import Photo from '#models/photo'
import PhotoManager from '../managers/photo_manager.js'
import db from '@adonisjs/lucid/services/db'
type Check = { label: string; ok: boolean }

export default class HealthPhotoService {
  /** Representa un check de integridad */

  /* ───────── 1) photoHealth ───────── */
  public static async photoHealth(photoId: number) {
    const checks: Check[] = []
    const missing: string[] = []

    const photo = await Photo.query()
      .where('id', photoId)
      .preload('detections')
      .preload('tags', (q) => q.preload('tag'))
      .preload('descriptionChunks')
      .first()

    checks.push({ label: 'photo.exists', ok: !!photo })
    if (!photo) return { ok: false, checks, missing: ['photo'] }

    return this.performHealthChecks({
      embedding: photo.embedding,
      descriptions: photo.descriptions,
      colorHistogram: photo.colorHistogram,
      tags: photo.tags,
      chunks: photo.descriptionChunks,
    })
  }

  /* ───────── 1b) Validación centralizada (CORE) ───────── */
  private static performHealthChecks(data: {
    embedding: any
    descriptions: any
    colorHistogram: any
    tags: Array<{
      id?: number
      tag_photo_id?: number
      category: string
      tagId?: number
      tag_id?: number
      tag?: { embedding: any }
      tag_embedding?: any
    }>
    chunks: Array<{ id: number; embedding: any }>
  }) {
    const checks: Check[] = []
    const missing: string[] = []

    const push = (label: string, ok: boolean) => {
      checks.push({ label, ok })
      if (!ok) missing.push(label)
    }

    push('photo.embedding', !!data.embedding)

    const d = data.descriptions ?? {}
    push('descriptions.context', !!d.context)
    push('descriptions.story', !!d.story)
    push('descriptions.visual_accents', !!d.visual_accents)
    push('descriptions.artistic_scores', !!d.artistic_scores)

    const visualAspects = d.visual_aspects || {}
    push(
      'descriptions.visual_aspects.genre',
      !!(visualAspects.genre && visualAspects.genre.length > 0)
    )
    push(
      'descriptions.visual_aspects.orientation',
      !!(visualAspects.orientation && visualAspects.orientation.length > 0)
    )
    push(
      'descriptions.visual_aspects.temperature',
      !!(visualAspects.temperature && visualAspects.temperature.length > 0)
    )
    push(
      'descriptions.visual_aspects.palette',
      !!(visualAspects.palette && visualAspects.palette.length > 0)
    )

    push('tags.any', data.tags.length > 0)
    push(
      'tags.context_story',
      data.tags.some((t) => t.category === 'context_story')
    )
    push(
      'tags.visual_accents',
      data.tags.some((t) => t.category === 'visual_accents')
    )
    push(
      'tags.visual_aspects',
      data.tags.some((t) => t.category === 'visual_aspects')
    )
    // push(
    //   'tags.artistic_scores',
    //   data.tags.some((t) => t.category === 'artistic_scores')
    // )

    push('descriptionChunks.any', data.chunks.length > 0)
    data.chunks.forEach((c) => push(`descriptionChunk#${c.id}.embedding`, !!c.embedding))

    push('photo.color_histogram', !!data.colorHistogram)

    data.tags.forEach((t) => {
      const tagPhotoId = t.id || t.tag_photo_id
      const tagId = t.tagId || t.tag_id
      const tagEmbedding = t.tag?.embedding || t.tag_embedding
      push(`tagPhoto#${tagPhotoId}.tag#${tagId}.embedding`, !!tagEmbedding)
    })

    return { ok: missing.length === 0, checks, missing }
  }

  /* ───────── 1c) Carga batch optimizada (CENTRALIZADA) ───────── */
  /**
   * Carga fotos y sus relaciones usando raw queries batch.
   * Mucho más rápido que preloads del ORM.
   */
  private static async loadPhotosWithRelationsBatch(photoIds: number[]) {
    if (photoIds.length === 0) return []

    // 1) Cargar fotos base — solo booleans de existencia, no los vectores/JSON completos
    const photos = await db
      .from('photos')
      .select(
        'id',
        db.raw('(embedding IS NOT NULL) as has_embedding'),
        'descriptions',
        db.raw('(color_histogram IS NOT NULL) as has_color_histogram')
      )
      .whereIn('id', photoIds)
      .orderBy('id', 'asc')

    // 2) Batch queries para relaciones
    const [tags, descriptionChunks] = await Promise.all([
      db
        .from('tags_photos')
        .select(
          'tags_photos.id as tag_photo_id',
          'tags_photos.photo_id',
          'tags_photos.category',
          'tags_photos.tag_id',
          db.raw('(tags.embedding IS NOT NULL) as tag_embedding')
        )
        .leftJoin('tags', 'tags.id', 'tags_photos.tag_id')
        .whereIn('tags_photos.photo_id', photoIds),

      db
        .from('descriptions_chunks')
        .select('id', 'photo_id', db.raw('(embedding IS NOT NULL) as has_embedding'))
        .whereIn('photo_id', photoIds),
    ])

    // 3) Indexar por photoId
    const tagsByPhoto = new Map<number, any[]>()
    const chunksByPhoto = new Map<number, any[]>()

    tags.forEach((t) => {
      if (!tagsByPhoto.has(t.photo_id)) tagsByPhoto.set(t.photo_id, [])
      tagsByPhoto.get(t.photo_id)!.push(t)
    })

    descriptionChunks.forEach((c) => {
      if (!chunksByPhoto.has(c.photo_id)) chunksByPhoto.set(c.photo_id, [])
      chunksByPhoto.get(c.photo_id)!.push(c)
    })

    // 4) Retornar datos estructurados
    return photos.map((photo: any) => ({
      id: photo.id,
      embedding: photo.has_embedding,
      descriptions: photo.descriptions,
      colorHistogram: photo.has_color_histogram,
      tags: tagsByPhoto.get(photo.id) || [],
      chunks: (chunksByPhoto.get(photo.id) || []).map((c: any) => ({
        id: c.id,
        embedding: c.has_embedding,
      })),
    }))
  }

  /* ───────── 2) healthForUser (OPTIMIZADO) ───────── */
  public static async healthForUser(userId: number, verbose = false) {
    const mark = (ok: boolean) => (ok ? '✅' : '❌')

    // Obtener IDs de fotos del usuario
    const photoIds = await Photo.query()
      .where('user_id', userId)
      .select('id')
      .orderBy('id', 'asc')
      .then((photos) => photos.map((p) => p.id))

    if (photoIds.length === 0) {
      console.log('\n✅ No hay fotos para analizar')
      return []
    }

    // Cargar datos con raw queries batch
    const photosData = await this.loadPhotosWithRelationsBatch(photoIds)

    // Generar reportes
    const reports = photosData.map((p) => ({
      photoId: p.id,
      ...this.performHealthChecks({
        embedding: p.embedding,
        descriptions: p.descriptions,
        colorHistogram: p.colorHistogram,
        tags: p.tags,
        chunks: p.chunks,
      }),
    }))

    // Ordenar por ID
    reports.sort((a, b) => a.photoId - b.photoId)

    // salida por consola
    reports.forEach((r) => {
      if (r.ok && !verbose) {
        console.log(`Foto #${r.photoId} ${mark(true)} OK`)
        return
      }
      console.log(`\n⟐  Foto #${r.photoId} ${mark(r.ok)}`)
      r.checks
        .filter((c) => verbose || !c.ok)
        .forEach(({ label, ok }) => console.log(`  ${mark(ok)} ${label}`))
    })

    // resumen
    const failed = reports.filter((r) => !r.ok)
    if (failed.length) {
      console.log('\n❌ Fotos con campos faltantes:')
      failed.forEach((r) => console.log(`  • #${r.photoId} → ${r.missing.join(', ')}`))
    } else {
      console.log('\n✅ Todas las fotos están completas')
    }

    return reports
  }

  /* ───────── 2b) healthForPhotoIdsBatch (sin logging, para cache) ───────── */
  /**
   * Obtiene health reports para múltiples fotos de forma optimizada.
   * Versión sin logging, ideal para cacheo en AnalyzerProcess.
   */
  public static async healthForPhotoIdsBatch(photoIds: number[]) {
    if (photoIds.length === 0) return []

    // Cargar datos con raw queries batch
    const photosData = await this.loadPhotosWithRelationsBatch(photoIds)

    // Generar reportes sin logging
    return photosData.map((p) => ({
      photoId: p.id,
      ...this.performHealthChecks({
        embedding: p.embedding,
        descriptions: p.descriptions,
        colorHistogram: p.colorHistogram,
        tags: p.tags,
        chunks: p.chunks,
      }),
    }))
  }

  /* ───────── NUEVO: healthForProcess (OPTIMIZADO) ───────── */
  public static async healthForProcess(process: AnalyzerProcess, verbose = false) {
    const mark = (ok: boolean) => (ok ? '✅' : '❌')

    // Obtener IDs de fotos del proceso
    await process.load('photos')
    const photoIds = (process.photos || []).map((p: any) => p.id)

    if (photoIds.length === 0) {
      console.log('\n✅ No hay fotos para analizar')
      return []
    }

    // Cargar datos con raw queries batch
    const photosData = await this.loadPhotosWithRelationsBatch(photoIds)

    // Generar reportes
    const reports = photosData.map((p) => ({
      photoId: p.id,
      ...this.performHealthChecks({
        embedding: p.embedding,
        descriptions: p.descriptions,
        colorHistogram: p.colorHistogram,
        tags: p.tags,
        chunks: p.chunks,
      }),
    }))
    reports.sort((a, b) => a.photoId - b.photoId)
    if (verbose) {
      reports.forEach((r) => {
        console.log(`\n⟐  Foto #${r.photoId} ${mark(r.ok)}`)
        r.checks.forEach(({ label, ok }) => console.log(`  ${mark(ok)} ${label}`))
      })
      const failed = reports.filter((r) => !r.ok)
      if (failed.length) {
        console.log('\n❌ Fotos con campos faltantes:')
        failed.forEach((r) => console.log(`  • #${r.photoId} → ${r.missing.join(', ')}`))
      } else {
        console.log('\n✅ Todas las fotos están completas')
      }
    }
    return reports
  }

  // Solo informativa al final del proceso, y para saber si iniciar retry automático
  public static async updateSheetWithHealth(process: AnalyzerProcess) {
    const { extractAllTasks } = await import('../analyzer_packages.js')

    // Usar la función centralizada para obtener todas las tareas
    const allTasks = extractAllTasks(process.packageId)

    if (allTasks.length > 0) {
      const healthReports = await HealthPhotoService.healthForProcess(process, false)

      for (const taskDef of allTasks) {
        const taskName = taskDef.name
        const checksForTask = taskDef.checks || []
        const completedPhotoIds = []
        for (const report of healthReports) {
          // Para cada foto, verificar si pasa todos los checks de la tarea
          const ok = checksForTask.every((checkPattern) => {
            if (checkPattern.includes('*')) {
              // Patrón tipo descriptionChunk#*.embedding
              const regex = new RegExp('^' + checkPattern.replace(/\*/g, '\\d+') + '$')
              return report.checks.filter((c) => regex.test(c.label)).every((c) => c.ok)
            } else {
              const check = report.checks.find((c) => c.label === checkPattern)
              return check ? check.ok : false
            }
          })
          if (ok) completedPhotoIds.push(report.photoId)
        }
        await process.markPhotosCompleted(taskName, completedPhotoIds)
      }
      await process.save()
    }
  }

  /* ───────── VERSIÓN ULTRA-OPTIMIZADA CON RAW QUERIES ───────── */
  /**
   * Alias de healthForUser (ahora ambos usan la misma implementación optimizada).
   * @deprecated Usar healthForUser directamente, que ya está optimizado.
   */
  public static async healthForUserRaw(userId: number, verbose = false) {
    return this.healthForUser(userId, verbose)
  }
}
