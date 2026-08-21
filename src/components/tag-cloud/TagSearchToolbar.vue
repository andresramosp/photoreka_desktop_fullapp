<template>
  <div
    class="tag-search-toolbar"
    :class="{ 'toolbar-visible': isVisible }"
    v-show="isVisible"
  >
    <div class="toolbar-content">
      <div class="toolbar-header">
        <div class="header-left">
          <div class="selected-tags-row" ref="tagsRowRef">
            <span
              v-for="(tag, index) in selectedTags"
              :key="tag.id"
              class="selected-tag-chip"
              :title="tag.name"
              v-show="index < visibleTagCount"
            >
              {{ tag.name }}
            </span>
            <span
              v-if="
                selectedTags.length >= TAG_OVERFLOW_THRESHOLD &&
                selectedTags.length - visibleTagCount > 0
              "
              class="selected-tag-chip overflow-count-chip"
              :title="`${selectedTags.length - visibleTagCount} more tags`"
              >+{{ selectedTags.length - visibleTagCount }}</span
            >
          </div>
          <span class="section-title">
            <span class="match-count" v-if="!isLoading && totalMatchCount > 0">
              {{ totalMatchCount }} Photos
              <template
                v-if="
                  maxDisplayedPhotos !== null && photos.length < totalMatchCount
                "
              >
                <span class="showing-count">(showing {{ photos.length }})</span>
              </template>
            </span>
          </span>
        </div>
        <button
          class="toolbar-close"
          @click="closeToolbar"
          title="Close"
          aria-label="Close"
        >
          <n-icon size="16">
            <CloseOutlined />
          </n-icon>
        </button>
      </div>

      <div
        class="related-photos-scroll scrollbar-minimal"
        @wheel="handleHorizontalScroll"
        ref="scrollContainer"
      >
        <div class="related-photos-grid">
          <template v-if="isLoading">
            <div
              v-for="n in 10"
              :key="`skeleton-${n}`"
              class="related-photo-skeleton"
            >
              <n-skeleton height="100%" />
            </div>
          </template>
          <template v-else-if="photos.length === 0">
            <div class="empty-state">No photos match these tags.</div>
          </template>
          <template v-else>
            <PhotoCard
              v-for="photo in photos"
              :key="photo.id"
              :photo="photo"
              :selected="!!selectedPhotosRecord[photo.id]"
              :is-selection-mode="isSelectionMode"
              :show-tags="true"
              :show-info-button="true"
              @info="onPhotoInfo"
              @select="togglePhotoSelection"
            />
          </template>
        </div>
        <div class="scroll-safe-zone"></div>
      </div>
    </div>

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      :all-photos="photos"
      :current-photo-index="currentPhotoIndex"
      :show-delete="false"
      @photo-navigate="handlePhotoNavigate"
      @change-photo="selectedDialogPhoto = $event"
    />

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedPhotoIds.length"
      :photo-ids="selectedPhotoIds"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @add-to-portfolio="handleCollectionAdded"
      @cancel="showCollectionModal = false"
    />

    <!-- Photo Tool Selector -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="selectedPhotoIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />
  </div>

  <!-- Floating Action Bar (fixed, outside toolbar positioning context) -->
  <FloatingActionBar
    :selected-ids="selectedPhotoIds"
    :show-add-to-collection="true"
    :show-move-to-tool="true"
    :show-send-to-chat="true"
    :is-downloading="isDownloading"
    @clear-selection="clearAllSelections"
    @download="handleDownloadMultiple"
    @add-to-collection="handleAddToCollection"
    @move-to-tool="openToolSelector"
    @send-to-chat="handleSendToChat"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { NIcon, NSkeleton } from "naive-ui";
import { CloseOutlined } from "@vicons/antd";
import PhotoCard from "../photoCards/PhotoCard.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { api } from "@/utils/axios";
import { usePhotosStore } from "@/stores/photos.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";

const props = defineProps({
  selectedTags: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["close"]);

const photos = ref([]);
const totalMatchCount = ref(0);
const maxDisplayedPhotos = ref(100); // null = no limit
const isLoading = ref(false);
const scrollContainer = ref(null);
const photosStore = usePhotosStore();
let activeRequestId = 0;

// Tag overflow measurement
const TAG_OVERFLOW_THRESHOLD = 10;
const tagsRowRef = ref(null);
const visibleTagCount = ref(Infinity);

const measureVisibleTags = () => {
  visibleTagCount.value = Infinity;
  nextTick(() => {
    const container = tagsRowRef.value;
    if (!container || !props.selectedTags.length) {
      visibleTagCount.value = props.selectedTags.length;
      return;
    }
    if (props.selectedTags.length < TAG_OVERFLOW_THRESHOLD) {
      visibleTagCount.value = props.selectedTags.length;
      return;
    }
    const chips = [
      ...container.querySelectorAll(
        ".selected-tag-chip:not(.overflow-count-chip)",
      ),
    ];
    if (!chips.length) return;
    const cw = container.clientWidth;
    const gap = 6;
    const overflowW = 44; // reserved px for "+N" chip
    const widths = chips.map((el) => el.getBoundingClientRect().width);
    const total = widths.reduce((s, w, i) => s + w + (i ? gap : 0), 0);
    if (total <= cw) {
      visibleTagCount.value = chips.length;
      return;
    }
    let acc = 0;
    let count = 0;
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i] + (i ? gap : 0);
      if (acc + w + gap + overflowW <= cw) {
        acc += w;
        count++;
      } else break;
    }
    visibleTagCount.value = Math.max(1, count);
  });
};

let resizeObserver = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(measureVisibleTags);
  if (tagsRowRef.value) resizeObserver.observe(tagsRowRef.value);
  measureVisibleTags();
});
onUnmounted(() => resizeObserver?.disconnect());

// Photo info dialog
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref(null);

// Selection
const {
  selectedPhotosRecord,
  selectedPhotoIds,
  isSelectionMode,
  togglePhotoSelection,
  clearAllSelections,
} = useLocalPhotoSelection();

// Download
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();

// Tool selection
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

// Collection modal
const showCollectionModal = ref(false);

const isVisible = computed(
  () =>
    props.selectedTags.length > 0 &&
    (isLoading.value || photos.value.length >= 0),
);

const closeToolbar = () => {
  photos.value = [];
  emit("close");
};

const currentPhotoIndex = computed(() => {
  if (!selectedDialogPhoto.value) return -1;
  return photos.value.findIndex((p) => p.id === selectedDialogPhoto.value.id);
});

const onPhotoInfo = async (photo) => {
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = fullPhoto;
  showPhotoInfoDialog.value = true;
};

const handlePhotoNavigate = async (newIndex) => {
  if (newIndex < 0 || newIndex >= photos.value.length) return;
  const photo = photos.value[newIndex];
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = fullPhoto;
};

const handleDownloadMultiple = async () => {
  const photosToDownload = selectedPhotoIds.value
    .map((id) => photos.value.find((p) => p.id == id))
    .filter(Boolean);
  if (photosToDownload.length === 1) {
    await downloadPhoto(photosToDownload[0]);
  } else {
    await downloadPhotosZip(photosToDownload);
  }
};

const handleAddToCollection = () => {
  if (selectedPhotoIds.value.length > 0) {
    showCollectionModal.value = true;
  }
};

const handleCollectionAdded = () => {
  clearAllSelections();
  showCollectionModal.value = false;
};

const handleToolSelected = async (toolId, canvasId = null) => {
  await takeToTool(
    toolId,
    selectedPhotoIds.value,
    clearAllSelections,
    canvasId,
  );
  closeToolSelector();
};

const handleSendToChat = async () => {
  await takeToChat(selectedPhotoIds.value, clearAllSelections);
};

const handleHorizontalScroll = (e) => {
  if (!scrollContainer.value) return;
  e.preventDefault();
  scrollContainer.value.scrollLeft += e.deltaY;
};

const runSearch = async () => {
  const tagNames = props.selectedTags.map((t) => t.name);
  if (tagNames.length === 0) {
    photos.value = [];
    return;
  }

  const requestId = ++activeRequestId;
  isLoading.value = true;
  photos.value = [];
  totalMatchCount.value = 0;

  try {
    const { data: matches, headers } = await api.post(
      "/api/search/tags/direct",
      {
        included: tagNames,
        excluded: [],
        mode: "OR",
        semantic: false,
        limit: maxDisplayedPhotos.value,
      },
    );

    if (requestId !== activeRequestId) return;

    const list = Array.isArray(matches) ? matches.slice() : [];
    // Sort: most matched tags first; ties broken by photoId desc.
    // Cuenta `matchedSearchTags` (tags buscados que la foto satisface), no
    // `matchedIncluded` (tags de la foto que matchearon): con este último, una
    // foto etiquetada "london", "london bridge" y "streets of london" subía como
    // si encajara tres búsquedas cuando solo se pidió "london".
    list.sort((a, b) => {
      const da = (a.matchedSearchTags || []).length;
      const db = (b.matchedSearchTags || []).length;
      if (db !== da) return db - da;
      return (b.photoId || 0) - (a.photoId || 0);
    });

    const totalFromHeader = Number.parseInt(headers["x-total-count"], 10);
    totalMatchCount.value = Number.isFinite(totalFromHeader)
      ? totalFromHeader
      : list.length;

    if (list.length === 0) {
      photos.value = [];
      return;
    }

    const photoMap = new Map();
    (photosStore.allPhotos || []).forEach((p) => photoMap.set(p.id, p));

    const missing = list.filter((m) => !photoMap.has(m.photoId));
    if (missing.length > 0) {
      const { data: fetched } = await api.post("/api/catalog/photosByIds", {
        photosIds: missing.map((m) => m.photoId),
      });
      if (requestId !== activeRequestId) return;
      (fetched || []).forEach((p) => photoMap.set(p.id, p));
    }

    const merged = list
      .map((m) => {
        const p = photoMap.get(m.photoId);
        if (!p) return null;
        return {
          ...p,
          url: p.originalUrl || p.url,
          thumbnailUrl: p.thumbnailUrl || p.originalUrl,
          title: p.originalFileName || p.title || "",
          matchingTags: (m.matchedIncluded || []).map((name) => ({
            name,
            proximity: 1,
          })),
        };
      })
      .filter(Boolean);

    photos.value = merged;

    nextTick(() => {
      if (scrollContainer.value) scrollContainer.value.scrollLeft = 0;
    });
  } catch (err) {
    if (requestId !== activeRequestId) return;
    console.error("[TagSearchToolbar] search failed", err);
    photos.value = [];
  } finally {
    if (requestId === activeRequestId) {
      isLoading.value = false;
    }
  }
};

watch(
  () => props.selectedTags,
  (next) => {
    measureVisibleTags();
    if (!next || next.length === 0) {
      photos.value = [];
      activeRequestId++;
      isLoading.value = false;
      return;
    }
    runSearch();
  },
  { immediate: true, deep: true },
);
</script>

<style scoped>
.tag-search-toolbar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 240px;
  background: var(--bg-container);
  border-top: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
  z-index: 10;
  transform: translateY(100%);
  transition: none;
  box-shadow: 0 -8px 32px var(--toolbar-shadow-color, rgba(0, 0, 0, 0.4));
}

.tag-search-toolbar.toolbar-visible {
  transform: translateY(0);
  animation: slideUpFromBottom 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)
    forwards;
}

.toolbar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px 18px 6px 18px;
  gap: 10px;
}

.toolbar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.header-left {
  display: flex;
  gap: 6px;
  min-width: 0;
  flex: 1;
  justify-content: space-between;
}

.section-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.match-count {
  color: var(--text-secondary);
  font-weight: 400;
}

.showing-count {
  color: var(--text-tertiary);
  font-size: 11px;
}

.selected-tags-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow: hidden;
  align-items: center;
  min-width: 0;
}

.selected-tag-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(6, 182, 212, 0.15);
  color: var(--accent-color);
  border: 1px solid rgba(6, 182, 212, 0.4);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.overflow-count-chip {
  flex-shrink: 0;
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
  border-color: var(--border-color);
  max-width: none;
  cursor: default;
}

.toolbar-close {
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.toolbar-close:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.related-photos-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color-hover) transparent;
}

.related-photos-scroll::-webkit-scrollbar {
  height: 10px;
  background: transparent;
}

.related-photos-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color-hover);
  border-radius: 6px;
}

.related-photos-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

.related-photos-grid {
  display: flex;
  gap: 12px;
  height: 160px;
  padding-right: 18px;
}

.related-photos-grid .photo-card {
  flex-shrink: 0;
  width: 160px;
  height: 160px;
}

.related-photo-skeleton {
  flex-shrink: 0;
  width: 160px;
  height: 160px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-surface);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 160px;
  color: var(--text-secondary);
  font-size: 13px;
}

.scroll-safe-zone {
  height: 8px;
  min-height: 8px;
  background: transparent;
  pointer-events: none;
}

@keyframes slideUpFromBottom {
  0% {
    transform: translateY(100%);
  }
  100% {
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .tag-search-toolbar {
    height: 210px;
  }
  .related-photos-grid {
    height: 130px;
  }
  .related-photos-grid .photo-card {
    width: 130px;
    height: 130px;
  }
  .related-photo-skeleton {
    width: 130px;
    height: 130px;
  }
}
</style>
