<template>
  <div class="tag-cloud-container" ref="containerRef">
    <!-- Error -->
    <div v-if="error" class="state-screen">
      <div class="state-content">
        <h2>Unable to load tag cloud</h2>
        <p>{{ error }}</p>
        <button @click="loadTags" class="primary-btn">Retry</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="discrete-loader">
      <div class="loader-spinner"></div>
      <span class="loader-text">{{ loadingMessage }}</span>
    </div>

    <!-- Empty -->
    <div v-else-if="tags.length === 0" class="state-screen">
      <div class="state-content">
        <h2>No tags yet</h2>
        <p>
          Once your photos are analyzed, their tags will appear here floating in
          a 2D semantic space.
        </p>
      </div>
    </div>

    <!-- PixiJS Shared Canvas -->
    <PixiTagCloud
      v-else
      ref="pixiCloudRef"
      :tags="tags"
      :show-dots="showDots"
      :balloon-expansion="balloonExpansion"
      :dynamic-search="dynamicSearch"
      :max-search-tags="maxSearchTags"
      :read-only="false"
      @tags-selected="onTagsSelected"
    />

    <!-- Config Panel -->
    <TagCloudConfigPanel
      v-if="allTags.length > 0"
      v-model:minPhotoCount="minPhotoCount"
      v-model:limit="limit"
      v-model:showDots="showDots"
      v-model:dynamicSearch="dynamicSearch"
      v-model:maxSearchTags="maxSearchTags"
      v-model:balloonExpansion="balloonExpansion"
      v-model:selectedGroups="selectedGroups"
      :tagCount="tags.length"
      :totalCandidates="metadata?.totalCandidates ?? null"
      :availableGroups="availableGroups"
      :availableTags="tags"
      @filters-changed="onFiltersChanged"
      @reset-view="resetView"
      @fly-to-tag="flyToTag"
    />
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch,
} from "vue";
import { api } from "@/utils/axios";
import TagCloudConfigPanel from "./TagCloudConfigPanel.vue";
import PixiTagCloud from "./PixiTagCloud.vue";
import {
  useTagCloudStore,
  DEFAULT_MIN_PHOTO_COUNT,
  DEFAULT_LIMIT,
} from "@/stores/tagCloudStore.js";

const tagCloudStore = useTagCloudStore();

const emit = defineEmits(["tags-selected"]);

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------
const containerRef = ref(null);
const pixiCloudRef = ref(null);
const loading = ref(true);
const loadingMessage = ref("Loading tag cloud…");
const error = ref(null);
const allTags = ref([]); // all raw tags from backend, sorted by photoCount desc
const tags = ref([]); // tags currently rendered (filtered by selectedGroups)
const metadata = ref(null);

// Filters
const minPhotoCount = ref(1);
const limit = ref(10000);
const showDots = ref(true);
const dynamicSearch = ref(false);
const maxSearchTags = ref(20);
const balloonExpansion = ref(0.2);
const selectedGroups = ref([]); // empty = all groups

// Group color palette
const GROUP_COLORS = {
  person: 0xf472b6,
  animals: 0xfbbf24,
  objects: 0x60a5fa,
  toponym: 0x34d399,
  environment: 0x10b981,
  mood: 0xa78bfa,
  weather: 0x38bdf8,
  symbols: 0xf87171,
  "abstract concept": 0xc084fc,
  misc: 0x9ca3af,
};
const DEFAULT_COLOR = 0x9ca3af;

// ---------------------------------------------------------------------------
// Data loading & Filtering
// ---------------------------------------------------------------------------
let filterDebounceTimer = null;

// Canonical group keys: map known singular→plural variants to a single key
const GROUP_KEY_ALIASES = {
  object: "objects",
  animal: "animals",
  person: "person", // already singular by convention
  symbol: "symbols",
};

const canonicalGroupKey = (key) => {
  if (!key) return key;
  const lower = key.trim().toLowerCase();
  return GROUP_KEY_ALIASES[lower] ?? lower;
};

const normalizeGroupName = (groupName) => {
  if (!groupName) return "";
  return groupName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const isUsingDefaultParams = () =>
  minPhotoCount.value === DEFAULT_MIN_PHOTO_COUNT &&
  limit.value === DEFAULT_LIMIT;

const applyTagData = async (data) => {
  const incoming = (data?.tags || [])
    .filter((t) => Array.isArray(t.coordinates) && t.coordinates.length >= 2)
    .map((t) => ({ ...t, group: canonicalGroupKey(t.group) }));
  incoming.sort((a, b) => (b.photoCount || 0) - (a.photoCount || 0));
  allTags.value = incoming;
  tags.value =
    selectedGroups.value.length === 0
      ? incoming
      : incoming.filter((t) => selectedGroups.value.includes(t.group));
  metadata.value = data?.metadata || null;
};

const applyGroupFilter = () => {
  tags.value =
    selectedGroups.value.length === 0
      ? allTags.value
      : allTags.value.filter((t) => selectedGroups.value.includes(t.group));
};

const availableGroups = computed(() => {
  const counts = new Map();
  for (const t of allTags.value) {
    if (t.group) counts.set(t.group, (counts.get(t.group) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({
      key,
      label: normalizeGroupName(key),
      color: GROUP_COLORS[key] || DEFAULT_COLOR,
      count,
    }))
    .sort((a, b) => b.count - a.count);
});

const loadTags = async () => {
  loading.value = true;
  loadingMessage.value = "Generating tag cloud…";
  error.value = null;
  try {
    // If using default params, reuse the store's prefetched data (or await its in-flight request)
    if (isUsingDefaultParams()) {
      const cached = await tagCloudStore.awaitData();
      if (cached) {
        await applyTagData(cached);
        return;
      }
    }

    // Custom params or store had no data — fall back to a direct call
    const { data } = await api.post("/api/tagcloud/2d", {
      outputDims: 2,
      minPhotoCount: Math.max(1, minPhotoCount.value),
      limit: Math.max(100, limit.value),
    });
    await applyTagData(data);
  } catch (err) {
    console.error("[TagCloud] Failed to load tags:", err);
    error.value =
      err?.response?.data?.message || err.message || "Failed to load tag cloud";
  } finally {
    loading.value = false;
  }
};

const onFiltersChanged = () => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => loadTags(), 300);
};

const onTagsSelected = (selected) => {
  emit("tags-selected", selected);
};

watch(
  selectedGroups,
  () => {
    applyGroupFilter();
  },
  { deep: true },
);

// ---------------------------------------------------------------------------
// Expose methods to preserve public API of TagCloud
// ---------------------------------------------------------------------------
const clearSelection = () => {
  pixiCloudRef.value?.clearSelection();
};

const flyToTag = (tagId) => {
  pixiCloudRef.value?.flyToTag(tagId);
};

const resetView = () => {
  pixiCloudRef.value?.resetView();
};

onMounted(async () => {
  await loadTags();
});

onBeforeUnmount(() => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
});

defineExpose({
  clearSelection,
  flyToTag,
  resetView,
});
</script>

<style scoped>
.tag-cloud-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: black;
  color: var(--text-primary, #fff);
}

.state-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  background: var(--bg-overlay, rgba(13, 13, 18, 0.85));
}

.state-content {
  text-align: center;
  max-width: 420px;
  padding: 40px;
}

.state-content h2 {
  margin: 0 0 12px 0;
  font-size: 1.4em;
  color: var(--text-primary, #f3f4f6);
}

.state-content p {
  margin: 0 0 20px 0;
  color: var(--text-secondary, #d1d5db);
  line-height: 1.5;
}

.primary-btn {
  background: var(--primary-color, #3b82f6);
  color: var(--text-on-primary, #fff);
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
}

.primary-btn:hover {
  background: var(--primary-color-hover, #2563eb);
  transform: translateY(-1px);
}

.discrete-loader {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-container, rgba(26, 26, 31, 0.95));
  backdrop-filter: blur(12px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
  box-shadow: var(--shadow-md);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  animation: loaderSlideUp 0.3s ease-out;
  max-width: 90vw;
}

@keyframes loaderSlideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.loader-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color, rgba(255, 255, 255, 0.2));
  border-top: 2px solid var(--primary-color, #3b82f6);
  border-radius: 50%;
  animation: discreteSpinner 1s linear infinite;
  flex-shrink: 0;
}

@keyframes discreteSpinner {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loader-text {
  color: var(--text-primary, #ffffff);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
  white-space: nowrap;
}
</style>
