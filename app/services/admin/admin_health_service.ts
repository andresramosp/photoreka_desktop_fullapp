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
import HealthRepairTracker from '#services/admin/health_repair_tracker'
import pLimit from 'p-limit'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

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

export type ImageCheckStatus = 'missing' | 'timeout' | 'error'

export interface UserImageHealthRow {
  photoId: number
  thumbnailName: string
  originalFileName: string | null
  createdAt: string | null
  deletedAt: string | null
  confirmed: boolean | null
  checkStatus: ImageCheckStatus
  httpStatus: number | null
  bytesReceived: number
  latencyMs: number
  error: string | null
}

export interface UserImageHealthReport {
  userId: number
  totalPhotos: number
  healthyPhotos: number
  unhealthyPhotos: number
  checkedAt: string
  unhealthyRows: UserImageHealthRow[]
}

export default class AdminHealthService {
  private static readonly IMAGE_CHECK_BATCH_SIZE = 400
  private static readonly IMAGE_CHECK_CONCURRENCY = 20
  private static readonly IMAGE_CHECK_TIMEOUT_MS = 9000
  private static readonly r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  })

  /**
   * Lightweight overview — single query on photos table + counts on tags/chunks
   */
  static async overview(): Promise<HealthOverview> {
    // Per-user photo stats — only processed photos (excludes 'uploaded', 'processing', etc.)
    const rows = await db.rawQuery(`
      SELECT
        photos.user_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE photos.embedding IS NOT NULL)::int AS with_embedding,
        COUNT(*) FILTER (WHERE photos.descriptions IS NOT NULL)::int AS with_descriptions,
        COUNT(*) FILTER (WHERE photos.color_histogram IS NOT NULL)::int AS with_color
      FROM photos
      JOIN analyzer_processes ap ON photos.analyzer_process_id = ap.id
        AND (
          ap.mode IN ('admin_retry', 'overwrite_metadata')
          OR (ap.is_preprocess = false AND ap.current_stage = 'finished')
        )
      WHERE photos.deleted_at IS NULL
      GROUP BY photos.user_id
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
   * Full health check for a single user's photos.
   * Processes in batches to avoid OOM on users with 3k+ photos.
   */
  static async userHealthCheck(userId: number) {
    const photoIds = await Photo.query()
      .where('userId', userId)
      .whereHas('analyzerProcess', (q) => {
        q.where((inner) => {
          inner.whereIn('mode', ['admin_retry', 'overwrite_metadata']).orWhere((inner2) => {
            inner2.where('is_preprocess', false).where('current_stage', 'finished')
          })
        })
      })
      .select('id')
      .then((photos) => photos.map((p) => p.id))

    if (photoIds.length === 0) {
      return { userId, totalPhotos: 0, healthyPhotos: 0, unhealthyPhotos: 0, photos: [] }
    }

    const batchSize = 500
    const photos: any[] = []

    for (let i = 0; i < photoIds.length; i += batchSize) {
      const batchIds = photoIds.slice(i, i + batchSize)
      const reports = await HealthPhotoService.healthForPhotoIdsBatch(batchIds)

      for (const r of reports) {
        photos.push({
          photoId: r.photoId,
          ok: r.ok,
          totalChecks: r.checks.length,
          passedChecks: r.checks.filter((c: any) => c.ok).length,
          failedChecks: r.checks.filter((c: any) => !c.ok).length,
          missing: r.missing,
          checks: r.checks,
        })
      }
    }

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
   * Image presence check for a user.
   * Includes soft-deleted photos and checks only thumbnail bytes from image worker.
   * Returns only unhealthy rows to keep payload lightweight.
   */
  static async userImageHealthCheck(userId: number): Promise<UserImageHealthReport> {
    const photos = await db
      .from('photos')
      .where('user_id', userId)
      .select([
        'id',
        'thumbnail_name',
        'original_file_name',
        'created_at',
        'deleted_at',
        'confirmed',
      ])
      .orderBy('id', 'asc')

    if (photos.length === 0) {
      return {
        userId,
        totalPhotos: 0,
        healthyPhotos: 0,
        unhealthyPhotos: 0,
        checkedAt: new Date().toISOString(),
        unhealthyRows: [],
      }
    }

    const limit = pLimit(AdminHealthService.IMAGE_CHECK_CONCURRENCY)
    const unhealthyRows: UserImageHealthRow[] = []
    let healthyPhotos = 0

    for (let i = 0; i < photos.length; i += AdminHealthService.IMAGE_CHECK_BATCH_SIZE) {
      const batch = photos.slice(i, i + AdminHealthService.IMAGE_CHECK_BATCH_SIZE)

      const checks = await Promise.all(
        batch.map((row) =>
          limit(async () => {
            const startedAt = Date.now()
            const thumbnailName = row.thumbnail_name as string | null

            if (!thumbnailName) {
              return {
                ok: false,
                row: {
                  photoId: Number(row.id),
                  thumbnailName: '',
                  originalFileName: row.original_file_name ?? null,
                  createdAt: row.created_at ? String(row.created_at) : null,
                  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
                  confirmed: row.confirmed ?? null,
                  checkStatus: 'error' as const,
                  httpStatus: null,
                  bytesReceived: 0,
                  latencyMs: Date.now() - startedAt,
                  error: 'Missing thumbnail_name in DB',
                } as UserImageHealthRow,
              }
            }

            const check = await AdminHealthService.checkThumbnailBytes(thumbnailName)

            if (check.ok) {
              return { ok: true, row: null }
            }

            return {
              ok: false,
              row: {
                photoId: Number(row.id),
                thumbnailName,
                originalFileName: row.original_file_name ?? null,
                createdAt: row.created_at ? String(row.created_at) : null,
                deletedAt: row.deleted_at ? String(row.deleted_at) : null,
                confirmed: row.confirmed ?? null,
                checkStatus: check.checkStatus,
                httpStatus: check.httpStatus,
                bytesReceived: check.bytesReceived,
                latencyMs: check.latencyMs,
                error: check.error,
              } as UserImageHealthRow,
            }
          })
        )
      )

      for (const result of checks) {
        if (result.ok) {
          healthyPhotos += 1
          continue
        }
        if (result.row) {
          unhealthyRows.push(result.row)
        }
      }
    }

    return {
      userId,
      totalPhotos: photos.length,
      healthyPhotos,
      unhealthyPhotos: unhealthyRows.length,
      checkedAt: new Date().toISOString(),
      unhealthyRows,
    }
  }

  private static async checkThumbnailBytes(thumbnailName: string): Promise<{
    ok: boolean
    checkStatus: ImageCheckStatus | 'ok'
    httpStatus: number | null
    bytesReceived: number
    latencyMs: number
    error: string | null
  }> {
    const totalStart = Date.now()
    const bucket = process.env.R2_BUCKET

    if (!bucket) {
      return {
        ok: false,
        checkStatus: 'error',
        httpStatus: null,
        bytesReceived: 0,
        latencyMs: 0,
        error: 'R2_BUCKET is not configured',
      }
    }

    type AttemptResult = {
      ok: boolean
      definitive: boolean
      checkStatus: ImageCheckStatus | 'ok'
      httpStatus: number | null
      bytesReceived: number
      error: string | null
    }

    const attempt = async (): Promise<AttemptResult> => {
      try {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: thumbnailName,
          Range: 'bytes=0-0',
        })
        const response = await AdminHealthService.withTimeout(
          AdminHealthService.r2Client.send(command),
          AdminHealthService.IMAGE_CHECK_TIMEOUT_MS
        )

        const status = response?.$metadata?.httpStatusCode ?? null
        const bytes = response?.Body
          ? await AdminHealthService.withTimeout(response.Body.transformToByteArray(), 5000)
          : new Uint8Array()
        const bytesReceived = bytes?.length ?? 0
        const ok = status !== null && status >= 200 && status < 300 && bytesReceived > 0

        return {
          ok,
          definitive: true,
          checkStatus: ok ? 'ok' : 'missing',
          httpStatus: status,
          bytesReceived,
          error: ok ? null : `HTTP ${status ?? 'unknown'} – no bytes received`,
        }
      } catch (err: any) {
        const httpStatus = err?.$metadata?.httpStatusCode ?? null
        const isNoSuchKey =
          err?.name === 'NoSuchKey' || err?.Code === 'NoSuchKey' || httpStatus === 404
        const isTimeout = (err?.message as string | undefined)?.startsWith('Timeout after') ?? false

        return {
          ok: false,
          // 404/NoSuchKey is definitive — no retry will help
          definitive: isNoSuchKey,
          checkStatus: isTimeout ? 'timeout' : isNoSuchKey ? 'missing' : 'error',
          httpStatus,
          bytesReceived: 0,
          error: err?.message || 'Request failed',
        }
      }
    }

    let result = await attempt()

    // Retry once for transient failures (timeout, network, 5xx…)
    // Do NOT retry definitive 404/NoSuchKey — it won't change
    if (!result.ok && !result.definitive) {
      await new Promise((resolve) => setTimeout(resolve, 700))
      result = await attempt()
    }

    const { definitive: _d, ...rest } = result
    return { ...rest, latencyMs: Date.now() - totalStart }
  }

  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  /**
   * Launch admin_retry for ALL unhealthy photos of a user
   */
  static async userRetry(
    userId: number
  ): Promise<{ processId: string; photosCount: number; taskId?: string; error?: string } | null> {
    // Run health to find unhealthy photos
    const photoIds = await Photo.query()
      .where('userId', userId)
      .whereHas('analyzerProcess', (q) => {
        q.where((inner) => {
          inner.whereIn('mode', ['admin_retry', 'overwrite_metadata']).orWhere((inner2) => {
            inner2.where('is_preprocess', false).where('current_stage', 'finished')
          })
        })
      })
      .select('id')
      .then((photos) => photos.map((p) => p.id))

    if (photoIds.length === 0) {
      return { processId: '', photosCount: 0, error: 'User has no photos' }
    }

    // Batch health check to avoid OOM on large users
    const batchSize = 500
    const unhealthyIds: number[] = []
    for (let i = 0; i < photoIds.length; i += batchSize) {
      const batchIds = photoIds.slice(i, i + batchSize)
      const reports = await HealthPhotoService.healthForPhotoIdsBatch(batchIds)
      for (const r of reports) {
        if (!r.ok) unhealthyIds.push(r.photoId)
      }
    }

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

    const packageId = 'process'

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

    // Track repair task
    const taskId = HealthRepairTracker.start(
      'user-retry',
      unhealthyIds.length,
      `Repairing ${unhealthyIds.length} photos for user #${userId}`
    )

    // Fire and forget with tracking
    runner
      .runAll()
      .then(() =>
        HealthRepairTracker.complete(taskId, `Repair completed: ${unhealthyIds.length} photos`)
      )
      .catch((err) => HealthRepairTracker.fail(taskId, err?.message || 'Repair failed'))

    return { processId: String(processId), photosCount: unhealthyIds.length, taskId }
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
  static async runGlobalEmbeddings(): Promise<{
    tagsToProcess: number
    chunksToProcess: number
    taskId: string
  }> {
    // Get counts first
    const [tagsCountResult, chunksCountResult] = await Promise.all([
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM tags WHERE embedding IS NULL`),
      db.rawQuery(`SELECT COUNT(*)::int AS cnt FROM descriptions_chunks WHERE embedding IS NULL`),
    ])

    const tagsToProcess = tagsCountResult.rows[0]?.cnt ?? 0
    const chunksToProcess = chunksCountResult.rows[0]?.cnt ?? 0
    const total = tagsToProcess + chunksToProcess

    const taskId = HealthRepairTracker.start(
      'global-embeddings',
      total,
      `Processing ${tagsToProcess} tags and ${chunksToProcess} chunks`
    )

    const embTask = new GlobalEmbeddingsTagsTask(new AnalyzerProcess())
    await embTask.process([], undefined)

    embTask
      .commit()
      .then(() =>
        HealthRepairTracker.complete(
          taskId,
          `Embeddings completed: ${tagsToProcess} tags, ${chunksToProcess} chunks`
        )
      )
      .catch((err) => HealthRepairTracker.fail(taskId, err?.message || 'Embeddings failed'))

    return { tagsToProcess, chunksToProcess, taskId }
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
  static async runGlobalClipEmbeddings(): Promise<{ photosToProcess: number; taskId: string }> {
    const photos = await Photo.query()
      .whereNull('embedding')
      .whereNull('deletedAt')
      .whereHas('analyzerProcess', (q) => {
        q.where((inner) => {
          inner.whereIn('mode', ['admin_retry', 'overwrite_metadata']).orWhere((inner2) => {
            inner2.where('is_preprocess', false).where('current_stage', 'finished')
          })
        })
      })
      .select('id', 'name')

    if (photos.length === 0) {
      return { photosToProcess: 0, taskId: '' }
    }

    const count = photos.length

    const taskId = HealthRepairTracker.start(
      'global-clip',
      count,
      `Processing CLIP embeddings for ${count} photos`
    )

    // Fire and forget with tracking
    AdminHealthService.processClipEmbeddingsBatch(photos, taskId).catch((err) => {
      HealthRepairTracker.fail(taskId, err?.message || 'CLIP processing failed')
    })

    return { photosToProcess: count, taskId }
  }

  /**
   * Internal: process CLIP embeddings in batches (fire-and-forget)
   */
  private static async processClipEmbeddingsBatch(photos: Photo[], taskId?: string) {
    const batchSize = 12
    const photoImageService = PhotoImageService.getInstance()
    const modelsService = new ModelsService()
    let processed = 0

    for (let i = 0; i < photos.length; i += batchSize) {
      const batch = photos.slice(i, i + batchSize)

      try {
        const validImages = await photoImageService.getValidPhotosWithImages(batch, false)
        if (validImages.length === 0) {
          processed += batch.length
          if (taskId) {
            HealthRepairTracker.progress(
              taskId,
              processed,
              `Processed ${processed}/${photos.length} photos`
            )
          }
          continue
        }

        const payload = validImages.map(({ photo, base64 }) => ({ id: photo.id, base64 }))
        const { embeddings } = await modelsService.getEmbeddingsImagesCPU(payload)

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

      processed += batch.length
      if (taskId) {
        HealthRepairTracker.progress(
          taskId,
          processed,
          `Processed ${processed}/${photos.length} photos`
        )
      }

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    if (taskId) {
      HealthRepairTracker.complete(
        taskId,
        `CLIP embeddings completed: ${processed} photos processed`
      )
    }
  }
}
