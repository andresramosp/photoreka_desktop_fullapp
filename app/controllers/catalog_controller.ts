import type { HttpContext } from '@adonisjs/core/http'

import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import Photo, { PhotoDescriptions } from '#models/photo'
import User from '#models/user'
import PhotoManager from '../managers/photo_manager.js'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { invalidateCache, invalidateCacheByPattern } from '../decorators/withCache.js'
import VectorService from '#services/vector_service'
import ModelsService from '#services/models_service'
import UserCostService from '#services/user_cost_service'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'

import HealthPhotoService from '#services/health_photo_service'
import {
  MESSAGE_PHOTO_INSIGHTS,
  MESSAGE_PHOTO_INSIGHTS_WITH_SCORES,
  MESSAGE_PHOTO_INSIGHT_CULTURAL,
  MESSAGE_PHOTO_INSIGHT_TECHNICAL,
  MESSAGE_PHOTO_INSIGHT_ARTISTIC,
  MESSAGE_PHOTO_INSIGHT_CUSTOM,
  getMessagePhotoInsights,
  getMessagePhotoInsightsWithScores,
  getMessagePhotoInsightSpecific,
} from '../utils/prompts/descriptions.js'
import PhotoImageService from '#services/photo_image_service'
import DescriptionChunk from '#models/descriptionChunk'
import { computeDHash, DHASH_DUPLICATE_THRESHOLD } from '../utils/dhash.js'
import pLimit from 'p-limit'
import axios from 'axios'
import CpuWorkerPool from '#services/cpu_worker_pool'

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

const UPLOAD_URL_TTL_SECONDS = 60 * 15

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
  private generatePhotoKeys(fileType?: string) {
    const id = crypto.randomUUID()
    const extension = fileType?.includes('webp')
      ? '.webp'
      : fileType?.includes('png')
        ? '.png'
        : '.jpg'
    const key = `${id}${extension}`
    const thumbnailKey = `${id}-thumb${extension}`
    return { key, thumbnailKey, extension }
  }

  /**
   * Invalida cache del usuario
   */
  private async invalidateUserCache(userId: string) {
    await invalidateCache(`getPhotosByUser_${userId}`)
    await invalidateCacheByPattern(`getPhotosIdsForSearch:${userId}:*`)
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

      const { key, thumbnailKey } = this.generatePhotoKeys(fileType)
      const [uploadUrl, thumbnailUploadUrl] = await this.generateUploadUrls(
        key,
        thumbnailKey,
        fileType
      )

      // Guarda en base de datos

      const descriptions: PhotoDescriptions = exifData ? { EXIF: exifData } : {}
      descriptions.source = source
      const photo = await Photo.create({
        name: key,
        thumbnailName: thumbnailKey,
        originalFileName,
        userId: Number(userId),
        descriptions,
        // source,
      })

      await this.invalidateUserCache(userId)

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
      const photos = await photoManager.getPhotosPreview(userId)
      return response.ok({ photos })
    } catch (error) {
      console.error('Error fetching photos:', error)
      return response.internalServerError({ message: 'Error fetching photos' })
    }
  }

  public async getPhotosByIds({ response, request }: HttpContext) {
    const photoManager = new PhotoManager()
    try {
      const query = request.body()
      const result = await photoManager.getPhotosByIds(query.photosIds)
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

      const { ids } = request.only(['ids'])
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return response.badRequest({ message: 'No photo IDs provided' })
      }

      const photoManager = new PhotoManager()
      const result = await photoManager.deletePhotos(ids, userId)
      return response.ok(result)
    } catch (error) {
      console.error('Error al eliminar fotos:', error)
      return response.internalServerError({ message: 'Error eliminando las fotos' })
    }
  }

  public async checkDuplicates({ request, response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id.toString()

    const { newPhotoIds } = request.only(['newPhotoIds'])

    const vectorService = new VectorService()

    const userPhotos = await Photo.query().where('user_id', userId)

    // 2. Selección de fotos nuevas
    const newPhotos =
      !newPhotoIds || newPhotoIds.length === 0
        ? userPhotos
        : userPhotos.filter((p) => newPhotoIds.includes(p.id))

    // 3. Buscar duplicados usando similitud de embeddings (paralelizado)
    const results: Record<number, number[]> = {}

    await Promise.all(
      newPhotos.map(async (newPhoto) => {
        if (!newPhoto.embedding) return

        const similarPhotos = await vectorService.findSimilarPhotoToEmbedding(
          VectorService.getParsedEmbedding(newPhoto.embedding)!!,
          0.92,
          5,
          'cosine_similarity',
          userPhotos.map((p) => p.id)
        )

        const matches = similarPhotos
          .filter((match: any) => match.id !== newPhoto.id)
          .map((match: any) => match.id)

        if (matches.length > 0) {
          results[newPhoto.id] = matches
        }
      })
    )

    return response.ok(results)
  }

  public async checkExactDuplicates({ request, response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id.toString()

    const { newPhotoIds, scope } = request.only(['newPhotoIds', 'scope'])

    let userPhotos: Photo[]

    if (scope === 'workspace') {
      // Workspace: only compare processed photos (finished, non-preprocess analyzer)
      userPhotos = await Photo.query()
        .where('user_id', userId)
        .whereHas('analyzerProcess', (query) => {
          query.where('is_preprocess', false).where('current_stage', 'finished')
        })
    } else {
      // Lightbox: compare against all user photos
      userPhotos = await Photo.query().where('user_id', userId)
    }

    const photosToCheck =
      !newPhotoIds || newPhotoIds.length === 0
        ? userPhotos
        : userPhotos.filter((p) => newPhotoIds.includes(p.id))

    // Compute dHash on-the-fly: use cached DB value if available, otherwise download via public URL
    const limit = pLimit(10)
    const photoHashes: { id: number; hash: string }[] = []

    await Promise.all(
      userPhotos.map((photo) =>
        limit(async () => {
          try {
            let hash = photo.dhash
            if (!hash) {
              const res = await axios.get(photo.thumbnailUrl, { responseType: 'arraybuffer' })
              const buffer = Buffer.from(res.data)
              hash = await computeDHash(buffer)
              photo.dhash = hash
              await photo.save()
            }
            photoHashes.push({ id: photo.id, hash })
          } catch {
            // skip photo if unreachable
          }
        })
      )
    )

    // Offload CPU-heavy pairwise comparison to a worker thread
    const photosToCheckIds = photosToCheck.map((p) => p.id)
    const results = await CpuWorkerPool.run<Record<number, number[]>>('dhash_compare', {
      photoHashes,
      photosToCheckIds,
      threshold: DHASH_DUPLICATE_THRESHOLD,
    })

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
      const deleted: number[] = []
      for (const photo of toDelete) {
        await photoManager.deletePhotos([photo.id], userId)
        deleted.push(photo.id)
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

  public async photoInsight({ response, auth, params, request }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const provider = request.qs().provider || 'gemini'
      const withScores = request.qs().withScores === 'true'

      let photo: Photo

      if (params.id) {
        const foundPhoto = await Photo.query()
          .where('id', params.id)
          .where('user_id', userId)
          .first()

        if (!foundPhoto) {
          return response.notFound({ message: 'Foto no encontrada' })
        }
        photo = foundPhoto
      } else {
        const userPhotos = await Photo.query().where('user_id', userId)

        if (userPhotos.length === 0) {
          return response.notFound({ message: 'No tienes fotos disponibles' })
        }

        const randomIndex = Math.floor(Math.random() * userPhotos.length)
        photo = userPhotos[randomIndex]
      }

      const tracker = new CostTracker('other')
      const modelsService = createTrackedModelsService(new ModelsService(), tracker)
      let systemPrompt: string

      if (withScores && photo.descriptions?.artistic_scores) {
        systemPrompt = getMessagePhotoInsightsWithScores(
          user?.profiles,
          photo.descriptions.artistic_scores
        )
      } else {
        systemPrompt = getMessagePhotoInsights(user?.profiles)
      }

      let insights = []

      if (provider === 'gpt') {
        const imagePayload = [
          {
            type: 'image_url',
            image_url: {
              url: photo.originalUrl,
              detail: 'low',
            },
          },
        ]

        const gptResponse = await modelsService.getGPTResponse(
          systemPrompt,
          imagePayload,
          'gpt-5.1',
          { type: 'json_object' },
          0.6,
          false
        )

        insights = gptResponse.result || []
      } else {
        const base64 = await PhotoImageService.getInstance().getImageBase64FromR2(photo.name, false)

        const imagePayload = {
          inlineData: {
            mimeType: 'image/png',
            data: base64,
          },
        }

        const geminiResponse = await modelsService.getGeminiResponse(
          systemPrompt,
          [imagePayload],
          'gemini-2.5-flash-lite',
          {
            temperature: 0.6,
          }
        )

        imagePayload.inlineData.data = ''
        insights = geminiResponse.result || []
      }

      UserCostService.recordFromTracker(user.id, tracker).catch(() => {})

      return response.ok({
        photo: {
          id: photo.id,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
        },
        ...insights,
      })
    } catch (error) {
      console.error('Error generando insights de foto:', error)
      return response.internalServerError({ message: 'Error generando insights de la foto' })
    }
  }

  public async photoInsightSpecific({ response, auth, params, request }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      // Recibir todos los parámetros del body
      const { provider = 'gemini', type, question, history } = request.body() || {}
      const insightType = type as 'cultural' | 'technical' | 'artistic' | 'custom'
      const customQuestion = question as string | undefined
      const chatHistory = Array.isArray(history) ? history : []

      // Validación del tipo de insight
      if (!insightType || !['cultural', 'technical', 'artistic', 'custom'].includes(insightType)) {
        return response.badRequest({
          message: 'Tipo de insight inválido. Usa: cultural, technical, artistic o custom',
        })
      }

      // Si es custom, se requiere una pregunta
      if (insightType === 'custom' && !customQuestion) {
        return response.badRequest({
          message: 'Para el tipo "custom" debes proporcionar un parámetro "question"',
        })
      }

      let photo: Photo

      if (params.id) {
        const foundPhoto = await Photo.query()
          .where('id', params.id)
          .where('user_id', userId)
          .first()

        if (!foundPhoto) {
          return response.notFound({ message: 'Foto no encontrada' })
        }
        photo = foundPhoto
      } else {
        const userPhotos = await Photo.query().where('user_id', userId)

        if (userPhotos.length === 0) {
          return response.notFound({ message: 'No tienes fotos disponibles' })
        }

        const randomIndex = Math.floor(Math.random() * userPhotos.length)
        photo = userPhotos[randomIndex]
      }

      // Seleccionar el prompt según el tipo
      const tracker2 = new CostTracker('other')
      const modelsService = createTrackedModelsService(new ModelsService(), tracker2)
      let systemPrompt: string

      switch (insightType) {
        case 'cultural':
        case 'technical':
        case 'artistic':
          systemPrompt = getMessagePhotoInsightSpecific(insightType, user?.profiles)
          break
        case 'custom':
          systemPrompt = getMessagePhotoInsightSpecific('custom', user?.profiles, customQuestion!)
          break
      }

      // Construir el prompt con el historial integrado
      let fullPrompt = systemPrompt

      if (chatHistory.length > 0) {
        fullPrompt += '\n\n--- Historial de la conversación ---\n'
        chatHistory.forEach((msg: any) => {
          const role = msg.role === 'user' ? 'Usuario' : 'Asistente'
          fullPrompt += `${role}: ${msg.content}\n`
        })
        fullPrompt += '--- Fin del historial ---\n\n'
      }

      let insights = []

      if (provider === 'gpt') {
        const imagePayload = [
          {
            type: 'image_url',
            image_url: {
              url: photo.originalUrl,
              detail: 'low',
            },
          },
        ]

        const gptResponse = await modelsService.getGPTResponse(
          fullPrompt,
          imagePayload,
          'gpt-5.1',
          { type: 'json_object' },
          0.6,
          false
        )

        insights = gptResponse.result || []
      } else {
        const base64 = await PhotoImageService.getInstance().getImageBase64FromR2(photo.name, false)

        const imagePayload = {
          inlineData: {
            mimeType: 'image/png',
            data: base64,
          },
        }

        const geminiResponse = await modelsService.getGeminiResponse(
          fullPrompt,
          [imagePayload],
          'gemini-2.5-flash-lite',
          {
            temperature: 0.6,
          }
        )

        imagePayload.inlineData.data = ''
        insights = geminiResponse.result || []
      }

      UserCostService.recordFromTracker(user.id, tracker2).catch(() => {})

      return response.ok({
        photo: {
          id: photo.id,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
        },
        insightType,
        ...insights,
      })
    } catch (error) {
      console.error('Error generando insight específico:', error)
      return response.internalServerError({ message: 'Error generando insight de la foto' })
    }
  }

  /**
   * Guarda o actualiza una nota sobre una foto y genera su embedding
   * POST /catalog/:id/note
   * Body: { note: string }
   */
  public async savePhotoNote({ response, auth, params, request }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { note } = request.only(['note'])

      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        return response.badRequest({ message: 'La nota no puede estar vacía' })
      }

      // Verificar que la foto existe y pertenece al usuario
      const photo = await Photo.query().where('id', params.id).where('user_id', userId).first()

      if (!photo) {
        return response.notFound({ message: 'Foto no encontrada' })
      }

      // Actualizar el campo descriptions.notes
      const descriptions = photo.descriptions || {}
      descriptions.notes = note.trim()
      photo.descriptions = descriptions
      await photo.save()

      // Generar embedding para la nota
      const modelsService = new ModelsService()
      const { embeddings } = await modelsService.getEmbeddingsCPU([note.trim()])

      if (!embeddings || embeddings.length === 0) {
        return response.internalServerError({
          message: 'Error generando embedding para la nota',
        })
      }

      // Buscar si ya existe un chunk de tipo "notes" para esta foto
      const existingChunk = await DescriptionChunk.query()
        .where('photo_id', photo.id)
        .where('category', 'notes')
        .first()

      if (existingChunk) {
        // Actualizar el chunk existente
        existingChunk.chunk = note.trim()
        existingChunk.embedding = embeddings[0]
        await existingChunk.save()
      } else {
        // Crear un nuevo chunk
        const descriptionChunk = new DescriptionChunk()
        descriptionChunk.photoId = photo.id
        descriptionChunk.chunk = note.trim()
        descriptionChunk.category = 'notes'
        descriptionChunk.embedding = embeddings[0]
        await descriptionChunk.save()
      }

      await this.invalidateUserCache(userId)

      return response.ok({
        message: 'Nota guardada exitosamente',
        photo: {
          id: photo.id,
          note: note.trim(),
        },
      })
    } catch (error) {
      console.error('Error guardando nota de foto:', error)
      return response.internalServerError({ message: 'Error guardando nota de la foto' })
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

      if (
        !newPhotoId ||
        !targetPhotoIds ||
        !Array.isArray(targetPhotoIds) ||
        targetPhotoIds.length === 0
      ) {
        return response.badRequest({ message: 'newPhotoId and targetPhotoIds[] are required' })
      }

      // Verify the new (lightbox) photo exists and belongs to user
      const newPhoto = await Photo.query().where('id', newPhotoId).where('user_id', userId).first()

      if (!newPhoto) {
        return response.notFound({ message: 'New photo not found' })
      }

      // Verify all target photos exist and belong to user
      const targetPhotos = await Photo.query()
        .whereIn('id', targetPhotoIds)
        .where('user_id', userId)

      if (targetPhotos.length === 0) {
        return response.notFound({ message: 'No target photos found' })
      }

      // Collect old R2 keys from targets that will be replaced
      const oldR2Keys: string[] = []
      for (const target of targetPhotos) {
        oldR2Keys.push(target.name)
        if (target.thumbnailName) oldR2Keys.push(target.thumbnailName)
      }

      // Update each target photo's R2 keys to point to the new photo's files
      const swapped: number[] = []
      for (const target of targetPhotos) {
        target.name = newPhoto.name
        target.thumbnailName = newPhoto.thumbnailName
        target.originalFileName = newPhoto.originalFileName
        // Reset dhash so it gets recomputed on next duplicate check
        target.dhash = null
        await target.save()
        swapped.push(target.id)
      }

      // Delete old R2 files that are no longer referenced
      if (oldR2Keys.length > 0) {
        try {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: process.env.R2_BUCKET,
              Delete: {
                Objects: oldR2Keys.map((Key) => ({ Key })),
                Quiet: true,
              },
            })
          )
        } catch (err) {
          console.warn('⚠️ Failed to delete old R2 files during swap:', err)
        }
      }

      // Soft-delete the new photo record (its R2 files are now used by targets)
      newPhoto.deletedAt = (await import('luxon')).DateTime.now()
      await newPhoto.save()

      await this.invalidateUserCache(userId)

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
}
