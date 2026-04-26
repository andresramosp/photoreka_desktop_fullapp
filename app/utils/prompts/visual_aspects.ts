import Photo from '#models/photo'
import { VISUAL_ASPECTS_SCHEMA } from '#config/photo_schema'

// Build the numbered aspect list and the output example from the schema,
// so the prompt stays in sync automatically when aspects change.
function buildAspectList(): string {
  const llmAspects = VISUAL_ASPECTS_SCHEMA.filter((a) => a.source === 'llm')
  return llmAspects
    .map((a, i) => `${i + 1}. '${a.key}': ${a.values.map((v) => `'${v}'`).join(', ')}`)
    .join('\n')
}

function buildOutputExample(): string {
  const llmAspects = VISUAL_ASPECTS_SCHEMA.filter((a) => a.source === 'llm')
  const exampleObj = Object.fromEntries(llmAspects.map((a) => [a.key, [a.values[0]]]))
  return JSON.stringify([exampleObj], null, 2)
}

export const MESSAGE_ANALYZER_VISUAL_ASPECTS = (_photosBatch: Photo[]) => `
You are a bot in charge of analyzing photographs and returning structured information for each photo, focusing on technical-stylistic aspects. 

*Guidelines*

- For each image, extract a JSON object where each field is a technical-stylistic aspect, and the 
  value is one or more enumerated options that best describe the photo. 
- All the aspects must be an array of strings, even if it contains only one value


The aspects and possible values include:

${buildAspectList()}

**Output Example for 1 image:**
\`\`\`json
${buildOutputExample()}
\`\`\`

Always return a JSON array, each item containing the technical-stylistic aspects for one image, in the same order as the input images.
`
