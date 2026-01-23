<template>
  <div class="search-toolbar" :class="{ 'is-collapsed': isToolbarCollapsed }">
    <!-- Search Type and Mode Selector -->
    <div class="search-selector-section">
      <!-- Search Type -->
      <div class="selector-group">
        <div class="selector-label">Search Type:</div>
        <div class="type-pills">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="type-pill"
                :class="{ active: activeSearchType === 'semantic' }"
                @click="!isSearching && updateSearchType('semantic')"
                :aria-disabled="isSearching"
                :tabindex="isSearching ? -1 : 0"
                :style="
                  isSearching ? 'pointer-events: none; opacity: 0.5;' : ''
                "
              >
                <n-icon size="14" class="type-icon">
                  <DocumentOutline />
                </n-icon>
                Natural Language
              </div>
            </template>
            Search using natural language descriptions like "sunset beach photos
            with people"
          </n-tooltip>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="type-pill"
                :class="{ active: activeSearchType === 'tags' }"
                @click="!isSearching && updateSearchType('tags')"
                :aria-disabled="isSearching"
                :tabindex="isSearching ? -1 : 0"
                :style="
                  isSearching ? 'pointer-events: none; opacity: 0.5;' : ''
                "
              >
                <n-icon size="16" class="type-icon">
                  <TagOutlined />
                </n-icon>
                Tags
              </div>
            </template>
            Search by specific tags and keywords assigned to your photos
          </n-tooltip>
        </div>
      </div>

      <!-- Search Mode -->
      <div class="selector-group">
        <div class="selector-label">Search Mode:</div>
        <div class="mode-pills">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="mode-pill"
                :class="{ active: searchMode === 'broad' }"
                @click="!isSearching && updateSearchMode('broad')"
                :aria-disabled="isSearching"
                :tabindex="isSearching ? -1 : 0"
                :style="
                  isSearching ? 'pointer-events: none; opacity: 0.5;' : ''
                "
              >
                <n-icon size="16" class="mode-icon">
                  <GlobeOutline />
                </n-icon>
                Broad
              </div>
            </template>
            Fast, broad search focused on overall visual aspects.
          </n-tooltip>

          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="mode-pill premium-pill"
                :class="{ active: searchMode === 'adaptive' }"
                @click="!isSearching && updateSearchMode('adaptive')"
                :aria-disabled="isSearching"
                :tabindex="isSearching ? -1 : 0"
                :style="
                  isSearching ? 'pointer-events: none; opacity: 0.5;' : ''
                "
              >
                <n-icon size="16" class="mode-icon">
                  <SparklesOutline />
                </n-icon>
                Adaptive
              </div>
            </template>
            Flexible and deep search for similar and indirect associations
          </n-tooltip>

          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="mode-pill premium-pill"
                :class="{ active: searchMode === 'precise' }"
                @click="!isSearching && updateSearchMode('precise')"
                :aria-disabled="isSearching"
                :tabindex="isSearching ? -1 : 0"
                :style="
                  isSearching ? 'pointer-events: none; opacity: 0.5;' : ''
                "
              >
                <n-icon size="16" class="mode-icon">
                  <SparklesOutline />
                </n-icon>
                Precise
                <div class="premium-indicator-pill"></div>
              </div>
            </template>
            Heavy search that prioritizes logical accuracy
          </n-tooltip>
        </div>
      </div>

      <!-- Insights Toggle -->
      <div class="selector-group">
        <div class="selector-label">Insights:</div>
        <div class="mode-pills">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="mode-pill insights-pill premium-pill"
                :class="{ active: withInsights }"
                @click="!isSearching && updateWithInsights(!withInsights)"
                :aria-disabled="isSearching"
                :tabindex="isSearching ? -1 : 0"
                :style="
                  isSearching ? 'pointer-events: none; opacity: 0.5;' : ''
                "
              >
                <n-icon size="16" class="mode-icon">
                  <SparklesOutline />
                </n-icon>
                {{ withInsights ? "Enabled" : "Disabled" }}
                <div class="premium-indicator-pill"></div>
              </div>
            </template>
            Enhance search results with insights and commentary
          </n-tooltip>
        </div>
      </div>
    </div>

    <!-- More Filters Toggle -->
    <div class="search-filters-section">
      <div
        class="more-filters-toggle"
        @click="emit('update:showMoreFilters', !showMoreFilters)"
      >
        <span class="more-filters-label">More filters</span>
        <div class="more-filters-indicators">
          <span v-if="hasActiveFilters" class="active-filters-indicator">
            {{ activeFiltersCount }}
          </span>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showMoreFilters }"
          >
            <ChevronDownOutline />
          </n-icon>
        </div>
      </div>

      <!-- Collapsible Filters Container -->
      <div v-if="showMoreFilters" class="filters-container">
        <div class="filters-content">
          <!-- Collections Filter -->
          <div class="filter-compact-group">
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
          </div>

          <!-- Visual Aspects Filter -->
          <div class="filter-compact-group">
            <div class="filter-column">
              <span class="filter-compact-label" style="margin-bottom: 2px"
                >Visual aspects</span
              >
              <n-tree-select
                v-model:value="selectedVisualAspects"
                multiple
                clearable
                placeholder="Any"
                :options="treeSelectOptions"
                :max-tag-count="3"
                class="filter-compact-select"
                :disabled="isSearching"
                size="small"
                style="min-width: 200px"
                check-strategy="child"
                :show-path="false"
                expand-on-click
              >
                <template #empty>
                  <div style="padding: 8px; color: #888; font-size: 12px">
                    No visual aspects found
                  </div>
                </template>
              </n-tree-select>
            </div>
          </div>

          <!-- Artistic Scores Filter -->
          <div class="filter-compact-group">
            <div class="filter-column">
              <div class="filter-label-row">
                <span class="filter-compact-label">Visual scores</span>
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
                  Will include photos above 7 in the selected scores
                </n-tooltip>
              </div>
              <n-tree-select
                v-model:value="selectedArtisticScores"
                multiple
                clearable
                placeholder="Any"
                :options="artisticScoresOptions"
                :max-tag-count="3"
                class="filter-compact-select"
                :disabled="isSearching"
                size="small"
                style="min-width: 200px"
                check-strategy="child"
                :show-path="false"
                expand-on-click
              >
                <template #empty>
                  <div style="padding: 8px; color: #888; font-size: 12px">
                    No artistic scores found
                  </div>
                </template>
              </n-tree-select>
            </div>
          </div>
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
          <n-input
            v-model:value="semanticQuery"
            type="textarea"
            placeholder="Describe what you're looking for... e.g., 'sunset photos with people on the beach' or 'close-up portraits with red background'"
            :autosize="{ minRows: 1, maxRows: 2 }"
            class="semantic-input"
          />

          <div class="search-actions-inline">
            <n-button
              type="primary"
              :loading="isSearching"
              :disabled="!hasSearchQuery"
              @click="emit('search')"
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
                tag
                placeholder="Add tags to include..."
                :options="includedTagSuggestionsFormatted"
                :clear-filter-after-select="true"
                :max-tag-count="5"
                class="tags-select include-tags"
                @search="emit('searchIncludedTags', $event)"
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
                tag
                placeholder="Add tags to exclude..."
                :options="excludedTagSuggestionsFormatted"
                :max-tag-count="5"
                class="tags-select exclude-tags"
                @search="emit('searchExcludedTags', $event)"
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
              @click="emit('search')"
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
</template>

<script setup>
import { computed } from "vue";
import {
  NTooltip,
  NTreeSelect,
  NSelect,
  NInput,
  NButton,
  NIcon,
} from "naive-ui";
import {
  DocumentOutline,
  SparklesOutline,
  GlobeOutline,
  ChevronDownOutline,
  InformationCircleOutline,
  SearchOutline,
  CloseOutline,
  InformationCircle,
} from "@vicons/ionicons5";
import { TagOutlined } from "@vicons/antd";
import {
  useSearchStore,
  createArtisticScoresTreeOptions,
} from "@/stores/searchStore";
import { useCollectionsStore } from "@/stores/collections";

defineOptions({ name: "SearchDesktopLayout" });

// Stores
const searchStore = useSearchStore();
const collectionsStore = useCollectionsStore();

// Props - only UI state and suggestions come from parent
const props = defineProps({
  // UI state
  isToolbarCollapsed: { type: Boolean, default: false },

  // Tag suggestions from composable
  includedTagSuggestionsFormatted: { type: Array, default: () => [] },
  excludedTagSuggestionsFormatted: { type: Array, default: () => [] },

  // Filters
  showMoreFilters: { type: Boolean, default: false },
});

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
  get: () => searchStore.selectedVisualAspects,
  set: (value) => searchStore.setSelectedVisualAspects(value),
});

const selectedArtisticScores = computed({
  get: () => searchStore.selectedArtisticScores,
  set: (value) => searchStore.setSelectedArtisticScores(value),
});

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

const treeSelectOptions = computed(() => {
  return searchStore.visualAspectsOptions.map((group) => ({
    label: group.label,
    key: group.key,
    disabled: false,
    checkable: false,
    children: group.children.map((child) => ({
      label: child.label,
      key: child.value,
      disabled: false,
      checkable: true,
    })),
  }));
});

const artisticScoresOptions = computed(() => createArtisticScoresTreeOptions());

// Active filters computed
const hasActiveFilters = computed(() => {
  return (
    selectedCollections.value.length > 0 ||
    searchStore.selectedVisualAspects.length > 0 ||
    searchStore.selectedArtisticScores.length > 0
  );
});

const activeFiltersCount = computed(() => {
  return (
    selectedCollections.value.length +
    searchStore.selectedVisualAspects.length +
    searchStore.selectedArtisticScores.length
  );
});

// Events - only actions and tag search go to parent
const emit = defineEmits([
  // Tag search (for suggestions from composable)
  "searchIncludedTags",
  "searchExcludedTags",

  // Filters
  "update:showMoreFilters",

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
</script>

<style scoped>
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
  transition: transform 0.3s ease;
}

.search-toolbar.is-collapsed {
  transform: translateY(-120%);
}

/* Combined Search Selector Section */
.search-selector-section {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 10px;
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

/* Search Type Pills */
.type-pills {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-start;
  overflow: visible;
}

.type-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  justify-content: center;
  text-align: center;
  overflow: visible;
}

.type-pill:hover {
  background-color: var(--bg-hover);
  border-color: var(--primary-color);
}

.type-pill.active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.type-icon {
  flex-shrink: 0;
}

/* Mode Pills */
.mode-pills {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}

.mode-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  position: relative;
}

.mode-pill:hover {
  background-color: var(--bg-hover);
  border-color: var(--primary-color);
}

.mode-pill.active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.mode-icon {
  flex-shrink: 0;
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
  margin-top: 10px;
}

.more-filters-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.more-filters-toggle:hover {
  color: var(--primary-color);
}

.more-filters-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.more-filters-toggle:hover {
  background-color: var(--bg-hover);
  border-color: var(--border-color-hover);
}

.more-filters-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--primary-color);
}

.more-filters-indicators {
  display: flex;
  align-items: center;
  gap: 4px;
}

.active-filters-indicator {
  background-color: var(--primary-color);
  color: white;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
}

.toggle-icon {
  transition: transform 0.2s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* Filters Container */
.filters-container {
  margin-top: 5px;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filters-content {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
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

/* Search Content */
.search-content {
  margin-top: 8px;
}

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

.semantic-input {
  flex: 1;
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
