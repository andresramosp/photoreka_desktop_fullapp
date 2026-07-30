// @ts-nocheck

import Tag from '#models/tag'
import db from '@adonisjs/lucid/services/db'
import ModelsService from './models_service.js'
import Photo, { DescriptionType } from '#models/photo'
import NodeCache from 'node-cache'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import { createRequire } from 'module'
import colorsys from 'colorsys'

const require = createRequire(import.meta.url)
const pluralize = require('pluralize')

const cache = new NodeCache({ stdTTL: 3600 })

interface ScoredPhoto {
  photo: Photo
  tagScore?: number // Puntuación por tags
  descScore?: number // Puntuación por embeddings
  totalScore?: number // Puntaje total calculado
}

// Definición para threshold que puede ser número o intervalo
type Threshold = number | { min: number; max: number }

export default class VectorService {
  public modelsService: ModelsService = null

  constructor() {
    this.modelsService = new ModelsService()
  }

  // @MeasureExecutionTime
  public async findSimilarChunkToEmbedding(
    embedding: number[],
    threshold: Threshold = 0.3,
    limit: number = 10,
    metric: 'distance' | 'inner_product' | 'cosine_similarity' = 'cosine_similarity',
    photoIds?: number[],
    categories?: string[],
    areas?: string[],
    opposite: boolean = false
  ) {
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding no proporcionado o vacío')
    }

    const embeddingString = `[${embedding.join(',')}]`

    // Fallback exacto para opposite ya que no usa el índice ANN de la misma forma
    if (opposite) {
      let metricQuery: string = ''
      let whereCondition: string = ''
      let orderBy: string = ''
      let additionalParams: any = {}
      let thresholdCondition = ''

      if (typeof threshold === 'number') {
        if (metric === 'distance') {
          metricQuery = 'embedding <-> :embedding AS proximity'
          thresholdCondition = 'embedding <-> :embedding >= :threshold'
          orderBy = 'proximity DESC'
        } else if (metric === 'inner_product') {
          metricQuery = '(embedding <#> :embedding) * -1 AS proximity'
          thresholdCondition = '(embedding <#> :embedding) * -1 <= :threshold'
          orderBy = 'proximity ASC'
        } else if (metric === 'cosine_similarity') {
          metricQuery = '1 - (embedding <=> :embedding) AS proximity'
          thresholdCondition = '1 - (embedding <=> :embedding) <= :threshold'
          orderBy = 'proximity ASC'
        }
        additionalParams.threshold = threshold
      } else {
        if (metric === 'distance') {
          metricQuery = 'embedding <-> :embedding AS proximity'
          thresholdCondition = 'embedding <-> :embedding BETWEEN :minThreshold AND :maxThreshold'
          orderBy = 'proximity DESC'
        } else if (metric === 'inner_product') {
          metricQuery = '(embedding <#> :embedding) * -1 AS proximity'
          thresholdCondition =
            '(embedding <#> :embedding) * -1 BETWEEN :minThreshold AND :maxThreshold'
          orderBy = 'proximity ASC'
        } else if (metric === 'cosine_similarity') {
          metricQuery = '1 - (embedding <=> :embedding) AS proximity'
          thresholdCondition =
            '1 - (embedding <=> :embedding) BETWEEN :minThreshold AND :maxThreshold'
          orderBy = 'proximity ASC'
        }
        additionalParams.minThreshold = threshold.min
        additionalParams.maxThreshold = threshold.max
      }

      whereCondition = thresholdCondition
      if (photoIds && photoIds.length > 0) {
        whereCondition += ` AND photo_id = ANY(:photoIds)`
        additionalParams.photoIds = photoIds
      }
      if (categories && categories.length > 0) {
        whereCondition += ` AND category = ANY(:categories)`
        additionalParams.categories = categories
      }
      if (areas && areas.length > 0) {
        whereCondition += ` AND area = ANY(:areas)`
        additionalParams.areas = areas
      }

      const result = await db.rawQuery(
        `
        SELECT id, photo_id, chunk, area, category, ${metricQuery}
        FROM descriptions_chunks
        WHERE ${whereCondition}
        ORDER BY ${orderBy}
        LIMIT :limit
        `,
        { embedding: embeddingString, limit, ...additionalParams }
      )
      return result.rows
    }

    // --- Optimizaciones con subconsulta index-aware ---
    // Determina la expresión de distancia segun la métrica
    const distanceExpr =
      metric === 'distance'
        ? 'embedding <-> :embedding'
        : metric === 'inner_product'
          ? 'embedding <#> :embedding'
          : 'embedding <=> :embedding'

    // Determina el calculo de proximidad según la distancia
    const proximityExpr =
      metric === 'distance'
        ? distanceExpr
        : metric === 'inner_product'
          ? `(${distanceExpr}) * -1`
          : `1 - (${distanceExpr})`

    // Construye filtros para la subconsulta interna
    const innerFilters: string[] = []
    const rawParams: any = { embedding: embeddingString }

    if (photoIds && photoIds.length > 0) {
      innerFilters.push('photo_id = ANY(:photoIds)')
      rawParams.photoIds = photoIds
    }
    if (categories && categories.length > 0) {
      innerFilters.push('category = ANY(:categories)')
      rawParams.categories = categories
    }
    if (areas && areas.length > 0) {
      innerFilters.push('area = ANY(:areas)')
      rawParams.areas = areas
    }

    const innerWhere = innerFilters.length > 0 ? innerFilters.join(' AND ') : 'TRUE'

    // Define límites amplios para la búsqueda de vecinos más cercanos del índice y filtrar en el exterior
    const indexLimit = Math.max(limit * 20, 2000)
    rawParams.indexLimit = indexLimit
    rawParams.limit = limit

    // Condición de umbral exterior
    let outerThresholdCond = ''
    if (typeof threshold === 'number') {
      outerThresholdCond =
        metric === 'distance' ? 'proximity <= :threshold' : 'proximity >= :threshold'
      rawParams.threshold = threshold
    } else {
      outerThresholdCond = 'proximity BETWEEN :minThreshold AND :maxThreshold'
      rawParams.minThreshold = threshold.min
      rawParams.maxThreshold = threshold.max
    }

    const outerOrderBy = metric === 'distance' ? 'proximity ASC' : 'proximity DESC'

    const optimizedQuery = `
      SELECT id, photo_id, chunk, area, category, proximity
      FROM (
        SELECT id, photo_id, chunk, area, category, ${proximityExpr} AS proximity
        FROM descriptions_chunks
        WHERE ${innerWhere}
        ORDER BY ${distanceExpr} ASC
        LIMIT :indexLimit
      ) AS sub
      WHERE ${outerThresholdCond}
      ORDER BY ${outerOrderBy}
      LIMIT :limit
    `

    const result = await db.rawQuery(optimizedQuery, rawParams)
    return result.rows
  }

  // TODO: para el cuello de botella en prod: probar lo de sacar el where para que "aproveche" el index, que ahora en teoría no lo hace
  // @MeasureExecutionTime
  public async findSimilarTagToEmbedding(
    embedding: number[],
    threshold: Threshold = 0.3,
    limit: number = 10,
    metric: 'distance' | 'inner_product' | 'cosine_similarity' = 'cosine_similarity',
    tagIds?: number[],
    categories?: string[], // garantizamos que pertenece a esa categorías, pero aún no sabemos para qué foto
    areas?: string[],
    excludedGroups?: string[], // excluye tags que pertenezcan a estos grupos
    photoIds?: number[],
    opposite: boolean = false,
    // Restringe el match a tags de estos grupos, en minúsculas
    // (ver CONTENT_TAG_GROUPS en utils/content_tag_groups).
    includedGroups?: string[]
  ) {
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding no proporcionado o vacío')
    }

    const embeddingString = `[${embedding.join(',')}]`

    // Fallback exacto para opposite ya que no se comporta igual con el índice
    if (opposite) {
      let metricQuery: string = ''
      let whereCondition: string = ''
      let orderBy: string = ''
      let additionalParams: any = {}
      let thresholdCondition = ''

      if (typeof threshold === 'number') {
        if (metric === 'distance') {
          metricQuery = 'tags.embedding <-> :embedding AS proximity'
          thresholdCondition = 'tags.embedding <-> :embedding <= :threshold'
          orderBy = 'proximity ASC'
        } else if (metric === 'inner_product') {
          metricQuery = '(tags.embedding <#> :embedding) * -1 AS proximity'
          thresholdCondition = '(tags.embedding <#> :embedding) * -1 >= :threshold'
          orderBy = 'proximity DESC'
        } else if (metric === 'cosine_similarity') {
          metricQuery = '1 - (tags.embedding <=> :embedding) AS proximity'
          thresholdCondition = '1 - (tags.embedding <=> :embedding) <= :threshold'
          orderBy = 'proximity ASC'
        }
        additionalParams.threshold = threshold
      } else {
        if (metric === 'distance') {
          metricQuery = 'tags.embedding <-> :embedding AS proximity'
          thresholdCondition =
            'tags.embedding <-> :embedding BETWEEN :minThreshold AND :maxThreshold'
          orderBy = 'proximity ASC'
        } else if (metric === 'inner_product') {
          metricQuery = '(tags.embedding <#> :embedding) * -1 AS proximity'
          thresholdCondition =
            '(tags.embedding <#> :embedding) * -1 BETWEEN :minThreshold AND :maxThreshold'
          orderBy = 'proximity DESC'
        } else if (metric === 'cosine_similarity') {
          metricQuery = '1 - (tags.embedding <=> :embedding) AS proximity'
          thresholdCondition =
            '1 - (tags.embedding <=> :embedding) BETWEEN :minThreshold AND :maxThreshold'
          orderBy = 'proximity DESC'
        }
        additionalParams.minThreshold = threshold.min
        additionalParams.maxThreshold = threshold.max
      }

      const tagFilterCondition = tagIds && tagIds.length > 0 ? 'AND tags.id = ANY(:tagIds)' : ''
      const categoryFilterCondition =
        categories && categories.length > 0 ? 'AND tags_photos.category = ANY(:categories)' : ''
      const areaFilterCondition =
        areas && areas.length > 0 ? 'AND tags_photos.area = ANY(:areas)' : ''
      const excludedGroupsCondition =
        excludedGroups && excludedGroups.length > 0
          ? 'AND tags."group" != ALL(:excludedGroups)'
          : ''
      // Al buscar por familia se descartan los sustantivos derivados (los que tienen
      // parent_id): son duplicados de su tag padre y harían que el mismo concepto
      // cuente dos veces. Solo aplica a este modo para no alterar el criterio `tags`.
      const includedGroupsCondition =
        includedGroups && includedGroups.length > 0
          ? 'AND LOWER(tags."group") = ANY(:includedGroups) AND tags_photos.parent_id IS NULL'
          : ''
      const photoFilterCondition =
        photoIds && photoIds.length > 0 ? 'AND photos.id = ANY(:photoIds)' : ''

      whereCondition = `${thresholdCondition} ${tagFilterCondition} ${categoryFilterCondition} ${areaFilterCondition} ${excludedGroupsCondition} ${includedGroupsCondition} ${photoFilterCondition}`

      const result = await db.rawQuery(
        `
        SELECT DISTINCT 
          tags_photos.id AS tag_photo_id, 
          tags.id AS tag_id, 
          tags.name, 
          tags."group", 
          tags_photos.photo_id,
          tags_photos.category, 
          tags_photos.area, 
          tags.created_at, 
          tags.updated_at, 
          ${metricQuery}
        FROM tags_photos
        JOIN tags ON tags.id = tags_photos.tag_id
        JOIN photos ON photos.id = tags_photos.photo_id
        WHERE ${whereCondition}
          AND photos.deleted_at IS NULL
        ORDER BY ${orderBy}
        LIMIT :limit
        `,
        {
          embedding: embeddingString,
          limit,
          tagIds: tagIds || [],
          categories: categories || [],
          areas: areas || [],
          excludedGroups: excludedGroups || [],
          includedGroups: includedGroups || [],
          photoIds: photoIds || [],
          ...additionalParams,
        }
      )
      return result.rows
    }

    // --- Optimizaciones CTE index-aware ---
    const distanceExpr =
      metric === 'distance'
        ? 'embedding <-> :embedding'
        : metric === 'inner_product'
          ? 'embedding <#> :embedding'
          : 'embedding <=> :embedding'

    const proximityExpr =
      metric === 'distance'
        ? distanceExpr
        : metric === 'inner_product'
          ? `(${distanceExpr}) * -1`
          : `1 - (${distanceExpr})`

    // Filtros que aplican directamente a la tabla 'tags' (para optimizar la subbúsqueda)
    const tagInnerFilters: string[] = []
    const rawParams: any = {
      embedding: embeddingString,
      tagIds: tagIds || [],
      categories: categories || [],
      areas: areas || [],
      excludedGroups: excludedGroups || [],
      includedGroups: includedGroups || [],
      photoIds: photoIds || [],
    }

    if (tagIds && tagIds.length > 0) {
      tagInnerFilters.push('id = ANY(:tagIds)')
    }
    if (excludedGroups && excludedGroups.length > 0) {
      tagInnerFilters.push('"group" != ALL(:excludedGroups)')
    }
    const tagFiltersStr = tagInnerFilters.length > 0 ? tagInnerFilters.join(' AND ') : 'TRUE'

    // Límites amplios para buscar vecinos más cercanos aprovechando el índice en la tabla principal.
    // includedGroups NO se aplica aquí a propósito: meter un filtro por grupo dentro del CTE
    // inutiliza el índice ivfflat y fuerza un seq scan sobre cientos de miles de tags. Se aplica
    // después, sobre los vecinos ya recuperados; a cambio se amplía el pool para no perder recall,
    // ya que los vecinos de un tag suelen caer en su mismo grupo de todos modos.
    // 4000 es donde satura el recall: medido sobre la familia más estrecha que se
    // probó, con 2000 se quedaba en ~153/200 hits; subir a 8000 ya no aporta y
    // cuesta un 15% más.
    const hasIncludedGroups = !!(includedGroups && includedGroups.length > 0)
    const indexLimit = hasIncludedGroups ? Math.max(limit * 30, 4000) : Math.max(limit * 20, 2000)
    rawParams.indexLimit = indexLimit
    rawParams.limit = limit

    // Construye filtros para la unión externa (threshold y otros de unión)
    const outerFilters: string[] = []
    if (typeof threshold === 'number') {
      outerFilters.push(
        metric === 'distance'
          ? 'similar_tags.proximity <= :threshold'
          : 'similar_tags.proximity >= :threshold'
      )
      rawParams.threshold = threshold
    } else {
      outerFilters.push('similar_tags.proximity BETWEEN :minThreshold AND :maxThreshold')
      rawParams.minThreshold = threshold.min
      rawParams.maxThreshold = threshold.max
    }

    if (categories && categories.length > 0) {
      outerFilters.push('tags_photos.category = ANY(:categories)')
    }
    if (areas && areas.length > 0) {
      outerFilters.push('tags_photos.area = ANY(:areas)')
    }
    if (photoIds && photoIds.length > 0) {
      outerFilters.push('photos.id = ANY(:photoIds)')
    }
    if (hasIncludedGroups) {
      outerFilters.push('LOWER(similar_tags."group") = ANY(:includedGroups)')
      // Ver nota en la rama `opposite`: los derivados duplican a su tag padre.
      outerFilters.push('tags_photos.parent_id IS NULL')
    }

    const outerFiltersStr = outerFilters.join(' AND ')
    const outerOrderBy =
      metric === 'distance' ? 'similar_tags.proximity ASC' : 'similar_tags.proximity DESC'

    const optimizedQuery = `
      WITH similar_tags AS (
        SELECT
          id AS tag_id,
          name,
          "group",
          created_at,
          updated_at,
          ${proximityExpr} AS proximity
        FROM tags
        WHERE ${tagFiltersStr}
        ORDER BY ${distanceExpr} ASC
        LIMIT :indexLimit
      )
      SELECT DISTINCT
        tags_photos.id AS tag_photo_id,
        similar_tags.tag_id,
        similar_tags.name,
        similar_tags."group",
        tags_photos.photo_id,
        tags_photos.category,
        tags_photos.area,
        similar_tags.created_at,
        similar_tags.updated_at,
        similar_tags.proximity
      FROM tags_photos
      JOIN similar_tags ON similar_tags.tag_id = tags_photos.tag_id
      JOIN photos ON photos.id = tags_photos.photo_id
      WHERE photos.deleted_at IS NULL
        AND ${outerFiltersStr}
      ORDER BY ${outerOrderBy}
      LIMIT :limit
    `

    const result = await db.rawQuery(optimizedQuery, rawParams)
    return result.rows
  }

  /**
   * Finds similar tags by querying only the `tags` table without any joins.
   * Uses ORDER BY <=> so the ivfflat index can be applied, then filters by
   * threshold in-process. Avoids the DISTINCT + multi-join scan that exhausts
   * PostgreSQL shared memory on constrained environments (e.g. Railway).
   */
  public async findSimilarTagDirect(
    embedding: number[],
    threshold: number = 0.89,
    limit: number = 5
  ): Promise<{ tag_id: number; name: string; group: string; proximity: number }[]> {
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding no proporcionado o vacío')
    }

    const result = await db.rawQuery(
      `
      SELECT
        id AS tag_id,
        name,
        "group",
        1 - (embedding <=> :embedding) AS proximity
      FROM tags
      ORDER BY embedding <=> :embedding
      LIMIT :limit
      `,
      { embedding: `[${embedding.join(',')}]`, limit }
    )

    return (result.rows as any[]).filter((r) => r.proximity >= threshold)
  }

  public async findSimilarPhotoToEmbedding(
    embedding: number[],
    threshold: Threshold = 0.3,
    limit: number = 10,
    metric: 'distance' | 'inner_product' | 'cosine_similarity' = 'cosine_similarity',
    photoIds?: number[],
    opposite: boolean = false
  ) {
    if (!embedding || embedding.length === 0) {
      throw new Error('Embedding no proporcionado o vacío')
    }

    const embeddingString = `[${embedding.join(',')}]`

    // Fallback exacto para opposite
    if (opposite) {
      let metricQuery: string = ''
      let thresholdCondition: string = ''
      let orderBy: string = ''
      let additionalParams: any = {}

      if (typeof threshold === 'number') {
        if (metric === 'distance') {
          metricQuery = 'photos.embedding <-> :embedding AS proximity'
          thresholdCondition = 'photos.embedding <-> :embedding >= :threshold'
          orderBy = 'proximity DESC'
        } else if (metric === 'inner_product') {
          metricQuery = '(photos.embedding <#> :embedding) * -1 AS proximity'
          thresholdCondition = '(photos.embedding <#> :embedding) * -1 <= :threshold'
          orderBy = 'proximity ASC'
        } else if (metric === 'cosine_similarity') {
          metricQuery = '1 - (photos.embedding <=> :embedding) AS proximity'
          thresholdCondition = '1 - (photos.embedding <=> :embedding) <= :threshold'
          orderBy = 'proximity ASC'
        }
        additionalParams.threshold = threshold
      } else {
        // Suponiendo threshold con propiedades min y max
        if (metric === 'distance') {
          metricQuery = 'photos.embedding <-> :embedding AS proximity'
          thresholdCondition =
            'photos.embedding <-> :embedding BETWEEN :minThreshold AND :maxThreshold'
          orderBy = opposite ? 'proximity DESC' : 'proximity ASC'
        } else if (metric === 'inner_product') {
          metricQuery = '(photos.embedding <#> :embedding) * -1 AS proximity'
          thresholdCondition =
            '(photos.embedding <#> :embedding) * -1 BETWEEN :minThreshold AND :maxThreshold'
          orderBy = opposite ? 'proximity ASC' : 'proximity DESC'
        } else if (metric === 'cosine_similarity') {
          metricQuery = '1 - (photos.embedding <=> :embedding) AS proximity'
          thresholdCondition =
            '1 - (photos.embedding <=> :embedding) BETWEEN :minThreshold AND :maxThreshold'
          orderBy = opposite ? 'proximity ASC' : 'proximity DESC'
        }
        additionalParams.minThreshold = threshold.min
        additionalParams.maxThreshold = threshold.max
      }

      // Filtro por photo_id si se proporciona
      let whereCondition = thresholdCondition
      if (photoIds && photoIds.length > 0) {
        whereCondition += ' AND photos.id = ANY(:photoIds)'
        additionalParams.photoIds = photoIds
      }

      // Filtrar fotos eliminadas (soft delete)
      whereCondition += ' AND photos.deleted_at IS NULL'

      const result = await db.rawQuery(
        `
          SELECT photos.id, photos.name, ${metricQuery}
          FROM photos
          WHERE ${whereCondition}
          ORDER BY ${orderBy}
          LIMIT :limit
        `,
        {
          embedding: embeddingString,
          limit,
          ...additionalParams,
        }
      )

      return result.rows
    }

    // --- Optimizaciones con subconsulta index-aware ---
    const distanceExpr =
      metric === 'distance'
        ? 'photos.embedding <-> :embedding'
        : metric === 'inner_product'
          ? 'photos.embedding <#> :embedding'
          : 'photos.embedding <=> :embedding'

    const proximityExpr =
      metric === 'distance'
        ? distanceExpr
        : metric === 'inner_product'
          ? `(${distanceExpr}) * -1`
          : `1 - (${distanceExpr})`

    const innerFilters: string[] = ['photos.deleted_at IS NULL']
    const rawParams: any = { embedding: embeddingString }

    if (photoIds && photoIds.length > 0) {
      innerFilters.push('photos.id = ANY(:photoIds)')
      rawParams.photoIds = photoIds
    }

    const innerWhere = innerFilters.join(' AND ')

    const indexLimit = Math.max(limit * 20, 2000)
    rawParams.indexLimit = indexLimit
    rawParams.limit = limit

    let outerThresholdCond = ''
    if (typeof threshold === 'number') {
      outerThresholdCond =
        metric === 'distance' ? 'proximity <= :threshold' : 'proximity >= :threshold'
      rawParams.threshold = threshold
    } else {
      outerThresholdCond = 'proximity BETWEEN :minThreshold AND :maxThreshold'
      rawParams.minThreshold = threshold.min
      rawParams.maxThreshold = threshold.max
    }

    const outerOrderBy = metric === 'distance' ? 'proximity ASC' : 'proximity DESC'

    const optimizedQuery = `
      SELECT id, name, proximity
      FROM (
        SELECT photos.id, photos.name, ${proximityExpr} AS proximity
        FROM photos
        WHERE ${innerWhere}
        ORDER BY ${distanceExpr} ASC
        LIMIT :indexLimit
      ) AS sub
      WHERE ${outerThresholdCond}
      ORDER BY ${outerOrderBy}
      LIMIT :limit
    `

    const result = await db.rawQuery(optimizedQuery, rawParams)
    return result.rows
  }

  public async findSimilarPhotoToColorPalette(
    embedding: number[],
    threshold: Threshold = 0.3,
    limit: number = 10,
    metric: 'distance' | 'inner_product' | 'cosine_similarity' = 'cosine_similarity',
    photoIds?: number[],
    opposite: boolean = false,
    useDominants: boolean = false
  ) {
    if (!embedding || embedding.length === 0) {
      throw new Error('Color palette embedding no proporcionado o vacío')
    }

    const embeddingString = `[${embedding.join(',')}]`
    const histogramField = useDominants
      ? 'photos.color_histogram_dominant'
      : 'photos.color_histogram'

    // Fallback exacto para opposite ya que no usa el index ANN de forma óptima para lo opuesto
    if (opposite) {
      let metricQuery: string = ''
      let thresholdCondition: string = ''
      let orderBy: string = ''
      let additionalParams: any = {}

      if (typeof threshold === 'number') {
        metricQuery = `1 - (${histogramField} <=> :embedding) AS proximity`
        thresholdCondition = `1 - (${histogramField} <=> :embedding) <= :threshold`
        orderBy = 'proximity ASC'
        additionalParams.threshold = threshold
      } else {
        // threshold con propiedades min y max
        metricQuery = `1 - (${histogramField} <=> :embedding) AS proximity`
        thresholdCondition = `1 - (${histogramField} <=> :embedding) BETWEEN :minThreshold AND :maxThreshold`
        orderBy = 'proximity ASC'
        additionalParams.minThreshold = threshold.min
        additionalParams.maxThreshold = threshold.max
      }

      let whereCondition = thresholdCondition
      if (photoIds && photoIds.length > 0) {
        whereCondition += ' AND photos.id = ANY(:photoIds)'
        additionalParams.photoIds = photoIds
      }
      whereCondition += ' AND photos.deleted_at IS NULL'

      const result = await db.rawQuery(
        `
        SELECT photos.id, photos.name, ${metricQuery}
        FROM photos
        WHERE ${whereCondition}
        ORDER BY ${orderBy}
        LIMIT :limit
        `,
        { embedding: embeddingString, limit, ...additionalParams }
      )
      return result.rows
    }

    // --- Optimizaciones con subconsulta index-aware ---
    // El índice solo existe en photos.color_histogram. Dominant no está indexado pero esta query sigue siendo eficiente por menor dimensión.
    const distanceExpr = `${histogramField} <=> :embedding`
    const proximityExpr = `1 - (${distanceExpr})`

    const innerFilters: string[] = ['photos.deleted_at IS NULL']
    const rawParams: any = { embedding: embeddingString }

    if (photoIds && photoIds.length > 0) {
      innerFilters.push('photos.id = ANY(:photoIds)')
      rawParams.photoIds = photoIds
    }

    const innerWhere = innerFilters.join(' AND ')

    const indexLimit = Math.max(limit * 20, 2000)
    rawParams.indexLimit = indexLimit
    rawParams.limit = limit

    let outerThresholdCond = ''
    if (typeof threshold === 'number') {
      outerThresholdCond = 'proximity >= :threshold'
      rawParams.threshold = threshold
    } else {
      outerThresholdCond = 'proximity BETWEEN :minThreshold AND :maxThreshold'
      rawParams.minThreshold = threshold.min
      rawParams.maxThreshold = threshold.max
    }

    const optimizedQuery = `
      SELECT id, name, proximity
      FROM (
        SELECT photos.id, photos.name, ${proximityExpr} AS proximity
        FROM photos
        WHERE ${innerWhere}
        ORDER BY ${distanceExpr} ASC
        LIMIT :indexLimit
      ) AS sub
      WHERE ${outerThresholdCond}
      ORDER BY proximity DESC
      LIMIT :limit
    `

    const result = await db.rawQuery(optimizedQuery, rawParams)
    return result.rows
  }

  public async findSimilarPhotoByDominantColors(
    embedding: number[],
    threshold: number = 0.3,
    limit: number = 10,
    opposite: boolean = false,
    topBins: number = 5
  ) {
    if (!embedding || embedding.length === 0) {
      throw new Error('Color histogram embedding no proporcionado o vacío')
    }

    // Paso 1: Obtener índices de los bins más relevantes del embedding de entrada
    const embeddingWithIndex = embedding.map((value, index) => ({ index, value }))
    const topEmbeddingBins = embeddingWithIndex.sort((a, b) => b.value - a.value).slice(0, topBins)

    const topIndexes = topEmbeddingBins.map((bin) => bin.index)
    const topValues = topEmbeddingBins.map((bin) => bin.value)

    // Paso 2: Crear consulta SQL comparando solo esos bins
    const indexConditions = topIndexes.map((index, i) => {
      return `ABS(photos.color_histogram_array[${index + 1}] - :value${i})`
    })

    const distanceFormula = indexConditions.join(' + ')

    let thresholdCondition = ''
    let orderBy = ''

    if (opposite) {
      orderBy = 'proximity ASC'
    } else {
      orderBy = 'proximity DESC'
    }

    const sql = `
    SELECT photos.id, photos.name, ${distanceFormula} AS proximity
    FROM photos
    WHERE photos.deleted_at IS NULL
    ORDER BY ${orderBy}
    LIMIT :limit
  `

    const bindings: any = { limit, threshold }
    topValues.forEach((value, i) => {
      bindings[`value${i}`] = value
    })

    const result = await db.rawQuery(sql, bindings)

    return result.rows
  }

  static getParsedEmbedding(embedding): number[] | null {
    return embedding ? JSON.parse(embedding as string) : null
  }
}
