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
