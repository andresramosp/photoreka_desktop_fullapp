// ══════════════════════════════════════════════════════════════
// PHOTO SCHEMA — single source of truth for visual aspects and
// artistic scores across the entire backend.
//
// All services, controllers, prompts and embeddings derive their
// knowledge of valid keys and values from this file.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Prompt variants
// ─────────────────────────────────────────────────────────────

/** The two prompt variants used when generating LLM analysis prompts. */
export type PromptVariant = 'general' | 'style'

/**
 * Maps a UserProfile string to the appropriate prompt variant.
 * 'general' profile → 'general', everything else → 'style'.
 */
export function getPromptVariant(userProfile: string | null | undefined): PromptVariant {
  if (!userProfile || userProfile === 'general') return 'general'
  return 'style'
}

// ─────────────────────────────────────────────────────────────
// Visual Aspects
// ─────────────────────────────────────────────────────────────

export type VisualAspectSource = 'llm' | 'metadata'

export interface VisualAspectDef {
  key: string
  label: string
  /** Whether this aspect is produced by the vision LLM or by deterministic metadata analysis. */
  source: VisualAspectSource
  values: readonly string[]
}

export const VISUAL_ASPECTS_SCHEMA: VisualAspectDef[] = [
  // ── LLM-sourced aspects (evaluated by the vision model) ───────────────
  {
    key: 'focus',
    label: 'Focus',
    source: 'llm',
    values: ['blurry', 'nitid'],
  },
  {
    key: 'lighting_scheme',
    label: 'Lighting Scheme',
    source: 'llm',
    values: ['low key', 'high key', 'balanced'],
  },
  {
    key: 'stylistic',
    label: 'Stylistic',
    source: 'llm',
    values: ['long exposure', 'motion blur', 'silhouettes', 'bokeh', 'grain'],
  },
  {
    key: 'lighting',
    label: 'Lighting',
    source: 'llm',
    values: ['natural', 'artificial', 'backlit', 'frontlit', 'side lit'],
  },
  {
    key: 'depth_of_field',
    label: 'Depth of Field',
    source: 'llm',
    values: ['shallow', 'deep', 'medium'],
  },
  {
    key: 'framing',
    label: 'Framing',
    source: 'llm',
    values: ['close-up', 'medium shot', 'wide shot'],
  },
  {
    key: 'genre',
    label: 'Genre',
    source: 'llm',
    values: ['abstract', 'documentary', 'street', 'landscape', 'portrait'],
  },
  {
    key: 'perspective',
    label: 'Perspective',
    source: 'llm',
    values: ['normal', 'high angle', 'low angle'],
  },
  // ── Metadata-sourced aspects (computed deterministically) ────────────
  {
    key: 'orientation',
    label: 'Orientation',
    source: 'metadata',
    values: ['horizontal', 'vertical', 'square'],
  },
  {
    key: 'temperature',
    label: 'Temperature',
    source: 'metadata',
    values: ['warm', 'cold', 'neutral'],
  },
  {
    key: 'palette',
    label: 'Palette',
    source: 'metadata',
    values: ['color', 'black and white', 'monochrome'],
  },
] as const

// ── Derived helpers ──────────────────────────────────────────

export const VISUAL_ASPECT_KEYS: string[] = VISUAL_ASPECTS_SCHEMA.map((a) => a.key)

export const VISUAL_ASPECT_LLM_KEYS: string[] = VISUAL_ASPECTS_SCHEMA.filter(
  (a) => a.source === 'llm'
).map((a) => a.key)

/** Fast lookup: key → VisualAspectDef */
export const VISUAL_ASPECTS_MAP: Readonly<Record<string, VisualAspectDef>> =
  Object.fromEntries(VISUAL_ASPECTS_SCHEMA.map((a) => [a.key, a]))

// ─────────────────────────────────────────────────────────────
// Artistic Scores
// ─────────────────────────────────────────────────────────────

/**
 * Weights for each scoring criterion per genre preset.
 * Shared between backend (portfolio build) and frontend (3D Atlas sliders).
 * Genre keys correspond to getDefaultGenreFromProfile() values.
 */
export type GenreWeights = Record<string, number>

export interface ArtisticScoreCriterionDef {
  /** Internal key — used in the database, embeddings, and LLM prompts. */
  key: string
  /**
   * External alias exposed to the LLM tool API (search_advanced, scoreFilters).
   * When absent, the internal key is used as-is externally.
   */
  externalKey?: string
  label: string
  /** Per-variant description text passed to the LLM evaluator. */
  descriptions: Record<PromptVariant, string>
  /** Per-genre-preset weight. 0 = excluded, 1 = full weight. */
  weights: Record<string, number>
}

export interface ArtisticScoresGroupDef {
  key: string
  label: string
  description: string
  color: string
  criteria: ArtisticScoreCriterionDef[]
}

export const ARTISTIC_SCORES_SCHEMA: ArtisticScoresGroupDef[] = [
  {
    key: 'fundamentals',
    label: 'Fundamentals',
    description: 'Core evaluation criteria',
    color: '#3b82f6',
    criteria: [
      {
        key: 'aesthetic_quality',
        label: 'Aesthetic Quality',
        descriptions: {
          style:
            'Evaluate the beauty of the photo in a visual, aesthetic, and immediate sense, without narrative or thematic considerations. Use the example of pictorial beauty as a starting point. Is the light and color pleasing to the eye? It can be beautiful in both a naive and dramatic sense.',
          general:
            'Evaluate the immediate visual appeal of the photo. Is it pleasant or engaging to look at? Consider light, color, atmosphere, and overall visual comfort. Beauty can be simple, warm, nostalgic, or modest—not necessarily dramatic or refined.',
        },
        weights: {
          general: 1,
          street: 0.6,
          documentary: 0.4,
          abstract: 1,
        },
      },
      {
        key: 'composition',
        label: 'Composition',
        descriptions: {
          style:
            'Evaluate the compositional harmony, the balance of the elements in the photo, how they are distributed throughout the frame; do they form clear and pleasing patterns, does it make the photo legible, giving the eye a path to follow? Is there a clear eye-catcher that immediately draws the eye and orders the rest of the elements?',
          general:
            'Evaluate how the elements are arranged within the frame. Is the image readable? Does the eye know where to go? Even informal compositions can work if they feel balanced or intentional enough for a casual photo.',
        },
        weights: {
          general: 0.9,
          street: 0.6,
          documentary: 0.5,
          abstract: 0.9,
        },
      },
      {
        key: 'storytelling',
        label: 'Storytelling',
        descriptions: {
          style:
            'Are there characters in the photo whose interactions, gestures, and emotions invite us to imagine a story behind them, whether obvious or more symbolic? Evaluate it here as if it were a play. How much of a play is it?',
          general:
            'Does the image suggest a moment, memory, or situation? This can be very simple: a family interaction, a travel scene, a gesture, or a quiet everyday moment. Evaluate how much the photo invites the viewer to imagine what\'s happening.',
        },
        weights: {
          general: 0.5,
          street: 0.9,
          documentary: 0.8,
          abstract: 0.1,
        },
      },
      {
        key: 'strangeness',
        externalKey: 'originality',
        label: 'Originality',
        descriptions: {
          style:
            'Does the photo have a mysterious element that makes it special? Whether it\'s an everyday situation where something out of place raises an eyebrow, or a scene bathed in strange, dreamlike, surreal light, evaluate how unique or unusual the photo is.',
          general:
            'Does anything slightly unusual, curious, or unexpected stand out? This can be subtle: an odd coincidence, a contrast, a visual tension, or something mildly out of place—not necessarily surreal or artistic.',
        },
        weights: {
          general: 0.25,
          street: 0.9,
          documentary: 0.5,
          abstract: 0.6,
        },
      },
    ],
  },
  {
    key: 'bonus',
    label: 'Bonus',
    description: 'Additional evaluation aspects',
    color: '#f59e0b',
    criteria: [
      {
        key: 'message',
        label: 'Message',
        descriptions: {
          style:
            'Does the photo convey a powerful message, whether social/human (in documentary/street photography) or more figurative/symbolic (in conceptual photography)? Does it invite reflection on the human condition or the world?',
          general:
            'Does the photo convey any emotional, human, or symbolic idea, even in a modest way? This could be as simple as warmth, loneliness, joy, routine, travel curiosity, or family connection.',
        },
        weights: {
          general: 0,
          street: 0.5,
          documentary: 1,
          abstract: 0.7,
        },
      },
      {
        key: 'humor',
        label: 'Humor',
        descriptions: {
          style:
            'Does the photo have a humorous element, whether intentional or accidental? It can be a funny situation, an ironic twist, or a visual pun. Evaluate how effectively the humor is conveyed.',
          general:
            'Is there any humorous, ironic, or playful element, whether intentional or accidental? Casual photography often captures humor unintentionally—evaluate how readable and effective it is.',
        },
        weights: {
          general: 0,
          street: 0.8,
          documentary: 0,
          abstract: 0.4,
        },
      },
      {
        key: 'visual_games',
        label: 'Visual Games',
        descriptions: {
          style:
            'Does the photo feature visual games, illusions, or paradoxes that create a playful or intriguing effect? This could include reflections, curious juxtapositions, or other elements that challenge the viewer\'s perception, much like a magician would.',
          general:
            'Are there small visual tricks, coincidences, reflections, alignments, or juxtapositions that add interest? These don\'t need to be sophisticated—just visually engaging.',
        },
        weights: {
          general: 0,
          street: 0.8,
          documentary: 0,
          abstract: 0.7,
        },
      },
      {
        key: 'candidness',
        label: 'Candidness',
        descriptions: {
          style:
            'Evaluates the spontaneity of the moment captured, whether it feels natural and unposed, and if it aligns with the principles of street photography.',
          general:
            'Does the moment feel natural and unforced? Even in family or travel contexts, evaluate whether the image feels spontaneous rather than stiff or overly posed.',
        },
        weights: {
          general: 0,
          street: 1,
          documentary: 0.4,
          abstract: 0.1,
        },
      },
    ],
  },
]

// ── Derived helpers ──────────────────────────────────────────

/** All criteria defs in a flat array, fundamentals first. */
export const ARTISTIC_SCORE_CRITERIA: ArtisticScoreCriterionDef[] = ARTISTIC_SCORES_SCHEMA.flatMap(
  (g) => g.criteria
)

/** Internal keys (as stored in DB / embeddings / LLM prompts): ['aesthetic_quality', ..., 'strangeness', ...] */
export const ARTISTIC_SCORE_KEYS: string[] = ARTISTIC_SCORE_CRITERIA.map((c) => c.key)

/**
 * External keys as exposed to tool APIs and the portfolio build controller.
 * Substitutes externalKey when present (e.g. 'strangeness' → 'originality').
 */
export const ARTISTIC_SCORE_EXTERNAL_KEYS: string[] = ARTISTIC_SCORE_CRITERIA.map(
  (c) => c.externalKey ?? c.key
)

/**
 * Maps external key → internal key.
 * Only contains entries where they differ (e.g. { originality: 'strangeness' }).
 */
export const SCORE_EXTERNAL_TO_INTERNAL: Readonly<Record<string, string>> = Object.fromEntries(
  ARTISTIC_SCORE_CRITERIA.filter((c) => c.externalKey).map((c) => [c.externalKey!, c.key])
)

/**
 * Maps internal key → external key.
 * Only contains entries where they differ (e.g. { strangeness: 'originality' }).
 */
export const SCORE_INTERNAL_TO_EXTERNAL: Readonly<Record<string, string>> = Object.fromEntries(
  ARTISTIC_SCORE_CRITERIA.filter((c) => c.externalKey).map((c) => [c.key, c.externalKey!])
)

/** Fast lookup: internal key → ArtisticScoreCriterionDef */
export const ARTISTIC_SCORES_MAP: Readonly<Record<string, ArtisticScoreCriterionDef>> =
  Object.fromEntries(ARTISTIC_SCORE_CRITERIA.map((c) => [c.key, c]))

/**
 * Converts an external score field name to the internal storage key.
 * Returns the field unchanged if it has no alias.
 */
export function toInternalScoreKey(field: string): string {
  return SCORE_EXTERNAL_TO_INTERNAL[field] ?? field
}

/**
 * Converts an internal score key to the external alias (if any).
 * Returns the key unchanged if it has no alias.
 */
export function toExternalScoreKey(field: string): string {
  return SCORE_INTERNAL_TO_EXTERNAL[field] ?? field
}

/**
 * Returns the genre weights for the given genre preset key.
 * Falls back to 'general' if the genre is unknown.
 * Missing criteria default to weight 1.
 */
export function getGenreWeights(genre: string): GenreWeights {
  const weights: GenreWeights = {}
  for (const criterion of ARTISTIC_SCORE_CRITERIA) {
    weights[criterion.key] = criterion.weights[genre] ?? criterion.weights['general'] ?? 1
  }
  return weights
}

/**
 * All valid genre preset keys defined in the schema.
 */
export const GENRE_PRESET_KEYS: string[] = (() => {
  const keys = new Set<string>()
  for (const criterion of ARTISTIC_SCORE_CRITERIA) {
    for (const g of Object.keys(criterion.weights)) keys.add(g)
  }
  return [...keys]
})()

// ─────────────────────────────────────────────────────────────
// Style-preference LLM helpers (used by portfolio_build_service)
// ─────────────────────────────────────────────────────────────

export const STYLE_CRITERIA_DESCRIPTIONS: Array<{ key: string; label: string; desc: string }> = [
  {
    key: 'aesthetic_quality',
    label: 'Aesthetic quality',
    desc: 'overall visual beauty, pleasing look, polished finish',
  },
  {
    key: 'composition',
    label: 'Composition',
    desc: 'framing, balance, geometry, use of lines and shapes',
  },
  {
    key: 'storytelling',
    label: 'Storytelling',
    desc: 'narrative content, sense of moment or sequence, documentary value',
  },
  {
    key: 'originality',
    label: 'Originality',
    desc: 'unusual, unexpected, strange, surprising or surreal elements',
  },
  {
    key: 'message',
    label: 'Message',
    desc: 'social, political or conceptual meaning; clear intent',
  },
  { key: 'humor', label: 'Humor', desc: 'funny, ironic, playful, witty imagery' },
  {
    key: 'visual_games',
    label: 'Visual games',
    desc: 'optical illusions, juxtapositions, reflections, layering, wordplay with image',
  },
  {
    key: 'candidness',
    label: 'Candidness',
    desc: 'spontaneity, genuine/unposed moments, raw human presence',
  },
]
