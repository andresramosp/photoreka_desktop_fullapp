import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import db from '@adonisjs/lucid/services/db'
import TagManager from '../managers/tag_manager.js'

export default class TagsController {
  private readonly tagManager = new TagManager()

  public async list({ response, auth }: HttpContext) {
    const user = auth.use('api').user!

    if (!user) {
      return response.unauthorized({ message: 'User not authenticated' })
    }

    const result = await Tag.all()
    return response.ok({ result })
  }

  // Buscar tags asociados a las fotos del usuario
  public async search({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user
    if (!user) {
      return response.unauthorized({ message: 'User not authenticated' })
    }

    const term = request.input('term', '').toLowerCase()

    // Consulta: obtener los tags de las fotos del usuario
    const rawResult = await db.rawQuery(
      `
      SELECT DISTINCT ON (t.name) t.id, t.name, t."group"
      FROM photos p
      JOIN tags_photos tp ON tp.photo_id = p.id
      JOIN tags t ON t.id = tp.tag_id
      WHERE p.user_id = ?
        AND LOWER(t.name) LIKE ?
        AND p.deleted_at IS NULL
      ORDER BY t.name, t.id DESC
      `,
      [user.id, `%${term}%`]
    )

    const result = rawResult.rows.sort((a: any, b: any) => a.name.length - b.name.length)
    return response.ok({ result })
  }

  public async treemap({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user
    if (!user) {
      return response.unauthorized({ message: 'User not authenticated' })
    }

    const rawTags = request.input('tags', [])
    const selectedTags = (Array.isArray(rawTags) ? rawTags : String(rawTags).split(','))
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20)
    const rawIncludeContained = request.input('includeContained', false)
    const includeContained = rawIncludeContained === true || rawIncludeContained === 'true'
    const rawMainTags = request.input('mainTags', false)
    const mainTags = rawMainTags === true || rawMainTags === 'true'
    const limit = Math.min(Math.max(Number(request.input('limit', 80)) || 80, 1), 200)

    if (!mainTags && selectedTags.length === 0) {
      return response.ok({
        result: {
          tags: [],
          totalPhotos: 0,
          selectedTags,
          includeContained,
          mainTags,
        },
      })
    }

    const { tags, totalPhotos } = await this.tagManager.getTreemap(
      String(user.id),
      mainTags,
      selectedTags,
      includeContained,
      limit
    )

    return response.ok({
      result: {
        tags,
        totalPhotos,
        selectedTags,
        includeContained,
        mainTags,
      },
    })
  }
}
