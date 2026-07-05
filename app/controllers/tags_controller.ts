import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
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

    const result = await this.tagManager.searchTagNamesForUser(String(user.id), term)
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
