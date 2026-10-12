<template>
  <div
    class="search-toolbar-wrapper"
    :class="{ 'is-hovering': isHovering }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Mini Collapsed Bar -->
    <div
      v-if="isToolbarCollapsed && !hasOpenSelect"
      class="search-toolbar-mini"
      :class="{ 'is-hovering': isHovering }"
    >
      <div class="mini-content">
        <div class="mini-search-type">
          <n-icon size="14">
            <DocumentOutline v-if="activeSearchType === 'semantic'" />
            <TagOutlined v-else />
          </n-icon>
          <span>{{
            activeSearchType === "semantic" ? "Natural Language" : "Tags"
          }}</span>
        </div>
        <div class="mini-divider"></div>
        <div class="mini-search-mode">
          <n-icon size="14">
            <GlobeOutline v-if="searchMode === 'broad'" />
            <!-- <SparklesOutline v-else-if="searchMode === 'adaptive'" /> -->
            <SearchOutline v-else />
          </n-icon>
          <span>{{
            searchMode.charAt(0).toUpperCase() + searchMode.slice(1)
          }}</span>
        </div>
        <div class="mini-divider"></div>
        <div class="mini-query">
          <template v-if="activeSearchType === 'semantic'">
            <span class="mini-query-text">{{
              semanticQuery || "No query"
            }}</span>
          </template>
          <template v-else>
            <span class="mini-query-text" v-if="includedTags.length > 0">
              {{ includedTags.join(", ") }}
            </span>
            <span class="mini-query-text" v-else>No tags selected</span>
          </template>
        </div>

        <!-- Active Filters Badges -->
        <template v-if="hasActiveFilters">
          <div class="mini-divider"></div>
          <n-tag
            v-for="(filter, index) in activeFiltersBadges?.slice(0, 2)"
            :key="index"
            type="info"
            size="small"
            :bordered="false"
            round
          >
            {{ filter }}
          </n-tag>
          <n-tag
            v-if="activeFiltersBadges.length > 2"
            type="info"
            size="small"
            :bordered="false"
            round
            strong
          >
            +{{ activeFiltersBadges.length - 2 }}
          </n-tag>
        </template>

        <div class="mini-expand-hint">
          <n-icon size="16">
            <ChevronDownOutline />
          </n-icon>
          <span>Hover to expand</span>
        </div>
      </div>
    </div>

    <!-- Full Search Toolbar -->
    <div
      class="search-toolbar"
      :class="{
        'is-collapsed': isToolbarCollapsed && !isHovering && !hasOpenSelect,
      }"
    >
      <!-- Search Type and Mode Selector -->
      <div class="search-selector-section">
        <!-- Search Mode -->
        <div class="selector-group">
          <div class="mode-pills">
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <n-button
                  :type="searchMode === 'broad' ? 'primary' : 'default'"
                  @click="!isSearching && updateSearchMode('broad')"
                  :disabled="isSearching"
                  secondary
                  class="selector-button"
                >
                  <template #icon>
                    <n-icon size="16">
                      <GlobeOutline />
                    </n-icon>
                  </template>
                  Broad
                </n-button>
              </template>
              Fast, broad search focused on overall visual aspects.
            </n-tooltip>

            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <div class="premium-button-wrapper">
                  <n-button
                    :type="searchMode === 'precise' ? 'primary' : 'default'"
                    @click="!isSearching && canUsePrecise && updateSearchMode('precise')"
                    :disabled="isSearching || !canUsePrecise"
                    secondary
                    class="selector-button premium-button"
                  >
                    <template #icon>
                      <n-icon size="16">
                        <LocateOutline />
                      </n-icon>
                    </template>
                    Precise
                  </n-button>
                  <!-- <div class="premium-indicator-pill"></div> -->
                </div>
              </template>
              {{ preciseTooltip }}
            </n-tooltip>

            <n-tooltip v-if="!hasCredits" trigger="hover" placement="top">
              <template #trigger>
                <span class="basic-search-hint">{{ BASIC_SEARCH_NOTICE.title }} · no credits</span>
              </template>
              {{ BASIC_SEARCH_NOTICE.text }}
            </n-tooltip>

            <!-- Adaptive mode temporarily hidden
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <n-button
                  :type="searchMode === 'adaptive' ? 'primary' : 'default'"
                  @click="!isSearching && updateSearchMode('adaptive')"
                  :disabled="isSearching"
                  secondary
                  class="selector-button premium-button"
                >
                  <template #icon>
                    <n-icon size="16">
                      <SparklesOutline />
                    </n-icon>
                  </template>
                  Adaptive
                </n-button>
              </template>
              Flexible and deep search for similar and indirect associations
            </n-tooltip>
            -->
          </div>
        </div>

        <!-- Search Type -->
        <div class="selector-group">
          <div class="type-pills">
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <n-button
                  :type="
                    activeSearchType === 'semantic' ? 'primary' : 'default'
                  "
                  @click="!isSearching && updateSearchType('semantic')"
                  :disabled="isSearching"
                  secondary
                  class="selector-button"
                >
                  <template #icon>
                    <n-icon size="14">
                      <DocumentOutline />
                    </n-icon>
                  </template>
                  Natural Language
                </n-button>
              </template>
              Search using natural language descriptions like "sunset beach
              photos with people"
            </n-tooltip>
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <n-button
                  :type="activeSearchType === 'tags' ? 'primary' : 'default'"
                  @click="!isSearching && updateSearchType('tags')"
                  :disabled="isSearching"
                  secondary
                  class="selector-button"
                >
                  <template #icon>
                    <n-icon size="16">
                      <TagOutlined />
                    </n-icon>
                  </template>
                  Tags
                </n-button>
              </template>
              Search by specific tags and keywords assigned to your photos
            </n-tooltip>
          </div>
        </div>

        <!-- Insights Toggle temporarily hidden
        <div class="selector-group">
          <div class="mode-pills">
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <div class="premium-button-wrapper">
                  <n-button
                    :type="withInsights ? 'primary' : 'default'"
                    @click="!isSearching && updateWithInsights(!withInsights)"
                    :disabled="isSearching"
                    secondary
                    class="selector-button premium-button"
                  >
                    <template #icon>
                      <n-icon size="16">
                        <SparklesOutline />
                      </n-icon>
                    </template>
                    Insights
                  </n-button>
                  <div class="premium-indicator-pill"></div>
                </div>
              </template>
              Enhance search results with insights and commentary
            </n-tooltip>
          </div>
        </div>
        -->
      </div>

      <!-- More Filters Accordion -->
      <div class="search-filters-section">
        <div class="filter-controls-section-header" @click="toggleFilters">
          <div class="filter-controls-header-left">
            <n-icon
              size="16"
              class="filter-controls-section-icon"
              :color="`var(--primary-color)`"
            >
              <OptionsOutline />
            </n-icon>
            <span class="filter-controls-section-label">More filters</span>
            <n-tag
              v-if="hasActiveFilters && !isFiltersExpanded"
              size="tiny"
              type="primary"
              :bordered="false"
              round
            >
              {{ activeFiltersCount }}
            </n-tag>
          </div>
          <n-icon
            size="14"
            class="filter-controls-toggle-icon"
            :class="{ rotated: isFiltersExpanded }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <!-- Collapsible Filters Content -->
        <div v-if="isFiltersExpanded" class="filter-controls-tab-container">
          <div class="filters-content">
            <!-- Collections Filter -->
            <!-- <div class="filter-compact-group">
              <div class="filter-column">
                <div class="filter-label-row">
                  <span class="filter-compact-label">Collections</span>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon
                        size="13"
                        color="var(--text-secondary)"
                        style="cursor: help"
                      >
                        <InformationCircle />
                      </n-icon>
                    </template>
                    Only collections with more than 50 photos are available for
                    filter searches.
                  </n-tooltip>
                </div>
                <n-select
                  v-model:value="selectedCollections"
                  multiple
                  clearable
                  placeholder="Any"
                  :options="collectionsOptions"
                  :max-tag-count="3"
                  class="filter-compact-select"
                  :loading="collectionsLoading"
                  :disabled="isSearching"
                  size="small"
                  style="min-width: 200px"
                >
                  <template #empty>
                    <div style="padding: 8px; color: #888; font-size: 12px">
                      No collections found
                    </div>
                  </template>
                  <template #render-option="{ option }">
                    <div class="collection-option">
                      <span>{{ option.label }}</span>
                      <span
                        :style="{
                          color: option.disabled ? '#ff7875' : '#8c8c8c',
                          fontSize: '12px',
                        }"
                      >
                        {{ option.photoCount }} photos
                      </span>
                    </div>
                  </template>
                </n-select>
              </div>
            </div> -->

            <!-- Visual Filters Panel -->
            <VisualFiltersPanel
              :visual-aspects="selectedFilters"
              :score-filters="selectedArtisticScores"
              :disabled="isSearching"
              :show-section-labels="false"
              @update:visual-aspects="handleVisualFiltersChange"
              @update:score-filters="handleScoreFiltersChange"
            />
          </div>
        </div>
      </div>

      <!-- Conditional Search Content -->
      <div class="search-content">
        <!-- Semantic Language Search -->
        <div
          v-if="activeSearchType === 'semantic'"
          key="semantic-search"
          class="semantic-search-section"
        >
          <div class="search-input-row">
            <div class="semantic-input-wrapper">
              <n-input
                v-model:value="semanticQuery"
                type="textarea"
                placeholder="Describe what you're looking for... e.g., 'sunset photos with people on the beach' or 'close-up portraits with red background'"
                :autosize="{ minRows: 1, maxRows: 2 }"
                class="semantic-input"
                @keydown.enter.prevent="handleSemanticInputEnter"
              />
              <span
                v-if="semanticWordCount >= 80"
                class="word-counter"
                :class="{ 'at-limit': semanticWordCount >= 100 }"
              >
                {{ semanticWordCount }}/100
              </span>
            </div>

            <div class="search-actions-inline">
              <n-button
                type="primary"
                :loading="isSearching"
                :disabled="!hasSearchQuery || isSemanticOverLimit"
                @click="handleSearch"
                class="search-button"
              >
                <template #icon>
                  <n-icon>
                    <SearchOutline />
                  </n-icon>
                </template>
                Search Photos
              </n-button>
              <n-button
                secondary
                @click="emit('clear')"
                :disabled="!hasSearchQuery"
                class="clear-button icon-only"
              >
                <template #icon>
                  <n-icon>
                    <CloseOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
          </div>
        </div>

        <!-- Tags Search -->
        <div
          v-else-if="activeSearchType === 'tags'"
          key="tags-search"
          class="tags-search-section"
        >
          <div class="tags-input-row">
            <div class="tags-row">
              <div class="tags-group">
                <n-select
                  ref="tagIncSelect"
                  v-model:value="includedTags"
                  multiple
                  filterable
                  clearable
                  remote
                  placeholder="Add tags to include..."
                  :options="includedTagSuggestionsFormatted"
                  :clear-filter-after-select="true"
                  :max-tag-count="5"
                  class="tags-select include-tags"
                  @search="emit('searchIncludedTags', $event)"
                  @update:show="handleSelectShowChange"
                >
                  <template #empty>
                    <div style="padding: 8px; color: #888">
                      Start typing to search tags...
                    </div>
                  </template>
                </n-select>
              </div>
              <div class="tags-group">
                <n-select
                  ref="tagExcSelect"
                  v-model:value="excludedTags"
                  multiple
                  filterable
                  clearable
                  remote
                  placeholder="Add tags to exclude..."
                  :options="excludedTagSuggestionsFormatted"
                  :max-tag-count="5"
                  class="tags-select exclude-tags"
                  @search="emit('searchExcludedTags', $event)"
                  @update:show="handleSelectShowChange"
                >
                  <template #empty>
                    <div style="padding: 8px; color: #888">
                      Start typing to search tags...
                    </div>
                  </template>
                </n-select>
              </div>
            </div>

            <div class="search-actions-inline">
              <n-button
                type="primary"
                :loading="isSearching"
                :disabled="!hasSearchQuery"
                @click="handleSearch"
                class="search-button"
              >
                <template #icon>
                  <n-icon>
                    <SearchOutline />
                  </n-icon>
                </template>
                Search Photos
              </n-button>
              <n-button
                secondary
                @click="emit('clear')"
                :disabled="!hasSearchQuery"
                class="clear-button icon-only"
              >
                <template #icon>
                  <n-icon>
                    <CloseOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { NTooltip, NSelect, NInput, NButton, NIcon, NTag } from "naive-ui";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import VisualFiltersPanel from "@/components/photos-grid/VisualFiltersPanel.vue";
import {
  DocumentOutline,
  SparklesOutline,
  GlobeOutline,
  ChevronDownOutline,
  InformationCircleOutline,
  SearchOutline,
  CloseOutline,
  InformationCircle,
  ChevronDownOutline as ChevronDown,
  OptionsOutline,
  LocateOutline,
} from "@vicons/ionicons5";
import { TagOutlined } from "@vicons/antd";
import { useSearchStore } from "@/stores/searchStore";
import { useUserStore } from "@/stores/userStore";
import { BASIC_SEARCH_NOTICE, useSearchCredits } from "@/desktop/useSearchCredits";
import { useCollectionsStore } from "@/stores/collections";

// Maneja Enter en el input semántico para disparar búsqueda (sin Shift)
function handleSemanticInputEnter(e) {
  if (!e.shiftKey && hasSearchQuery.value && !isSearching.value) {
    handleSearch();
  }
}

defineOptions({ name: "SearchPanelDesktopLayout" });

// Stores
const searchStore = useSearchStore();
const collectionsStore = useCollectionsStore();

// Local state for hover
const isHovering = ref(false);
const hasOpenSelect = ref(false);

// Visual Aspects Filters
const selectedFilters = ref({});

// Initialize selectedFilters with empty arrays for each category
const userStore = useUserStore();
const { hasCredits, canUsePrecise, preciseTooltip } = useSearchCredits();
searchStore.visualAspectsOptionsForProfile.forEach((group) => {
  selectedFilters.value[group.key] = [];
});

// Artistic Scores from composable
const { artisticScores, criterionIcons, formatCriterionName } =
  useArtisticScores({
    profile: () => userStore.user?.profiles,
  });

// Props - only UI state and suggestions come from parent
const props = defineProps({
  // UI state
  isToolbarCollapsed: { type: Boolean, default: false },
  forceCollapseKey: { type: Number, default: 0 },

  // Tag suggestions from composable
  includedTagSuggestionsFormatted: { type: Array, default: () => [] },
  excludedTagSuggestionsFormatted: { type: Array, default: () => [] },
});

// Local filter accordion state
const isFiltersExpanded = ref(false);
function toggleFilters() {
  isFiltersExpanded.value = !isFiltersExpanded.value;
}

// Collapse panel when forceCollapseKey changes (e.g. scroll down in results)
watch(
  () => props.forceCollapseKey,
  () => {
    isHovering.value = false;
    isFiltersExpanded.value = false;
  },
);

// Computed from stores
const activeSearchType = computed(() => searchStore.activeSearchType);
const searchMode = computed(() => searchStore.searchMode);
const isSearching = computed(() => searchStore.isSearching);
const hasSearchQuery = computed(() => searchStore.hasSearchQuery);
const withInsights = computed(
  () => searchStore.currentSearchState.withInsights || false,
);

// Search queries from store
const semanticQuery = computed({
  get: () => searchStore.currentSearchState.query || "",
  set: (value) => searchStore.updateSemanticQuery(value),
});

const semanticWordCount = computed(() => {
  const q = searchStore.currentSearchState.query || "";
  return q.trim() === "" ? 0 : q.trim().split(/\s+/).length;
});

const isSemanticOverLimit = computed(
  () => activeSearchType.value === "semantic" && semanticWordCount.value > 100,
);

const includedTags = computed({
  get: () => searchStore.currentSearchState.includedTags || [],
  set: (value) =>
    searchStore.updateTagsSearch(
      value,
      searchStore.currentSearchState.excludedTags || [],
    ),
});

const excludedTags = computed({
  get: () => searchStore.currentSearchState.excludedTags || [],
  set: (value) =>
    searchStore.updateTagsSearch(
      searchStore.currentSearchState.includedTags || [],
      value,
    ),
});

const selectedCollections = computed({
  get: () => searchStore.selectedCollections || [],
  set: (value) => searchStore.setSelectedCollections(value),
});

const selectedVisualAspects = computed({
  get: () => {
    // Flatten all selected filters into a single array
    return Object.values(selectedFilters.value).flat();
  },
  set: (value) => {
    // This should not be called directly anymore
    searchStore.setSelectedVisualAspects(value);
  },
});

// Watch selectedFilters and update store
watch(
  selectedFilters,
  (newFilters) => {
    const flatFilters = Object.values(newFilters).flat();
    searchStore.setSelectedVisualAspects(flatFilters);
  },
  { deep: true },
);

const selectedArtisticScores = computed({
  get: () => searchStore.selectedArtisticScores,
  set: (value) => searchStore.setSelectedArtisticScores(value),
});

// Handler for VisualFiltersPanel changes
function handleVisualFiltersChange(newFilters) {
  selectedFilters.value = newFilters;
  const flatFilters = Object.values(newFilters).flat();
  searchStore.setSelectedVisualAspects(flatFilters);
}

function handleScoreFiltersChange(newScoreFilters) {
  searchStore.setSelectedArtisticScores(newScoreFilters);
}

// Filter options from stores
const collectionsOptions = computed(() => {
  return collectionsStore.allCollections.map((collection) => ({
    label: collection.name,
    value: collection.id,
    disabled: (collection.photoCount || 0) < 50,
    photoCount: collection.photoCount || 0,
  }));
});

const collectionsLoading = computed(() => collectionsStore.isLoading);

// Active filters computed
const hasActiveFilters = computed(() => {
  return (
    selectedCollections.value.length > 0 ||
    searchStore.selectedVisualAspects.length > 0 ||
    Object.keys(searchStore.selectedArtisticScores).length > 0
  );
});

const activeFiltersCount = computed(() => {
  return (
    selectedCollections.value.length +
    searchStore.selectedVisualAspects.length +
    Object.keys(searchStore.selectedArtisticScores).length
  );
});

// Active filters badges for mini view
const activeFiltersBadges = computed(() => {
  const badges = [];

  // Add visual aspects
  searchStore.selectedVisualAspects.forEach((aspect) => {
    badges.push(aspect);
  });

  // Add artistic scores
  Object.entries(searchStore.selectedArtisticScores).forEach(
    ([key, filter]) => {
      let scoreLabel = key;
      Object.values(artisticScores).forEach((group) => {
        const criterion = group.criteria.find((c) => c.value === key);
        if (criterion) {
          scoreLabel = `${formatCriterionName(criterion.value)} ${filter.operator} ${filter.value}`;
        }
      });
      badges.push(scoreLabel);
    },
  );

  return badges;
});

// Events - only actions and tag search go to parent
const emit = defineEmits([
  // Tag search (for suggestions from composable)
  "searchIncludedTags",
  "searchExcludedTags",

  // Actions
  "search",
  "clear",
]);

// Methods to update store directly
function updateSearchType(type) {
  searchStore.setSearchType(type);
}

function updateSearchMode(mode) {
  searchStore.setSearchMode(mode);
}

function updateWithInsights(value) {
  searchStore.setWithInsights(value);
}

function handleSearch() {
  isFiltersExpanded.value = false;
  isHovering.value = false;
  emit("search");
}

// Hover: abrir panel colapsado al pasar el ratón con debounce. No se cierra al salir.
let hoverDebounceTimer = null;

function handleMouseEnter() {
  if (props.isToolbarCollapsed && !isSearching.value) {
    hoverDebounceTimer = setTimeout(() => {
      isHovering.value = true;
    }, 300);
  }
}

function handleMouseLeave() {
  // Cancelar el debounce si el ratón sale antes de que se active
  if (hoverDebounceTimer) {
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = null;
  }
}

// Rastrear cuando un select se abre o cierra
function handleSelectShowChange(show) {
  hasOpenSelect.value = show;
}
</script>

<style scoped>

.basic-search-hint {
  align-self: center;
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
}
/* Toolbar Wrapper */
.search-toolbar-wrapper {
  position: relative;
  flex-shrink: 0;
  /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
}

/* Mini Collapsed Bar */
.search-toolbar-mini {
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 16px 14px 16px;
  /* transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); */
  cursor: pointer;
}

.search-toolbar-mini.is-hovering {
  background-color: var(--bg-subtle);
}

/* Hide mini bar when hovering to show full toolbar */
.search-toolbar-wrapper.is-hovering .search-toolbar-mini {
  max-height: 0;
  overflow: hidden;
  padding: 0;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.mini-content {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-primary);
}

.mini-search-type,
.mini-search-mode,
.mini-content :deep(.n-tag) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 12px;
  font-weight: 500;
  font-size: 12px;
}

.mini-search-type,
.mini-search-mode {
  background-color: rgba(96, 165, 250, 0.1);
  color: var(--info-color);
}

/* Purple color for filter tags */
.mini-content :deep(.n-tag) {
  background-color: rgba(168, 85, 247, 0.1) !important;
  color: var(--accent-color) !important;
}

.mini-divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
}

.mini-query {
  flex: 1;
  min-width: 0;
}

.mini-query-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-style: italic;
}

.mini-expand-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  margin-left: auto;
  opacity: 0.6;
}

.search-toolbar-mini.is-hovering .mini-expand-hint {
  opacity: 1;
  color: var(--info-color);
}

/* Search Toolbar */
.search-toolbar {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 12px 24px;
  position: sticky;
  top: 0;
  z-index: 10;
  transform: translateY(0);
  transition: none;
}

.search-toolbar-wrapper.is-hovering .search-toolbar {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-toolbar.is-collapsed {
  max-height: 0;
  overflow: hidden;
  padding: 0;
  margin: 0;
  border: none;
  opacity: 0;
  pointer-events: none;
}

/* When hovering over the mini bar, show full toolbar */
.search-toolbar-wrapper.is-hovering .search-toolbar.is-collapsed {
  max-height: 1000px;
  overflow: visible;
  padding: 12px 24px;
  margin-bottom: 0px;
  border: 1px solid var(--border-color);
  opacity: 1;
  pointer-events: auto;
}

/* Combined Search Selector Section */
.search-selector-section {
  display: flex;
  align-items: flex-start;
  gap: 48px;
  /* margin-bottom: 10px; */
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  overflow: visible;
}

.selector-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: visible;
}

.selector-group:first-child {
  flex: 1 1 auto;
}

.selector-group:last-child {
  flex: 0 0 auto;
}

.selector-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

/* Selector Buttons */
.selector-button {
  flex-shrink: 0;
}

/* Search Type Pills */
.type-pills {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-start;
  overflow: visible;
}

/* Mode Pills */
.mode-pills {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}

/* Premium Button Wrapper */
.premium-button-wrapper {
  position: relative;
  display: inline-block;
}

.premium-button {
  position: relative;
}

.premium-indicator-pill {
  position: absolute;
  top: -4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: var(--accent-gradient, linear-gradient(135deg, #f59e0b, #d97706));
  transform: rotate(45deg);
  box-shadow: 0 0 4px var(--shadow-accent);
  border: 1px solid var(--border-color);
}

/* Filters Section */
.search-filters-section {
  margin-top: 4px;
  margin-bottom: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.filters-content {
  display: flex;
  flex-direction: column;
  padding: 4px 0 0;
  width: 100%;
}

.filter-compact-group {
  display: flex;
  flex-direction: column;
}

.filter-column {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.filter-label-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}

.filter-compact-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.filter-compact-select {
  min-width: 200px;
}

.collection-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

/* Visual Aspects Filters - Grid layout like PhotosGridControls */
.visual-aspects-filters-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
  width: 100%;
}

/* Desktop: force single row */
@media (min-width: 1200px) {
  .visual-aspects-filters-container {
    grid-template-columns: repeat(9, minmax(0, 1fr));
  }
}

/* Tablet/Medium screens: flexible columns */
@media (min-width: 768px) and (max-width: 1199px) {
  .visual-aspects-filters-container {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}

/* Mobile: single column */
@media (max-width: 767px) {
  .visual-aspects-filters-container {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

.visual-aspect-item {
  min-width: 0;
}

.visual-aspect-select {
  width: 100%;
}

/* Filter Section Headers */
.filter-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  margin-top: 12px;
}

.filter-section-title {
  font-size: 12px;
  color: var(--text-primary);
}

/* Artistic Scores Filters - Button row */
.artistic-scores-filters-container {
  width: 100%;
}

/* Search Content */
/* .search-content {
  margin-top: 16px;
} */

.semantic-search-section,
.tags-search-section {
  width: 100%;
}

.search-input-row,
.tags-input-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.semantic-input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}

.semantic-input {
  flex: 1;
}

.word-counter {
  align-self: flex-end;
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 2px;
  padding-right: 2px;
  transition: color 0.2s;
}

.word-counter.at-limit {
  color: #ef4444;
  font-weight: 600;
}

.search-actions-inline {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.search-button {
  white-space: nowrap;
}

.clear-button.icon-only {
  padding: 0 12px;
}

/* Tags Search */
.tags-row {
  display: flex;
  gap: 12px;
  flex: 1;
}

.tags-group {
  flex: 1;
}

.tags-select {
  width: 100%;
}

.include-tags :deep(.n-base-selection) {
  border-color: var(--success-color);
}

.exclude-tags :deep(.n-base-selection) {
  border-color: var(--error-color);
}
</style>
