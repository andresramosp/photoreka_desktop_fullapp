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

Adapt your analysis to the nature of the portfolio — these photos may be documentary/street, commercial/advertising, portrait, lifestyle, or another genre. The concept of "narrative pattern" is broad: it can mean a shared human story, a consistent brand promise, a repeated lifestyle scenario, or a product-use situation.

Your task is to identify and describe NARRATIVE patterns, themes, or storytelling approaches shared by a group of photos.

NARRATIVE PATTERN CHARACTERISTICS:
- Story or message: What story, situation, or visual message do these photos tell together?
- Tone or emotional register: Is there a consistent mood, emotional arc, or brand tone?
- Subjects and protagonists: Who or what are the main characters or hero elements?
- Narrative devices: Use of sequence, contrast, symbolism, lifestyle promise, implied use, etc.
- Thematic coherence: What overarching theme or intent connects these photos?

TITLE RULES (2-4 words):
- Should capture the narrative or thematic essence (e.g., "Urban Storytelling", "Isolated Subjects", "Journey Through Time", "Aspirational Lifestyle", "Product Discovery", "Quiet Domestic Moments")
- Be evocative but grounded in visible content
- Avoid overly generic titles

DESCRIPTION RULES:
- 2-3 sentences explaining the narrative or thematic pattern
- Focus on storytelling, message, or lifestyle elements — not technical aspects
- Be specific about the themes or intent observed
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

Adapt your analysis to the nature of the portfolio — these photos may be documentary/street, commercial/advertising, portrait, lifestyle, or another genre. "Context" means whatever situational frame is most meaningful for these images: a geographic or cultural setting, a production/shooting environment, a type of venue or scenario, or a situational occasion.

Your task is to identify and describe CONTEXTUAL similarities, situations, or settings shared by a group of photos.

CONTEXTUAL PATTERN CHARACTERISTICS:
- Geographic or cultural setting: Region, country, city, or geographic area when visible or clearly implied (urban, rural, coastal, etc.)
- Shooting or production environment: studio setup, outdoor location, specific type of venue, product placement surface, indoor/outdoor, day/night
- Situational context: Activities, events, occasions, rituals, everyday scenarios, product-use situations, lifestyle settings
- Time context: day, season, era, time of day
- Environmental factors: weather, lighting conditions, atmosphere

TITLE RULES (2-4 words):
- Should capture the dominant contextual or situational essence (e.g., "Urban Nightlife", "Coastal Life", "Studio Product Shots", "Outdoor Lifestyle", "Kitchen Settings", "Market Scenes")
- Be descriptive of the setting or situation
- Avoid overly generic titles

DESCRIPTION RULES:
- 2-3 sentences explaining the shared contextual or situational similarities
- Focus on settings, environments, production context, and situational elements
- Prioritize geographic/cultural context for documentary-style photos; production/shooting context for commercial-style photos
- Be specific about the observed contexts
${mergeRules}
Return ONLY valid JSON (no markdown, no commentary) in this exact format:
${outputFormat}`,
    userMessage: `${existingPatternsText}${hasExistingPatterns ? '\n' : ''}NEW CLUSTER TO ANALYZE (${photoCount} representative photos):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

Analyze the contextual patterns shared by these photos.`,
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
  reviewType: 'story' | 'context' | 'general'
) => {
  const reviewTypeDescriptions: Record<'story' | 'context' | 'general', string> = {
    story: 'narrative patterns (themes, storytelling approaches, implied meaning)',
    context: 'contextual patterns (situations, environments, social or cultural settings)',
    general:
      'visual, technical and stylistic patterns (light, contrast, composition, visual treatment)',
  }

  const patternsText = patterns
    .map(
      (p, idx) =>
        `${idx + 1}. [${p.patternId}] "${p.title}" (${p.photoCount} photos): ${p.shortDescription}`
    )
    .join('\n')

  return {
    systemPrompt: `You are reviewing ${reviewTypeDescriptions[reviewType]} detected in a photography portfolio.

Your task is to MERGE patterns that clearly describe the SAME underlying idea, even if worded differently.

IMPORTANT:
What counts as a meaningful difference depends on the TYPE of pattern you are reviewing.
Respect the relevant visual or conceptual nuances implied by the pattern type.
Do NOT collapse distinctions that are significant at this level of analysis.

MERGE WHEN:
- Patterns refer to the same subject AND the same dominant idea or treatment
- Differences are mostly linguistic (phrasing, adjectives, emphasis)
- A human editor would perceive both clusters as essentially the same pattern

DO NOT MERGE WHEN:
- One pattern is a subset, variant, or special case of another
- One is broader or more abstract than the other
- The visual intention, role, or reading is meaningfully different
- One could reasonably exist inside the other
- They only share subject matter, not the same core idea

Rule of thumb:
If merging would reduce the portfolio’s ability to distinguish patterns at this level, do NOT merge.

MERGING RULES:
- Merge the pattern with FEWER photos INTO the one with MORE photos
- Keep the larger pattern’s title and description
- If photo counts are equal, merge the later one INTO the earlier one

Return ONLY valid JSON in this format:
{
  "merges": [
    {
      "mergeFrom": "pattern_id_smaller",
      "mergeInto": "pattern_id_larger",
      "reasoning": "Brief explanation of why these describe the same pattern"
    }
  ]
}

Be conservative, but apply visual and editorial common sense.`,
    userMessage: `PATTERNS:
${patternsText}

Identify any patterns that should be merged.`,
  }
}
