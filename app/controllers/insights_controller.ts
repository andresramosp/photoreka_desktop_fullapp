import type { HttpContext } from '@adonisjs/core/http'

import Photo from '#models/photo'
import User from '#models/user'
import ModelsService from '#services/models_service'
import UserCostService from '#services/user_cost_service'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import {
  MESSAGE_DAILY_PHOTO_EUREKA,
  getMessagePhotoInsightSpecific,
} from '../utils/prompts/descriptions.js'
import PhotoImageService from '#services/photo_image_service'

// Minimum simple-average artistic score for a photo to enter the Eureka pool.
const EUREKA_SCORE_THRESHOLD = 5.5

export default class InsightsController {
  // ─── Private helpers ──────────────────────────────────────────────────────

  private getPrimaryPhotoGenre(photo: Photo): string | null {
    const visualAspects = (photo.descriptions?.visual_aspects ?? {}) as Record<string, any>
    const rawGenre = visualAspects.genre
    const genre = Array.isArray(rawGenre) ? rawGenre[0] : rawGenre
    return typeof genre === 'string' && genre.trim().length > 0 ? genre.trim().toLowerCase() : null
  }

  /**
   * Returns a random photo from the pool of candidates (score >= threshold,
   * not yet shown to this user). Resets the seen list when the pool is
   * exhausted so the cycle restarts automatically.
   */
  private eligibleQuery(userId: string) {
    return Photo.query()
      .where('user_id', userId)
      .whereNotNull('descriptions')
      .whereRaw(
        `(SELECT AVG(value::numeric) FROM jsonb_each_text((descriptions->'artistic_scores'))) >= ?`,
        [EUREKA_SCORE_THRESHOLD]
      )
      .select('id', 'descriptions', 'name', 'thumbnail_name', 'original_file_name')
  }

  private async selectDailyEurekaPhoto(userId: string, user: User): Promise<Photo | null> {
    const shownIds: number[] = user.insightsState?.shownPhotoIds ?? []

    // Primary: eligible + not yet shown
    let pool = await this.eligibleQuery(userId).if(shownIds.length > 0, (q) =>
      q.whereNotIn('id', shownIds)
    )

    // All eligible photos have been shown — reset and start a new cycle
    if (pool.length === 0 && shownIds.length > 0) {
      await User.query()
        .where('id', userId)
        .update({ insights_state: JSON.stringify({ shownPhotoIds: [] }) })
      pool = await this.eligibleQuery(userId)
    }

    if (pool.length > 0) {
      return pool[Math.floor(Math.random() * pool.length)]
    }

    // Fallback: any photo with descriptions (score below threshold)
    const fallback = await Photo.query()
      .where('user_id', userId)
      .whereNotNull('descriptions')
      .select('id', 'descriptions', 'name', 'thumbnail_name', 'original_file_name')
      .first()

    return fallback ?? null
  }

  private async markPhotoAsShown(userId: string, user: User, photoId: number): Promise<void> {
    const shownIds: number[] = user.insightsState?.shownPhotoIds ?? []
    if (!shownIds.includes(photoId)) {
      shownIds.push(photoId)
      await User.query()
        .where('id', userId)
        .update({
          insights_state: JSON.stringify({ shownPhotoIds: shownIds }),
        })
    }
  }

  // ─── Endpoints ───────────────────────────────────────────────────────────

  /**
   * Daily Eureka: returns a single, adaptive insight for a contextually
   * selected photo (weighted by profile + scores). Passing `:id` overrides
   * the automatic selection.
   * GET /api/insights/photoInsight/:id?
   */
  public async photoInsight({ response, auth, params, request }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as User
      const userId = user.id.toString()

      const provider = request.qs().provider || 'gemini'

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
        const selectedPhoto = await this.selectDailyEurekaPhoto(userId, user)

        if (!selectedPhoto) {
          return response.notFound({ message: 'No tienes fotos disponibles' })
        }

        photo = selectedPhoto
      }

      const tracker = new CostTracker('other')
      tracker.setCurrentTask('insights_photo_eureka')
      const modelsService = createTrackedModelsService(new ModelsService(), tracker)
      const visualAspects = (photo.descriptions?.visual_aspects ?? {}) as Record<string, any>
      const artisticScores = (photo.descriptions?.artistic_scores ?? {}) as Record<string, any>
      const photoGenre = this.getPrimaryPhotoGenre(photo)
      const systemPrompt = MESSAGE_DAILY_PHOTO_EUREKA(user?.profiles, photoGenre, visualAspects)

      let insightResult: any = {}

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

        insightResult = gptResponse?.result || {}
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
          'gemini-3.1-flash-lite',
          {
            temperature: 0.6,
          },
          true,
          undefined,
          { thinkingLevel: 'medium', includeThoughts: false }
        )

        imagePayload.inlineData.data = ''
        insightResult = geminiResponse?.result || {}
      }

      const insight =
        typeof insightResult === 'string'
          ? insightResult
          : insightResult?.insight ||
            insightResult?.response ||
            insightResult?.evaluation ||
            insightResult?.technical ||
            insightResult?.cultural ||
            ''

      UserCostService.recordFromTracker(user.id, tracker).catch(() => {})
      this.markPhotoAsShown(userId, user, photo.id).catch(() => {})

      return response.ok({
        photo: {
          id: photo.id,
          originalFileName: photo.originalFileName,
          thumbnailUrl: photo.thumbnailUrl,
          originalUrl: photo.originalUrl,
        },
        insight,
        genre: photoGenre,
      })
    } catch (error) {
      console.error('Error generando insights de foto:', error)
      return response.internalServerError({ message: 'Error generando insights de la foto' })
    }
  }

  /**
   * Targeted insight of a specific type (cultural / technical / artistic / custom)
   * for a given photo. Used by PhotoInfoDialog.
   * POST /api/insights/photoInsightSpecific/:id?
   */
  public async photoInsightSpecific({ response, auth, params, request }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id.toString()

      const { provider = 'gemini', type, question, history } = request.body() || {}
      const insightType = type as 'cultural' | 'technical' | 'artistic' | 'custom'
      const customQuestion = question as string | undefined
      const chatHistory = Array.isArray(history) ? history : []

      if (!insightType || !['cultural', 'technical', 'artistic', 'custom'].includes(insightType)) {
        return response.badRequest({
          message: 'Tipo de insight inválido. Usa: cultural, technical, artistic o custom',
        })
      }

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

      const tracker = new CostTracker('other')
      const insightTaskName =
        insightType === 'custom'
          ? 'insights_photo_specific_custom'
          : `insights_photo_specific_${insightType}`
      tracker.setCurrentTask(insightTaskName)
      const modelsService = createTrackedModelsService(new ModelsService(), tracker)
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

        insights = gptResponse?.result || []
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
        insights = geminiResponse?.result || []
      }

      UserCostService.recordFromTracker(user.id, tracker).catch(() => {})

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
}
