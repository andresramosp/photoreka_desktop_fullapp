import Tag, { TagGroups } from '#models/tag'
import VectorService from '#services/vector_service'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { withCache } from '../decorators/withCache.js'
import Logger from '../utils/logger.js'
import db from '@adonisjs/lucid/services/db'

const logger = Logger.getInstance('AnalyzerService')

const INCLUDED_MAIN_TAG_GROUPS = ['person', 'animals', 'objects', 'toponym', 'symbols']

export type TreemapTag = {
  id: number | string
  name: string
  group: string | null
  photoCount: number
  percentage: number
}

export type TreemapResult = {
  tags: TreemapTag[]
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
    key: (userId, mainTags, selectedTags: string[], includeContained, limit) =>
      `getTreemap:${userId}:${mainTags}:${(selectedTags ?? []).join(',')}:${includeContained}:${limit}`,
    ttl: 60 * 60 * 12, // 12h — cheap query, invalidated on photo changes
  })
  public async getTreemap(
    userId: string,
    mainTags: boolean,
    selectedTags: string[],
    includeContained: boolean,
    limit: number
  ): Promise<TreemapResult> {
    if (!mainTags) {
      const valuesSql = selectedTags.map(() => '(?)').join(', ')
      const rawResult = await db.rawQuery(
        `
          WITH selected_terms(name) AS (
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
              ? `LOWER(t.name) ~ ('\\m' || selected_terms.name || '\\M')`
              : `LOWER(t.name) = selected_terms.name`
          }
          LEFT JOIN tags_photos tp ON tp.tag_id = t.id
          LEFT JOIN user_photos p ON p.id = tp.photo_id
          GROUP BY selected_terms.name
          ORDER BY photo_count DESC, selected_terms.name ASC
          `,
        [...selectedTags, userId]
      )

      const totalPhotos = Number(rawResult.rows[0]?.total_photos || 0)
      const tags: TreemapTag[] = rawResult.rows
        .filter((row: any) => Number(row.photo_count) > 0)
        .map((row: any) => ({
          id: row.id || row.name,
          name: row.name,
          group: row.group,
          photoCount: Number(row.photo_count),
          percentage:
            totalPhotos > 0
              ? Number(((Number(row.photo_count) / totalPhotos) * 100).toFixed(2))
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
    const tags: TreemapTag[] = rawResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      group: row.group,
      photoCount: Number(row.photo_count),
      percentage:
        totalPhotos > 0 ? Number(((Number(row.photo_count) / totalPhotos) * 100).toFixed(2)) : 0,
    }))

    return { tags, totalPhotos }
  }
}
