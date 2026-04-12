<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    :style="{ maxWidth: '90vw', width: '900px', maxHeight: '90vh' }"
    :on-mask-click="close"
    :closable="false"
    :bordered="false"
  >
    <template #icon>
      <SwapHorizontalOutline />
    </template>
    <template #header>
      <div class="dialog-header">
        <h2 class="dialog-title">Replace Analyzed Photos</h2>
      </div>
    </template>

    <div class="dialog-content">
      <div class="swap-row">
        <!-- New Photo (source) -->
        <div class="source-photo-wrapper">
          <PhotoCardHub
            v-if="cleanedNewPhoto"
            :photo="cleanedNewPhoto"
            :selected="false"
            :show-footer="false"
            :show-delete="false"
            :show-name="false"
            :is-uploading="false"
            :show-duplicate="false"
            @info="handleShowInfo"
          />
        </div>

        <!-- Arrow -->
        <div class="swap-arrow">
          <n-icon size="28" color="var(--primary-color)">
            <ArrowForwardOutline />
          </n-icon>
          <span class="arrow-label">replaces</span>
        </div>

        <!-- Target Photos with horizontal scroll -->
        <div class="targets-scroll">
          <PhotoCardHub
            v-for="photo in targetPhotos"
            :key="photo.id"
            :photo="photo"
            :selected="selectedTargetIds.includes(photo.id)"
            :show-footer="false"
            :show-delete="false"
            :show-name="false"
            :is-uploading="false"
            :show-duplicate="false"
            @select="toggleTargetSelection"
            @info="handleShowInfo"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="targetPhotos.length === 0" class="empty-state">
        <div class="empty-state-content">
          <h3 class="empty-state-title">No analyzed matches found</h3>
          <p class="empty-state-description">
            No analyzed workspace photos match this upload.
          </p>
        </div>
      </div>
    </div>

    <template #action>
      <div class="dialog-actions">
        <n-button @click="close">Cancel</n-button>
        <n-button
          v-if="targetPhotos.length > 1"
          type="warning"
          :disabled="isSwapping"
          :loading="isSwapping"
          @click="handleSwapAll"
        >
          Replace All ({{ targetPhotos.length }})
        </n-button>
        <n-button
          type="primary"
          :disabled="selectedTargetIds.length === 0 || isSwapping"
          :loading="isSwapping"
          @click="handleSwapSelected"
        >
          Replace Selected ({{ selectedTargetIds.length }})
        </n-button>
      </div>
    </template>
  </n-modal>

  <PhotoInfoDialog
    v-model="showInfoDialog"
    :selected-photo="infoPhoto"
    :all-photos="[]"
    :current-photo-index="-1"
    @change-photo="infoPhoto = $event"
  />
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { NModal, NButton, NIcon, useMessage } from "naive-ui";
import { api } from "@/utils/axios";
import PhotoCardHub from "./photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "./PhotoInfoDialog.vue";

import { SwapHorizontalOutline, ArrowForwardOutline } from "@vicons/ionicons5";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  /** The new lightbox photo that will provide its image */
  newPhotoId: {
    type: Number,
    default: null,
  },
  /** IDs of analyzed workspace photos that are candidates for replacement */
  targetIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:modelValue", "swap-complete"]);

const photosStore = usePhotosStore();
const message = useMessage();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const selectedTargetIds = ref([]);
const isSwapping = ref(false);
const showInfoDialog = ref(false);
const infoPhoto = ref(null);

const handleShowInfo = async (photo) => {
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  infoPhoto.value = fullPhoto;
  showInfoDialog.value = true;
};

// Resolve photo objects
const newPhoto = computed(() => {
  if (!props.newPhotoId) return null;
  return photosStore.photos.find((p) => p.id === props.newPhotoId);
});

// Strip duplicate flags so the swap button doesn't appear on the source card
const cleanedNewPhoto = computed(() => {
  if (!newPhoto.value) return null;
  return {
    ...newPhoto.value,
    isAlreadyAnalyzed: false,
    alreadyAnalyzedIds: [],
  };
});

const targetPhotos = computed(() => {
  return props.targetIds
    .map((id) => photosStore.photos.find((p) => p.id === id))
    .filter(Boolean);
});

const toggleTargetSelection = (photoId) => {
  const index = selectedTargetIds.value.indexOf(photoId);
  if (index === -1) {
    selectedTargetIds.value.push(photoId);
  } else {
    selectedTargetIds.value.splice(index, 1);
  }
};

const handleSwapSelected = async () => {
  if (selectedTargetIds.value.length === 0 || !props.newPhotoId) return;
  await executeSwap(selectedTargetIds.value);
};

const handleSwapAll = async () => {
  if (targetPhotos.value.length === 0 || !props.newPhotoId) return;
  await executeSwap(targetPhotos.value.map((p) => p.id));
};

const executeSwap = async (targetIds) => {
  isSwapping.value = true;
  try {
    const { data } = await api.post("/api/catalog/swapPhotos", {
      newPhotoId: props.newPhotoId,
      targetPhotoIds: targetIds,
    });

    // Update local store: remove new photo, refresh targets
    photosStore.photos = photosStore.photos.filter(
      (p) => p.id !== props.newPhotoId,
    );

    // Update swapped photos in store with new image URLs from the newPhoto
    const sourcePhoto = newPhoto.value;
    if (sourcePhoto) {
      for (const targetId of data.swapped) {
        photosStore.updatePhoto(targetId, {
          thumbnailUrl: sourcePhoto.thumbnailUrl,
          originalUrl: sourcePhoto.originalUrl,
          originalFileName: sourcePhoto.originalFileName,
          // Reset duplicate flags
          isExactDuplicate: false,
          exactDuplicates: [],
          isAlreadyAnalyzed: false,
          alreadyAnalyzedIds: [],
          dhash: null,
        });
      }
    }

    message.success(
      `Replaced ${data.swapped.length} photo${data.swapped.length > 1 ? "s" : ""} successfully`,
    );
    emit("swap-complete", data);
    close();
  } catch (error) {
    console.error("Error swapping photos:", error);
    message.error("Failed to replace photos");
  } finally {
    isSwapping.value = false;
  }
};

const close = () => {
  selectedTargetIds.value = [];
  emit("update:modelValue", false);
};

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      selectedTargetIds.value = [];
    }
  },
);
</script>

<style scoped>
.dialog-title {
  font-size: var(--font-size-xl, 18px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs, 4px) 0;
}

.dialog-subtitle {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.dialog-content {
  padding: 4px;
  overflow: hidden;
  --swap-card-size: 180px;
}

.swap-row {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 12px;
}

.source-photo-wrapper {
  width: var(--swap-card-size);
  height: var(--swap-card-size);
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
}

.swap-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 0 2px;
}

.arrow-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.targets-scroll {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
}

.targets-scroll > * {
  width: var(--swap-card-size);
  height: var(--swap-card-size);
  flex-shrink: 0;
  overflow: hidden;
}

.targets-scroll::-webkit-scrollbar {
  height: 5px;
}

.targets-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.targets-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  text-align: center;
}

.empty-state-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.empty-state-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .dialog-content {
    --swap-card-size: 140px;
  }

  .dialog-actions {
    flex-direction: column-reverse;
  }
}

@media (max-width: 480px) {
  .dialog-content {
    --swap-card-size: 110px;
  }

  .arrow-label {
    display: none;
  }
}

@media (max-width: 380px) {
  .dialog-content {
    --swap-card-size: 90px;
  }
}
</style>
