<template>
  <div class="global-search" ref="searchContainerRef">
    <n-input
      v-model:value="searchQuery"
      placeholder="Search photos by filename, collections, series, tools, help..."
      class="search-input"
      size="medium"
      clearable
      round
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
      ref="inputRef"
    >
      <template #prefix>
        <n-icon :color="'var(--icon-tertiary)'">
          <SearchIcon />
        </n-icon>
      </template>
      <template #suffix>
        <span
          v-if="searchQuery && searchQuery.length >= 2"
          class="shortcut-hint"
        >
          <kbd>↵</kbd> to select
        </span>
      </template>
    </n-input>

    <!-- Results dropdown -->
    <Transition name="dropdown">
      <div
        v-if="showDropdown && searchQuery.length >= 2"
        class="search-dropdown"
        ref="dropdownRef"
        :style="{ '--dropdown-top': dropdownTopPosition }"
        @mousedown.prevent
        @touchstart.stop
      >
        <!-- Loading state -->
        <div v-if="isSearching" class="search-loading">
          <n-spin size="small" />
          <span>Searching...</span>
        </div>

        <!-- No results -->
        <div
          v-else-if="!hasResults && searchQuery.length >= 2"
          class="no-results"
        >
          <n-icon size="24" :color="'var(--text-tertiary)'">
            <SearchIcon />
          </n-icon>
          <span>No results found for "{{ searchQuery }}"</span>
        </div>

        <!-- Results grouped by type -->
        <div v-else class="results-container">
          <!-- Tools Section -->
          <div v-if="searchResults.tools.length > 0" class="results-section">
            <div class="section-header">
              <n-icon size="14">
                <AppsOutline />
              </n-icon>
              <span>Tools</span>
            </div>
            <div class="section-items">
              <div
                v-for="(tool, index) in searchResults.tools"
                :key="`tool-${tool.id}`"
                class="result-item tool-item"
                :class="{ active: isActiveItem('tool', tool.id) }"
                @click="handleSelectTool(tool)"
                @touchend.prevent="handleSelectTool(tool)"
                @mouseenter="setActiveItem('tool', tool.id)"
              >
                <div class="item-icon tool-icon">
                  <n-icon size="18">
                    <component :is="getToolIcon(tool.icon)" />
                  </n-icon>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ tool.name }}</div>
                  <div class="item-description">{{ tool.description }}</div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>

          <!-- Canvases Section -->
          <div v-if="searchResults.canvases.length > 0" class="results-section">
            <div class="section-header">
              <n-icon size="14">
                <WorkspaceIcon />
              </n-icon>
              <span>Canvases</span>
            </div>
            <div class="section-items">
              <div
                v-for="canvas in searchResults.canvases"
                :key="`canvas-${canvas.id}`"
                class="result-item canvas-item"
                :class="{ active: isActiveItem('canvas', canvas.id) }"
                @click="handleSelectCanvas(canvas)"
                @touchend.prevent="handleSelectCanvas(canvas)"
                @mouseenter="setActiveItem('canvas', canvas.id)"
              >
                <div class="item-icon canvas-icon">
                  <n-icon size="18">
                    <WorkspaceIcon />
                  </n-icon>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ canvas.name }}</div>
                  <div class="item-description">
                    {{ canvas.photoCount }} photos
                  </div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>

          <!-- Collections Section -->
          <div
            v-if="searchResults.collections.length > 0"
            class="results-section"
          >
            <div class="section-header">
              <n-icon size="14">
                <GridOutline />
              </n-icon>
              <span>Collections</span>
            </div>
            <div class="section-items">
              <div
                v-for="collection in searchResults.collections"
                :key="`collection-${collection.id}`"
                class="result-item collection-item"
                :class="{ active: isActiveItem('collection', collection.id) }"
                @click="handleSelectCollection(collection)"
                @touchend.prevent="handleSelectCollection(collection)"
                @mouseenter="setActiveItem('collection', collection.id)"
              >
                <div class="item-thumbnail">
                  <img
                    v-if="collection.coverUrl"
                    :src="collection.coverUrl"
                    :alt="collection.name"
                  />
                  <div v-else class="placeholder-thumbnail">
                    <n-icon size="16">
                      <GridOutline />
                    </n-icon>
                  </div>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ collection.name }}</div>
                  <div class="item-meta">
                    {{ collection.photoCount }} photos
                  </div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>

          <!-- Series Section -->
          <div v-if="searchResults.series.length > 0" class="results-section">
            <div class="section-header">
              <n-icon size="14">
                <ListOutline />
              </n-icon>
              <span>Series</span>
            </div>
            <div class="section-items">
              <div
                v-for="series in searchResults.series"
                :key="`series-${series.id}`"
                class="result-item series-item"
                :class="{ active: isActiveItem('series', series.id) }"
                @click="handleSelectSeries(series)"
                @touchend.prevent="handleSelectSeries(series)"
                @mouseenter="setActiveItem('series', series.id)"
              >
                <div class="item-thumbnail">
                  <img
                    v-if="series.coverUrl"
                    :src="series.coverUrl"
                    :alt="series.name"
                  />
                  <div v-else class="placeholder-thumbnail">
                    <n-icon size="16">
                      <ListOutline />
                    </n-icon>
                  </div>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ series.name }}</div>
                  <div class="item-meta">{{ series.photoCount }} photos</div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>

          <!-- Portfolios Section -->
          <div
            v-if="searchResults.portfolios.length > 0"
            class="results-section"
          >
            <div class="section-header">
              <n-icon size="14">
                <PortfolioIcon />
              </n-icon>
              <span>Portfolios</span>
            </div>
            <div class="section-items">
              <div
                v-for="portfolio in searchResults.portfolios"
                :key="`portfolio-${portfolio.id}`"
                class="result-item portfolio-item"
                :class="{ active: isActiveItem('portfolio', portfolio.id) }"
                @click="handleSelectPortfolio(portfolio)"
                @touchend.prevent="handleSelectPortfolio(portfolio)"
                @mouseenter="setActiveItem('portfolio', portfolio.id)"
              >
                <div class="item-icon portfolio-icon">
                  <n-icon size="18">
                    <PortfolioIcon />
                  </n-icon>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ portfolio.name }}</div>
                  <div class="item-description">
                    {{ portfolio.photoCount }} photos
                  </div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>

          <!-- Photos Section -->
          <div v-if="searchResults.photos.length > 0" class="results-section">
            <div class="section-header">
              <n-icon size="14">
                <ImageOutline />
              </n-icon>
              <span>Photos</span>
            </div>
            <div class="section-items">
              <div
                v-for="photo in searchResults.photos"
                :key="`photo-${photo.id}`"
                class="result-item photo-item"
                :class="{ active: isActiveItem('photo', photo.id) }"
                @click="handleSelectPhoto(photo)"
                @touchend.prevent="handleSelectPhoto(photo)"
                @mouseenter="setActiveItem('photo', photo.id)"
              >
                <div class="item-thumbnail">
                  <img
                    v-if="photo.thumbnailUrl"
                    :src="photo.thumbnailUrl"
                    :alt="photo.name"
                  />
                  <div v-else class="placeholder-thumbnail">
                    <n-icon size="16">
                      <ImageOutline />
                    </n-icon>
                  </div>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ photo.name }}</div>
                  <div class="item-meta">
                    <template v-if="photo.matchedOn === 'tag'">
                      <n-tag size="tiny" type="info">{{
                        photo.matchedTag
                      }}</n-tag>
                    </template>
                    <template v-else>
                      <span class="match-type">Name match</span>
                    </template>
                  </div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>

          <!-- Help Section -->
          <div v-if="searchResults.help.length > 0" class="results-section">
            <div class="section-header">
              <n-icon size="14">
                <HelpCircleOutline />
              </n-icon>
              <span>Help Topics</span>
            </div>
            <div class="section-items">
              <div
                v-for="helpItem in searchResults.help"
                :key="`help-${helpItem.id}`"
                class="result-item help-item"
                :class="{ active: isActiveItem('help', helpItem.id) }"
                @click="handleSelectHelp(helpItem)"
                @touchend.prevent="handleSelectHelp(helpItem)"
                @mouseenter="setActiveItem('help', helpItem.id)"
              >
                <div class="item-icon help-icon">
                  <n-icon size="18">
                    <HelpCircleOutline />
                  </n-icon>
                </div>
                <div class="item-content">
                  <div class="item-name">{{ helpItem.subtopicTitle }}</div>
                  <div class="item-description">{{ helpItem.topicTitle }}</div>
                </div>
                <n-icon size="14" class="item-arrow">
                  <ChevronForward />
                </n-icon>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer hint -->
        <div v-if="hasResults" class="dropdown-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    </Transition>

    <!-- PhotoInfoDialog for showing photo details -->
    <PhotoInfoDialog
      v-model="showPhotoDialog"
      :selectedPhoto="selectedPhoto"
      @change-photo="selectedPhoto = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { NIcon, NSpin, NTag } from "naive-ui";
import {
  SearchOutline as SearchIcon,
  AppsOutline,
  GridOutline,
  ListOutline,
  ImageOutline,
  ChevronForward,
  CubeOutline,
  FlaskOutline,
  SquareOutline,
  LayersOutline,
  CloudUploadOutline,
  SettingsOutline,
  HelpCircleOutline,
  BriefcaseOutline as PortfolioIcon,
} from "@vicons/ionicons5";
import { Workspace as WorkspaceIcon } from "@vicons/carbon";
import {
  useGlobalSearch,
  type SearchResult,
  type SearchResultPhoto,
} from "@/composables/useGlobalSearch";
import { usePhotosStore } from "@/stores/photos.js";
import { useCanvasStore } from "@/stores/canvas.js";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";

const router = useRouter();
const photosStore = usePhotosStore();
const canvasStore = useCanvasStore();

// Emit events to parent
const emit = defineEmits(["search-focus", "search-blur"]);

// Search composable
const {
  searchQuery,
  searchResults,
  hasResults,
  flatResults,
  isSearching,
  clearSearch,
  ensureDataLoaded,
} = useGlobalSearch();

// UI state
const showDropdown = ref(false);
const activeItemKey = ref<string | null>(null);
const searchContainerRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLElement | null>(null);
const inputRef = ref<any>(null);
const isInputFocused = ref(false);
const dropdownTopPosition = ref<string>("0px");

// Photo dialog state
const showPhotoDialog = ref(false);
const selectedPhoto = ref<any>(null);

// Icon mapping for tools
const iconComponents: Record<string, any> = {
  SearchOutline: SearchIcon,
  Workspace: WorkspaceIcon,
  CubeOutline: CubeOutline,
  FlaskOutline: FlaskOutline,
  SquareOutline: SquareOutline,
  GridOutline: GridOutline,
  ListOutline: ListOutline,
  LayersOutline: LayersOutline,
  CloudUploadOutline: CloudUploadOutline,
  SettingsOutline: SettingsOutline,
  HelpCircleOutline: HelpCircleOutline,
};

const getToolIcon = (iconName: string) => {
  return iconComponents[iconName] || SearchIcon;
};

// Active item helpers
const getItemKey = (type: string, id: string | number) => `${type}-${id}`;

const isActiveItem = (type: string, id: string | number) => {
  return activeItemKey.value === getItemKey(type, id);
};

const setActiveItem = (type: string, id: string | number) => {
  activeItemKey.value = getItemKey(type, id);
};

// Get active item index in flat list
const getActiveIndex = () => {
  if (!activeItemKey.value) return -1;
  return flatResults.value.findIndex(
    (item) => getItemKey(item.type, item.id) === activeItemKey.value,
  );
};

// Set active item by index
const setActiveByIndex = (index: number) => {
  const item = flatResults.value[index];
  if (item) {
    activeItemKey.value = getItemKey(item.type, item.id);
    scrollToActiveItem();
  }
};

// Scroll active item into view
const scrollToActiveItem = () => {
  nextTick(() => {
    const activeElement = dropdownRef.value?.querySelector(
      ".result-item.active",
    );
    if (activeElement) {
      activeElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
};

// Handlers
const handleFocus = () => {
  isInputFocused.value = true;
  showDropdown.value = true;

  // Calculate position for mobile fixed dropdown
  if (searchContainerRef.value) {
    const rect = searchContainerRef.value.getBoundingClientRect();
    const topValue = rect.bottom + 8;
    dropdownTopPosition.value = `${topValue}px`;
    console.log("[GlobalSearch] Dropdown position calculated:", topValue, "px");
    console.log(
      "[GlobalSearch] showDropdown:",
      showDropdown.value,
      "searchQuery:",
      searchQuery.value,
    );
  }

  ensureDataLoaded();
  emit("search-focus");
};

const handleBlur = () => {
  isInputFocused.value = false;

  // On mobile, clear search when losing focus
  if (window.innerWidth < 768) {
    clearSearch();
  }

  // Don't close immediately - let clicks on dropdown work first
  // handleClickOutside will manage closing when clicking outside
};

const handleKeydown = (event: KeyboardEvent) => {
  if (!showDropdown.value || !hasResults.value) return;

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      const nextIndex = getActiveIndex() + 1;
      if (nextIndex < flatResults.value.length) {
        setActiveByIndex(nextIndex);
      } else {
        setActiveByIndex(0);
      }
      break;

    case "ArrowUp":
      event.preventDefault();
      const prevIndex = getActiveIndex() - 1;
      if (prevIndex >= 0) {
        setActiveByIndex(prevIndex);
      } else {
        setActiveByIndex(flatResults.value.length - 1);
      }
      break;

    case "Enter":
      event.preventDefault();
      if (activeItemKey.value) {
        const activeItem = flatResults.value[getActiveIndex()];
        if (activeItem) {
          handleSelectItem(activeItem);
        }
      } else if (flatResults.value.length > 0) {
        // Select first item if none active
        handleSelectItem(flatResults.value[0]);
      }
      break;

    case "Escape":
      event.preventDefault();
      showDropdown.value = false;
      activeItemKey.value = null;
      inputRef.value?.blur();
      break;
  }
};

// Selection handlers
const handleSelectItem = (item: SearchResult) => {
  switch (item.type) {
    case "tool":
      handleSelectTool(item);
      break;
    case "help":
      handleSelectHelp(item);
      break;
    case "collection":
      handleSelectCollection(item);
      break;
    case "series":
      handleSelectSeries(item);
      break;
    case "photo":
      handleSelectPhoto(item);
      break;
    case "canvas":
      handleSelectCanvas(item);
      break;
    case "portfolio":
      handleSelectPortfolio(item);
      break;
  }
};

const handleSelectTool = (tool: any) => {
  showDropdown.value = false;
  clearSearch();
  router.push(tool.route);
};

const handleSelectHelp = (helpItem: any) => {
  showDropdown.value = false;
  clearSearch();
  router.push(helpItem.route);
};

const handleSelectCollection = (collection: any) => {
  showDropdown.value = false;
  clearSearch();
  router.push({ name: "collection-detail", params: { id: collection.id } });
};

const handleSelectSeries = (series: any) => {
  showDropdown.value = false;
  clearSearch();
  router.push({ name: "series-detail", params: { id: series.id } });
};

const handleSelectCanvas = (canvas: any) => {
  showDropdown.value = false;
  clearSearch();
  if (canvas.id !== "local") {
    canvasStore.pendingCanvasId = canvas.id;
  }
  router.push({ name: "canvas" });
};

const handleSelectPortfolio = (portfolio: any) => {
  showDropdown.value = false;
  clearSearch();
  router.push({ name: "portfolio-detail", params: { id: portfolio.id } });
};

const handleSelectPhoto = async (photo: SearchResultPhoto) => {
  showDropdown.value = false;

  // Fetch full photo data from API
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    if (fullPhoto) {
      selectedPhoto.value = fullPhoto;
      showPhotoDialog.value = true;
    }
  } catch (error) {
    console.error("Error fetching photo details:", error);
  }

  clearSearch();
};

// Emit blur when search is cleared only if not focused
watch(searchQuery, (newValue) => {
  if ((!newValue || newValue.trim() === "") && !isInputFocused.value) {
    emit("search-blur");
  }
});

// Reset active item when results change
watch(flatResults, () => {
  if (flatResults.value.length > 0 && !activeItemKey.value) {
    setActiveByIndex(0);
  } else if (flatResults.value.length === 0) {
    activeItemKey.value = null;
  }
});

// Debug dropdown visibility on mobile
watch([showDropdown, searchQuery], ([show, query]) => {
  if (window.innerWidth < 768) {
    console.log(
      "[GlobalSearch] Mobile - showDropdown:",
      show,
      "query length:",
      query?.length || 0,
      "hasResults:",
      hasResults.value,
    );
    if (show && query && query.length >= 2) {
      nextTick(() => {
        if (dropdownRef.value) {
          const rect = dropdownRef.value.getBoundingClientRect();
          console.log(
            "[GlobalSearch] Dropdown actual position:",
            rect.top,
            "height:",
            rect.height,
            "display:",
            window.getComputedStyle(dropdownRef.value).display,
          );
        }
      });
    }
  }
});

// Click outside handler
const handleClickOutside = (event: MouseEvent | TouchEvent) => {
  const target = event.target as Node;
  const container = searchContainerRef.value;
  const dropdown = dropdownRef.value;

  // Only close if clicking outside both the search container and dropdown
  if (
    container &&
    !container.contains(target) &&
    dropdown &&
    !dropdown.contains(target)
  ) {
    showDropdown.value = false;
    activeItemKey.value = null;
    isInputFocused.value = false;
    emit("search-blur");
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("touchstart", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("touchstart", handleClickOutside);
});
</script>

<style scoped>
.global-search {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 800px;
}

.search-input {
  width: 100%;
}

.shortcut-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.shortcut-hint kbd {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 10px;
  font-family: inherit;
}

/* Dropdown */
.search-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: 480px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 5000;
  /* Mobile-specific fixes */
  -webkit-overflow-scrolling: touch;
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}

/* Transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
}

/* Loading & no results */
.search-loading,
.no-results {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-2xl);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* Results container */
.results-container {
  overflow-y: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* Section */
.results-section {
  padding: var(--spacing-sm) 0;
}

.results-section:not(:last-child) {
  border-bottom: 1px solid var(--border-color-light);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-items {
  display: flex;
  flex-direction: column;
}

/* Result item */
.result-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  transition: background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.result-item:hover,
.result-item.active {
  background: var(--bg-hover);
}

.result-item.active {
  background: var(--primary-color-opacity-10);
}

/* Item thumbnail */
.item-thumbnail {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-elevated);
}

.item-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder-thumbnail {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

/* Tool icon */
.item-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tool-icon {
  background: var(--primary-color-opacity-10);
  color: var(--primary-color);
}

.help-icon {
  background: var(--info-color-opacity-10);
  color: var(--info-color);
}

.canvas-icon {
  background: var(--primary-color-opacity-10);
  color: var(--primary-color);
}

.portfolio-icon {
  background: var(--warning-color-opacity-10);
  color: var(--warning-color);
}

/* Item content */
.item-content {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-description {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.match-type {
  font-style: italic;
}

/* Arrow icon */
.item-arrow {
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.result-item:hover .item-arrow,
.result-item.active .item-arrow {
  opacity: 1;
}

/* Footer */
.dropdown-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xl);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-top: 1px solid var(--border-color-light);
  background: var(--bg-elevated);
  font-size: 11px;
  color: var(--text-tertiary);
}

.dropdown-footer span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dropdown-footer kbd {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: inherit;
  min-width: 18px;
  text-align: center;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .global-search {
    min-width: 150px;
    max-width: none;
  }

  .search-dropdown {
    max-height: 60vh;
    position: fixed;
    top: var(--dropdown-top, 70px);
    left: var(--spacing-md, 12px);
    right: var(--spacing-md, 12px);
    width: auto;
    z-index: 10000;
    /* Android specific fixes */
    transform: translate3d(0, 0, 0);
    -webkit-transform: translate3d(0, 0, 0);
    visibility: visible !important;
    opacity: 1 !important;
    display: flex !important;
    pointer-events: auto;
  }

  .shortcut-hint {
    display: none;
  }

  .dropdown-footer {
    display: none;
  }

  .item-thumbnail {
    width: 36px;
    height: 36px;
  }

  .item-icon {
    width: 36px;
    height: 36px;
  }

  /* Increase touch targets on mobile */
  .result-item {
    padding: var(--spacing-md) var(--spacing-lg);
    min-height: 52px;
  }
}
</style>
