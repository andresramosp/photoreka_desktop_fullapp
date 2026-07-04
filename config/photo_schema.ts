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

/** The prompt variants used when generating LLM analysis prompts. */
export type PromptVariant = 'general' | 'style' | 'commercial'

/**
 * Maps a UserProfile string to the appropriate prompt variant.
 * - 'general' (or null/empty)        → 'general'
 * - 'commercial'                     → 'commercial'
 * - any style profile (single/dual)  → 'style'
 */
export function getPromptVariant(userProfile: string | null | undefined): PromptVariant {
  if (!userProfile || userProfile === 'general') return 'general'
  if (userProfile === 'commercial') return 'commercial'
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
  /** Optional prompt-only guidance for this aspect. */
  promptGuidance?: string
  /**
   * Optional per-variant overrides for the list of allowed values.
   * Used e.g. for the `genre` aspect where commercial photographers should
   * pick from a different set of categories than street/documentary/artistic ones.
   * If a variant is missing, the default `values` array is used.
   */
  valuesByVariant?: Partial<Record<PromptVariant, readonly string[]>>
}

export const VISUAL_ASPECTS_SCHEMA: VisualAspectDef[] = [
  // ── LLM-sourced aspects (evaluated by the vision model) ───────────────
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
    promptGuidance:
      "Use these only when the treatment is clear and visually marked. 'motion blur' requires obvious intentional movement blur; 'bokeh' requires prominent out-of-focus background/highlights, not a barely shallow background.",
  },
  {
    key: 'lighting',
    label: 'Lighting',
    source: 'llm',
    values: ['natural', 'artificial', 'backlit', 'frontlit', 'side lit'],
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
    values: [
      'abstract',
      'documentary',
      'street',
      'landscape',
      'portrait',
      'advertising',
      'product',
      'fashion',
      'lifestyle',
      'food',
      'wedding',
      'architecture',
    ],
    valuesByVariant: {
      general: ['abstract', 'documentary', 'street', 'landscape', 'portrait', 'product', 'lifestyle'],
      style: ['abstract', 'documentary', 'street', 'landscape', 'portrait'],
      commercial: [
        'advertising',
        'product',
        'fashion',
        'portrait',
        'lifestyle',
        'food',
        'wedding',
        'architecture',
      ],
    },
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
    key: 'depth_of_field',
    label: 'Depth of Field',
    source: 'metadata',
    values: ['shallow', 'deep', 'medium'],
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
export const VISUAL_ASPECTS_MAP: Readonly<Record<string, VisualAspectDef>> = Object.fromEntries(
  VISUAL_ASPECTS_SCHEMA.map((a) => [a.key, a])
)

/**
 * Returns the allowed values for a visual aspect under a given prompt variant.
 * Falls back to the aspect's default `values` if no per-variant override exists.
 */
export function getAspectValuesForVariant(
  aspect: VisualAspectDef,
  variant: PromptVariant
): readonly string[] {
  return aspect.valuesByVariant?.[variant] ?? aspect.values
}

// ─────────────────────────────────────────────────────────────
// Artistic Scores
// ─────────────────────────────────────────────────────────────

/**
 * Weights for each scoring criterion per genre preset.
 * Shared between backend (portfolio build) and frontend (3D Atlas sliders).
 * Genre keys correspond to getGenrePresetKeys(variant) values.
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
  /** Display label, intrinsic to the variant the criterion belongs to. */
  label: string
  /**
   * Per-variant LLM description text. Each criterion lives under one or more
   * prompt variants (style/general share their criteria set; commercial has
   * its own). The map only contains entries for variants where the criterion
   * is active.
   */
  descriptions: Partial<Record<PromptVariant, string>>
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

// ── Variant: general & style (shared criteria) ───────────────
//
// The `general` and `style` variants share the SAME criteria set; they only
// differ in the surrounding LLM prompt scaffolding (tone/expectations). Each
// criterion carries description text for both variants.

const STYLE_FUNDAMENTALS: ArtisticScoreCriterionDef[] = [
  {
    key: 'aesthetic_quality',
    label: 'Aesthetic Quality',
    descriptions: {
      style:
        'Evaluate the beauty of the photo in a visual, aesthetic, and immediate sense, without narrative or thematic considerations. Use the example of pictorial beauty as a starting point. Is the light and color pleasing to the eye? It can be beautiful in both a naive and dramatic sense.',
      general:
        'Evaluate the immediate visual appeal of the photo. Is it pleasant or engaging to look at? Consider light, color, atmosphere, and overall visual comfort. Beauty can be simple, warm, nostalgic, or modest—not necessarily dramatic or refined.',
    },
    weights: { general: 1, street: 0.6, documentary: 0.4, abstract: 1 },
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
    weights: { general: 0.9, street: 0.6, documentary: 0.5, abstract: 0.9 },
  },
  {
    key: 'storytelling',
    label: 'Storytelling',
    descriptions: {
      style:
        'Are there characters in the photo whose interactions, gestures, and emotions invite us to imagine a story behind them, whether obvious or more symbolic? Evaluate it here as if it were a play. How much of a play is it?',
      general:
        "Does the image suggest a moment, memory, or situation? This can be very simple: a family interaction, a travel scene, a gesture, or a quiet everyday moment. Evaluate how much the photo invites the viewer to imagine what's happening.",
    },
    weights: { general: 0.5, street: 0.9, documentary: 0.8, abstract: 0.1 },
  },
  {
    key: 'strangeness',
    externalKey: 'originality',
    label: 'Originality',
    descriptions: {
      style:
        "Does the photo have a mysterious element that makes it special? Whether it's an everyday situation where something out of place raises an eyebrow, or a scene bathed in strange, dreamlike, surreal light, evaluate how unique or unusual the photo is.",
      general:
        'Does anything slightly unusual, curious, or unexpected stand out? This can be subtle: an odd coincidence, a contrast, a visual tension, or something mildly out of place—not necessarily surreal or artistic.',
    },
    weights: { general: 0.25, street: 0.9, documentary: 0.5, abstract: 0.6 },
  },
]

const STYLE_BONUS: ArtisticScoreCriterionDef[] = [
  {
    key: 'message',
    label: 'Message',
    descriptions: {
      style:
        'Does the photo convey a powerful message, whether social/human (in documentary/street photography) or more figurative/symbolic (in conceptual photography)? Does it invite reflection on the human condition or the world?',
      general:
        'Does the photo convey any emotional, human, or symbolic idea, even in a modest way? This could be as simple as warmth, loneliness, joy, routine, travel curiosity, or family connection.',
    },
    weights: { general: 0, street: 0.5, documentary: 1, abstract: 0.7 },
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
    weights: { general: 0, street: 0.8, documentary: 0, abstract: 0.4 },
  },
  // {
  //   key: 'visual_games',
  //   label: 'Visual Games',
  //   descriptions: {
  //     style:
  //       "Does the photo feature visual games, illusions, or paradoxes that create a playful or intriguing effect? This could include reflections, curious juxtapositions, or other elements that challenge the viewer's perception, much like a magician would.",
  //     general:
  //       "Are there small visual tricks, coincidences, reflections, alignments, or juxtapositions that add interest? These don't need to be sophisticated—just visually engaging.",
  //   },
  //   weights: { general: 0, street: 0.8, documentary: 0, abstract: 0.7 },
  // },
  {
    key: 'visual_games',
    label: 'Visual Games',
    descriptions: {
      style:
        "Does the photo feature visual games, illusions, surprising alignments, or perceptual tricks that create a playful or intriguing effect? This may involve reflections, unexpected spatial relationships, visual framing, clever compositions, or other elements that challenge or reward the viewer's perception.",
      general:
        "Are there visual coincidences, alignments, framing interactions, reflections, juxtapositions, or other playful relationships between elements that add interest? They don't need to be sophisticated—just visually engaging.",
    },
    weights: { general: 0, street: 0.8, documentary: 0, abstract: 0.7 },
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
    weights: { general: 0, street: 1, documentary: 0.4, abstract: 0.1 },
  },
]

const STYLE_GROUPS: ArtisticScoresGroupDef[] = [
  {
    key: 'fundamentals',
    label: 'Fundamentals',
    description: 'Core evaluation criteria',
    color: '#3b82f6',
    criteria: STYLE_FUNDAMENTALS,
  },
  {
    key: 'bonus',
    label: 'Bonus',
    description: 'Additional evaluation aspects',
    color: '#f59e0b',
    criteria: STYLE_BONUS,
  },
]

// ── Variant: commercial ──────────────────────────────────────
//
// Commercial uses its own criteria set with **dedicated keys**:
//   - `commercial_intent` (not `message`)
//   - `subject_clarity`   (not `visual_games`)
// These keys are stored as-is in `descriptions.artistic_scores` for commercial
// users. Style/general users never see them; commercial users never see
// `message`/`visual_games`.

const COMMERCIAL_FUNDAMENTALS: ArtisticScoreCriterionDef[] = [
  {
    key: 'aesthetic_quality',
    label: 'Aesthetic Quality',
    descriptions: {
      commercial:
        'Evaluate the visual polish and aesthetic appeal of the image as a commercial asset. Is the lighting clean and controlled? Are colors attractive and well balanced? Does it look professional, on-brand, and visually pleasing for advertising/stock/fashion/editorial use?',
    },
    weights: { commercial: 1 },
  },
  {
    key: 'composition',
    label: 'Composition',
    descriptions: {
      commercial:
        'Evaluate the compositional craft from a commercial standpoint: framing, balance, negative space and the way elements guide the eye toward the subject/product. Does it leave room for copy/logos when needed? Does it feel intentional and tightly designed?',
    },
    weights: { commercial: 1 },
  },
  {
    key: 'storytelling',
    label: 'Storytelling',
    descriptions: {
      commercial:
        'Does the image evoke a relatable lifestyle, mood, or aspirational situation that a brand could leverage? In product/still photography, evaluate whether the staging tells a clear use-case or context. If there are no people, judge how strongly the scene suggests a usage moment or feeling.',
    },
    weights: { commercial: 0.5 },
  },
  {
    key: 'commercial_intent',
    label: 'Commercial Intent',
    descriptions: {
      commercial:
        'How strong and clear is the commercial intent of the image? Does it communicate a benefit, desire, lifestyle promise or brand value with impact? Evaluate the strength of the message a viewer would extract about the product/service/lifestyle being shown.',
    },
    weights: { commercial: 1 },
  },
]

const COMMERCIAL_BONUS: ArtisticScoreCriterionDef[] = [
  {
    key: 'strangeness',
    externalKey: 'originality',
    label: 'Originality',
    descriptions: {
      commercial:
        'Does the image stand out from generic stock/advertising imagery? Evaluate its originality of concept, staging, color treatment or angle—how memorable and differentiated it feels compared to the visual cliches of its category.',
    },
    weights: { commercial: 0.5 },
  },
  {
    key: 'humor',
    label: 'Humor',
    descriptions: {
      commercial:
        'Does the image use humor, playfulness or wit in a way that would make it more memorable as commercial content? Light irony, charming gestures or a fun twist on a product/scene all count. If the image is intentionally serious or aspirational, score this low without penalising the photo.',
    },
    weights: { commercial: 0.3 },
  },
  {
    key: 'subject_clarity',
    label: 'Subject Clarity',
    descriptions: {
      commercial:
        'How clearly and prominently is the main subject (product, person, brand element) presented? Evaluate readability of the hero element: separation from the background, focus, scale and the absence of distracting clutter. A clean, unambiguous, easy-to-read subject scores high.',
    },
    weights: { commercial: 1 },
  },
  {
    key: 'candidness',
    label: 'Candidness',
    descriptions: {
      commercial:
        'Does the image feel natural and authentic rather than stiffly staged? In lifestyle/editorial commercial work this can be a strong asset; in classic studio/product shots it may be irrelevant—score low without penalising the photo when not applicable.',
    },
    weights: { commercial: 0.4 },
  },
]

const COMMERCIAL_GROUPS: ArtisticScoresGroupDef[] = [
  {
    key: 'fundamentals',
    label: 'Fundamentals',
    description: 'Core evaluation criteria',
    color: '#3b82f6',
    criteria: COMMERCIAL_FUNDAMENTALS,
  },
  {
    key: 'bonus',
    label: 'Bonus',
    description: 'Additional evaluation aspects',
    color: '#f59e0b',
    criteria: COMMERCIAL_BONUS,
  },
]

// ── Per-variant artistic schema ──────────────────────────────

export const ARTISTIC_SCORES_BY_VARIANT: Readonly<Record<PromptVariant, ArtisticScoresGroupDef[]>> =
  {
    general: STYLE_GROUPS,
    style: STYLE_GROUPS,
    commercial: COMMERCIAL_GROUPS,
  }

/** Genre preset keys per variant (used by 3D Atlas sliders, portfolio build). */
export const GENRE_PRESET_KEYS_BY_VARIANT: Readonly<Record<PromptVariant, string[]>> = {
  general: ['general', 'street', 'documentary', 'abstract'],
  style: ['general', 'street', 'documentary', 'abstract'],
  commercial: ['commercial'],
}

// ── Variant-aware helpers ────────────────────────────────────

/** Returns the groups (fundamentals + bonus) for the given variant. */
export function getArtisticSchema(variant: PromptVariant): ArtisticScoresGroupDef[] {
  return ARTISTIC_SCORES_BY_VARIANT[variant] ?? STYLE_GROUPS
}

/** Flat array of all criteria for the variant (fundamentals first). */
export function getArtisticCriteria(variant: PromptVariant): ArtisticScoreCriterionDef[] {
  return getArtisticSchema(variant).flatMap((g) => g.criteria)
}

/** Internal storage keys (DB / embeddings / LLM prompts) for the variant. */
export function getArtisticInternalKeys(variant: PromptVariant): string[] {
  return getArtisticCriteria(variant).map((c) => c.key)
}

/** External keys (LLM tool API / portfolio config) for the variant. */
export function getArtisticExternalKeys(variant: PromptVariant): string[] {
  return getArtisticCriteria(variant).map((c) => c.externalKey ?? c.key)
}

/** Fast lookup: internal key → criterion def, scoped to the variant. */
export function getArtisticScoresMap(
  variant: PromptVariant
): Readonly<Record<string, ArtisticScoreCriterionDef>> {
  return Object.fromEntries(getArtisticCriteria(variant).map((c) => [c.key, c]))
}

/** Maps external key → internal key for the variant. */
export function getScoreExternalToInternal(
  variant: PromptVariant
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    getArtisticCriteria(variant)
      .filter((c) => c.externalKey)
      .map((c) => [c.externalKey!, c.key])
  )
}

/** Maps internal key → external key for the variant. */
export function getScoreInternalToExternal(
  variant: PromptVariant
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    getArtisticCriteria(variant)
      .filter((c) => c.externalKey)
      .map((c) => [c.key, c.externalKey!])
  )
}

/** Returns the genre preset keys available under the given variant. */
export function getGenrePresetKeys(variant: PromptVariant): string[] {
  return GENRE_PRESET_KEYS_BY_VARIANT[variant] ?? GENRE_PRESET_KEYS_BY_VARIANT.general
}

/**
 * Converts an external score field name to the internal storage key for the
 * variant. Returns the field unchanged if it has no alias under that variant.
 */
export function toInternalScoreKey(field: string, variant: PromptVariant): string {
  return getScoreExternalToInternal(variant)[field] ?? field
}

/**
 * Converts an internal score key to the external alias for the variant.
 * Returns the key unchanged if it has no alias under that variant.
 */
export function toExternalScoreKey(field: string, variant: PromptVariant): string {
  return getScoreInternalToExternal(variant)[field] ?? field
}

/**
 * Returns the genre-preset weights for the variant's criteria.
 * Falls back to the variant's first preset if the genre is unknown.
 * Missing criteria default to weight 1.
 */
export function getGenreWeights(genre: string, variant: PromptVariant): GenreWeights {
  const presets = getGenrePresetKeys(variant)
  const fallback = presets[0]
  const resolved = presets.includes(genre) ? genre : fallback
  const weights: GenreWeights = {}
  for (const c of getArtisticCriteria(variant)) {
    weights[c.key] = c.weights[resolved] ?? c.weights[fallback] ?? 1
  }
  return weights
}

/**
 * Detect the prompt variant from a stored `artistic_scores` object by
 * inspecting which native keys it carries. Mirrors frontend
 * `detectVariantFromScores`.
 */
export function detectVariantFromScores(
  scores: Record<string, any> | null | undefined
): PromptVariant {
  if (!scores || typeof scores !== 'object') return 'general'
  if ('commercial_intent' in scores || 'subject_clarity' in scores) return 'commercial'
  return 'style'
}

// ── Cross-variant unions (tool API / config validation) ──────

/**
 * Union of every external key across all variants — used by the agent tool
 * API which must accept any user's profile keys (e.g. `originality` is shared,
 * `commercial_intent` is commercial-only). For variant-specific behaviour
 * (storage layout, embeddings, prompts) use `getArtisticExternalKeys(variant)`
 * instead.
 */
export const ALL_ARTISTIC_SCORE_EXTERNAL_KEYS: string[] = (() => {
  const set = new Set<string>()
  for (const v of ['style', 'commercial'] as const) {
    for (const k of getArtisticExternalKeys(v)) set.add(k)
  }
  return [...set]
})()

/** Union of every internal storage key across all variants. */
export const ALL_ARTISTIC_SCORE_INTERNAL_KEYS: string[] = (() => {
  const set = new Set<string>()
  for (const v of ['style', 'commercial'] as const) {
    for (const k of getArtisticInternalKeys(v)) set.add(k)
  }
  return [...set]
})()

/**
 * Variant-agnostic external→internal alias resolution. Use only when the
 * variant context is unknown (e.g. agent-tool inputs that may originate from
 * any user profile). Returns the field unchanged if it isn't aliased under
 * any variant. Aliases that conflict across variants would be ambiguous —
 * none currently do.
 */
export function resolveInternalScoreKeyAnyVariant(field: string): string {
  for (const v of ['style', 'commercial'] as const) {
    const mapped = getScoreExternalToInternal(v)[field]
    if (mapped) return mapped
  }
  return field
}

// ─────────────────────────────────────────────────────────────
// Style-preference LLM helpers (used by portfolio_build_service)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a compact { key, label, desc } list for the variant's criteria,
 * built from the schema. Used by the LLM style-preferences parser to
 * advertise the available criteria, and by the portfolio build pipeline.
 *
 * `key` is the EXTERNAL key (so the parser yields `originality` etc., which
 * matches what the frontend / tool API expose).
 */
export function getStyleCriteriaDescriptionsForVariant(
  variant: PromptVariant
): Array<{ key: string; label: string; desc: string }> {
  return getArtisticCriteria(variant).map((c) => ({
    key: c.externalKey ?? c.key,
    label: c.label,
    desc: c.descriptions[variant] ?? '',
  }))
}
