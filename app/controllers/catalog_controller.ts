import type { HttpContext } from '@adonisjs/core/http'

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'
import crypto from 'crypto'
import Photo, { PhotoDescriptions } from '#models/photo'
import User from '#models/user'
import UploadAudit from '#models/upload_audit'
import PhotoManager from '../managers/photo_manager.js'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CacheInvalidationService } from '../services/cache_invalidation_service.js'
import DuplicatesService from '#services/duplicates_service'
import ModelsService from '#services/models_service'
import db from '@adonisjs/lucid/services/db'

import HealthPhotoService from '#services/health_photo_service'
import DescriptionChunk from '#models/descriptionChunk'
import NoteTagsService, { NOTE_TAGS_CATEGORY } from '#services/note_tags_service'
import CreditService from '#services/credit_service'
import UserCostService from '#services/user_cost_service'
import { CostTracker } from '../utils/cost_tracker.js'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

const UPLOAD_URL_TTL_SECONDS = 60 * 60

/**
 * Tope de palabras de una nota personal. El cliente ya lo avisa mientras se
 * escribe; aquí es lo que acota el coste de la llamada que deriva sus tags.
 */
const NOTE_MAX_WORDS = 50

export default class CatalogController {
  /**
   * Genera URLs firmadas S3 para subir a R2.
   * Se mantiene como fallback mientras se despliega el Worker de subida.
   */
  private async generateS3SignedUrls(key: string, thumbnailKey: string, contentType: string) {
    const originalCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    })

    const thumbnailCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: thumbnailKey,
      ContentType: contentType,
    })

    return Promise.all([
      getSignedUrl(s3, originalCommand, { expiresIn: 3600 }),
      getSignedUrl(s3, thumbnailCommand, { expiresIn: 3600 }),
    ])
  }

  private getUploadWorkerBaseUrl(): string | null {
    const rawBaseUrl = process.env.R2_UPLOAD_WORKER_URL || process.env.IMAGES_WORKER
    if (!rawBaseUrl || !process.env.R2_UPLOAD_WORKER_SECRET) {
      return null
    }

    const trimmedBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '')
    if (trimmedBaseUrl.startsWith('http://') || trimmedBaseUrl.startsWith('https://')) {
      return trimmedBaseUrl
    }

    return `https://${trimmedBaseUrl}`
  }

  private buildUploadWorkerSignature(key: string, contentType: string, expiresAt: number): string {
    const secret = process.env.R2_UPLOAD_WORKER_SECRET
    if (!secret) {
      throw new Error('R2 upload worker secret is not configured')
    }

    return crypto
      .createHmac('sha256', secret)
      .update(`${key}\n${contentType}\n${expiresAt}`)
      .digest('hex')
  }

  private buildUploadWorkerUrl(key: string, contentType: string): string | null {
    const uploadWorkerBaseUrl = this.getUploadWorkerBaseUrl()
    if (!uploadWorkerBaseUrl) {
      return null
    }

    const expiresAt = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS
    const uploadUrl = new URL(`/upload/${encodeURIComponent(key)}`, `${uploadWorkerBaseUrl}/`)

    uploadUrl.searchParams.set('contentType', contentType)
    uploadUrl.searchParams.set('expires', String(expiresAt))
    uploadUrl.searchParams.set(
      'signature',
      this.buildUploadWorkerSignature(key, contentType, expiresAt)
    )

    return uploadUrl.toString()
  }

  private async generateUploadUrls(key: string, thumbnailKey: string, contentType: string) {
    const uploadUrl = this.buildUploadWorkerUrl(key, contentType)
    const thumbnailUploadUrl = this.buildUploadWorkerUrl(thumbnailKey, contentType)

    if (uploadUrl && thumbnailUploadUrl) {
      return [uploadUrl, thumbnailUploadUrl] as const
    }

    return this.generateS3SignedUrls(key, thumbnailKey, contentType)
  }

  /**
   * Genera claves únicas para las fotos
   */
  private generatePhotoKeys(userId: string, fileType?: string) {
    const id = crypto.randomUUID()
    const extension = fileType?.includes('webp')
      ? '.webp'
      : fileType?.includes('png')
        ? '.png'
        : '.jpg'
    const key = `main/${userId}/${id}${extension}`
    const thumbnailKey = `thumbs/${userId}/${id}${extension}`
    return { key, thumbnailKey, extension }
  }

  /**
   * Normaliza una lista de IDs de foto para validaciones de ownership.
   */
  private normalizePhotoIds(rawIds: unknown): number[] {
    if (!Array.isArray(rawIds)) {
      return []
    }

    const normalized = rawIds
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0)

    return [...new Set(normalized)]
  }

  /**
   * Devuelve los IDs que no pertenecen al usuario autenticado
   * (incluye IDs inexistentes para evitar operaciones parciales silenciosas).
   */
  private async getNonOwnedPhotoIds(userId: string, photoIds: number[]): Promise<number[]> {
    const uniqueIds = [...new Set(photoIds)]
    if (uniqueIds.length === 0) {
      return []
    }

    const ownedRows = await db
      .from('photos')
      .select('id')
      .where('user_id', userId)
      .whereIn('id', uniqueIds)

    const ownedIds = new Set(ownedRows.map((row) => Number(row.id)))
    return uniqueIds.filter((id) => !ownedIds.has(id))
  }

  /**
   * Unificado: Sube foto local o de Google Photos según el campo 'source'.
   * Body: { fileType, originalName, source?: 'local' | 'google', googlePhotoId? }
   */
  public async uploadPhoto({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const authUser = auth.use('api').user! as any
      const userId = authUser.id.toString()

      // Get full user from database to check email confirmation status
      const user = await User.find(authUser.id)
      if (!user) {
        return response.unauthorized({
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        })
      }

      // Check if email is confirmed
      if (!user.isEmailConfirmed) {
        return response.status(403).json({
          message: 'Please confirm your email address before uploading photos.',
          code: 'EMAIL_NOT_CONFIRMED',
        })
      }

      const {
        fileType,
        originalName: originalFileName,
        source = { type: 'local' },
        exifData,
      } = request.only(['fileType', 'originalName', 'source', 'exifData'])

      if (!fileType || !originalFileName) {
        return response.badRequest({ message: 'Faltan datos' })
      }

      const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
      if (!ALLOWED_MIME_TYPES.includes(fileType)) {
        return response.badRequest({ message: 'Tipo de archivo no permitido' })
      }

      const { key, thumbnailKey } = this.generatePhotoKeys(userId, fileType)
      const [uploadUrl, thumbnailUploadUrl] = await this.generateUploadUrls(
        key,
        thumbnailKey,
        fileType
      )

      // Guarda en base de datos

      const uploadIp =
        request.header('x-forwarded-for')?.split(',')[0]?.trim() || request.ip() || null

      const descriptions: PhotoDescriptions = exifData ? { EXIF: exifData } : {}
      descriptions.source = source
      const photo = await Photo.create({
        name: key,
        thumbnailName: thumbnailKey,
        originalFileName,
        userId: Number(userId),
        descriptions,
        uploadIp,
        // Para dar tiempo a que los frontales web actualicen cache, dejamos `confirmed` a true directamente.
        // Para los preferred source Lightroom si lo ponemos a 'false' directamente.
        confirmed: source.type === 'lightroom' ? false : true,
        // source,
      })

      // Immutable provenance log (chain-of-custody). Truly non-blocking: a failure here
      // must never break the upload. Decoupled from photos so it survives deletion.
      UploadAudit.create({
        userId: Number(userId),
        photoId: photo.id,
        objectKey: key,
        thumbnailKey,
        originalFileName,
        contentType: fileType,
        uploadIp,
        userAgent: request.header('user-agent')?.slice(0, 1024) ?? null,
      }).catch((auditError) => {
        console.error('Failed to write upload audit log for photo', photo.id, auditError)
      })

      await CacheInvalidationService.onPhotoListChanged(userId)

      return response.ok({
        uploadUrl,
        thumbnailUploadUrl,
        photo,
      })
    } catch (error) {
      console.error('Error preparando URLs de subida:', error)
      return response.internalServerError({ message: 'Error generando URLs' })
    }
  }

  /**
   * Confirms that a photo's main + thumbnail bytes have successfully landed in R2.
   * Called by the client right after both uploads succeed. Promotes `confirmed`
   * from `false` to `true` so the orphan sweep won't soft-delete the row.
   * POST /catalog/confirmUpload
   * Body: { photoIds: number[] }  (also tolerates a single { id })
   */
  public async confirmUpload({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { photoIds, id } = request.only(['photoIds', 'id'])
      const rawIds = Array.isArray(photoIds) ? photoIds : id != null ? [id] : []
      const ids = rawIds
        .map((value: any) => Number(value))
        .filter((n: number) => Number.isInteger(n))

      if (ids.length === 0) {
        return response.badRequest({ message: 'photoIds[] is required' })
      }

      // Only flip rows owned by the user that are still unconfirmed. Legacy rows
      // (confirmed = null) and already-confirmed rows are left untouched.
      // Uses db.from() directly to bypass the @beforeFetch hook (which now filters
      // out confirmed=false rows) — this is intentionally targeting those rows.
      await db
        .from('photos')
        .where('user_id', userId)
        .whereIn('id', ids)
        .where('confirmed', false)
        .update({ confirmed: true })

      return response.ok({ confirmed: ids })
    } catch (error) {
      console.error('Error confirmando subida:', error)
      return response.internalServerError({ message: 'Error confirmando la subida' })
    }
  }

  public async getPhoto({ response, params }: HttpContext) {
    const photoManager = new PhotoManager()
    const id = params.id
    try {
      const photo = await photoManager.getPhoto(id)
      return response.ok(photo)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async getPhotos({ response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id.toString()

    const photoManager = new PhotoManager()
    try {
      const photosJson = await photoManager.getPhotosPreviewResponseJson(userId)
      return response.header('Content-Type', 'application/json; charset=utf-8').send(photosJson)
      // const photos = await photoManager.getPhotosPreview(userId)
      // return response.ok({ photos })
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async getPhotosByIds({ response, request, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any

    const photoManager = new PhotoManager()
    try {
      const query = request.body()
      const result = await photoManager.getPhotosByIds(query.photosIds, user.id)
      return response.ok(result)
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  // ...existing code...

  public async deletePhotos({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { ids: rawIds } = request.only(['ids'])
      const ids = this.normalizePhotoIds(rawIds)

      if (ids.length === 0) {
        return response.badRequest({ message: 'No photo IDs provided' })
      }

      const nonOwnedIds = await this.getNonOwnedPhotoIds(userId, ids)
      if (nonOwnedIds.length > 0) {
        return response.forbidden({
          message: 'One or more photos do not belong to the authenticated user',
          photoIds: nonOwnedIds,
        })
      }

      const photoManager = new PhotoManager()
      const result = await photoManager.deletePhotos(ids, userId)
      return response.ok(result)
    } catch (error) {
      console.error('Error al eliminar fotos:', error)
      return response.internalServerError({ message: 'Error eliminando las fotos' })
    }
  }

  public async checkSimilarDuplicates({ request, response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id.toString()

    const { newPhotoIds, scope } = request.only(['newPhotoIds', 'scope'])

    const results = await new DuplicatesService().checkSimilarDuplicates(userId, newPhotoIds, scope)
    return response.ok(results)
  }

  public async checkExactDuplicates({ request, response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id.toString()

    const { newPhotoIds, scope } = request.only(['newPhotoIds', 'scope'])

    const results = await new DuplicatesService().checkExactDuplicates(userId, newPhotoIds, scope)
    return response.ok(results)
  }

  public async deleteDuplicates({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const photoManager = new PhotoManager()

      const { duplicates }: { duplicates: number[] } = request.only(['duplicates'])
      if (!duplicates || duplicates.length < 2) {
        return response.badRequest({
          message: 'Se necesitan al menos dos fotos para comparar duplicados',
        })
      }

      const healthReports = await Promise.all(
        duplicates.map(async (id) => ({
          id,
          ...(await HealthPhotoService.photoHealth(id)),
        }))
      )

      // Ordenar: primero por `ok` (false antes que true), luego por longitud de `missing`
      const sorted = healthReports.sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? 1 : -1
        return b.missing.length - a.missing.length
      })

      // Mantener la más sana (última), borrar el resto
      const toDelete = sorted.slice(0, -1)
      const deleted = toDelete.map((photo) => photo.id)

      if (deleted.length > 0) {
        await photoManager.deletePhotos(deleted, userId)
      }

      return response.ok({
        message: 'Duplicados eliminados',
        kept: sorted.at(-1)!.id,
        deleted,
      })
    } catch (error) {
      console.error('Error eliminando duplicados:', error)
      return response.internalServerError({ message: 'Error eliminando duplicados' })
    }
  }

  /**
   * Guarda, actualiza o borra la nota personal de una foto.
   * POST /catalog/:id/note
   * Body: { note: string }  — una cadena vacía borra la nota.
   *
   * Una nota deja tres rastros, y editarla los rehace los tres enteros:
   *  - `descriptions.notes`, el texto tal cual lo escribió el usuario;
   *  - un chunk 'notes' con su embedding, que puntúa contra la consulta completa;
   *  - los tags de categoría 'notes', que son los que meten la nota en la
   *    búsqueda por tags, en el `content_tags` del chat y en el filtro rápido.
   * Sólo los tags cuestan una llamada a un LLM, y se le cobran al usuario.
   */
  public async savePhotoNote({ response, auth, params, request }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { note } = request.only(['note'])

      // Borrar la nota es mandar la cadena vacía, pero aquí llega como `null`:
      // el bodyparser tiene `convertEmptyStringsToNull` activado para JSON. Un
      // campo ausente sí es error — no es lo mismo pedir el borrado que olvidarse
      // de mandar el texto.
      if (note === undefined) {
        return response.badRequest({ message: 'Falta el campo note' })
      }
      if (note !== null && typeof note !== 'string') {
        return response.badRequest({ message: 'La nota debe ser texto' })
      }

      const trimmedNote = note === null ? '' : note.trim()
      const wordCount = trimmedNote ? trimmedNote.split(/\s+/).length : 0
      if (wordCount > NOTE_MAX_WORDS) {
        return response.badRequest({
          message: `La nota no puede superar las ${NOTE_MAX_WORDS} palabras`,
        })
      }

      const photo = await Photo.query().where('id', params.id).where('user_id', userId).first()

      if (!photo) {
        return response.notFound({ message: 'Foto no encontrada' })
      }

      const descriptions: PhotoDescriptions = { ...(photo.descriptions ?? {}) }

      // ── Borrado ───────────────────────────────────────────────
      // Sin texto no queda nada que buscar: se van con él el chunk y los tags.
      if (trimmedNote.length === 0) {
        delete descriptions.notes
        photo.descriptions = descriptions
        await photo.save()

        await DescriptionChunk.query()
          .where('photo_id', photo.id)
          .where('category', NOTE_TAGS_CATEGORY)
          .delete()
        await NoteTagsService.clear(photo.id)

        await CacheInvalidationService.onPhotoTagsChanged(userId)

        return response.ok({
          message: 'Nota eliminada',
          photo: { id: photo.id, note: null },
          tags: [],
          tagsGenerated: true,
          creditsCharged: 0,
        })
      }

      // ── Texto ─────────────────────────────────────────────────
      // Lo primero que se persiste: es lo único que el usuario ha escrito a mano
      // y lo único que no se puede volver a derivar si algo falla más abajo.
      descriptions.notes = trimmedNote
      photo.descriptions = descriptions
      await photo.save()

      // ── Chunk ─────────────────────────────────────────────────
      const modelsService = new ModelsService()
      const { embeddings } = await modelsService.getEmbeddingsCPU([trimmedNote])

      if (!embeddings || embeddings.length === 0) {
        return response.internalServerError({
          message: 'Error generando embedding para la nota',
        })
      }

      const existingChunk = await DescriptionChunk.query()
        .where('photo_id', photo.id)
        .where('category', NOTE_TAGS_CATEGORY)
        .first()

      if (existingChunk) {
        existingChunk.chunk = trimmedNote
        existingChunk.embedding = embeddings[0]
        await existingChunk.save()
      } else {
        const descriptionChunk = new DescriptionChunk()
        descriptionChunk.photoId = photo.id
        descriptionChunk.chunk = trimmedNote
        descriptionChunk.category = NOTE_TAGS_CATEGORY
        descriptionChunk.embedding = embeddings[0]
        await descriptionChunk.save()
      }

      // ── Tags ──────────────────────────────────────────────────
      const tracker = new CostTracker('notes_tags')
      tracker.setCurrentTask('note_tags_extraction')

      // Best-effort a propósito: la nota ya está guardada, y quedarse sin tags
      // no puede convertirse en un error que le diga al usuario lo contrario.
      // `tagsGenerated: false` es lo que le deja reintentar volviendo a guardar.
      let tags: { name: string; group: string }[] = []
      let tagsGenerated = true
      try {
        const rebuilt = await NoteTagsService.rebuild(photo.id, trimmedNote, tracker, userId)
        tags = rebuilt.tags
        tagsGenerated = rebuilt.ok
      } catch (error) {
        tagsGenerated = false
        console.error('Error rehaciendo los tags de la nota:', error)
      }

      let creditsCharged = 0
      const costEur = tracker.getSummary().totalCostInEur
      if (costEur > 0) {
        try {
          creditsCharged = await CreditService.charge(user.id, costEur, 'NOTED_TAGS_GENERATION')
          UserCostService.recordFromTracker(user.id, tracker, `photo:${photo.id}`).catch(() => {})
        } catch (error) {
          console.error('Error cobrando los tags de la nota:', error)
        }
      }

      await CacheInvalidationService.onPhotoTagsChanged(userId)

      return response.ok({
        message: 'Nota guardada exitosamente',
        photo: {
          id: photo.id,
          note: trimmedNote,
        },
        tags,
        tagsGenerated,
        creditsCharged,
      })
    } catch (error) {
      console.error('Error guardando nota de foto:', error)
      return response.internalServerError({ message: 'Error guardando nota de la foto' })
    }
  }

  /**
   * Marca/actualiza el flag de curación de una foto (estilo Lightroom, 3 estados).
   * POST /catalog/:id/flag
   * Body: { flag: 'picked' | 'rejected' | null }
   */
  public async setPhotoFlag({ request, response, auth, params }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { flag } = request.only(['flag'])
      if (flag !== null && flag !== 'picked' && flag !== 'rejected') {
        return response.badRequest({ message: "flag debe ser 'picked', 'rejected' o null" })
      }

      const photo = await Photo.query().where('id', params.id).where('user_id', userId).first()
      if (!photo) {
        return response.notFound({ message: 'Foto no encontrada' })
      }

      photo.flag = flag
      await photo.save()

      await CacheInvalidationService.onPhotoListChanged(userId)

      return response.ok({ id: photo.id, flag })
    } catch (error) {
      console.error('Error guardando flag de foto:', error)
      return response.internalServerError({ message: 'Error guardando el flag de la foto' })
    }
  }

  /**
   * Reemplaza fotos analizadas en workspace con una nueva foto de lightbox.
   * La nueva foto física (R2 keys) reemplaza a las analizadas, que conservan sus datos de análisis.
   * POST /catalog/swapPhotos
   * Body: { newPhotoId: number, targetPhotoIds: number[] }
   */
  public async swapPhotos({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { newPhotoId, targetPhotoIds } = request.only(['newPhotoId', 'targetPhotoIds'])
      const normalizedTargetIds = Array.isArray(targetPhotoIds)
        ? [...new Set(targetPhotoIds.map((value: any) => Number(value)).filter(Number.isInteger))]
        : []

      if (!newPhotoId || normalizedTargetIds.length === 0) {
        return response.badRequest({ message: 'newPhotoId and targetPhotoIds[] are required' })
      }

      if (normalizedTargetIds.includes(Number(newPhotoId))) {
        return response.badRequest({
          message: 'newPhotoId cannot be included in targetPhotoIds[]',
        })
      }

      // Verify the new (lightbox) photo exists and belongs to user
      const newPhoto = await Photo.query().where('id', newPhotoId).where('user_id', userId).first()

      if (!newPhoto) {
        return response.notFound({ message: 'New photo not found' })
      }

      // Verify all target photos exist and belong to user
      const targetPhotos = await Photo.query()
        .whereIn('id', normalizedTargetIds)
        .where('user_id', userId)

      if (targetPhotos.length === 0) {
        return response.notFound({ message: 'No target photos found' })
      }

      const bucket = process.env.R2_BUCKET!
      // Extract extension from the source key (e.g. ".jpg", ".webp", ".png")
      const ext = newPhoto.name.match(/(\.[^./]+)$/)?.[1] ?? '.jpg'

      // Copy newPhoto's R2 objects to fresh unique keys for every target BEFORE
      // touching the database. This preserves the invariant: every active photo
      // row owns its R2 object exclusively, so deletion can never orphan siblings.
      const copyResults = await Promise.all(
        targetPhotos.map(async (target) => {
          const freshId = crypto.randomUUID()
          const newKey = `main/${userId}/${freshId}${ext}`
          const newThumbnailKey = `thumbs/${userId}/${freshId}${ext}`

          await s3.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${newPhoto.name}`,
              Key: newKey,
            })
          )

          await s3.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${newPhoto.thumbnailName}`,
              Key: newThumbnailKey,
            })
          )

          return {
            target,
            newKey,
            newThumbnailKey,
            oldKey: target.name,
            oldThumbnailKey: target.thumbnailName,
          }
        })
      )

      // All copies succeeded — update the database
      const oldR2Keys: string[] = []
      const swapped: number[] = []

      for (const { target, newKey, newThumbnailKey, oldKey, oldThumbnailKey } of copyResults) {
        oldR2Keys.push(oldKey)
        if (oldThumbnailKey) oldR2Keys.push(oldThumbnailKey)

        target.name = newKey
        target.thumbnailName = newThumbnailKey
        target.originalFileName = newPhoto.originalFileName
        target.dhash = null
        await target.save()
        swapped.push(target.id)
      }

      // Delete the old R2 objects — each was exclusively owned by its target row
      if (oldR2Keys.length > 0) {
        try {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: [...new Set(oldR2Keys)].map((Key) => ({ Key })),
                Quiet: true,
              },
            })
          )
        } catch (err) {
          console.warn('⚠️ Failed to delete old R2 files during swap:', err)
        }
      }

      // Delete the source lightbox photo through PhotoManager so uploaded
      // photos are hard-deleted quickly in background (R2 + DB cleanup).

      await new PhotoManager().deletePhotos([newPhoto.id], userId)

      // Swap mantiene IDs pero cambia media/URLs: invalida tambien caches dependientes de media.
      await CacheInvalidationService.onPhotoListChanged(userId)

      return response.ok({
        message: 'Photos swapped successfully',
        swapped,
        deletedNewPhotoId: newPhotoId,
      })
    } catch (error) {
      console.error('Error swapping photos:', error)
      return response.internalServerError({ message: 'Error swapping photos' })
    }
  }

  /**
   * Records a single "photos_uploaded" activity after a batch upload completes.
   * Body: { count: number, source?: string }

   */
  public async uploadFinished({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').authenticate()
      const { count, source } = request.only(['count', 'source'])

      if (typeof count !== 'number' || count < 1) {
        return response.badRequest({ message: 'count must be a positive number' })
      }

      return response.ok({ count, source: source ?? null })
    } catch (error) {
      console.error('Error recording upload batch:', error)
      return response.internalServerError({ message: 'Error recording upload batch' })
    }
  }
}
