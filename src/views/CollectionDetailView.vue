<template>
  <div class="collection-detail-view view-container">
    <!-- Loading state -->
    <div v-if="isLoading" class="loading-state">
      <SpiralGridLoader
        variant="primary"
        :size="72"
        text="Loading collection..."
      />
    </div>

    <!-- Collection View -->
    <div v-else-if="viewingCollection" class="collection-view">
      <!-- Collection Header -->
      <div
        class="detail-header scroll-header"
        :class="{
          'header-hidden': collectionHeaderHidden,
          entering: collectionHeaderEntering,
        }"
      >
        <div class="detail-header-content">
          <div class="detail-header-actions">
            <n-button
              text
              @click="backFromCollection"
              class="detail-back-button"
            >
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                    />
                  </svg>
                </n-icon>
              </template>
              {{ backLabel }}
            </n-button>
            <!-- Desktop buttons -->
            <div class="header-actions-buttons desktop-actions">
              <n-button
                type="primary"
                ghost
                @click="showAddPhotosDialog"
                class="add-photos-button"
              >
                <template #icon>
                  <n-icon><AddOutline /></n-icon>
                </template>
                Add Photos
              </n-button>
              <n-button
                type="error"
                ghost
                @click="showDeleteConfirmation"
                class="detail-delete-button"
              >
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </n-icon>
                </template>
                Delete Collection
              </n-button>
            </div>
            <!-- Mobile overflow menu -->
            <div class="mobile-actions">
              <n-dropdown
                trigger="click"
                :options="dropdownOptions"
                @select="handleDropdownSelect"
              >
                <n-button text class="overflow-menu-button">
                  <template #icon>
                    <n-icon size="24"><EllipsisVertical /></n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </div>
          </div>

          <div class="title-row">
            <div v-if="!isEditingDetails" class="title-display">
              <h1 class="detail-title">
                {{ viewingCollection.name || viewingCollection.title }}
              </h1>
              <n-button
                text
                class="edit-button"
                @click="startEditDetails"
                title="Edit collection name and description"
              >
                <template #icon>
                  <n-icon size="20"><CreateOutline /></n-icon>
                </template>
              </n-button>
            </div>
            <div v-else class="title-edit">
              <n-input
                v-model:value="editedTitle"
                placeholder="Enter collection name..."
                maxlength="100"
              />
              <n-button
                text
                class="action-button"
                @click="saveDetails"
                :loading="isSavingDetails"
              >
                <template #icon>
                  <n-icon size="20"><CheckmarkOutline /></n-icon>
                </template>
              </n-button>
              <n-button text class="action-button" @click="cancelEditDetails">
                <template #icon>
                  <n-icon size="20"><CloseOutline /></n-icon>
                </template>
              </n-button>
            </div>
          </div>

          <div v-if="isEditingDetails" class="description-edit">
            <n-input
              v-model:value="editedDescription"
              placeholder="Enter collection description (optional)..."
              maxlength="500"
            />
          </div>
          <div
            v-else-if="viewingCollection.description"
            class="description-display"
          >
            <n-tooltip
              trigger="hover"
              placement="bottom-start"
              :style="{ maxWidth: '480px' }"
            >
              <template #trigger>
                <p class="detail-description">
                  {{ viewingCollection.description }}
                </p>
              </template>
              {{ viewingCollection.description }}
            </n-tooltip>
          </div>
        </div>
      </div>

      <!-- Collection Photos Grid -->
      <div class="collection-photos">
        <PhotosGrid
          :key="`${collectionId}-${gridSeedKey}`"
          :collectionId="collectionId"
          :photos="viewingCollection.photos || []"
          :showSuggestButton="(viewingCollection.photos || []).length > 0"
          :findDuplicatesEnabled="false"
          :scrollable="true"
          :scores-toolbar="true"
          :initial-filters="initialGridFilters"
          @refreshCollection="refreshCollection"
          @photos-removed="onPhotosRemoved"
          @suggest-photos="suggestPhotosForCollection"
          @scroll-direction="onCollectionHeaderScroll"
        />
      </div>
    </div>

    <!-- Collection not found -->
    <div v-else class="not-found-state">
      <p>Collection not found.</p>
      <n-button @click="backToCollections">Back to Collections</n-button>
    </div>

    <!-- Add Photos Dialog -->
    <PhotosDialog
      v-model="photosDialogVisible"
      :is-trash="false"
      :title="`Add Photos to ${
        viewingCollection?.name || viewingCollection?.title || 'Collection'
      }`"
      :displayLightboxTab="false"
      :displaySearch="true"
      @add-photos="onPhotosSelected"
    />

    <!-- Suggested Photos Dialog -->
    <PhotosDialog
      v-model="suggestDialogVisible"
      :is-trash="false"
      :title="`Suggested Photos for ${
        viewingCollection?.name || viewingCollection?.title || 'Collection'
      }`"
      :displayLightboxTab="false"
      :displaySearch="false"
      :suggestedPhotos="suggestedPhotos"
      :loadingSuggestions="isSuggestingPhotos"
      @add-photos="onPhotosSelected"
    />

    <!-- Delete Collection Confirmation Dialog -->
    <n-modal
      v-model:show="deleteConfirmationVisible"
      preset="dialog"
      title="Delete Collection"
      positive-text="Delete Collection"
      negative-text="Cancel"
      type="error"
      :loading="collectionsStore.isDeleting"
      @positive-click="deleteCollection"
      @negative-click="deleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the collection
          <strong
            >"{{ viewingCollection?.name || viewingCollection?.title }}"</strong
          >?
        </p>
        <p class="delete-warning">
          <n-icon size="16" color="#f5a623" style="margin-right: 8px">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
              />
            </svg>
          </n-icon>
          Don't worry - your photos will not be deleted, only the collection
          will be removed.
        </p>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NIcon,
  NModal,
  NInput,
  NDropdown,
  NTooltip,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  CreateOutline,
  CheckmarkOutline,
  CloseOutline,
  EllipsisVertical,
} from "@vicons/ionicons5";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotosGrid from "@/components/PhotosGrid.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { usePhotosGridDeepLink } from "@/composables/usePhotosGridDeepLink.js";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useHeaderHideOnScroll } from "@/composables/useHeaderHideOnScroll.js";
import { getTabConfigByRouteName } from "@/config/routeTabs";
import { api } from "@/utils/axios";

defineOptions({ name: "CollectionDetailView" });

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();

// The collection this instance shows. Collections share a single tab, so this
// instance is reused when another collection is opened — but it must only follow
// the route while the collection route is the active one. A kept-alive inactive
// instance still sees the global route, and reading `route.params.id` reactively
// would point it at another tab's entity (or wipe it to undefined) on every
// navigation. See the guarded watcher at the bottom of this file.
const collectionId = ref(String(route.params.id ?? ""));

// Only the singleton tab reuses one instance across collections. If the tab is
// switched back to per-instance mode, each instance stays bound to the id it was
// created with and must ignore route changes entirely.
const reusesSingleInstance =
  getTabConfigByRouteName("collection-detail")?.mode === "singleton";

// Deep-link filters/sorting (e.g. from a ChatLab "open collection filtered" action).
const { initialGridFilters, gridSeedKey } = usePhotosGridDeepLink(
  (r) =>
    r.name === "collection-detail" &&
    String(r.params.id) === collectionId.value,
);

const {
  headerHidden: collectionHeaderHidden,
  headerEntering: collectionHeaderEntering,
  onScrollDirection: onCollectionHeaderScroll,
  reset: resetCollectionHeader,
} = useHeaderHideOnScroll();

// Data
const viewingCollection = ref(null);

// Edit state — name and description are edited together from a single control
const isEditingDetails = ref(false);
const editedTitle = ref("");
const editedDescription = ref("");
const isSavingDetails = ref(false);

// Dialogs
const photosDialogVisible = ref(false);
const suggestDialogVisible = ref(false);
const deleteConfirmationVisible = ref(false);

// Suggestions
const suggestedPhotos = ref(null);
const isSuggestingPhotos = ref(false);

// ── Computed ──────────────────────────────────────────────────────────────────

const isLoading = computed(
  () =>
    collectionsStore.isLoading ||
    photosStore.isLoading ||
    !Array.isArray(photosStore.allPhotos) ||
    photosStore.allPhotos.length === 0,
);

const backLabel = computed(() => {
  if (viewingCollection.value?.setId) {
    const set = collectionsStore.getSetById(viewingCollection.value.setId);
    return set ? `Back to "${set.name}"` : "Back to Collections";
  }
  return "Back to Collections";
});

// ── Mobile dropdown ───────────────────────────────────────────────────────────

const dropdownOptions = [
  {
    label: "Add Photos",
    key: "add-photos",
    icon: () => h(NIcon, null, { default: () => h(AddOutline) }),
  },
  {
    label: "Delete Collection",
    key: "delete-collection",
    icon: () =>
      h(NIcon, null, {
        default: () =>
          h(
            "svg",
            { viewBox: "0 0 24 24" },
            h("path", {
              fill: "currentColor",
              d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
            }),
          ),
      }),
  },
];

const handleDropdownSelect = (key) => {
  if (key === "add-photos") showAddPhotosDialog();
  else if (key === "delete-collection") showDeleteConfirmation();
};

// ── Navigation ────────────────────────────────────────────────────────────────

const backToCollections = () => router.push({ name: "collections" });

const backFromCollection = () => {
  const setId = viewingCollection.value?.setId;
  if (setId) router.push({ name: "collection-set", params: { setId } });
  else router.push({ name: "collections" });
};

// ── State update ──────────────────────────────────────────────────────────────

const updateViewState = () => {
  if (!collectionId.value) return;
  const collection = collectionsStore.getCollectionWithFullPhotos(
    collectionId.value,
    photosStore,
  );
  if (collection) {
    viewingCollection.value = collection;
    collectionsStore.setCurrentCollection(collection);
  }
};

// ── Edit name + description ─────────────────────────────────────────────

const startEditDetails = () => {
  editedTitle.value =
    viewingCollection.value.name || viewingCollection.value.title || "";
  editedDescription.value = viewingCollection.value.description || "";
  isEditingDetails.value = true;
};

const saveDetails = async () => {
  if (!viewingCollection.value || !editedTitle.value.trim()) {
    message.warning("Collection name cannot be empty");
    return;
  }
  isSavingDetails.value = true;
  try {
    await collectionsStore.updateCollection(viewingCollection.value.id, {
      title: editedTitle.value.trim(),
      description: editedDescription.value.trim() || "",
    });
    message.success("Collection updated");
    isEditingDetails.value = false;
    updateViewState();
  } catch (error) {
    console.error("Error updating collection:", error);
  } finally {
    isSavingDetails.value = false;
  }
};

const cancelEditDetails = () => {
  isEditingDetails.value = false;
  editedTitle.value = "";
  editedDescription.value = "";
};

// ── Photos ────────────────────────────────────────────────────────────────────

const showAddPhotosDialog = () => {
  photosDialogVisible.value = true;
};

const suggestPhotosForCollection = async () => {
  if (!viewingCollection.value) return;
  const photos = viewingCollection.value.photos || [];
  if (photos.length === 0) return;
  isSuggestingPhotos.value = true;
  suggestedPhotos.value = null;
  suggestDialogVisible.value = true;
  try {
    let anchorIds = [];
    if (photos.length > 20) {
      const sampleCount = Math.min(Math.ceil(photos.length * 0.25), 50);
      const step = photos.length / sampleCount;
      for (let i = 0; i < sampleCount; i++)
        anchorIds.push(photos[Math.floor(i * step)].id);
    } else {
      anchorIds = photos.map((p) => p.id);
    }
    const response = await api.post("/api/search/byPhotos", {
      anchorIds,
      currentPhotosIds: photos.map((p) => p.id),
      criteria: "embedding",
      opposite: false,
      inverted: false,
      resultLength: 54,
    });
    const backendPhotos = Array.isArray(response.data)
      ? response.data
      : [response.data];
    suggestedPhotos.value = backendPhotos
      .map(
        (bp) => photosStore.processedPhotos.find((p) => p.id === bp.id) || bp,
      )
      .filter(Boolean);
  } catch (error) {
    console.error("Error suggesting photos:", error);
    message.error("Could not find suggested photos");
  } finally {
    isSuggestingPhotos.value = false;
  }
};

const onPhotosSelected = async (photoIds) => {
  if (!photoIds || photoIds.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }
  if (!viewingCollection.value) return;
  try {
    await collectionsStore.addPhotosToCollection(
      viewingCollection.value.id,
      photoIds,
    );
    message.success(
      `Added ${photoIds.length} photo${photoIds.length > 1 ? "s" : ""} to the collection.`,
    );
    photosDialogVisible.value = false;
    suggestDialogVisible.value = false;
    await refreshCollection();
  } catch (error) {
    console.error("Error adding photos:", error);
  }
};

const refreshCollection = async () => {
  await collectionsStore.getOrFetch(true);
  updateViewState();
};

// The store already dropped the photos once the backend confirmed, so just mirror
// that here — refetching would tear down the grid and lose filters/scroll.
const onPhotosRemoved = (photoIds) => {
  if (!viewingCollection.value) return;
  const removed = new Set((photoIds || []).map(String));
  viewingCollection.value.photos = (
    viewingCollection.value.photos || []
  ).filter((photo) => !removed.has(String(photo.id)));
};

// ── Delete collection ─────────────────────────────────────────────────────────

const showDeleteConfirmation = () => {
  deleteConfirmationVisible.value = true;
};

const deleteCollection = async () => {
  if (!viewingCollection.value) return;
  try {
    await collectionsStore.deleteCollection(viewingCollection.value.id);

    deleteConfirmationVisible.value = false;
    backFromCollection();
  } catch (error) {
    console.error("Error deleting collection:", error);
  }
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  // Reset scroll so the detail header is always visible on entry
  window.scrollTo(0, 0);
  try {
    await Promise.all([
      photosStore.getOrFetch(),
      collectionsStore.getOrFetch(),
      collectionsStore.getOrFetchSets(),
    ]);
    updateViewState();
  } catch (error) {
    console.error("Error loading collection:", error);
  }
});

watch(
  [() => collectionsStore.allCollections, () => photosStore.allPhotos],
  updateViewState,
);

// Collections share one tab, so this cached instance is re-targeted when another
// collection is opened. Only follow the route while it actually points at a
// collection detail — otherwise an inactive instance would rebind to another tab.
watch(
  () =>
    route.name === "collection-detail" ? String(route.params.id ?? "") : null,
  (nextId) => {
    if (!reusesSingleInstance) return;
    if (!nextId || nextId === collectionId.value) return;

    collectionId.value = nextId;
    viewingCollection.value = null;
    isEditingDetails.value = false;
    suggestedPhotos.value = null;
    photosDialogVisible.value = false;
    suggestDialogVisible.value = false;
    deleteConfirmationVisible.value = false;
    // The grid is remounted for the new collection, so nothing will ever emit
    // the upward scroll that un-hides the header — restore it by hand.
    resetCollectionHeader();
    window.scrollTo(0, 0);
    updateViewState();
  },
);

// A deep link re-seeds the grid in place, which also rebuilds it scrolled to the
// top — same reason the header has to be restored by hand.
watch(gridSeedKey, resetCollectionHeader);
</script>

<style scoped>
.collection-detail-view {
  background-color: var(--bg-body);
}

.loading-state,
.not-found-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: calc(100vh - var(--total-header-offset) - var(--spacing-lg) * 2);
  gap: var(--spacing-md);
}

/* Keep the detail header from collapsing the grid */
.collection-view .detail-header {
  margin-bottom: var(--spacing-sm);
  max-height: 200px;
}

.collection-photos {
  width: 100%;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.title-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.title-edit {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.title-edit :deep(.n-input) {
  max-width: 600px;
}

.title-edit :deep(.n-input__input) {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.description-display {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.description-display .detail-description {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  max-width: 700px;
}

.description-edit {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
  align-items: flex-start;
}

.description-edit :deep(.n-input) {
  max-width: 400px;
}

.edit-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  flex-shrink: 0;
  padding: 0;
  min-width: 32px;
}

.edit-button:hover {
  color: var(--primary-color);
}

.action-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  padding: 0;
  min-width: 32px;
  flex-shrink: 0;
}

.action-button:hover {
  color: var(--primary-color);
}

.header-actions-buttons {
  display: flex;
  gap: 12px;
}

.desktop-actions {
  display: flex;
}

.mobile-actions {
  display: none;
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
}

.overflow-menu-button {
  color: var(--text-primary);
  padding: var(--spacing-sm);
}

@media (max-width: 768px) {
  .desktop-actions {
    display: none;
  }

  .mobile-actions {
    display: flex;
  }

  .detail-header {
    position: relative;
  }

  .detail-back-button {
    font-size: var(--font-size-sm);
  }

  .detail-title {
    font-size: var(--font-size-2xl);
  }

  .title-edit :deep(.n-input__input) {
    font-size: var(--font-size-2xl);
  }

  .detail-description {
    font-size: var(--font-size-sm);
  }
}
</style>
