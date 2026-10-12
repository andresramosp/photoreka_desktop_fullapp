import type { HttpContext } from '@adonisjs/core/http'

import Photo from '#models/photo'
import User from '#models/user'
import ModelsService from '#services/models_service'
import UserCostService from '#services/user_cost_service'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import { MESSAGE_DAILY_PHOTO_EUREKA } from '../utils/prompts/descriptions.js'
import PhotoImageService from '#services/photo_image_service'
import PhotoManager from '../managers/photo_manager.js'

export default class InsightsController {
  // ─── Private helpers ──────────────────────────────────────────────────────

  private getPrimaryPhotoGenre(photo: Photo): string | null {
    const visualAspects = (photo.descriptions?.visual_aspects ?? {}) as Record<string, any>
    const rawGenre = visualAspects.genre
    const genre = Array.isArray(rawGenre) ? rawGenre[0] : rawGenre
    return typeof genre === 'string' && genre.trim().length > 0 ? genre.trim().toLowerCase() : null
  }

  /** Carga la foto elegida con los campos que necesita el endpoint. */
  private loadEurekaPhoto(userId: string, photoId: number) {
    return Photo.query()
      .where('id', photoId)
      .where('user_id', userId)
      .select('id', 'descriptions', 'name', 'thumbnail_name', 'original_file_name')
      .first()
  }

  /**
   * Una foto procesada al azar de entre las que este usuario aún no ha visto.
   * Cuando ya las ha visto todas se vacía la lista y el ciclo vuelve a empezar.
   */
  private async selectDailyEurekaPhoto(userId: string, user: User): Promise<Photo | null> {
    const shownIds = new Set<number>(user.insightsState?.shownPhotoIds ?? [])
    const processedIds = await new PhotoManager().getProcessedPhotoIds(userId)

    let pool = processedIds.filter((id) => !shownIds.has(id))

    // Vistas todas las procesadas: se reinicia el ciclo
    if (pool.length === 0 && shownIds.size > 0) {
      await User.query()
        .where('id', userId)
        .update({ insights_state: JSON.stringify({ shownPhotoIds: [] }) })
      pool = processedIds
    }

    if (pool.length === 0) return null

    const chosenId = pool[Math.floor(Math.random() * pool.length)]
    return (await this.loadEurekaPhoto(userId, chosenId)) ?? null
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
}
