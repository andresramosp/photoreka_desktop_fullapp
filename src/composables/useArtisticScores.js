import { ref } from "vue";

import {
  Sparkle20Regular,
  Grid20Regular,
  DocumentBulletList20Regular,
  StarEmphasis20Regular,
  Comment20Regular,
  Emoji20Regular,
  Eye20Regular,
} from "@vicons/fluent";
import { PersonRound } from "@vicons/material";
import {
  getArtisticSchema,
  getArtisticCriteria,
  getArtisticInternalKeys,
  getGenreWeights,
  getGenrePresetKeys,
  getGenreFromProfile,
  getProfileVariant,
} from "@/config/photo_schema";

// Icon mapping for criteria (UI-only — not part of the schema).
// Includes both style/general keys and commercial-only keys.
const criterionIcons = {
  aesthetic_quality: Sparkle20Regular,
  composition: Grid20Regular,
  storytelling: DocumentBulletList20Regular,
  strangeness: StarEmphasis20Regular,
  // style/general bonus
  message: Comment20Regular,
  humor: Emoji20Regular,
  visual_games: Eye20Regular,
  candidness: PersonRound,
  // commercial-only
  commercial_intent: Comment20Regular,
  subject_clarity: Eye20Regular,
};

// Score scale configuration
const scoreScale = {
  min: 1,
  max: 10,
  levels: [
    {
      value: 1,
      label: "Disastrous",
      color: "score-disastrous",
      bgColor: "#7f1d1d",
    },
    {
      value: 2,
      label: "Very Poor",
      color: "score-very-poor",
      bgColor: "#b91c1c",
    },
    { value: 3, label: "Poor", color: "score-poor", bgColor: "#ef4444" },
    {
      value: 4,
      label: "Needs Improvement",
      color: "score-needs-improvement",
      bgColor: "#f87171",
    },
    {
      value: 5,
      label: "Acceptable",
      color: "score-acceptable",
      bgColor: "#f59e0b",
    },
    { value: 6, label: "Good", color: "score-good", bgColor: "#10b981" },
    {
      value: 7,
      label: "Very Good",
      color: "score-very-good",
      bgColor: "#22d3ee",
    },
    {
      value: 8,
      label: "Remarkable",
      color: "score-remarkable",
      bgColor: "#3b82f6",
    },
    {
      value: 9,
      label: "Outstanding",
      color: "score-excellent",
      bgColor: "#6366f1",
    },
    {
      value: 10,
      label: "Masterpiece",
      color: "score-outstanding",
      bgColor: "#7c3aed",
    },
  ],
};

// Consistency scale configuration
const consistencyScale = {
  levels: [
    {
      value: 0,
      maxStdDev: 0.5,
      label: "Very Consistent",
      description: "Remarkably uniform scores across the portfolio",
      color: "#10b981",
    },
    {
      value: 1,
      maxStdDev: 1.0,
      label: "Mostly Consistent",
      description: "Fairly uniform with minor variations",
      color: "#22d3ee",
    },
    {
      value: 2,
      maxStdDev: 1.5,
      label: "Variable",
      description: "Moderate variations in scores",
      color: "#f59e0b",
    },
    {
      value: 3,
      maxStdDev: Infinity,
      label: "Highly Variable",
      description: "Wide range of scores across the portfolio",
      color: "#ef4444",
    },
  ],
};

// All available artistic score criteria organized by groups.
// Variant-scoped: returns the structure for the requested variant
// (general/style share the same set; commercial has a distinct set).
// Icons are injected from criterionIcons (UI-only concern).
function buildArtisticScoresForVariant(variant) {
  return Object.fromEntries(
    getArtisticSchema(variant).map((group) => [
      group.key,
      {
        label: group.label,
        color: group.color,
        criteria: group.criteria.map((criterion) => ({
          value: criterion.key,
          label: criterion.label,
          icon: criterionIcons[criterion.key] || null,
        })),
      },
    ]),
  );
}

/**
 * Map a UserProfile string to the corresponding genre preset key.
 * Delegates to the central schema's `getGenreFromProfile`.
 * @param {string|undefined|null} profile - The user profile from userStore
 * @returns {string} - The genre preset key
 */
export function getDefaultGenreFromProfile(profile) {
  return getGenreFromProfile(profile);
}

export function useArtisticScores(options = {}) {
  // Optional user profile (string or ref/computed). When provided, criterion
  // labels are resolved with per-profile overrides (e.g. visual_games →
  // "Subject Clarity" for commercial users).
  const profileOption = options.profile ?? null;
  const resolveProfile = () => {
    if (!profileOption) return null;
    if (typeof profileOption === "function") return profileOption();
    if (
      profileOption &&
      typeof profileOption === "object" &&
      "value" in profileOption
    ) {
      return profileOption.value;
    }
    return profileOption;
  };

  // Resolve the user's profile / variant ONCE at composable creation.
  // The profile is stable per session (logout remounts components),
  // so a snapshot avoids forcing all consumers to deal with reactive
  // refs for what was previously a plain value API.
  const initialProfile = resolveProfile();
  const variant = getProfileVariant(initialProfile);

  // Variant-scoped lookups built once.
  const artisticScores = buildArtisticScoresForVariant(variant);
  const variantCriteria = getArtisticCriteria(variant);
  const variantGenres = getGenrePresetKeys(variant);
  const genrePresets = Object.fromEntries(
    variantGenres.map((g) => [g, getGenreWeights(g, variant)]),
  );
  const getAllCriteriaKeys = () => getArtisticInternalKeys(variant);
  const defaultGenre = variantGenres[0];

  // Reactive weights for custom configuration - default to weight 1 for all criteria
  const artisticScoreWeights = ref(
    Object.fromEntries(getAllCriteriaKeys().map((key) => [key, 1])),
  );
  const selectedGenre = ref(defaultGenre);

  /**
   * Apply a genre preset to the weights. If `genre` is not a valid preset
   * for the current variant, the variant's default preset is used instead.
   * @param {string} genre - The genre preset to apply
   */
  const applyGenrePreset = (genre) => {
    const resolved = variantGenres.includes(genre) ? genre : defaultGenre;
    selectedGenre.value = resolved;
    const preset = genrePresets[resolved];
    if (preset) {
      getAllCriteriaKeys().forEach((criterion) => {
        artisticScoreWeights.value[criterion] =
          preset[criterion] !== undefined ? preset[criterion] : 1;
      });
    }
  };

  /**
   * Reset weights to default values
   */
  const resetWeights = () => {
    artisticScoreWeights.value = Object.fromEntries(
      getAllCriteriaKeys().map((key) => [key, 1]),
    );
    selectedGenre.value = "custom";
  };

  // Initialize with the variant's default preset by default.
  applyGenrePreset(defaultGenre);

  /**
   * Get all artistic scores with default values for missing criteria
   * @param {Object} artistic_scores - The artistic scores from photo data
   * @returns {Object} - Complete scores object with all criteria
   */
  const getCompleteArtisticScores = (artistic_scores) => {
    if (!artistic_scores || typeof artistic_scores !== "object") {
      // Return all criteria with 0 values if no scores available
      return getAllCriteriaKeys().reduce((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {});
    }

    // Ensure all criteria are present, use 0 for missing ones
    const completeScores = { ...artistic_scores };
    getAllCriteriaKeys().forEach((key) => {
      if (!(key in completeScores)) {
        completeScores[key] = 0;
      }
    });

    return completeScores;
  };

  /**
   * Get only active artistic scores (always show criteria defined in artisticScores)
   * @param {Object} artistic_scores - The artistic scores from photo data
   * @returns {Object} - Filtered scores object
   */
  const getActiveArtisticScores = (artistic_scores) => {
    const completeScores = getCompleteArtisticScores(artistic_scores);
    const activeScores = {};

    // Always show all criteria defined in artisticScores, regardless of current weight
    Object.entries(completeScores).forEach(([key, score]) => {
      if (getAllCriteriaKeys().includes(key)) {
        activeScores[key] = score;
      }
    });

    return activeScores;
  };

  /**
   * Get artistic scores ordered by groups (fundamentals first, then bonus)
   * @param {Object} artistic_scores - The artistic scores from photo data
   * @returns {Array} - Array of { criterion, score, group, label, icon } objects in correct order
   */
  const getOrderedArtisticScores = (artistic_scores) => {
    const completeScores = getCompleteArtisticScores(artistic_scores);
    const orderedScores = [];

    // Add fundamentals first
    if (artisticScores.fundamentals) {
      artisticScores.fundamentals.criteria.forEach((criterionObj) => {
        if (completeScores[criterionObj.value] !== undefined) {
          orderedScores.push({
            criterion: criterionObj.value,
            score: completeScores[criterionObj.value],
            group: "fundamentals",
            label: formatCriterionName(criterionObj.value),
            icon: criterionObj.icon,
          });
        }
      });
    }

    // Then add bonus
    if (artisticScores.bonus) {
      artisticScores.bonus.criteria.forEach((criterionObj) => {
        if (completeScores[criterionObj.value] !== undefined) {
          orderedScores.push({
            criterion: criterionObj.value,
            score: completeScores[criterionObj.value],
            group: "bonus",
            label: formatCriterionName(criterionObj.value),
            icon: criterionObj.icon,
          });
        }
      });
    }

    return orderedScores;
  };

  /**
   * Calculate artistic score for a photo based on genre weights
   * @param {Object} artistic_scores - The artistic scores object from photo
   * @param {string} genre - The genre preset to use (variant-dependent) or 'custom'
   * @param {Object} customWeights - Custom weights object (used when genre is 'custom')
   * @returns {Object} - { average, rating, total, count }
   */
  const calculateArtisticScore = (
    artistic_scores,
    genre = defaultGenre,
    customWeights = null,
  ) => {
    if (!artistic_scores || typeof artistic_scores !== "object") {
      return { average: 0, rating: "N/A", total: 0, count: 0 };
    }

    // Use custom weights if genre is 'custom' and customWeights are provided.
    // Otherwise look up the genre's preset; fall back to the variant default.
    const weights =
      genre === "custom" && customWeights
        ? customWeights
        : genrePresets[genre] || genrePresets[defaultGenre];
    const weightedScores = [];
    let totalWeight = 0;

    Object.entries(artistic_scores).forEach(([criterion, score]) => {
      const weight = weights[criterion];

      // Only include scores > 0 (exclude N/A) and weights > 0
      if (score > 0 && weight > 0) {
        weightedScores.push({
          score: score,
          weight: weight,
          weightedValue: score * weight,
        });
        totalWeight += weight;
      }
    });

    if (weightedScores.length === 0 || totalWeight === 0) {
      return {
        average: 0,
        rating: "N/A",
        total: 0,
        count: Object.keys(artistic_scores).length,
      };
    }

    // Calculate weighted average: sum of (score * weight) / sum of weights
    const weightedSum = weightedScores.reduce(
      (sum, item) => sum + item.weightedValue,
      0,
    );
    const average = weightedSum / totalWeight;

    // Keep the original score range
    const clampedAverage = Math.max(
      scoreScale.min,
      Math.min(scoreScale.max, average),
    );

    // Find the appropriate rating based on score levels
    const sortedLevels = [...scoreScale.levels].sort(
      (a, b) => b.value - a.value,
    );
    const matchingLevel = sortedLevels.find(
      (level) => clampedAverage >= level.value,
    );
    const rating = matchingLevel
      ? matchingLevel.label
      : scoreScale.levels[0].label;

    return {
      average: Math.round(clampedAverage * 10) / 10, // Round to 1 decimal
      rating,
      total: weightedScores.length,
      count: Object.keys(artistic_scores).length,
    };
  };

  /**
   * Get score color class based on score value
   * @param {number} score - The score value
   * @returns {string} - The CSS class name
   */
  const getScoreColorClass = (score) => {
    const sortedLevels = [...scoreScale.levels].sort(
      (a, b) => b.value - a.value,
    );
    const level = sortedLevels.find((l) => score >= l.value);
    return level ? level.color : scoreScale.levels[0].color;
  };

  /**
   * Get score background color based on score value
   * @param {number} score - The score value
   * @returns {string} - The background color hex value
   */
  const getScoreBgColor = (score) => {
    const sortedLevels = [...scoreScale.levels].sort(
      (a, b) => b.value - a.value,
    );
    const level = sortedLevels.find((l) => score >= l.value);
    return level ? level.bgColor : scoreScale.levels[0].bgColor;
  };

  /**
   * Format criterion name using the label from the variant's criteria.
   * @param {string} criterion - The criterion key in snake_case
   * @returns {string} - The formatted criterion name
   */
  const formatCriterionName = (criterion) => {
    const def = variantCriteria.find((c) => c.key === criterion);
    if (def) return def.label;

    // Fallback to title-case of the snake_case key when the criterion
    // belongs to a different variant than the user's current one.
    return criterion
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  /**
   * Format tooltip content for genre presets
   * @param {string} genre - The genre preset name
   * @returns {string} - The formatted HTML tooltip content
   */
  const formatGenreTooltip = (genre) => {
    const preset = genrePresets[genre];
    if (!preset) return "";

    let tooltip = `<div style="font-size: 12px; line-height: 1.4;">`;
    tooltip += `<div style="font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">${
      genre.charAt(0).toUpperCase() + genre.slice(1)
    } Preset Weights:</div>`;

    // Group criteria by their groups (fundamentals and bonus)
    Object.entries(artisticScores).forEach(([groupKey, group]) => {
      tooltip += `<div style="margin-bottom: 6px;">`;
      tooltip += `<div style="font-weight: 500; color: ${group.color}; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">${group.label}:</div>`;

      group.criteria.forEach((criterion) => {
        const weight = preset[criterion.value];
        const percentage = Math.round(weight * 100);
        tooltip += `<div style="margin-left: 8px; font-size: 11px; color: var(--text-secondary);">`;
        tooltip += `${formatCriterionName(criterion.value)}: <span style="font-weight: 500; color: ${
          percentage === 0
            ? "#ef4444"
            : percentage >= 80
              ? "#10b981"
              : percentage >= 50
                ? "#f59e0b"
                : "var(--text-primary)"
        }">${percentage}%</span>`;
        tooltip += `</div>`;
      });

      tooltip += `</div>`;
    });

    tooltip += `</div>`;
    return tooltip;
  };

  /**
   * Calculate consistency level based on standard deviation
   * @param {number} stdDev - The standard deviation of scores
   * @returns {Object} - { level, label, description, color }
   */
  const getConsistencyLevel = (stdDev) => {
    const level = consistencyScale.levels.find((l) => stdDev <= l.maxStdDev);
    return level || consistencyScale.levels[consistencyScale.levels.length - 1];
  };

  /**
   * Calculate global statistics for all artistic scores
   * @param {Array} photos - Array of photo objects
   * @returns {Object} - Statistics for each score criterion
   */
  const calculateGlobalArtisticScores = (photos) => {
    if (!photos || photos.length === 0) {
      return {};
    }

    const criteriaStats = {};
    const allCriteria = getAllCriteriaKeys();

    allCriteria.forEach((criterion) => {
      const values = [];

      // Collect all values for this criterion (excluding 0/N/A)
      photos.forEach((photo) => {
        const artistic_scores = photo.descriptions?.artistic_scores;
        if (artistic_scores) {
          const val = Number(artistic_scores[criterion]);
          if (!isNaN(val) && val > 0) {
            values.push(val);
          }
        }
      });

      if (values.length === 0) {
        criteriaStats[criterion] = null;
        return;
      }

      // Calculate mean
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

      // Calculate standard deviation
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length;
      const stdDev = Math.sqrt(variance);

      // Get consistency level
      const consistency = getConsistencyLevel(stdDev);

      // Get score label
      const sortedLevels = [...scoreScale.levels].sort(
        (a, b) => b.value - a.value,
      );
      const matchingLevel = sortedLevels.find((level) => mean >= level.value);
      const rating = matchingLevel
        ? matchingLevel.label
        : scoreScale.levels[0].label;

      criteriaStats[criterion] = {
        mean: Math.round(mean * 10) / 10,
        stdDev: Math.round(stdDev * 100) / 100,
        rating,
        consistency,
        count: values.length,
        total: photos.length,
      };
    });

    return criteriaStats;
  };

  /**
   * Get icon component for a criterion
   * @param {string} criterion - The criterion name
   * @returns {Component|null} - The icon component or null
   */
  const getCriterionIcon = (criterion) => {
    return criterionIcons[criterion] || null;
  };

  /**
   * Get criterion info including icon and group
   * @param {string} criterionValue - The criterion value
   * @returns {Object|null} - { label, icon, group, groupColor } or null
   */
  const getCriterionInfo = (criterionValue) => {
    for (const [groupKey, group] of Object.entries(artisticScores)) {
      const criterion = group.criteria.find((c) => c.value === criterionValue);
      if (criterion) {
        return {
          label: criterion.label,
          icon: criterion.icon,
          group: groupKey,
          groupColor: group.color,
          groupLabel: group.label,
        };
      }
    }
    return null;
  };

  return {
    // State
    artisticScoreWeights,
    selectedGenre,

    // Constants
    scoreScale,
    consistencyScale,
    genrePresets,
    artisticScores,
    criterionIcons,

    // Functions
    calculateArtisticScore,
    getScoreColorClass,
    getScoreBgColor,
    formatCriterionName,
    formatGenreTooltip,
    applyGenrePreset,
    resetWeights,
    getCompleteArtisticScores,
    getActiveArtisticScores,
    getOrderedArtisticScores,
    getConsistencyLevel,
    calculateGlobalArtisticScores,
    getCriterionIcon,
    getCriterionInfo,
  };
}
