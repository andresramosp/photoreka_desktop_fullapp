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

// Prompt para fusión progresiva de clusters
export const PROMPT_PORTFOLIO_PROGRESSIVE_FUSION = (
  photosText: string,
  photoCount: number,
  existingPatterns: ExistingPatternSummary[],
  reviewType: 'narrative' | 'contextual' | 'aesthetic' | 'general'
) => {
  const reviewTypeDescriptions: Record<string, string> = {
    narrative: 'narrative patterns, themes, or storytelling approaches',
    contextual: 'contextual similarities, situations, or settings',
    aesthetic: 'aesthetic qualities, visual aspects, or stylistic similarities',
    general: 'visual similarities, subjects, or compositional patterns',
  }

  const analysisType = reviewTypeDescriptions[reviewType] || reviewTypeDescriptions.general

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
- The new cluster shares the same core theme/concept as an existing pattern
- The photos would naturally belong to the existing pattern's description
- Merging would strengthen the pattern, not dilute it

DECISION CRITERIA FOR NEW:
- The cluster represents a clearly distinct theme not covered by existing patterns
- Merging would create an overly broad or incoherent pattern
- The photos have unique characteristics that deserve their own category

Return your response in JSON format:
{
  "decision": "merge" | "new",
  "mergeWithPatternId": "pattern_id_here",  // REQUIRED if decision is "merge", use the exact patternId from existing patterns
  "title": "Pattern Title",                  // REQUIRED if decision is "new" (2-4 catchy words)
  "shortDescription": "Brief 2-sentence summary",  // REQUIRED if decision is "new" (concise, for context)
  "description": "Full detailed description",      // REQUIRED if decision is "new" (2-3 detailed sentences)
  "strength": "strong|moderate|weak"               // REQUIRED if decision is "new"
}`,
    userMessage: `${existingPatternsText}

NEW CLUSTER TO ANALYZE (${photoCount} representative photos):
${photosText}

Analyze these photos and decide: should this cluster MERGE with an existing pattern, or create a NEW pattern?`,
  }
}
