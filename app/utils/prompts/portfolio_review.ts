export const PROMPT_PORTFOLIO_NARRATIVE_PATTERN = (photosText: string, photoCount: number) => ({
  systemPrompt: `You are analyzing a narrative pattern in a photography portfolio.

Your task is to identify and describe narrative patterns, themes, or storytelling approaches shared by a group of photos.

Generate a concise analysis with:

1. **Pattern Title**: A catchy 2-4 word name that captures the essence (e.g., "Urban Storytelling", "Isolated Subjects")
2. **Description**: 2-3 sentences explaining the narrative pattern, themes, or storytelling approach shared by these photos
3. **Strength Assessment**: Rate this pattern as "strong", "moderate", or "weak" based on:
   - Strong: Very cohesive, clear and consistent themes
   - Moderate: Present but with some variation
   - Weak: Subtle connections, emerging pattern

Return your response in JSON format:
{
  "title": "Pattern Title",
  "description": "Clear description of the pattern",
  "strength": "strong|moderate|weak"
}`,
  userMessage: `Below are ${photoCount} representative photos from a cluster that shares similar themes.

${photosText}`,
})

export const PROMPT_PORTFOLIO_CONTEXTUAL_PATTERN = (photosText: string, photoCount: number) => ({
  systemPrompt: `You are analyzing a contextual pattern in a photography portfolio.

Your task is to identify and describe contextual similarities, situations, or settings shared by a group of photos.

Generate a concise analysis with:

1. **Pattern Title**: A catchy 2-4 word name that captures the essence (e.g., "Documentary Moments", "Cultural Events")
2. **Description**: 2-3 sentences explaining the contextual similarities, situations, or settings shared by these photos
3. **Strength Assessment**: Rate this pattern as "strong", "moderate", or "weak" based on:
   - Strong: Very cohesive, clear and consistent themes
   - Moderate: Present but with some variation
   - Weak: Subtle connections, emerging pattern

Return your response in JSON format:
{
  "title": "Pattern Title",
  "description": "Clear description of the pattern",
  "strength": "strong|moderate|weak"
}`,
  userMessage: `Below are ${photoCount} representative photos from a cluster that shares similar themes.

${photosText}`,
})

export const PROMPT_PORTFOLIO_GENERAL_PATTERN = (photosList: string, photoCount: number) => ({
  systemPrompt: `You are analyzing a visual pattern in a photography portfolio based on CLIP embeddings.

Your task is to identify and describe visual similarities, subjects, or compositional patterns shared by photos that have been clustered based on their visual embeddings.

Generate a concise analysis with:

1. **Pattern Title**: A catchy 2-4 word name that captures the essence (e.g., "Architectural Photography", "Nature Scenes")
2. **Description**: 2-3 sentences explaining the visual similarities, subjects, or compositional patterns
3. **Strength Assessment**: Rate this pattern as "strong", "moderate", or "weak"

Return your response in JSON format:
{
  "title": "Pattern Title",
  "description": "Clear description of the pattern",
  "strength": "strong|moderate|weak"
}`,
  userMessage: `Below are ${photoCount} representative photos from a cluster that shares similar visual characteristics.

${photosList}

Note: These photos have been clustered based on their visual embeddings, indicating they share similar visual patterns or subjects.`,
})

// Prompt for general pattern analysis with actual images
export const PROMPT_PORTFOLIO_GENERAL_PATTERN_WITH_IMAGES = (
  photoCount: number,
  photosText: string
) => ({
  systemPrompt: `You are analyzing a stylistic pattern in a photography portfolio.

You will be shown ${photoCount} photos from a cluster that have been grouped together based on their visual similarity (using CLIP embeddings).

CRITICAL RULES (STYLE-ONLY):
- Analyze ONLY stylistic elements you can SEE: composition, geometry, lighting, color palette, depth of field, grain, motion blur, flash usage, framing, perspective, type of shot.
- DO NOT mention or infer subject matter, identity, culture, ethnicity, location, event, profession, story, or context.
- DO NOT use proper nouns (no place names, people names, group names, brands).
- DO NOT rely on filenames or IDs (they are only for indexing).

TITLE RULES (2-4 words, style-only):
- Use style descriptors + photographic terms (e.g., "Soft Backlight Portraits", "Hard Flash Street", "Muted Pastels", "High Contrast Silhouettes").
- Forbidden: subject labels (e.g., "Masai Life", "Wedding", "Street Vendors"), narrative framing, cultural references, locations.

Generate a concise analysis with:

1. **Pattern Title**: A catchy 2-4 word name that captures the stylistic essence using ONLY style descriptors
2. **Description**: 2-3 sentences explaining what stylistic elements, lighting, compositional approaches, aesthetic qualities, or photographic styles these photos share. Do not mention themes, subjects, or narrative content.
3. **Strength Assessment**: Rate this pattern as "strong", "moderate", or "weak" based on:
   - Strong: Very cohesive, clear and consistent stylistic elements
   - Moderate: Present but with some variation
   - Weak: Subtle connections, emerging stylistic pattern
4. **Representative Photos**: Select the 4 most representative photo IDs from this cluster

SELF-CHECK BEFORE YOU ANSWER:
- If your draft contains ANY subject/context words, rewrite to remove them.
- Ensure the title contains NO subject nouns and NO proper nouns.

Return ONLY valid JSON (no markdown, no commentary) in this exact format:
{
  "title": "Pattern Title",
  "description": "Clear description of the stylistic pattern shared by these photos",
  "strength": "strong|moderate|weak",
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]
}

Return only valid JSON. Do not include explanations, markdown, or extra text.`,
  userMessage: `Analyze the ${photoCount} photos shown above and identify the stylistic pattern they share.

${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting the 4 most representative photos.

Focus only on lighting, aesthetic, composition, type of shot, and style. Ignore narrative or thematic content.`,
})

export const PROMPT_PORTFOLIO_AESTHETIC_PATTERN = (photosList: string, photoCount: number) => ({
  systemPrompt: `You are analyzing an aesthetic pattern in a photography portfolio.

Your task is to identify and describe aesthetic qualities, visual aspects, or stylistic similarities shared by photos that have been clustered based on their visual embeddings.

Generate a concise analysis with:

1. **Pattern Title**: A catchy 2-4 word name that captures the essence (e.g., "Minimalist Compositions", "High Contrast Drama")
2. **Description**: 2-3 sentences explaining the aesthetic qualities, visual aspects, or stylistic similarities
3. **Strength Assessment**: Rate this pattern as "strong", "moderate", or "weak"

Return your response in JSON format:
{
  "title": "Pattern Title",
  "description": "Clear description of the pattern",
  "strength": "strong|moderate|weak"
}`,
  userMessage: `Below are ${photoCount} representative photos from a cluster that shares similar visual characteristics.

${photosList}

Note: These photos have been clustered based on their visual embeddings, indicating they share similar visual patterns or subjects.`,
})

// Tipo para patrones existentes en la fusión progresiva
interface ExistingPatternSummary {
  patternId: string
  title: string
  shortDescription: string // Descripción corta (2 frases) para no saturar el contexto
}

// ========================================
// PROGRESSIVE FUSION - GENERAL (STYLE-ONLY)
// ========================================
// Para análisis de ESTILO VISUAL únicamente (composición, iluminación, color, etc.)
// NO analiza temas, narrativa o contexto
export const PROMPT_PORTFOLIO_PROGRESSIVE_FUSION_GENERAL = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[]
) => {
  const existingPatternsText =
    existingPatterns.length > 0
      ? `
EXISTING STYLE PATTERNS ALREADY IDENTIFIED:
${existingPatterns.map((p, idx) => `${idx + 1}. [${p.patternId}] "${p.title}": ${p.shortDescription}`).join('\n')}
`
      : `
NO EXISTING PATTERNS YET (this is the first cluster being analyzed).
`

  return {
    systemPrompt: `You are analyzing a photography portfolio with PROGRESSIVE CLUSTER FUSION (GENERAL / STYLE-ONLY).

You will be provided with the ACTUAL IMAGES for the new cluster.

Your task is to decide whether the new cluster should:
1) MERGE with an existing pattern (same visual style)
2) CREATE NEW pattern (distinct visual style)

CRITICAL RULES (STYLE-ONLY):
- Analyze ONLY stylistic elements you can SEE: composition, geometry, lighting, color palette, depth of field, grain, motion blur, flash usage, framing, perspective, type of shot.
- DO NOT mention or infer subject matter, identity, culture, ethnicity, location, event, profession, story, or context.
- DO NOT use proper nouns (no place names, people names, group names, brands).
- DO NOT rely on filenames or IDs (they are only for indexing).

TITLE RULES (2-4 words, style-only):
- Use style descriptors + photographic terms (e.g., "Soft Backlight Portraits", "Hard Flash Street", "Muted Pastels", "High Contrast Silhouettes").
- Forbidden: subject labels (e.g., "Masai Life", "Wedding", "Street Vendors"), narrative framing, cultural references, locations.

DECISION CRITERIA FOR MERGE (style-only):
- The new cluster matches CLEARLY an existing pattern's visual look (lighting/composition/color/tone/shot-type).
- Merging strengthens stylistic coherence.
- In case of doubt, don't merge.

DECISION CRITERIA FOR NEW (style-only):
- The cluster's visual look is somehow distinct from all existing patterns.
- Merging would blur stylistic boundaries.

SELF-CHECK BEFORE YOU ANSWER:
- If your draft contains ANY subject/context words, rewrite to remove them.
- Ensure the title contains NO subject nouns and NO proper nouns.

Return ONLY valid JSON (no markdown, no commentary) in this exact format:
{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge", use the exact patternId from existing patterns
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2-4 catchy words, style-only)
  "shortDescription": "Brief 2-sentence summary",  // REQUIRED if decision is "new" (style-only, no subjects)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (2-3 sentences, style-only)
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]  // REQUIRED: Select the 4 most representative photo IDs from this cluster (use the IDs provided with each photo)
}

Return only valid JSON. Do not include explanations, markdown, or extra text.`,
    userMessage: `${existingPatternsText}

NEW CLUSTER TO ANALYZE (${photoCount} photos shown above):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

Analyze the images shown above and decide: should this cluster MERGE with an existing STYLE pattern, or create a NEW STYLE pattern? Remember: style-only (lighting/composition/aesthetic/shot-type).`,
  }
}

// ========================================
// PROGRESSIVE FUSION - THEMATIC (narrative/contextual/visual_accents)
// ========================================
// Para análisis temático, narrativo, contextual o de acentos visuales
// SÍ analiza temas, narrativa y contexto
export const PROMPT_PORTFOLIO_PROGRESSIVE_FUSION_THEMATIC = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[],
  reviewType: 'narrative' | 'contextual' | 'visual_accents'
) => {
  const reviewTypeDescriptions: Record<'narrative' | 'contextual' | 'visual_accents', string> = {
    narrative: 'narrative patterns, themes, or storytelling approaches',
    contextual: 'contextual similarities, situations, or settings',
    visual_accents: 'visual accents, lighting, composition, and stylistic elements',
  }

  const analysisType = reviewTypeDescriptions[reviewType]

  const existingPatternsText =
    existingPatterns.length > 0
      ? `
EXISTING PATTERNS ALREADY IDENTIFIED:
${existingPatterns.map((p, idx) => `${idx + 1}. [${p.patternId}] "${p.title}": ${p.shortDescription}`).join('\n')}
`
      : `
NO EXISTING PATTERNS YET (this is the first cluster being analyzed).
`

  return {
    systemPrompt: `You are analyzing patterns in a photography portfolio with PROGRESSIVE CLUSTER FUSION.

Your task is to analyze a new cluster of photos and decide whether it should:
1. **MERGE** with an existing pattern (if the photos fit conceptually within an already identified pattern)
2. **CREATE NEW** pattern (if the photos represent a distinct, new pattern)

ANALYSIS TYPE: ${analysisType}

DECISION CRITERIA FOR MERGE:
- The new cluster CLEARLY shares the same core theme/concept as an existing pattern
- The photos would naturally belong to the existing pattern's description
- Merging would strengthen the pattern, not dilute it
- In case of doubt, don't merge

DECISION CRITERIA FOR NEW:
- The cluster represents a somwhow distinct theme not covered by existing patterns
- Merging would create an overly broad or incoherent pattern
- The photos have unique characteristics that deserve their own category

Return your response in JSON format:
{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge", use the exact patternId from existing patterns
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2-4 catchy words)
  "shortDescription": "Brief 2-sentence summary",  // REQUIRED if decision is "new" (concise, for context)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (2-3 detailed sentences)
  "representativePhotoIds": ["id1", "id2", "id3", "id4"]  // REQUIRED: Select the 4 most representative photo IDs from this cluster (use the IDs provided with each photo)
}

Return only valid JSON. Do not include explanations, markdown, or extra text.`,
    userMessage: `${existingPatternsText}

NEW CLUSTER TO ANALYZE (${photoCount} representative photos):
${photosText}

Note: Each photo entry includes its ID. Use these IDs when selecting representative photos.

Analyze these photos and decide: should this cluster MERGE with an existing pattern, or create a NEW pattern?`,
  }
}

// ========================================
// WRAPPER - PROGRESSIVE FUSION
// ========================================
// Función wrapper que elige automáticamente entre GENERAL (style-only) y THEMATIC
export const PROMPT_PORTFOLIO_PROGRESSIVE_FUSION = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[],
  reviewType: 'narrative' | 'contextual' | 'visual_accents' | 'general'
) => {
  if (reviewType === 'general') {
    return PROMPT_PORTFOLIO_PROGRESSIVE_FUSION_GENERAL(photosText, photoCount, existingPatterns)
  }

  return PROMPT_PORTFOLIO_PROGRESSIVE_FUSION_THEMATIC(
    photosText,
    photoCount,
    existingPatterns,
    reviewType
  )
}
