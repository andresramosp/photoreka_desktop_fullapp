// ══════════════════════════════════════════════════════════════
// PHOTO SCHEMA — frontend mirror of api/app/config/photo_schema.ts
//
// Keep in sync with the backend schema when adding/removing
// aspects, criteria, or values.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// Visual Aspects
// ─────────────────────────────────────────────────────────────

/**
 * All visual aspects with their valid values.
 * source: 'llm' = evaluated by the vision model
 * source: 'metadata' = computed deterministically from image metadata
 */
export const VISUAL_ASPECTS_SCHEMA = [
  // ── LLM-sourced ──────────────────────────────────────────
  {
    key: "focus",
    label: "Focus",
    source: "llm",
    values: ["blurry", "nitid"],
  },
  {
    key: "lighting_scheme",
    label: "Lighting Scheme",
    source: "llm",
    values: ["low key", "high key", "balanced"],
  },
  {
    key: "stylistic",
    label: "Stylistic",
    source: "llm",
    values: ["long exposure", "motion blur", "silhouettes", "bokeh", "grain"],
  },
  {
    key: "lighting",
    label: "Lighting",
    source: "llm",
    values: ["natural", "artificial", "backlit", "frontlit", "side lit"],
  },
  {
    key: "depth_of_field",
    label: "Depth of Field",
    source: "llm",
    values: ["shallow", "deep", "medium"],
  },
  {
    key: "framing",
    label: "Framing",
    source: "llm",
    values: ["close-up", "medium shot", "wide shot"],
  },
  {
    key: "genre",
    label: "Genre",
    source: "llm",
    values: ["abstract", "documentary", "street", "landscape", "portrait"],
  },
  {
    key: "perspective",
    label: "Perspective",
    source: "llm",
    values: ["normal", "high angle", "low angle"],
  },
  // ── Metadata-sourced ─────────────────────────────────────
  {
    key: "orientation",
    label: "Orientation",
    source: "metadata",
    values: ["horizontal", "vertical", "square"],
  },
  {
    key: "temperature",
    label: "Temperature",
    source: "metadata",
    values: ["warm", "cold", "neutral"],
  },
  {
    key: "palette",
    label: "Palette",
    source: "metadata",
    values: ["color", "black and white", "monochrome"],
  },
];

export const VISUAL_ASPECT_KEYS = VISUAL_ASPECTS_SCHEMA.map((a) => a.key);

/** Fast lookup: key → aspect def */
export const VISUAL_ASPECTS_MAP = Object.fromEntries(
  VISUAL_ASPECTS_SCHEMA.map((a) => [a.key, a]),
);

// ─────────────────────────────────────────────────────────────
// Artistic Scores
// ─────────────────────────────────────────────────────────────

/**
 * Artistic score groups and criteria.
 * key: internal DB key (e.g. 'strangeness')
 * externalKey: alias exposed to tool APIs (e.g. 'originality') — omit when same as key
 * weights: per-genre-preset weight (0 = excluded, 1 = full)
 */
export const ARTISTIC_SCORES_SCHEMA = [
  {
    key: "fundamentals",
    label: "Fundamentals",
    description: "Core evaluation criteria",
    color: "#3b82f6",
    criteria: [
      {
        key: "aesthetic_quality",
        label: "Aesthetic Quality",
        weights: { general: 1, street: 0.6, documentary: 0.4, abstract: 1 },
      },
      {
        key: "composition",
        label: "Composition",
        weights: { general: 0.9, street: 0.6, documentary: 0.5, abstract: 0.9 },
      },
      {
        key: "storytelling",
        label: "Storytelling",
        weights: { general: 0.5, street: 0.9, documentary: 0.8, abstract: 0.1 },
      },
      {
        key: "strangeness",
        externalKey: "originality",
        label: "Originality",
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
    key: "bonus",
    label: "Bonus",
    description: "Additional evaluation aspects",
    color: "#f59e0b",
    criteria: [
      {
        key: "message",
        label: "Message",
        weights: { general: 0, street: 0.5, documentary: 1, abstract: 0.7 },
      },
      {
        key: "humor",
        label: "Humor",
        weights: { general: 0, street: 0.8, documentary: 0, abstract: 0.4 },
      },
      {
        key: "visual_games",
        label: "Visual Games",
        weights: { general: 0, street: 0.8, documentary: 0, abstract: 0.7 },
      },
      {
        key: "candidness",
        label: "Candidness",
        weights: { general: 0, street: 1, documentary: 0.4, abstract: 0.1 },
      },
    ],
  },
];

// ── Derived helpers ──────────────────────────────────────────

/** Flat array of all criteria defs, fundamentals first. */
export const ARTISTIC_SCORE_CRITERIA = ARTISTIC_SCORES_SCHEMA.flatMap(
  (g) => g.criteria,
);

/** Internal keys (as stored in DB). */
export const ARTISTIC_SCORE_KEYS = ARTISTIC_SCORE_CRITERIA.map((c) => c.key);

/**
 * Returns the genre-preset weights for all criteria as a plain object.
 * Falls back to 'general' if the genre is unknown. Missing criteria default to 1.
 */
export function getGenreWeights(genre) {
  const weights = {};
  for (const criterion of ARTISTIC_SCORE_CRITERIA) {
    weights[criterion.key] =
      criterion.weights[genre] ?? criterion.weights["general"] ?? 1;
  }
  return weights;
}

/**
 * Maps a UserProfile string to the genre preset key used for weights.
 * Compound profiles (containing '|') fall back to 'general'.
 */
export function getGenreFromProfile(profile) {
  const map = {
    general: "general",
    "street-photography": "street",
    documentary: "documentary",
    artistic: "abstract",
  };
  if (!profile || profile.includes("|")) return "general";
  return map[profile] ?? "general";
}

/**
 * Builds the visualAspectsOptions array consumed by the search UI tree-select.
 * Excludes aspects whose keys are listed in `hiddenKeys`.
 */
export function buildVisualAspectsOptions(hiddenKeys = []) {
  return VISUAL_ASPECTS_SCHEMA.filter((a) => !hiddenKeys.includes(a.key))
    .map((aspect) => ({
      type: "group",
      label: aspect.label,
      key: aspect.key,
      children: aspect.values.map((v) => ({
        label: v.charAt(0).toUpperCase() + v.slice(1),
        value: v,
      })),
    }))
    .reverse(); // reverse to show metadata-sourced aspects last
}
