import ModelsService from './models_service.js'
import redis from '@adonisjs/redis/services/main'

export enum EmbeddingType {
  Text = 'text',
  CLIP = 'clip',
}

export class EmbeddingStoreService {
  private static embeddingsMap: Record<string, number[]> = {}
  private static embeddingsMapCLIP: Record<string, number[]> = {}

  public static addEmbeddings(
    pairs: { key: string; value: number[] }[],
    type: EmbeddingType = EmbeddingType.Text
  ): void {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    const redisPrefix = type === EmbeddingType.CLIP ? 'clip' : 'text'
    for (const { key, value } of pairs) {
      targetMap[key] = value
      // Persist to Redis so embeddings survive server restarts (fire-and-forget)
      redis.set(`embedding:${redisPrefix}:${key}`, JSON.stringify(value)).catch(() => {})
    }
  }

  public static getEmbedding(
    key: string,
    type: EmbeddingType = EmbeddingType.Text
  ): number[] | null {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    const found = targetMap[key]
    if (found) {
      // console.log(`[EmbeddingStoreService] Recuperado embedding ${type} para clave '${key}'`)
      return found
    } else {
      console.warn(
        `[EmbeddingStoreService] No se encontró embedding ${type} para la clave '${key}'`
      )
      return null
    }
  }

  public static getAllKeys(type: EmbeddingType = EmbeddingType.Text): string[] {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    const keys = Object.keys(targetMap)
    console.log(`[EmbeddingStoreService] Claves ${type} almacenadas: [${keys.join(', ')}]`)
    return keys
  }

  public static clearEmbedding(key: string, type: EmbeddingType = EmbeddingType.Text): void {
    const targetMap = type === EmbeddingType.CLIP ? this.embeddingsMapCLIP : this.embeddingsMap
    if (targetMap[key]) {
      delete targetMap[key]
      console.log(`[EmbeddingStoreService] Embedding ${type} para la clave '${key}' eliminado`)
    } else {
      console.warn(
        `[EmbeddingStoreService] No hay embedding ${type} para eliminar en la clave '${key}'`
      )
    }
  }

  public static clearAll(type?: EmbeddingType): void {
    if (type === EmbeddingType.CLIP) {
      this.embeddingsMapCLIP = {}
      console.log(`[EmbeddingStoreService] Todos los embeddings CLIP han sido eliminados`)
    } else if (type === EmbeddingType.Text) {
      this.embeddingsMap = {}
      console.log(`[EmbeddingStoreService] Todos los embeddings Text han sido eliminados`)
    } else {
      this.embeddingsMap = {}
      this.embeddingsMapCLIP = {}
      console.log(`[EmbeddingStoreService] Todos los embeddings han sido eliminados`)
    }
  }

  private static async calculateTextEmbeddings(
    newTerms: string[],
    modelsService: ModelsService
  ): Promise<void> {
    if (newTerms.length === 0) return

    // Check Redis L2 before hitting the CPU API
    const redisValues = await redis.mget(...newTerms.map((t) => `embedding:text:${t}`))
    const termsToCompute: string[] = []
    for (let i = 0; i < newTerms.length; i++) {
      if (redisValues[i]) {
        this.embeddingsMap[newTerms[i]] = JSON.parse(redisValues[i]!)
      } else {
        termsToCompute.push(newTerms[i])
      }
    }

    if (termsToCompute.length === 0) return

    const { embeddings } = await modelsService.getEmbeddingsCPU(termsToCompute)

    if (!embeddings || embeddings.length !== termsToCompute.length) {
      throw new Error(
        `[EmbeddingStoreService] Error: Mismatch entre entrada (${termsToCompute.length}) y embeddings devueltos (${embeddings?.length})`
      )
    }

    const pairs = termsToCompute.map((key, index) => ({
      key,
      value: embeddings[index],
    }))

    this.addEmbeddings(pairs, EmbeddingType.Text)
  }

  private static async calculateCLIPEmbeddings(
    newTermsCLIP: string[],
    modelsService: ModelsService
  ): Promise<void> {
    if (newTermsCLIP.length === 0) return

    // Check Redis L2 before hitting the CPU API
    const redisValues = await redis.mget(...newTermsCLIP.map((t) => `embedding:clip:${t}`))
    const termsToCompute: string[] = []
    for (let i = 0; i < newTermsCLIP.length; i++) {
      if (redisValues[i]) {
        this.embeddingsMapCLIP[newTermsCLIP[i]] = JSON.parse(redisValues[i]!)
      } else {
        termsToCompute.push(newTermsCLIP[i])
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

  public static async calculateEmbeddings(
    terms: string[],
    includeCLIP = false,
    includeText = true
  ): Promise<void> {
    const newTerms = includeText
      ? [...new Set(terms.filter((term) => !this.embeddingsMap[term]))]
      : []
    const newTermsCLIP = includeCLIP
      ? [...new Set(terms.filter((term) => !this.embeddingsMapCLIP[term]))]
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
      this.calculateTextEmbeddings(newTerms, modelsService),
      includeCLIP ? this.calculateCLIPEmbeddings(newTermsCLIP, modelsService) : Promise.resolve(),
    ])
  }
}
