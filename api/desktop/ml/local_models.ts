import path from 'node:path'
import sharp from 'sharp'
import * as ort from 'onnxruntime-node'
import { env, pipeline, AutoTokenizer } from '@huggingface/transformers'
import { pilResizeBicubic } from './pil_resize.js'

/**
 * Vectores que en la nube calcula el servicio Python, calculados en el escritorio con ONNX y
 * con resultados idénticos (validado contra los vectores de producción):
 * - texto MiniLM (all-MiniLM-L6-v2, media de tokens normalizada, como sentence-transformers);
 * - texto e imagen CLIP, exportados del propio servicio Python (electron/scripts/export_clip.py)
 *   porque su open_clip usa una activación distinta de la del CLIP original.
 * Las respuestas tienen la misma forma que las del servicio Python.
 */

const CONTEXT = 77
const EOT = 49407
const IMAGE_SIZE = 224
const MEAN = [0.48145466, 0.4578275, 0.40821073]
const STD = [0.26862954, 0.26130258, 0.27577711]

function modelsDir() {
  const dir = process.env.PHOTOREKA_MODELS_DIR
  if (!dir) throw new Error('Falta la variable PHOTOREKA_MODELS_DIR')
  return dir
}

let loading: Promise<{ minilm: any; clipTokenizer: any; clipText: ort.InferenceSession; clipImage: ort.InferenceSession }> | null = null
let minilmOnly: Promise<any> | null = null

function configure() {
  env.localModelPath = path.join(modelsDir(), 'hf')
  env.allowRemoteModels = false
}

/** MiniLM se carga por separado: es el más usado y el más ligero. */
function loadMinilm() {
  if (!minilmOnly) {
    configure()
    minilmOnly = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })
  }
  return minilmOnly
}

function loadClip() {
  if (!loading) {
    configure()
    const clipDir = path.join(modelsDir(), 'clip')
    loading = Promise.all([
      loadMinilm(),
      AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32'),
      ort.InferenceSession.create(path.join(clipDir, 'clip_text.onnx')),
      ort.InferenceSession.create(path.join(clipDir, 'clip_image.onnx')),
    ]).then(([minilm, clipTokenizer, clipText, clipImage]) => ({ minilm, clipTokenizer, clipText, clipImage }))
  }
  return loading
}

function normalize(values: ArrayLike<number>): number[] {
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i]
  const norm = Math.sqrt(sum)
  return Array.from(values, (v) => v / norm)
}

function rows(data: ArrayLike<number>, count: number, dims: number) {
  return Array.from({ length: count }, (_, i) => normalize(Array.prototype.slice.call(data, i * dims, (i + 1) * dims)))
}

/** round() de Python: los empates van al par más cercano (CenterCrop de torchvision). */
function pyRound(x: number) {
  const f = Math.floor(x)
  const d = x - f
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1
}

/** Tokens como open_clip: SOT ... EOT, relleno con 0 hasta 77; si sobra, se corta y el último es EOT. */
function openClipIds(tokenizer: any, text: string): number[] {
  let ids: number[] = tokenizer(text, { add_special_tokens: true }).input_ids.tolist()[0].map(Number)
  if (ids.length > CONTEXT) {
    ids = ids.slice(0, CONTEXT)
    ids[CONTEXT - 1] = EOT
  }
  return [...ids, ...new Array(CONTEXT - ids.length).fill(0)]
}

/** Preprocesado del CLIP de Python: RGB, Resize(224) bicúbico de Pillow, CenterCrop(224), normalización. */
async function clipPixels(base64: string) {
  const { data, info } = await sharp(Buffer.from(base64, 'base64'), { failOn: 'none' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const short = Math.min(info.width, info.height)
  const long = Math.max(info.width, info.height)
  const longNew = Math.floor((IMAGE_SIZE * long) / short)
  const w = info.width <= info.height ? IMAGE_SIZE : longNew
  const h = info.width <= info.height ? longNew : IMAGE_SIZE
  const resized = pilResizeBicubic(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height, w, h)
  const left = pyRound((w - IMAGE_SIZE) / 2)
  const top = pyRound((h - IMAGE_SIZE) / 2)
  const plane = IMAGE_SIZE * IMAGE_SIZE
  const out = new Float32Array(3 * plane)
  for (let y = 0; y < IMAGE_SIZE; y++) {
    for (let x = 0; x < IMAGE_SIZE; x++) {
      const p = ((y + top) * w + x + left) * 3
      const i = y * IMAGE_SIZE + x
      for (let c = 0; c < 3; c++) out[c * plane + i] = (resized[p + c] / 255 - MEAN[c]) / STD[c]
    }
  }
  return out
}

export async function textEmbeddings(tags: string[]) {
  const minilm = await loadMinilm()
  const embeddings: number[][] = []
  for (let i = 0; i < tags.length; i += 64) {
    const output = await minilm(tags.slice(i, i + 64), { pooling: 'mean', normalize: true })
    embeddings.push(...output.tolist())
  }
  return { tags, embeddings }
}

export async function clipTextEmbeddings(texts: string[]) {
  const { clipTokenizer, clipText } = await loadClip()
  const embeddings: number[][] = []
  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32)
    const ids = BigInt64Array.from(batch.flatMap((t) => openClipIds(clipTokenizer, t)).map((n) => BigInt(n)))
    const { text_embeds: out } = await clipText.run({ input_ids: new ort.Tensor('int64', ids, [batch.length, CONTEXT]) })
    embeddings.push(...rows(out.data as Float32Array, batch.length, 512))
  }
  return { texts, embeddings }
}

export async function clipImageEmbeddings(images: { id: any; base64: string }[]) {
  const { clipImage } = await loadClip()
  const embeddings: { id: any; embedding: number[] }[] = []
  for (let i = 0; i < images.length; i += 16) {
    const batch = images.slice(i, i + 16)
    const pixels = await Promise.all(batch.map((image) => clipPixels(image.base64)))
    const input = new Float32Array(batch.length * pixels[0].length)
    pixels.forEach((p, j) => input.set(p, j * p.length))
    const { image_embeds: out } = await clipImage.run({
      pixel_values: new ort.Tensor('float32', input, [batch.length, 3, IMAGE_SIZE, IMAGE_SIZE]),
    })
    rows(out.data as Float32Array, batch.length, 512).forEach((embedding, j) => embeddings.push({ id: batch[j].id, embedding }))
  }
  return { embeddings }
}
