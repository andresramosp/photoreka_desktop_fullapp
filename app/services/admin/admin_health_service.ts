// @ts-nocheck

import User from '#models/user'
import Photo from '#models/photo'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import db from '@adonisjs/lucid/services/db'
import HealthPhotoService from '#services/health_photo_service'
import AnalyzerProcessRunner from '#services/analyzer_service'
import { GlobalEmbeddingsTagsTask } from '#models/analyzer/globalEmbeddingsTagsTask'
import PhotoImageService from '#services/photo_image_service'
import ModelsService from '#services/models_service'

export interface UserHealthRow {
  userId: number
  userName: string
  userEmail: string
  totalPhotos: number
  withEmbedding: number
  withDescriptions: number
  withColorHistogram: number
  quickScore: number // 0-100
}

export interface HealthOverview {
  totalUsers: number
  totalPhotos: number
  globalScore: number
  missingEmbeddings: number
  missingDescriptions: number
  missingColorHistogram: number
  tagsWithoutEmbedding: number
  tagsTotal: number
  chunksWithoutEmbedding: number
  chunksTotal: number
  users: UserHealthRow[]
}

export default class AdminHealthService {
  /**
   * Lightweight overview — single query on photos table + counts on tags/chunks
   */
  static async overview(): Promise<HealthOverview> {
    // Per-user photo stats (no joins)
    const rows = await db.rawQuery(`
      SELECT
        user_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_embedding,
        COUNT(*) FILTER (WHERE descriptions IS NOT NULL)::int AS with_descriptions,
        COUNT(*) FILTER (WHERE color_histogram IS NOT NULL)::int AS with_color
      FROM photos
      WHERE deleted_at IS NULL
      GROUP BY user_id
      ORDER BY total DESC
    `)

    const userIds = rows.rows.map((r: any) => r.user_id).filter(Boolean)
    const usersMap = new Map<number, { name: string; email: string }>()
    if (userIds.length > 0) {
      const users = await User.query().whereIn('id', userIds).select('id', 'name', 'email')
      for (const u of users) {
        usersMap.set(u.id, { name: u.name, email: u.email })
      }
    }

    // Global tag/chunk embedding counts
    const [tagResult, chunkResult, tagTotalResult, chunkTotalResult] = await Promise.all([
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM tags WHERE embedding IS NULL`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM descriptions_chunks WHERE embedding IS NULL`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM tags`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM descriptions_chunks`),
    ])

    const tagsWithoutEmbedding = tagResult.rows[0]?.cnt ?? 0
    const chunksWithoutEmbedding = chunkResult.rows[0]?.cnt ?? 0
    const tagsTotal = tagTotalResult.rows[0]?.cnt ?? 0
    const chunksTotal = chunkTotalResult.rows[0]?.cnt ?? 0

    let totalPhotos = 0
    let totalEmbedding = 0
    let totalDescriptions = 0
    let totalColor = 0

    const users: UserHealthRow[] = rows.rows
      .filter((r: any) => r.user_id != null)
      .map((r: any) => {
        const total = r.total
        const withEmb = r.with_embedding
        const withDesc = r.with_descriptions
        const withCol = r.with_color

        totalPhotos += total
        totalEmbedding += withEmb
        totalDescriptions += withDesc
        totalColor += withCol

        const score =
          total > 0 ? Math.round(((withEmb + withDesc + withCol) / (total * 3)) * 100) : 100

        const user = usersMap.get(r.user_id)
        return {
          userId: r.user_id,
          userName: user?.name ?? 'Unknown',
          userEmail: user?.email ?? '',
          totalPhotos: total,
          withEmbedding: withEmb,
          withDescriptions: withDesc,
          withColorHistogram: withCol,
          quickScore: score,
        }
      })

    const globalScore =
      totalPhotos > 0
        ? Math.round(((totalEmbedding + totalDescriptions + totalColor) / (totalPhotos * 3)) * 100)
        : 100

    return {
      totalUsers: users.length,
      totalPhotos,
      globalScore,
      missingEmbeddings: totalPhotos - totalEmbedding,
      missingDescriptions: totalPhotos - totalDescriptions,
      missingColorHistogram: totalPhotos - totalColor,
      tagsWithoutEmbedding,
      tagsTotal,
      chunksWithoutEmbedding,
      chunksTotal,
      users,
    }
  }

  /**
   * Full health check for a single user's photos
   */
  static async userHealthCheck(userId: number) {
    const photoIds = await Photo.query()
      .where('userId', userId)
      .select('id')
      .then((photos) => photos.map((p) => p.id))

    if (photoIds.length === 0) {
      return { userId, totalPhotos: 0, healthyPhotos: 0, unhealthyPhotos: 0, photos: [] }
    }

    const reports = await HealthPhotoService.healthForPhotoIdsBatch(photoIds)

    const photos = reports.map((r: any) => ({
      photoId: r.photoId,
      ok: r.ok,
      totalChecks: r.checks.length,
      passedChecks: r.checks.filter((c: any) => c.ok).length,
      failedChecks: r.checks.filter((c: any) => !c.ok).length,
      missing: r.missing,
      checks: r.checks,
    }))

    const healthyPhotos = photos.filter((p: any) => p.ok).length

    return {
      userId,
      totalPhotos: photos.length,
      healthyPhotos,
      unhealthyPhotos: photos.length - healthyPhotos,
      photos,
    }
  }

  /**
   * Launch admin_retry for ALL unhealthy photos of a user
   */
  static async userRetry(
    userId: number
  ): Promise<{ processId: string; photosCount: number; error?: string } | null> {
    // Run health to find unhealthy photos
    const photoIds = await Photo.query()
      .where('userId', userId)
      .select('id')
      .then((photos) => photos.map((p) => p.id))

    if (photoIds.length === 0) {
      return { processId: '', photosCount: 0, error: 'User has no photos' }
    }

    const reports = await HealthPhotoService.healthForPhotoIdsBatch(photoIds)
    const unhealthyIds = reports.filter((r: any) => !r.ok).map((r: any) => r.photoId)

    if (unhealthyIds.length === 0) {
      return { processId: '', photosCount: 0, error: 'All photos are healthy — nothing to retry' }
    }

    // Find the package to use — get the latest non-preprocess process for this user
    const lastProcess = await AnalyzerProcess.query()
      .where('userId', userId)
      .where('isPreprocess', false)
      .whereIn('mode', ['adding', 'retry_process', 'admin_retry'])
      .orderBy('createdAt', 'desc')
      .first()

    const packageId = lastProcess?.packageId ?? 'process'

    // Load the actual Photo models for unhealthy photos
    const photos = await Photo.query().whereIn('id', unhealthyIds)

    const runner = new AnalyzerProcessRunner()
    await runner.initProcess(photos, packageId, 'admin_retry', false, undefined, String(userId))

    // Capture process ID before fire-and-forget
    const processId = runner['process']?.id ?? ''

    // Tag the process with its origin
    if (runner['process']) {
      runner['process'].notes = `Health repair — ${unhealthyIds.length} unhealthy photos`
      await runner['process'].save()
    }

    // Fire and forget
    runner.runAll().catch(() => {})

    return { processId: String(processId), photosCount: unhealthyIds.length }
  }

  /**
   * Get status of global embeddings (tags + chunks without embeddings)
   */
  static async globalEmbeddingsStatus() {
    const [tagsResult, chunksResult, tagsTotal, chunksTotal] = await Promise.all([
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM tags WHERE embedding IS NULL`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM descriptions_chunks WHERE embedding IS NULL`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM tags`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM descriptions_chunks`),
    ])

    return {
      tagsWithoutEmbedding: tagsResult.rows[0]?.cnt ?? 0,
      tagsTotal: tagsTotal.rows[0]?.cnt ?? 0,
      chunksWithoutEmbedding: chunksResult.rows[0]?.cnt ?? 0,
      chunksTotal: chunksTotal.rows[0]?.cnt ?? 0,
    }
  }

  /**
   * Launch global embeddings repair task (tags + chunks without embeddings)
   */
  static async runGlobalEmbeddings(): Promise<{ tagsToProcess: number; chunksToProcess: number }> {
    const task = new GlobalEmbeddingsTagsTask(new AnalyzerProcess())

    // process() finds tags/chunks without embeddings
    await task.process([], undefined)

    // commit() generates and saves the embeddings
    task.commit().catch(() => {})

    // Return the counts found
    const tagsCount = await db.rawQuery(
      `SELECT COUNT(*)::int AS cnt FROM tags WHERE embedding IS NULL`
    )
    const chunksCount = await db.rawQuery(
      `SELECT COUNT(*)::int AS cnt FROM descriptions_chunks WHERE embedding IS NULL`
    )

    return {
      tagsToProcess: tagsCount.rows[0]?.cnt ?? 0,
      chunksToProcess: chunksCount.rows[0]?.cnt ?? 0,
    }
  }

  /**
   * Get status of global CLIP embeddings (photos without CLIP embedding)
   */
  static async globalClipStatus() {
    const [missingResult, totalResult] = await Promise.all([
      db.rawQuery(
        `SELECT COUNT(*)::int AS cnt FROM photos WHERE embedding IS NULL AND deleted_at IS NULL`
      ),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM photos WHERE deleted_at IS NULL`),
    ])

    return {
      photosWithoutClip: missingResult.rows[0]?.cnt ?? 0,
      photosTotal: totalResult.rows[0]?.cnt ?? 0,
    }
  }

  /**
   * Launch global CLIP embeddings repair — finds all photos without CLIP embedding,
   * downloads images from R2, generates embeddings, and saves them.
   * Runs in fire-and-forget mode.
   */
  static async runGlobalClipEmbeddings(): Promise<{ photosToProcess: number }> {
    const photos = await Photo.query()
      .whereNull('embedding')
      .whereNull('deletedAt')
      .select('id', 'name')

    if (photos.length === 0) {
      return { photosToProcess: 0 }
    }

    const count = photos.length

    // Fire and forget the actual processing
    AdminHealthService.processClipEmbeddingsBatch(photos).catch(() => {})

    return { photosToProcess: count }
  }

  /**
   * Internal: process CLIP embeddings in batches (fire-and-forget)
   */
  private static async processClipEmbeddingsBatch(photos: Photo[]) {
    const batchSize = 12
    const photoImageService = PhotoImageService.getInstance()
    const modelsService = new ModelsService()

    for (let i = 0; i < photos.length; i += batchSize) {
      const batch = photos.slice(i, i + batchSize)

      try {
        const validImages = await photoImageService.getValidPhotosWithImages(batch, false)
        if (validImages.length === 0) continue

        const payload = validImages.map(({ photo, base64 }) => ({ id: photo.id, base64 }))
        const { embeddings } = await modelsService.getEmbeddingsImages(payload)

        for (const item of embeddings) {
          const img = validImages.find((vi) => vi.photo.id === Number(item.id))
          if (img) {
            img.photo.embedding = item.embedding
            await img.photo.save()
          }
        }
      } catch (error) {
        // Continue with next batch on error
      }

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}
