import logger from '@adonisjs/core/services/logger'
import { clipImageEmbeddings, clipTextEmbeddings, textEmbeddings } from '#desktop/ml/local_models'
import { colorHistograms } from '#desktop/ml/color_histogram'
import { inBackground } from '#desktop/ml/background'

/**
 * Modelos de razonamiento GPT-5: rechazan `temperature`/`max_tokens` y usan
 * `max_completion_tokens`/`reasoning_effort`. Fuente única — estaba duplicada en
 * visionDescriptionTask, donde faltaba gpt-5.2 y el batch API mandaba params inválidos.
 */
export const GPT5_REASONING_MODELS = [
  'gpt-6-astra',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5.1',
  'gpt-5.2',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.4-pro',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
]

export function isGpt5ReasoningModel(model: string): boolean {
  return GPT5_REASONING_MODELS.includes(model)
}

export type ModelName =
  | 'gpt-4o'
  | 'gpt-4.1'
  | 'gpt-6-astra'
  | 'gpt-5'
  | 'gpt-5.1'
  | 'gpt-5.2'
  | 'gpt-5.3-chat-latest'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.4-nano'
  | 'gpt-5.4-pro'
  | 'gpt-5.5'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5-mini'
  | 'gpt-5-nano'
  | 'gpt-5-chat-latest'
  | 'gpt-4o-mini'
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'qwen-vl-max'
  | 'qwen-max-latest'
  | 'qwen-plus-latest'
  | 'qwen-turbo-latest'
  | 'qwen3.5-flash'
  | 'qwen-flash'
  // | 'gemini-2.0-flash'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-3-flash-preview'
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash'
  | 'gemini-3.6-flash'
  | 'gemini-3.8-flash'
  | 'gemini-3-pro-preview'
  | 'grok-4-fast-reasoning'
  | 'grok-4-fast-non-reasoning'
  | 'grok-4-1-fast-reasoning'
  | 'grok-4-1-fast-non-reasoning'
  | 'grok-3-mini'
  | 'claude-opus-5'
  | 'claude-sonnet-5'
  | 'claude-haiku-4-5'

/**
 * Anthropic models. The `claude-` prefix is the single discriminator used everywhere
 * (provider routing, image part shape, pricing) — the ids carry no date suffix, so a
 * prefix test is exact rather than a heuristic.
 *
 * Los tres modelos de esta familia razonan con "adaptive thinking": no hay presupuesto
 * de tokens de pensamiento, el nivel se controla con `output_config.effort`. Ver
 * langchain_agent_service.createChatModel.
 */
export function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude-')
}

// ══════════════════════════════════════════════════════════════
// IMAGE INPUT — one place that decides URL vs base64 per model
// ══════════════════════════════════════════════════════════════

/**
 * Gemini models measured to actually fetch an image URL (`fileData.fileUri`) themselves.
 *
 * The API does support URL input, but not on every model: measured 2026-08-13 against our
 * own key, every 3.1+ model answers a bogus `429 RESOURCE_EXHAUSTED` to a URL part —
 * 3.1-flash-lite, 3.1-flash-lite-preview, 3.1-pro-preview, 3.5-flash, 3.5-flash-lite,
 * 3.6-flash. It is NOT real quota: base64 succeeds instantly on the same model with the
 * same key, and a URL that genuinely cannot be fetched answers `400 Cannot fetch content`
 * instead. Only the 2.5 family and the 3.0 generation fetch it:
 *
 *   ✅ URL ok   2.5-flash · 2.5-flash-lite · 2.5-flash-image · 3-flash-preview
 *   ❌ 429      3.1-flash-lite · 3.1-flash-lite-preview · 3.1-pro-preview
 *               3.5-flash · 3.5-flash-lite · 3.6-flash
 *
 * Deliberately an explicit list of what was OBSERVED to work, not a prefix pattern: an
 * unknown model must fall back to base64, which works everywhere. A wrong entry here is a
 * hard 429 for the whole call, not a soft degradation — so re-measure before adding one.
 */
const GEMINI_MODELS_ACCEPTING_IMAGE_URL = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-image',
  'gemini-3-flash-preview',
])

export function geminiAcceptsImageUrl(model: string): boolean {
  return GEMINI_MODELS_ACCEPTING_IMAGE_URL.has(model)
}

/** Images keep their upload extension, so a thumbnail is often webp, not jpeg. */
export function mimeTypeFromExtension(filename: string): string {
  switch (filename.match(/\.[^./]+$/)?.[0].toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'image/jpeg'
  }
}

/**
 * Builds the image content block for one photo, in whatever shape the target model takes:
 *
 * - OpenAI / xAI  → `image_url` with the public URL (plus `detail`, which only they honour)
 * - Anthropic     → SIEMPRE base64, nunca la URL pública. La API sí acepta URLs, pero el
 *                   fetcher de Anthropic se identifica como `Claude-User` y Cloudflare lo
 *                   bloquea delante de images.photoreka.com: la petición vuelve con
 *                   403 "Your request was blocked." y la API la traduce a un 400
 *                   `invalid_request_error: "Unable to download the file"` (medido
 *                   2026-08-17 con claude-opus-5). No es el formato — el mismo .webp,
 *                   bajado por nuestro backend y mandado en base64, se lee perfectamente.
 *                   Bajarlo aquí sale del bloqueo porque lo pide axios desde el servidor,
 *                   no un crawler declarado. `detail` se descarta: Claude no tiene ese
 *                   parámetro. Si algún día se abre Claude-User en Cloudflare, esta rama
 *                   puede volver a la URL y ahorrarse la descarga.
 * - Gemini        → the same URL as a standard `image` block when the model can fetch it
 *                   (see geminiAcceptsImageUrl), otherwise base64 downloaded from R2
 * - DeepSeek/Qwen → null, they have no vision
 *
 * Returns null when there is nothing usable, so callers can keep the text description and
 * simply skip the picture. Centralised here because the URL-vs-base64 rule is a property of
 * the model, not of any one call site.
 */
export async function buildImagePart(opts: {
  model: string
  /** R2 key — used for the mime type and as the base64 fallback source. */
  imageName: string
  /** Public worker URL for the same image. */
  imageUrl?: string | null
  /** OpenAI/xAI only; Gemini has no equivalent knob on this path. */
  detail?: 'low' | 'high' | 'auto'
}): Promise<Record<string, any> | null> {
  const { model, imageName, imageUrl, detail } = opts
  const mimeType = mimeTypeFromExtension(imageName)

  if (model.startsWith('deepseek') || model.startsWith('qwen')) return null

  if (isAnthropicModel(model)) {
    // `imageUrl` se ignora a propósito (ver cabecera): el fetcher de Anthropic no puede
    // descargarla. El bloque `image_url` con un data: URL lo convierten al shape nativo
    // tanto @langchain/anthropic como toAnthropicContent, así que la forma no cambia.
    const { default: PhotoImageService } = await import('./photo_image_service.js')
    const base64 = await PhotoImageService.getInstance().getImageBase64FromR2(imageName, false)
    if (!base64) return null
    return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
  }

  if (!model.startsWith('gemini')) {
    if (!imageUrl) return null
    return { type: 'image_url', image_url: { url: imageUrl, ...(detail ? { detail } : {}) } }
  }

  if (imageUrl && geminiAcceptsImageUrl(model)) {
    return { type: 'image', source_type: 'url', url: imageUrl, mime_type: mimeType }
  }

  const { default: PhotoImageService } = await import('./photo_image_service.js')
  const base64 = await PhotoImageService.getInstance().getImageBase64FromR2(imageName, false)
  if (!base64) return null
  return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
}

export const PRICES = {
  'gpt-4o': {
    input_cache_miss: 2.5 / 1_000_000,
    input_cache_hit: 1.25 / 1_000_000,
    output: 10.0 / 1_000_000,
  },
  // GPT-6 Astra (2026-09-04): $10 input, $1 cached input, $12.50 cache write,
  // and $50 output per million tokens. Requests over 272K input tokens cost more.
  'gpt-6-astra': {
    input_cache_miss: 10 / 1_000_000,
    input_cache_hit: 1 / 1_000_000,
    input_cache_write: 12.5 / 1_000_000,
    output: 50 / 1_000_000,
  },
  'gpt-4.1': {
    input_cache_miss: 2 / 1_000_000,
    input_cache_hit: 0.5 / 1_000_000,
    output: 8 / 1_000_000,
  },
  'gpt-5': {
    input_cache_miss: 1.25 / 1_000_000,
    input_cache_hit: 0.125 / 1_000_000,
    output: 10 / 1_000_000,
  },
  'gpt-5.1': {
    input_cache_miss: 1.25 / 1_000_000,
    input_cache_hit: 0.125 / 1_000_000,
    output: 10 / 1_000_000,
  },
  'gpt-5.2': {
    input_cache_miss: 1.75 / 1_000_000,
    input_cache_hit: 0.175 / 1_000_000,
    output: 14 / 1_000_000,
  },
  'gpt-5.3-chat-latest': {
    input_cache_miss: 1.75 / 1_000_000,
    input_cache_hit: 0.175 / 1_000_000,
    output: 14 / 1_000_000,
  },
  'gpt-5.4': {
    input_cache_miss: 2.5 / 1_000_000,
    input_cache_hit: 0.25 / 1_000_000,
    output: 15 / 1_000_000,
  },
  'gpt-5.4-mini': {
    input_cache_miss: 0.75 / 1_000_000,
    input_cache_hit: 0.075 / 1_000_000,
    output: 4.5 / 1_000_000,
  },
  'gpt-5.4-nano': {
    input_cache_miss: 0.2 / 1_000_000,
    input_cache_hit: 0.02 / 1_000_000,
    output: 1.25 / 1_000_000,
  },
  'gpt-5.4-pro': {
    input_cache_miss: 30 / 1_000_000,
    input_cache_hit: 0,
    output: 180 / 1_000_000,
  },
  'gpt-5.5': {
    input_cache_miss: 5 / 1_000_000,
    input_cache_hit: 0.5 / 1_000_000,
    output: 30 / 1_000_000,
  },
  // GPT-5.6 (GA 2026-07-09). Los tres niveles comparten generación; Sol/Terra/Luna son
  // niveles de capacidad, no versiones. Cached input al 90% de descuento (oficial).
  // Precios tras el recorte del 2026-07-30 (Luna -80%, Terra -20%, Sol sin cambios).
  // Sol cuesta exactamente lo mismo que gpt-5.5 y lo supera de forma amplia, así que
  // 5.5 se queda arriba solo por compatibilidad con llamadas existentes.
  'gpt-5.6-sol': {
    input_cache_miss: 5 / 1_000_000,
    input_cache_hit: 0.5 / 1_000_000,
    output: 30 / 1_000_000,
  },
  'gpt-5.6-terra': {
    input_cache_miss: 2 / 1_000_000,
    input_cache_hit: 0.2 / 1_000_000,
    output: 12 / 1_000_000,
  },
  'gpt-5.6-luna': {
    input_cache_miss: 0.2 / 1_000_000,
    input_cache_hit: 0.02 / 1_000_000,
    output: 1.2 / 1_000_000,
  },
  'gpt-5-mini': {
    input_cache_miss: 0.25 / 1_000_000,
    input_cache_hit: 0.025 / 1_000_000,
    output: 2.0 / 1_000_000,
  },
  'gpt-5-nano': {
    input_cache_miss: 0.05 / 1_000_000,
    input_cache_hit: 0.005 / 1_000_000,
    output: 0.4 / 1_000_000,
  },
  'gpt-5-chat-latest': {
    input_cache_miss: 1.25 / 1_000_000,
    input_cache_hit: 0.125 / 1_000_000,
    output: 10 / 1_000_000,
  },
  'gpt-4o-mini': {
    input_cache_miss: 0.15 / 1_000_000,
    input_cache_hit: 0.075 / 1_000_000,
    output: 0.6 / 1_000_000,
  },
  'deepseek-chat': {
    input_cache_miss: 0.28 / 1_000_000,
    input_cache_hit: 0.028 / 1_000_000,
    output: 0.42 / 1_000_000,
  },
  'deepseek-reasoner': {
    input_cache_miss: 0.55 / 1_000_000, // Estimated ~2x markup for thinking mode (official pricing TBD)
    input_cache_hit: 0.055 / 1_000_000,
    output: 2.19 / 1_000_000, // Estimated ~5.2x output multiplier
  },

  // qwen3.5-flash: $0.1 input · $0.4 output per million tokens (newest flash, Qwen 3.5 gen)
  'qwen3.5-flash': {
    input_cache_miss: 0.1 / 1_000_000,
    input_cache_hit: 0.025 / 1_000_000,
    output: 0.4 / 1_000_000,
  },
  // qwen-flash: $0.05 input · $0.4 output per million tokens (Qwen 3 gen, cheapest)

  // 'gemini-2.0-flash': {
  //   input_cache_miss: 0.1 / 1_000_000,
  //   input_cache_hit: 0.05 / 1_000_000,
  //   output: 0.4 / 1_000_000,
  // },
  // Cached input per ai.google.dev/gemini-api/docs/pricing (checked 2026-10-03).
  'gemini-2.5-flash': {
    input_cache_miss: 0.3 / 1_000_000,
    input_cache_hit: 0.03 / 1_000_000,
    output: 2.5 / 1_000_000,
  },
  'gemini-2.5-flash-lite': {
    input_cache_miss: 0.1 / 1_000_000,
    input_cache_hit: 0.01 / 1_000_000,
    output: 0.4 / 1_000_000,
  },
  // Cached input at 90% off, per ai.google.dev/gemini-api/docs/pricing (checked 2026-09-17).
  // The previous 0.25 was a placeholder that overstated every cache hit 5x — on a Curator
  // turn with ~16k cached tokens that was ~9% of the computed cost, charged for nothing.
  'gemini-3-flash-preview': {
    input_cache_miss: 0.5 / 1_000_000, // USD per input token
    input_cache_hit: 0.05 / 1_000_000, // USD per cached input token (official)
    output: 3.0 / 1_000_000, // USD per output token
  },
  // Same source. The previous 0.25 priced a cache hit at the full input rate (~18% of a Scout turn).
  'gemini-3.1-flash-lite': {
    input_cache_miss: 0.25 / 1_000_000, // USD per input token
    input_cache_hit: 0.025 / 1_000_000, // USD per cached input token (official)
    output: 1.5 / 1_000_000, // USD per output token
  },
  // TypeSafe AI Jev: $0.042/M input tokens, output free, no cache tier (docs.typesafe.ai/models, 2026-09-22).
  'jev-latest': {
    input_cache_miss: 0.042 / 1_000_000,
    input_cache_hit: 0.042 / 1_000_000,
    output: 0,
  },
  'gemini-3-pro-preview': {
    input_cache_miss: 2.0 / 1_000_000, // USD per input token
    input_cache_hit: 1.0 / 1_000_000, // USD per cached input token (estimate, not official)
    output: 12.0 / 1_000_000, // USD per output token
  },
  // gemini-3.5-flash (GA): $1.50 in · $9.00 out · $0.15 cached (90% discount) — official.
  // 3x el input y 3x el output de gemini-3-flash-preview ($0.50/$3.00).
  'gemini-3.5-flash': {
    input_cache_miss: 1.5 / 1_000_000, // USD per input token
    input_cache_hit: 0.15 / 1_000_000, // USD per cached input token
    output: 9.0 / 1_000_000, // USD per output token (including thinking tokens)
  },
  // gemini-3.6-flash (GA 2026-07-21): mismo input que 3.5-flash pero output un 16.7%
  // más barato ($7.50 vs $9.00) y ~17% menos tokens de salida en tareas comparables,
  // así que domina a 3.5-flash en coste por tarea. Cached input $0.15 (oficial).
  'gemini-3.6-flash': {
    input_cache_miss: 1.5 / 1_000_000, // USD per input token
    input_cache_hit: 0.15 / 1_000_000, // USD per cached input token
    output: 7.5 / 1_000_000, // USD per output token (including thinking tokens)
  },
  // gemini-3.8-flash (GA 2026-09-02): mismo precio de lista que 3.6/3.7.
  // Hasta 2026-12-31 Google aplica una promoción del 50% ($0.75/$3.75/$0.075 cached);
  // se registra la tarifa posterior para no infravalorar llamadas históricas tras su fin.
  'gemini-3.8-flash': {
    input_cache_miss: 1.5 / 1_000_000,
    input_cache_hit: 0.15 / 1_000_000,
    output: 7.5 / 1_000_000, // Includes thinking tokens
  },
  // grok-4-fast: $0.20 input · $0.50 output per million tokens
  'grok-4-fast-reasoning': {
    input_cache_miss: 0.2 / 1_000_000,
    input_cache_hit: 0.05 / 1_000_000, // 25% of input (xAI standard)
    output: 0.5 / 1_000_000,
  },
  'grok-4-fast-non-reasoning': {
    input_cache_miss: 0.2 / 1_000_000,
    input_cache_hit: 0.05 / 1_000_000,
    output: 0.5 / 1_000_000,
  },
  // grok-4-1-fast: $0.20 input · $0.50 output per million tokens
  'grok-4-1-fast-reasoning': {
    input_cache_miss: 0.2 / 1_000_000,
    input_cache_hit: 0.05 / 1_000_000,
    output: 0.5 / 1_000_000,
  },
  'grok-4-1-fast-non-reasoning': {
    input_cache_miss: 0.2 / 1_000_000,
    input_cache_hit: 0.05 / 1_000_000,
    output: 0.5 / 1_000_000,
  },
  // grok-3-mini: $0.30 input · $0.50 output per million tokens
  'grok-3-mini': {
    input_cache_miss: 0.3 / 1_000_000,
    input_cache_hit: 0.075 / 1_000_000,
    output: 0.5 / 1_000_000,
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  // Tres tarifas de input, no dos, y por eso estas entradas llevan `input_cache_write`:
  // Anthropic cobra la ESCRITURA de caché por encima del input normal (1.25x con el TTL
  // de 5 min, 2x con el de 1h), mientras la LECTURA baja al 0.1x. Los modelos con solo
  // dos tarifas ignoran el campo — es opcional en todo el consumo (ver computeCallCost).
  //
  // Los tokens de "thinking" NO se facturan aparte: cuentan dentro de output_tokens y a
  // precio de output. La API tampoco los desglosa, así que thinkingTokens queda a 0 para
  // esta familia — el coste es correcto, la columna es la que no se puede separar.
  'claude-opus-5': {
    input_cache_miss: 5 / 1_000_000,
    input_cache_hit: 0.5 / 1_000_000,
    input_cache_write: 6.25 / 1_000_000, // 1.25x — TTL de 5 min (el que usa el SDK por defecto)
    output: 25 / 1_000_000,
  },
  // Precio de lista. Hay una tarifa de lanzamiento a $2/$10 vigente hasta el 2026-08-31;
  // se deja el precio de lista a propósito para no INFRAvalorar el coste de las llamadas
  // que caigan después de esa fecha — el registro de costes es un techo, no una factura.
  'claude-sonnet-5': {
    input_cache_miss: 3 / 1_000_000,
    input_cache_hit: 0.3 / 1_000_000,
    input_cache_write: 3.75 / 1_000_000,
    output: 15 / 1_000_000,
  },
  'claude-haiku-4-5': {
    input_cache_miss: 1 / 1_000_000,
    input_cache_hit: 0.1 / 1_000_000,
    input_cache_write: 1.25 / 1_000_000,
    output: 5 / 1_000_000,
  },
}

/** TypeSafe AI System One models. Priced under the 'jev-latest' PRICES entry. */
export type JevModelName = 'jev-latest' | 'jev-preview'

export const USD_TO_EUR = 0.92

/** Como el servicio Python ante un fallo: se registra y se devuelve la forma vacía. */
async function orEmpty<T, E>(method: string, run: () => Promise<T>, empty: E): Promise<T | E> {
  try {
    return await run()
  } catch (error) {
    logger.error(`[escritorio] ${method} falló: ${(error as Error).message}`)
    return empty
  }
}

/** Funciones que aún llaman a un modelo de lenguaje desde la API local, sin función de la nube. */
function pendingCloudFunction(method: string): never {
  throw new Error(`[escritorio] ${method}: esta función todavía no está disponible en el escritorio`)
}

/**
 * Escritorio: todo el cálculo del servicio Python se hace en local (desktop/ml): vectores de texto
 * e imagen e histogramas de color, idénticos a los de Python, y UMAP y clusters, con el mismo
 * algoritmo y parámetros. Las llamadas a modelos de lenguaje del análisis son funciones con
 * nombre de la nube (desktop/cloud_functions).
 */
export default class ModelsService {
  getEmbeddingsCPU(tags: string[]): Promise<any> {
    return orEmpty('getEmbeddingsCPU', () => textEmbeddings(tags), { embeddings: [] })
  }

  getCLIPEmbeddingsCPU(tags: string[]): Promise<any> {
    return orEmpty('getCLIPEmbeddingsCPU', () => clipTextEmbeddings(tags), { embeddings: [] })
  }

  getEmbeddingsImagesCPU(images: { id: any; base64: string }[]): Promise<any> {
    return orEmpty('getEmbeddingsImagesCPU', () => clipImageEmbeddings(images), { embeddings: [] })
  }

  getReducedEmbeddings(payload: any): Promise<any> {
    return orEmpty('getReducedEmbeddings', () => inBackground('reduce', payload), { reduced_embeddings: [] })
  }

  getClusters(payload: any): Promise<any> {
    return orEmpty('getClusters', () => inBackground('clusters', payload), { clusters: [] })
  }

  getHistogramColor(images: { id: any; base64: string }[]): Promise<any> {
    return orEmpty('getHistogramColor', () => colorHistograms(images), { embeddings: [] })
  }

  // Chat, informes, portfolios, ubicación, notas y canvas sugeridos todavía llaman aquí con su
  // propio prompt. Cada una pasará a su función con nombre de la nube, como la búsqueda.
  async getGPTResponse(..._args: any[]): Promise<any> {
    pendingCloudFunction('getGPTResponse')
  }

  async getGeminiResponse(..._args: any[]): Promise<any> {
    pendingCloudFunction('getGeminiResponse')
  }

  async getJevResponse(..._args: any[]): Promise<any> {
    pendingCloudFunction('getJevResponse')
  }
}
