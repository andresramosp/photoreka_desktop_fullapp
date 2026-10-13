import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

import Photo from '#models/photo'
import User from '#models/user'
import PhotoManager from '../managers/photo_manager.js'
import { isDesktopFileKey, photoEureka } from '#desktop/cloud_functions'

/**
 * Escritorio: el eureka diario se hace en la nube (prompt, foto original de R2 y modelo), que no lo
 * cobra y le pone un tope diario. Solo puede usar fotos con archivos en la carpeta del escritorio.
 */

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
    const desktopIds = new Set<number>(
      (
        await db.from('photos').where('user_id', userId).whereLike('thumbnail_name', 'desktop/%').select('id')
      ).map((row: { id: number }) => row.id)
    )
    const processedIds = (await new PhotoManager().getProcessedPhotoIds(userId)).filter((id) =>
      desktopIds.has(id)
    )

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
  public async photoInsight({ response, auth, params }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as User
      const userId = user.id.toString()

      let photo: Photo

      if (params.id) {
        const foundPhoto = await Photo.query()
          .where('id', params.id)
          .where('user_id', userId)
          .first()

        if (!foundPhoto || !isDesktopFileKey(foundPhoto.thumbnailName)) {
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

      const photoGenre = this.getPrimaryPhotoGenre(photo)
      const insightResult = await photoEureka(user.id, {
        // La main se borra al terminar el análisis: el eureka mira la miniatura.
        key: photo.thumbnailName,
        genre: photoGenre,
        visualAspects: (photo.descriptions?.visual_aspects ?? {}) as Record<string, unknown>,
        profile: user?.profiles ?? null,
      })

      const insight =
        typeof insightResult === 'string'
          ? insightResult
          : insightResult?.insight ||
            insightResult?.response ||
            insightResult?.evaluation ||
            insightResult?.technical ||
            insightResult?.cultural ||
            ''

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
