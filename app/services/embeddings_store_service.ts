import ModelsService from './models_service.js'
import NLPService from './nlp_service.js'

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
    for (const { key, value } of pairs) {
      targetMap[key] = value
      // console.log(
      //   `[EmbeddingStoreService] Embedding ${type} almacenado para clave '${key}' (dimensión: ${value.length})`
      // )
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

    // console.log(
    //   `[EmbeddingStoreService] Calculando embeddings Text para ${newTerms.length} nuevos términos...`
    // )

    const { embeddings } = await modelsService.getEmbeddingsCPU(newTerms)

    if (!embeddings || embeddings.length !== newTerms.length) {
      throw new Error(
        `[EmbeddingStoreService] Error: Mismatch entre entrada (${newTerms.length}) y embeddings devueltos (${embeddings?.length})`
      )
    }

    const pairs = newTerms.map((key, index) => ({
      key,
      value: embeddings[index],
    }))

    this.addEmbeddings(pairs, EmbeddingType.Text)

    // console.log(
    //   `[EmbeddingStoreService] Embeddings Text calculados y almacenados para claves: [${newTerms.join(
    //     ', '
    //   )}]`
    // )
  }

  private static async calculateCLIPEmbeddings(
    newTermsCLIP: string[],
    modelsService: ModelsService
  ): Promise<void> {
    if (newTermsCLIP.length === 0) return

    // console.log(
    //   `[EmbeddingStoreService] Calculando embeddings CLIP para ${newTermsCLIP.length} nuevos términos...`
    // )

    const { embeddings: embeddingsCLIP } = await modelsService.getCLIPEmbeddingsCPU(newTermsCLIP)

    if (!embeddingsCLIP || embeddingsCLIP.length !== newTermsCLIP.length) {
      throw new Error(
        `[EmbeddingStoreService] Error: Mismatch entre entrada CLIP (${newTermsCLIP.length}) y embeddings devueltos (${embeddingsCLIP?.length})`
      )
    }

    const pairsCLIP = newTermsCLIP.map((key, index) => ({
      key,
      value: embeddingsCLIP[index],
    }))

    this.addEmbeddings(pairsCLIP, EmbeddingType.CLIP)

    // console.log(
    //   `[EmbeddingStoreService] Embeddings CLIP calculados y almacenados para claves: [${newTermsCLIP.join(
    //     ', '
    //   )}]`
    // )
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
