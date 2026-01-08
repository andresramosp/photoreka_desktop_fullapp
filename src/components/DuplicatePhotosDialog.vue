<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    :style="{ maxWidth: '90vw', width: '1200px', maxHeight: '90vh' }"
    :on-mask-click="close"
    :closable="false"
    :bordered="false"
  >
    <template #icon>
      <DuplicateOutline />
    </template>
    <template #header>
      <div class="dialog-header">
        <h2 class="dialog-title">Duplicate Photos</h2>
      </div>
    </template>

    <div class="dialog-content">
      <!-- Actions Bar -->
      <div class="actions-bar">
        <div class="actions-left">
          <span class="selection-info">
            {{ selectedPhotoIds.length }} selected
          </span>
        </div>
        <div class="actions-right">
          <n-button
            v-if="showDeleteButton"
            type="warning"
            size="small"
            :disabled="duplicatePhotos.length === 0"
            @click="handleDeleteWorseVersions"
          >
            <template #icon>
              <n-icon>
                <CleanIcon />
              </n-icon>
            </template>
            {{ deleteButtonText }}
          </n-button>
          <n-button
            type="error"
            size="small"
            :disabled="selectedPhotoIds.length === 0"
            @click="handleDeleteSelected"
          >
            <template #icon>
              <n-icon>
                <DeleteIcon />
              </n-icon>
            </template>
            Delete Selected ({{ selectedPhotoIds.length }})
          </n-button>
        </div>
      </div>

      <!-- Photos Grid -->
      <div class="photos-grid">
        <div
          v-for="photo in duplicatePhotos"
          :key="photo.id"
          class="duplicate-photo-card"
          :class="{ selected: selectedPhotoIds.includes(photo.id) }"
          @click="togglePhotoSelection(photo.id)"
        >
          <div class="photo-container">
            <img
              :src="photo.thumbnailUrl || photo.url"
              :alt="photo.name"
              class="photo-image"
            />

            <!-- Delete button overlay (only on hover) -->
            <div class="delete-overlay">
              <n-button
                type="error"
                size="medium"
                class="delete-button"
                @click.stop="deletePhoto(photo.id)"
              >
                <template #icon>
                  <n-icon>
                    <DeleteIcon />
                  </n-icon>
                </template>
              </n-button>
            </div>

            <!-- Processing status indicator -->
            <div
              v-if="
                photo.status == 'uploaded' || photo.status == 'preprocessed'
              "
              class="processing-status-indicator not-processed"
            >
              <n-icon size="16">
                <WarningIcon />
              </n-icon>
            </div>
            <div v-else class="processing-status-indicator processed">
              <n-icon size="16">
                <ProcessedIcon />
              </n-icon>
            </div>

            <!-- Selection indicator -->
            <div
              v-if="selectedPhotoIds.includes(photo.id)"
              class="selection-indicator"
            >
              <n-icon size="20" color="#ffffff">
                <CheckCircleIcon />
              </n-icon>
            </div>
          </div>

          <!-- Photo info -->
          <div class="photo-info">
            <div
              class="photo-name"
              :title="photo.originalFileName || photo.name"
            >
              {{ photo.originalFileName || photo.name }}
            </div>
            <div class="photo-meta">
              <span v-if="photo.size" class="file-size">
                {{ formatFileSize(photo.size) }}
              </span>
              <span v-if="photo.width && photo.height" class="dimensions">
                {{ photo.width }}×{{ photo.height }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="duplicatePhotos.length === 0" class="empty-state">
        <div class="empty-state-content">
          <n-icon size="64" class="empty-state-icon">
            <ImageIcon />
          </n-icon>
          <h3 class="empty-state-title">No duplicates found</h3>
          <p class="empty-state-description">
            This photo doesn't have any duplicates.
          </p>
        </div>
      </div>
    </div>

    <template #action>
      <div class="dialog-actions">
        <n-button @click="close">Close</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { NModal, NButton, NIcon, useMessage } from "naive-ui";

// Import @vicons icons
import {
  TrashOutline as DeleteIcon,
  ImageOutline as ImageIcon,
  CheckmarkCircleOutline as CheckCircleIcon,
  SparklesOutline as CleanIcon,
  WarningOutline as WarningIcon,
  CheckmarkDoneOutline as ProcessedIcon,
  DuplicateOutline,
} from "@vicons/ionicons5";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  duplicates: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:modelValue"]);

const photosStore = usePhotosStore();
const message = useMessage();

// Reactive state
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const selectedPhotoIds = ref([]);

// Get full photo objects from the duplicates array
const duplicatePhotos = computed(() => {
  return props.duplicates
    .map((photoId) => photosStore.photos.find((p) => p.id === photoId))
    .filter(Boolean);
});

// Check if all photos are selected
const allSelected = computed(() => {
  return (
    duplicatePhotos.value.length > 0 &&
    duplicatePhotos.value.every((photo) =>
      selectedPhotoIds.value.includes(photo.id)
    )
  );
});

// Processing status computeds
const nonProcessedPhotos = computed(() => {
  return duplicatePhotos.value.filter(
    (photo) => photo.status == "uploaded" || photo.status == "preprocessed"
  );
});

const processedPhotos = computed(() => {
  return duplicatePhotos.value.filter((photo) => photo.status == "processed");
});

const hasMixedProcessingStatus = computed(() => {
  return (
    processedPhotos.value.length > 0 && nonProcessedPhotos.value.length > 0
  );
});

const deleteButtonText = computed(() => {
  return "Delete Non-processed";
});

const showDeleteButton = computed(() => {
  return hasMixedProcessingStatus.value;
});

// Helper functions
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return "Unknown";

  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

// Selection functions
const togglePhotoSelection = (photoId) => {
  const index = selectedPhotoIds.value.indexOf(photoId);
  if (index === -1) {
    selectedPhotoIds.value.push(photoId);
  } else {
    selectedPhotoIds.value.splice(index, 1);
  }
};

// Action handlers
const deletePhoto = async (photoId) => {
  try {
    await photosStore.deletePhotos([photoId]);

    // Remove from selected if it was selected
    const index = selectedPhotoIds.value.indexOf(photoId);
    if (index !== -1) {
      selectedPhotoIds.value.splice(index, 1);
    }

    photosStore.checkDuplicates();

    message.success("Photo deleted successfully");
  } catch (error) {
    message.error("Failed to delete photo");
  }
};

const handleDeleteSelected = async () => {
  if (selectedPhotoIds.value.length === 0) return;

  try {
    await photosStore.deletePhotos(selectedPhotoIds.value);
    selectedPhotoIds.value = [];
    message.success("Selected photos deleted successfully");
    photosStore.checkDuplicates();
  } catch (error) {
    message.error("Failed to delete selected photos");
  }
};

const handleDeleteWorseVersions = async () => {
  // Delete non-processed photos
  const nonProcessedIds = nonProcessedPhotos.value.map((photo) => photo.id);
  try {
    await photosStore.deletePhotos(nonProcessedIds);
    // Remove from selected if they were selected
    selectedPhotoIds.value = selectedPhotoIds.value.filter(
      (id) => !nonProcessedIds.includes(id)
    );
    photosStore.checkDuplicates();
    message.success("Non-processed photos deleted successfully");
  } catch (error) {
    message.error("Failed to delete non-processed photos");
  }
};

const close = () => {
  selectedPhotoIds.value = [];
  emit("update:modelValue", false);
};

// Watch for dialog open/close to reset selection
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      selectedPhotoIds.value = [];
    }
  }
);
</script>

<style scoped>
/* Dialog Header */
.dialog-header {
  text-align: center;
}

.dialog-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
  line-height: var(--line-height-tight);
}

.dialog-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

/* Dialog Content */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  max-height: 60vh;
  overflow: hidden;
}

/* Actions Bar */
.actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  background-color: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}

.actions-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.selection-info {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.actions-right {
  display: flex;
  gap: var(--spacing-sm);
}

/* Photos Grid */
.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-lg);
  overflow-y: auto;
  padding: var(--spacing-sm);
  max-height: calc(60vh - 80px);
}

/* Duplicate Photo Card */
.duplicate-photo-card {
  position: relative;
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  background-color: #2c2c32;
}

.duplicate-photo-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.duplicate-photo-card.selected {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 1px #8b5cf640, 0 8px 24px rgba(139, 92, 246, 0.2);
}

.photo-container {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background-color: #2c2c32;
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Delete overlay (only visible on hover) */
.delete-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 3;
}

.duplicate-photo-card:hover .delete-overlay {
  opacity: 1;
}

.delete-button {
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  width: 40px;
  height: 40px;
  opacity: 0.9;
  transition: opacity 0.2s ease !important;
}

.delete-button:hover {
  opacity: 1 !important;
}

/* Processing status indicator */
.processing-status-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.processing-status-indicator.not-processed {
  background-color: rgba(245, 158, 11, 0.9);
  color: white;
}

.processing-status-indicator.processed {
  background-color: rgba(34, 197, 94, 0.9);
  color: white;
}

/* Selection indicator */
.selection-indicator {
  position: absolute;
  top: 8px;
  left: 8px;
  background-color: rgba(139, 92, 246, 0.9);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
}

/* Photo info */
.photo-info {
  padding: var(--spacing-md);
  background-color: #1a1a1f;
  border-top: 1px solid #2c2c32;
}

.photo-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-meta {
  display: flex;
  gap: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.file-size,
.dimensions {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
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

/* Scrollbar styling */
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

/* Responsive Design */
@media (max-width: 1024px) {
  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
}

@media (max-width: 768px) {
  .actions-bar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-md);
  }

  .actions-left,
  .actions-right {
    justify-content: center;
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--spacing-md);
  }

  .dialog-actions {
    flex-direction: column-reverse;
  }
}

@media (max-width: 480px) {
  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .dialog-title {
    font-size: var(--font-size-lg);
  }
}
</style>
