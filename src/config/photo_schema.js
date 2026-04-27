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
    key: "perspective",
    label: "Perspective",
    source: "llm",
    values: ["normal", "high angle", "low angle"],
  },
  // ── Metadata-sourced ─────────────────────────────────────

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
  {
    key: "orientation",
    label: "Orientation",
    source: "metadata",
    values: ["horizontal", "vertical", "square"],
  },
  {
    key: "genre",
    label: "Genre",
    source: "llm",
    values: [
      "abstract",
      "documentary",
      "street",
      "landscape",
      "portrait",
      "advertising",
      "product",
      "fashion",
      "lifestyle",
      "food",
    ],
    valuesByVariant: {
      general: ["abstract", "documentary", "street", "landscape", "portrait"],
      style: ["abstract", "documentary", "street", "landscape", "portrait"],
      commercial: [
        "advertising",
        "product",
        "fashion",
        "portrait",
        "lifestyle",
        "food",
      ],
    },
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
 * Artistic score criterion shape:
 *   key:         internal DB key (e.g. 'strangeness')
 *   externalKey: optional alias exposed to backend tool APIs (e.g. 'originality')
 *   label:       display label, intrinsic to the variant the criterion belongs to
 *   weights:     per-genre-preset weight (0 = excluded, 1 = full)
 *
 * Each variant ('general'/'style' vs 'commercial') has its own criteria set —
 * mirrors `ARTISTIC_SCORES_BY_VARIANT` in api/config/photo_schema.ts.
 *
 * `general` and `style` share the SAME criteria set (they only differ in the
 * surrounding LLM prompt scaffolding, not in which criteria are evaluated).
 */

// ── Variant: general & style (shared criteria) ───────────────

const STYLE_FUNDAMENTALS = [
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
    // Internal key stays 'strangeness' (legacy DB column);
    // backend tool API exposes it as 'originality'.
    key: "strangeness",
    externalKey: "originality",
    label: "Originality",
    weights: { general: 0.25, street: 0.9, documentary: 0.5, abstract: 0.6 },
  },
];

const STYLE_BONUS = [
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
];

const STYLE_GROUPS = [
  {
    key: "fundamentals",
    label: "Fundamentals",
    description: "Core evaluation criteria",
    color: "#3b82f6",
    criteria: STYLE_FUNDAMENTALS,
  },
  {
    key: "bonus",
    label: "Bonus",
    description: "Additional evaluation aspects",
    color: "#f59e0b",
    criteria: STYLE_BONUS,
  },
];

// ── Variant: commercial ──────────────────────────────────────

const COMMERCIAL_FUNDAMENTALS = [
  {
    key: "aesthetic_quality",
    label: "Aesthetic Quality",
    weights: { commercial: 1, general: 1 },
  },
  {
    key: "composition",
    label: "Composition",
    weights: { commercial: 1, general: 0.9 },
  },
  {
    key: "storytelling",
    label: "Storytelling",
    weights: { commercial: 0.5, general: 0.5 },
  },
  {
    key: "commercial_intent",
    label: "Commercial Intent",
    weights: { commercial: 1, general: 0 },
  },
];

const COMMERCIAL_BONUS = [
  {
    key: "strangeness",
    externalKey: "originality",
    label: "Originality",
    weights: { commercial: 0.5, general: 0 },
  },
  {
    key: "humor",
    label: "Humor",
    weights: { commercial: 0.3, general: 0 },
  },
  {
    key: "subject_clarity",
    label: "Subject Clarity",
    weights: { commercial: 1, general: 0 },
  },
  {
    key: "candidness",
    label: "Candidness",
    weights: { commercial: 0.4, general: 0 },
  },
];

const COMMERCIAL_GROUPS = [
  {
    key: "fundamentals",
    label: "Fundamentals",
    description: "Core evaluation criteria",
    color: "#3b82f6",
    criteria: COMMERCIAL_FUNDAMENTALS,
  },
  {
    key: "bonus",
    label: "Bonus",
    description: "Additional evaluation aspects",
    color: "#f59e0b",
    criteria: COMMERCIAL_BONUS,
  },
];

// ── Per-variant artistic schema ──────────────────────────────

export const ARTISTIC_SCORES_BY_VARIANT = {
  general: STYLE_GROUPS,
  style: STYLE_GROUPS,
  commercial: COMMERCIAL_GROUPS,
};

/** Genre preset keys per variant (used by 3D Atlas sliders, portfolio build). */
export const GENRE_PRESET_KEYS_BY_VARIANT = {
  general: ["general", "street", "documentary", "abstract"],
  style: ["general", "street", "documentary", "abstract"],
  commercial: ["commercial", "general"],
};

// ── Derived helpers (variant-aware) ──────────────────────────

/**
 * Maps a UserProfile string to a prompt-variant key.
 * Mirrors `getPromptVariant` from the backend.
 */
export function getProfileVariant(profile) {
  if (!profile || profile === "general") return "general";
  if (profile === "commercial") return "commercial";
  return "style";
}

/** Returns the groups (fundamentals + bonus) for the given variant. */
export function getArtisticSchema(variant) {
  return ARTISTIC_SCORES_BY_VARIANT[variant] ?? STYLE_GROUPS;
}

/** Flat array of all criteria for the variant (fundamentals first). */
export function getArtisticCriteria(variant) {
  return getArtisticSchema(variant).flatMap((g) => g.criteria);
}

/** Internal storage keys for the variant. */
export function getArtisticInternalKeys(variant) {
  return getArtisticCriteria(variant).map((c) => c.key);
}

/** External keys (LLM tool API) for the variant. */
export function getArtisticExternalKeys(variant) {
  return getArtisticCriteria(variant).map((c) => c.externalKey ?? c.key);
}

/** Genre preset keys available under the given variant. */
export function getGenrePresetKeys(variant) {
  return (
    GENRE_PRESET_KEYS_BY_VARIANT[variant] ??
    GENRE_PRESET_KEYS_BY_VARIANT.general
  );
}

/**
 * Returns the genre-preset weights for the variant's criteria.
 * Falls back to the variant's first preset if the genre is unknown.
 * Missing criteria default to weight 1.
 */
export function getGenreWeights(genre, variant) {
  const presets = getGenrePresetKeys(variant);
  const fallback = presets[0];
  const resolved = presets.includes(genre) ? genre : fallback;
  const weights = {};
  for (const c of getArtisticCriteria(variant)) {
    weights[c.key] = c.weights[resolved] ?? c.weights[fallback] ?? 1;
  }
  return weights;
}

/**
 * Maps a UserProfile string to the default genre preset key used for weights.
 * Compound profiles (containing '|') fall back to the variant's default.
 */
export function getGenreFromProfile(profile) {
  const map = {
    general: "general",
    commercial: "commercial",
    "street-photography": "street",
    documentary: "documentary",
    artistic: "abstract",
  };
  if (!profile || profile.includes("|")) return "general";
  return map[profile] ?? "general";
}

/**
 * Detect the prompt variant from a stored `artistic_scores` object by
 * inspecting which native keys it carries. Mirrors backend
 * `detectVariantFromScores`.
 */
export function detectVariantFromScores(scores) {
  if (!scores || typeof scores !== "object") return "general";
  if ("commercial_intent" in scores || "subject_clarity" in scores) {
    return "commercial";
  }
  return "style";
}

/**
 * Returns the allowed values for a visual aspect under the given profile.
 * Falls back to the aspect's default `values` array if no override exists.
 */
export function getAspectValuesForProfile(aspect, profile) {
  const variant = getProfileVariant(profile);
  return aspect.valuesByVariant?.[variant] ?? aspect.values;
}

/**
 * Builds the visualAspectsOptions array consumed by the search UI tree-select.
 * Excludes aspects whose keys are listed in `hiddenKeys`.
 * If `profile` is provided, per-aspect value lists are filtered to that
 * profile's variant (e.g. commercial users see commercial genre values only).
 */
export function buildVisualAspectsOptions(hiddenKeys = [], profile = null) {
  return VISUAL_ASPECTS_SCHEMA.filter((a) => !hiddenKeys.includes(a.key))
    .map((aspect) => {
      const values = profile
        ? getAspectValuesForProfile(aspect, profile)
        : aspect.values;
      return {
        type: "group",
        label: aspect.label,
        key: aspect.key,
        children: values.map((v) => ({
          label: v.charAt(0).toUpperCase() + v.slice(1),
          value: v,
        })),
      };
    })
    .reverse(); // reverse to show metadata-sourced aspects last
}
