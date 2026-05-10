import ModelsService from './models_service.js'
import db from '@adonisjs/lucid/services/db'

export enum EmbeddingType {
  Text = 'text',
  CLIP = 'clip',
}

export class EmbeddingStoreService {
  private static readonly MAX_CACHE_SIZE = 1000

  private static embeddingsMap: Map<string, number[]> = new Map()
  private static embeddingsMapCLIP: Map<string, number[]> = new Map()

  /** FIFO eviction: when the map is full, drop the oldest inserted entry. */
  private static setToCache(map: Map<string, number[]>, key: string, value: number[]): void {
    if (map.size >= EmbeddingStoreService.MAX_CACHE_SIZE) {
      map.delete(map.keys().next().value!)
    }
    map.set(key, value)
  }

  public static addEmbeddings(
    pairs: { key: string; value: number[] }[],
    type: EmbeddingType = EmbeddingType.Text
  ): void {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    for (const { key, value } of pairs) {
      this.setToCache(targetMap, key, value)
    }
    // Persist to DB as durable backing store (fire-and-forget)
    if (pairs.length > 0) {
      const col = type === EmbeddingType.CLIP ? 'embedding_clip' : 'embedding_text'
      const placeholders = pairs.map(() => `(?, ?::vector)`).join(',')
      const values = pairs.flatMap(({ key, value }) => [key, JSON.stringify(value)])
      db.rawQuery(
        `INSERT INTO cached_embeddings (text, ${col}) VALUES ${placeholders}
         ON CONFLICT (text) DO UPDATE SET ${col} = EXCLUDED.${col}`,
        values
      ).catch((error) => {
        console.error(`[EmbeddingStoreService] Error al persistir embeddings ${type}:`, error)
      })
    }
  }

  public static getAllKeys(type: EmbeddingType = EmbeddingType.Text): string[] {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    const keys = [...targetMap.keys()]
    console.log(`[EmbeddingStoreService] Claves ${type} almacenadas: [${keys.join(', ')}]`)
    return keys
  }

  public static clearEmbedding(key: string, type: EmbeddingType = EmbeddingType.Text): void {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    if (targetMap.has(key)) {
      targetMap.delete(key)
      console.log(`[EmbeddingStoreService] Embedding ${type} para la clave '${key}' eliminado`)
    } else {
      console.warn(
        `[EmbeddingStoreService] No hay embedding ${type} para eliminar en la clave '${key}'`
      )
    }
  }

  public static clearAll(type?: EmbeddingType): void {
    if (type === EmbeddingType.CLIP) {
      this.embeddingsMapCLIP.clear()
      console.log(`[EmbeddingStoreService] Todos los embeddings CLIP han sido eliminados`)
    } else if (type === EmbeddingType.Text) {
      this.embeddingsMap.clear()
      console.log(`[EmbeddingStoreService] Todos los embeddings Text han sido eliminados`)
    } else {
      this.embeddingsMap.clear()
      this.embeddingsMapCLIP.clear()
      console.log(`[EmbeddingStoreService] Todos los embeddings han sido eliminados`)
    }
  }

  private static async fetchTextEmbeddings(
    newTerms: string[],
    modelsService: ModelsService
  ): Promise<void> {
    if (newTerms.length === 0) return

    // L2: Check DB
    const cachedRows = await db
      .from('cached_embeddings')
      .select(db.raw('text, embedding_text::text'))
      .whereIn('text', newTerms)
      .whereNotNull('embedding_text')

    const afterDb: string[] = []
    for (const term of newTerms) {
      const row = cachedRows.find((r: any) => r.text === term)
      if (row) {
        this.setToCache(this.embeddingsMap, term, JSON.parse(row.embedding_text))
        console.log('[fetchTextEmbeddings] Found text embedding in BD for ', term)
      } else {
        afterDb.push(term)
      }
    }

    if (afterDb.length === 0) return

    // L2.5: Check tags table (predates cached_embeddings; may have embeddings not yet backfilled)
    const tagRows = await db
      .from('tags')
      .select(db.raw('name, embedding::text'))
      .whereIn('name', afterDb)
      .whereNotNull('embedding')

    const afterTags: string[] = []
    const backfillPairs: { key: string; value: number[] }[] = []
    for (const term of afterDb) {
      const row = tagRows.find((r: any) => r.name === term)
      if (row) {
        const embedding = JSON.parse(row.embedding)
        this.setToCache(this.embeddingsMap, term, embedding)
        backfillPairs.push({ key: term, value: embedding })
        console.log('[fetchTextEmbeddings] Found text embedding in tags for ', term)
      } else {
        afterTags.push(term)
      }
    }

    // Backfill found tag embeddings into cached_embeddings for future L2 hits
    if (backfillPairs.length > 0) {
      this.addEmbeddings(backfillPairs, EmbeddingType.Text)
    }

    if (afterTags.length === 0) return

    // L3: Compute via Python API
    const { embeddings } = await modelsService.getEmbeddingsCPU(afterTags)

    if (!embeddings || embeddings.length !== afterTags.length) {
      throw new Error(
        `[EmbeddingStoreService] Error: Mismatch entre entrada (${afterTags.length}) y embeddings devueltos (${embeddings?.length})`
      )
    }

    const pairs = afterTags.map((key, index) => ({
      key,
      value: embeddings[index],
    }))

    this.addEmbeddings(pairs, EmbeddingType.Text)
  }

  private static async fetchCLIPEmbeddings(
    newTermsCLIP: string[],
    modelsService: ModelsService
  ): Promise<void> {
    if (newTermsCLIP.length === 0) return

    // L2: Check DB
    const cachedRows = await db
      .from('cached_embeddings')
      .select(db.raw('text, embedding_clip::text'))
      .whereIn('text', newTermsCLIP)
      .whereNotNull('embedding_clip')

    const termsToCompute: string[] = []
    for (const term of newTermsCLIP) {
      const row = cachedRows.find((r: any) => r.text === term)
      if (row) {
        this.setToCache(this.embeddingsMapCLIP, term, JSON.parse(row.embedding_clip))
        console.log('[fetchCLIPEmbeddings] Found CLIP embedding in BD for ', term)
      } else {
        termsToCompute.push(term)
      }
    }

    if (termsToCompute.length === 0) return

    const { embeddings: embeddingsCLIP } = await modelsService.getCLIPEmbeddingsCPU(termsToCompute)

    if (!embeddingsCLIP || embeddingsCLIP.length !== termsToCompute.length) {
      throw new Error(
        `[EmbeddingStoreService] Error: Mismatch entre entrada CLIP (${termsToCompute.length}) y embeddings devueltos (${embeddingsCLIP?.length})`
      )
    }

    const pairsCLIP = termsToCompute.map((key, index) => ({
      key,
      value: embeddingsCLIP[index],
    }))

    this.addEmbeddings(pairsCLIP, EmbeddingType.CLIP)
  }

  public static async getTextEmbeddings(terms: string[]): Promise<(number[] | null)[]> {
    await this.preloadEmbeddings(terms, false, true)
    return terms.map((t) => this.embeddingsMap.get(t) ?? null)
  }

  public static async getCLIPEmbeddings(terms: string[]): Promise<(number[] | null)[]> {
    await this.preloadEmbeddings(terms, true, false)
    return terms.map((t) => this.embeddingsMapCLIP.get(t) ?? null)
  }

  public static async preloadEmbeddings(
    terms: string[],
    includeCLIP = false,
    includeText = true
  ): Promise<void> {
    const newTerms = includeText
      ? [...new Set(terms.filter((term) => !this.embeddingsMap.has(term)))]
      : []
    const newTermsCLIP = includeCLIP
      ? [...new Set(terms.filter((term) => !this.embeddingsMapCLIP.has(term)))]
      : []

    if (newTerms.length === 0 && newTermsCLIP.length === 0) {
      // console.log(
      //   `[EmbeddingStoreService] Todos los términos ya tienen embeddings almacenados. Nada que calcular.`
      // )
      return
    }

    const modelsService = new ModelsService()

    // Calcular embeddings en paralelo
    await Promise.all([
      this.fetchTextEmbeddings(newTerms, modelsService),
      includeCLIP ? this.fetchCLIPEmbeddings(newTermsCLIP, modelsService) : Promise.resolve(),
    ])
  }
}
