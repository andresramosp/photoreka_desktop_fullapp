<template>
  <transition name="sidebar-slide-right">
    <div v-if="show" class="chat-sidebar chat-sidebar--right">
      <div class="sidebar-header">
        <div class="sidebar-title-group">
          <n-icon :size="20" class="sidebar-title-icon"><PicksIcon /></n-icon>
          <span class="sidebar-title">Curated Photos</span>
          <n-tooltip
            trigger="hover"
            placement="bottom"
            :style="{ maxWidth: '260px' }"
          >
            <template #trigger>
              <n-icon :size="14" class="sidebar-title-info-icon">
                <InfoIcon />
              </n-icon>
            </template>
            Use this area to to curate photos during the conversation. ChatLab
            is aware of the most recent photos you keep here.
          </n-tooltip>
        </div>
        <n-button quaternary size="small" title="Close" @click="emit('close')">
          <template #icon>
            <n-icon :size="14"><CloseIcon /></n-icon>
          </template>
        </n-button>
      </div>

      <div v-if="photos.length === 0" class="sidebar-empty">
        <n-icon :size="28" class="sidebar-empty-icon"><PicksIcon /></n-icon>
        <span>No photos kept yet</span>
        <span class="selection-empty-hint">
          Hover any photo in the chat and use the
          <n-icon :size="12" class="selection-empty-hint-icon"
            ><Checkmark
          /></n-icon>
          button to keep it here.
        </span>
      </div>

      <div v-else class="sidebar-list selection-list">
        <div class="selection-grid">
          <PhotoCardHub
            v-for="photo in photos"
            :key="photo.id"
            :photo="photo"
            :all-photos="photos"
            :showName="true"
            :showFooter="false"
            :showDelete="true"
            :showDuplicate="false"
            :show-flag="false"
            :hide-info="true"
            :hide-fullscreen="true"
            :isUploading="false"
            :selected="selectedIds.has(String(photo.id))"
            @select="(photoId: string) => emit('select', photoId)"
            @delete="(photoId: string) => emit('remove', photoId)"
          />
        </div>
      </div>

      <!-- Destinations -->
      <div class="selection-footer">
        <ModePopoverSelector
          model-value=""
          :options="exportOptions"
          header="Export your Curation"
          placeholder="Export your Curation"
          :custom-icon="ExportIcon"
          placement="top-start"
          button-type="primary"
          full-width
          :disabled="photos.length === 0"
          aria-label="Export curated photos"
          @update:model-value="handleExportSelect"
        />
      </div>

      <CollectionModal
        :show="showCollectionModal"
        :photo-count="photos.length"
        :photo-ids="photoIds"
        :initial-tab="collectionModalTab"
        @add-to-collection="closeCollectionModal"
        @add-to-series="closeCollectionModal"
        @add-to-portfolio="closeCollectionModal"
        @cancel="closeCollectionModal"
      />

      <PhotoToolSelector
        :show="showCanvasSelector"
        start-in-canvas-selector
        :photo-count="photos.length"
        :is-processing="isExportingToCanvas"
        @tool-selected="handleCanvasSelected"
        @close="showCanvasSelector = false"
      />
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { NButton, NIcon, NTooltip } from "naive-ui";
import {
  CloseOutline as CloseIcon,
  RibbonOutline as PicksIcon,
  InformationCircleOutline as InfoIcon,
  Checkmark,
  ExitOutline as ExportIcon,
} from "@vicons/ionicons5";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { useChatStore } from "@/stores/chat.js";

defineOptions({ name: "ChatSelectionPanel" });

/**
 * The subset of a photo this panel needs — matching what PhotoCardHub requires,
 * so any richer photo shape the chat already holds can be passed straight in.
 */
interface SelectionPhoto {
  id: string;
  name: string;
  size: number | string;
  url: string;
  thumbnailUrl: string;
  originalFileName: string;
  isCheckingDuplicates: boolean;
  status?:
    | "uploaded"
    | "preprocessing"
    | "preprocessed"
    | "processing"
    | "processed";
}

const props = defineProps<{
  show: boolean;
  photos: SelectionPhoto[];
  /** Photos currently attached as context for the next message. */
  selectedIds: Set<string>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  /** Attach/detach as chat context — a plain click, no button in between. */
  (e: "select", photoId: string): void;
  (e: "remove", photoId: string): void;
}>();

const showCollectionModal = ref(false);
const collectionModalTab = ref("collections");
const photoIds = computed(() => props.photos.map((photo) => photo.id));

const openCollectionModal = (tab: string) => {
  collectionModalTab.value = tab;
  showCollectionModal.value = true;
};

const closeCollectionModal = () => {
  showCollectionModal.value = false;
};

const exportOptions = [
  {
    label: "Series",
    value: "series",
    description: "Order the curated photos into a series",
  },
  {
    label: "Collections",
    value: "collections",
    description: "Group the curated photos into a collection",
  },
  {
    label: "Canvas",
    value: "canvas",
    description: "Arrange the curated photos on a canvas",
  },
  {
    label: "Portfolios",
    value: "portfolios",
    description: "Add the curated photos to a portfolio",
  },
];

const showCanvasSelector = ref(false);
const chatStore = useChatStore();
const { isProcessing: isExportingToCanvas, takeToCanvas } =
  usePhotoToolSelection();

const handleExportSelect = (key: string) => {
  if (key === "canvas") {
    showCanvasSelector.value = true;
    return;
  }
  openCollectionModal(key);
};

const handleCanvasSelected = async (
  _toolId: string,
  canvasId: string | number | null,
) => {
  await takeToCanvas(
    photoIds.value,
    () => {
      chatStore.clearBasket();
      emit("close");
    },
    canvasId,
  );
  showCanvasSelector.value = false;
};
</script>

<style scoped>
@import "@/assets/chat-side-panel.scss";

.sidebar-slide-right-enter-active,
.sidebar-slide-right-leave-active {
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-slide-right-enter-from,
.sidebar-slide-right-leave-to {
  transform: translateX(100%);
}

.sidebar-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-title-info-icon {
  color: var(--text-tertiary);
  cursor: help;
}

.selection-list {
  padding: var(--spacing-sm);
}

/* Three columns in a 300px panel puts each photo around 88px — a step below the
   ~118px cells used inside the bubbles, which is what makes it read as a shelf. */
.selection-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
}

.selection-hint {
  margin: var(--spacing-md) 0 0;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-tertiary);
  text-align: center;
  opacity: 0.8;
}

.selection-empty-hint {
  font-size: var(--font-size-xs);
  line-height: 1.5;
  color: var(--text-tertiary);
  opacity: 0.75;
  text-align: center;
}

.selection-empty-hint-icon {
  vertical-align: -1px;
}

.selection-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  background: var(--bg-container);
  flex-shrink: 0;
}
</style>
