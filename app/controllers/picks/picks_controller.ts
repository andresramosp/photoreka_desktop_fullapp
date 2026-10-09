/**
 * Photoreka Picks — anonymous, paid scoring orders. Auth is the signed session
 * token (PicksSessionService); there are no user accounts.
 *
 * R2 layout: picks/{sessionId}/{clientPhotoId}.{ext} (browser-made thumbnails).
 */

import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

import {
  PICKS_FREE_TRIAL,
  PICKS_MAX_PHOTOS,
  PICKS_R2_PREFIX,
  PICKS_RETENTION_DAYS,
} from '#config/picks'
import PicksSessionService, { picksTokenFor } from '#services/picks/picks_session_service'
import PicksPaymentService from '#services/picks/picks_payment_service'
import PicksJudgeService from '#services/picks/picks_judge_service'
import PicksSession from '#models/picks/picks_session'
import PicksPhoto from '#models/picks/picks_photo'
import { buildUploadWorkerUrl, imagesWorkerUrl } from '../../utils/picks/r2_upload_worker.js'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const CLIENT_PHOTO_ID = /^[a-zA-Z0-9_-]{8,64}$/
const MAX_PER_REQUEST = 100
const MAX_PHOTOS_PER_POLL = 1000

const extensionFor = (mime: string) =>
  mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg'

function serializeSession(session: PicksSession) {
  return {
    id: session.id,
    status: session.status,
    orderedCount: session.orderedCount,
    paidCount: session.paidCount,
    paid: Boolean(session.paidAt),
    isFree: session.isFree,
    uploadCompleted: Boolean(session.uploadCompletedAt),
    createdAt: session.createdAt.toISO(),
    completedAt: session.completedAt?.toISO() ?? null,
    expiresAt: session.createdAt.plus({ days: PICKS_RETENTION_DAYS }).toISO(),
  }
}

function serializePhoto(photo: PicksPhoto, copies: Map<string, string[]>) {
  return {
    clientPhotoId: photo.clientPhotoId,
    name: photo.originalName,
    thumbUrl: imagesWorkerUrl(photo.r2Key),
    width: photo.width,
    height: photo.height,
    scores: photo.scores,
    critique: photo.critique,
    genres: photo.genres,
    judgedAt: photo.judgedAt?.toISO() ?? null,
    duplicates: copies.get(photo.clientPhotoId) ?? [],
  }
}

/** File names of the exact copies of each judged photo, keyed by its client id. */
async function copiesByPhoto(sessionId: string): Promise<Map<string, string[]>> {
  const rows = await PicksPhoto.query()
    .where('session_id', sessionId)
    .where('status', 'duplicate')
    .select('duplicate_of', 'original_name')
  const copies = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.duplicateOf) continue
    copies.set(row.duplicateOf, [...(copies.get(row.duplicateOf) ?? []), row.originalName])
  }
  return copies
}

async function countByStatus(sessionId: string) {
  const rows = await PicksPhoto.query()
    .where('session_id', sessionId)
    .select('status')
    .count('* as total')
    .groupBy('status')
  const counts = { registered: 0, pending: 0, judged: 0, failed: 0, duplicate: 0 }
  for (const row of rows) {
    const total = Number(row.$extras.total)
    counts.registered += total
    counts[row.status] = total
  }
  return counts
}

export default class PicksController {
  private sessions = new PicksSessionService()
  private payments = new PicksPaymentService()

  // ── Session & payment ──────────────────────────────────────────────────────

  public async createSession({ request, response }: HttpContext) {
    const photoCount = Number(request.input('photoCount'))
    if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > PICKS_MAX_PHOTOS) {
      return response.badRequest({ error: `photoCount must be between 1 and ${PICKS_MAX_PHOTOS}` })
    }
    const clientIp =
      request.header('x-forwarded-for')?.split(',')[0]?.trim() || request.ip() || 'unknown'

    const session = await this.sessions.create(photoCount, clientIp)
    if (!session) {
      return response.tooManyRequests({
        error: 'Too many orders from this network. Try again later.',
      })
    }
    return response.created({
      sessionToken: picksTokenFor(session.id),
      session: serializeSession(session),
      maxPhotos: PICKS_MAX_PHOTOS,
    })
  }

  /** Free trial: up to PICKS_FREE_TRIAL.photos photos, judging starts at once. */
  public async createFreeSession({ request, response }: HttpContext) {
    const photoCount = Number(request.input('photoCount'))
    if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > PICKS_FREE_TRIAL.photos) {
      return response.badRequest({
        error: `The free trial judges up to ${PICKS_FREE_TRIAL.photos} photos`,
      })
    }
    const clientIp =
      request.header('x-forwarded-for')?.split(',')[0]?.trim() || request.ip() || 'unknown'

    const result = await this.sessions.createFree(photoCount, clientIp)
    if (!(result instanceof PicksSession)) {
      return response.tooManyRequests({
        code: result.error,
        error:
          result.error === 'ip_limit'
            ? 'You already used your free trial today.'
            : 'Free trials are fully booked for today.',
      })
    }

    await new PicksJudgeService().start(result.id)
    return response.created({
      sessionToken: picksTokenFor(result.id),
      session: serializeSession(result),
      maxPhotos: PICKS_FREE_TRIAL.photos,
    })
  }

  public async createPaymentIntent({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return
    if (session.paidAt) return response.badRequest({ error: 'This order is already paid' })

    const photoCount = Number(request.input('photoCount'))
    if (!Number.isInteger(photoCount) || photoCount < 1 || photoCount > PICKS_MAX_PHOTOS) {
      return response.badRequest({ error: `photoCount must be between 1 and ${PICKS_MAX_PHOTOS}` })
    }

    try {
      return response.ok(await this.payments.createPaymentIntent(session, photoCount))
    } catch (error) {
      console.error('[Picks] createPaymentIntent error:', error)
      return response.internalServerError({ error: 'Could not start the payment' })
    }
  }

  public async confirmPayment({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const { stripePaymentIntentId, customerEmail } = request.only([
      'stripePaymentIntentId',
      'customerEmail',
    ])
    if (typeof stripePaymentIntentId !== 'string' || !stripePaymentIntentId) {
      return response.badRequest({ error: 'stripePaymentIntentId is required' })
    }

    try {
      const confirmed = await this.payments.confirmPaymentIntent(
        session,
        stripePaymentIntentId,
        typeof customerEmail === 'string' ? customerEmail : null
      )
      if (!confirmed)
        return response.unprocessableEntity({ error: 'Payment could not be confirmed' })
      await session.refresh()
      return response.ok({ session: serializeSession(session) })
    } catch (error) {
      console.error('[Picks] confirmPayment error:', error)
      return response.internalServerError({ error: 'Payment confirmation failed' })
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  public async uploadUrls({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return
    if (!this.acceptsPhotos(session)) return response.conflict({ error: 'This order is closed' })

    const photos = request.input('photos')
    if (!Array.isArray(photos) || photos.length === 0 || photos.length > MAX_PER_REQUEST) {
      return response.badRequest({ error: `photos must hold 1 to ${MAX_PER_REQUEST} entries` })
    }

    const urls: Record<string, { uploadUrl: string; r2Key: string }> = {}
    for (const raw of photos) {
      const clientPhotoId = raw?.clientPhotoId
      const contentType = raw?.contentType
      if (typeof clientPhotoId !== 'string' || !CLIENT_PHOTO_ID.test(clientPhotoId)) continue
      if (!ALLOWED_MIME_TYPES.includes(contentType)) continue

      const r2Key = `${PICKS_R2_PREFIX}/${session.id}/${clientPhotoId}${extensionFor(contentType)}`
      const uploadUrl = buildUploadWorkerUrl(r2Key, contentType)
      if (!uploadUrl) return response.internalServerError({ error: 'Upload worker not configured' })
      urls[clientPhotoId] = { uploadUrl, r2Key }
    }
    return response.ok({ urls })
  }

  public async registerPhotos({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return
    if (!this.acceptsPhotos(session)) return response.conflict({ error: 'This order is closed' })

    const photos = request.input('photos')
    if (!Array.isArray(photos) || photos.length === 0 || photos.length > MAX_PER_REQUEST) {
      return response.badRequest({ error: `photos must hold 1 to ${MAX_PER_REQUEST} entries` })
    }

    const keyPrefix = `${PICKS_R2_PREFIX}/${session.id}/`
    const now = DateTime.now().toSQL()
    const rows = photos
      .filter(
        (raw) =>
          typeof raw?.clientPhotoId === 'string' &&
          CLIENT_PHOTO_ID.test(raw.clientPhotoId) &&
          typeof raw?.r2Key === 'string' &&
          raw.r2Key.startsWith(keyPrefix) &&
          typeof raw?.originalName === 'string' &&
          (raw?.duplicateOf === undefined ||
            raw?.duplicateOf === null ||
            (typeof raw.duplicateOf === 'string' && CLIENT_PHOTO_ID.test(raw.duplicateOf))) &&
          Number.isInteger(raw?.width) &&
          Number.isInteger(raw?.height) &&
          raw.width > 0 &&
          raw.height > 0
      )
      .map((raw) => ({
        session_id: session.id,
        client_photo_id: raw.clientPhotoId,
        r2_key: raw.r2Key,
        original_name: raw.originalName.slice(0, 255),
        width: raw.width,
        height: raw.height,
        // Copies point at their judged twin and stay out of the jury queue.
        status: raw.duplicateOf ? 'duplicate' : 'pending',
        duplicate_of: raw.duplicateOf ?? null,
        attempts: 0,
        created_at: now,
      }))
    if (rows.length === 0) return response.badRequest({ error: 'No valid photo entries' })

    // The session row lock serialises concurrent registrations, so together they
    // can never exceed what was quoted or paid.
    const accepted = await db.transaction(async (trx) => {
      const locked = await PicksSession.query({ client: trx })
        .where('id', session.id)
        .forUpdate()
        .firstOrFail()
      const row = await trx
        .from('picks_photos')
        .where('session_id', session.id)
        .count('* as total')
        .first()
      const room = Math.max(0, locked.photoCap - Number(row?.total ?? 0))
      const batch = rows.slice(0, room)
      if (batch.length > 0) {
        await trx
          .knexClient('picks_photos')
          .insert(batch)
          .onConflict(['session_id', 'client_photo_id'])
          .ignore()
      }
      return batch.length
    })

    return response.ok({ accepted, rejected: rows.length - accepted })
  }

  public async uploadComplete({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return
    if (!session.uploadCompletedAt) {
      session.uploadCompletedAt = DateTime.now()
      await session.save()
    }
    return response.ok({ session: serializeSession(session) })
  }

  // ── Progress & results ─────────────────────────────────────────────────────

  /** Incremental: photos judged at or after `since`; the browser dedupes by id. */
  public async status({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const since = DateTime.fromISO(String(request.input('since', '')))
    const query = PicksPhoto.query()
      .where('session_id', session.id)
      .where('status', 'judged')
      .orderBy('judged_at')
      .orderBy('id')
      .limit(MAX_PHOTOS_PER_POLL)
    if (since.isValid) query.where('judged_at', '>=', since.toSQL()!)
    const [photos, copies] = await Promise.all([query, copiesByPhoto(session.id)])

    return response.ok({
      session: serializeSession(session),
      counts: await countByStatus(session.id),
      photos: photos.map((photo) => serializePhoto(photo, copies)),
      cursor: photos.at(-1)?.judgedAt?.toISO() ?? (since.isValid ? since.toISO() : null),
    })
  }

  public async results({ request, response }: HttpContext) {
    const session = await this.requireSession(request, response)
    if (!session) return

    const [photos, copies] = await Promise.all([
      PicksPhoto.query().where('session_id', session.id).where('status', 'judged').orderBy('id'),
      copiesByPhoto(session.id),
    ])

    return response.ok({
      session: serializeSession(session),
      counts: await countByStatus(session.id),
      photos: photos.map((photo) => serializePhoto(photo, copies)),
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private acceptsPhotos(session: PicksSession): boolean {
    return (
      (session.status === 'open' || session.status === 'processing') && !session.uploadCompletedAt
    )
  }

  private async requireSession(
    request: HttpContext['request'],
    response: HttpContext['response']
  ): Promise<PicksSession | null> {
    const session = await this.sessions.loadFromToken(request.header('authorization'))
    if (!session) {
      response.unauthorized({ error: 'Invalid or unknown order link' })
      return null
    }
    if (session.createdAt < DateTime.now().minus({ days: PICKS_RETENTION_DAYS })) {
      response.gone({
        error: `Results are kept for ${PICKS_RETENTION_DAYS} days and this order has expired`,
      })
      return null
    }
    return session
  }
}
