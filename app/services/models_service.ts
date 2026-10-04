// @ts-nocheck

import env from '#start/env'
import axios from 'axios'
import crypto from 'node:crypto'
import redis from '@adonisjs/redis/services/main'
import MeasureExecutionTime from '../decorators/measureExecutionTime.js'
import withWarmUp from '../decorators/withWarmUp.js'
import { robustJsonParse } from '../utils/jsonUtils.js'
import { resolveJevProvider } from '../utils/jev_provider.js'
const require = createRequire(import.meta.url)

const { GoogleGenAI } = await import('@google/genai')

import FormData from 'form-data'
import {
  Content,
  createUserContent,
  GenerateContentConfig,
  GenerateContentResponse,
  HarmBlockThreshold,
  HarmCategory,
  MediaResolution,
} from '@google/genai'
import withCPUWarmUp from '../decorators/withCPUWarmUp.js'
import { createRequire } from 'module'

/** Returns true if content contains image blocks (OpenAI image_url, Gemini inlineData/fileData). */
function containsImages(content: any): boolean {
  if (!content) return false
  if (typeof content === 'string') return false
  const items = Array.isArray(content) ? content : [content]
  return items.some((item) => {
    if (!item || typeof item !== 'object') return false
    if (item.type === 'image_url' || item.type === 'image') return true
    if (item.inlineData || item.inline_data) return true
    if (item.fileData || item.file_data) return true
    // Nested content arrays (e.g. Qwen multimodal messages)
    if (Array.isArray(item.content)) return containsImages(item.content)
    return false
  })
}

/**
 * Traduce el contenido de usuario al formato nativo de Anthropic.
 *
 * Existe porque Claude es el único proveedor del servicio que NO acepta el bloque
 * `image_url` de OpenAI: la imagen va en `{type:'image', source:{...}}`, con `source.type`
 * `url` o `base64` según la URL. Acepta las tres formas que circulan por el código —
 * string suelto, bloques estilo OpenAI y bloques estándar de LangChain (`source_type`) —
 * para que un call site pueda cambiar de proveedor sin tocar cómo construye el mensaje.
 *
 * (En la ruta de LangChain esta conversión la hace @langchain/anthropic; aquí, en la ruta
 * nativa, no hay nadie que la haga.)
 */
function toAnthropicContent(userContent: any): any[] {
  if (typeof userContent === 'string') return [{ type: 'text', text: userContent }]

  const items = Array.isArray(userContent) ? userContent : [userContent]
  const blocks: any[] = []

  for (const item of items) {
    if (!item) continue
    if (typeof item === 'string') {
      blocks.push({ type: 'text', text: item })
      continue
    }
    if (item.type === 'text') {
      blocks.push({ type: 'text', text: item.text })
      continue
    }

    // La URL puede venir en `image_url.url` (OpenAI), `image_url` como string, o `url`
    // (bloque estándar de LangChain). Un data: URL se parte en media_type + payload.
    const url =
      typeof item.image_url === 'string'
        ? item.image_url
        : (item.image_url?.url ?? (typeof item.url === 'string' ? item.url : null))
    if (!url) continue

    const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/s)
    blocks.push({
      type: 'image',
      source: dataUrlMatch
        ? { type: 'base64', media_type: dataUrlMatch[1], data: dataUrlMatch[2] }
        : { type: 'url', url },
    })
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', text: '' }]
}

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

/** SHA-256 hash of the serialized parts, used as a compact Redis key. */
function llmCacheKey(parts: object): string {
  return 'llm:' + crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function hasNonEmptyResult(result: any): boolean {
  const r = result?.result
  if (r == null || r === '') return false
  if (Array.isArray(r)) return r.length > 0
  if (typeof r === 'object') return Object.keys(r).length > 0
  return true
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

export type EndpointType =
  | 'embeddings_gpu'
  | 'embeddings_cpu'
  | 'logic_cpu'
  | 'logic_gpu'
  | 'logic_gpu_lb'
  | 'image'
  | 'railway_cpu'

export const USD_TO_EUR = 0.92

export default class ModelsService {
  constructor() {
    this.apiMode = process.env.API_MODELS
    this.remoteBaseUrlLogicGPU = process.env.REMOTE_API_BASE_URL_LOGIC_GPU
    this.remoteBaseUrlLogicGPULB = process.env.REMOTE_API_BASE_URL_LOGIC_GPU_LB
    this.remoteBaseUrlLogicCPU = process.env.REMOTE_API_BASE_URL_LOGIC_CPU
    this.remoteBaseUrlImage = process.env.REMOTE_API_BASE_URL_IMAGE
    this.remoteBaseUrlEmbeddingsGPU = process.env.REMOTE_API_BASE_URL_EMBEDDINGS_GPU
    this.remoteBaseUrlEmbeddingsCPU = process.env.REMOTE_API_BASE_URL_EMBEDDINGS_CPU
    this.localBaseUrl = process.env.LOCAL_API_BASE_URL
    this.runpodApiKey = process.env.RUNPOD_API_KEY
    this.pingCooldownSeconds = 300
  }

  static lastPingTimestamps: Record<string, number> = {}
  static pendingWarmups: Record<string, Promise<void>> = {}

  // Short-lived cache of the last /health verdict per endpoint, so a single
  // search firing many batches doesn't hammer RunPod's health endpoint.
  static warmStatusCache: Record<string, { warm: boolean; at: number }> = {}
  warmStatusCacheTtlMs = 5000
  // How long to wait on /health before giving up and treating the endpoint as
  // cold. /health is served by RunPod's control-plane (not the worker) and
  // answers in ~300ms even with zero workers, so 1s is generous.
  runpodHealthTimeoutMs = 1000

  static lastWarmTriggerAt: Record<string, number> = {}
  warmTriggerCooldownMs = 15000

  /** Base URL configured for a REMOTE RunPod endpoint, or null if not set. */
  private getRunPodBaseUrl(endpointType: EndpointType): string | null {
    const map: Partial<Record<EndpointType, string>> = {
      embeddings_gpu: this.remoteBaseUrlEmbeddingsGPU,
      embeddings_cpu: this.remoteBaseUrlEmbeddingsCPU,
      logic_gpu: this.remoteBaseUrlLogicGPU,
      logic_cpu: this.remoteBaseUrlLogicCPU,
      image: this.remoteBaseUrlImage,
    }
    return map[endpointType] || null
  }

  /** Extract the `.../v2/<id>` root of a RunPod serverless URL (drops /runsync). */
  private runpodEndpointRoot(endpointType: EndpointType): string | null {
    const base = (this.getRunPodBaseUrl(endpointType) || '').trim()
    const match = base.match(/^(https:\/\/api\.runpod\.ai\/v2\/[^/]+)/)
    return match ? match[1] : null
  }

  /**
   * True if the RunPod serverless endpoint has at least one worker able to serve
   * a request WITHOUT a cold start. Uses RunPod's /health control-plane endpoint,
   * which never wakes or scales the endpoint and responds fast even with zero
   * workers. The verdict is cached for warmStatusCacheTtlMs. Fails safe to
   * `false` (cold) on any timeout/error.
   *
   * Only meaningful in REMOTE mode; in LOCAL mode the model runs locally and is
   * always treated as warm.
   */
  public async isRunPodEndpointWarm(endpointType: EndpointType): Promise<boolean> {
    if (this.apiMode !== 'REMOTE') return true

    const cached = ModelsService.warmStatusCache[endpointType]
    if (cached && Date.now() - cached.at < this.warmStatusCacheTtlMs) {
      return cached.warm
    }

    const root = this.runpodEndpointRoot(endpointType)
    // Not a standard serverless URL (e.g. the LB endpoint) — don't gate on it.
    if (!root) return true

    try {
      const { data } = await axios.get(`${root}/health`, {
        headers: this.runpodApiKey ? { Authorization: `Bearer ${this.runpodApiKey}` } : {},
        timeout: this.runpodHealthTimeoutMs,
      })
      const w = data?.workers || {}
      const warm = (Number(w.idle) || 0) + (Number(w.ready) || 0) + (Number(w.running) || 0) > 0
      ModelsService.warmStatusCache[endpointType] = { warm, at: Date.now() }
      return warm
    } catch (error) {
      console.warn('[RunPod] Health check failed, treating endpoint as cold:', error.message)
      ModelsService.warmStatusCache[endpointType] = { warm: false, at: Date.now() }
      return false
    }
  }

  /**
   * Fire-and-forget wake-up for a RunPod serverless endpoint: enqueues a cheap
   * `ping` job on the ASYNC /run endpoint so RunPod scales a worker up in the
   * background, and returns immediately without waiting out the cold start.
   * Guarded by warmTriggerCooldownMs so we don't enqueue a burst of ping jobs
   * while the worker boots. No-op in LOCAL mode.
   */
  public triggerRunPodWarm(endpointType: EndpointType): void {
    if (this.apiMode !== 'REMOTE') return

    const now = Date.now()
    const last = ModelsService.lastWarmTriggerAt[endpointType] || 0
    if (now - last < this.warmTriggerCooldownMs) return
    ModelsService.lastWarmTriggerAt[endpointType] = now

    const root = this.runpodEndpointRoot(endpointType)
    if (!root) return

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.runpodApiKey) headers['Authorization'] = `Bearer ${this.runpodApiKey}`

    // /run is async: RunPod returns a job id immediately and boots a worker in
    // the background. We deliberately don't await the job's result.
    axios
      .post(`${root}/run`, { input: { operation: 'ping', data: {} } }, { headers, timeout: 5000 })
      .then(() => console.log(`[RunPod] Warm-up job enqueued for ${endpointType}`))
      .catch((error) => console.warn('[RunPod] Warm-up trigger failed:', error.message))
  }

  public async ensureRunPodWarm(endpointType: EndpointType) {
    const now = Date.now()
    const last = ModelsService.lastPingTimestamps[endpointType] || 0
    const secondsSinceLastPing = (now - last) / 1000

    if (secondsSinceLastPing < this.pingCooldownSeconds) {
      return
    }

    const { url, requestPayload, headers } = this.buildRequestConfig('ping', {}, endpointType)

    try {
      console.log('[RunPod] Checking Endpoint Status for type ' + endpointType)
      await axios.post(url, requestPayload, { headers })
      ModelsService.lastPingTimestamps[endpointType] = Date.now()
      console.log('[RunPod] Endpoint warmed.')
    } catch (error) {
      console.warn('[RunPod] Ping failed (non-critical):', error.message)
    }
  }

  public async ensureCPUApiWarm() {
    const key = 'railway_cpu'
    const now = Date.now()
    const last = ModelsService.lastPingTimestamps[key] || 0
    const secondsSinceLastPing = (now - last) / 1000

    if (secondsSinceLastPing < this.pingCooldownSeconds) {
      return
    }

    // Si ya hay un warmup en curso, reutilizar la misma promise (evita pings duplicados concurrentes)
    if (ModelsService.pendingWarmups[key]) {
      return ModelsService.pendingWarmups[key]
    }

    const warmupPromise = (async () => {
      const maxRetries = 3

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(
            `[Railway] Pinging CPU API to wake up serverless instance (attempt ${attempt + 1}/${maxRetries})...`
          )
          await axios.post(
            process.env.PYTHON_API_CPU + '/clip-text-embeddings',
            { tags: ['ping'] },
            { timeout: 50000 }
          )
          ModelsService.lastPingTimestamps[key] = Date.now()
          console.log('[Railway] CPU API is warm.')
          return
        } catch (error) {
          const isLastAttempt = attempt === maxRetries - 1
          if (isLastAttempt) {
            console.error(`[Railway] Ping failed after ${maxRetries} attempts:`, error.message)
          } else {
            const delay = 2000 * Math.pow(2, attempt) // 2s, 4s
            console.warn(
              `[Railway] Ping failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms:`,
              error.message
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }
      }
    })().finally(() => {
      delete ModelsService.pendingWarmups[key]
    })

    ModelsService.pendingWarmups[key] = warmupPromise
    return warmupPromise
  }

  buildRequestConfig(operation, payload, endpointType: EndpointType) {
    let url = ''
    let requestPayload = payload
    const headers = { 'Content-Type': 'application/json' }

    if (this.apiMode === 'REMOTE') {
      if (endpointType == 'embeddings_gpu') {
        url = this.remoteBaseUrlEmbeddingsGPU
      }
      if (endpointType == 'embeddings_cpu') {
        url = this.remoteBaseUrlEmbeddingsCPU
      }
      if (endpointType == 'logic_gpu') {
        url = this.remoteBaseUrlLogicGPU
      }
      if (endpointType == 'logic_gpu_lb') {
        url = this.remoteBaseUrlLogicGPULB + '/' + operation
        headers['Authorization'] = `Bearer ${this.runpodApiKey}`
        return { url, requestPayload: payload, headers }
      }
      if (endpointType == 'logic_cpu') {
        url = this.remoteBaseUrlLogicCPU
      }
      if (endpointType == 'image') {
        url = this.remoteBaseUrlImage
      }
      requestPayload = {
        input: {
          operation,
          data: payload,
        },
      }
      if (this.runpodApiKey) {
        headers['Authorization'] = `Bearer ${this.runpodApiKey}`
      }
    } else {
      url = `${this.localBaseUrl}/${operation}`
    }

    return { url, requestPayload, headers }
  }

  public async getQwenResponse(
    systemContent: string | null,
    userContent: any,
    model: string = 'qwen-vl-max',
    responseFormat: any = { type: 'json_object' },
    temperature: number = 0.1,
    useCache: boolean = true
  ): Promise<any> {
    try {
      // Construcción del payload compatible con Qwen multimodal
      let messages: any[] = []
      if (systemContent) {
        messages.push({
          role: 'system',
          content: [{ type: 'text', text: systemContent }],
        })
      }
      // userContent puede ser string, objeto multimodal, o array de bloques multimodales
      if (Array.isArray(userContent)) {
        messages.push({
          role: 'user',
          content: userContent,
        })
      } else if (typeof userContent === 'object' && userContent !== null && userContent.type) {
        messages.push({
          role: 'user',
          content: [userContent],
        })
      } else {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: userContent }],
        })
      }

      const payload: any = {
        model,
        temperature,
        messages,
      }
      if (responseFormat) payload.response_format = responseFormat

      const shouldCache = useCache && !containsImages(userContent)
      const cacheKey = shouldCache
        ? llmCacheKey({ systemContent, userContent, model, responseFormat })
        : null

      // Check cache
      if (shouldCache) {
        const cached = await redis.get(cacheKey!)
        if (cached) {
          console.log('Cache hit for getQwenResponse')
          return JSON.parse(cached)
        }
      }

      const { data } = await axios.post(
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const rawResult = data.choices?.[0]?.message?.content
      let parsedResult
      try {
        parsedResult =
          typeof rawResult === 'string'
            ? JSON.parse(rawResult.replace(/```(?:json)?\s*/g, '').trim())
            : rawResult
      } catch {
        const jsonArrayMatch = typeof rawResult === 'string' && rawResult.match(/\[.*?\]/s)
        const jsonObjectMatch = typeof rawResult === 'string' && rawResult.match(/\{.*?\}/s)
        if (jsonArrayMatch) {
          parsedResult = JSON.parse(jsonArrayMatch[0])
        } else if (jsonObjectMatch) {
          parsedResult = JSON.parse(jsonObjectMatch[0])
        } else {
          parsedResult = rawResult
        }
      }

      const promptTokens = data.usage?.prompt_tokens || 0
      const completionTokens = data.usage?.completion_tokens || 0
      const modelPrices = PRICES[model as keyof typeof PRICES]
      const totalCostInEur = modelPrices
        ? (promptTokens * modelPrices.input_cache_miss + completionTokens * modelPrices.output) *
          USD_TO_EUR
        : 0

      const result = {
        result: parsedResult?.result
          ? parsedResult.result
          : parsedResult?.results
            ? parsedResult.results
            : parsedResult,
        cost: {
          totalCostInEur,
          totalTokens: data.usage?.total_tokens,
          promptCacheMissTokens: promptTokens,
          promptCacheHitTokens: 0,
          completionTokens,
        },
      }

      if (shouldCache && hasNonEmptyResult(result))
        await redis.set(cacheKey!, JSON.stringify({ ...result, cost: '0 [cached]' }))

      return result
    } catch (error) {
      console.error('Error fetching Qwen response:', error)
    }
  }

  // NLI (premise/hypothesis → entailment|neutral|contradiction) moved to
  // LogicInferenceService, which encapsulates both the BERT (RunPod) engine
  // (adjustProximitiesByContextInferenceByBert — reuses this.buildRequestConfig)
  // and the gemini-2.5-flash-lite engine (adjustProximitiesByContextInferenceByLLM).

  async getEmbeddingsGPU(tags) {
    const isRemoteGPU = this.apiMode === 'REMOTE'

    if (this.apiMode === 'REMOTE') await this.ensureRunPodWarm('embeddings_gpu')

    try {
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'get_embeddings',
        isRemoteGPU
          ? tags
          : {
              tags,
            },
        'embeddings_gpu'
      )

      const { data } = await axios.post(url, requestPayload, { headers })

      if (this.apiMode === 'LOCAL') {
        return data
      } else {
        return data.output
          ? {
              embeddings: isRemoteGPU
                ? data.output.data.map((d) => d.embedding)
                : data.output.embeddings,
            }
          : { embeddings: [] }
      }
    } catch (error) {
      console.error('Error en getEmbeddings:', error.message, JSON.stringify(tags))
      return { embeddings: [] }
    }
  }

  @withWarmUp('image')
  async getEmbeddingsImages(images: { id: number; base64: any }[]) {
    const batchSize = 16
    let allEmbeddings: any[] = []

    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize)
      const payload = { images: batch }
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'get_embeddings_image',
        payload,
        'image'
      )

      try {
        const { data } = await axios.post(url, requestPayload, { headers })
        const embeddings = data.output ? data.output : data || []
        allEmbeddings = allEmbeddings.concat(embeddings)
      } catch (error) {
        console.error('Error en getEmbeddingsImages:', error.message)
        // Si falla un batch, añade arrays vacíos (opcional, según cómo quieras gestionarlo)
      }
    }

    return { embeddings: allEmbeddings }
  }

  @withCPUWarmUp
  async getEmbeddingsImagesCPU(images: { id: number; base64: any }[]) {
    const batchSize = 16
    let allEmbeddings: any[] = []

    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize)
      try {
        const { data } = await axios.post(process.env.PYTHON_API_CPU + '/clip-image-embeddings', {
          images: batch,
        })
        const embeddings = data.embeddings || []
        allEmbeddings = allEmbeddings.concat(embeddings)
      } catch (error) {
        console.error('Error en getEmbeddingsImagesCPU:', error.message)
      }
    }

    return { embeddings: allEmbeddings }
  }

  @withCPUWarmUp
  async getEmbeddingsCPU(tags) {
    try {
      const { data } = await axios.post(process.env.PYTHON_API_CPU + '/embeddings', { tags })
      return data
    } catch (error) {
      console.error('Error en getEmbeddings:', error.message, JSON.stringify(tags))
      return { embeddings: [] }
    }
  }

  async getEmbeddingsCPUBatch(tags) {
    if (this.apiMode === 'REMOTE') await this.ensureRunPodWarm('embeddings_cpu')

    try {
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'get_embeddings',
        { tags },
        'embeddings_cpu'
      )

      const { data } = await axios.post(url, requestPayload, { headers })

      return { embeddings: data.output.embeddings }
    } catch (error) {
      console.error('Error en getEmbeddings:', error.message, JSON.stringify(tags))
      return { embeddings: [] }
    }
  }

  @withCPUWarmUp
  async getCLIPEmbeddingsCPU(tags) {
    try {
      const { data } = await axios.post(process.env.PYTHON_API_CPU + '/clip-text-embeddings', {
        tags,
      })
      return data
    } catch (error) {
      console.error('Error en getEmbeddings:', error.message, JSON.stringify(tags))
      return { embeddings: [] }
    }
  }

  @withCPUWarmUp
  async getReducedEmbeddings(payload) {
    try {
      const { data } = await axios.post(
        process.env.PYTHON_API_CPU + '/reduce_embeddings_to_3d',
        payload
      )
      return data
    } catch (error) {
      console.error('Error en getReducedEmbeddings:', error.message, JSON.stringify(payload))
      return { reduced_embeddings: [] }
    }
  }

  @withCPUWarmUp
  async getClusters(payload) {
    try {
      const { data } = await axios.post(
        process.env.PYTHON_API_CPU + '/get_clusters',
        JSON.stringify(payload)
      )
      return data
    } catch (error) {
      console.error('Error en getClusters:', error.message, payload)
      return { clusters: [] }
    }
  }

  @withCPUWarmUp
  async getHistogramColor(images) {
    try {
      const { data } = await axios.post(process.env.PYTHON_API_CPU + '/color-histograms', {
        images,
      })

      return data
    } catch (error) {
      const imageCount = Array.isArray(images) ? images.length : 0
      const photoIds = Array.isArray(images) ? images.map((image) => image?.id).slice(0, 10) : []
      const totalBase64Chars = Array.isArray(images)
        ? images.reduce((sum, image) => sum + (image?.base64?.length || 0), 0)
        : 0

      console.error('Error en getEmbeddings:', error.message, {
        imageCount,
        photoIds,
        totalBase64Chars,
      })
      return { embeddings: [] }
    }
  }
  @withWarmUp('image')
  async getPresenceMaps(images: { id: string; base64: string }) {
    try {
      const payload = { images }
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'generate_presence_maps',
        payload,
        'image'
      )

      const { data } = await axios.post(url, requestPayload, { headers })

      return { maps: data }
    } catch (error) {
      console.error('Error en getPresenceMaps:', error.message)
      return { maps: [] }
    }
  }

  @withWarmUp('image')
  async getObjectsDetections(images: { id: number; base64: string }[], categories: any[]) {
    try {
      const payload = { images, categories }
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'detect_objects_base64',
        payload,
        'image'
      )

      const { data } = await axios.post(url, requestPayload, { headers })

      return { detections: data.output ? data.output : data || [] }
    } catch (error) {
      console.error('Error en getObjectsDetections:', error.message)
      return { detections: [] }
    }
  }

  async findSimilarPresenceMaps(image: { id: string }) {
    try {
      const payload = image
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'find_similar_presence_maps',
        payload,
        'image'
      )

      const { data } = await axios.post(url, requestPayload, { headers })

      if (!data.results) {
        console.log()
      }
      return data.results
    } catch (error) {
      console.error('Error en findSimilarPresenceMaps:', error.message)
      return { photos: [] }
    }
  }

  // @withWarmUp('logic_gpu')
  // @MeasureExecutionTime
  // async generateGroupsForTags(tags) {
  //   try {
  //     const payload = { tags }
  //     const { url, requestPayload, headers } = this.buildRequestConfig(
  //       'generate_groups_for_tags',
  //       payload,
  //       'logic_gpu'
  //     )

  //     const { data } = await axios.post(url, requestPayload, { headers })

  //     return data.output ? data.output : data || []
  //   } catch (error) {
  //     console.error('Error en generateGroupsForTags:', error.message)
  //     return []
  //   }
  // }

  // @MeasureExecutionTime
  @withWarmUp((texts, extract_ratio, forceCPU) => (forceCPU ? 'logic_cpu' : 'logic_gpu'))
  async cleanDescriptions(texts, extract_ratio = 0.9, forceCPU: boolean = false) {
    try {
      const payload = {
        texts,
        extract_ratio,
        purge_list: [],
      }
      const { url, requestPayload, headers } = this.buildRequestConfig(
        'clean_texts',
        payload,
        forceCPU ? 'logic_cpu' : 'logic_gpu'
      )

      const { data } = await axios.post(url, requestPayload, { headers })

      return data.output ? data.output : data || []
    } catch (error) {
      console.error('Error en cleanDescriptions:', error.message)
      return []
    }
  }

  // @withWarmUp('logic_gpu')
  // @MeasureExecutionTime
  // async getStructuredQuery(query) {
  //   try {
  //     const payload = { query }
  //     const { url, requestPayload, headers } = this.buildRequestConfig(
  //       'query_segment',
  //       payload,
  //       'logic_gpu'
  //     )

  //     const { data } = await axios.post(url, requestPayload, { headers })

  //     return data.output ? data.output : data || {}
  //   } catch (error) {
  //     console.error('Error en getStructuredQuery:', error.message)
  //     return {}
  //   }
  // }

  // @withWarmUp('logic_gpu')
  // @MeasureExecutionTime
  // async getNoPrefixQuery(query) {
  //   try {
  //     const payload = { query }
  //     const { url, requestPayload, headers } = this.buildRequestConfig(
  //       'query_no_prefix',
  //       payload,
  //       'logic_gpu'
  //     )

  //     const { data } = await axios.post(url, requestPayload, { headers })

  //     return data.output ? data.output : data || {}
  //   } catch (error) {
  //     console.error('Error en getStructuredQuery:', error.message)
  //     return {}
  //   }
  // }

  @MeasureExecutionTime
  public async getMolmoResponse(imagesItems, prompts, promptsPerImage): Promise<any> {
    try {
      // Se asume que imagesItems es un array de objetos { id, base64 }
      const imagesArray = imagesItems.map((item) => ({
        id: item.id,
        base64: item.base64.startsWith('data:image')
          ? item.base64
          : `data:image/jpeg;base64,${item.base64}`,
      }))

      const response = await fetch(`${env.get('HF_MOLMO_ENDPOINT')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.get('HF_KEY')}`,
        },
        body: JSON.stringify({
          inputs: {
            images: imagesArray,
            prompts,
            prompts_per_image: promptsPerImage,
            batch_size: 4,
            generation_config: {
              temperature: 0.1,
              max_new_tokens: 200,
              max_crops: 9,
              overlap_margins: [4, 4],
              float16: true,
            },
            config: { top_p: 1 },
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Error en la API de HF: ${response.statusText}`)
      }

      // Se espera que la respuesta sea un array de objetos con los resultados y los ids asociados
      let parsedResult = await response.json()

      return { result: parsedResult }
    } catch (error) {
      console.error('Error al obtener respuesta del endpoint de HF:', error)
      throw error // re-lanza la excepción para que se active la lógica de reintentos
    }
  }

  // @MeasureExecutionTime
  public async getGPTResponse(
    systemContent: string | null,
    userContent: any,
    model: ModelName,
    responseFormat: any = { type: 'json_object' },
    temperature: number = 1,
    useCache: boolean = true
  ): Promise<any> {
    try {
      // Si el modelo es un GPT-5 base/non-chat, no pasar temperature y usar max_completion_tokens
      const isGpt5NonChat = isGpt5ReasoningModel(model)

      let payload: any = {
        model,
        frequency_penalty: 0,
        top_p: 1,
        messages: systemContent
          ? [
              {
                role: 'system',
                content: systemContent,
              },
              {
                role: 'user',
                content: userContent,
              },
            ]
          : [
              {
                role: 'user',
                content: userContent,
              },
            ],
      }

      if (isGpt5NonChat) {
        // Presupuesto compartido entre tokens de razonamiento y salida visible:
        // si el razonamiento lo agota, la respuesta llega truncada (finish_reason 'length').
        payload.max_completion_tokens = 15000
        payload.reasoning_effort = 'low'
        payload.verbosity = 'low'
      } else {
        payload.temperature = temperature
        payload.max_tokens = 15000
      }

      if (responseFormat) {
        payload.response_format = responseFormat
      }

      const shouldCache = useCache && !containsImages(userContent)
      const cacheKey = shouldCache ? llmCacheKey({ systemContent, userContent, model }) : null

      // Check cache
      if (shouldCache) {
        const cached = await redis.get(cacheKey!)
        if (cached) {
          console.log('Cache hit for getGPTResponse')
          return JSON.parse(cached)
        }
      }

      const { data } = await axios.post(`${env.get('OPENAI_BASEURL')}/chat/completions`, payload, {
        headers: {
          'Authorization': `Bearer ${env.get('OPENAI_KEY')}`,
          'Content-Type': 'application/json',
        },
      })

      const {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        prompt_tokens_details: promptTokensDetails,
      } = data.usage

      const totalTokens = promptTokens + completionTokens

      const inputCostCacheMiss =
        (promptTokens - promptTokensDetails.cached_tokens) *
        PRICES[model].input_cache_miss *
        USD_TO_EUR
      const inputCostCacheHit =
        promptTokensDetails.cached_tokens * PRICES[model].input_cache_hit * USD_TO_EUR
      const inputCost = inputCostCacheMiss + inputCostCacheHit

      const outputCost = completionTokens * PRICES[model].output * USD_TO_EUR
      const totalCostInEur = inputCost + outputCost

      const finishReason = data.choices[0].finish_reason
      const reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens ?? 0
      const budget = payload.max_completion_tokens ?? payload.max_tokens
      const diagnostics =
        `model=${model} | finish_reason=${finishReason} | reasoning_tokens=${reasoningTokens} | ` +
        `completion_tokens=${completionTokens}/${budget}`

      if (finishReason !== 'stop') {
        console.warn(`[GPT_BUDGET] Respuesta no terminada | ${diagnostics}`)
      } else {
        console.log(`[GPT_BUDGET] ${diagnostics}`)
      }

      const rawResult = data.choices[0].message.content

      // if (containsImages(userContent)) {
      //   const imageCount = Array.isArray(userContent) ? userContent.length : 1
      //   // JSON.stringify -> una sola línea: el agregador de logs reordena las multilínea.
      //   console.log(
      //     `[GPT_RAW] model=${model} | blocks=${imageCount} | raw=${JSON.stringify(String(rawResult).slice(0, 8000))}`
      //   )
      // }

      const parsedResult = robustJsonParse(rawResult)

      if (finishReason === 'stop' && Object.keys(parsedResult).length === 0) {
        console.warn(`[GPT_BUDGET] Respuesta completa pero no parseable | ${diagnostics}`)
      }

      const result = {
        result: parsedResult.result
          ? parsedResult.result
          : parsedResult.results
            ? parsedResult.results
            : parsedResult,
        cost: {
          totalCostInEur,
          totalTokens,
          promptCacheMissTokens: promptTokens - promptTokensDetails.cached_tokens,
          promptCacheHitTokens: promptTokensDetails.cached_tokens,
          completionTokens,
        },
      }

      // Cache the result
      if (shouldCache && hasNonEmptyResult(result))
        await redis.set(cacheKey!, JSON.stringify({ ...result, cost: '0 [cached]' }))

      return result
    } catch (error) {
      const status = error?.response?.status
      const apiData = error?.response?.data
      console.error(
        `[GPT_ERROR] getGPTResponse failed | model=${model}` +
          (status ? ` | httpStatus=${status}` : '') +
          ` | message=${error instanceof Error ? error.message : String(error)}` +
          (apiData ? ` | apiResponse=${JSON.stringify(apiData).slice(0, 500)}` : '')
      )
    }
  }

  public async getGeminiResponse(
    systemPrompt: string,
    userMessages: any[],
    model: ModelName,
    generationConfig: any = { temperature: 0.1 },
    useCache: boolean = true,
    throwOnError: boolean = false,
    thinkingConfigOverride?: {
      thinkingBudget?: number
      thinkingLevel?: string
      includeThoughts?: boolean
    }
  ): Promise<any> {
    let finalResult, parsedResult, rawResult
    try {
      const contents = createUserContent([systemPrompt, ...userMessages])

      const shouldCache = useCache && !containsImages(userMessages)
      const cacheKey = shouldCache ? llmCacheKey({ systemPrompt, userMessages, model }) : null

      // Check cache
      if (shouldCache) {
        const cached = await redis.get(cacheKey!)
        if (cached) {
          console.log('Cache hit for getGeminiResponse')
          return JSON.parse(cached)
        }
      }

      const ai = new GoogleGenAI({
        apiKey: env.get('GEMINI_API_KEY'),
      })

      // Configure generation options.
      // Minimum thinking by default: Gemini 2.5 → thinkingBudget:0 (fully off);
      // Gemini 3 → MINIMAL (closest to off; model may still think for hard tasks).
      // Callers can override via thinkingConfigOverride without changing their call-site.
      const isGemini3 = model.startsWith('gemini-3')
      const defaultThinkingConfig = isGemini3
        ? { thinkingLevel: 'MINIMAL' } // MINIMAL = lowest Gemini 3 level (Google docs, 2026-05-18)
        : { thinkingBudget: 0 } // Gemini 2.5: 0 fully disables thinking
      const config: GenerateContentConfig = {
        ...generationConfig,
        topP: 1,
        topK: 30,
        thinkingConfig: thinkingConfigOverride ?? defaultThinkingConfig,
        maxOutputTokens: 2500,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      }

      // Generate content using the client (with retries for transient errors)
      const maxRetries = 4
      let result: GenerateContentResponse | undefined
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          result = await ai.models.generateContent({
            model,
            contents,
            config,
          })
          break // success, exit retry loop
        } catch (retryError: any) {
          const status = retryError?.status ?? retryError?.code ?? retryError?.httpErrorCode
          const isRetryable =
            [429, 500, 503].includes(Number(status)) ||
            /UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL|overloaded|high demand/i.test(
              retryError?.message || ''
            )

          if (!isRetryable || attempt === maxRetries) {
            throw retryError
          }

          const baseDelay = Math.min(1000 * Math.pow(2, attempt), 16000)
          const jitter = Math.random() * baseDelay * 0.5
          const delay = baseDelay + jitter
          console.warn(
            `[Gemini] Retryable error (attempt ${attempt + 1}/${maxRetries}), retrying in ${Math.round(delay)}ms:`,
            retryError?.message || retryError
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      // Extract usage metadata
      const usageMetadata = result.usageMetadata || {}
      const promptTokens = usageMetadata.promptTokenCount || 0
      const completionTokens = usageMetadata.candidatesTokenCount || 0
      // Thinking tokens are billed separately by Google (even when thinkingBudget: 0 is set,
      // some models may still emit a small number). Use output price as a conservative estimate
      // since Google charges thinking tokens at the output rate.
      const thinkingTokens = (usageMetadata as any).thoughtsTokenCount || 0
      const totalTokens =
        usageMetadata.totalTokenCount || promptTokens + completionTokens + thinkingTokens

      // Calculate costs
      const inputCost = promptTokens * PRICES[model].input_cache_miss * USD_TO_EUR
      const outputCost = (completionTokens + thinkingTokens) * PRICES[model].output * USD_TO_EUR
      const totalCostInEur = inputCost + outputCost

      rawResult = result.text || ''
      parsedResult = robustJsonParse(rawResult)

      finalResult = {
        result: parsedResult.result
          ? parsedResult.result
          : parsedResult.results
            ? parsedResult.results
            : parsedResult,
        cost: {
          totalCostInEur,
          totalTokens,
          promptTokens,
          completionTokens,
          thinkingTokens,
          // Gemini no reporta cached tokens de la misma manera
          promptCacheMissTokens: promptTokens,
          promptCacheHitTokens: 0,
        },
      }

      // Cache the result
      if (shouldCache && hasNonEmptyResult(finalResult))
        await redis.set(cacheKey!, JSON.stringify({ ...finalResult, cost: '0 [cached]' }))

      return finalResult
    } catch (error) {
      console.error('Error fetching Gemini response:', error)
      if (throwOnError) throw error
      return undefined
    }
  }

  /**
   * TypeSafe AI System One call (Jev). Non-autoregressive: `state` is evaluated
   * once against every question in `questions` and the API returns one typed
   * answer per question key. Same return contract as the other providers so the
   * CostTracker proxy records it: `{ result: answers, cost, model }`. Output
   * tokens are free, so the cost is input tokens only.
   *
   * The host is chosen by JEV_PROVIDER (see utils/jev_provider.ts): the official
   * API or OpenRouter, both speaking the same systemone contract. `model` is the
   * logical id; the provider spells it its own way. When the host reports a real
   * `usage.cost` (OpenRouter does, in USD) it wins over the PRICES estimate.
   */
  public async getJevResponse(
    state: unknown,
    questions: Record<string, unknown>,
    model: JevModelName = 'jev-latest',
    useCache: boolean = true,
    throwOnError: boolean = false
  ): Promise<any> {
    try {
      const cacheKey = useCache ? llmCacheKey({ provider: 'jev', state, questions, model }) : null
      if (cacheKey) {
        const cached = await redis.get(cacheKey)
        if (cached) {
          console.log('Cache hit for getJevResponse')
          return JSON.parse(cached)
        }
      }

      const provider = resolveJevProvider()
      if (!provider.apiKey) {
        throw new Error(`Jev provider "${provider.name}" has no API key configured`)
      }
      const headers = {
        ...provider.headers,
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      }

      const maxRetries = 3
      let data: any
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await axios.post(
            provider.url,
            { model: provider.modelId(model), state, questions },
            { headers, timeout: 20000 }
          )
          data = response.data
          break
        } catch (retryError: any) {
          const status = Number(retryError?.response?.status)
          const isRetryable =
            [429, 500, 502, 503, 529].includes(status) ||
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(retryError?.code)
          if (!isRetryable || attempt === maxRetries) throw retryError

          const baseDelay = Math.min(500 * Math.pow(2, attempt), 8000)
          const delay = baseDelay + Math.random() * baseDelay * 0.5
          console.warn(
            `[Jev/${provider.name}] Retryable error (attempt ${attempt + 1}/${maxRetries}, status=${status || retryError?.code}), retrying in ${Math.round(delay)}ms`
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      const inputTokens = Number(data?.usage?.input_tokens) || 0
      const outputTokens = Number(data?.usage?.output_tokens) || 0
      const reportedCostUsd = Number(data?.usage?.cost)
      const totalCostInEur =
        (Number.isFinite(reportedCostUsd) && reportedCostUsd >= 0
          ? reportedCostUsd
          : inputTokens * PRICES['jev-latest'].input_cache_miss) * USD_TO_EUR

      const finalResult = {
        result: data?.answers ?? {},
        model: data?.model ?? model,
        provider: provider.name,
        cost: {
          totalCostInEur,
          totalTokens: inputTokens + outputTokens,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          thinkingTokens: 0,
          promptCacheMissTokens: inputTokens,
          promptCacheHitTokens: 0,
        },
      }

      if (cacheKey && hasNonEmptyResult(finalResult))
        await redis.set(cacheKey, JSON.stringify({ ...finalResult, cost: '0 [cached]' }))

      return finalResult
    } catch (error: any) {
      const status = error?.response?.status
      console.error(
        `[JEV_ERROR] getJevResponse failed | provider=${process.env.JEV_PROVIDER || 'typesafe'} | model=${model}` +
          (status ? ` | httpStatus=${status}` : '') +
          ` | message=${error instanceof Error ? error.message : String(error)}` +
          (error?.response?.data
            ? ` | apiResponse=${JSON.stringify(error.response.data).slice(0, 500)}`
            : '')
      )
      if (throwOnError) throw error
      return undefined
    }
  }

  /**
   * Anthropic (Claude). Homólogo de getGPTResponse/getGeminiResponse para las llamadas
   * que NO pasan por LangChain (clasificador, tareas sueltas, batch de descripciones…).
   *
   * Diferencias reales frente a los otros dos proveedores, todas visibles aquí:
   *
   * - `system` va en su propio campo de nivel superior, no como un mensaje más.
   * - No hay `response_format`. El JSON se fuerza con `output_config.format`
   *   (structured outputs) cuando se pasa `jsonSchema`; sin esquema se pide por prompt y
   *   se recoge con robustJsonParse, igual que en el resto del servicio.
   * - El razonamiento es "adaptive": no se le pasa presupuesto de tokens, se regula con
   *   `output_config.effort`. Pasar `thinking.budget_tokens` da 400 en esta familia.
   * - `temperature` NO se envía. Opus 5 la rechaza de plano y Sonnet 5 solo tolera el
   *   valor por defecto, así que el parámetro simplemente no existe en esta firma.
   *
   * @param effort  Profundidad de razonamiento. `null` deja el valor por defecto del
   *                modelo (`high`), que es lo que la API aplica al omitir el campo.
   * @param jsonSchema  JSON Schema para structured outputs. Con él la respuesta es JSON
   *                    válido garantizado; sin él se hace el parseo tolerante de siempre.
   * @param maxTokens   TECHO: 21333 (= 128000/6). Por encima, el SDK rechaza la petición
   *                    en local —sin llegar a red— porque estima más de 10 min de
   *                    generación y exige streaming. Esta ruta no hace streaming.
   */
  public async getClaudeResponse(
    systemContent: string | null,
    userContent: any,
    model: ModelName = 'claude-sonnet-5',
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null = null,
    useCache: boolean = true,
    maxTokens: number = 8000,
    jsonSchema: any = null
  ): Promise<any> {
    try {
      const shouldCache = useCache && !containsImages(userContent)
      const cacheKey = shouldCache
        ? llmCacheKey({ systemContent, userContent, model, effort, jsonSchema })
        : null

      if (shouldCache) {
        const cached = await redis.get(cacheKey!)
        if (cached) {
          console.log('Cache hit for getClaudeResponse')
          return JSON.parse(cached)
        }
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: env.get('ANTHROPIC_API_KEY') })

      const payload: any = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: toAnthropicContent(userContent) }],
      }
      if (systemContent) payload.system = systemContent
      if (effort || jsonSchema) {
        payload.output_config = {
          ...(effort ? { effort } : {}),
          ...(jsonSchema ? { format: { type: 'json_schema', schema: jsonSchema } } : {}),
        }
      }

      const response = await client.messages.create(payload)

      // Las tres tarifas de input llegan separadas y NO se solapan: `input_tokens` es solo
      // lo que no tocó caché. Sumarlas a mano es la única forma de facturar la escritura
      // de caché a su precio (1.25x) en vez de al de input normal.
      const usage: any = response.usage ?? {}
      const promptCacheMissTokens = usage.input_tokens ?? 0
      const promptCacheHitTokens = usage.cache_read_input_tokens ?? 0
      const promptCacheWriteTokens = usage.cache_creation_input_tokens ?? 0
      const completionTokens = usage.output_tokens ?? 0
      // Ya contabilizados DENTRO de completionTokens y facturados a precio de output:
      // se exponen para poder medir el recargo del razonamiento, no para sumarlos.
      const thinkingTokens = usage.output_tokens_details?.thinking_tokens ?? 0
      const totalTokens =
        promptCacheMissTokens + promptCacheHitTokens + promptCacheWriteTokens + completionTokens

      const prices = PRICES[model as keyof typeof PRICES] as any
      const totalCostInEur = prices
        ? (promptCacheMissTokens * prices.input_cache_miss +
            promptCacheHitTokens * prices.input_cache_hit +
            promptCacheWriteTokens * (prices.input_cache_write ?? prices.input_cache_miss) +
            completionTokens * prices.output) *
          USD_TO_EUR
        : 0

      const rawResult = (response.content ?? [])
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('')

      // `refusal` llega con HTTP 200 y `content` vacío o parcial: hay que mirar
      // stop_reason ANTES de leer el contenido o se devuelve un resultado vacío como si
      // fuese una respuesta legítima.
      if (response.stop_reason === 'refusal') {
        console.warn(
          `[CLAUDE] Petición rechazada por los clasificadores | model=${model} | ` +
            `category=${(response as any).stop_details?.category ?? 'n/a'}`
        )
      } else if (response.stop_reason === 'max_tokens') {
        console.warn(
          `[CLAUDE] Respuesta truncada | model=${model} | ` +
            `output=${completionTokens}/${maxTokens} | thinking=${thinkingTokens}`
        )
      }

      const parsedResult = robustJsonParse(rawResult)

      const result = {
        result: parsedResult?.result
          ? parsedResult.result
          : parsedResult?.results
            ? parsedResult.results
            : parsedResult,
        cost: {
          totalCostInEur,
          totalTokens,
          promptCacheMissTokens,
          promptCacheHitTokens,
          promptCacheWriteTokens,
          completionTokens,
          thinkingTokens,
        },
      }

      if (shouldCache && hasNonEmptyResult(result))
        await redis.set(cacheKey!, JSON.stringify({ ...result, cost: '0 [cached]' }))

      return result
    } catch (error) {
      const status = error?.status ?? error?.response?.status
      console.error(
        `[CLAUDE_ERROR] getClaudeResponse failed | model=${model}` +
          (status ? ` | httpStatus=${status}` : '') +
          ` | message=${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  @MeasureExecutionTime
  public async getDSResponse(
    systemContent: string | null,
    userContent: any,
    model: 'deepseek-chat' = 'deepseek-chat',
    responseFormat: any = { type: 'json_object' },
    temperature: number = 0.1,
    useCache: boolean = true
  ): Promise<any> {
    try {
      let payload: any = {
        model,
        temperature,
        stream: false,
        messages: systemContent
          ? [
              {
                role: 'system',
                content: systemContent,
              },
              {
                role: 'user',
                content: userContent,
              },
            ]
          : [
              {
                role: 'user',
                content: userContent,
              },
            ],
      }

      const shouldCache = useCache && !containsImages(userContent)
      const cacheKey = shouldCache ? llmCacheKey({ systemContent, userContent, model }) : null

      if (responseFormat) {
        payload.response_format = responseFormat
      }

      // Check cache
      if (shouldCache) {
        const cached = await redis.get(cacheKey!)
        if (cached) {
          console.log('Cache hit for getDSResponse')
          return JSON.parse(cached)
        }
      }

      const { data } = await axios.post(
        `${env.get('DEEPSEEK_BASEURL')}/chat/completions`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${env.get('DEEPSEEK_KEY')}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        prompt_cache_miss_tokens: promptCacheMissTokens,
        prompt_cache_hit_tokens: promptCacheHitTokens,
      } = data.usage

      const totalTokens = promptTokens + completionTokens

      const inputCostCacheMiss = promptCacheMissTokens * PRICES[model].input_cache_miss * USD_TO_EUR
      const inputCostCacheHit = promptCacheHitTokens * PRICES[model].input_cache_hit * USD_TO_EUR
      const inputCost = inputCostCacheMiss + inputCostCacheHit

      const outputCost = completionTokens * PRICES[model].output * USD_TO_EUR
      const totalCostInEur = inputCost + outputCost

      const rawResult = data.choices[0].message.content
      let parsedResult

      try {
        parsedResult = JSON.parse(rawResult.replace(/```(?:json)?\s*/g, '').trim())
      } catch {
        const jsonArrayMatch = rawResult.match(/\[.*?\]/s)
        const jsonObjectMatch = rawResult.match(/\{.*?\}/s)
        if (jsonArrayMatch) {
          parsedResult = JSON.parse(jsonArrayMatch[0])
        } else if (jsonObjectMatch) {
          parsedResult = JSON.parse(jsonObjectMatch[0])
        } else {
          parsedResult = {}
        }
      }

      const result = {
        result: parsedResult.result
          ? parsedResult.result
          : parsedResult.results
            ? parsedResult.results
            : parsedResult,
        cost: {
          totalCostInEur,
          // inputCost,
          // outputCost,
          totalTokens,
          // promptTokens,
          promptCacheMissTokens,
          promptCacheHitTokens,
          completionTokens,
        },
      }

      // Cache the result
      if (shouldCache && hasNonEmptyResult(result))
        await redis.set(cacheKey!, JSON.stringify({ ...result, cost: '0 [cached]' }))

      return result
    } catch (error) {
      console.error('Error fetching DS response:', error)
      return {}
    }
  }

  // METODOS BATCH API //

  public async submitGPTBatch(requests: any[]): Promise<string> {
    const payload = {
      input_file_id: await this.uploadBatchFile(requests),
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
      metadata: { type: 'photo_analyzer' },
      // webhook_url: `${env.get('APP_BASE_URL')}/api/openai/batch-webhook`,
    }

    const { data } = await axios.post(`${env.get('OPENAI_BASEURL')}/batches`, payload, {
      headers: {
        'Authorization': `Bearer ${env.get('OPENAI_KEY')}`,
        'Content-Type': 'application/json',
      },
    })

    return data.id // Este es el batchId que debes guardar
  }

  private async uploadBatchFile(requests: any[]): Promise<string> {
    const jsonl = requests.map((req) => JSON.stringify(req)).join('\n') + '\n'
    const buffer = Buffer.from(jsonl, 'utf-8')

    const form = new FormData()
    form.append('file', buffer, {
      filename: 'batch.jsonl',
      contentType: 'application/jsonl',
    })
    form.append('purpose', 'batch')

    const { data } = await axios.post(`${env.get('OPENAI_BASEURL')}/files`, form, {
      headers: { Authorization: `Bearer ${env.get('OPENAI_KEY')}`, ...form.getHeaders() },
    })

    return data.id
  }

  public async getBatchStatus(batchId: string): Promise<string> {
    const { data } = await axios.get(`${env.get('OPENAI_BASEURL')}/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${env.get('OPENAI_KEY')}` },
    })
    return data.status // "in_progress", "completed", "failed"
  }

  public async getBatchResults(batchId: string): Promise<any[]> {
    const { data: batch } = await axios.get(`${env.get('OPENAI_BASEURL')}/batches/${batchId}`, {
      headers: { Authorization: `Bearer ${env.get('OPENAI_KEY')}` },
    })

    const outputFileId = batch.output_file_id

    const { data: content } = await axios.get(
      `${env.get('OPENAI_BASEURL')}/files/${outputFileId}/content`,
      {
        headers: { Authorization: `Bearer ${env.get('OPENAI_KEY')}` },
        responseType: 'text',
      }
    )

    // Cada línea del archivo es un JSON individual
    const lines = content.trim().split('\n')

    const results = lines.map((line) => {
      const obj = JSON.parse(line)
      try {
        const content = obj?.response?.body?.choices?.[0]?.message?.content || ''
        const cleaned = content
          .replace(/```(?:json)?/g, '')
          .replace(/```/g, '')
          .trim()
        let root: any
        try {
          root = JSON.parse(cleaned)
        } catch {
          root = null
        }
        const expected = (obj.custom_id || '').split('-').filter(Boolean).length || 1
        let items: any[] = []
        if (Array.isArray(root)) items = root
        else if (root?.results && Array.isArray(root.results)) items = root.results
        else if (root?.result && Array.isArray(root.result)) items = root.result
        else if (
          root &&
          typeof root === 'object' &&
          Object.keys(root).some((k) => /^image_\d+$/.test(k))
        ) {
          // Respuesta con json_schema: { image_1: {...}, image_2: {...} } -> array ordenado.
          items = Object.keys(root)
            .filter((k) => /^image_\d+$/.test(k))
            .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
            .map((k) => root[k])
        } else if (root && typeof root === 'object') {
          // Caso: objeto con claves numéricas ("0", "1", ...) representando índices
          const numericKeys = Object.keys(root).filter((k) => /^\d+$/.test(k))
          if (numericKeys.length) {
            numericKeys.sort((a, b) => Number(a) - Number(b))
            items = numericKeys.map((k) => root[k])
          }
        } else if (root && expected === 1 && typeof root === 'object') items = [root]
        return { ...obj, items }
      } catch (e) {
        return { ...obj, items: [] }
      }
    })

    return results
  }

  // ===============================
  // GEMINI BATCH API (OFICIAL)
  // ===============================

  async submitGeminiBatch(requests: any[], displayName: string): Promise<string | null> {
    const batchBody = {
      batch: {
        displayName,
        inputConfig: {
          requests: {
            requests: requests.map((r) => ({
              key: r.key, // identificador del request
              request: r.request, // generateContent válido
            })),
          },
        },
      },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:batchGenerateContent`

    const res = await this.http.post(url, batchBody)

    // Devuelve el nombre del batch job
    return res.data?.batch?.name ?? null
  }

  async getGeminiBatchStatus(batchName: string): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}`
    const res = await this.http.get(url)

    return res.data?.state ?? null
  }

  async getGeminiBatchResultsInline(batchName: string): Promise<any[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/${batchName}`
    const res = await this.http.get(url)

    // Resultados inline según doc oficial
    const responses = res.data?.output?.inlinedResponses?.inlinedResponses

    return Array.isArray(responses) ? responses : []
  }
}
