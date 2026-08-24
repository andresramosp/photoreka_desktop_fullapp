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
    promptGuidance:
      "Use these only when the treatment is clear and visually marked. 'motion blur' requires obvious intentional movement blur; 'bokeh' requires prominent out-of-focus background/highlights, not a barely shallow background.",
  },
  {
    key: "lighting",
    label: "Lighting",
    source: "llm",
    values: ["natural", "artificial", "backlit", "frontlit", "side lit"],
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
    key: "depth_of_field",
    label: "Depth of Field",
    source: "metadata",
    values: ["shallow", "deep", "medium"],
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
      "wedding",
      "architecture",
    ],
    valuesByVariant: {
      general: [
        "abstract",
        "documentary",
        "street",
        "landscape",
        "portrait",
        "product",
        "lifestyle",
      ],
      style: ["abstract", "documentary", "street", "landscape", "portrait"],
      commercial: [
        "advertising",
        "product",
        "fashion",
        "portrait",
        "lifestyle",
        "food",
        "wedding",
        "architecture",
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
 *   description: the textbook definition of the criterion, for the user
 *                (tooltips). Two sentences in the third person: what the
 *                concept is, then what it depends on. Not literary prose, and
 *                never addressed to the reader ("what that does to your eye");
 *                not the backend's LLM `descriptions` either, which say where
 *                to set the bar — that is how the model is calibrated, not
 *                what the criterion is
 *   descriptionsByVariant: optional per-variant wording, same idea as
 *                `valuesByVariant` above. Only for criteria whose MEANING
 *                changes with the practice — `candidness` is absence of posing
 *                to a street photographer and plain ease to everyone else.
 *                Most criteria carry no override: what the backend varies
 *                between general and style is the bar, and the bar is the
 *                model's business
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
    label: "Aesthetic",
    description:
      "The visual beauty of the image, independent of its subject or its meaning. It rests on the quality of the light, the color and the atmosphere.",
    weights: { general: 1, street: 0.6, documentary: 0.4, abstract: 1 },
  },
  {
    key: "composition",
    label: "Composition",
    description:
      "The arrangement of the elements within the frame. A good composition balances the image and guides attention toward its main subject.",
    weights: { general: 0.9, street: 0.6, documentary: 0.5, abstract: 0.9 },
  },
  {
    key: "storytelling",
    label: "Storytelling",
    description:
      "The capacity of the image to tell a story. It depends on the subjects, their gestures and the context that surrounds them.",
    weights: { general: 0.5, street: 0.9, documentary: 0.8, abstract: 0.1 },
  },
  {
    // Internal key stays 'strangeness' (legacy DB column);
    // backend tool API exposes it as 'originality'.
    key: "strangeness",
    externalKey: "originality",
    label: "Originality",
    description:
      "The degree to which the image departs from the conventional treatment of its subject. Original photographs are unusual, unexpected or memorable.",
    weights: { general: 0.25, street: 0.9, documentary: 0.5, abstract: 0.6 },
  },
];

const STYLE_BONUS = [
  {
    key: "message",
    label: "Message",
    description:
      "The idea the image conveys beyond its literal content, whether social, human or symbolic. It is what remains once the scene has been read.",
    weights: { general: 0, street: 0.5, documentary: 1, abstract: 0.7 },
  },
  {
    key: "humor",
    label: "Humor",
    description:
      "The comic content of the image, intentional or accidental. It may come from a situation, an irony or a visual pun.",
    weights: { general: 0, street: 0.5, documentary: 0, abstract: 0.4 },
  },
  {
    key: "visual_games",
    label: "Visual Games",
    description:
      "The visual play created by the relationship between elements in the frame: reflections, alignments, juxtapositions or illusions.",
    weights: { general: 0, street: 0.8, documentary: 0, abstract: 0.7 },
  },
  {
    key: "candidness",
    label: "Spontaneity",
    description:
      "The naturalness of the moment captured, as opposed to a posed or arranged scene. Candid images show people behaving as they normally would.",
    descriptionsByVariant: {
      style:
        "The spontaneity of the moment captured, a founding principle of street and documentary photography. The scene unfolds on its own, without the intervention of the photographer.",
    },
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
    label: "Aesthetic",
    description:
      "The visual polish of the image as a commercial piece. It depends on controlled lighting, balanced color and a professional finish.",
    weights: { commercial: 1, general: 1 },
  },
  {
    key: "composition",
    label: "Composition",
    description:
      "The arrangement of the elements around the product or the subject. Commercial composition also accounts for the space reserved for copy and logos.",
    weights: { commercial: 1, general: 0.9 },
  },
  {
    key: "storytelling",
    label: "Storytelling",
    description:
      "The situation or lifestyle the image suggests for a brand to use. It works even without people, when the staging implies a context of use.",
    weights: { commercial: 0.5, general: 0.5 },
  },
  {
    key: "commercial_intent",
    label: "Commercial Intent",
    description:
      "The strength with which the image communicates a benefit, a desire or a brand promise. It measures the persuasive charge of the photograph.",
    weights: { commercial: 1, general: 0 },
  },
];

const COMMERCIAL_BONUS = [
  {
    key: "strangeness",
    externalKey: "originality",
    label: "Originality",
    description:
      "The degree to which the image departs from the visual cliches of its category. Original commercial images differ in concept, staging, color or angle.",
    weights: { commercial: 0.5, general: 0 },
  },
  {
    key: "humor",
    label: "Humor",
    description:
      "The comic or playful content of the image, and what it adds to its memorability. Wit is a common resource in advertising photography.",
    weights: { commercial: 0.3, general: 0 },
  },
  {
    key: "subject_clarity",
    label: "Subject Clarity",
    description:
      "The readability of the main subject: product, person or brand element. It depends on focus, scale and separation from the background.",
    weights: { commercial: 1, general: 0 },
  },
  {
    key: "candidness",
    label: "Spontaneity",
    description:
      "The naturalness of the scene, as opposed to a visibly staged one. It is valued in lifestyle and editorial work more than in studio photography.",
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

// ── Per-profile label overrides ──────────────────────────────
//
// The schema `label` is the neutral word for a criterion. A tradition that has
// its OWN word for the same thing overrides it here, keyed by profile token:
// "candidness" is street-photography vocabulary, while every other profile
// reads that same criterion as spontaneity.
//
// Display only. The internal key (`candidness`) stays untouched in the DB,
// prompts, embeddings and tool API — the same split as `strangeness`, which
// has always displayed as "Originality".
const CRITERION_LABEL_OVERRIDES = {
  candidness: { "street-photography": "Candidness" },
};

/** Profile tokens, lowercased: `street-photography|artistic` yields both. */
function profileTokens(profile) {
  return String(profile ?? "")
    .split("|")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The overriding label for a criterion key under `profile`, or null when the
 * profile has no word of its own for it.
 *
 * A dual profile matches if ANY of its tokens does: someone shooting
 * street|artistic is still a street photographer, and the vocabulary they
 * already use should not disappear because they also shoot artistic work.
 */
export function getCriterionLabelOverride(key, profile) {
  const overrides = CRITERION_LABEL_OVERRIDES[key];
  if (!overrides) return null;
  for (const token of profileTokens(profile)) {
    if (overrides[token]) return overrides[token];
  }
  return null;
}

/** Display label for a criterion under `profile`; falls back to the schema label. */
export function getCriterionLabel(criterion, profile) {
  return getCriterionLabelOverride(criterion.key, profile) ?? criterion.label;
}

/**
 * The variant's groups with every label already resolved for `profile`.
 * Use this instead of `getArtisticSchema` anywhere the labels reach the screen.
 */
export function getArtisticSchemaForProfile(profile) {
  return getArtisticSchema(getProfileVariant(profile)).map((group) => ({
    ...group,
    criteria: group.criteria.map((criterion) => ({
      ...criterion,
      label: getCriterionLabel(criterion, profile),
    })),
  }));
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
 * The user-facing explanation of a criterion under the given variant.
 * Falls back to the criterion's base `description` when the variant reads it
 * the same way as everyone else.
 */
export function getCriterionDescriptionForVariant(criterion, variant) {
  if (!criterion) return "";
  return (
    criterion.descriptionsByVariant?.[variant] ?? criterion.description ?? ""
  );
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
