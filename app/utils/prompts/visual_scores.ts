import Photo from '#models/photo'
import { getArtisticCriteria, getPromptVariant, type PromptVariant } from '#config/photo_schema'

// Build the field descriptions block and the output example JSON from the schema.
function buildCriteriaBlock(variant: PromptVariant): string {
  return getArtisticCriteria(variant)
    .map((c) => `   - ${c.key}: ${c.descriptions[variant] ?? ''}`)
    .join('\n\n')
}

// El placeholder era 'x', que enseñaba que en ese campo cabe texto: de ahí salían
// scores guardados como "2 – Serious, almost archival tone…", que rompen a cualquier
// consumidor numérico. Se marca la forma del valor sin dar una cifra: una nota
// concreta aquí arrastraría la distribución de scores hacia ella.
const SCORE_PLACEHOLDER = '<number>'

// El ejemplo refleja la misma forma que impone buildArtisticScoresSchema: un objeto
// con una clave por imagen. Si divergen, el modelo recibe instrucciones contradictorias.
function buildOutputExample(variant: PromptVariant, imageCount: number): string {
  const obj = Object.fromEntries(
    getArtisticCriteria(variant).map((c) => [c.key, SCORE_PLACEHOLDER])
  )
  const shown = Math.min(imageCount, 2)
  const example: Record<string, any> = Object.fromEntries(
    Array.from({ length: shown }, (_, i) => [`image_${i + 1}`, { artistic_scores: obj }])
  )
  return JSON.stringify(example, null, 2)
}

// La cardinalidad y la forma las impone el schema. Lo único que el schema no puede
// expresar es a qué imagen se refiere cada clave, que es lo que dice esta línea.
const OUTPUT_KEY_CONTRACT = `Each output key refers to one input image by position: \`image_1\` is the first image, \`image_2\` the second, and so on.`

// El schema declara los scores como `string` (pasarlos a number exige backfill), y
// un string acepta cualquier cosa. Esta línea fija que el contenido de ese string
// es solo la cifra: es lo único que el schema no puede expresar por sí mismo.
const SCORE_VALUE_CONTRACT = `Each score is the number alone, written as a string: \`"7.5"\` without any commentary.`

/**
 * JSON Schema (neutro de proveedor) para un lote de N imágenes.
 *
 * Las claves `image_1..image_N` existen para fijar la cardinalidad: en modo strict
 * el decodificador no puede emitir una entrada de más ni omitir ninguna, que es
 * justo el fallo que se da con lotes de fotos casi idénticas. `minItems`/`maxItems`
 * sobre arrays no están soportados por OpenAI, de ahí el objeto en vez del array.
 *
 * Los scores van como `string` a propósito: es lo que hay hoy en la DB y lo que
 * esperan sus consumidores. Cambiarlos a number exige backfill.
 */
export const buildArtisticScoresSchema = (
  imageCount: number,
  userProfile: string = 'general'
): Record<string, any> => {
  const variant = getPromptVariant(userProfile)
  const keys = getArtisticCriteria(variant).map((c) => c.key)

  const imageItem = {
    type: 'object',
    properties: {
      artistic_scores: {
        type: 'object',
        properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' }])),
        required: keys,
        additionalProperties: false,
      },
    },
    required: ['artistic_scores'],
    additionalProperties: false,
  }

  const imageKeys = Array.from({ length: imageCount }, (_, i) => `image_${i + 1}`)

  return {
    type: 'object',
    properties: Object.fromEntries(imageKeys.map((k) => [k, imageItem])),
    required: imageKeys,
    additionalProperties: false,
  }
}

/** Firma paralela a la de los prompts, para declararlo igual en analyzer_packages. */
export const ARTISTIC_SCORES_SCHEMA = (
  photosBatch: Photo[],
  userProfile: string = 'general'
): Record<string, any> => buildArtisticScoresSchema(photosBatch.length, userProfile)

export const MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES = (
  photosBatch: Photo[],
  userProfile: string = 'general'
): string => {
  const variant = getPromptVariant(userProfile)
  const count = photosBatch.length
  if (variant === 'general') return MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES_GENERAL(count)
  if (variant === 'commercial') return MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES_COMMERCIAL(count)
  return MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES_STYLE(count)
}

export const MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES_STYLE = (imageCount: number = 1) => `

You are a photography critic specialized in street, documentary, and artistic photography.

${OUTPUT_KEY_CONTRACT}

${SCORE_VALUE_CONTRACT}

Analyze each image in depth. For each one, provide:

"artistic_scores":
   A JSON object with ratings for the following aspects, from **1 to 10**, where:
  - **1** = Disastrous
  - **2.5** = Poor
  - **5** = Acceptable
  - **7.5** = Remarkable
  - **10** = Unique / Outstanding

   Fields:

${buildCriteriaBlock('style')}

📌 **Output example:**
\`\`\`json
${buildOutputExample('style', imageCount)}
\`\`\`
`

export const MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES_GENERAL = (imageCount: number = 1) => `

You are a photography critic with experience in street, documentary, travel, and everyday photography, including amateur and family photography.

You understand that the images you analyze are **not intended as award-winning or gallery-level work**, but rather **personal, casual, travel, family, and miscellaneous photographs**.
Your role is to evaluate them **within that realistic context**, applying artistic judgment without unrealistic expectations.

${OUTPUT_KEY_CONTRACT}

${SCORE_VALUE_CONTRACT}

Analyze each image in depth. For each one, provide:

"artistic_scores":
   A JSON object with ratings for the following aspects, from **1 to 10**, where:

  - **1** = Very weak / ineffective even for a casual photo
  - **2.5** = Poor
  - **5** = Acceptable / works reasonably well in a personal or amateur context
  - **7.5** = Remarkable / clearly stands out for a non-professional image
  - **10** = Exceptional / surprisingly strong even beyond a casual context

⚠️ Scores should be **honest and grounded**, not indulgent, but also **not excessively harsh or elitist**.
Judge each aspect by how well it works **for what the photo is trying to be**, not by professional or competition standards.

Fields:

${buildCriteriaBlock('general')}

📌 **Output example:**
\`\`\`json
${buildOutputExample('general', imageCount)}
\`\`\`
`

export const MESSAGE_ANALYZER_CONTEXT_ARTISTIC_SCORES_COMMERCIAL = (imageCount: number = 1) => `

You are a photography critic specialized in commercial photography: advertising, stock, fashion, editorial, lifestyle, product, beauty and food imagery.

You understand that the images you analyze are intended for **commercial use** — to sell, communicate a brand, populate stock libraries, illustrate editorial content, or showcase a product/lifestyle.
Judge each image **within that commercial context**, valuing visual polish, clarity of intent, marketability and craft, while avoiding both elitism and indulgence.

${OUTPUT_KEY_CONTRACT}

${SCORE_VALUE_CONTRACT}

Analyze each image in depth. For each one, provide:

"artistic_scores":
   A JSON object with ratings for the following aspects, from **1 to 10**, where:
  - **1** = Disastrous for commercial use
  - **2.5** = Poor / unlikely to be picked
  - **5** = Acceptable / usable as filler stock or rough mood image
  - **7.5** = Remarkable / strong, professional commercial asset
  - **10** = Outstanding / hero-image quality, immediately marketable

⚠️ Scores should be **honest and grounded**, judging each aspect by how well it serves the commercial intent of the image, not by fine-art standards.

Fields:

${buildCriteriaBlock('commercial')}

📌 **Output example:**
\`\`\`json
${buildOutputExample('commercial', imageCount)}
\`\`\`
`
