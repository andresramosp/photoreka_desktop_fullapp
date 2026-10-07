/**
 * Judges the photos of a paid Picks session: one GPT call for scores + critique
 * and one Gemini call for genres per batch, in parallel.
 *
 * The queue is the picks_photos table itself (status = pending), so judging can
 * start while the browser is still uploading, and a runner killed by a deploy
 * resumes exactly where it stopped (start/picks_resume). A Redis lock keeps a
 * session on a single runner across processes.
 */

import crypto from 'node:crypto'
import pLimit from 'p-limit'
import { DateTime } from 'luxon'
import { MediaResolution } from '@google/genai'
import redis from '@adonisjs/redis/services/main'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'

import ModelsService, { mimeTypeFromExtension } from '#services/models_service'
import PhotoImageService from '#services/photo_image_service'
import MailService from '#services/mail_service'
import { picksTokenFor } from '#services/picks/picks_session_service'
import PicksSession from '#models/picks/picks_session'
import PicksPhoto, { type PicksScores } from '#models/picks/picks_photo'
import PicksCostLog, { type PicksCostTask } from '#models/picks/picks_cost_log'
import {
  PICKS_CRITERION_KEYS,
  PICKS_GENRE_KEYS,
  PICKS_JUDGING,
  PICKS_RETENTION_DAYS,
  type PicksGenreKey,
} from '#config/picks'
import {
  picksGenresPrompt,
  picksImageKey,
  picksScoresPrompt,
  picksScoresSchema,
} from '../../utils/prompts/picks.js'
import { imagesWorkerUrl } from '../../utils/picks/r2_upload_worker.js'
import { picksReadyTemplate } from '../../utils/email_templates.js'

const INSTANCE_ID = crypto.randomUUID()
const CRITIQUE_MAX_CHARS = 400
const FAILED_BATCH_BACKOFF_MS = 5000

interface ScoreItem {
  scores: PicksScores
  critique: string
}

interface CallOutcome<T> {
  items: (T | null)[]
  cost: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const errMsg = (error: unknown) => (error instanceof Error ? error.message : String(error))
const lockKey = (sessionId: string) => `picks:runner:${sessionId}`

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function parseScoreItem(raw: any): ScoreItem | null {
  if (!raw || typeof raw !== 'object') return null
  const scores = {} as PicksScores
  for (const key of PICKS_CRITERION_KEYS) {
    const value = Number(raw.scores?.[key])
    if (!Number.isFinite(value)) return null
    scores[key] = Math.round(Math.min(10, Math.max(1, value)) * 10) / 10
  }
  const critique = typeof raw.critique === 'string' ? raw.critique.trim() : ''
  if (!critique) return null
  return { scores, critique: critique.slice(0, CRITIQUE_MAX_CHARS) }
}

function parseGenres(raw: any): PicksGenreKey[] | null {
  if (!Array.isArray(raw?.genres)) return null
  const known = new Set<string>(PICKS_GENRE_KEYS)
  return [...new Set(raw.genres.map((g: unknown) => String(g).trim().toLowerCase()))].filter(
    (g): g is PicksGenreKey => known.has(g as string)
  )
}

// Shared by every session in this process, so concurrent orders cannot exhaust
// the providers' rate limits between them.
const globalCalls = pLimit(PICKS_JUDGING.globalCalls)
const runners = new Map<string, Promise<void>>()

export default class PicksJudgeService {
  private models = new ModelsService()
  private images = PhotoImageService.getInstance()

  /** Idempotent: a session already running here or in another process is left alone. */
  async start(sessionId: string): Promise<void> {
    if (runners.has(sessionId)) return
    const acquired = await redis.set(
      lockKey(sessionId),
      INSTANCE_ID,
      'EX',
      PICKS_JUDGING.lockTtlSeconds,
      'NX'
    )
    if (!acquired) return

    const run = this.run(sessionId)
      .catch(async (error) => {
        logger.error(`[Picks] Session ${sessionId} failed: ${errMsg(error)}`)
        await PicksSession.query()
          .where('id', sessionId)
          .update({ status: 'failed', error: errMsg(error).slice(0, 1000) })
      })
      .finally(async () => {
        runners.delete(sessionId)
        if ((await redis.get(lockKey(sessionId))) === INSTANCE_ID)
          await redis.del(lockKey(sessionId))
      })
    runners.set(sessionId, run)
  }

  /** Sessions a previous process left half-judged (deploy, crash). */
  async resumeInterrupted(): Promise<number> {
    const sessions = await PicksSession.query().where('status', 'processing').select('id')
    for (const { id } of sessions) await this.start(id)
    return sessions.length
  }

  // ── Runner ─────────────────────────────────────────────────────────────────

  private async run(sessionId: string): Promise<void> {
    const session = await PicksSession.findOrFail(sessionId)
    if (!session.paidAt || session.status === 'completed' || session.status === 'failed') return

    session.status = 'processing'
    session.startedAt ??= DateTime.now()
    await session.save()

    const inFlight = new Set<number>()
    let active = 0
    let wake: () => void = () => {}

    while (true) {
      await redis.set(lockKey(sessionId), INSTANCE_ID, 'EX', PICKS_JUDGING.lockTtlSeconds)

      const freeBatches = PICKS_JUDGING.batchesPerSession - active
      if (freeBatches > 0) {
        // Only the first `paidCount` photos are ever judged: before payment the
        // upload is capped by the product limit, not by what ends up paid.
        const paidPhotoIds = PicksPhoto.query()
          .where('session_id', sessionId)
          .orderBy('id')
          .limit(session.paidCount ?? 0)
          .select('id')
        const pending = await PicksPhoto.query()
          .where('session_id', sessionId)
          .where('status', 'pending')
          .whereIn('id', paidPhotoIds)
          .whereNotIn('id', [...inFlight])
          .orderBy('id')
          .limit(freeBatches * PICKS_JUDGING.imagesPerBatch)

        for (const batch of chunk(pending, PICKS_JUDGING.imagesPerBatch)) {
          active++
          batch.forEach((photo) => inFlight.add(photo.id))
          void this.judgeBatch(sessionId, batch)
            .catch((error) => logger.error(`[Picks] Batch error in ${sessionId}: ${errMsg(error)}`))
            .finally(() => {
              active--
              batch.forEach((photo) => inFlight.delete(photo.id))
              wake()
            })
        }

        if (active === 0 && pending.length === 0 && (await this.uploadSettled(session))) break
      }

      await new Promise<void>((resolve) => {
        wake = resolve
        setTimeout(resolve, PICKS_JUDGING.pollMs)
      })
    }

    await this.backfillGenres(sessionId)
    await this.finish(session)
  }

  /** True once no more photos can arrive for this session. */
  private async uploadSettled(session: PicksSession): Promise<boolean> {
    await session.refresh()
    if (session.uploadCompletedAt) return true

    const row = await PicksPhoto.query()
      .where('session_id', session.id)
      .count('* as total')
      .max('created_at as lastAt')
      .first()
    const registered = Number(row?.$extras.total ?? 0)
    if (registered >= session.photoCap) return true

    // The buyer closed the tab mid-upload: judge what arrived instead of waiting forever.
    const lastAt = row?.$extras.lastAt ? new Date(row.$extras.lastAt).getTime() : null
    const quietSince = lastAt ?? session.paidAt!.toMillis()
    return Date.now() - quietSince > PICKS_JUDGING.uploadIdleMs
  }

  private async judgeBatch(sessionId: string, photos: PicksPhoto[]): Promise<void> {
    const [scored, classified] = await Promise.all([
      globalCalls(() => this.scoreBatch(photos)).catch((error) => {
        logger.warn(`[Picks] Scores failed (${photos.length} photos): ${errMsg(error)}`)
        return null
      }),
      globalCalls(() => this.classifyBatch(photos)).catch((error) => {
        logger.warn(`[Picks] Genres failed (${photos.length} photos): ${errMsg(error)}`)
        return null
      }),
    ])

    const now = DateTime.now()
    let missing = 0
    photos.forEach((photo, i) => {
      const item = scored?.items[i]
      if (item) {
        photo.status = 'judged'
        photo.scores = item.scores
        photo.critique = item.critique
        photo.genres = classified?.items[i] ?? null
        photo.judgedAt = now
        return
      }
      missing++
      photo.attempts += 1
      if (photo.attempts >= PICKS_JUDGING.maxAttemptsPerPhoto) photo.status = 'failed'
    })

    await db.transaction(async (trx) => {
      for (const photo of photos) await photo.useTransaction(trx).save()
    })
    await this.logCost(sessionId, 'scores', PICKS_JUDGING.scoreModel, photos.length, scored?.cost)
    await this.logCost(
      sessionId,
      'genres',
      PICKS_JUDGING.genreModel,
      photos.length,
      classified?.cost
    )

    // Holding the slot a moment keeps a provider outage from burning every attempt in seconds.
    if (missing > 0) await sleep(FAILED_BATCH_BACKOFF_MS)
  }

  private async scoreBatch(photos: PicksPhoto[]): Promise<CallOutcome<ScoreItem>> {
    const content = photos.map((photo) => {
      const url = imagesWorkerUrl(photo.r2Key)
      if (!url) throw new Error('IMAGES_WORKER is not configured')
      return { type: 'image_url', image_url: { url, detail: 'high' } }
    })

    const response = await this.models.getGPTResponse(
      picksScoresPrompt(photos.length),
      content,
      PICKS_JUDGING.scoreModel,
      {
        type: 'json_schema',
        json_schema: {
          name: 'picks_batch',
          strict: true,
          schema: picksScoresSchema(photos.length),
        },
      },
      0,
      false
    )
    if (!response?.result || typeof response.result !== 'object') {
      throw new Error('Empty or unparseable response')
    }

    return {
      items: photos.map((_, i) => parseScoreItem(response.result[picksImageKey(i)])),
      cost: response.cost?.totalCostInEur ?? 0,
    }
  }

  private async classifyBatch(photos: PicksPhoto[]): Promise<CallOutcome<PicksGenreKey[]>> {
    const buffers = await Promise.all(
      photos.map((photo) => this.images.getImageBufferFromR2(photo.r2Key).catch(() => null))
    )
    // Only readable images are sent; their keys follow their order in the request.
    const sent = photos.map((_, i) => i).filter((i) => buffers[i])
    if (sent.length === 0) throw new Error('No image could be read from R2')

    const parts: any[] = []
    sent.forEach((photoIndex, keyIndex) => {
      parts.push(`[${picksImageKey(keyIndex)}]`)
      parts.push({
        inlineData: {
          mimeType: mimeTypeFromExtension(photos[photoIndex].r2Key),
          data: buffers[photoIndex]!.toString('base64'),
        },
      })
    })

    const response = await this.models.getGeminiResponse(
      picksGenresPrompt(sent.length),
      parts,
      PICKS_JUDGING.genreModel,
      {
        temperature: 0.1,
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        responseMimeType: 'application/json',
      },
      false,
      true
    )
    const result = response?.result
    if (!result || typeof result !== 'object') throw new Error('Empty or unparseable response')

    const items: (PicksGenreKey[] | null)[] = photos.map(() => null)
    sent.forEach((photoIndex, keyIndex) => {
      items[photoIndex] = parseGenres(result[picksImageKey(keyIndex)])
    })
    return { items, cost: response.cost?.totalCostInEur ?? 0 }
  }

  /** One extra pass for judged photos whose genre call failed, so thematic juries see them. */
  private async backfillGenres(sessionId: string): Promise<void> {
    const photos = await PicksPhoto.query()
      .where('session_id', sessionId)
      .where('status', 'judged')
      .whereNull('genres')
      .orderBy('id')
    if (photos.length === 0) return

    const limit = pLimit(PICKS_JUDGING.batchesPerSession)
    await Promise.all(
      chunk(photos, PICKS_JUDGING.imagesPerBatch).map((batch) =>
        limit(async () => {
          try {
            const classified = await globalCalls(() => this.classifyBatch(batch))
            for (const [i, photo] of batch.entries()) {
              const genres = classified.items[i]
              if (genres)
                await PicksPhoto.query()
                  .where('id', photo.id)
                  .update({ genres: JSON.stringify(genres) })
            }
            await this.logCost(
              sessionId,
              'genres',
              PICKS_JUDGING.genreModel,
              batch.length,
              classified.cost
            )
          } catch (error) {
            logger.warn(`[Picks] Genre backfill failed in ${sessionId}: ${errMsg(error)}`)
          }
        })
      )
    )
  }

  private async finish(session: PicksSession): Promise<void> {
    const row = await PicksPhoto.query()
      .where('session_id', session.id)
      .where('status', 'judged')
      .count('* as total')
      .first()
    const judged = Number(row?.$extras.total ?? 0)

    session.completedAt = DateTime.now()
    if (judged === 0) {
      session.status = 'failed'
      session.error = 'No photo could be judged.'
      await session.save()
      return
    }
    session.status = 'completed'
    await session.save()
    await this.sendReadyEmail(session, judged)
  }

  private async sendReadyEmail(session: PicksSession, judged: number): Promise<void> {
    if (!session.customerEmail || session.emailSentAt) return
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.photoreka.com'
    const resultsUrl = `${frontendUrl}/picks/${picksTokenFor(session.id)}`
    try {
      await new MailService().sendEmail({
        from: 'Photoreka <hello@photoreka.com>',
        to: session.customerEmail,
        subject: 'Your Photoreka Picks are ready',
        body: picksReadyTemplate(resultsUrl, judged, PICKS_RETENTION_DAYS),
      })
      session.emailSentAt = DateTime.now()
      await session.save()
    } catch (error) {
      logger.error(`[Picks] Ready email failed for ${session.id}: ${errMsg(error)}`)
    }
  }

  private async logCost(
    sessionId: string,
    task: PicksCostTask,
    model: string,
    photos: number,
    costInEur: number | undefined
  ): Promise<void> {
    if (!costInEur || costInEur <= 0) return
    await PicksCostLog.create({ sessionId, task, model, photos, costInEur })
  }
}
