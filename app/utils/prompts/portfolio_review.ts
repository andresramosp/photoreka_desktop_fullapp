/**
 * Prompts unificados para Portfolio Review
 *
 * Cada tipo de review (story, context, general) tiene un único prompt que:
 * - Recibe fotos del cluster (texto o imágenes según el tipo)
 * - Opcionalmente recibe patrones previos (para rebuilds)
 * - Devuelve: { decision, mergeWithPatternId?, title, description, representativePhotoIds, patternType? }
 */

// Tipo para patrones existentes (usados en rebuild)
export interface ExistingPatternSummary {
  patternId: string
  title: string
  shortDescription: string
}

// ========================================
// PROMPT PARA STORY (narrative patterns)
// ========================================
export const PROMPT_PORTFOLIO_STORY = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[] = []
) => {
  const hasExistingPatterns = existingPatterns.length > 0

  const existingPatternsText = hasExistingPatterns
    ? `
EXISTING PATTERNS FROM PREVIOUS BUILD (you can merge into these):
${existingPatterns.map((p, idx) => `${idx + 1}. [${p.patternId}] "${p.title}": ${p.shortDescription}`).join('\n')}
`
    : ''

  const modeDescription = hasExistingPatterns
    ? `REBUILD MODE: You have access to patterns from the PREVIOUS build. Your task is to:
1) Analyze the narrative pattern of this cluster
2) Decide whether to MERGE with an existing pattern from the previous build OR CREATE NEW pattern`
    : `FIRST BUILD MODE: Your task is to:
1) Identify and describe narrative patterns, themes, or storytelling approaches shared by these photos
2) Create a new pattern for this cluster`

  const mergeRules = hasExistingPatterns
    ? `
MERGE RULES (CRITICAL):
- You can ONLY merge with patterns from the PREVIOUS BUILD (listed above).
- Merging should only happen if the photos CLEARLY share the same narrative theme as an existing pattern.
- When in doubt, create a NEW pattern instead of merging.
- Merging should strengthen the pattern, not dilute it.
`
    : ''

  const outputFormat = hasExistingPatterns
    ? `{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge", must be an ID from existing patterns
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2-4 catchy words)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (2-3 sentences)
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]  // REQUIRED: Select the 4 most representative photo IDs
}`
    : `{
  "title": "Pattern Title",
  "description": "Clear description of the narrative pattern shared by these photos",
  "representativePhotoIds": ["id1", "id2", "id3", "id4"] // REQUIRED: Select the 4 most representative photo IDs
}`

  return {
    systemPrompt: `You are analyzing NARRATIVE PATTERNS in a photography portfolio.

${modeDescription}

Your task is to identify and describe NARRATIVE patterns, themes, or storytelling approaches shared by a group of photos.

NARRATIVE PATTERN CHARACTERISTICS:
- Story elements: What story or stories do these photos tell together?
- Emotional arc: Is there an emotional progression or consistent mood?
- Subjects and protagonists: Who or what are the main characters?
- Narrative devices: Use of sequence, contrast, symbolism, etc.
- Thematic coherence: What overarching theme connects these photos?

TITLE RULES (2-4 words):
- Should capture the narrative essence (e.g., "Urban Storytelling", "Isolated Subjects", "Journey Through Time")
- Be evocative but grounded in visible content
- Avoid overly generic titles

DESCRIPTION RULES:
- 2-3 sentences explaining the narrative pattern
- Focus on storytelling elements, not technical aspects
- Be specific about themes observed
${mergeRules}
Return ONLY valid JSON (no markdown, no commentary) in this exact format:
${outputFormat}`,
    userMessage: `${existingPatternsText}${hasExistingPatterns ? '\n' : ''}NEW CLUSTER TO ANALYZE (${photoCount} representative photos):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

Analyze the narrative patterns shared by these photos.`,
  }
}

// ========================================
// PROMPT PARA VISUAL ACCENTS
// ========================================
export const PROMPT_PORTFOLIO_VISUAL_ACCENTS = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[] = []
) => {
  const hasExistingPatterns = existingPatterns.length > 0

  const existingPatternsText = hasExistingPatterns
    ? `
EXISTING PATTERNS FROM PREVIOUS BUILD (you can merge into these):
${existingPatterns.map((p, idx) => `${idx + 1}. [${p.patternId}] "${p.title}": ${p.shortDescription}`).join('\n')}
`
    : ''

  const modeDescription = hasExistingPatterns
    ? `REBUILD MODE: You have access to patterns from the PREVIOUS build. Your task is to:
1) Analyze the visual accents present in this cluster
2) Decide whether to MERGE with an existing visual accent pattern from the previous build OR CREATE a NEW pattern`
    : `FIRST BUILD MODE: Your task is to:
1) Identify recurring visual accents shared by these photos
2) Create a new visual accent pattern for this cluster`

  const mergeRules = hasExistingPatterns
    ? `
MERGE RULES (CRITICAL):
- You can ONLY merge with patterns from the PREVIOUS BUILD (listed above).
- Merge ONLY if the same type of visual accent is clearly present (same kind of object, color accent, visual anomaly, or striking detail).
- Do NOT merge based on mood, story, place, or cultural meaning.
- When in doubt, create a NEW pattern instead of merging.
- Merging should sharpen the visual identity of the pattern, not generalize it.
`
    : ''

  const outputFormat = hasExistingPatterns
    ? `{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge"
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2–4 words)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (1–2 sentences)
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]  // REQUIRED: Select the 4 most representative photo IDs
}`
    : `{
  "title": "Pattern Title",
  "description": "Clear description of the shared visual accent",
  "representativePhotoIds": ["id1", "id2", "id3", "id4"] // REQUIRED: Select the 4 most representative photo IDs
}`

  return {
    systemPrompt: `You are analyzing VISUAL ACCENT PATTERNS in a photography portfolio.

${modeDescription}

Your task is to identify and describe VISUAL ACCENTS shared by a group of photos.

VISUAL ACCENT CHARACTERISTICS:
- Concrete elements only: objects, colors, textures, shapes, reflections, signage, markings, anomalies, or visual noise
- Accidental or secondary details that attract attention
- Strong color accents or isolated visual pops
- Repeated but non-narrative elements
- No story, no emotion, no cultural or contextual interpretation

STRICT EXCLUSIONS:
- Do NOT infer meaning, symbolism, or narrative
- Do NOT describe atmosphere, mood, or social context
- Do NOT explain why the element exists — only that it is visibly present and recurrent

TITLE RULES (2–4 words):
- Purely visual and literal (e.g. "Bright Plastic Chairs", "Red Warning Stickers", "Reflections on Glass")
- No metaphors, no emotional language
- Avoid abstract or conceptual wording

DESCRIPTION RULES:
- 1–2 sentences maximum
- Describe WHAT visually stands out and HOW it repeats across the photos
- Stay strictly descriptive and concrete
${mergeRules}
Return ONLY valid JSON (no markdown, no commentary) in this exact format:
${outputFormat}`,

    userMessage: `${existingPatternsText}${hasExistingPatterns ? '\n' : ''}NEW CLUSTER TO ANALYZE (${photoCount} representative photos):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

Analyze the visual accents shared by these photos.`,
  }
}

// ========================================
// PROMPT PARA CONTEXT (contextual patterns)
// ========================================
export const PROMPT_PORTFOLIO_CONTEXT = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[] = []
) => {
  const hasExistingPatterns = existingPatterns.length > 0

  const existingPatternsText = hasExistingPatterns
    ? `
EXISTING PATTERNS FROM PREVIOUS BUILD (you can merge into these):
${existingPatterns.map((p, idx) => `${idx + 1}. [${p.patternId}] "${p.title}": ${p.shortDescription}`).join('\n')}
`
    : ''

  const modeDescription = hasExistingPatterns
    ? `REBUILD MODE: You have access to patterns from the PREVIOUS build. Your task is to:
1) Analyze the contextual pattern of this cluster
2) Decide whether to MERGE with an existing pattern from the previous build OR CREATE NEW pattern`
    : `FIRST BUILD MODE: Your task is to:
1) Identify and describe contextual similarities, situations, or settings shared by these photos
2) Create a new pattern for this cluster`

  const mergeRules = hasExistingPatterns
    ? `
MERGE RULES (CRITICAL):
- You can ONLY merge with patterns from the PREVIOUS BUILD (listed above).
- Merging should only happen if the photos CLEARLY share the same contextual setting as an existing pattern.
- When in doubt, create a NEW pattern instead of merging.
- Merging should strengthen the pattern, not dilute it.
`
    : ''

  const outputFormat = hasExistingPatterns
    ? `{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge", must be an ID from existing patterns
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2-4 catchy words)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (2-3 sentences)
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]  // REQUIRED: Select the 4 most representative photo IDs
}`
    : `{
  "title": "Pattern Title",
  "description": "Clear description of the contextual pattern shared by these photos",
  "representativePhotoIds": ["id1", "id2", "id3", "id4"] // REQUIRED: Select the 4 most representative photo IDs
}`

  return {
    systemPrompt: `You are analyzing CONTEXTUAL PATTERNS in a photography portfolio.

${modeDescription}

Your task is to identify and describe CONTEXTUAL similarities, situations, or settings shared by a group of photos.

CONTEXTUAL PATTERN CHARACTERISTICS (focus especially on region and geography):
- Cultural-geographic context: Region, country, city, or geographic area reflected in the photos (urban, rural, coastal, mountainous, etc.)
- Settings: Types of places or environments
- Activities or events, traditions, rituals
- Time context (day, season, era)
- Environmental factors (weather, lighting, atmosphere)

TITLE RULES (2-4 words):
- Should capture the contextual or geographic essence (e.g., "Urban Nightlife", "Coastal Life")
- Be descriptive of the setting, situation, or regional aspect
- Avoid overly generic titles

DESCRIPTION RULES:
- 2-3 sentences explaining the contextual and especially geographic or regional similarities
- Focus on settings, environments, and regional or geographic elements
- Be specific about the observed contexts
${mergeRules}
Return ONLY valid JSON (no markdown, no commentary) in this exact format:
${outputFormat}`,
    userMessage: `${existingPatternsText}${hasExistingPatterns ? '\n' : ''}NEW CLUSTER TO ANALYZE (${photoCount} representative photos):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

Analyze the contextual patterns shared by these photos, with special attention to region and geography.`,
  }
}

// ========================================
// PROMPT PARA GENERAL (visual patterns with patternType distinction)
// ========================================
export const PROMPT_PORTFOLIO_GENERAL = (
  photoCount: number,
  photosText: string,
  existingPatterns: ExistingPatternSummary[] = []
) => {
  const hasExistingPatterns = existingPatterns.length > 0

  const existingPatternsText = hasExistingPatterns
    ? `
EXISTING PATTERNS FROM PREVIOUS BUILD (you can merge into these):
${existingPatterns.map((p, idx) => `${idx + 1}. [${p.patternId}] "${p.title}": ${p.shortDescription}`).join('\n')}
`
    : ''

  const modeDescription = hasExistingPatterns
    ? `REBUILD MODE: You have access to patterns from the PREVIOUS build. Your task is to:
1) First, determine the pattern type of this cluster (stylistic vs object_motif)
2) Decide whether to MERGE with an existing pattern from the previous build OR CREATE NEW pattern`
    : `FIRST BUILD MODE: Your task is to:
1) Determine the pattern type of this cluster (stylistic vs object_motif)
2) Create a new pattern for this cluster`

  const mergeRules = hasExistingPatterns
    ? `
MERGE RULES (CRITICAL):
- You can ONLY merge with patterns from the PREVIOUS BUILD (listed above).
- Merging should only happen if:
  * The pattern type matches (both stylistic, or both object_motif with same object)
  * The visual similarity is CLEARLY strong
- When in doubt, create a NEW pattern instead of merging.
`
    : ''

  const outputFormat = hasExistingPatterns
    ? `{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge", must be an ID from existing patterns
  "patternType": "stylistic" | "object_motif",  // REQUIRED always (for new patterns or to verify merge compatibility)
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2-4 words)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (2-3 sentences)
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]  // REQUIRED: Select the 4 most representative photo IDs
}`
    : `{
  "patternType": "stylistic" | "object_motif",
  "title": "Pattern Title",
  "description": "Clear visual description of the pattern shared by these photos",
  "representativePhotoIds": ["id1", "id2", "id3", "id4"] // REQUIRED: Select the 4 most representative photo IDs
}`

  const userMessageTask = hasExistingPatterns
    ? `Analyze the images shown above:
1. Determine if this cluster is "stylistic" or "object_motif"
2. Decide if it should MERGE with an existing pattern from the previous build, or create a NEW pattern
3. Focus strictly on visible visual properties. Do not infer story or context.`
    : `Analyze the ${photoCount} photos shown above and determine the dominant visual reason why they were clustered together.

Focus strictly on visible visual properties. Do not infer story or context.`

  return {
    systemPrompt: `You are analyzing a cluster of photographs from a photography portfolio.

These photos have been grouped together using CLIP embeddings. CLIP can group images for two main reasons:
1. Shared stylistic or aesthetic treatment (lighting, composition, color, rendering, visual approach).
2. The repeated presence of a concrete, visually recognizable object or motif across images (e.g. the same type of object appearing consistently).

${modeDescription}

PATTERN TYPE DEFINITIONS:
- "stylistic": the similarity is driven mainly by visual style, aesthetic treatment, technical or photographic approach.
- "object_motif": the similarity is driven mainly by the repeated presence of the same concrete visual object or motif.

GLOBAL CONSTRAINTS:
- Describe only what is directly visible in the images.
- DO NOT infer story, meaning, social context, identity, culture, location, or events.
- DO NOT use proper nouns (no place names, people names, brands).
- Filenames and IDs are only for indexing.

ADDITIONAL RULES BY PATTERN TYPE:
- If patternType is "stylistic":
  - DO NOT mention specific objects or subjects.
  - Focus strictly on visual treatment, composition, light, color, texture, perspective, or rendering.
- If patternType is "object_motif":
  - You MAY name the recurring object or motif (e.g. dog, mannequin, bicycle).
  - Focus on how the object appears across images (angles, contexts, variations, meanings or symbolism).
${mergeRules}
TITLE RULES (2–4 words):
- Must match the detected pattern type.
- Purely visual or descriptive.
- No narrative framing or implied story.
- If stylistic: use style descriptors + photographic terms (e.g., "Soft Backlight Portraits", "Hard Flash Street", "Muted Pastels")
- If object_motif: you may include the object name (e.g., "Recurring Bicycles", "Dog Portraits")

SELF-CHECK BEFORE ANSWERING:
- Pattern type matches the description.
- No narrative or contextual interpretation.
- Object mentions appear only if patternType is "object_motif".${hasExistingPatterns ? "\n- If merging, ensure the existing pattern's type is compatible." : ''}

Return ONLY valid JSON (no markdown, no commentary) in this exact format:
${outputFormat}

Return only valid JSON.`,
    userMessage: `${existingPatternsText}${hasExistingPatterns ? '\n' : ''}NEW CLUSTER TO ANALYZE (${photoCount} photos shown above):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

${userMessageTask}`,
  }
}

// ========================================
// PROMPT PARA DEDUPLICACIÓN DE PATRONES
// ========================================
export interface PatternForDeduplication {
  patternId: string
  title: string
  shortDescription: string
  photoCount: number
}
export const PROMPT_PORTFOLIO_DEDUPLICATE = (
  patterns: PatternForDeduplication[],
  reviewType: 'story' | 'context' | 'general' | 'visual_accents'
) => {
  const reviewTypeDescriptions: Record<'story' | 'context' | 'general' | 'visual_accents', string> =
    {
      story: 'narrative patterns (themes, storytelling approaches)',
      context: 'contextual patterns (cultural context, settings, situations, geographic regions)',
      general: 'visual patterns (stylistic treatments or recurring object motifs)',
      visual_accents:
        'visual accent patterns (recurring visual details, objects, colors, weird details or anomalies)',
    }

  const patternsText = patterns
    .map(
      (p, idx) =>
        `${idx + 1}. [${p.patternId}] "${p.title}" (${p.photoCount} photos): ${p.shortDescription}`
    )
    .join('\n')

  return {
    systemPrompt: `You are analyzing a list of ${reviewTypeDescriptions[reviewType]} identified in a photography portfolio.

Your task is to identify ONLY CLEARLY DUPLICATE patterns that describe essentially the SAME thing, at the SAME level of abstraction, so they can be MERGED together.

DUPLICATION CRITERIA (STRICT):
- Two patterns are duplicates ONLY if they describe the SAME core concept and could be considered PRACTICAL SYNONYMS
- They should be interchangeable in meaning: replacing one title with the other would not change interpretation
- Minor wording or phrasing differences do NOT make patterns unique
- Differences in scope, specificity, emphasis, or intent DO make patterns unique

DO NOT MERGE:
- Subcases, subsets, specializations, or variations of a broader pattern
- A specific instance into a more general category, or vice versa
- Patterns where one could logically exist inside the other
- Patterns that share elements or subjects but describe different visual roles, meanings, or uses
- Related, adjacent, overlapping, or complementary concepts

Rule of thumb:
If you can reasonably say “X is a type of Y” or “Y includes X”, they are NOT duplicates.

MERGING RULES:
- When you find duplicates, the pattern with FEWER photos will be merged INTO the pattern with MORE photos
- The larger pattern keeps its title and description (it is considered more representative)
- The smaller pattern will be eliminated, but its photos will be added to the larger one
- If two patterns have the same photo count, merge the one that appears later in the list INTO the earlier one

Return ONLY valid JSON (no markdown, no commentary) in this exact format:
{
  "merges": [
    {
      "mergeFrom": "pattern_id_smaller",
      "mergeInto": "pattern_id_larger",
      "reasoning": "Brief explanation of why these patterns are effectively synonymous"
    }
  ]
}  // Empty array if no duplicates found

IMPORTANT:
Be extremely conservative.
Only merge patterns that are practically identical in meaning.
If there is ANY reasonable interpretation in which they differ, do NOT merge them.`,
    userMessage: `PATTERNS TO ANALYZE FOR DUPLICATES:
${patternsText}

Identify any clearly duplicate patterns that should be merged. Remember: merge the smaller (fewer photos) INTO the larger (more photos).`,
  }
}
