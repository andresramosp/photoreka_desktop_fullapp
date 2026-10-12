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
            clearable
            placeholder="Describe what you're looking for..."
            class="mobile-search-input"
          >
            <template #prefix>
              <n-icon size="18" color="var(--text-secondary)">
                <SearchOutline />
              </n-icon>
            </template>
          </n-input>
          <span
            v-if="activeSearchType === 'semantic' && semanticWordCount >= 80"
            class="word-counter"
            :class="{ 'at-limit': semanticWordCount >= 100 }"
          >
            {{ semanticWordCount }}/100
          </span>
        </div>

        <!-- Search Button -->
        <n-button
          type="primary"
          :loading="isSearching"
          :disabled="!hasSearchQuery || isSemanticOverLimit"
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

      <!-- Search Mode Pills (directly visible) -->
      <div v-if="!hasCredits" class="basic-search-hint">
        {{ BASIC_SEARCH_NOTICE.title }} · no credits
      </div>
      <div class="mobile-search-mode-row">
        <n-button
          :type="searchMode === 'broad' ? 'primary' : 'default'"
          @click="!isSearching && updateSearchMode('broad')"
          :disabled="isSearching"
          secondary
          class="mode-pill-button"
        >
          <template #icon>
            <n-icon size="16">
              <GlobeOutline />
            </n-icon>
          </template>
          Broad
        </n-button>
        <n-button
          :type="searchMode === 'precise' ? 'primary' : 'default'"
          @click="!isSearching && canUsePrecise && updateSearchMode('precise')"
          :disabled="isSearching || !canUsePrecise"
          secondary
          class="mode-pill-button"
        >
          <template #icon>
            <n-icon size="16">
              <LocateOutline />
            </n-icon>
          </template>
          Precise
        </n-button>
        <!-- Adaptive mode temporarily hidden
        <n-button
          :type="searchMode === 'adaptive' ? 'primary' : 'default'"
          @click="!isSearching && updateSearchMode('adaptive')"
          :disabled="isSearching"
          secondary
          class="mode-pill-button"
        >
          <template #icon>
            <n-icon size="16">
              <SparklesOutline />
            </n-icon>
          </template>
          Adaptive
        </n-button>
        -->
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
              <n-button
                :type="activeSearchType === 'semantic' ? 'primary' : 'default'"
                @click="!isSearching && updateSearchType('semantic')"
                :disabled="isSearching"
                secondary
                class="mode-pill-button"
              >
                <template #icon>
                  <n-icon size="16">
                    <DocumentOutline />
                  </n-icon>
                </template>
                Natural Language
              </n-button>
              <n-button
                :type="activeSearchType === 'tags' ? 'primary' : 'default'"
                @click="!isSearching && updateSearchType('tags')"
                :disabled="isSearching"
                secondary
                class="mode-pill-button"
              >
                <template #icon>
                  <n-icon size="16">
                    <PricetagOutline />
                  </n-icon>
                </template>
                Tags
              </n-button>
            </div>
          </div>

          <!-- Insights Toggle temporarily hidden
          <div class="filter-section">
            <div class="filter-section-label">Insights</div>
            <div class="filter-pills-row">
              <n-button
                :type="withInsights ? 'primary' : 'default'"
                @click="!isSearching && updateWithInsights(!withInsights)"
                :disabled="isSearching"
                secondary
                class="mode-pill-button"
              >
                <template #icon>
                  <n-icon size="16">
                    <SparklesOutline />
                  </n-icon>
                </template>
                {{ withInsights ? "Enabled" : "Disabled" }}
              </n-button>
            </div>
          </div>
          -->

          <!-- Divider -->
          <n-divider />

          <!-- Additional Search Inputs (for tags mode) -->
          <div v-if="activeSearchType === 'tags'" class="filter-section">
            <div class="filter-section-label">Included Tags</div>
            <n-select
              v-model:value="includedTags"
              v-model:show="includedTagsDropdownShow"
              multiple
              filterable
              clearable
              remote
              placeholder="Add tags to include..."
              :options="includedTagSuggestionsFormatted"
              :clear-filter-after-select="true"
              :max-tag-count="2"
              :ignore-composition="false"
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

          <div v-if="activeSearchType === 'tags'" class="filter-section">
            <div class="filter-section-label">Excluded Tags</div>
            <n-select
              v-model:value="excludedTags"
              v-model:show="excludedTagsDropdownShow"
              multiple
              filterable
              clearable
              remote
              placeholder="Add tags to exclude..."
              :options="excludedTagSuggestionsFormatted"
              :max-tag-count="3"
              :ignore-composition="false"
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
              v-model:show="collectionsDropdownShow"
              multiple
              clearable
              placeholder="Any collection"
              :options="collectionsOptions"
              :max-tag-count="2"
              class="mobile-filter-select"
              :loading="collectionsLoading"
              :disabled="isSearching"
              :filterable="false"
              @update:value="
                () => {
                  collectionsDropdownShow.value = false;
                }
              "
            >
              <template #empty>
                <div style="padding: 8px; color: #888; font-size: 12px">
                  No collections found
                </div>
              </template>
            </n-select>
          </div>

          <div class="filter-section">
            <VisualFiltersPanel
              :visual-aspects="localVisualFilters"
              :score-filters="selectedArtisticScores"
              :disabled="isSearching"
              :show-section-labels="false"
              @update:visual-aspects="handleVisualFiltersChange"
              @update:score-filters="handleScoreFiltersChange"
            />
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
import { ref, computed, watch } from "vue";
import {
  NInput,
  NSelect,
  NButton,
  NIcon,
  NBadge,
  NDrawer,
  NDrawerContent,
  NDivider,
} from "naive-ui";
import {
  SearchOutline,
  OptionsOutline,
  CloseOutline,
  DocumentOutline,
  PricetagOutline,
  GlobeOutline,
  SparklesOutline,
  LocateOutline,
  RefreshOutline,
  CheckmarkOutline,
} from "@vicons/ionicons5";
import { useSearchStore, visualAspectsOptions } from "@/stores/searchStore";
import { useCollectionsStore } from "@/stores/collections";
import { BASIC_SEARCH_NOTICE, useSearchCredits } from "@/desktop/useSearchCredits";
import VisualFiltersPanel from "@/components/photos-grid/VisualFiltersPanel.vue";

defineOptions({ name: "SearchPanelMobileLayout" });

// Stores
const searchStore = useSearchStore();
const { hasCredits, canUsePrecise } = useSearchCredits();
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
  get: () => searchStore.selectedVisualAspects,
  set: (value) => searchStore.setSelectedVisualAspects(value),
});

const selectedArtisticScores = computed({
  get: () => searchStore.selectedArtisticScores,
  set: (value) => searchStore.setSelectedArtisticScores(value),
});

// Local visual filters state (keyed by group)
const localVisualFilters = ref({});
visualAspectsOptions.forEach((group) => {
  localVisualFilters.value[group.key] = [];
});

function handleVisualFiltersChange(newFilters) {
  localVisualFilters.value = newFilters;
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
const includedTagsDropdownShow = ref(false);
const excludedTagsDropdownShow = ref(false);
const collectionsDropdownShow = ref(false);

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

  // Count only actual filters, not search type or mode
  if (withInsights.value) count++;

  // Count active filters
  count += selectedCollections.value.length;
  count += selectedVisualAspects.value.length;
  count += Object.keys(searchStore.selectedArtisticScores).length;

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
    Object.keys(searchStore.selectedArtisticScores).length > 0 ||
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
  searchStore.setSelectedArtisticScores({});
  // Reset local visual filters
  visualAspectsOptions.forEach((group) => {
    localVisualFilters.value[group.key] = [];
  });
  excludedTags.value = [];
  emit("reset");
}

// Watch for tag changes and close dropdowns automatically
watch(
  () => includedTags.value.length,
  () => {
    includedTagsDropdownShow.value = false;
  },
);

watch(
  () => excludedTags.value.length,
  () => {
    excludedTagsDropdownShow.value = false;
  },
);
</script>

<style scoped>

.basic-search-hint {
  align-self: center;
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
}
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
}

.mobile-search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mobile-search-mode-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: space-between;
  flex-wrap: wrap;
}

.mode-pill-button {
  flex: 1;
  min-width: 0;
  justify-content: center;
  font-size: 12px;
}

.mobile-search-input-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.mobile-search-input {
  width: 100%;
}

.word-counter {
  align-self: flex-end;
  font-size: 10px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 2px;
  transition: color 0.2s;
}

.word-counter.at-limit {
  color: #ef4444;
  font-weight: 600;
}

.mobile-search-button {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
}

.mobile-filters-button {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
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
