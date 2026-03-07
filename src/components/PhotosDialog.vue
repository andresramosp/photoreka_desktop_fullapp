<template>
  <n-modal
    v-model:show="dialog"
    preset="dialog"
    :style="modalStyle"
    class="photos-dialog-modal"
    :on-mask-click="close"
    :closable="false"
    :bordered="false"
  >
    <template #header>
      <div class="dialog-header">
        <h2 class="dialog-title">
          {{ title || (isTrash ? "Restore Photos" : "Add Photos to Canvas") }}
        </h2>
      </div>
    </template>

    <div class="dialog-content">
      <!-- Suggested Photos Mode (no search, no tabs) -->
      <div
        v-if="suggestedPhotos !== null || loadingSuggestions"
        class="suggested-container"
      >
        <!-- Loading state -->
        <div v-if="loadingSuggestions" class="suggestions-loading">
          <n-spin size="large" />
          <p class="suggestions-loading-text">Looking for similar photos...</p>
        </div>

        <template v-else>
          <div class="stats-bar">
            <div class="stats-section">
              <div class="stats-info">
                <span class="stats-text">
                  {{ processedPhotos.length }}
                  {{
                    processedPhotos.length === 1 ? "suggestion" : "suggestions"
                  }}
                  <span v-if="selectedIds.length > 0" class="selected-count">
                    &bull; {{ selectedIds.length }} selected
                  </span>
                </span>
              </div>
              <div class="stats-actions">
                <n-button
                  v-if="selectedIds.length > 0"
                  text
                  type="primary"
                  @click="selectAll"
                >
                  Select All
                </n-button>
                <n-button
                  v-if="selectedIds.length > 0"
                  text
                  type="warning"
                  @click="clearSelection"
                >
                  Clear Selection
                </n-button>
              </div>
            </div>
          </div>

          <div
            v-if="processedPhotos.length > 0"
            class="photos-grid photo-grid-base"
            :class="`grid-cols-${6}`"
          >
            <PhotoCard
              v-for="photo in processedPhotos"
              :key="photo.id"
              :photo="photo"
              :selected="selectedIds.includes(photo.id)"
              mode="default"
              @select="toggleSelection"
              @info="showPhotoInfo"
              :show-stars="false"
              :show-tags="false"
              :show-info-button="false"
              :require-long-press="false"
            />
          </div>

          <div v-else class="empty-state">
            <div class="empty-state-content">
              <n-icon size="64" class="empty-state-icon">
                <ImageIcon />
              </n-icon>
              <h3 class="empty-state-title">No suggestions found</h3>
              <p class="empty-state-description">
                Could not find similar photos to suggest for this collection.
              </p>
            </div>
          </div>
        </template>
      </div>

      <!-- Tabs (desktop only) -->
      <div v-else-if="!isTrash && !isMobile" class="tabs-container">
        <n-tabs v-model:value="activeTab" type="line" animated>
          <n-tab-pane name="catalog" tab="From Workspace">
            <!-- Search and Stats Bar -->
            <div class="stats-bar">
              <div v-if="displaySearch" class="search-section">
                <n-input
                  v-model:value="searchQuery"
                  placeholder="Search photos..."
                  size="small"
                  :clearable="!isSearching"
                  class="text-search"
                  @input="onSearchChange"
                  @clear="clearSearch"
                >
                  <template #prefix>
                    <n-icon size="16">
                      <svg viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                        />
                      </svg>
                    </n-icon>
                  </template>
                  <template #suffix>
                    <n-spin
                      size="small"
                      class="spinner-search spinner-medium spinner-centered"
                      v-if="isSearching"
                    />
                  </template>
                </n-input>
              </div>
              <div class="stats-section">
                <div class="stats-info">
                  <span class="stats-text">
                    {{ processedPhotos.length }}
                    {{ processedPhotos.length === 1 ? "photo" : "photos" }}
                    available
                    <span v-if="selectedIds.length > 0" class="selected-count">
                      • {{ selectedIds.length }} selected
                    </span>
                  </span>
                </div>
                <div class="stats-actions">
                  <n-button
                    v-if="selectedIds.length > 0"
                    text
                    type="primary"
                    @click="selectAll"
                  >
                    Select All
                  </n-button>
                  <n-button
                    v-if="selectedIds.length > 0"
                    text
                    type="warning"
                    @click="clearSelection"
                  >
                    Clear Selection
                  </n-button>
                </div>
              </div>
            </div>

            <!-- Photos Grid -->
            <div
              v-if="processedPhotos.length > 0"
              class="photos-grid photo-grid-base"
              :class="`grid-cols-${6}`"
            >
              <PhotoCard
                v-for="photo in processedPhotos"
                :key="photo.id"
                :photo="photo"
                :selected="selectedIds.includes(photo.id)"
                mode="default"
                @select="toggleSelection"
                @info="showPhotoInfo"
                :show-stars="false"
                :show-tags="false"
                :show-info-button="false"
                :require-long-press="false"
              />
            </div>

            <!-- Empty State -->
            <div v-else class="empty-state">
              <div class="empty-state-content">
                <n-icon size="64" class="empty-state-icon">
                  <ImageIcon />
                </n-icon>
                <h3 class="empty-state-title">No photos available</h3>
                <p class="empty-state-description">
                  You don't have any photos here. Import them to Lightbox and
                  click Analyze Photos to start building your Workspace.
                </p>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane v-if="displayLightboxTab" name="sync" tab="Upload Files">
            <PhotosLightboxTab
              :selected-ids="syncSelectedIds"
              @update:selected-ids="syncSelectedIds = $event"
              @photos-added="handlePhotosAdded"
            />
          </n-tab-pane>
        </n-tabs>
      </div>

      <!-- Mobile catalog (no tabs) -->
      <div v-else-if="!isTrash" class="mobile-catalog-container">
        <div class="stats-bar">
          <div v-if="displaySearch" class="search-section">
            <n-input
              v-model:value="searchQuery"
              placeholder="Search photos..."
              size="small"
              :clearable="!isSearching"
              class="text-search"
              @input="onSearchChange"
              @clear="clearSearch"
            >
              <template #prefix>
                <n-icon size="16">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                    />
                  </svg>
                </n-icon>
              </template>
              <template #suffix>
                <n-spin
                  size="small"
                  class="spinner-search spinner-medium spinner-centered"
                  v-if="isSearching"
                />
              </template>
            </n-input>
          </div>
          <div class="stats-section">
            <div class="stats-info">
              <span class="stats-text">
                {{ processedPhotos.length }}
                {{ processedPhotos.length === 1 ? "photo" : "photos" }}
                available
                <span v-if="selectedIds.length > 0" class="selected-count">
                  • {{ selectedIds.length }} selected
                </span>
              </span>
            </div>
            <div class="stats-actions">
              <n-button
                v-if="selectedIds.length > 0"
                text
                type="primary"
                @click="selectAll"
              >
                Select All
              </n-button>
              <n-button
                v-if="selectedIds.length > 0"
                text
                type="warning"
                @click="clearSelection"
              >
                Clear Selection
              </n-button>
            </div>
          </div>
        </div>

        <div
          v-if="processedPhotos.length > 0"
          class="photos-grid photo-grid-base"
          :class="`grid-cols-${6}`"
        >
          <PhotoCard
            v-for="photo in processedPhotos"
            :key="photo.id"
            :photo="photo"
            :selected="selectedIds.includes(photo.id)"
            mode="default"
            @select="toggleSelection"
            @info="showPhotoInfo"
            :show-stars="false"
            :show-tags="false"
            :show-info-button="false"
            :require-long-press="false"
          />
        </div>

        <div v-else class="empty-state">
          <div class="empty-state-content">
            <n-icon size="64" class="empty-state-icon">
              <ImageIcon />
            </n-icon>
            <h3 class="empty-state-title">No photos available</h3>
            <p class="empty-state-description">
              You don't have any photos here. Import them to Lightbox and click
              Analyze Photos to start building your Workspace.
            </p>
          </div>
        </div>
      </div>

      <!-- Trash mode (no tabs) -->
      <div v-else class="trash-container">
        <!-- Search and Stats Bar -->
        <div class="stats-bar">
          <div class="search-section">
            <n-input
              v-model:value="searchQuery"
              placeholder="Search photos..."
              size="small"
              :clearable="!isSearching"
              class="text-search"
              @input="onSearchChange"
              @clear="clearSearch"
            >
              <template #prefix>
                <n-icon size="16">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                    />
                  </svg>
                </n-icon>
              </template>
              <template #suffix>
                <n-spin
                  size="small"
                  class="spinner-search spinner-medium spinner-centered"
                  v-if="isSearching"
                />
              </template>
            </n-input>
          </div>
          <div class="stats-section">
            <div class="stats-info">
              <span class="stats-text">
                {{ trashPhotos.length }}
                {{ trashPhotos.length === 1 ? "photo" : "photos" }}
                available
                <span v-if="selectedIds.length > 0" class="selected-count">
                  • {{ selectedIds.length }} selected
                </span>
              </span>
            </div>
            <div class="stats-actions">
              <n-button
                v-if="selectedIds.length > 0"
                text
                type="primary"
                @click="selectAll"
              >
                Select All
              </n-button>
              <n-button
                v-if="selectedIds.length > 0"
                text
                type="warning"
                @click="clearSelection"
              >
                Clear Selection
              </n-button>
            </div>
          </div>
        </div>

        <!-- Photos Grid -->
        <div
          v-if="trashPhotos.length > 0"
          class="photos-grid photo-grid-base"
          :class="`grid-cols-${6}`"
        >
          <PhotoCard
            v-for="photo in trashPhotos"
            :key="photo.id"
            :photo="photo"
            :selected="selectedIds.includes(photo.id)"
            mode="default"
            @select="toggleSelection"
            @info="showPhotoInfo"
            :show-info-button="false"
            :require-long-press="false"
          />
        </div>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <div class="empty-state-content">
            <n-icon size="64" class="empty-state-icon">
              <DeleteIcon />
            </n-icon>
            <h3 class="empty-state-title">No deleted photos</h3>
            <p class="empty-state-description">
              All photos are currently on the canvas or in your collection.
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #action>
      <div class="dialog-actions">
        <n-button @click="close">Cancel</n-button>
        <n-button
          type="primary"
          :disabled="totalSelectedCount === 0"
          @click="confirmSelection"
          :loading="isSubmitting"
        >
          <template #icon>
            <n-icon>
              <ArrowUndoIcon v-if="isTrash" />
              <AddIcon v-else />
            </n-icon>
          </template>
          {{
            isTrash
              ? isMobile
                ? `Restore (${selectedIds.length})`
                : `Restore ${selectedIds.length} ${
                    selectedIds.length === 1 ? "Photo" : "Photos"
                  }`
              : props.singleSelection
                ? isMobile
                  ? "Select"
                  : "Select Photo"
                : isMobile
                  ? `Add (${totalSelectedCount})`
                  : `Add ${totalSelectedCount} ${
                      totalSelectedCount === 1 ? "Photo" : "Photos"
                    } to Canvas`
          }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { usePhotosStore } from "@/stores/photos";
import { useCanvasStore } from "@/stores/canvas";
import { useIsMobile } from "@/composables/useIsMobile";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import PhotosLightboxTab from "@/components/canvas/PhotosLightboxTab.vue";

import {
  NModal,
  NButton,
  NIcon,
  NInput,
  NTabs,
  NTabPane,
  NSpin,
} from "naive-ui";
import { api } from "@/utils/axios";

// Import @vicons icons from ionicons5 for reliability
import {
  TrashOutline as DeleteIcon,
  ImageOutline as ImageIcon,
  ArrowUndoOutline as ArrowUndoIcon,
  AddOutline as AddIcon,
} from "@vicons/ionicons5";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  isTrash: {
    type: Boolean,
    default: false,
  },
  singleSelection: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: "",
  },
  displayLightboxTab: {
    type: Boolean,
    default: true,
  },
  displaySearch: {
    type: Boolean,
    default: true,
  },
  suggestedPhotos: {
    type: Array,
    default: null,
  },
  loadingSuggestions: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "add-photos"]);

// Reactive dialog state
const dialog = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

// Stores
const photosStore = usePhotosStore();
const canvasStore = useCanvasStore();
const { isMobile } = useIsMobile();

// Computed modal style
const modalStyle = computed(() => {
  if (isMobile.value) {
    return {
      width: "100vw",
      height: "100vh",
      maxWidth: "100vw",
      maxHeight: "100vh",
      margin: 0,
      "--n-border-radius": 0,
    };
  }
  return { maxWidth: "90vw", width: "1000px", maxHeight: "90vh" };
});

// Component state
const selectedIds = ref([]);
const syncSelectedIds = ref([]);
const isSubmitting = ref(false);
const searchQuery = ref("");
const activeTab = ref("catalog");
const isSearching = ref(false);
const searchResults = ref([]);
const allCatalogPhotos = ref([]);

// Computed photos for different contexts
const processedPhotos = computed(() => {
  // If suggestedPhotos are provided, use them directly
  if (props.suggestedPhotos && props.suggestedPhotos.length > 0) {
    return props.suggestedPhotos;
  }

  const hasSearch = searchQuery.value.trim();
  const hasResults = searchResults.value && searchResults.value.length > 0;

  // Si hay búsqueda Y resultados, muestra solo los resultados (filtrados)
  if (hasSearch && hasResults) {
    return searchResults.value.filter(
      (p) =>
        !canvasStore.photos.find((photo) => photo.id === p.id) &&
        !canvasStore.discardedPhotos.find((photo) => photo.id === p.id),
    );
  }

  // Si no hay búsqueda o la búsqueda no tiene resultados, muestra todo el catálogo
  return allCatalogPhotos.value;
});

const trashPhotos = computed(() => {
  // Return discarded photos that can be restored
  return canvasStore.discardedPhotos
    .map((dp) => photosStore.processedPhotos.find((p) => p.id === dp.id))
    .filter(Boolean);
});

// For compatibility with existing code
const photos = computed(() => {
  if (props.isTrash) {
    return trashPhotos.value;
  } else {
    return processedPhotos.value;
  }
});

// Total selected count across all tabs
const totalSelectedCount = computed(() => {
  if (props.isTrash) {
    return selectedIds.value.length;
  } else {
    return activeTab.value === "catalog"
      ? selectedIds.value.length
      : syncSelectedIds.value.length;
  }
});

// Selection methods
function toggleSelection(photoId) {
  if (props.singleSelection) {
    // For single selection mode, directly select or deselect
    selectedIds.value = selectedIds.value.includes(photoId) ? [] : [photoId];
  } else {
    // Multi-selection mode
    if (selectedIds.value.includes(photoId)) {
      selectedIds.value = selectedIds.value.filter((id) => id !== photoId);
    } else {
      selectedIds.value.push(photoId);
    }
  }
}

function selectAll() {
  if (activeTab.value === "catalog" || props.isTrash) {
    selectedIds.value = photos.value.map((p) => p.id);
  } else if (activeTab.value === "sync") {
    syncSelectedIds.value = photosStore.lightboxPhotos.map((p) => p.id);
  }
}

function clearSelection() {
  if (activeTab.value === "catalog" || props.isTrash) {
    selectedIds.value = [];
  } else if (activeTab.value === "sync") {
    syncSelectedIds.value = [];
  }
}

function showPhotoInfo(photo) {
  // TODO: Implement photo info modal
  console.log("Show photo info:", photo);
}

// Main actions
async function confirmSelection() {
  let photosToAdd = [];

  if (props.isTrash) {
    if (selectedIds.value.length === 0) return;

    // Remove from discarded photos (restore)
    canvasStore.discardedPhotos = canvasStore.discardedPhotos.filter(
      (dp) => !selectedIds.value.includes(dp.id),
    );
    photosToAdd = selectedIds.value;
  } else {
    // Determine which photos to add based on active tab
    if (activeTab.value === "catalog") {
      photosToAdd = selectedIds.value;
    } else if (activeTab.value === "sync") {
      photosToAdd = syncSelectedIds.value;
    }

    if (photosToAdd.length === 0) return;
  }

  isSubmitting.value = true;
  try {
    // Emit add-photos event with selected photo IDs
    emit("add-photos", photosToAdd);
    close();
  } catch (error) {
    console.error("Error adding photos:", error);
  } finally {
    isSubmitting.value = false;
  }
}

function close() {
  selectedIds.value = [];
  syncSelectedIds.value = [];
  activeTab.value = "catalog";
  emit("update:modelValue", false);
}

function handlePhotosAdded(photos) {
  // This is called when new photos are uploaded in the sync tab
  // Photos are automatically available in the sync photos list
  console.log("Photos added to sync:", photos);
}

// Search functionality
let searchTimeout = null;

function onSearchChange() {
  // Clear any existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // If search is empty, show all photos
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }

  // Debounce search to avoid too many API calls
  searchTimeout = setTimeout(async () => {
    await performSearch();
  }, 1000);
}

async function performSearch() {
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }

  isSearching.value = true;
  searchResults.value = [];

  try {
    const payload = {
      description: searchQuery.value.trim(),
      options: {
        iteration: 1,
        pageSize: 100,
        searchMode: "broad",
      },
    };

    const { data: response } = await api.post(
      "/api/search/semantic/sync",
      payload,
    );

    // Handle direct response from sync endpoint
    if (response.data && response.data.results) {
      const photos = [];
      Object.entries(response.data.results).forEach(([iter, items]) => {
        photos.push(...items.map((i) => i.photo));
      });
      searchResults.value = photos;
    } else {
      // If no results, show empty array
      searchResults.value = [];
    }
  } catch (error) {
    console.error("Error searching photos:", error);
    // On error, show all photos
    searchResults.value = [...allCatalogPhotos.value];
  } finally {
    isSearching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = "";
  searchResults.value = [];
  isSearching.value = false;
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
}

// Watch for dialog open/close to fetch photos
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      selectedIds.value = [];
      syncSelectedIds.value = [];
      activeTab.value = "catalog";
      clearSearch();

      // Ensure photos are loaded
      await photosStore.getOrFetch();

      // Initialize all catalog photos for search filtering
      allCatalogPhotos.value = photosStore.processedPhotos.filter(
        (p) =>
          !canvasStore.photos.find((photo) => photo.id === p.id) &&
          !canvasStore.discardedPhotos.find((photo) => photo.id === p.id),
      );
    }
  },
);

// Fetch photos on mount
onMounted(async () => {
  // Ensure photos are loaded if dialog is already open
  if (props.modelValue) {
    await photosStore.getOrFetch();
    allCatalogPhotos.value = photosStore.processedPhotos.filter(
      (p) =>
        !canvasStore.photos.find((photo) => photo.id === p.id) &&
        !canvasStore.discardedPhotos.find((photo) => photo.id === p.id),
    );
  }
});
</script>

<style scoped>
.suggestions-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  gap: 20px;
}

.suggestions-loading-text {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0;
}

/* Dialog Header */
.dialog-header {
  text-align: center;
}

.dialog-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
  line-height: var(--line-height-tight);
}

/* Dialog Content */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  max-height: 60vh;
  overflow: hidden;
}

.tabs-container {
  flex: 1;
  overflow: hidden;
}

/* Search and Stats Bar */
.stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

.search-section {
  flex: 1;
  min-width: 200px;
}

.text-search {
  width: 100%;
}

.stats-section {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  flex-shrink: 0;
}

.stats-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.stats-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}

.selected-count {
  color: var(--primary-color);
  font-weight: var(--font-weight-medium);
}

.stats-actions {
  display: flex;
  gap: var(--spacing-sm);
}

/* Photos Grid */
.photos-grid {
  overflow-y: auto;
  grid-auto-rows: min-content;
  padding: var(--spacing-sm);
  max-height: calc(60vh - 80px);
}

/* Empty State */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  text-align: center;
}

.empty-state-content {
  max-width: 400px;
}

.empty-state-icon {
  margin-bottom: var(--spacing-lg);
  color: var(--icon-tertiary);
}

.empty-state-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.empty-state-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

/* Dialog Actions */
.dialog-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--spacing-md);
  }
}

@media (max-width: 768px) {
  :deep(.n-dialog.photos-dialog-modal) {
    width: 100vw !important;
    height: 100vh !important;
    max-height: 100vh !important;
    margin: 0 !important;
    border-radius: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }

  :deep(.n-dialog.photos-dialog-modal .n-dialog__content) {
    flex: 1 !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }

  .dialog-content {
    max-height: none !important;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    min-height: 0;
  }

  .empty-state {
    min-height: 200px;
  }

  .tabs-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :deep(.n-tabs) {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  :deep(.n-tabs-pane-wrapper) {
    flex: 1;
    overflow: hidden;
  }

  :deep(.n-tab-pane) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .stats-bar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .search-section {
    order: 1;
  }

  .stats-section {
    order: 2;
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .stats-info {
    justify-content: center;
  }

  .stats-actions {
    justify-content: center;
  }

  .mobile-catalog-container,
  .trash-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .mobile-catalog-container > .stats-bar,
  .trash-container > .stats-bar {
    flex-shrink: 0;
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--spacing-xs);
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .dialog-actions {
    flex-direction: row;
    width: 100%;
    gap: var(--spacing-sm);
  }

  .dialog-actions .n-button {
    flex: 1;
  }
}

@media (max-width: 480px) {
  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .dialog-title {
    font-size: var(--font-size-lg);
  }

  .text-search {
    max-width: none;
  }
}

/* Scrollbar styling for photos grid */
.photos-grid {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.photos-grid::-webkit-scrollbar {
  width: 6px;
}

.photos-grid::-webkit-scrollbar-track {
  background: transparent;
}

.photos-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-xs);
}

.photos-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
:deep(.n-input__suffix) {
  display: flex !important;
  align-items: center !important;
  height: 100%;
}
</style>
