<template>
  <div class="series-view view-container">
    <!-- Public View: Loading State -->
    <div v-if="isPublicView && isLoading" class="public-loading-state">
      <n-spin size="large">
        <div class="loading-text">Loading series...</div>
      </n-spin>
    </div>

    <!-- Public View: Error State -->
    <div v-else-if="isPublicView && publicLoadError" class="public-error-state">
      <div class="error-content">
        <n-icon size="64" color="#ef4444">
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            />
          </svg>
        </n-icon>
        <h2 class="error-title">Series not found</h2>
        <p class="error-description">
          The series you're looking for doesn't exist or is not available.
        </p>
        <n-button type="primary" @click="router.push({ name: 'landing' })">
          Go to Home
        </n-button>
      </div>
    </div>

    <!-- Public View: Fullscreen only (minimal UI, fullscreen opens automatically) -->
    <div v-else-if="isPublicView && viewingSeries" class="public-series-view">
      <!-- Minimal background while fullscreen is open -->
      <div class="public-background">
        <h1 class="public-series-title">
          {{ viewingSeries.name || viewingSeries.title }}
        </h1>
        <p class="public-series-meta">
          {{ (viewingSeries.photos || []).length }} photos
        </p>
      </div>
    </div>

    <!-- Series Detail View (when viewing a specific series) -->
    <div v-else-if="showSeriesView && viewingSeries" class="series-detail-view">
      <!-- Series Header -->
      <div class="detail-header">
        <div class="detail-header-content">
          <div class="detail-header-actions">
            <n-button text @click="backToSeries" class="detail-back-button">
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
              Back to Series
            </n-button>
            <div style="display: flex; gap: 12px">
              <n-button
                type="primary"
                @click="openFullscreenViewer"
                class="play-series-button"
                :disabled="
                  !(viewingSeries.photos && viewingSeries.photos.length > 0)
                "
              >
                <template #icon>
                  <n-icon>
                    <PlayOutline />
                  </n-icon>
                </template>
                Play
              </n-button>
              <n-button
                type="primary"
                ghost
                @click="showAddPhotosDialog"
                class="add-photos-button"
              >
                <template #icon>
                  <n-icon>
                    <AddOutline />
                  </n-icon>
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
                Delete Series
              </n-button>
            </div>
          </div>
          <div class="series-title-row">
            <div v-if="!editingTitle" class="title-display">
              <h1 class="detail-title">
                {{ viewingSeries.name || viewingSeries.title }}
              </h1>
              <n-button
                v-if="!isPublicView"
                text
                class="edit-button"
                @click="startEditTitle"
                title="Edit series name"
              >
                <template #icon>
                  <n-icon size="20">
                    <CreateOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
            <div v-else class="title-edit">
              <n-input
                v-model:value="editedTitle"
                placeholder="Enter series name..."
                maxlength="100"
              />
              <n-button
                text
                class="action-button"
                @click="saveTitle"
                :loading="isSavingTitle"
              >
                <template #icon>
                  <n-icon size="20">
                    <CheckmarkOutline />
                  </n-icon>
                </template>
              </n-button>
              <n-button text class="action-button" @click="cancelEditTitle">
                <template #icon>
                  <n-icon size="20">
                    <CloseOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
            <n-button
              text
              class="share-button"
              @click="copySeriesLink"
              title="Copy link to clipboard"
            >
              <template #icon>
                <n-icon size="24">
                  <ShareSocialOutline />
                </n-icon>
              </template>
            </n-button>
          </div>
          <div v-if="!editingDescription" class="description-display">
            <p class="detail-description" v-if="viewingSeries.description">
              {{ viewingSeries.description }}
            </p>
            <n-button
              v-if="!isPublicView"
              text
              class="edit-button"
              @click="startEditDescription"
              title="Edit series description"
            >
              <template #icon>
                <n-icon size="20">
                  <CreateOutline />
                </n-icon>
              </template>
            </n-button>
          </div>
          <div v-else class="description-edit">
            <n-input
              v-model:value="editedDescription"
              placeholder="Enter series description (optional)..."
              maxlength="500"
            />
            <div class="description-actions">
              <n-button
                text
                class="action-button"
                @click="saveDescription"
                :loading="isSavingDescription"
              >
                <template #icon>
                  <n-icon size="20">
                    <CheckmarkOutline />
                  </n-icon>
                </template>
              </n-button>
              <n-button
                text
                class="action-button"
                @click="cancelEditDescription"
              >
                <template #icon>
                  <n-icon size="20">
                    <CloseOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
          </div>
          <!-- <p class="detail-meta">
            {{ (viewingSeries.photos || []).length }} photos • Updated
            {{ formatDate(viewingSeries.updatedAt) }}
          </p> -->
        </div>
      </div>

      <!-- Series Photos Strip -->
      <div class="series-photos">
        <SeriesPhotoStrip
          :photos="viewingSeries.photos || []"
          :series-id="route.params.id"
          :selected-photo-ids="localSelectedPhotoIds"
          :suggested-photos-info="suggestedPhotosInfo"
          :refreshing-photo-id="refreshingPhotoId"
          @add-photos="showAddPhotosDialog"
          @add-photos-at="handleAddPhotosAt"
          @suggest-photo-at="handleSuggestPhotoAt"
          @refresh-suggestion="handleRefreshSuggestion"
          @remove-photo="handleRemovePhoto"
          @reorder="handleReorder"
          @move-photo="handleMovePhoto"
          @photos-updated="handlePhotosUpdated"
          @select-photo="togglePhotoSelection"
          @show-info="handleShowPhotoInfo"
        />
      </div>
    </div>

    <!-- Series Grid View (default view) -->
    <div v-else>
      <!-- Header Section -->
      <div class="series-list-header">
        <div class="header-content">
          <h1 class="page-title">Series</h1>
          <p class="page-subtitle">
            Create sequential photo stories. Arrange your photos in a specific
            order to tell your visual narrative.
          </p>
        </div>
      </div>

      <!-- Series Grid -->
      <div v-if="isLoading" class="loading-state">
        <n-spin size="large">
          <div class="loading-text">Loading your series...</div>
        </n-spin>
      </div>

      <div v-else class="card-grid">
        <!-- Create New Series Card (only show when there are existing series) -->
        <div
          v-if="allSeries.length > 0"
          class="card create-card"
          @click="showCreateDialog"
        >
          <div class="create-preview">
            <div class="create-icon">
              <n-icon size="48" color="var(--primary-color)">
                <AddOutline />
              </n-icon>
            </div>
          </div>
          <div class="card-info">
            <h3 class="card-title">Create New Series</h3>
            <p class="card-meta">Start your photo sequence</p>
          </div>
        </div>

        <!-- Existing Series -->
        <CollectionCard
          v-for="series in allSeries"
          :key="series.id"
          :item="series"
          type="series"
          @click="openSeries(series)"
        />

        <!-- Empty State (when no series exist) -->
        <div v-if="allSeries.length === 0" class="empty-series-state">
          <div class="empty-series-content">
            <n-icon size="64" class="empty-series-icon">
              <ListOutline />
            </n-icon>
            <h3 class="empty-series-title">No series yet</h3>
            <p class="empty-series-description">
              Create your first series to start arranging your photos in a
              sequential narrative.
            </p>
            <n-button
              type="primary"
              @click="showCreateDialog"
              class="create-series-btn"
            >
              <template #icon>
                <n-icon>
                  <AddOutline />
                </n-icon>
              </template>
              Create Your First Series
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Series Dialog -->
    <n-modal
      v-model:show="createDialogVisible"
      preset="dialog"
      title="Create New Series"
      positive-text="Create Series"
      negative-text="Cancel"
      @positive-click="createSeries"
      @negative-click="createDialogVisible = false"
    >
      <div class="create-form">
        <n-form ref="formRef" :model="formData" :rules="formRules">
          <n-form-item label="Name" path="title">
            <n-input
              v-model:value="formData.title"
              placeholder="Enter series name..."
              maxlength="100"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="formData.description"
              placeholder="Add a description (optional)..."
              :rows="3"
              maxlength="500"
              show-count
            />
          </n-form-item>
        </n-form>
      </div>
    </n-modal>

    <!-- Photos Selection Dialog -->
    <PhotosDialog
      v-model="photosDialogVisible"
      :is-trash="false"
      :title="`Add Photos to ${
        viewingSeries?.name || viewingSeries?.title || 'Series'
      }`"
      :displayLightboxTab="false"
      :displaySearch="true"
      @add-photos="onPhotosSelected"
    />

    <!-- Delete Series Confirmation Dialog -->
    <n-modal
      v-model:show="deleteConfirmationVisible"
      preset="dialog"
      title="Delete Series"
      positive-text="Delete Series"
      negative-text="Cancel"
      type="error"
      :loading="seriesStore.isDeleting"
      @positive-click="deleteSeries"
      @negative-click="deleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the series
          <strong>"{{ viewingSeries?.name || viewingSeries?.title }}"</strong>?
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
          Don't worry - your photos will not be deleted, only the series will be
          removed.
        </p>
      </div>
    </n-modal>

    <!-- Series Fullscreen Viewer -->
    <SeriesFullscreenViewer
      v-model="fullscreenViewerVisible"
      :photos="viewingSeries?.photos || []"
      :start-index="0"
      :is-public-view="isPublicView"
    />

    <!-- Floating Action Bar (only show in series detail view) -->
    <FloatingActionBar
      v-if="showSeriesView && !isPublicView"
      :selected-count="localSelectedPhotoIds.length"
      :show-delete="false"
      :show-add-to-collection="false"
      :show-move-to-tool="true"
      :show-send-to-chat="true"
      :is-downloading="isDownloading"
      @clear-selection="localClearAllSelections"
      @download="handleDownloadMultiple"
      @delete="handleRemoveSelectedFromSeries"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="handleMoveToTool"
      @send-to-chat="handleSendToChat"
    />

    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="localSelectedPhotoIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="photoInfoDialogVisible"
      :selected-photo="selectedPhotoForInfo"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

defineOptions({
  name: "SeriesView",
});

import {
  NButton,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSpin,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  ListOutline,
  PlayOutline,
  ShareSocialOutline,
  CreateOutline,
  CheckmarkOutline,
  CloseOutline,
} from "@vicons/ionicons5";
import PhotosDialog from "@/components/PhotosDialog.vue";
import CollectionCard from "@/components/CollectionCard.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import { useUserStore } from "@/stores/userStore";
import SeriesPhotoStrip from "@/components/SeriesPhotoStrip.vue";
import SeriesFullscreenViewer from "@/components/SeriesFullscreenViewer.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useSeriesStore } from "@/stores/series.js";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection";
import { usePhotoDownload } from "@/composables/usePhotoDownload";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection";
import { usePhotoQueryParams } from "@/composables/usePhotoQueryParams.js";
import { api } from "@/utils/axios";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const seriesStore = useSeriesStore();
const userStore = useUserStore();

// Local photo selection
const {
  selectedPhotosRecord: localSelectedPhotosRecord,
  selectedPhotoIds: localSelectedPhotoIds,
  togglePhotoSelection: localTogglePhotoSelection,
  clearAllSelections: localClearAllSelections,
} = useLocalPhotoSelection();

// Photo download utilities
const { downloadPhotosZip, isDownloading } = usePhotoDownload();

// Photo query params handling (e.g., ?source=lightroom&ids=123,456)
const { getPhotoIdsFromQuery } = usePhotoQueryParams();

// Photo tool selection utilities
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

// State
const createDialogVisible = ref(false);
const photosDialogVisible = ref(false);
const showCollectionModal = ref(false);
const deleteConfirmationVisible = ref(false);
const fullscreenViewerVisible = ref(false);
const photoInfoDialogVisible = ref(false);
const selectedPhotoForInfo = ref(null);
const formRef = ref(null);
const viewingSeries = ref(null); // Series being viewed
const showSeriesView = ref(false); // Whether to show series view or grid view
const isPublicView = ref(false); // Whether this is a public anonymous view
const publicLoadError = ref(false); // Whether there was an error loading the public series

// Edit states for title and description
const editingTitle = ref(false);
const editingDescription = ref(false);
const editedTitle = ref("");
const editedDescription = ref("");
const isSavingTitle = ref(false);
const isSavingDescription = ref(false);

// When user opens a “hole” between photos, we store the target insert position here.
// This is the index in the ordered photos array where the new photo(s) should be inserted.
const pendingInsertIndex = ref(null);

// Track discarded photos by gap context (neighboring photos) to avoid re-suggesting them
// Map: "leftPhotoId-rightPhotoId" -> Set of discarded photoIds
const discardedPhotosByContext = ref(new Map());

// Track recently suggested photos with their context to identify them when removed
// Map: photoId -> { insertIndex, leftId, rightId, timestamp }
const recentlySuggestedPhotos = ref(new Map());

// Track photo being refreshed to show loading state
const refreshingPhotoId = ref(null);

// Form data
const formData = ref({
  title: "",
  description: "",
});

const formRules = {
  title: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};

// Computed para saber si se puede mostrar la grid de series
const isLoading = computed(() => {
  // For public view, only check seriesStore loading
  if (isPublicView.value) {
    return seriesStore.isLoading;
  }
  return (
    seriesStore.isLoading ||
    photosStore.isLoading ||
    !Array.isArray(photosStore.allPhotos) ||
    photosStore.allPhotos.length === 0
  );
});

// Computed properties for store data
const allSeries = computed(() => seriesStore.allSeries);

// Computed: Map of suggested photo IDs with their info for the current series
const suggestedPhotosInfo = computed(() => {
  const info = {};
  for (const [photoId, data] of recentlySuggestedPhotos.value.entries()) {
    info[photoId] = data;
  }
  return info;
});

const refreshSeries = async () => {
  await seriesStore.getOrFetch(true); // Force refresh
  updateViewingSeries();
};

const showCreateDialog = () => {
  formData.value = { title: "", description: "" };
  createDialogVisible.value = true;
};

const createSeries = async () => {
  try {
    await formRef.value?.validate();
    createDialogVisible.value = false;

    // Create empty series directly
    const seriesData = {
      title: formData.value.title,
      description: formData.value.description,
      photoIds: [], // Empty series
    };

    const newSeries = await seriesStore.createSeries(seriesData);

    message.success(`Series "${formData.value.title}" created successfully`);

    // Clear form
    formData.value = { title: "", description: "" };

    // Navigate directly to the newly created series
    router.push({
      name: "series-detail",
      params: { id: newSeries.id },
    });
  } catch (error) {
    console.error("Error creating series:", error);
  }
};

const showAddPhotosDialog = () => {
  pendingInsertIndex.value = null;
  photosDialogVisible.value = true;
};

const handleAddPhotosAt = (insertIndex) => {
  pendingInsertIndex.value = insertIndex;
  photosDialogVisible.value = true;
};

const handleSuggestPhotoAt = async (payload) => {
  if (!viewingSeries.value) return;

  const insertIndex =
    typeof payload === "number" ? payload : payload?.insertIndex;
  const criteria = typeof payload === "object" ? payload?.criteria : "story";
  const safeCriteria = criteria || "story";

  // Allow explicit leftId/rightId to be passed (for refresh scenarios)
  const explicitLeftId =
    typeof payload === "object" ? payload?.leftId : undefined;
  const explicitRightId =
    typeof payload === "object" ? payload?.rightId : undefined;

  const photos = viewingSeries.value.photos || [];

  // Use explicit IDs if provided, otherwise calculate from position
  const left =
    explicitLeftId !== undefined
      ? { id: explicitLeftId }
      : insertIndex > 0
        ? photos[insertIndex - 1]
        : null;
  const right =
    explicitRightId !== undefined
      ? { id: explicitRightId }
      : insertIndex < photos.length
        ? photos[insertIndex]
        : null;

  const anchorIds = [left?.id, right?.id].filter(Boolean);

  if (anchorIds.length === 0) {
    message.warning("Add at least one neighboring photo first");
    return;
  }

  // Build context key for this gap
  const contextKey = `${left?.id || "start"}-${right?.id || "end"}`;

  // Get discarded photos for this specific gap context
  const discardedForThisGap =
    discardedPhotosByContext.value.get(contextKey) || new Set();

  // Combine current photos in series with discarded photos for this gap
  const currentPhotosIds = [
    ...photos.map((p) => p.id),
    ...Array.from(discardedForThisGap),
  ];

  try {
    const response = await api.post(`/api/search/byPhotos`, {
      anchorIds,
      currentPhotosIds,
      criteria: safeCriteria,
      opposite: false,
      inverted: false,
      resultLength: 1,
    });

    const backendPhotos = Array.isArray(response.data)
      ? response.data
      : [response.data];
    const suggested = backendPhotos[0];

    if (!suggested?.id) {
      message.error("No suggestion found");
      return;
    }

    // Track this suggestion with its context and criteria
    recentlySuggestedPhotos.value.set(suggested.id, {
      insertIndex,
      leftId: left?.id || null,
      rightId: right?.id || null,
      criteria: safeCriteria,
      timestamp: Date.now(),
    });

    await seriesStore.insertPhotosAt(
      viewingSeries.value.id,
      [suggested.id],
      insertIndex,
    );
    // message.success("Suggestion added to the series");
    await refreshSeries();
  } catch (error) {
    console.error("Error getting suggestion:", error);
  }
};

const openFullscreenViewer = () => {
  if (viewingSeries.value?.photos?.length > 0) {
    fullscreenViewerVisible.value = true;
  }
};

const onPhotosSelected = async (photoIds) => {
  if (!photoIds || photoIds.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }

  // Only used to add photos to existing series
  if (showSeriesView.value && viewingSeries.value) {
    try {
      if (pendingInsertIndex.value !== null) {
        await seriesStore.insertPhotosAt(
          viewingSeries.value.id,
          photoIds,
          pendingInsertIndex.value,
        );
      } else {
        await seriesStore.addPhotosToSeries(viewingSeries.value.id, photoIds);
      }

      message.success(
        `Added ${photoIds.length} photo${
          photoIds.length > 1 ? "s" : ""
        } to the series.`,
      );
      photosDialogVisible.value = false;
      pendingInsertIndex.value = null;
      await refreshSeries();
    } catch (error) {
      console.error("Error adding photos to series:", error);
    }
  }
};

const handleRefreshSuggestion = async (photoId) => {
  if (!viewingSeries.value) return;

  const suggestionInfo = recentlySuggestedPhotos.value.get(photoId);
  if (!suggestionInfo) {
    message.warning("This photo was not suggested");
    return;
  }

  // Mark current photo as discarded
  const contextKey = `${suggestionInfo.leftId || "start"}-${
    suggestionInfo.rightId || "end"
  }`;

  if (!discardedPhotosByContext.value.has(contextKey)) {
    discardedPhotosByContext.value.set(contextKey, new Set());
  }

  const discardedSet = discardedPhotosByContext.value.get(contextKey);
  discardedSet.add(photoId);

  // Remove from tracking
  recentlySuggestedPhotos.value.delete(photoId);

  // Set refreshing state to show loading placeholder
  refreshingPhotoId.value = photoId;

  try {
    // Remove the photo (without refreshing UI yet)
    await seriesStore.removePhotosFromSeries(viewingSeries.value.id, [photoId]);

    // Request a new suggestion with the same criteria and context
    await handleSuggestPhotoAt({
      insertIndex: suggestionInfo.insertIndex,
      criteria: suggestionInfo.criteria,
      leftId: suggestionInfo.leftId,
      rightId: suggestionInfo.rightId,
    });
  } catch (error) {
    console.error("Error refreshing suggestion:", error);
    // On error, refresh to restore correct state
    await refreshSeries();
  } finally {
    // Clear refreshing state
    refreshingPhotoId.value = null;
  }
};

const handleRemovePhoto = async (photoId) => {
  if (!viewingSeries.value) return;

  // Check if this photo was recently suggested
  const suggestionInfo = recentlySuggestedPhotos.value.get(photoId);

  // If it was suggested in the last 5 minutes, mark it as discarded for that gap
  if (suggestionInfo && Date.now() - suggestionInfo.timestamp < 5 * 60 * 1000) {
    const contextKey = `${suggestionInfo.leftId || "start"}-${
      suggestionInfo.rightId || "end"
    }`;

    // Get or create the discarded set for this context
    if (!discardedPhotosByContext.value.has(contextKey)) {
      discardedPhotosByContext.value.set(contextKey, new Set());
    }

    const discardedSet = discardedPhotosByContext.value.get(contextKey);
    discardedSet.add(photoId);

    console.log(
      `Photo ${photoId} marked as discarded for gap context: ${contextKey}`,
    );

    // Remove from recently suggested
    recentlySuggestedPhotos.value.delete(photoId);
  }

  try {
    await seriesStore.removePhotosFromSeries(viewingSeries.value.id, [photoId]);
    message.success("Photo removed from series");
    await refreshSeries();
  } catch (error) {
    console.error("Error removing photo:", error);
  }
};

const handleReorder = async (newOrder) => {
  if (!viewingSeries.value) return;

  try {
    await seriesStore.updatePhotoOrder(viewingSeries.value.id, newOrder);
    // Don't refresh here to avoid flickering - the local state is already updated
  } catch (error) {
    console.error("Error reordering photos:", error);
    await refreshSeries(); // Refresh to restore correct order on error
  }
};

const handleMovePhoto = async (photoId, newPosition) => {
  if (!viewingSeries.value) return;

  try {
    await seriesStore.movePhoto(viewingSeries.value.id, photoId, newPosition);
    // Don't refresh here to avoid flickering - the local state is already updated
  } catch (error) {
    console.error("Error moving photo:", error);
    await refreshSeries(); // Refresh to restore correct order on error
  }
};

const handlePhotosUpdated = (updatedPhotos) => {
  // Update viewingSeries.photos with the new order
  if (viewingSeries.value) {
    viewingSeries.value.photos = updatedPhotos;
  }
};

const togglePhotoSelection = (photoId) => {
  localTogglePhotoSelection(photoId);
};

const handleDownloadMultiple = async () => {
  if (localSelectedPhotoIds.value.length === 0) {
    message.warning("Please select at least one photo to download");
    return;
  }

  try {
    // Get full photo objects from selected IDs
    const selectedPhotos = viewingSeries.value.photos.filter((photo) =>
      localSelectedPhotoIds.value.includes(photo.id),
    );

    await downloadPhotosZip(selectedPhotos);
    message.success(`Downloaded ${selectedPhotos.length} photo(s)`);
    localClearAllSelections();
  } catch (error) {
    console.error("Error downloading photos:", error);
  }
};

const handleRemoveSelectedFromSeries = async () => {
  if (!viewingSeries.value || localSelectedPhotoIds.value.length === 0) {
    return;
  }

  try {
    await seriesStore.removePhotosFromSeries(
      viewingSeries.value.id,
      localSelectedPhotoIds.value,
    );
    message.success(
      `Removed ${localSelectedPhotoIds.value.length} photo(s) from series`,
    );
    localClearAllSelections();
    await refreshSeries();
  } catch (error) {
    console.error("Error removing photos:", error);
  }
};

const handleMoveToTool = () => {
  if (localSelectedPhotoIds.value.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }
  openToolSelector();
};

const handleSendToChat = async () => {
  await takeToChat(localSelectedPhotoIds.value, localClearAllSelections);
};

const handleToolSelected = async (toolId) => {
  // Para el atlas, ordenar los IDs según el orden de la serie
  let photoIds = localSelectedPhotoIds.value;

  if (toolId === "3d-atlas" && viewingSeries.value?.photos) {
    // Filtrar las fotos de la serie manteniendo solo las seleccionadas, en el orden correcto
    const selectedSet = new Set(photoIds);
    photoIds = viewingSeries.value.photos
      .filter((photo) => selectedSet.has(photo.id))
      .map((photo) => photo.id);

    console.log("🎬 Atlas: IDs ordenados según serie:", photoIds);
  }

  await takeToTool(toolId, photoIds, localClearAllSelections);
  closeToolSelector();
};

const openSeries = (series) => {
  router.push({ name: "series-detail", params: { id: series.id } });
};

const backToSeries = () => {
  // Clear suggestion tracking when leaving series detail
  recentlySuggestedPhotos.value.clear();
  discardedPhotosByContext.value.clear();
  router.push({ name: "series" });
};

// Edit title methods
const startEditTitle = () => {
  editedTitle.value =
    viewingSeries.value.name || viewingSeries.value.title || "";
  editingTitle.value = true;
};

const saveTitle = async () => {
  if (!viewingSeries.value || !editedTitle.value.trim()) {
    message.warning("Series name cannot be empty");
    return;
  }

  isSavingTitle.value = true;
  try {
    await seriesStore.updateSeries(viewingSeries.value.id, {
      title: editedTitle.value.trim(),
      description: viewingSeries.value.description,
    });
    message.success("Series name updated");
    editingTitle.value = false;
    updateViewingSeries();
  } catch (error) {
    console.error("Error updating series name:", error);
  } finally {
    isSavingTitle.value = false;
  }
};

const cancelEditTitle = () => {
  editingTitle.value = false;
  editedTitle.value = "";
};

// Edit description methods
const startEditDescription = () => {
  editedDescription.value = viewingSeries.value.description || "";
  editingDescription.value = true;
};

const saveDescription = async () => {
  if (!viewingSeries.value) return;

  isSavingDescription.value = true;
  try {
    await seriesStore.updateSeries(viewingSeries.value.id, {
      title: viewingSeries.value.name || viewingSeries.value.title,
      description: editedDescription.value.trim() || "",
    });
    message.success("Series description updated");
    editingDescription.value = false;
    updateViewingSeries();
  } catch (error) {
    console.error("Error updating series description:", error);
  } finally {
    isSavingDescription.value = false;
  }
};

const cancelEditDescription = () => {
  editingDescription.value = false;
  editedDescription.value = "";
};

const showDeleteConfirmation = () => {
  deleteConfirmationVisible.value = true;
};

const deleteSeries = async () => {
  if (!viewingSeries.value) return;

  try {
    await seriesStore.deleteSeries(viewingSeries.value.id);

    message.success(`Series deleted successfully`);
    deleteConfirmationVisible.value = false;

    // Redirect back to series list
    router.push({ name: "series" });
  } catch (error) {
    console.error("Error deleting series:", error);
  }
};

const formatDate = (date) => {
  return seriesStore.formatDate(date);
};

// Show photo info dialog
const handleShowPhotoInfo = async (photoId) => {
  console.log("[SeriesView] handleShowPhotoInfo called with photoId:", photoId);

  try {
    // Fetch full photo data from API
    const fullPhoto = await photosStore.fetchPhoto(photoId);
    console.log("[SeriesView] Full photo fetched from API:", fullPhoto);

    if (fullPhoto) {
      selectedPhotoForInfo.value = fullPhoto;
      photoInfoDialogVisible.value = true;
    } else {
      console.error("[SeriesView] Photo not found:", photoId);
      message.error("Photo not found");
    }
  } catch (error) {
    console.error("[SeriesView] Error fetching photo:", error);
  }
};

// Copy series link to clipboard
const copySeriesLink = async () => {
  if (!viewingSeries.value) return;

  const userEmail = userStore.user?.email;
  const seriesName = viewingSeries.value.name || viewingSeries.value.title;

  if (!userEmail || !seriesName) {
    message.error("Unable to generate share link");
    return;
  }

  // Extract username from email (part before @)
  const userName = userEmail.split("@")[0];

  // Replace spaces with underscores and encode for URL
  const urlName = seriesName.replace(/\s+/g, "_").toLowerCase();
  const shareUrl = `${window.location.origin}/shared-series/${userName}/${urlName}`;

  try {
    await navigator.clipboard.writeText(shareUrl);
    message.success("Link copied to clipboard!");
  } catch (error) {
    console.error("Failed to copy link:", error);
    message.error("Failed to copy link to clipboard");
  }
};

// Watch for route changes to update the view
const updateViewingSeries = () => {
  // Skip if this is a public view (handled separately)
  if (isPublicView.value) return;

  const id = route.params.id;
  if (id && allSeries.value.length > 0) {
    const series = seriesStore.getSeriesWithFullPhotos(id, photosStore);
    if (series) {
      // If switching to a different series, clear tracking
      if (viewingSeries.value?.id !== series.id) {
        recentlySuggestedPhotos.value.clear();
        discardedPhotosByContext.value.clear();
      }
      viewingSeries.value = series;
      showSeriesView.value = true;
      seriesStore.setCurrentSeries(series);
      return;
    }
  }
  viewingSeries.value = null;
  showSeriesView.value = false;
  seriesStore.clearCurrentSeries();
};

// Load public series by name for anonymous users
const loadPublicSeries = async () => {
  const { userId, serieName } = route.params;
  if (!userId || !serieName) {
    publicLoadError.value = true;
    return;
  }

  try {
    // Replace underscores back to spaces for backend call
    const decodedName = String(serieName).replace(/_/g, " ");
    const series = await seriesStore.fetchSeriesByName(userId, decodedName);
    if (series) {
      viewingSeries.value = series;
      showSeriesView.value = true;
      // Auto-open fullscreen viewer for public view
      if (series.photos && series.photos.length > 0) {
        fullscreenViewerVisible.value = true;
      }
    } else {
      publicLoadError.value = true;
    }
  } catch (error) {
    console.error("Error loading public series:", error);
    publicLoadError.value = true;
  }
};

onMounted(async () => {
  // Check if this is a public view route
  if (route.name === "shared-series") {
    isPublicView.value = true;
    await loadPublicSeries();
    return;
  }

  // Normal authenticated flow
  try {
    await photosStore.getOrFetch();
    await seriesStore.getOrFetch();
    updateViewingSeries();

    // Load photos from query params if present (e.g., ?source=lightroom&ids=123,456)
    const photoIdsFromQuery = getPhotoIdsFromQuery({
      clearAfterLoad: true,
      onReady: async (photoIds) => {
        if (photoIds.length > 0 && viewingSeries.value) {
          await onPhotosSelected(photoIds);
          console.log(
            `✅ Added ${photoIds.length} photos from URL to series (async)`,
          );
        }
      },
    });

    // Caso sync: si el store ya estaba cargado, añadir las fotos inmediatamente
    if (photoIdsFromQuery.length > 0 && viewingSeries.value) {
      await onPhotosSelected(photoIdsFromQuery);
      console.log(
        `✅ Added ${photoIdsFromQuery.length} photos from URL to series`,
      );
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
});

watch(
  [() => route.params.id, allSeries, () => photosStore.allPhotos],
  updateViewingSeries,
);

// Watch for fullscreen viewer closing in public view to redirect
watch(fullscreenViewerVisible, (isVisible) => {
  if (!isVisible && isPublicView.value) {
    // When user closes fullscreen in public view, redirect to landing
    router.push({ name: "landing" });
  }
});
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.series-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
}

.series-list-header {
  margin-bottom: var(--spacing-3xl);
}

.header-content {
  text-align: left;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.page-subtitle {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  margin: 0;
}

/* Series Grid */
.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  text-align: center;
}

.loading-text {
  margin-top: var(--spacing-md);
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}

/* Sequential photo arrangement for series cards */
.photo-sequence {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sequence-photo {
  position: relative;
  width: 50px;
  height: 60px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  overflow: hidden;
}

.photo-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

.sequence-number {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  z-index: 1;
}

/* Hover effects for photo sequence (now with 3 photos) */
.card:hover .sequence-photo {
  transform: translateY(-4px);
}

.card:hover .sequence-photo.sequence-1 {
  transform: translateY(-6px);
}
.card:hover .sequence-photo.sequence-2 {
  transform: translateY(-4px);
}
.card:hover .sequence-photo.sequence-3 {
  transform: translateY(-6px);
}

/* Series Detail View Styles */
.series-detail-view {
  margin: 0 auto;
  background-color: var(--bg-body);
}

.play-series-button {
  font-size: var(--font-size-sm);
}

.play-series-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.series-title-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: var(--spacing-xs);
}

.share-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  min-width: 32px;
  margin-top: 5px;
}

.share-button:hover {
  color: var(--primary-color);
}

/* Edit mode styles */
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

.description-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
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

.series-photos {
  width: 100%;
}

/* Empty Series State */
.empty-series-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: calc(100vh - 300px);

  text-align: center;
}

.empty-series-content {
  max-width: 400px;
}

.empty-series-icon {
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-lg);
}

.empty-series-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.empty-series-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: 1.5;
}

.create-series-btn {
  font-size: var(--font-size-md);
  padding: var(--spacing-md) var(--spacing-xl);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .series-view {
    padding: var(--spacing-lg);
  }

  .page-title {
    font-size: var(--font-size-3xl);
  }

  .sequence-photo {
    width: 40px;
    height: 50px;
  }
}

@media (max-width: 1024px) {
  .series-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1600px) {
  .series-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Public View Styles */
.public-loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--bg-body);
}

.public-error-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--bg-body);
}

.error-content {
  text-align: center;
  max-width: 400px;
  padding: var(--spacing-2xl);
}

.error-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: var(--spacing-lg) 0 var(--spacing-md) 0;
}

.error-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: 1.5;
}

.public-series-view {
  min-height: 100vh;
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.public-background {
  text-align: center;
  color: white;
  opacity: 0.7;
}

.public-series-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  margin: 0 0 var(--spacing-sm) 0;
}

.public-series-meta {
  font-size: var(--font-size-lg);
  margin: 0;
  opacity: 0.7;
}
</style>
