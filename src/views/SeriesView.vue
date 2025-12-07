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
      <div class="series-header">
        <div class="series-header-content">
          <div class="series-header-actions">
            <n-button text @click="backToSeries" class="back-button">
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
                class="delete-button"
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
            <h1 class="series-title">
              {{ viewingSeries.name || viewingSeries.title }}
            </h1>
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
          <p class="series-description" v-if="viewingSeries.description">
            {{ viewingSeries.description }}
          </p>
          <p class="series-meta">
            {{ (viewingSeries.photos || []).length }} photos • Updated
            {{ formatDate(viewingSeries.updatedAt) }}
          </p>
        </div>
      </div>

      <!-- Series Photos Strip -->
      <div class="series-photos">
        <SeriesPhotoStrip
          :photos="viewingSeries.photos || []"
          :series-id="route.params.id"
          @add-photos="showAddPhotosDialog"
          @remove-photo="handleRemovePhoto"
          @reorder="handleReorder"
          @move-photo="handleMovePhoto"
          @photos-updated="handlePhotosUpdated"
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

      <div v-else class="series-grid">
        <!-- Create New Series Card (only show when there are existing series) -->
        <div
          v-if="allSeries.length > 0"
          class="series-card create-card"
          @click="showCreateDialog"
        >
          <div class="create-preview">
            <div class="create-icon">
              <n-icon size="48" color="var(--primary-color)">
                <AddOutline />
              </n-icon>
            </div>
          </div>
          <div class="series-info">
            <h3 class="series-card-title">Create New Series</h3>
            <p class="series-card-meta">Start your photo sequence</p>
          </div>
        </div>

        <!-- Existing Series -->
        <div
          v-for="series in allSeries"
          :key="series.id"
          class="series-card"
          @click="openSeries(series)"
        >
          <div class="series-preview">
            <div
              v-if="series.photos && series.photos.length > 0"
              class="photo-sequence"
            >
              <div
                v-for="(photo, index) in series.photos.slice(0, 4)"
                :key="photo.id"
                class="sequence-photo"
                :class="`sequence-${index + 1}`"
              >
                <div
                  class="photo-placeholder"
                  :style="{ background: photo.gradient }"
                ></div>
                <span class="sequence-number">{{ index + 1 }}</span>
              </div>
            </div>
            <div v-else class="empty-preview">
              <n-icon size="40" color="#ffffff73">
                <ListOutline />
              </n-icon>
            </div>
          </div>
          <div class="series-info">
            <h3 class="series-card-title">
              {{ series.name || series.title }}
            </h3>
            <p class="series-card-meta">
              {{ (series.photos || []).length }} photos • Updated
              {{ formatDate(series.updatedAt) }}
            </p>
          </div>
        </div>

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
              type="textarea"
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
} from "@vicons/ionicons5";
import PhotosDialog from "@/components/PhotosDialog.vue";
import { useUserStore } from "@/stores/userStore";
import SeriesPhotoStrip from "@/components/SeriesPhotoStrip.vue";
import SeriesFullscreenViewer from "@/components/SeriesFullscreenViewer.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useSeriesStore } from "@/stores/series.js";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const seriesStore = useSeriesStore();
const userStore = useUserStore();

// State
const createDialogVisible = ref(false);
const photosDialogVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const fullscreenViewerVisible = ref(false);
const formRef = ref(null);
const viewingSeries = ref(null); // Series being viewed
const showSeriesView = ref(false); // Whether to show series view or grid view
const isPublicView = ref(false); // Whether this is a public anonymous view
const publicLoadError = ref(false); // Whether there was an error loading the public series

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
    message.error("Failed to create series. Please try again.");
  }
};

const showAddPhotosDialog = () => {
  photosDialogVisible.value = true;
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
      await seriesStore.addPhotosToSeries(viewingSeries.value.id, photoIds);

      message.success(
        `Added ${photoIds.length} photo${
          photoIds.length > 1 ? "s" : ""
        } to the series.`
      );
      photosDialogVisible.value = false;
      await refreshSeries();
    } catch (error) {
      console.error("Error adding photos to series:", error);
      message.error("Failed to add photos. Please try again.");
    }
  }
};

const handleRemovePhoto = async (photoId) => {
  if (!viewingSeries.value) return;

  try {
    await seriesStore.removePhotosFromSeries(viewingSeries.value.id, [photoId]);
    message.success("Photo removed from series");
    await refreshSeries();
  } catch (error) {
    console.error("Error removing photo:", error);
    message.error("Failed to remove photo. Please try again.");
  }
};

const handleReorder = async (newOrder) => {
  if (!viewingSeries.value) return;

  try {
    await seriesStore.updatePhotoOrder(viewingSeries.value.id, newOrder);
    // Don't refresh here to avoid flickering - the local state is already updated
  } catch (error) {
    console.error("Error reordering photos:", error);
    message.error("Failed to reorder photos. Please try again.");
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
    message.error("Failed to move photo. Please try again.");
    await refreshSeries(); // Refresh to restore correct order on error
  }
};

const handlePhotosUpdated = (updatedPhotos) => {
  // Update viewingSeries.photos with the new order
  if (viewingSeries.value) {
    viewingSeries.value.photos = updatedPhotos;
  }
};
const openSeries = (series) => {
  router.push({ name: "series-detail", params: { id: series.id } });
};

const backToSeries = () => {
  router.push({ name: "series" });
};

const showDeleteConfirmation = () => {
  deleteConfirmationVisible.value = true;
};

const deleteSeries = async () => {
  if (!viewingSeries.value) return;

  try {
    await seriesStore.deleteSeries(viewingSeries.value.id);

    message.success(
      `Series "${
        viewingSeries.value.name || viewingSeries.value.title
      }" deleted successfully`
    );
    deleteConfirmationVisible.value = false;

    // Redirect back to series list
    router.push({ name: "series" });
  } catch (error) {
    console.error("Error deleting series:", error);
    message.error("Failed to delete series. Please try again.");
  }
};

const formatDate = (date) => {
  return seriesStore.formatDate(date);
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
  } catch (error) {
    console.error("Error loading data:", error);
    message.error("Failed to load series");
  }
});

watch(
  [() => route.params.id, allSeries, () => photosStore.allPhotos],
  updateViewingSeries
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

.series-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.series-card {
  background-color: #18181c;
  border: 1px solid #2c2c32;
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.series-card:hover {
  border-color: #2563eb;
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.2);
}

.series-preview {
  position: relative;
  height: 120px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
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

.sequence-photo .photo-placeholder {
  width: 100%;
  height: 100%;
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
}

/* Hover effects for photo sequence */
.series-card:hover .sequence-photo {
  transform: translateY(-4px);
}

.series-card:hover .sequence-photo.sequence-1 {
  transform: translateY(-6px);
}
.series-card:hover .sequence-photo.sequence-2 {
  transform: translateY(-4px);
}
.series-card:hover .sequence-photo.sequence-3 {
  transform: translateY(-4px);
}
.series-card:hover .sequence-photo.sequence-4 {
  transform: translateY(-6px);
}

.empty-preview {
  display: flex;
  align-items: center;
  justify-content: center;
}

.series-info {
  text-align: center;
}

.series-card-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffffd1;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.series-card-meta {
  font-size: 14px;
  color: #ffffff73;
  margin: 0;
  line-height: 1.4;
}

/* Create Card Specific Styles */
.create-card {
  border: 2px dashed #2c2c32;
  background-color: transparent;
}

.create-card:hover {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.05);
}

.create-preview {
  position: relative;
  height: 120px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.create-icon {
  padding: 20px;
  border-radius: 50%;
  background-color: rgba(37, 99, 235, 0.1);
  transition: all 0.3s ease;
}

.create-card:hover .create-icon {
  background-color: rgba(37, 99, 235, 0.2);
  transform: scale(1.1);
}

/* Create Form */
.create-form {
  padding-top: var(--spacing-md);
}

/* Series Detail View Styles */
.series-detail-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
}

.series-header {
  margin-bottom: var(--spacing-3xl);
}

.series-header-content {
  text-align: left;
}

.series-header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.back-button {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}

.back-button:hover {
  color: var(--primary-color);
}

.play-series-button {
  font-size: var(--font-size-sm);
}

.play-series-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-button {
  font-size: var(--font-size-sm);
}

.delete-button:hover {
  color: #ef4444 !important;
  border-color: #ef4444 !important;
}

.series-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.series-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0;
}

.share-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
}

.share-button:hover {
  color: var(--primary-color);
}

.series-description {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-sm) 0;
  max-width: 600px;
  line-height: 1.6;
}

.series-meta {
  font-size: var(--font-size-md);
  color: var(--text-tertiary);
  margin: 0;
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
  min-height: 400px;
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

/* Delete Confirmation Dialog */
.delete-confirmation {
  padding: var(--spacing-md) 0;
}

.delete-confirmation p {
  margin: 0 0 var(--spacing-md) 0;
  line-height: 1.5;
}

.delete-warning {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.3);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .series-view {
    padding: var(--spacing-lg);
  }

  .page-title {
    font-size: var(--font-size-3xl);
  }

  .series-header-actions {
    flex-direction: column;
    gap: var(--spacing-sm);
    align-items: flex-start;
  }

  .delete-button {
    align-self: flex-end;
    font-size: var(--font-size-xs);
  }

  .series-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .series-card {
    padding: 16px;
  }

  .series-preview {
    height: 100px;
    margin-bottom: 12px;
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
