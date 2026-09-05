<template>
  <div class="base-image-section">
    <div class="base-image-header">
      <ModePopoverSelector
        v-model="toolbarState.expansion.type"
        :options="filteredExpansionTypeOptions"
        header="Search type"
        :custom-icon="selectedCriteriaIcon"
        :width="280"
        placement="bottom-start"
        placeholder="Search type"
        button-type="primary"
        full-width
        class="type-selector"
      />
      <ModePopoverSelector
        v-model="toolbarState.expansion.scope"
        :options="scopeOptions"
        header="Search scope"
        :custom-icon="selectedScopeIcon"
        :width="260"
        placement="bottom-start"
        placeholder="Scope"
        button-type="primary"
        full-width
        class="scope-selector"
      />
    </div>
    <div class="base-image-container">
      <div
        v-if="toolbarState.expansion.type === 'tags'"
        class="tags-overlay"
        ref="tagsOverlay"
      >
        <SelectableTagChip
          v-for="tagPhoto in filteredTags"
          :key="tagPhoto.tag.id"
          :tag="tagPhoto.tag"
          v-model="tagPhoto.tag.selected"
          :selected-color="selectedColor"
          :hover-color="hoverColor"
          :default-color="defaultColor"
          :text-color="textColor"
          :pill-height="pillHeight"
        />
      </div>
      <img
        :src="primaryBaseImage.thumbnailUrl"
        :alt="primaryBaseImage.title"
        class="photo-base-image"
      />
      <!-- Crop selector for chromatic single-photo mode -->
      <ImageCropSelector v-if="showCropSelector" v-model="cropRegion" />
      <!-- Badge contador para múltiples fotos (no mostrar en modo tags) -->
      <div
        v-if="hasMultiplePhotos && toolbarState.expansion.type !== 'tags'"
        class="photo-count-badge"
      >
        +{{ baseImages.length - 1 }}
      </div>
      <div
        v-show="toolbarState.expansion.type !== 'tags'"
        class="base-image-overlay"
      >
        <span class="base-image-label">
          {{ hasMultiplePhotos ? "Source photos" : "Source photo" }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed } from "vue";
import { AlbumsOutline, GridOutline, ScanOutline } from "@vicons/ionicons5";
import { useCanvasStore, expansionTypeOptions } from "@/stores/canvas.js";
import { useTagDisplay } from "@/composables/canvas/useTagsDisplay";
import { debounce } from "lodash";
import ModePopoverSelector from "../ModePopoverSelector.vue";
import SelectableTagChip from "../wrappers/SelectableTagChip.vue";
import ImageCropSelector from "./ImageCropSelector.vue";
import type { CropRegion } from "./ImageCropSelector.vue";

const props = defineProps({
  baseImages: { type: Array, required: true, default: () => [] },
  toolbarState: { type: Object, required: true },
  filterContext: { type: Object, default: null },
});

const emit = defineEmits(["photos-generated", "loading"]);

const canvasStore = useCanvasStore();

// Computed para la foto principal (primera del array)
const primaryBaseImage = computed(() => {
  return props.baseImages && props.baseImages.length > 0
    ? props.baseImages[0]
    : null;
});

// Computed para saber si hay múltiples fotos (no aplica en modo tags)
const hasMultiplePhotos = computed(() => {
  return (
    props.baseImages &&
    props.baseImages.length > 1 &&
    props.toolbarState.expansion.type !== "tags"
  );
});

const filteredExpansionTypeOptions = computed(() => {
  return expansionTypeOptions.map((opt) => {
    if (
      canvasStore.basicMode &&
      !["embedding", "chromatic"].includes(opt.value)
    ) {
      return { ...opt, disabled: true };
    }
    return { ...opt, disabled: false };
  });
});

const {
  filteredTags,
  selectedColor,
  hoverColor,
  defaultColor,
  textColor,
  pillHeight,
} = useTagDisplay(() => primaryBaseImage.value?.tags);

const tagsOverlay = ref(null);
const pageSize = 100;
const cropRegion = ref<CropRegion | null>(null);

// Ámbito de búsqueda del pool de candidatos: todo el catálogo, las fotos que hay
// ahora mismo en el canvas, o solo las que están visibles en el viewport.
const scopeOptions = [
  {
    label: "Catalog",
    value: "catalog",
    icon: AlbumsOutline,
    description: "Search within the entire catalog",
  },
  {
    label: "Canvas",
    value: "canvas",
    icon: GridOutline,
    description: "Search within the current canvas",
  },
  {
    label: "Viewport",
    value: "viewport",
    icon: ScanOutline,
    description: "Search within the photos visible in the viewport",
  },
];

const selectedCriteriaIcon = computed(
  () =>
    expansionTypeOptions.find(
      (o) => o.value === props.toolbarState.expansion.type,
    )?.icon || null,
);

const selectedScopeIcon = computed(
  () =>
    scopeOptions.find((o) => o.value === props.toolbarState.expansion.scope)
      ?.icon || null,
);

// Show crop selector for chromatic and general (embedding) criteria with a single source photo
const showCropSelector = computed(() => {
  const type = props.toolbarState.expansion.type;
  const supportsCrop =
    type === "chromatic" ||
    type === "chromatic_dominant" ||
    type === "embedding";
  const isSinglePhoto = props.baseImages && props.baseImages.length === 1;
  return supportsCrop && isSinglePhoto;
});

const loadPhotosFromToolbar = async () => {
  if (!props.baseImages || props.baseImages.length === 0) return;
  emit("loading", true);
  const basePosition = { x: 0, y: 0 };

  const result = await canvasStore.addPhotosFromPhoto(
    props.baseImages,
    props.toolbarState.expansion.type,
    100,
    basePosition,
    props.toolbarState.expansion.opposite,
    props.toolbarState.expansion.inverted,
    false, // onCanvas
    false, // autoFit
    props.filterContext, // filterContext
    cropRegion.value, // cropRegion
    props.toolbarState.expansion.scope, // scope
  );

  await nextTick();
  emit("loading", false);
  emit("photos-generated", result ? result.slice(0, pageSize) : []);
};

const loadPhotosFromSelections = debounce(async () => {
  if (!props.baseImages || props.baseImages.length === 0) return;

  const hasSelections =
    props.toolbarState.expansion.type === "tags" &&
    filteredTags.value.some((t) => t.tag.selected);

  if (!hasSelections) {
    emit("photos-generated", []);
    return;
  }

  emit("loading", true);
  const basePosition = { x: 0, y: 0 };

  const result = await canvasStore.addPhotosFromPhoto(
    props.baseImages,
    props.toolbarState.expansion.type,
    100,
    basePosition,
    props.toolbarState.expansion.opposite,
    props.toolbarState.expansion.inverted,
    false, // onCanvas
    false, // autoFit
    props.filterContext, // filterContext
    null, // cropRegion - not used for tag selections
    props.toolbarState.expansion.scope, // scope
  );

  await nextTick();
  emit("loading", false);
  emit("photos-generated", result ?? []);
}, 2000);

// Con scope "viewport" el pool de candidatos son las fotos visibles en pantalla, así que la
// búsqueda se relanza sola al moverse el viewport (con debounce para no saturar el backend).
const reloadOnViewportChange = debounce(() => {
  if (!props.baseImages?.length) return;
  const criteria = props.toolbarState.expansion.type;
  if (
    (criteria === "tags" || criteria === "composition") &&
    !props.toolbarState.expansion.onCanvas
  ) {
    loadPhotosFromSelections();
  } else {
    loadPhotosFromToolbar();
  }
}, 800);

// const getBoxStyle = (detection) => {
//   const s = scale.value;
//   const x = detection.x1 * s;
//   const y = detection.y1 * s;
//   const width = (detection.x2 - detection.x1) * s;
//   const height = (detection.y2 - detection.y1) * s;

//   return {
//     position: "absolute",
//     left: `${x}px`,
//     top: `${y}px`,
//     width: `${width}px`,
//     height: `${height}px`,
//     border: "1.5px solid white",
//     backgroundColor: detection.selected
//       ? "rgba(var(--v-theme-secondary), 0.4)"
//       : "transparent",
//     pointerEvents: "auto",
//     zIndex: 3,
//   };
// };

// Watchers
watch(
  [filteredTags],
  () => {
    const criteria = props.toolbarState.expansion.type;
    if (
      (criteria === "tags" || criteria === "composition") &&
      !props.toolbarState.expansion.onCanvas
    ) {
      loadPhotosFromSelections();
    }
  },
  { deep: true },
);

watch(
  () => [props.baseImages, props.toolbarState.expansion.type],
  async ([photos, type]) => {
    cropRegion.value = null;
    resetAllTags();
    const isInteractive = ["tags", "composition"].includes(type);
    const skip = isInteractive && !props.toolbarState.expansion.onCanvas;
    if (!photos || photos.length === 0 || skip) return;
    await loadPhotosFromToolbar();
  },
  { immediate: true },
);

watch(
  () => [
    props.toolbarState.expansion.scope,
    props.toolbarState.expansion.inverted,
  ],
  async () => {
    const criteria = props.toolbarState.expansion.type;
    if (
      (criteria === "tags" || criteria === "composition") &&
      !props.toolbarState.expansion.onCanvas
    ) {
      loadPhotosFromSelections();
    } else {
      loadPhotosFromToolbar();
    }
  },
);

// While the "viewport" scope is active, re-run the search as the user pans/zooms the board.
watch(
  () => canvasStore.viewport,
  () => {
    if (props.toolbarState.expansion.scope === "viewport") {
      reloadOnViewportChange();
    }
  },
);

watch(
  () => props.toolbarState.expansion.type,
  (newCriteria) => {
    if (newCriteria === "tags" || newCriteria === "composition") {
      emit("photos-generated", []);
    }
    // Clear crop region when switching criteria
    cropRegion.value = null;
  },
);

// Re-trigger search when crop region changes
watch(cropRegion, () => {
  if (showCropSelector.value) {
    loadPhotosFromToolbar();
  }
});

function resetAllTags() {
  filteredTags.value.forEach((tagPhoto) => {
    tagPhoto.tag.selected = false;
  });
}

onMounted(() => {
  resetAllTags();
});
</script>

<style scoped>
/* Base Image Section */
.base-image-section {
  flex-shrink: 0;
  width: 230px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.base-image-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
  width: 100%;
  align-items: center;
}

.type-selector,
.scope-selector {
  min-width: 0;
}

.base-image-container {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
}

.photo-count-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--accent-color, #007bff);
  color: var(--text-on-accent, #fff);
  font-size: 14px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 10;
  min-width: 24px;
  text-align: center;
}

.base-image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 100%);
  padding-bottom: 3px;
  padding-left: 5px;
}

.base-image-label {
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.tags-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 4px;
  z-index: 2;
  justify-content: center;
  align-items: flex-start;
}

.photo-base-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}
</style>
