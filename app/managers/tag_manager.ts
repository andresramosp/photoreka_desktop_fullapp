import Tag, { TagGroups } from '#models/tag'
import VectorService from '#services/vector_service'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { withCache } from '../decorators/withCache.js'
import Logger from '../utils/logger.js'
import db from '@adonisjs/lucid/services/db'
import PhotoManager from './photo_manager.js'

const logger = Logger.getInstance('AnalyzerService')

const INCLUDED_MAIN_TAG_GROUPS = ['person', 'animals', 'objects', 'toponym', 'symbols']

export type TreemapTag = {
  id: number | string
  name: string
  group: string | null
  photoCount: number
  /** Share of the whole catalog (photoCount / totalPhotos). */
  percentage: number
  /** Share among the returned/compared tags only (photoCount / sum of all returned photoCounts) — use this for "X% vs Y%" statements between the requested tags. */
  relativePercentage: number
}

export type TreemapResult = {
  tags: TreemapTag[]
  totalPhotos: number
}

export type TopTag = {
  id: number
  name: string
  group: string | null
  photoCount: number
  /** Share of the user's processed catalog (photoCount / totalPhotos). */
  percentage: number
}

export type TopTagsResult = {
  tags: TopTag[]
  totalPhotos: number
}

export default class TagManager {
  constructor() {}

  // Crea un nuevo Tag
  public async createTag(data: Partial<Tag>): Promise<Tag> {
    const tag = await Tag.create(data)
    return tag
  }

  // Obtiene un Tag por su ID
  public async getTagById(id: string): Promise<Tag> {
    const tag = await Tag.find(id)
    if (!tag) {
      throw new Error('Tag not found')
    }
    return tag
  }

  public async getTagByNameAndGroup(name: string, group: TagGroups): Promise<Tag | null> {
    return Tag.query().where('name', name.trim().toLowerCase()).andWhere('group', group).first()
  }

  // Busca tags reales del usuario que contengan `term` (autocomplete / verificación de existencia)
  public async searchTagNamesForUser(
    userId: string,
    term: string,
    limit?: number
  ): Promise<{ id: number; name: string; group: string | null }[]> {
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
      [userId, `%${term.trim().toLowerCase()}%`]
    )
    const rows = rawResult.rows.sort((a: any, b: any) => a.name.length - b.name.length)
    return limit ? rows.slice(0, limit) : rows
  }

  // Obtiene todos los Tags
  @withCache({
    key: (userId) => `getTagsByUser_${userId}`,
    provider: 'redis',
    ttl: 60 * 60 * 12,
  })
  public async getTagsByUser(userId: string): Promise<Tag[]> {
    // Busca los tags asociados a las fotos del usuario, sin duplicados
    const tags = await Tag.query()
      .join('tags_photos', 'tags_photos.tag_id', 'tags.id')
      .join('photos', 'photos.id', 'tags_photos.photo_id')
      .where('photos.user_id', userId)
      .distinct('tags.id')
      .select('tags.*')
    return tags
  }

  /**
   * Tags más presentes en el catálogo del usuario, opcionalmente acotados a
   * ciertos grupos y/o a ciertas categorías de origen. Alimenta la barra de
   * quick search del Workspace.
   *
   * `categories` filtra por `tags_photos.category`, que es de dónde salió el
   * tag. Sirve para pedir una familia entera sin depender de su frecuencia: los
   * tags de nota personal ('notes') suelen tener una o dos fotos cada uno, así
   * que ordenados por frecuencia nunca entrarían en el top de un catálogo
   * grande, y son justo los que el usuario quiere a un clic.
   *
   * A diferencia de `getTreemap`, el universo de fotos es `getProcessedPhotoIds`:
   * es la lista canónica de fotos que cuentan en la app, así que un tag que solo
   * aparece en fotos a medio analizar no puede colarse entre los predominantes.
   */
  @withCache({
    provider: 'redis',
    key: (userId, groups: string[], limit, categories: string[] = []) =>
      `getTopTags:${userId}:${(groups ?? []).join(',')}:${limit}:${(categories ?? []).join(',')}`,
    ttl: 60 * 60 * 12, // 12h — invalidado al cambiar las fotos del usuario
  })
  public async getTopTags(
    userId: string,
    groups: string[],
    limit: number,
    categories: string[] = []
  ): Promise<TopTagsResult> {
    const photoIds = await new PhotoManager().getProcessedPhotoIds(userId)
    if (photoIds.length === 0) return { tags: [], totalPhotos: 0 }

    const normalizedGroups = (groups ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean)
    const normalizedCategories = (categories ?? [])
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)

    const bindings: any[] = [`{${photoIds.join(',')}}`]
    if (normalizedGroups.length > 0) bindings.push(normalizedGroups.join('|'))
    if (normalizedCategories.length > 0) bindings.push(normalizedCategories.join('|'))
    bindings.push(limit)

    const rawResult = await db.rawQuery(
      `
      SELECT
        t.id,
        t.name,
        t."group",
        COUNT(DISTINCT tp.photo_id)::int AS photo_count
      FROM tags_photos tp
      JOIN tags t ON t.id = tp.tag_id
      WHERE tp.photo_id = ANY(?::int[])
      ${normalizedGroups.length > 0 ? `AND LOWER(t."group") = ANY(string_to_array(?, '|'))` : ''}
      ${normalizedCategories.length > 0 ? `AND LOWER(tp.category) = ANY(string_to_array(?, '|'))` : ''}
      GROUP BY t.id, t.name, t."group"
      ORDER BY photo_count DESC, t.name ASC
      LIMIT ?
      `,
      bindings
    )

    const totalPhotos = photoIds.length
    const tags: TopTag[] = rawResult.rows.map((row: any) => ({
      id: Number(row.id),
      name: row.name,
      group: row.group,
      photoCount: Number(row.photo_count),
      percentage: Number(((Number(row.photo_count) / totalPhotos) * 100).toFixed(2)),
    }))

    return { tags, totalPhotos }
  }

  // Actualiza un Tag existente
  public async updateTag(id: string, data: Partial<Tag>): Promise<Tag> {
    const tag = await Tag.find(id)
    if (!tag) {
      throw new Error('Tag not found')
    }
    Object.assign(tag, data)
    await tag.save()
    return tag
  }

  // Elimina un Tag por su ID
  public async deleteTag(id: string): Promise<{ message: string }> {
    const tag = await Tag.find(id)
    if (!tag) {
      throw new Error('Tag not found')
    }
    await tag.delete()
    return { message: 'Tag deleted successfully' }
  }

  // @MeasureExecutionTime
  /**
   * Get-or-create SIN fusión por similitud: el tag se busca por nombre+grupo
   * exactos y, si no existe, se crea tal cual.
   *
   * Es lo que necesitan los tags de nota personal. `getOrCreateSimilarTag`
   * colapsa contra cualquier tag del catálogo global a 0.89 de coseno, así que
   * "my wife" acabaría resolviendo al tag "wife" que ya existe — y con él se
   * pierde justo la frase con la que el usuario va a buscar.
   */
  public async getOrCreateExactTag(
    tag: Partial<Tag> & { name: string; group: TagGroups },
    embedding?: number[]
  ): Promise<Tag> {
    const name = tag.name.trim().toLowerCase()

    const existingTag = await this.getTagByNameAndGroup(name, tag.group)
    if (existingTag) return existingTag

    try {
      const newTag = new Tag()
      newTag.name = name
      newTag.group = tag.group
      if (embedding) newTag.embedding = embedding
      await newTag.save()
      return newTag
    } catch (err: any) {
      // Carrera con otra petición que creó el mismo tag entre el SELECT y el INSERT.
      if (err.code === '23505') {
        const concurrentTag = await this.getTagByNameAndGroup(name, tag.group)
        if (concurrentTag) return concurrentTag
      }
      throw err
    }
  }

  public async getOrCreateSimilarTag(
    tag: Partial<Tag> & { name: string; group: TagGroups },
    embedding: number[]
  ): Promise<Tag> {
    // logger.debug(`Buscando tag: ${tag.name} (${tag.group})`)
    const vectorService = new VectorService()

    // 1. Buscar tag exacto
    const existingTag = await this.getTagByNameAndGroup(tag.name, tag.group)
    if (existingTag) {
      logger.debug(`Tag exacto encontrado: ${existingTag.name} (ID: ${existingTag.id})`)
      return existingTag
    }

    // 2. Buscar tags similares (consulta directa a la tabla tags sin joins para
    //    evitar el agotamiento de shared memory en Railway)
    let similarTagsResult: any[] = []
    try {
      logger.debug(`Buscando tags similares para: ${tag.name}`)
      similarTagsResult = (await vectorService.findSimilarTagDirect(embedding, 0.89, 5)) || []
      // logger.debug(`Resultados de búsqueda similar:`, similarTagsResult)
    } catch (error) {
      logger.error(`Error al buscar tags similares:`, error)
      // No lanzamos el error, continuamos con la creación de nuevo tag
    }

    if (similarTagsResult.length > 0) {
      const similarTag = similarTagsResult[0]
      if (!similarTag.tag_id) {
        // logger.error(`Tag similar encontrado pero sin tag_id:`, similarTag)
        // Si no tiene tag_id, continuamos con la creación de nuevo tag
      } else {
        similarTag.id = similarTag.tag_id
        logger.info(`Usando tag similar: ${similarTag.name} (ID: ${similarTag.id})`)
        return similarTag
      }
    }

    // 3. Crear nuevo tag
    try {
      logger.debug(`Creando nuevo tag: ${tag.name} (${tag.group})`)
      const newTag = new Tag()
      newTag.name = tag.name
      newTag.group = tag.group
      // El hook @beforeSave se encargará de formatear el embedding
      newTag.embedding = embedding
      await newTag.save()
      logger.debug(`Nuevo tag creado exitosamente: ${newTag.name} (ID: ${newTag.id})`)
      return newTag
    } catch (err: any) {
      if (err.code === '23505') {
        logger.debug(`Tag ${tag.name} ya existe, buscando nuevamente...`)
        const concurrentTag = await this.getTagByNameAndGroup(tag.name, tag.group)
        if (concurrentTag) {
          logger.debug(
            `Tag concurrente encontrado: ${concurrentTag.name} (ID: ${concurrentTag.id})`
          )
          return concurrentTag
        }
      }
      logger.error(`Error al crear tag ${tag.name}:`)
      throw new Error(`No se pudo crear o recuperar el tag: ${tag.name}. Error: ${err.message}`)
    }
  }

  @withCache({
    provider: 'redis',
    key: (userId, mainTags, selectedTags: (string | string[])[], includeContained, limit) =>
      `getTreemap:${userId}:${mainTags}:${JSON.stringify(selectedTags ?? [])}:${includeContained}:${limit}`,
    ttl: 60 * 60 * 12, // 12h — cheap query, invalidated on photo changes
  })
  public async getTreemap(
    userId: string,
    mainTags: boolean,
    // Each entry is one compared category: a single tag name, or an array of
    // synonyms to merge into a single combined category (e.g. ["motorcycle", "motorbike"]).
    selectedTags: (string | string[])[],
    includeContained: boolean,
    limit: number
  ): Promise<TreemapResult> {
    if (!mainTags) {
      // label = display name for the category (first synonym); pattern = all synonyms
      // joined for the SQL match, so photos tagged with ANY of them count once (DISTINCT).
      const groups = selectedTags.map((entry) => {
        const synonyms = (Array.isArray(entry) ? entry : [entry]).map((s) =>
          s.trim().toLowerCase()
        )
        return { label: synonyms[0], pattern: synonyms.join('|') }
      })
      const valuesSql = groups.map(() => '(?, ?)').join(', ')
      const rawResult = await db.rawQuery(
        `
          WITH selected_terms(name, pattern) AS (
            VALUES ${valuesSql}
          ),
          user_photos AS (
            SELECT p.id
            FROM photos p
            WHERE p.user_id = ?
              AND p.deleted_at IS NULL
              AND p.confirmed IS NOT FALSE
          ),
          user_total AS (
            SELECT COUNT(*)::int AS total FROM user_photos
          )
          SELECT
            selected_terms.name,
            MIN(t.id) AS id,
            MIN(t."group") AS "group",
            COUNT(DISTINCT p.id)::int AS photo_count,
            (SELECT total FROM user_total) AS total_photos
          FROM selected_terms
          LEFT JOIN tags t ON ${
            includeContained
              ? // Plain capturing group, NOT (?:...) — knex's raw-query binding scanner
                // regex-matches literal "?" chars anywhere in the SQL text, including inside
                // string literals, so a non-capturing group's "?" would be miscounted as an
                // extra bind placeholder.
                `LOWER(t.name) ~ ('\\m(' || selected_terms.pattern || ')\\M')`
              : `LOWER(t.name) = ANY(string_to_array(selected_terms.pattern, '|'))`
          }
          LEFT JOIN tags_photos tp ON tp.tag_id = t.id
          LEFT JOIN user_photos p ON p.id = tp.photo_id
          GROUP BY selected_terms.name
          ORDER BY photo_count DESC, selected_terms.name ASC
          `,
        [...groups.flatMap((g) => [g.label, g.pattern]), userId]
      )

      const totalPhotos = Number(rawResult.rows[0]?.total_photos || 0)
      const matchedRows = rawResult.rows.filter((row: any) => Number(row.photo_count) > 0)
      const sumPhotoCount = matchedRows.reduce(
        (acc: number, row: any) => acc + Number(row.photo_count),
        0
      )
      const tags: TreemapTag[] = matchedRows.map((row: any) => ({
        id: row.id || row.name,
        name: row.name,
        group: row.group,
        photoCount: Number(row.photo_count),
        percentage:
          totalPhotos > 0 ? Number(((Number(row.photo_count) / totalPhotos) * 100).toFixed(2)) : 0,
        relativePercentage:
          sumPhotoCount > 0
            ? Number(((Number(row.photo_count) / sumPhotoCount) * 100).toFixed(2))
            : 0,
      }))

      return { tags, totalPhotos }
    }

    const rawResult = await db.rawQuery(
      `
      WITH user_photos AS (
        SELECT p.id
        FROM photos p
        WHERE p.user_id = ?
          AND p.deleted_at IS NULL
          AND p.confirmed IS NOT FALSE
      ),
      user_total AS (
        SELECT COUNT(*)::int AS total FROM user_photos
      )
      SELECT
        t.id,
        t.name,
        t."group",
        COUNT(DISTINCT tp.photo_id)::int AS photo_count,
        (SELECT total FROM user_total) AS total_photos
      FROM user_photos mp
      JOIN tags_photos tp ON tp.photo_id = mp.id
      JOIN tags t ON t.id = tp.tag_id
      WHERE t."group" IS NULL OR LOWER(t."group") IN (?, ?, ?, ?, ?)
      GROUP BY t.id, t.name, t."group"
      ORDER BY photo_count DESC, t.name ASC
      LIMIT ?
      `,
      [userId, ...INCLUDED_MAIN_TAG_GROUPS, limit]
    )

    const totalPhotos = Number(rawResult.rows[0]?.total_photos || 0)
    const sumPhotoCount = rawResult.rows.reduce(
      (acc: number, row: any) => acc + Number(row.photo_count),
      0
    )
    const tags: TreemapTag[] = rawResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      group: row.group,
      photoCount: Number(row.photo_count),
      percentage:
        totalPhotos > 0 ? Number(((Number(row.photo_count) / totalPhotos) * 100).toFixed(2)) : 0,
      relativePercentage:
        sumPhotoCount > 0
          ? Number(((Number(row.photo_count) / sumPhotoCount) * 100).toFixed(2))
          : 0,
    }))

    return { tags, totalPhotos }
  }
}
