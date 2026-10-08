import { PICKS_CRITERIA, PICKS_CRITERION_KEYS, PICKS_GENRES } from '#config/picks'

// Prompts for Photoreka Picks. They started as a copy of the `style` scoring prompt
// in visual_scores.ts and evolve on their own, like the criteria in config/picks.

const imageKey = (index: number) => `image_${index + 1}`

const OUTPUT_KEY_CONTRACT = `Each output key refers to one input image by position: \`image_1\` is the first image, \`image_2\` the second, and so on.`

function exampleFor(imageCount: number, item: Record<string, unknown>): string {
  const shown = Math.min(imageCount, 2)
  const example = Object.fromEntries(Array.from({ length: shown }, (_, i) => [imageKey(i), item]))
  return JSON.stringify(example, null, 2)
}

// ── Scores + critique ────────────────────────────────────────────────────────

export function picksScoresPrompt(imageCount: number): string {
  const fields = PICKS_CRITERIA.map((c) => `   - ${c.key}: ${c.description}`).join('\n\n')
  const example = exampleFor(imageCount, {
    scores: Object.fromEntries(PICKS_CRITERION_KEYS.map((k) => [k, '<number>'])),
    critique: '<one or two sentences>',
  })

  return `
You are a photography critic specialized in street, documentary, and artistic photography.

${OUTPUT_KEY_CONTRACT}

Analyze each image in depth. For each one, provide:

"scores":
   A JSON object with ratings for the following aspects, as numbers from **1 to 10**, where:
  - **1** = Disastrous
  - **2.5** = Poor
  - **5** = Acceptable
  - **7.5** = Remarkable
  - **10** = Unique / Outstanding

   Fields:

${fields}

"critique":
   At most 35 words, as a seasoned photo editor would say them in a portfolio review. Decide whether this image deserves praise or criticism, then write only that. Praising, you name no flaw and suggest nothing. Criticising, your very first words are already the flaw, never the subject's merit: not "her gaze is strong yet the framing wanders", just "the framing wanders". Never "but", "yet", "though", "while". Name the concrete element (light, gesture, timing, colour, subject) so the photographer recognises their own picture. Do not fall back on cropping, cut limbs or edge tension unless it is truly decisive here.

📌 **Output example:**
\`\`\`json
${example}
\`\`\`
`
}

export function picksScoresSchema(imageCount: number): Record<string, any> {
  const item = {
    type: 'object',
    properties: {
      scores: {
        type: 'object',
        properties: Object.fromEntries(PICKS_CRITERION_KEYS.map((k) => [k, { type: 'number' }])),
        required: PICKS_CRITERION_KEYS,
        additionalProperties: false,
      },
      critique: { type: 'string' },
    },
    required: ['scores', 'critique'],
    additionalProperties: false,
  }
  const keys = Array.from({ length: imageCount }, (_, i) => imageKey(i))
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, item])),
    required: keys,
    additionalProperties: false,
  }
}

// ── Genres ───────────────────────────────────────────────────────────────────

export function picksGenresPrompt(imageCount: number): string {
  const genres = PICKS_GENRES.map((g) => `- ${g.key}: ${g.description}`).join('\n')
  const example = exampleFor(imageCount, { genres: ['<genre>'] })

  return `
You classify photographs by genre.

${OUTPUT_KEY_CONTRACT} Each image is preceded by its key.

For each image, list every genre it clearly belongs to. A photo can belong to several (a travel photo of a busy market is both travel and street) or to none (a product shot or a screenshot fits no genre, so its list is empty). The genres are:

${genres}

📌 **Output example:**
\`\`\`json
${example}
\`\`\`
`
}

export { imageKey as picksImageKey }
