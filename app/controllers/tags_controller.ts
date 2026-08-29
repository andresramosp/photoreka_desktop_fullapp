import type { HttpContext } from '@adonisjs/core/http'
import Tag, { tagGroups } from '#models/tag'
import TagManager from '../managers/tag_manager.js'

const VALID_TAG_GROUPS = new Set<string>(tagGroups)

/**
 * Categorías de `tags_photos` que el cliente puede pedir: el origen del tag,
 * no su familia semántica. Se valida contra esta lista para que el parámetro no
 * sea una vía de entrada libre al filtro SQL.
 */
const VALID_TAG_CATEGORIES = new Set<string>([
  'context_story',
  'visual_accents',
  'visual_aspects',
  'artistic_scores',
  'notes',
])

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

  /**
   * Tags predominantes del usuario, acotados a los grupos que pida el cliente y,
   * opcionalmente, a ciertas categorías de origen (`tags_photos.category`).
   * Grupos y categorías desconocidos se descartan en silencio; sin ninguno
   * válido se consideran todos, que es lo que el llamante espera al no acotar.
   */
  public async top({ request, response, auth }: HttpContext) {
    const user = auth.use('api').user
    if (!user) {
      return response.unauthorized({ message: 'User not authenticated' })
    }

    const rawGroups = request.input('groups', [])
    const groups = (Array.isArray(rawGroups) ? rawGroups : String(rawGroups).split(','))
      .map((group) => String(group).trim().toLowerCase())
      .filter((group) => VALID_TAG_GROUPS.has(group))

    const rawCategories = request.input('categories', [])
    const categories = (
      Array.isArray(rawCategories) ? rawCategories : String(rawCategories).split(',')
    )
      .map((category) => String(category).trim().toLowerCase())
      .filter((category) => VALID_TAG_CATEGORIES.has(category))

    const limit = Math.min(Math.max(Number(request.input('limit', 5)) || 5, 1), 200)

    const { tags, totalPhotos } = await this.tagManager.getTopTags(
      String(user.id),
      groups,
      limit,
      categories
    )

    return response.ok({ result: { tags, totalPhotos, groups, categories } })
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
