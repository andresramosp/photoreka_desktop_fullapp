import Tag, { tagGroups, type TagGroups } from '#models/tag'
import TagPhoto from '#models/tag_photo'
import ModelsService from '#services/models_service'
import VectorService from '#services/vector_service'
import { CacheInvalidationService } from './cache_invalidation_service.js'
import PhotoManager from '../managers/photo_manager.js'
import TagManager from '../managers/tag_manager.js'
import TagPhotoManager from '../managers/tag_photo_manager.js'
import NLPService from './nlp_service.js'
import { STOPWORDS } from '../utils/StopWords.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import { MESSAGE_TAGS_NOTES_EXTRACTION } from '../utils/prompts/tags.js'
import Logger, { LogLevel } from '../utils/logger.js'

const logger = Logger.getInstance('NoteTags', 'NoteTagsService')
logger.setLevel(LogLevel.DEBUG)

/**
 * Categoría de `tags_photos` que agrupa todo lo que sale de la nota personal.
 *
 * La categoría vive en el pivote, no en la fila de tag: la fila `tags` es global
 * y compartida entre usuarios, así que marcar ahí el origen partiría en dos el
 * vocabulario ("barcelona" de una nota y "barcelona" del análisis serían tags
 * distintos, con las cuentas del tag cloud y del treemap divididas). En el
 * pivote, en cambio, el origen es por foto y el tag se funde con el vocabulario
 * que ya existe.
 *
 * Es también la unidad de borrado: `deleteByPhotoAndCategory(photoId, 'notes')`
 * se lleva los tags de la nota y sus sustantivos sin tocar los del análisis.
 */
export const NOTE_TAGS_CATEGORY = 'notes'

/** Tope de tags por nota. Una nota son ≤50 palabras: más que esto es ruido. */
const MAX_NOTE_TAGS = 15

const VALID_GROUPS = new Set<string>(tagGroups)

/**
 * Reintentos del relleno diferido de embeddings, con su espera previa. El
 * servicio de embeddings es serverless: la primera llamada tras un rato parada
 * puede tardar medio minuto en levantar, y `getEmbeddingsCPU` devuelve una lista
 * vacía en vez de lanzar, así que un fallo se ve como "no vino nada".
 */
const EMBEDDING_FILL_DELAYS_MS = [0, 5_000, 30_000]

export interface NoteTag {
  name: string
  group: TagGroups
}

/**
 * Tags derivados de la nota personal de una foto.
 *
 * Reutiliza la tubería de tags del analyzer (mismos `tags`/`tags_photos`, mismos
 * sustantivos) en lugar de abrir un camino nuevo: con eso la nota entra sola en
 * la búsqueda semántica, en el `content_tags` del chat, en el tag cloud y en el
 * filtro rápido del workspace. Lo que cambia respecto a `TagTask` es que aquí no
 * hay proceso de análisis: la nota se edita a mano y hay que rehacer sus tags en
 * caliente, dentro de la petición.
 */
export default class NoteTagsService {
  /**
   * Borra los tags de la nota de una foto (incluidos sus sustantivos, que
   * heredan la categoría del padre). Idempotente.
   */
  static async clear(photoId: number): Promise<void> {
    await new TagPhotoManager().deleteByPhotoAndCategory(String(photoId), NOTE_TAGS_CATEGORY)
  }

  /**
   * Pide al LLM los tags de una nota. Devuelve `null` si el modelo falla o
   * responde algo inutilizable — distinto de devolver [], que es el modelo
   * diciendo que en esa nota no hay nada que etiquetar.
   */
  static async extract(note: string, tracker?: CostTracker): Promise<NoteTag[] | null> {
    const modelsService = tracker
      ? createTrackedModelsService(new ModelsService(), tracker)
      : new ModelsService()

    let response: any
    try {
      response = await modelsService.getGeminiResponse(
        MESSAGE_TAGS_NOTES_EXTRACTION,
        [JSON.stringify({ note })],
        'gemini-2.5-flash-lite',
        null,
        false
      )
    } catch (error) {
      logger.error(`Fallo pidiendo tags de nota: ${error}`)
      return null
    }

    const rawTags = response?.result?.tags
    if (!Array.isArray(rawTags)) {
      logger.warn('El modelo no devolvió un array en "tags"')
      return null
    }

    const seen = new Set<string>()
    const tags: NoteTag[] = []

    for (const raw of rawTags) {
      if (typeof raw !== 'string') continue

      const [rawName, rawGroup = 'misc'] = raw.split('|').map((part) => part.trim())
      const name = rawName?.trim().toLowerCase()
      if (!name || STOPWORDS.includes(name)) continue
      if (seen.has(name)) continue

      const group = rawGroup.toLowerCase()
      seen.add(name)
      tags.push({ name, group: (VALID_GROUPS.has(group) ? group : 'misc') as TagGroups })

      if (tags.length >= MAX_NOTE_TAGS) break
    }

    return tags
  }

  /**
   * Deja los tags de la nota de `photoId` siendo exactamente `tags`: borra los
   * anteriores y escribe los nuevos. Editar una nota es rehacerlos enteros, no
   * añadir encima — si el usuario quita una frase, su tag tiene que irse con ella.
   *
   * Al volver de aquí las filas ya están en BD y el tag es visible y buscable
   * por texto; lo único que puede faltar es el embedding de los términos nuevos,
   * que se rellena en diferido (ver `fillPendingEmbeddings`).
   */
  static async persist(photoId: number, tags: NoteTag[], userId?: string): Promise<NoteTag[]> {
    await this.clear(photoId)
    if (tags.length === 0) return []

    const nlpService = new NLPService()
    const tagManager = new TagManager()

    // Sustantivos: mismos tags hijo que genera el analyzer. Heredan la categoría
    // del padre, así que se borran con él y hacen alcanzable "my wife" desde "wife".
    const tagToSustantivesMap = new Map<string, string[]>()
    const terms = new Set<string>()

    for (const tag of tags) {
      terms.add(tag.name)
      const sustantives = nlpService.getSustantives(tag.name) ?? []
      tagToSustantivesMap.set(tag.name, sustantives)
      sustantives.forEach((sustantive) => terms.add(sustantive))
    }

    // Embeddings: solo los que ya están en el vocabulario, que es una consulta a
    // BD. Calcular los que falten es lo único que se difiere de todo esto — es
    // una llamada a un servicio serverless que puede tardar medio minuto en
    // despertar, y aquí hay un usuario esperando con el diálogo abierto. El tag
    // no lo necesita para existir ni para verse: solo para que la búsqueda
    // semántica lo alcance, y eso puede llegar unos segundos más tarde.
    const termList = [...terms]
    const embeddingsMap = new Map<string, number[]>()

    const knownTags = await Tag.query()
      .whereIn('name', termList)
      .whereNotNull('embedding')
      .select('name', 'embedding')

    for (const knownTag of knownTags) {
      const embedding = VectorService.getParsedEmbedding(knownTag.embedding)
      if (embedding) embeddingsMap.set(knownTag.name, embedding)
    }

    const tagPhotos: TagPhoto[] = []
    for (const tag of tags) {
      // Sin fusión por similitud: la frase del usuario es el valor del tag.
      const resolvedTag = await tagManager.getOrCreateExactTag(
        { name: tag.name, group: tag.group },
        embeddingsMap.get(tag.name)
      )

      if (tagPhotos.some((tagPhoto) => tagPhoto.tagId === resolvedTag.id)) continue

      const tagPhoto = new TagPhoto()
      tagPhoto.tagId = resolvedTag.id
      tagPhoto.photoId = photoId
      tagPhoto.category = NOTE_TAGS_CATEGORY
      tagPhotos.push(tagPhoto)
    }

    await new PhotoManager().updateTagsPhoto(
      String(photoId),
      tagPhotos,
      tagToSustantivesMap,
      embeddingsMap,
      false
    )

    // Desatado a propósito: la respuesta al usuario no espera al servicio de
    // embeddings. Si el proceso se cae antes de terminar, los tags se quedan sin
    // vector y los recoge GlobalEmbeddingsTagsTask en el siguiente análisis, o
    // el propio usuario volviendo a guardar la nota.
    if (termList.some((term) => !embeddingsMap.has(term))) {
      void this.fillPendingEmbeddings(termList, userId)
    }

    return tags
  }

  /**
   * Rellena en diferido el embedding de los tags que se crearon sin él.
   *
   * Trabaja por nombre y solo sobre `embedding IS NULL`, así que es idempotente:
   * dos notas guardadas a la vez con términos comunes no se pisan, y volver a
   * lanzarlo tras un fallo no duplica nada. Nadie espera este método; sus
   * errores se registran y ya.
   */
  static async fillPendingEmbeddings(terms: string[], userId?: string): Promise<number> {
    try {
      for (const [attempt, delayMs] of EMBEDDING_FILL_DELAYS_MS.entries()) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))

        const pendingTags = await Tag.query()
          .whereIn('name', terms)
          .whereNull('embedding')
          .select('id', 'name')

        if (pendingTags.length === 0) return 0

        const names = [...new Set(pendingTags.map((tag) => tag.name))]
        const { embeddings } = await new ModelsService().getEmbeddingsCPU(names)

        if (!embeddings || embeddings.length !== names.length) {
          logger.warn(
            `Embeddings de nota no disponibles (intento ${attempt + 1}/${EMBEDDING_FILL_DELAYS_MS.length}) para ${names.length} términos`
          )
          continue
        }

        const embeddingByName = new Map<string, number[]>(
          names.map((name, index) => [name, embeddings[index]])
        )

        let filled = 0
        for (const pendingTag of pendingTags) {
          const embedding = embeddingByName.get(pendingTag.name)
          if (!embedding) continue
          // El hook @beforeSave del modelo lo pasa a formato pgvector.
          pendingTag.embedding = embedding
          await pendingTag.save()
          filled++
        }

        logger.info(`Rellenados ${filled} embeddings de tags de nota`)

        // Una búsqueda hecha en la ventana de espera se habrá cacheado sin este
        // tag, y esas cachés duran 12h. Se tiran para que el tag entre ya.
        if (filled > 0 && userId) {
          await CacheInvalidationService.onPhotoTagsChanged(userId)
        }

        return filled
      }

      logger.error(`No se pudieron rellenar los embeddings de ${terms.length} términos de nota`)
      return 0
    } catch (error) {
      logger.error(`Fallo rellenando embeddings de tags de nota: ${error}`)
      return 0
    }
  }

  /**
   * Camino completo de una nota guardada: extraer + reescribir sus tags.
   *
   * Un fallo del LLM no se propaga (la nota ya está guardada cuando esto corre)
   * pero tampoco deja los tags viejos en pie: describían un texto que ya no
   * existe. Se borran igualmente y `ok: false` lo dice para que el cliente pueda
   * ofrecer reintentar. Los errores de escritura en BD sí suben.
   */
  static async rebuild(
    photoId: number,
    note: string,
    tracker?: CostTracker,
    userId?: string
  ): Promise<{ tags: NoteTag[]; ok: boolean }> {
    const extracted = await this.extract(note, tracker)
    const tags = await this.persist(photoId, extracted ?? [], userId)
    return { tags, ok: extracted !== null }
  }
}
