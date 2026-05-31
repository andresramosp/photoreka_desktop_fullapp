import Photo from '#models/photo'
import {
  VISUAL_ASPECTS_SCHEMA,
  getAspectValuesForVariant,
  getPromptVariant,
  type PromptVariant,
} from '#config/photo_schema'

// Build the numbered aspect list and the output example from the schema,
// so the prompt stays in sync automatically when aspects change.
function buildAspectList(variant: PromptVariant): string {
  const llmAspects = VISUAL_ASPECTS_SCHEMA.filter((a) => a.source === 'llm')
  return llmAspects
    .map((a, i) => {
      const values = getAspectValuesForVariant(a, variant)
      const guidance = a.promptGuidance ? `\n   Guidance: ${a.promptGuidance}` : ''
      return `${i + 1}. '${a.key}': ${values.map((v) => `'${v}'`).join(', ')}${guidance}`
    })
    .join('\n')
}

function buildOutputExample(variant: PromptVariant): string {
  const llmAspects = VISUAL_ASPECTS_SCHEMA.filter((a) => a.source === 'llm')
  const exampleObj = Object.fromEntries(
    llmAspects.map((a) => [a.key, [getAspectValuesForVariant(a, variant)[0]]])
  )
  return JSON.stringify([exampleObj], null, 2)
}

export const MESSAGE_ANALYZER_VISUAL_ASPECTS = (
  _photosBatch: Photo[],
  userProfile: string = 'general'
) => {
  const variant = getPromptVariant(userProfile)
  return `
You are a bot in charge of analyzing photographs and returning structured information for each photo, focusing on technical-stylistic aspects. 

*Guidelines*

- For each image, extract a JSON object where each field is a technical-stylistic aspect, and the 
  value is one or more enumerated options that best describe the photo. 
- All the aspects must be an array of strings, even if it contains only one value


The aspects and possible values include:

${buildAspectList(variant)}

**Output Example for 1 image:**
\`\`\`json
${buildOutputExample(variant)}
\`\`\`

Always return a JSON array, each item containing the technical-stylistic aspects for one image, in the same order as the input images.
`
}
