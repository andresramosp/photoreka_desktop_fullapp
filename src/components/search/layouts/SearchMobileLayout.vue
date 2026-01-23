<template>
  <div class="mobile-search-layout">
    <!-- Fixed Top Bar -->
    <div class="mobile-top-bar">
      <div class="mobile-search-row">
        <!-- Main Search Input (depends on search type) -->
        <div class="mobile-search-input-wrapper">
          <n-input
            v-if="activeSearchType === 'semantic'"
            v-model:value="semanticQuery"
            placeholder="Describe what you're looking for..."
            class="mobile-search-input"
          >
            <template #prefix>
              <n-icon size="18" color="var(--text-secondary)">
                <SearchOutline />
              </n-icon>
            </template>
          </n-input>

          <n-select
            v-else-if="activeSearchType === 'tags'"
            v-model:value="includedTags"
            multiple
            filterable
            clearable
            tag
            placeholder="Add tags to include..."
            :options="includedTagSuggestionsFormatted"
            :clear-filter-after-select="true"
            :max-tag-count="2"
            class="mobile-search-input"
            @search="emit('searchIncludedTags', $event)"
          >
            <template #empty>
              <div style="padding: 8px; color: #888">
                Start typing to search tags...
              </div>
            </template>
          </n-select>
        </div>

        <!-- Search Button -->
        <n-button
          type="primary"
          :loading="isSearching"
          :disabled="!hasSearchQuery"
          @click="emit('search')"
          class="mobile-search-button"
        >
          <template #icon>
            <n-icon>
              <SearchOutline />
            </n-icon>
          </template>
        </n-button>

        <!-- Filters Button -->
        <n-button
          :type="showFiltersPanel ? 'primary' : 'default'"
          @click="toggleFiltersPanel"
          class="mobile-filters-button"
        >
          <template #icon>
            <n-icon>
              <OptionsOutline />
            </n-icon>
          </template>
          <n-badge
            v-if="totalActiveFilters > 0"
            :value="totalActiveFilters"
            :max="9"
            class="filters-badge"
          />
        </n-button>
      </div>
    </div>

    <!-- Filters Panel (Bottom Sheet / Overlay) -->
    <n-drawer
      v-model:show="showFiltersPanel"
      placement="bottom"
      :height="'80vh'"
      :trap-focus="true"
      :close-on-esc="true"
      class="mobile-filters-drawer"
    >
      <n-drawer-content>
        <template #header>
          <div class="drawer-header">
            <span class="drawer-title">Search Options</span>
            <n-button text @click="showFiltersPanel = false">
              <template #icon>
                <n-icon size="24">
                  <CloseOutline />
                </n-icon>
              </template>
            </n-button>
          </div>
        </template>

        <div class="filters-panel-content">
          <!-- Search Type -->
          <div class="filter-section">
            <div class="filter-section-label">Search Type</div>
            <div class="filter-pills-row">
              <div
                class="filter-pill"
                :class="{ active: activeSearchType === 'semantic' }"
                @click="!isSearching && updateSearchType('semantic')"
              >
                <n-icon size="16">
                  <DocumentOutline />
                </n-icon>
                <span>Natural Language</span>
              </div>
              <div
                class="filter-pill"
                :class="{ active: activeSearchType === 'tags' }"
                @click="!isSearching && updateSearchType('tags')"
              >
                <n-icon size="16">
                  <PricetagOutline />
                </n-icon>
                <span>Tags</span>
              </div>
            </div>
          </div>

          <!-- Search Mode -->
          <div class="filter-section">
            <div class="filter-section-label">Search Mode</div>
            <div class="filter-pills-row">
              <div
                class="filter-pill"
                :class="{ active: searchMode === 'broad' }"
                @click="!isSearching && updateSearchMode('broad')"
              >
                <n-icon size="16">
                  <GlobeOutline />
                </n-icon>
                <span>Broad</span>
              </div>
              <div
                class="filter-pill"
                :class="{ active: searchMode === 'adaptive' }"
                @click="!isSearching && updateSearchMode('adaptive')"
              >
                <n-icon size="16">
                  <SparklesOutline />
                </n-icon>
                <span>Adaptive</span>
              </div>
              <div
                class="filter-pill"
                :class="{ active: searchMode === 'precise' }"
                @click="!isSearching && updateSearchMode('precise')"
              >
                <n-icon size="16">
                  <SparklesOutline />
                </n-icon>
                <span>Precise</span>
              </div>
            </div>
          </div>

          <!-- Insights Toggle -->
          <div class="filter-section">
            <div class="filter-section-label">Insights</div>
            <div class="filter-pills-row">
              <div
                class="filter-pill insights-pill"
                :class="{ active: withInsights }"
                @click="!isSearching && updateWithInsights(!withInsights)"
              >
                <n-icon size="16">
                  <SparklesOutline />
                </n-icon>
                <span>{{ withInsights ? "Enabled" : "Disabled" }}</span>
              </div>
            </div>
          </div>

          <!-- Divider -->
          <n-divider />

          <!-- Additional Search Inputs (for tags mode) -->
          <div v-if="activeSearchType === 'tags'" class="filter-section">
            <div class="filter-section-label">Excluded Tags</div>
            <n-select
              v-model:value="excludedTags"
              multiple
              filterable
              clearable
              tag
              placeholder="Add tags to exclude..."
              :options="excludedTagSuggestionsFormatted"
              :max-tag-count="3"
              class="mobile-filter-select"
              @search="emit('searchExcludedTags', $event)"
            >
              <template #empty>
                <div style="padding: 8px; color: #888">
                  Start typing to search tags...
                </div>
              </template>
            </n-select>
          </div>

          <!-- Advanced Filters -->
          <div class="filter-section">
            <div class="filter-section-label">Collections</div>
            <n-select
              v-model:value="selectedCollections"
              multiple
              clearable
              placeholder="Any collection"
              :options="collectionsOptions"
              :max-tag-count="2"
              class="mobile-filter-select"
              :loading="collectionsLoading"
              :disabled="isSearching"
            >
              <template #empty>
                <div style="padding: 8px; color: #888; font-size: 12px">
                  No collections found
                </div>
              </template>
            </n-select>
          </div>

          <div class="filter-section">
            <div class="filter-section-label">Visual Aspects</div>
            <n-tree-select
              v-model:value="selectedVisualAspects"
              multiple
              clearable
              placeholder="Any aspect"
              :options="treeSelectOptions"
              :max-tag-count="2"
              class="mobile-filter-select"
              :disabled="isSearching"
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

          <div class="filter-section">
            <div class="filter-section-label">Visual Scores</div>
            <n-tree-select
              v-model:value="selectedArtisticScores"
              multiple
              clearable
              placeholder="Any score"
              :options="artisticScoresOptions"
              :max-tag-count="2"
              class="mobile-filter-select"
              :disabled="isSearching"
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

        <!-- Footer Actions -->
        <template #footer>
          <div class="drawer-footer">
            <n-button @click="handleReset" :disabled="!hasAnyFiltersOrSettings">
              <template #icon>
                <n-icon>
                  <RefreshOutline />
                </n-icon>
              </template>
              Reset
            </n-button>
            <n-button type="primary" @click="handleApply">
              <template #icon>
                <n-icon>
                  <CheckmarkOutline />
                </n-icon>
              </template>
              Apply
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import {
  NInput,
  NSelect,
  NButton,
  NIcon,
  NBadge,
  NDrawer,
  NDrawerContent,
  NDivider,
  NTreeSelect,
} from "naive-ui";
import {
  SearchOutline,
  OptionsOutline,
  CloseOutline,
  DocumentOutline,
  PricetagOutline,
  GlobeOutline,
  SparklesOutline,
  RefreshOutline,
  CheckmarkOutline,
} from "@vicons/ionicons5";
import {
  useSearchStore,
  createArtisticScoresTreeOptions,
} from "@/stores/searchStore";
import { useCollectionsStore } from "@/stores/collections";

defineOptions({ name: "SearchMobileLayout" });

// Stores
const searchStore = useSearchStore();
const collectionsStore = useCollectionsStore();

// Props - only tag suggestions come from parent
const props = defineProps({
  // Tag suggestions from composable
  includedTagSuggestionsFormatted: { type: Array, default: () => [] },
  excludedTagSuggestionsFormatted: { type: Array, default: () => [] },
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

// Events - only actions and tag search go to parent
const emit = defineEmits([
  // Tag search (for suggestions from composable)
  "searchIncludedTags",
  "searchExcludedTags",

  // Actions
  "search",
  "clear",
  "reset",
]);

// Local state for filters panel
const showFiltersPanel = ref(false);

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

// Computed for total active filters (for badge)
const totalActiveFilters = computed(() => {
  let count = 0;

  // Count non-default search settings
  if (searchMode.value !== "broad") count++;
  if (withInsights.value) count++;
  if (activeSearchType.value !== "semantic") count++;

  // Count active filters
  count += selectedCollections.value.length;
  count += selectedVisualAspects.value.length;
  count += selectedArtisticScores.value.length;

  // Count excluded tags for tags mode
  if (activeSearchType.value === "tags" && excludedTags.value.length > 0) {
    count += excludedTags.value.length;
  }

  return count;
});

// Computed to check if there's anything to reset
const hasAnyFiltersOrSettings = computed(() => {
  return (
    searchMode.value !== "broad" ||
    withInsights.value ||
    selectedCollections.value.length > 0 ||
    selectedVisualAspects.value.length > 0 ||
    selectedArtisticScores.value.length > 0 ||
    excludedTags.value.length > 0
  );
});

// Methods
function toggleFiltersPanel() {
  showFiltersPanel.value = !showFiltersPanel.value;
}

function handleApply() {
  showFiltersPanel.value = false;
  // Optionally trigger search
  if (hasSearchQuery.value) {
    emit("search");
  }
}

function handleReset() {
  // Reset to defaults via store
  searchStore.setSearchMode("broad");
  searchStore.setWithInsights(false);
  selectedCollections.value = [];
  selectedVisualAspects.value = [];
  selectedArtisticScores.value = [];
  excludedTags.value = [];
  emit("reset");
}
</script>

<style scoped>
.mobile-search-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Fixed Top Bar */
.mobile-top-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--bg-container);
  border-bottom: 1px solid var(--border-color);
  padding: 12px 16px;
}

.mobile-search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mobile-search-input-wrapper {
  flex: 1;
  min-width: 0;
}

.mobile-search-input {
  width: 100%;
}

.mobile-search-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
}

.mobile-filters-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  position: relative;
}

.filters-badge {
  position: absolute;
  top: -4px;
  right: -4px;
}

/* Drawer Styles */
.mobile-filters-drawer :deep(.n-drawer-body-content-wrapper) {
  display: flex;
  flex-direction: column;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.filters-panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

/* Filter Sections */
.filter-section {
  margin-bottom: 20px;
}

.filter-section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

/* Filter Pills */
.filter-pills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 500;
}

.filter-pill:active {
  transform: scale(0.98);
}

.filter-pill.active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

/* Mobile Filter Selects */
.mobile-filter-select {
  width: 100%;
}

/* Drawer Footer */
.drawer-footer {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid var(--border-color);
}

.drawer-footer .n-button {
  flex: 1;
}
</style>
