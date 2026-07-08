<template>
  <div class="report-section">
    <div class="report-section-header">
      <h2 class="section-title">
        <n-icon class="section-icon">
          <PricetagIcon />
        </n-icon>
        Tags Distribution
      </h2>
      <p class="section-description">
        Proportional presence of tags across the selected part of your catalog
      </p>
    </div>

    <div class="treemap-card">
      <div class="treemap-controls">
        <n-select
          v-model:value="selectedTags"
          v-model:show="tagDropdownShow"
          multiple
          filterable
          clearable
          remote
          tag
          placeholder="Select at least two tag..."
          :options="tagOptions"
          :input-props="tagInputProps"
          :clear-filter-after-select="true"
          :max-tag-count="8"
          :ignore-composition="false"
          :loading="isSearching"
          @search="searchTags"
        >
          <template #empty>
            <div class="select-empty">Start typing to search tags...</div>
          </template>
        </n-select>

        <n-button
          type="primary"
          :disabled="isGenerateDisabled"
          :loading="isLoading"
          @click="handleGenerateButtonClick"
        >
          <template #icon>
            <n-icon>
              <AppsOutline />
            </n-icon>
          </template>
          Generate
        </n-button>

        <n-radio-group
          v-model:value="matchMode"
          :disabled="selectedTags.length == 0"
          @update:value="handleGenerateTreemap"
        >
          <n-radio-button
            v-for="option in matchModeOptions"
            :key="option.value"
            :value="option.value"
          >
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <span class="match-mode-trigger">{{ option.label }}</span>
              </template>
              {{ option.description }}
            </n-tooltip>
          </n-radio-button>
        </n-radio-group>
      </div>

      <!-- <div class="treemap-summary">
        <span class="summary-item">
          <span class="summary-label">Photos</span>
          <span class="summary-value">{{ totalPhotos }}</span>
        </span>
        <span class="summary-item">
          <span class="summary-label">Tags</span>
          <span class="summary-value">{{ tags.length }}</span>
        </span>
        <span class="summary-item">
          <span class="summary-label">Scope</span>
          <span class="summary-value">{{ scopeLabel }}</span>
        </span>
      </div> -->

      <div v-if="isLoading" class="treemap-loading">
        <n-spin size="medium" />
      </div>

      <div
        v-else-if="rectangles.length > 0"
        ref="treemapLayoutRef"
        class="treemap-layout"
      >
        <n-tooltip
          v-for="rect in rectangles"
          :key="`${rect.id}-${treemapRenderKey}`"
          trigger="hover"
          placement="top"
        >
          <template #trigger>
            <div
              class="treemap-tile"
              :class="rect.labelMode ? `treemap-tile--${rect.labelMode}` : null"
              :style="getTileStyle(rect)"
            >
              <span v-if="rect.showShare" class="tile-share">
                {{ rect.relativePercentage }}%
              </span>
              <span v-if="rect.showLabel" class="tile-label">{{
                rect.name
              }}</span>
              <span v-if="rect.showMeta" class="tile-meta">
                {{ rect.photoCount }} photos · {{ rect.percentage }}%
              </span>
            </div>
          </template>
          <div class="treemap-tooltip">
            <strong>{{ rect.name }}</strong>
            <span>{{ rect.photoCount }} photos</span>
            <span>Relative share: {{ rect.relativePercentage }}%</span>
            <span>Total share: {{ rect.percentage }}%</span>
          </div>
        </n-tooltip>
      </div>

      <div v-else class="empty-treemap">
        <n-icon size="48" :component="PricetagIcon" class="empty-icon" />
        <p class="empty-text">
          Select tags or use main tags to build the treemap
        </p>
      </div>

      <span
        v-if="showMainTags && selectedTags.length === 0"
        class="main-tags-preview-label"
      >
        This is a preview of your main tags. Select yours to customize the
        treemap.
      </span>

      <!-- <div v-if="topTags.length > 0" class="treemap-legend">
        <button
          v-for="tag in topTags"
          :key="tag.id"
          class="legend-chip"
          @click="toggleTag(tag.name)"
        >
          <span
            class="legend-color"
            :style="{ backgroundColor: getColor(tag.colorIndex) }"
          ></span>
          <span class="legend-name">{{ tag.name }}</span>
          <span class="legend-count">{{ tag.photoCount }}</span>
        </button>
      </div> -->
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api } from "@/utils/axios";
import { useArtisticScores } from "@/composables/useArtisticScores";
import { NRadioButton, NRadioGroup, NTooltip } from "naive-ui";
import {
  AppsOutline,
  PricetagOutline as PricetagIcon,
} from "@vicons/ionicons5";
import { trackEvent, trackUserAction } from "@/utils/analytics";

const { scoreScale } = useArtisticScores();

const selectedTags = ref([]);
const tagDropdownShow = ref(false);
const includeContained = ref(true);
const tagOptions = ref([]);
const tagSearchTerm = ref("");
const tags = ref([]);
const totalPhotos = ref(0);
const isLoading = ref(false);
const isSearching = ref(false);
const showMainTags = ref(false);
const treemapLayoutRef = ref(null);
const treemapSize = ref({ width: 0, height: 0 });
const treemapRenderKey = ref(0);
const lastGeneratedSignature = ref(null);
let refreshTimer = null;
let tagSearchTimer = null;
let treemapResizeObserver = null;

const observeTreemapLayout = (element) => {
  treemapResizeObserver?.disconnect();
  treemapResizeObserver = null;

  if (!element || typeof ResizeObserver === "undefined") return;

  treemapSize.value = {
    width: element.clientWidth,
    height: element.clientHeight,
  };

  treemapResizeObserver = new ResizeObserver(([entry]) => {
    treemapSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    };
  });
  treemapResizeObserver.observe(element);
};

// Uses the score scale as a continuous gradient instead of a fixed palette.
const scorePalette = scoreScale.levels.map((level) => level.bgColor);

const hexToRgb = (hex) => {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.substring(0, 2), 16),
    g: parseInt(value.substring(2, 4), 16),
    b: parseInt(value.substring(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")}`;

const interpolateColor = (from, to, t) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);

  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
};

/**
 * Returns a color distributed across the entire score scale.
 * index = position of the tile
 * total = total number of tiles
 */
const getColor = (index, total) => {
  if (total <= 1) {
    return scorePalette[Math.floor(scorePalette.length / 2)];
  }

  const normalized = index / (total - 1);

  const scaled = normalized * (scorePalette.length - 1);
  const from = Math.floor(scaled);
  const to = Math.min(from + 1, scorePalette.length - 1);
  const t = scaled - from;

  return interpolateColor(scorePalette[from], scorePalette[to], t);
};

const scopeLabel = computed(() => {
  if (selectedTags.value.length === 0) {
    return showMainTags.value ? "Main tags" : "No selection";
  }

  return includeContained.value
    ? "Contains selected tags"
    : "Exact selected tags";
});

const matchMode = computed({
  get: () => (includeContained.value ? "contains" : "exact"),
  set: (value) => {
    includeContained.value = value === "contains";
    trackEvent("tags_treemap_match_mode_change", { match_mode: value });
  },
});

const matchModeOptions = [
  {
    value: "exact",
    label: "Exact",
    description: "Only tags that match the selected tag names exactly.",
  },
  {
    value: "contains",
    label: "Contains",
    description:
      "Tags that include the selected tag names as part of the text.",
  },
];

const getTreemapSignature = (rawTags, mode) => {
  const normalizedTags = normalizeTags(rawTags).sort();
  if (normalizedTags.length < 2) return null;

  return `${mode}::${normalizedTags.join("\u0001")}`;
};

const currentTreemapSignature = computed(() =>
  getTreemapSignature(selectedTags.value, matchMode.value),
);

const isGenerateDisabled = computed(
  () =>
    selectedTags.value.length < 2 ||
    currentTreemapSignature.value === lastGeneratedSignature.value,
);

const topTags = computed(() => tags.value.slice(0, 12));

const TREEMAP_MIN_RECT_SIDE = 6;
const TREEMAP_BALANCE_WEIGHT = 0.28;
const TREEMAP_ORIENTATION_BIAS = 0.16;

// Only one special case: short horizontal strips where the absolute badge
// would overflow the tile height. Everything else uses the default column layout
// (label at bottom-left, badge at top-right absolute) which works for any shape.
const getTileLabelMode = ({ pixelWidth, pixelHeight }) => {
  if (pixelWidth < 32 || pixelHeight < 14) return null;
  if (pixelHeight < 36) return "horizontal";
  return "normal";
};

const rectangles = computed(() => {
  const total = tags.value.reduce((sum, tag) => sum + tag.photoCount, 0);
  if (total <= 0) return [];

  const items = tags.value.map((tag, index) => ({
    ...tag,
    colorIndex: index,
    value: tag.photoCount,
    relativePercentage: ((tag.photoCount / total) * 100).toFixed(1),
  }));

  return buildTreemapLayout(items, { x: 0, y: 0, width: 100, height: 100 }).map(
    (rect) => {
      const pixelWidth = (rect.width / 100) * treemapSize.value.width;
      const pixelHeight = (rect.height / 100) * treemapSize.value.height;
      const labelMode = getTileLabelMode({ pixelWidth, pixelHeight });

      return {
        ...rect,
        labelMode,
        showLabel: labelMode !== null,
        showMeta:
          labelMode === "normal" && pixelWidth >= 100 && pixelHeight >= 48,
        // Badge needs ~44px wide; horizontal mode handles it inline so always show
        showShare:
          labelMode !== null &&
          (labelMode === "horizontal" || pixelWidth >= 44),
      };
    },
  );
});

const getTileStyle = (rect) => ({
  left: `${rect.x}%`,
  top: `${rect.y}%`,
  width: `${rect.width}%`,
  height: `${rect.height}%`,
  backgroundColor: getColor(rect.colorIndex, tags.value.length),
  "--fade-delay": `${Math.min(rect.colorIndex * 12, 120)}ms`,
});

const normalizeTag = (value) => String(value).trim().toLowerCase();

const normalizeTags = (rawTags) => {
  return rawTags.map((tag) => normalizeTag(tag)).filter(Boolean);
};

const handleTagCreate = (label) => {
  const normalized = normalizeTag(label);
  if (!normalized) return null;

  return {
    label: normalized,
    value: normalized,
  };
};

const hasExactTagMatch = (label) => {
  const normalized = normalizeTag(label);
  return tagOptions.value.some(
    (option) => normalizeTag(option.value ?? option.label) === normalized,
  );
};

const createTagFromSearchTerm = (label) => {
  const option = handleTagCreate(label);
  if (!option) return false;

  const normalized = option.value;
  if (selectedTags.value.includes(normalized) || hasExactTagMatch(normalized)) {
    return false;
  }

  selectedTags.value = [...selectedTags.value, normalized];
  tagSearchTerm.value = "";
  tagOptions.value = [];
  tagDropdownShow.value = false;
  return true;
};

const handleTagInputKeydown = (event) => {
  if (event.key !== "Enter" || event.isComposing) return;

  const currentValue = String(event.target?.value ?? "");
  if (!currentValue.trim()) return;

  if (createTagFromSearchTerm(currentValue)) {
    event.preventDefault();
    event.stopPropagation();
  }
};

const tagInputProps = {
  onKeydown: handleTagInputKeydown,
};

const fetchTreemap = async () => {
  const requestSignature = currentTreemapSignature.value;

  if (!showMainTags.value && selectedTags.value.length === 0) {
    tags.value = [];
    totalPhotos.value = 0;
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  try {
    const response = await api.get("/api/tags/treemap", {
      params: {
        tags: selectedTags.value.join(","),
        includeContained: includeContained.value,
        mainTags: showMainTags.value && selectedTags.value.length === 0,
        limit: showMainTags.value && selectedTags.value.length === 0 ? 24 : 80,
      },
    });

    const result = response.data?.result || {};
    tags.value = (result.tags || []).map((tag, index) => ({
      ...tag,
      colorIndex: index,
    }));
    totalPhotos.value = result.totalPhotos || 0;
    lastGeneratedSignature.value = requestSignature;
    treemapRenderKey.value += 1;

    trackEvent("tags_treemap_loaded", {
      tag_count: tags.value.length,
      total_photos: totalPhotos.value,
      match_mode: matchMode.value,
      is_main_tags: showMainTags.value && selectedTags.value.length === 0,
    });
  } finally {
    isLoading.value = false;
  }
};

const handleGenerateTreemap = () => {
  showMainTags.value = selectedTags.value.length === 0;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(fetchTreemap, 180);
};

const handleGenerateButtonClick = () => {
  trackEvent("tags_treemap_generate", {
    tag_count: selectedTags.value.length,
    match_mode: matchMode.value,
  });
  handleGenerateTreemap();
};

const searchTags = (term) => {
  tagSearchTerm.value = term;
  window.clearTimeout(tagSearchTimer);

  if (!term || term.trim().length < 1) {
    tagOptions.value = [];
    return;
  }

  tagSearchTimer = window.setTimeout(async () => {
    isSearching.value = true;
    try {
      const response = await api.get("/api/tags/search", {
        params: { term: term.trim() },
      });
      // Ignore stale responses if the user kept typing
      if (tagSearchTerm.value !== term) return;
      const selectedValues = new Set(selectedTags.value);
      const foundOptions = (response.data?.result || [])
        .map((tag) => ({
          label: tag.name,
          value: tag.name,
        }))
        .filter(
          (option) => !selectedValues.has(String(option.value).toLowerCase()),
        );
      const optionsByValue = new Map(
        foundOptions.map((option) => [option.value, option]),
      );
      tagOptions.value = Array.from(optionsByValue.values());
    } finally {
      isSearching.value = false;
    }
  }, 300);
};

const toggleTag = (tagName) => {
  const normalized = tagName.toLowerCase();
  const isRemoving = selectedTags.value.includes(normalized);
  showMainTags.value = false;
  selectedTags.value = isRemoving
    ? selectedTags.value.filter((tag) => tag !== normalized)
    : [...selectedTags.value, normalized];

  trackUserAction(
    isRemoving ? "remove_tag" : "add_tag",
    "tags_treemap_legend",
    normalized,
  );
};

watch(selectedTags, (value, oldValue) => {
  const normalizedTags = normalizeTags(value);
  if (normalizedTags.join("\u0000") !== value.join("\u0000")) {
    selectedTags.value = normalizedTags;
    return;
  }

  const previousLength = oldValue?.length ?? 0;
  if (normalizedTags.length !== previousLength) {
    trackEvent("tags_treemap_selection_change", {
      tag_count: normalizedTags.length,
      action: normalizedTags.length > previousLength ? "add" : "remove",
    });
  }

  if (normalizedTags.length < 2) {
    lastGeneratedSignature.value = null;
  }
});

watch(
  () => selectedTags.value.length,
  (length) => {
    tagDropdownShow.value = false;

    if (length === 0) {
      showMainTags.value = true;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(fetchTreemap, 180);
    }
  },
);

watch(treemapLayoutRef, observeTreemapLayout);

onMounted(() => {
  showMainTags.value = true;
  fetchTreemap();
});

onBeforeUnmount(() => {
  treemapResizeObserver?.disconnect();
  window.clearTimeout(refreshTimer);
  window.clearTimeout(tagSearchTimer);
});

const sumValue = (items) => items.reduce((sum, item) => sum + item.value, 0);

const clampRect = (rect) => ({
  ...rect,
  width: Math.max(rect.width, 0),
  height: Math.max(rect.height, 0),
});

const getRectAspectRatio = (width, height) => {
  if (width <= 0 || height <= 0) return Infinity;
  return Math.max(width / height, height / width);
};

const getSplitOrientation = (bounds) =>
  bounds.width >= bounds.height ? "vertical" : "horizontal";

const sliceBounds = (bounds, ratio, orientation) => {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);

  if (orientation === "vertical") {
    const primaryWidth = bounds.width * clampedRatio;

    return [
      clampRect({
        x: bounds.x,
        y: bounds.y,
        width: primaryWidth,
        height: bounds.height,
      }),
      clampRect({
        x: bounds.x + primaryWidth,
        y: bounds.y,
        width: bounds.width - primaryWidth,
        height: bounds.height,
      }),
    ];
  }

  const primaryHeight = bounds.height * clampedRatio;

  return [
    clampRect({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: primaryHeight,
    }),
    clampRect({
      x: bounds.x,
      y: bounds.y + primaryHeight,
      width: bounds.width,
      height: bounds.height - primaryHeight,
    }),
  ];
};

const scoreBoundsForItems = (bounds, items) => {
  if (items.length === 0) return Infinity;

  const area = bounds.width * bounds.height;
  const total = sumValue(items);
  if (area <= 0 || total <= 0) return Infinity;

  const aspectPenalty = getRectAspectRatio(bounds.width, bounds.height) - 1;
  const density = total / area;
  const minShare = Math.min(...items.map((item) => item.value / total));
  const thinPenalty = Math.max(
    0,
    TREEMAP_MIN_RECT_SIDE - Math.min(bounds.width, bounds.height),
  );

  return (
    aspectPenalty +
    density * 0.08 +
    (minShare < 0.12 ? (0.12 - minShare) * 2.2 : 0) +
    thinPenalty * 0.12
  );
};

const scoreSplitCandidate = ({
  items,
  splitIndex,
  orientation,
  bounds,
  total,
}) => {
  const primaryItems = items.slice(0, splitIndex);
  const secondaryItems = items.slice(splitIndex);
  const primaryTotal = sumValue(primaryItems);
  const ratio = primaryTotal / total;
  const [primaryBounds, secondaryBounds] = sliceBounds(
    bounds,
    ratio,
    orientation,
  );

  const orientationPenalty =
    orientation === getSplitOrientation(bounds) ? 0 : TREEMAP_ORIENTATION_BIAS;
  const balancePenalty = Math.abs(0.5 - ratio) * TREEMAP_BALANCE_WEIGHT;
  const childPenalty =
    scoreBoundsForItems(primaryBounds, primaryItems) +
    scoreBoundsForItems(secondaryBounds, secondaryItems);

  return {
    splitIndex,
    orientation,
    ratio,
    score: childPenalty + balancePenalty + orientationPenalty,
  };
};

const chooseBestTreemapSplit = (items, bounds) => {
  const total = sumValue(items);
  if (items.length < 2 || total <= 0) return null;

  let bestCandidate = null;

  for (let splitIndex = 1; splitIndex < items.length; splitIndex += 1) {
    const verticalCandidate = scoreSplitCandidate({
      items,
      splitIndex,
      orientation: "vertical",
      bounds,
      total,
    });
    const horizontalCandidate = scoreSplitCandidate({
      items,
      splitIndex,
      orientation: "horizontal",
      bounds,
      total,
    });

    const candidate =
      verticalCandidate.score <= horizontalCandidate.score
        ? verticalCandidate
        : horizontalCandidate;

    if (!bestCandidate || candidate.score < bestCandidate.score) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
};

const layoutSingleRect = (item, bounds) => [
  {
    ...item,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  },
];

const buildTreemapLayoutRecursive = (items, bounds) => {
  if (items.length === 0 || bounds.width <= 0 || bounds.height <= 0) return [];
  if (items.length === 1) return layoutSingleRect(items[0], bounds);

  const split = chooseBestTreemapSplit(items, bounds);
  if (!split) return layoutSingleRect(items[0], bounds);

  const primaryItems = items.slice(0, split.splitIndex);
  const secondaryItems = items.slice(split.splitIndex);
  const [primaryBounds, secondaryBounds] = sliceBounds(
    bounds,
    split.ratio,
    split.orientation,
  );

  return [
    ...buildTreemapLayoutRecursive(primaryItems, primaryBounds),
    ...buildTreemapLayoutRecursive(secondaryItems, secondaryBounds),
  ];
};

const buildTreemapLayout = (items, bounds) => {
  const total = sumValue(items);
  if (items.length === 0 || total <= 0) return [];

  const scale = (bounds.width * bounds.height) / total;
  const normalizedItems = [...items]
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .map((item) => ({
      ...item,
      value: item.value * scale,
    }));

  return buildTreemapLayoutRecursive(normalizedItems, bounds);
};
</script>

<style scoped>
.treemap-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
}

.treemap-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.treemap-controls .n-select {
  flex: 1;
}

.match-mode-trigger {
  display: inline-flex;
}

.select-empty {
  padding: var(--spacing-sm);
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.treemap-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.summary-item {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.summary-label {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.summary-value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.treemap-layout {
  position: relative;
  width: 100%;
  height: clamp(460px, 58vh, 560px);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.treemap-tile {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 2px;
  min-width: 0;
  padding: var(--spacing-sm);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: white;
  text-align: left;
  overflow: hidden;
  cursor: pointer;
  opacity: 0;
  animation: treemap-tile-fade-in 220ms ease-out forwards;
  animation-delay: var(--fade-delay, 0ms);
  transition:
    filter 0.16s ease,
    transform 0.16s ease;
}

@keyframes treemap-tile-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .treemap-tile {
    animation: none;
    opacity: 1;
    transition: none;
  }
}

.tile-share {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  padding: 4px 8px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(8px);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.treemap-tile:hover {
  filter: brightness(1.08);
  z-index: 1;
}

/* Horizontal strip: badge can't sit in top-right corner (tile too short),
   so lay label + badge out in a single row instead. */
.treemap-tile--horizontal {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: var(--spacing-xs);
  padding: 3px var(--spacing-sm);
}

.treemap-tile--horizontal .tile-label {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  line-height: 1;
}

.treemap-tile--horizontal .tile-share {
  position: static;
  flex: 0 0 auto;
  padding: 2px 6px;
  font-size: var(--font-size-xs);
}

.tile-label {
  max-width: 100%;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.tile-meta {
  max-width: 100%;
  font-size: var(--font-size-xs);
  line-height: 1.1;
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.treemap-tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.treemap-loading,
.empty-treemap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: clamp(460px, 58vh, 560px);
  gap: var(--spacing-md);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.main-tags-preview-label {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.treemap-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
}

.legend-chip:hover {
  border-color: var(--primary-color);
  color: var(--text-primary);
}

.legend-color {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-sm);
}

.legend-name,
.legend-count {
  font-size: var(--font-size-xs);
}

.legend-count {
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .treemap-card {
    padding: var(--spacing-lg);
  }

  .treemap-layout,
  .treemap-loading,
  .empty-treemap {
    height: clamp(400px, 54vh, 500px);
  }

  .tile-meta {
    display: none;
  }

  .treemap-tile--normal .tile-share {
    top: var(--spacing-xs);
    right: var(--spacing-xs);
    font-size: var(--font-size-xs);
  }
}
</style>
