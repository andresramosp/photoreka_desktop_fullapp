<template>
  <div class="similar-photos-section">
    <!-- Criteria Selector + Embedded Action Bar -->
    <div class="similar-header">
      <n-select
        v-model:value="criteria"
        size="small"
        :options="criteriaOptions"
        :render-label="renderCriteriaLabel"
        class="criteria-select"
        :disabled="isLoading"
      />
      <FloatingActionBar
        embedded
        :selected-ids="selectedIds"
        :show-delete="false"
        :show-add-to-collection="true"
        :show-move-to-tool="true"
        :show-send-to-chat="true"
        :is-downloading="isDownloading"
        class="similar-action-bar-embedded"
        :class="{ 'similar-action-bar-hidden': selectedIds.length === 0 }"
        @download="handleDownload"
        @add-to-collection="showCollectionModal = true"
        @move-to-tool="openToolSelector"
        @send-to-chat="handleSendToChat"
      />
    </div>

    <!-- Photo Grid -->
    <div class="similar-grid-wrapper">
      <!-- Loading state -->
      <div v-if="isLoading" class="similar-grid">
        <div v-for="n in 8" :key="`skel-${n}`" class="similar-photo-skeleton">
          <n-skeleton height="100%" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="!isLoading && photos.length === 0" class="similar-empty">
        <n-icon size="32" color="var(--text-tertiary)">
          <ImagesOutline />
        </n-icon>
        <p>No similar photos found</p>
      </div>

      <!-- Photo cards grid -->
      <div v-else class="similar-grid">
        <PhotoCard
          v-for="photo in photos"
          :key="photo.id"
          :photo="photo"
          :selected="selectedIds.includes(photo.id)"
          :show-info-button="true"
          :show-stars="false"
          :require-long-press="false"
          @select="toggleSelection(photo.id)"
          @info="handlePhotoInfo"
        />
      </div>
    </div>

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedIds.length"
      :photo-ids="selectedIds"
      @add-to-collection="onCollectionAdded"
      @add-to-series="onCollectionAdded"
      @cancel="showCollectionModal = false"
    />

    <!-- Tool Selector -->
    <PhotoToolSelector
      :show="showToolSelectorModal"
      :photo-count="selectedIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="showToolSelectorModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { NSelect, NIcon, NSkeleton } from "naive-ui";
import { ImagesOutline } from "@vicons/ionicons5";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import type { Photo } from "@/components/photoCards/PhotoCard.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { api } from "@/utils/axios.ts";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import {
  criteriaOptions as buildCriteriaOptions,
  renderCriteriaLabel,
} from "@/config/searchCriteria";

const props = defineProps<{
  selectedPhoto: Photo | null;
}>();

const emit = defineEmits<{
  (e: "navigate-to-photo", photo: Photo): void;
}>();

// Criteria options (excluding "tags" as it requires interactive tag selection)
const criteriaOptions = buildCriteriaOptions([
  "embedding",
  "story",
  "content",
  "context",
  "chromatic",
]);

const criteria = ref("embedding");
const photos = ref<Photo[]>([]);
const isLoading = ref(false);
const selectedIds = ref<string[]>([]);

const showCollectionModal = ref(false);
const showToolSelectorModal = ref(false);
const isDownloading = ref(false);

const { downloadPhoto } = usePhotoDownload();
const {
  takeToTool,
  takeToChat,
  isProcessing: isProcessingTool,
  openToolSelector: openToolSelectorComposable,
  closeToolSelector,
} = usePhotoToolSelection();

function openToolSelector() {
  showToolSelectorModal.value = true;
}

async function loadSimilarPhotos() {
  if (!props.selectedPhoto?.id) return;
  isLoading.value = true;
  selectedIds.value = [];
  try {
    const { data } = await api.post("/api/search/byPhotos", {
      anchorIds: [props.selectedPhoto.id],
      currentPhotosIds: [],
      criteria: criteria.value,
      opposite: false,
      inverted: false,
      resultLength: 20,
      tagIds: [],
      boxesIds: [],
      collectionId: null,
    });
    photos.value = Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error("Similar photos load failed:", e);
    photos.value = [];
  } finally {
    isLoading.value = false;
  }
}

function toggleSelection(photoId: string) {
  const idx = selectedIds.value.indexOf(photoId);
  if (idx > -1) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(photoId);
  }
}

function clearSelection() {
  selectedIds.value = [];
}

function handlePhotoInfo(photo: Photo) {
  emit("navigate-to-photo", photo);
}

async function handleDownload() {
  isDownloading.value = true;
  try {
    for (const id of selectedIds.value) {
      const photo = photos.value.find((p) => p.id === id);
      if (photo) await downloadPhoto(photo);
    }
  } finally {
    isDownloading.value = false;
  }
}

function onCollectionAdded() {
  showCollectionModal.value = false;
}

async function handleToolSelected(
  toolId: string,
  canvasId: string | null = null,
) {
  showToolSelectorModal.value = false;
  await takeToTool(toolId, [...selectedIds.value], clearSelection, canvasId);
}

async function handleSendToChat() {
  await takeToChat([...selectedIds.value], clearSelection);
}

// Reload when photo or criteria changes
watch(
  [() => props.selectedPhoto?.id, criteria],
  () => {
    loadSimilarPhotos();
  },
  { immediate: true },
);
</script>

<style scoped>
.similar-photos-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  position: relative;
  height: 100%;
}

.similar-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.similar-action-bar-embedded {
  margin-left: auto;
  flex-shrink: 0;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
}

.similar-action-bar-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.criteria-select {
  flex: 1;
  max-width: 200px;
}

.similar-grid-wrapper {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 400px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  padding-right: 4px;
}

.similar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-sm);
}

.similar-photo-skeleton {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-surface);
}

.similar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl) 0;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* PhotoCard sizing inside grid */
.similar-grid :deep(.photo-card) {
  width: 100%;
  aspect-ratio: 1;
}

@media (max-width: 768px) {
  .similar-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
