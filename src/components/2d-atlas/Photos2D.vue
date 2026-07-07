<template>
  <div class="photos-2d-container" ref="containerRef">
    <!-- Error Screen -->
    <div v-if="error" class="error-screen">
      <div class="error-content">
        <h2>Unable to load 2D visualization</h2>
        <p>{{ error }}</p>
        <button @click="retryLoad" class="retry-btn">Retry</button>
      </div>
    </div>

    <!-- PixiJS Canvas Container -->
    <div
      v-else
      ref="pixiContainer"
      class="pixi-container"
      :class="{ 'rect-selecting': isRectSelecting }"
    ></div>

    <!-- Tag Beacons Display (long-distance zone indicators) -->
    <div
      v-if="
        tagBeaconsSystem &&
        tagBeaconsSystem.config.value.enabled &&
        !isTransitioning &&
        tagBeaconsSystem.visibleBeacons.value.length > 0
      "
      class="tag-beacons-wrapper"
    >
      <div
        v-for="beacon in tagBeaconsSystem.visibleBeacons.value"
        :key="beacon.key"
        class="tag-beacon"
        @click.stop="flyToBeacon(beacon)"
        :style="{
          left: beacon.screen.x + 'px',
          top: beacon.screen.y + 'px',
          opacity: beacon.opacity,
          transform: `translate(-50%, -50%) scale(${beacon.scale})`,
          '--beacon-color': beacon.color,
        }"
      >
        <span class="tag-beacon-label">{{ beacon.name }}</span>
        <span class="tag-beacon-count">&times;{{ beacon.count }}</span>
      </div>
    </div>

    <!-- Config Panel Component (Desktop) -->
    <Photos2DConfigPanel
      v-if="!isMobile && !isPreview"
      v-model:showConfigPanel="showConfigPanel"
      v-model:selectedChunk="selectedChunk"
      v-model:selectedVisualAspects="selectedVisualAspects"
      v-model:artisticScoreFilters="artisticScoreFilters"
      v-model:timeRangeFilter="timeRangeFilter"
      v-model:atlasBackground="atlasBackground"
      v-model:gridRelaxationEnabled="gridRelaxationEnabled"
      v-model:gridRelaxationExpandStrength="gridRelaxationExpandStrength"
      v-model:gridSnapToGrid="gridSnapToGrid"
      v-model:viewPatternsEnabled="viewPatternsEnabled"
      v-model:selectedPatternId="selectedPatternId"
      :chunkOptions="chunkOptions"
      :patternOptions="patternOptions"
      :patternsForCurrentChunk="patternsForCurrentChunk"
      :showDiscreteLoader="showDiscreteLoader"
      :searchResults="searchResults"
      :processedPhotos="processedPhotos"
      :isPlayground="isPlayground"
      :hasTagBeacons="true"
      :tagBeaconsEnabled="tagBeaconsSystem.config.value.enabled"
      :tagBeaconsCellSize="tagBeaconsSystem.config.value.cellSize"
      :tagBeaconsMaxBeacons="tagBeaconsSystem.config.value.maxBeacons"
      :tagBeaconsTopTags="tagBeaconsSystem.config.value.topTagsPerCell"
      :tagBeaconsMergeRadius="tagBeaconsSystem.config.value.mergeSameTagRadius"
      @update:tagBeaconsEnabled="
        (v) => (tagBeaconsSystem.config.value.enabled = v)
      "
      @update:tagBeaconsCellSize="
        (v) => (tagBeaconsSystem.config.value.cellSize = v)
      "
      @update:tagBeaconsMaxBeacons="
        (v) => (tagBeaconsSystem.config.value.maxBeacons = v)
      "
      @update:tagBeaconsTopTags="
        (v) => (tagBeaconsSystem.config.value.topTagsPerCell = v)
      "
      @update:tagBeaconsMergeRadius="
        (v) => (tagBeaconsSystem.config.value.mergeSameTagRadius = v)
      "
      @chunk-change="onChunkChange"
      @visual-aspects-change="onVisualAspectsChange"
      @artistic-scores-change="onArtisticScoresChange"
      @time-range-change="onTimeRangeChange"
      @reset-view="resetView"
      @highlight-pattern="handleHighlightPattern"
      @unhighlight-pattern="handleUnhighlightPattern"
      @select-pattern="handleSelectPattern"
      @fly-to-pattern="flyToPattern"
      @tag-search="handleTagSearch"
      @text-search="handleTextSearch"
      v-model:photoLimit="photoLimit"
      @viewport-limit-change="onViewportLimitChange"
    />

    <!-- Config Panel Component (Mobile) -->
    <Photos2DConfigPanelMobile
      v-else-if="!isPreview"
      v-model:selectedChunk="selectedChunk"
      v-model:selectedVisualAspects="selectedVisualAspects"
      v-model:artisticScoreFilters="artisticScoreFilters"
      v-model:timeRangeFilter="timeRangeFilter"
      v-model:atlasBackground="atlasBackground"
      v-model:gridRelaxationEnabled="gridRelaxationEnabled"
      v-model:gridRelaxationExpandStrength="gridRelaxationExpandStrength"
      v-model:gridSnapToGrid="gridSnapToGrid"
      v-model:selectedPatternId="selectedPatternId"
      :chunkOptions="chunkOptions"
      :patternsForCurrentChunk="patternsForCurrentChunk"
      :showDiscreteLoader="showDiscreteLoader"
      :processedPhotos="processedPhotos"
      @chunk-change="onChunkChange"
      @visual-aspects-change="onVisualAspectsChange"
      @artistic-scores-change="onArtisticScoresChange"
      @time-range-change="onTimeRangeChange"
      @select-pattern="handleSelectPattern"
      @fly-to-pattern="flyToPattern"
      @tag-search="handleTagSearch"
      @text-search="handleTextSearch"
    />

    <!-- Hovered Photo Info -->
    <div
      v-if="hoveredPhoto && !showDiscreteLoader"
      ref="tooltipRef"
      class="photo-tooltip"
      :class="`tooltip-${tooltipPlacement}`"
      :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
    >
      <img
        v-if="hoveredPhoto.thumbnailUrl"
        :src="hoveredPhoto.thumbnailUrl"
        class="tooltip-image"
        @load="repositionHoveredTooltip"
      />
      <div class="tooltip-info">
        <span v-if="hoveredPhoto.dateTaken" class="tooltip-date">
          {{ formatDate(hoveredPhoto.dateTaken) }}
        </span>
      </div>
    </div>

    <!-- Floating Action Bar (standard selection toolbar) -->
    <FloatingActionBar
      v-if="!isPlayground && !isPreview"
      :selected-ids="selectedPhotoIds"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :show-send-to-chat="true"
      :is-downloading="isDownloading"
      :top-position="20"
      @clear-selection="clearSelection"
      @download="handleDownloadPhotos"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="handleMoveToTool"
      @send-to-chat="handleSendToChat"
    />

    <!-- Discrete Loading Indicator -->
    <div v-show="showDiscreteLoader && !isPreview" class="discrete-loader">
      <div class="loader-spinner"></div>
      <span class="loader-text">{{ loaderTitle }}</span>
      <span
        v-if="isLoadingTextures && loadingProgress > 0"
        class="loader-percentage"
        >{{ loadingProgress }}%</span
      >
    </div>

    <!-- Zoom Controls -->
    <div class="zoom-controls">
      <button v-if="!isMobile" @click="zoomIn" class="zoom-btn" title="Zoom In">
        <n-icon size="18">
          <ZoomInOutlined />
        </n-icon>
      </button>
      <!-- <span class="zoom-level">{{ Math.round(scale * 100) }}%</span> -->
      <button
        v-if="!isMobile"
        @click="zoomOut"
        class="zoom-btn"
        title="Zoom Out"
      >
        <n-icon size="18">
          <ZoomOutOutlined />
        </n-icon>
      </button>
      <button @click="resetView" class="zoom-btn" title="Reset View">
        <n-icon size="18">
          <FullscreenOutlined />
        </n-icon>
      </button>
    </div>

    <!-- Photo count indicator -->
    <!-- <div class="photo-count-indicator">
      {{ visiblePhotosCount }} / {{ totalPhotosCount }} photos
    </div> -->

    <!-- Rect-select overlay (shown while Ctrl/Cmd + drag is active) -->
    <div
      v-if="isRectSelecting"
      class="rect-select-overlay"
      :style="rectSelectStyle"
    />

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedPhotoIds.length"
      :photo-ids="selectedPhotoIds"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="handleCollectionModalCancel"
    />

    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="selectedPhotoIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  shallowRef,
  nextTick,
} from "vue";
import { NIcon, useMessage } from "naive-ui";
import { message as topMessage } from "@/utils/notifications";
import {
  CloseOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
} from "@vicons/antd";
import { useRouter } from "vue-router";
import * as PIXI from "pixi.js";

import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import Photos2DConfigPanel from "@/components/2d-atlas/Photos2DConfigPanel.vue";
import Photos2DConfigPanelMobile from "@/components/2d-atlas/Photos2DConfigPanelMobile.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useUserStore } from "@/stores/userStore";

import { use2DPhotos } from "@/composables/2d-viewer/use2DPhotos.js";
import { use2DPatternTags } from "@/composables/2d-viewer/use2DPatternTags.js";
import { useHasTouch } from "@/composables/useHasTouch.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { use2DTextureManager } from "@/composables/2d-viewer/use2DTextureManager.js";
import { use2DLod } from "@/composables/2d-viewer/use2DLod.js";
import { useTagBeacons2D } from "@/composables/2d-viewer/useTagBeacons2D.js";
import { useTheme } from "@/composables/useTheme.js";
import { useSmartTooltipPosition } from "@/composables/useSmartTooltipPosition.js";
import { isMobileDevice } from "@/utils/utils.js";
import { api } from "@/utils/axios";
import { usePhotoScored } from "@/composables/usePhotoScored.js";
// Props
const props = defineProps({
  catalogUserId: {
    type: String,
    default: null,
  },
  isPlayground: {
    type: Boolean,
    default: false,
  },
  isPreview: {
    type: Boolean,
    default: false,
  },
  photosLimit: {
    type: Number,
    default: null,
  },
});
const emit = defineEmits(["loading-state-change"]);

// Initialize composables
const message = useMessage();
const router = useRouter();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const { computePhotoStars } = usePhotoScored();
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

const photosStore = usePhotosStore();
const userStore = useUserStore();

// Resolve originalUrl from the catalog store (same approach as 3D).
// The 2D clustering endpoints may omit originalUrl for performance/security.
const originalUrlById = shallowRef(new Map());
watch(
  () => photosStore.photos,
  (photos) => {
    const map = new Map();
    for (const p of photos || []) {
      if (!p?.id) continue;
      if (p.originalUrl) map.set(p.id, p.originalUrl);
    }
    originalUrlById.value = map;
  },
  { immediate: true },
);

const getPhotoOriginalUrl = (photoId) => {
  return originalUrlById.value.get(photoId) || null;
};

// Detect mobile device (strict: real mobile devices, not just narrow desktop windows)
const isMobile = ref(isMobileDevice());
const { hasTouch } = useHasTouch();
const useLowPerformance = computed(() => isMobile.value || hasTouch.value);

const processedPhotos = computed(() => photosStore.processedPhotos);

// Initialize 2D photos composable
const {
  photos2D,
  isLoadingPositions,
  currentChunk,
  error,
  chunkOptions,
  getBounds,
  gridRelaxationEnabled,
  gridRelaxationExpandStrength,
  gridSnapToGrid,
  loadAllPhotos,
  changeChunk,
  reapplyLayout,
  reapplyLayoutForIds,
  reset,
} = use2DPhotos(props.catalogUserId, useLowPerformance.value);

// Viewport limit: how many photos to load from the backend (most recent first).
// Pre-read from the same localStorage key used by Photos2DConfigPanel so that the
// panel's onMounted finds props.photoLimit === persisted and won't emit a second load.
const _PHOTO_LIMIT_VALID_2D = [5000, 10000, 20000];
const _storedPhotoLimit2D =
  typeof window !== "undefined"
    ? Number(window.localStorage.getItem("photoreka:atlas2d:photoLimit"))
    : 0;
const photoLimit = ref(
  props.isPreview
    ? props.photosLimit
    : _PHOTO_LIMIT_VALID_2D.includes(_storedPhotoLimit2D)
      ? _storedPhotoLimit2D
      : 10000,
);
// Track whether the limit-info message has been shown this session
const limitMessageShown = ref(false);

// First-visit "caching images" banner (discreet dismissible top message).
// Shown once per session when the vast majority of images are not yet cached
// in IndexedDB, so the user understands the initial load can take a while.
const cachingMessageShown = ref(false);
let cachingMessageInstance = null;
const CACHING_BANNER_MIN_PHOTOS = 100; // don't warn for tiny catalogs
const CACHING_BANNER_UNCACHED_RATIO = 0.9; // >=90% missing from cache => first visit

const maybeShowCachingBanner = (total) => {
  if (props.isPreview || props.isPlayground) return;
  if (cachingMessageShown.value || cachingMessageInstance) return;
  if (!total || total < CACHING_BANNER_MIN_PHOTOS) return;

  const cachedCount = textureManager.cachedPhotoIds.value?.size || 0;
  const uncachedRatio = (total - cachedCount) / total;
  if (uncachedRatio < CACHING_BANNER_UNCACHED_RATIO) return;

  cachingMessageShown.value = true;
  // Use the app-wide discrete message API (top placement) instead of the
  // local `message` instance: this view's <n-message-provider> is configured
  // with placement="bottom" (see 2DView.vue), which sits right on top of the
  // bottom discrete loader. This banner needs to be at the top, undisturbed.
  cachingMessageInstance = topMessage.info(
    "Caching your images on this device for faster loading next time. The first visit may take a few minutes — please keep this screen open while it finishes.",
    { duration: 0, closable: true, placement: "bottom-left" },
  );
};

const dismissCachingBanner = () => {
  if (!cachingMessageInstance) return;
  try {
    cachingMessageInstance.destroy();
  } catch (_) {}
  cachingMessageInstance = null;
};

const reapplyLayoutForCurrentView = () => {
  if (!photos2D.value.length) return;

  const visible = filteredPhotos.value;
  if (!visible || visible.length === 0) return;

  // If the user has active filters, apply snapping/relaxation to visible photos only.
  // Otherwise, apply to the full set.
  if (visible.length < photos2D.value.length) {
    reapplyLayoutForIds(visible.map((p) => p.id));
    return;
  }

  reapplyLayout();
};

// 2D texture manager (IndexedDB + in-memory cache), modeled after 3D
const textureManager = use2DTextureManager(
  useLowPerformance.value,
  props.isPlayground,
);

// DOM refs
const containerRef = ref(null);
const pixiContainer = ref(null);

// PixiJS instances (use shallowRef to avoid Vue reactivity overhead)
const pixiApp = shallowRef(null);
const photoContainer = shallowRef(null);
const photoSprites = shallowRef(new Map()); // Map of photoId -> sprite
const placeholderTexture = shallowRef(null); // Reused placeholder (GPU memory optimization)

// Theme-aware background selector
const { isDarkMode } = useTheme();

// Initialize with default color ID based on theme
const atlasBackground = ref(isDarkMode.value ? "default" : "white");

// Get the HEX color from atlasBackground (supports both object and string ID)
const getCurrentBackgroundColor = computed(() => {
  if (!atlasBackground.value) return "#000000";

  // If it's an object with color property (from ColorPickerPills), use it directly
  if (
    typeof atlasBackground.value === "object" &&
    atlasBackground.value.color
  ) {
    return atlasBackground.value.color;
  }

  // If it's a string ID (legacy/initial), return black as fallback
  // ColorPickerPills will replace this with proper object on first interaction
  return "#000000";
});

const toPixiColorNumber = (colorSource) => {
  try {
    if (PIXI?.Color) {
      return new PIXI.Color(colorSource).toNumber();
    }
  } catch (_) {}

  const s = String(colorSource || "").trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s);
  if (m) return parseInt(m[1], 16);
  return 0x000000;
};

const applyPixiBackground = () => {
  const app = pixiApp.value;
  if (!app?.renderer) return;

  const colorSource = getCurrentBackgroundColor.value;
  const colorNum = toPixiColorNumber(colorSource);

  const renderer = app.renderer;
  const bg = renderer.background;

  // Pixi v8 renderer.background.color is typically a Color instance.
  if (bg?.color) {
    const c = bg.color;
    if (typeof c === "object" && typeof c.setValue === "function") {
      try {
        c.setValue(colorSource);
        return;
      } catch (_) {}
    }
    try {
      bg.color = colorSource;
      return;
    } catch (_) {}
    try {
      bg.color = colorNum;
      return;
    } catch (_) {}
  }

  // Older renderer API fallbacks
  if ("backgroundColor" in renderer) {
    try {
      renderer.backgroundColor = colorNum;
    } catch (_) {}
  }
};

// Watch for theme changes - ColorPickerPills will handle auto-setting
watch(isDarkMode, (newIsDarkMode) => {
  // Reset to ID if no object is set yet
  if (!atlasBackground.value || typeof atlasBackground.value === "string") {
    atlasBackground.value = newIsDarkMode ? "default" : "white";
  }
});

// Apply background to Pixi when user changes it
watch(atlasBackground, () => {
  applyPixiBackground();
});

// Canvas state
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const photoSize = ref(80);

// Interaction state
const isDragging = ref(false);
const dragStartPosition = ref({ x: 0, y: 0 });
const lastPointerPosition = ref({ x: 0, y: 0 });

// Rect-select state (Ctrl/Cmd + drag)
const isRectSelecting = ref(false);
const rectSelectStart = ref({ x: 0, y: 0 }); // screen coords (local to pixi container)
const rectSelectEnd = ref({ x: 0, y: 0 }); // screen coords (local to pixi container)

const rectSelectStyle = computed(() => {
  const x1 = Math.min(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y1 = Math.min(rectSelectStart.value.y, rectSelectEnd.value.y);
  const x2 = Math.max(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y2 = Math.max(rectSelectStart.value.y, rectSelectEnd.value.y);
  return {
    left: x1 + "px",
    top: y1 + "px",
    width: x2 - x1 + "px",
    height: y2 - y1 + "px",
  };
});
const isPinching = ref(false);
const lastPinchDistance = ref(0);
const touchStartTime = ref(0);
const hadRecentPinch = ref(false);

// Pinch anchoring: keep the same world point under the pinch midpoint.
const lastPinchCenter = ref({ x: 0, y: 0 }); // screen (local to pixi container)
const lastPinchWorld = ref({ x: 0, y: 0 }); // world (photoContainer space)

// Keyboard navigation state
const keysPressed = ref(new Set());
const keyboardPanSpeed = 5; // pixels per frame
let keyboardAnimationId = null;

// UI state
const showConfigPanel = ref(!isMobile.value);
const isLoadingTextures = ref(false);
const showDiscreteLoader = computed(
  () => isLoadingPositions.value || isLoadingTextures.value,
);
watch(
  showDiscreteLoader,
  (isLoading) => {
    emit("loading-state-change", Boolean(isLoading));
  },
  { immediate: true },
);
const loadingProgress = ref(0);
// Loader title reflects the phase that is actually running:
//  - Fetching positions / building the layout from the API → "Building stage"
//    (indeterminate: no percentage, since the backend gives no progress)
//  - Downloading & decoding photo textures → "Loading photos" (with %)
// Positions always resolve before textures start, so there is no overlap.
const loaderTitle = computed(() =>
  isLoadingPositions.value ? "Building stage" : "Loading photos",
);

// Animation state for cluster transitions
const isTransitioning = ref(false);
const animationStartTime = ref(0);
const animationTargetPositions = new Map(); // photoId -> [x, y]
const TRANSITION_DURATION = 1200; // milliseconds

// Filter state
const selectedChunk = ref("general");
const selectedVisualAspects = ref([]);
const artisticScoreFilters = ref({});
const timeRangeFilter = ref(null);
const searchResults = ref(null);
const tagFilterResults = ref(null); // Tag search results: Map<photoId, { matchedIncluded, matchedExcluded }>

// Text search state: Map<photoId, { labelScore, totalScore, stars }>
const textSearchScoreMap = ref(null);
const TEXT_SEARCH_MAX_RESULTS = 2000;
// Build a Map for fast photo lookup by id (for filtering, selection, etc.)
const photoById = computed(() => {
  const map = new Map();
  for (const p of photos2D.value || []) {
    if (p?.id) map.set(p.id, p);
  }
  return map;
});

// Selection state
const selectedPhotoIds = ref([]);
const hoveredPhoto = ref(null);
const tooltipRef = shallowRef(null);
const {
  tooltipPosition,
  tooltipPlacement,
  placeTooltipAt,
  repositionTooltip,
  clearTooltipAnchor,
} = useSmartTooltipPosition({
  containerRef,
  tooltipRef,
  offset: 14,
  margin: 8,
  preferredOrder: ["top", "right", "left", "bottom"],
});

const repositionHoveredTooltip = () => {
  if (!hoveredPhoto.value) return;
  repositionTooltip();
};

// Modal state
const showCollectionModal = ref(false);

// Pattern selection state
const selectedPatternId = ref(null);

// Pattern tags overlay
const {
  viewPatternsEnabled,
  patternOptions,
  patternsForCurrentChunk,
  ensurePatternTagsLayer,
  ensurePatternTag,
  updateAllPatternTagsScreenScale,
  highlightPatternPhotos,
  unhighlightPatternPhotos,
  scheduleHeatmapUpdate,
  cleanup: cleanupPatternTags,
  HIGHLIGHT_MODE, // Exposed for configuration: 'photos' or 'heatmap'
} = use2DPatternTags({
  userStore,
  selectedChunk,
  photoById,
  photoContainer,
  pixiApp,
  scale,
  isTransitioning,
  isLoadingPositions,
  photoSprites,
  displayMode: "list", // Use list mode (change to 'floating' for old behavior)
  selectedPatternId, // Pass selected pattern ID so heatmap can refresh properly
});

// Scale coordinates from API to canvas
const SCALE_FACTOR = 50;

// Zoom constraints
// Avoid 0 to prevent division-by-zero and unstable transforms.
const MIN_SCALE = 0.005;
const MAX_SCALE = 12;
const ZOOM_SENSITIVITY = 0.0015;
const CAMERA_LERP = 1;
const CAMERA_EPSILON = 0.001;
const targetCamera = { x: 0, y: 0, scale: 1 };
let lastAnimationTick = 0;

const clampScale = (value) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));
};

const getLocalPointFromClient = (clientX, clientY, evt) => {
  const rect = pixiContainer.value?.getBoundingClientRect?.()
    ? pixiContainer.value.getBoundingClientRect()
    : evt?.currentTarget?.getBoundingClientRect?.()
      ? evt.currentTarget.getBoundingClientRect()
      : null;

  if (!rect) return { x: clientX, y: clientY };

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
};

const screenToWorld = (screenX, screenY, scl = scale.value) => {
  const s = Number(scl) || 1;
  return {
    x: (screenX - offsetX.value) / s,
    y: (screenY - offsetY.value) / s,
  };
};

const syncTargetCamera = () => {
  targetCamera.x = offsetX.value;
  targetCamera.y = offsetY.value;
  targetCamera.scale = scale.value;
};

const applyZoomAboutScreenPoint = (
  screenX,
  screenY,
  newScaleRaw,
  cameraState = null,
) => {
  const currentX = cameraState ? cameraState.x : offsetX.value;
  const currentY = cameraState ? cameraState.y : offsetY.value;
  const oldScale = Number(cameraState ? cameraState.scale : scale.value) || 1;
  const newScale = clampScale(newScaleRaw);
  if (newScale === oldScale) return false;

  const scaleChange = newScale / oldScale;
  const nextX = screenX - (screenX - currentX) * scaleChange;
  const nextY = screenY - (screenY - currentY) * scaleChange;

  if (cameraState) {
    cameraState.x = nextX;
    cameraState.y = nextY;
    cameraState.scale = newScale;
  } else {
    scale.value = newScale;
    offsetX.value = nextX;
    offsetY.value = nextY;
  }

  return true;
};

const hasPendingCameraAnimation = () => {
  return (
    Math.abs(targetCamera.x - offsetX.value) > CAMERA_EPSILON ||
    Math.abs(targetCamera.y - offsetY.value) > CAMERA_EPSILON ||
    Math.abs(targetCamera.scale - scale.value) > CAMERA_EPSILON
  );
};

const updateCameraTowardsTarget = (deltaFrames = 1) => {
  const lerpFactor = 1 - Math.pow(1 - CAMERA_LERP, Math.max(1, deltaFrames));
  const dx = targetCamera.x - offsetX.value;
  const dy = targetCamera.y - offsetY.value;
  const ds = targetCamera.scale - scale.value;

  if (
    Math.abs(dx) <= CAMERA_EPSILON &&
    Math.abs(dy) <= CAMERA_EPSILON &&
    Math.abs(ds) <= CAMERA_EPSILON
  ) {
    offsetX.value = targetCamera.x;
    offsetY.value = targetCamera.y;
    scale.value = targetCamera.scale;
    return false;
  }

  offsetX.value += dx * lerpFactor;
  offsetY.value += dy * lerpFactor;
  scale.value += ds * lerpFactor;

  if (Math.abs(targetCamera.x - offsetX.value) <= CAMERA_EPSILON) {
    offsetX.value = targetCamera.x;
  }
  if (Math.abs(targetCamera.y - offsetY.value) <= CAMERA_EPSILON) {
    offsetY.value = targetCamera.y;
  }
  if (Math.abs(targetCamera.scale - scale.value) <= CAMERA_EPSILON) {
    scale.value = targetCamera.scale;
  }

  return true;
};

// Canvas interaction cleanup (listeners must be removed manually)
let canvasRef = null;
const canvasListeners = [];

// ─── LOD + HiRes system (centralized composable) ────────────────────
const {
  lodCurrentLevel,
  scheduleLodUpdate,
  cancelLodUpdate,
  scheduleHiResUpdate,
  buildHiResSpatialIndex,
  getMaxSideForQuality,
  resetState: resetLodState,
  cleanup: cleanupLod,
} = use2DLod({
  pixiContainer,
  scale,
  offsetX,
  offsetY,
  photoSize,
  photoSprites,
  photoById,
  isTransitioning,
  isLoadingTextures,
  textureManager,
  getPhotoOriginalUrl,
  useLowPerformance: useLowPerformance.value,
});

// Photo counts
const totalPhotosCount = computed(() => photos2D.value.length);
const visiblePhotosCount = computed(() => filteredPhotos.value.length);

// Map visual-aspect values (e.g. "warm") to their category keys (e.g. "temperature")
const createVisualAspectCategoryMap = () => {
  const categoryMap = new Map();

  visualAspectsOptions.forEach((group) => {
    group.children.forEach((child) => {
      categoryMap.set(child.value, group.key);
    });
  });

  return categoryMap;
};

const visualAspectCategoryMap = createVisualAspectCategoryMap();

// Filtered photos based on current filters
const filteredPhotos = computed(() => {
  let filtered = photos2D.value;

  // Apply visual aspects filter
  if (selectedVisualAspects.value && selectedVisualAspects.value.length > 0) {
    filtered = filtered.filter((photo) => {
      const visualAspects = photo.descriptions?.visual_aspects;

      if (!visualAspects) return false;

      // Legacy/alternate shape: array of selected aspects
      if (Array.isArray(visualAspects)) {
        return selectedVisualAspects.value.some((aspect) =>
          visualAspects.includes(aspect),
        );
      }

      // Current shape: object keyed by category, values are arrays
      if (typeof visualAspects === "object") {
        const selectedByCategory = new Map();
        selectedVisualAspects.value.forEach((selectedAspect) => {
          const category = visualAspectCategoryMap.get(selectedAspect);
          if (!category) return;
          if (!selectedByCategory.has(category)) {
            selectedByCategory.set(category, []);
          }
          selectedByCategory.get(category).push(selectedAspect);
        });

        if (selectedByCategory.size === 0) return false;

        // AND across categories, OR within a category
        return Array.from(selectedByCategory.entries()).every(
          ([category, aspectsInCategory]) => {
            const photoAspects = visualAspects?.[category];
            if (!Array.isArray(photoAspects)) return false;
            return aspectsInCategory.some((aspect) =>
              photoAspects.includes(aspect),
            );
          },
        );
      }

      return false;
    });
  }

  // Apply artistic score filters
  if (Object.keys(artisticScoreFilters.value).length > 0) {
    filtered = filtered.filter((photo) => {
      const scores = photo.descriptions?.artistic_scores || {};
      return Object.entries(artisticScoreFilters.value).every(
        ([key, filterVal]) => {
          const score = scores[key];
          if (score === undefined) return false;
          const value =
            typeof filterVal === "object" ? filterVal.value : filterVal;
          const operator =
            typeof filterVal === "object" ? (filterVal.operator ?? ">=") : ">=";
          return operator === ">=" ? score >= value : score <= value;
        },
      );
    });
  }

  // Apply time range filter
  if (timeRangeFilter.value !== null) {
    const [minDate, maxDate] = timeRangeFilter.value;
    filtered = filtered.filter((photo) => {
      const timestamp = new Date(
        photo.descriptions?.EXIF?.dateTaken ?? photo.dateTaken,
      ).getTime();
      if (isNaN(timestamp)) return false;
      return timestamp >= minDate && timestamp <= maxDate;
    });
  }

  // Apply tag filter
  if (tagFilterResults.value !== null) {
    const tagResultsMap = new Map(
      tagFilterResults.value.map((item) => [item.photoId, item]),
    );
    filtered = filtered.filter((photo) => tagResultsMap.has(photo.id));
  }

  return filtered;
});

// Cluster type for beacons (updated after layout transitions complete)
const beaconsClusterType = ref("general");

// Tag Beacons overlay (zone-level dominant tag indicators)
const tagBeaconsSystem = useTagBeacons2D(
  filteredPhotos,
  pixiContainer,
  scale,
  offsetX,
  offsetY,
  SCALE_FACTOR,
  beaconsClusterType,
);

tagBeaconsSystem.config.value.enabled = props.isPreview;

// Selected photos with full data
const selectedPhotos = computed(() => {
  return photos2D.value.filter((photo) =>
    selectedPhotoIds.value.includes(photo.id),
  );
});

// Initialize PixiJS
const initPixi = async () => {
  if (!pixiContainer.value) return;

  // Create PixiJS application
  const app = new PIXI.Application();

  // ── Memory / perf tuning ──────────────────────────────────────────
  // 1. Cap resolution: on Retina (2×/3×) the canvas backing store is 4–9× larger.
  //    For a photo atlas with small thumbnails, 1× is more than enough on mobile,
  //    and 1.5× is a good quality/RAM trade-off on desktop.
  const maxRes = useLowPerformance.value
    ? 1
    : Math.min(window.devicePixelRatio || 1, 1.5);

  await app.init({
    background: getCurrentBackgroundColor.value,
    resizeTo: pixiContainer.value,
    antialias: false, // 2. Disable: doubles GPU render buffer, unnecessary for photo sprites
    resolution: maxRes,
    autoDensity: true,
    powerPreference: "high-performance", // 3. Use discrete GPU when available
    // 4. Texture GC: reclaim unused GPU textures much sooner (default: 3600 frames → ~5s)
    textureGCActive: true,
    textureGCMaxIdle: 300, // ~5s at 60 fps
    textureGCCheckCountMax: 120, // check every 2s
    // 5. Renderable GC: free GPU buffers of off-screen renderables sooner
    renderableGCActive: true,
    renderableGCMaxUnusedTime: 300,
    renderableGCFrequency: 120,
  });

  pixiContainer.value.appendChild(app.canvas);
  pixiApp.value = app;

  // Create container for photos
  const container = new PIXI.Container();
  container.sortableChildren = false; // No z-ordering needed for flat atlas (saves per-frame sort)
  app.stage.addChild(container);
  photoContainer.value = container;

  // Pattern labels (render above photos, same transform as the atlas)
  ensurePatternTagsLayer();

  // Setup interaction handlers
  setupInteraction(app);

  // Ensure background matches current selection (and stays in sync with the app theme).
  applyPixiBackground(atlasBackground.value);

  // Start reasonably centered even before we have bounds/positions.
  // This gets refined later by resetView() once positions are available.
  offsetX.value = pixiContainer.value.clientWidth / 2;
  offsetY.value = pixiContainer.value.clientHeight / 2;
  scale.value = 1;
  syncTargetCamera();
  updateContainerTransform();

  // If patterns are enabled, place the tag once Pixi is ready.
  ensurePatternTag();

  console.log("✅ PixiJS initialized");
};

// Setup mouse/touch interaction
const setupInteraction = (app) => {
  const canvas = app.canvas;
  canvasRef = canvas;

  // Store listeners for cleanup (array of [event, handler, options])
  const listeners = [
    ["wheel", handleWheel, { passive: false }],
    ["mousedown", handleMouseDown],
    ["mousemove", handleMouseMove],
    ["mouseup", handleMouseUp],
    ["mouseleave", handleMouseUp],
    ["touchstart", handleTouchStart, { passive: false }],
    ["touchmove", handleTouchMove, { passive: false }],
    ["touchend", handleTouchEnd],
    ["touchcancel", handleTouchEnd],
  ];

  // Add all listeners
  listeners.forEach(([event, handler, options]) => {
    canvas.addEventListener(event, handler, options);
    canvasListeners.push([event, handler, options]);
  });

  // Setup keyboard navigation
  setupKeyboardNavigation();
};

// Setup keyboard navigation
const setupKeyboardNavigation = () => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  canvasListeners.push(["keydown", handleKeyDown]);
  canvasListeners.push(["keyup", handleKeyUp]);
};

// Keyboard event handlers
const handleKeyDown = (e) => {
  // Ignore keyboard navigation if user is typing in an input/textarea/select
  const target = e.target;
  const tagName = target?.tagName?.toLowerCase();
  const isEditable = target?.isContentEditable;

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    isEditable ||
    target?.closest?.(".n-select") || // Naive UI select dropdown
    target?.closest?.(".n-input") // Naive UI input
  ) {
    return; // Don't intercept, let the user type normally
  }

  const key = e.key.toLowerCase();

  // Check if it's a navigation key
  if (
    key === "w" ||
    key === "a" ||
    key === "s" ||
    key === "d" ||
    key === "arrowup" ||
    key === "arrowdown" ||
    key === "arrowleft" ||
    key === "arrowright"
  ) {
    // Prevent default behavior (like scrolling the page)
    e.preventDefault();

    // Add key to pressed set
    keysPressed.value.add(key);

    // Start keyboard animation loop if not already running
    if (!keyboardAnimationId) {
      keyboardAnimationId = requestAnimationFrame(updateKeyboardPan);
    }
  }
};

const handleKeyUp = (e) => {
  // Ignore keyboard navigation if user is typing in an input/textarea/select
  const target = e.target;
  const tagName = target?.tagName?.toLowerCase();
  const isEditable = target?.isContentEditable;

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    isEditable ||
    target?.closest?.(".n-select") || // Naive UI select dropdown
    target?.closest?.(".n-input") // Naive UI input
  ) {
    return; // Don't intercept, let the user type normally
  }

  const key = e.key.toLowerCase();
  keysPressed.value.delete(key);

  // If no navigation keys are pressed, stop the loop and update LOD
  if (keysPressed.value.size === 0 && keyboardAnimationId) {
    cancelAnimationFrame(keyboardAnimationId);
    keyboardAnimationId = null;
    scheduleLodUpdate();
    scheduleHiResUpdate();
  }
};

// Update panning based on pressed keys
const updateKeyboardPan = () => {
  if (keysPressed.value.size === 0) {
    keyboardAnimationId = null;
    return;
  }

  let dx = 0;
  let dy = 0;

  // Check which keys are pressed and adjust delta
  if (keysPressed.value.has("w") || keysPressed.value.has("arrowup")) {
    dy += keyboardPanSpeed;
  }
  if (keysPressed.value.has("s") || keysPressed.value.has("arrowdown")) {
    dy -= keyboardPanSpeed;
  }
  if (keysPressed.value.has("a") || keysPressed.value.has("arrowleft")) {
    dx += keyboardPanSpeed;
  }
  if (keysPressed.value.has("d") || keysPressed.value.has("arrowright")) {
    dx -= keyboardPanSpeed;
  }

  // Apply panning
  if (dx !== 0 || dy !== 0) {
    offsetX.value += dx;
    offsetY.value += dy;
    updateContainerTransform();
    syncTargetCamera();
  }

  // Continue loop
  keyboardAnimationId = requestAnimationFrame(updateKeyboardPan);
};

// Cleanup canvas interaction
const cleanupInteraction = () => {
  // Stop keyboard animation loop
  if (keyboardAnimationId) {
    cancelAnimationFrame(keyboardAnimationId);
    keyboardAnimationId = null;
  }

  // Remove keyboard listeners from window
  try {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  } catch (_) {}

  if (!canvasRef) return;

  // Remove all listeners
  canvasListeners.forEach(([event, handler, options]) => {
    try {
      if (event === "keydown" || event === "keyup") {
        window.removeEventListener(event, handler, options);
      } else {
        canvasRef.removeEventListener(event, handler, options);
      }
    } catch (_) {}
  });

  canvasListeners.length = 0;
  canvasRef = null;
};

// Event handlers
const handleWheel = (e) => {
  e.preventDefault();

  const rect = pixiContainer.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
  const newScale = clampScale(targetCamera.scale * factor);
  if (!applyZoomAboutScreenPoint(mouseX, mouseY, newScale, targetCamera)) {
    return;
  }

  startAnimationLoop();
  // LOD update only after wheel interaction settles (debounced)
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

const handleMouseDown = (e) => {
  if (e.button !== 0) return;

  if ((e.ctrlKey || e.metaKey) && !props.isPreview) {
    // Ctrl/Cmd + drag → rect selection mode
    const rect = pixiContainer.value?.getBoundingClientRect();
    if (!rect) return;
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    isRectSelecting.value = true;
    rectSelectStart.value = { x: localX, y: localY };
    rectSelectEnd.value = { x: localX, y: localY };
    dragStartPosition.value = { x: e.clientX, y: e.clientY };
    return;
  }

  isDragging.value = true;
  dragStartPosition.value = { x: e.clientX, y: e.clientY };
  lastPointerPosition.value = { x: e.clientX, y: e.clientY };
  cancelLodUpdate(); // abort any pending LOD work while dragging
};

const handleMouseMove = (e) => {
  // Update hover detection
  updateHoverState(e);

  if (isRectSelecting.value) {
    const rect = pixiContainer.value?.getBoundingClientRect();
    if (!rect) return;
    rectSelectEnd.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    return;
  }

  if (!isDragging.value) return;

  const dx = e.clientX - lastPointerPosition.value.x;
  const dy = e.clientY - lastPointerPosition.value.y;

  offsetX.value += dx;
  offsetY.value += dy;

  lastPointerPosition.value = { x: e.clientX, y: e.clientY };
  updateContainerTransform();
  syncTargetCamera();
  // Do NOT schedule LOD during drag — wait until mouseUp
};

const commitRectSelection = () => {
  // Convert screen rect corners to world coordinates
  const x1s = Math.min(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y1s = Math.min(rectSelectStart.value.y, rectSelectEnd.value.y);
  const x2s = Math.max(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y2s = Math.max(rectSelectStart.value.y, rectSelectEnd.value.y);

  // Ignore tiny accidental rects (less than 5px in any dimension)
  if (x2s - x1s < 5 && y2s - y1s < 5) return;

  const worldTL = screenToWorld(x1s, y1s);
  const worldBR = screenToWorld(x2s, y2s);

  const newIds = [];
  for (const photo of filteredPhotos.value) {
    const sprite = photoSprites.value.get(photo.id);
    if (!sprite) continue;
    const [px, py] = photo.position || [0, 0];
    const wx = px * SCALE_FACTOR;
    const wy = py * SCALE_FACTOR;
    if (
      wx >= worldTL.x &&
      wx <= worldBR.x &&
      wy >= worldTL.y &&
      wy <= worldBR.y
    ) {
      newIds.push(photo.id);
    }
  }

  // Add newly rect-selected ids to existing selection
  for (const id of newIds) {
    if (!selectedPhotoIds.value.includes(id)) {
      selectedPhotoIds.value.push(id);
    }
    updateSpriteSelection(id);
  }
};

const handleMouseUp = (e) => {
  if (isRectSelecting.value) {
    commitRectSelection();
    isRectSelecting.value = false;
    return;
  }

  if (isDragging.value && e) {
    // Check if it was a click (not a drag)
    const dx = Math.abs(e.clientX - dragStartPosition.value.x);
    const dy = Math.abs(e.clientY - dragStartPosition.value.y);
    if (dx < 5 && dy < 5) {
      handleClick(e);
    }
  }
  isDragging.value = false;
  // Run soon after releasing pointer (user likely paused).
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

// Touch handlers
const handleTouchStart = (e) => {
  e.preventDefault();
  cancelLodUpdate(); // abort pending LOD work while touching
  const touches = e.touches;

  if (touches.length === 1) {
    isDragging.value = true;
    touchStartTime.value = performance.now();
    dragStartPosition.value = {
      x: touches[0].clientX,
      y: touches[0].clientY,
    };
    lastPointerPosition.value = {
      x: touches[0].clientX,
      y: touches[0].clientY,
    };
  } else if (touches.length === 2) {
    isPinching.value = true;
    isDragging.value = false;
    hadRecentPinch.value = true;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    lastPinchDistance.value = Math.sqrt(dx * dx + dy * dy);

    // Midpoint (local coords) and anchored world point under it.
    const midClientX = (touches[0].clientX + touches[1].clientX) / 2;
    const midClientY = (touches[0].clientY + touches[1].clientY) / 2;
    const mid = getLocalPointFromClient(midClientX, midClientY, e);
    lastPinchCenter.value = mid;
    lastPinchWorld.value = screenToWorld(mid.x, mid.y);
  }
};

const handleTouchMove = (e) => {
  e.preventDefault();
  const touches = e.touches;

  if (isPinching.value && touches.length === 2) {
    // Compute current midpoint in local (container) coords.
    const midClientX = (touches[0].clientX + touches[1].clientX) / 2;
    const midClientY = (touches[0].clientY + touches[1].clientY) / 2;
    const mid = getLocalPointFromClient(midClientX, midClientY, e);

    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Guard against 0/NaN distance.
    const prevDistance = Number(lastPinchDistance.value) || distance || 1;
    const pinchScale = distance > 0 ? distance / prevDistance : 1;

    const oldScale = Number(scale.value) || 1;
    const newScale = clampScale(oldScale * pinchScale);
    scale.value = newScale;

    // Keep the same world point under the pinch midpoint, while allowing midpoint translation.
    // worldAnchor was computed from the previous frame's midpoint.
    const worldAnchor =
      lastPinchWorld.value || screenToWorld(mid.x, mid.y, oldScale);
    offsetX.value = mid.x - (worldAnchor.x || 0) * newScale;
    offsetY.value = mid.y - (worldAnchor.y || 0) * newScale;

    lastPinchDistance.value = distance;
    lastPinchCenter.value = mid;
    // Recompute anchor from the updated transform (numerically stable).
    lastPinchWorld.value = screenToWorld(mid.x, mid.y, newScale);

    updateContainerTransform();
    syncTargetCamera();
    // Do NOT schedule LOD during pinch — wait until touchEnd
  } else if (isDragging.value && touches.length === 1) {
    const dx = touches[0].clientX - lastPointerPosition.value.x;
    const dy = touches[0].clientY - lastPointerPosition.value.y;

    offsetX.value += dx;
    offsetY.value += dy;

    lastPointerPosition.value = {
      x: touches[0].clientX,
      y: touches[0].clientY,
    };
    updateContainerTransform();
    syncTargetCamera();
    // Do NOT schedule LOD during drag — wait until touchEnd
  }
};

const handleTouchEnd = (e) => {
  const wasPinching = isPinching.value;

  // Check for tap (click on touch). Avoid tap simulation after a pinch.
  // Stricter validation: must be quick, minimal movement, and no recent pinch
  if (
    !wasPinching &&
    !hadRecentPinch.value &&
    isDragging.value &&
    e.changedTouches.length > 0
  ) {
    const touch = e.changedTouches[0];
    const touchDuration = performance.now() - touchStartTime.value;
    const dx = Math.abs(touch.clientX - dragStartPosition.value.x);
    const dy = Math.abs(touch.clientY - dragStartPosition.value.y);
    const totalMovement = Math.sqrt(dx * dx + dy * dy);

    // Only register as tap if:
    // - Duration < 300ms (quick tap)
    // - Movement < 15px (minimal drift)
    // - Total Euclidean distance < 20px
    if (touchDuration < 300 && dx < 15 && dy < 15 && totalMovement < 20) {
      // Simulate click event
      handleClick({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  // If one finger remains after pinching, seamlessly transition to pan.
  if (e.touches && e.touches.length === 1) {
    isPinching.value = false;
    isDragging.value = true;
    touchStartTime.value = performance.now();
    const t = e.touches[0];
    dragStartPosition.value = { x: t.clientX, y: t.clientY };
    lastPointerPosition.value = { x: t.clientX, y: t.clientY };
  } else {
    isDragging.value = false;
    isPinching.value = false;

    // Clear the recent pinch flag after a short delay
    // This prevents accidental taps immediately after pinch gesture ends
    if (hadRecentPinch.value) {
      setTimeout(() => {
        hadRecentPinch.value = false;
      }, 300);
    }
  }

  // User stopped interacting, evaluate hi-res target.
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

// Update container transform
const updateContainerTransform = () => {
  if (!photoContainer.value) return;
  photoContainer.value.x = offsetX.value;
  photoContainer.value.y = offsetY.value;
  photoContainer.value.scale.set(scale.value);

  // Keep pattern tag size stable on screen.
  updateAllPatternTagsScreenScale();
};

// Hover debounce timer
let hoverTimer = null;
const HOVER_DEBOUNCE_MS = 200;

// Update hover state (debounced to avoid network spam from tooltip image loads)
const updateHoverState = (e) => {
  // Immediately clear hover if dragging or container missing
  if (!photoContainer.value || isDragging.value) {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hoveredPhoto.value = null;
    clearTooltipAnchor();
    return;
  }

  // Tooltip is disabled when zoomed in; avoid expensive hit-testing.
  if (scale.value >= 1.5) {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hoveredPhoto.value = null;
    clearTooltipAnchor();
    return;
  }

  // Debounce: only update hover after user pauses
  if (hoverTimer) {
    clearTimeout(hoverTimer);
  }

  hoverTimer = setTimeout(() => {
    hoverTimer = null;

    const rect = pixiContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to world coordinates
    const worldX = (mouseX - offsetX.value) / scale.value;
    const worldY = (mouseY - offsetY.value) / scale.value;

    // Find photo under cursor
    let foundPhoto = null;

    for (const photo of filteredPhotos.value) {
      const [px, py] = photo.position || [0, 0];
      const canvasX = px * SCALE_FACTOR;
      const canvasY = py * SCALE_FACTOR;

      // Get actual sprite dimensions (respects aspect ratio)
      const sprite = photoSprites.value.get(photo.id);
      if (!sprite) continue;

      const halfWidth = sprite.width / 2;
      const halfHeight = sprite.height / 2;

      if (
        worldX >= canvasX - halfWidth &&
        worldX <= canvasX + halfWidth &&
        worldY >= canvasY - halfHeight &&
        worldY <= canvasY + halfHeight
      ) {
        foundPhoto = photo;
        break;
      }
    }

    // Only show tooltip if zoomed in enough
    if (foundPhoto) {
      // Show tooltip only when zoom level is below threshold (far away)
      if (scale.value < 1.5) {
        hoveredPhoto.value = foundPhoto;
        placeTooltipAt({ x: mouseX, y: mouseY });
      } else {
        hoveredPhoto.value = null;
        clearTooltipAnchor();
      }
    } else {
      hoveredPhoto.value = null;
      clearTooltipAnchor();
    }
  }, HOVER_DEBOUNCE_MS);
};

// Handle click for selection (now handled by sprite pointerdown events)
const handleClick = (e) => {
  // Clicks are now handled directly on sprites via pointerdown events
  // This function is kept for backwards compatibility but is no longer used
};

// PIXI selection borders (photoId -> PIXI.Graphics in photoContainer space)
const selectionBordersMap = new Map();

// Below this world-scale the border becomes too thin to see; switch to fill overlay
const SELECTION_FILL_THRESHOLD = 0.35;

const getAccentColorNumber = () => {
  try {
    const cssColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-color")
      .trim();
    if (cssColor && PIXI?.Color) {
      return new PIXI.Color(cssColor).toNumber();
    }
  } catch (_) {}
  return 0x6366f1;
};

const drawSelectionOverlay = (photoId) => {
  const sprite = photoSprites.value.get(photoId);
  if (!sprite || !photoContainer.value) return;

  let g = selectionBordersMap.get(photoId);
  if (!g || g.destroyed) {
    g = new PIXI.Graphics();
    photoContainer.value.addChild(g);
    selectionBordersMap.set(photoId, g);
  }
  g.clear();
  g.x = sprite.x;
  g.y = sprite.y;
  const halfW = sprite.width / 2;
  const halfH = sprite.height / 2;
  const accentColor = getAccentColorNumber();

  if (scale.value < SELECTION_FILL_THRESHOLD) {
    // Fill mode: solid accent overlay when too zoomed-out for a border to be visible
    g.rect(-halfW, -halfH, sprite.width, sprite.height);
    g.fill({ color: accentColor, alpha: 0.55 });
  } else {
    // Border mode: accent stroke
    g.rect(-halfW - 1, -halfH - 1, sprite.width + 2, sprite.height + 2);
    g.stroke({ color: accentColor, width: 3 });
  }
};

const clearSelectionOverlay = (photoId) => {
  const g = selectionBordersMap.get(photoId);
  if (!g) return;
  g.clear();
  if (photoContainer.value) {
    try {
      photoContainer.value.removeChild(g);
    } catch (_) {}
  }
  try {
    g.destroy();
  } catch (_) {}
  selectionBordersMap.delete(photoId);
};

const updateAllSelectionOverlayPositions = () => {
  if (selectionBordersMap.size === 0) return;
  const accentColor = getAccentColorNumber();
  const fillMode = scale.value < SELECTION_FILL_THRESHOLD;
  selectionBordersMap.forEach((g, photoId) => {
    if (!g || g.destroyed) return;
    const sprite = photoSprites.value.get(photoId);
    if (!sprite) return;
    g.clear();
    g.x = sprite.x;
    g.y = sprite.y;
    const halfW = sprite.width / 2;
    const halfH = sprite.height / 2;
    if (fillMode) {
      g.rect(-halfW, -halfH, sprite.width, sprite.height);
      g.fill({ color: accentColor, alpha: 0.55 });
    } else {
      g.rect(-halfW - 1, -halfH - 1, sprite.width + 2, sprite.height + 2);
      g.stroke({ color: accentColor, width: 3 });
    }
  });
};

// Redraw selection overlays when zoom crosses the fill/border threshold
const selectionFillMode = computed(
  () => scale.value < SELECTION_FILL_THRESHOLD,
);
watch(selectionFillMode, () => {
  updateAllSelectionOverlayPositions();
});

// Update sprite selection visual
const updateSpriteSelection = (photoId) => {
  const isSelected = selectedPhotoIds.value.includes(photoId);
  if (isSelected) {
    drawSelectionOverlay(photoId);
  } else {
    clearSelectionOverlay(photoId);
  }
};

// Easing function for smooth animations
const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// Reposition existing sprites with smooth animation
const repositionSprites = (newPhotos) => {
  console.log("♻️ Repositioning existing sprites with animation");

  // Store target positions
  animationTargetPositions.clear();

  newPhotos.forEach((photo) => {
    const sprite = photoSprites.value.get(photo.id);
    if (sprite && photo.position) {
      const [x, y] = photo.position;
      const targetX = x * SCALE_FACTOR;
      const targetY = y * SCALE_FACTOR;

      // Store current position as start position
      sprite.userData = sprite.userData || {};
      sprite.userData.startX = sprite.x;
      sprite.userData.startY = sprite.y;

      // Store target position
      animationTargetPositions.set(photo.id, [targetX, targetY]);
    }
  });

  // Start animation
  isTransitioning.value = true;
  animationStartTime.value = performance.now();
};

// Update sprite positions during animation
const updateTransitionPositions = (currentTime) => {
  if (!isTransitioning.value || animationTargetPositions.size === 0) {
    return;
  }

  const elapsed = currentTime - animationStartTime.value;
  const progress = Math.min(elapsed / TRANSITION_DURATION, 1);
  const easedProgress = easeInOutCubic(progress);

  // Update all sprite positions
  animationTargetPositions.forEach(([targetX, targetY], photoId) => {
    const sprite = photoSprites.value.get(photoId);
    if (sprite && sprite.userData) {
      const startX = sprite.userData.startX;
      const startY = sprite.userData.startY;

      sprite.x = startX + (targetX - startX) * easedProgress;
      sprite.y = startY + (targetY - startY) * easedProgress;

      // Keep selection overlay in sync during transition
      const selBorder = selectionBordersMap.get(photoId);
      if (selBorder && !selBorder.destroyed) {
        selBorder.x = sprite.x;
        selBorder.y = sprite.y;
      }
    }
  });

  // Check if animation is complete
  if (progress >= 1) {
    isTransitioning.value = false;

    // Set final positions and cleanup
    animationTargetPositions.forEach(([targetX, targetY], photoId) => {
      const sprite = photoSprites.value.get(photoId);
      if (sprite) {
        sprite.x = targetX;
        sprite.y = targetY;
        delete sprite.userData.startX;
        delete sprite.userData.startY;
      }
    });

    animationTargetPositions.clear();
    console.log("✅ Position transition completed");

    // Sync selection overlay positions to final sprite positions.
    updateAllSelectionOverlayPositions();

    // Rebuild spatial index after positions change.
    buildHiResSpatialIndex();

    // Closest-photo set changed; refresh LOD targets.
    scheduleLodUpdate();

    // Update heatmap with new positions
    scheduleHeatmapUpdate();
  }
};

// Load photos into PixiJS with retry logic for 403/429 errors
const loadPhotosToPixi = async () => {
  if (!photoContainer.value || !pixiApp.value) return;

  photoContainer.value.visible = false;
  isLoadingTextures.value = true;
  loadingProgress.value = 0;

  try {
    // Clear any existing selection (selection Graphics are wiped by removeChildren below)
    selectedPhotoIds.value = [];
    selectionBordersMap.clear();

    // Clear existing sprites - DESTROY them to free GPU memory (not just remove from container)
    for (const sprite of photoSprites.value.values()) {
      try {
        sprite.destroy({ children: false, texture: false }); // texture managed by textureManager
      } catch (_) {}
    }
    photoContainer.value.removeChildren();
    photoSprites.value.clear();
    resetLodState();

    // Recreate the tag layer, since removeChildren() wipes it.
    ensurePatternTagsLayer();

    // Note: we intentionally DO NOT call PIXI.Assets.reset() here.
    // Doing so forces re-creation/re-download of textures and defeats the IndexedDB cache.

    const photosToLoad = photos2D.value;
    const total = photosToLoad.length;
    let loaded = 0;

    // Prime caches from IndexedDB (fast-path for previously downloaded images)
    try {
      await textureManager.initDB();
      await textureManager.loadImagesFromCache(photosToLoad);
    } catch (_) {
      // Non-fatal: proceed with network loading
    }

    // First-visit detection: loadImagesFromCache() populates
    // textureManager.cachedPhotoIds with the ids already present in IndexedDB.
    // If the vast majority still need to be downloaded, warn the user that this
    // initial caching pass can take a while (so they don't close the screen).
    maybeShowCachingBanner(total);

    // Create placeholder texture ONCE and reuse (GPU memory optimization)
    if (!placeholderTexture.value || placeholderTexture.value.destroyed) {
      try {
        const placeholderGraphics = new PIXI.Graphics();
        placeholderGraphics.rect(0, 0, photoSize.value, photoSize.value * 0.75);
        placeholderGraphics.fill({ color: 0x2a2a2a });
        placeholderGraphics.stroke({ color: 0x3a3a3a, width: 1 });
        placeholderTexture.value =
          pixiApp.value.renderer.generateTexture(placeholderGraphics);
        placeholderGraphics.destroy(); // Free the Graphics object immediately
      } catch (err) {
        console.warn("⚠️ Failed to create placeholder texture:", err);
      }
    }

    // Fallback: use PIXI.Texture.WHITE if placeholder creation failed
    const textureToUse = placeholderTexture.value || PIXI.Texture.WHITE;

    // Reduce batch size on low-performance devices to avoid rate limiting
    // For high-performance devices (laptop/pc), use a much larger batch size to load images extremely fast since they are already bulk-cached in memory!
    const batchSize = useLowPerformance.value ? 24 : 350;

    for (let i = 0; i < photosToLoad.length; i += batchSize) {
      const batch = photosToLoad.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (photo) => {
          const [x, y] = photo.position || [0, 0];
          const canvasX = x * SCALE_FACTOR;
          const canvasY = y * SCALE_FACTOR;

          // Create sprite with placeholder first
          const sprite = new PIXI.Sprite(textureToUse);
          sprite.anchor.set(0.5);
          sprite.x = canvasX;
          sprite.y = canvasY;
          sprite.width = photoSize.value;
          sprite.height = photoSize.value * 0.75;
          // Enable interaction for precise touch/click detection
          sprite.eventMode = "static";
          sprite.cursor = props.isPreview ? "default" : "pointer";

          // Track pointer position to detect panning vs tap
          let pointerDownPos = null;
          let pointerDownTime = 0;

          sprite.on("pointerdown", (event) => {
            // Store initial position and time for movement detection
            pointerDownPos = { x: event.global.x, y: event.global.y };
            pointerDownTime = performance.now();
          });

          // Handle selection on pointerup (after validating it wasn't a pan)
          sprite.on("pointerup", (event) => {
            if (props.isPreview) {
              pointerDownPos = null;
              return;
            }
            if (!pointerDownPos || isPinching.value) {
              pointerDownPos = null;
              return;
            }

            // Calculate movement since pointerdown
            const dx = Math.abs(event.global.x - pointerDownPos.x);
            const dy = Math.abs(event.global.y - pointerDownPos.y);
            const totalMovement = Math.sqrt(dx * dx + dy * dy);
            const duration = performance.now() - pointerDownTime;

            // Reset tracking
            pointerDownPos = null;

            // Only select if:
            // - Duration < 300ms (quick tap)
            // - Movement < 10px (minimal drift - stricter than touch threshold)
            // - Not currently pinching
            if (duration < 300 && totalMovement < 10) {
              event.stopPropagation();

              const photoId = photo.id;
              const index = selectedPhotoIds.value.indexOf(photoId);
              if (index === -1) {
                selectedPhotoIds.value.push(photoId);
              } else {
                selectedPhotoIds.value.splice(index, 1);
              }
              updateSpriteSelection(photoId);
            }
          });

          // Clean up tracking if pointer leaves sprite
          sprite.on("pointerupoutside", () => {
            pointerDownPos = null;
          });

          // Store reference
          photoSprites.value.set(photo.id, sprite);
          photoContainer.value.addChild(sprite);

          // Load actual texture (cached via IndexedDB + in-memory)
          const texture = await textureManager.getOrCreateTexture(photo, {
            quality: "thumb",
            maxSide: getMaxSideForQuality("low"),
          });
          if (texture) {
            sprite.texture = texture;

            // Adjust aspect ratio
            const aspectRatio = texture.height / texture.width;
            sprite.width = photoSize.value;
            sprite.height = photoSize.value * aspectRatio;
          }

          // Track initial LOD level
          sprite.__lodLevel = "low";
          lodCurrentLevel.set(photo.id, "low");

          loaded++;
          loadingProgress.value = Math.round((loaded / total) * 100);
        }),
      );

      // Free source images from this batch immediately (low performance only).
      // On high-performance/desktop, we avoid intermediate freeing within this loop
      // so we don't cause tearing or garbage collection stalls during texture creation,
      // and we free them all at the very end of loadPhotosToPixi to minimize peak load memory.
      for (const photo of batch) {
        if (useLowPerformance.value) {
          textureManager.freeSourceImage(photo.id);
          photo.__imageElement = null;
        }
      }

      // Small delay between batches to avoid overwhelming cloudflare but keep laptop instantaneous
      if (useLowPerformance.value) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      } else {
        const hasDownloads = batch.some((p) => !p.__fromCache);
        if (hasDownloads) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        } else if (i % 600 === 0) {
          // Micro-yield to keep GUI responsive but extremely fast
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    console.log(`✅ Loaded ${loaded} photo textures`);

    // Persist newly downloaded images (so future visits don't re-download)
    try {
      await textureManager.bulkCacheDownloadedImages(photosToLoad);
      const stats = await textureManager.getCacheStats();
      console.log(
        `💾 2D IndexedDB cache: ${stats?.totalImages ?? 0} images stored`,
      );
    } catch (_) {
      // Non-fatal
    }

    // ── CRITICAL MEMORY FIX ──────────────────────────────────────────────
    // Free the decoded HTMLImageElements held in downloadedImagesCache.
    // With 5000 photos, these consume ~600 MB+ of JS heap memory and are no
    // longer needed: Pixi textures are already created and cached in textureCache.
    // Without this, browsers kill the tab on devices with < 4 GB RAM.
    textureManager.freeSourceImageCache(photosToLoad);

    // After the next render frame, Pixi has uploaded all textures to GPU.
    // Free the intermediate Canvas elements used by downscaleSource() (~135 MB).
    // Use a generous delay so Pixi has time to render & upload all textures.
    setTimeout(() => {
      textureManager.freeTextureCanvasSources();
    }, 3000);

    // Apply initial filter visibility
    updateSpriteVisibility();

    // Build spatial index for hi-res candidate selection.
    buildHiResSpatialIndex();

    // Ensure the pattern label is visible above sprites.
    ensurePatternTagsLayer();
    ensurePatternTag();

    // After initial load, opportunistically upgrade if already zoomed in.
    scheduleLodUpdate();
    scheduleHiResUpdate();
  } finally {
    if (photoContainer.value) {
      photoContainer.value.visible = true;
    }
    isLoadingTextures.value = false;
    // Images are cached by now; drop the first-visit "caching" banner.
    dismissCachingBanner();
  }
};

// Opacity mapping for text search stars
const TEXT_SEARCH_OPACITY = {
  3: 1.0, // excellent → full opacity
  2: 0.7, // good → slightly less
  1: 0.4, // fair → less
  0: 0.12, // poor / question mark → almost invisible
  none: 0.03, // not in results → nearly invisible
};

// Update sprite visibility based on filters
const updateSpriteVisibility = () => {
  if (!photoSprites.value.size) return;

  const filteredIds = new Set(filteredPhotos.value.map((p) => p.id));
  const scoreMap = textSearchScoreMap.value;

  photoSprites.value.forEach((sprite, photoId) => {
    const isFiltered = filteredIds.has(photoId);

    if (!isFiltered) {
      sprite.visible = false;
      sprite.alpha = 1;
      return;
    }

    sprite.visible = true;

    // If text search is active, apply opacity based on score
    if (scoreMap) {
      const scoreData = scoreMap.get(photoId);
      if (scoreData) {
        sprite.alpha =
          TEXT_SEARCH_OPACITY[scoreData.stars] ?? TEXT_SEARCH_OPACITY[0];
      } else {
        sprite.alpha = TEXT_SEARCH_OPACITY.none;
      }
    } else {
      sprite.alpha = 1;
    }
  });

  scheduleLodUpdate();
  scheduleHiResUpdate();
  scheduleHeatmapUpdate();
};

// Zoom controls
const zoomIn = () => {
  const centerX = pixiContainer.value?.clientWidth / 2 || 0;
  const centerY = pixiContainer.value?.clientHeight / 2 || 0;

  if (
    !applyZoomAboutScreenPoint(
      centerX,
      centerY,
      targetCamera.scale * 1.1,
      targetCamera,
    )
  ) {
    return;
  }

  startAnimationLoop();
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

const zoomOut = () => {
  const centerX = pixiContainer.value?.clientWidth / 2 || 0;
  const centerY = pixiContainer.value?.clientHeight / 2 || 0;

  if (
    !applyZoomAboutScreenPoint(
      centerX,
      centerY,
      targetCamera.scale / 1.1,
      targetCamera,
    )
  ) {
    return;
  }

  startAnimationLoop();
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

const resetView = (animate = true) => {
  if (!pixiContainer.value || photos2D.value.length === 0) return;

  // Use filtered photos bounds so fit-to-view frames only visible photos
  const target =
    filteredPhotos.value.length > 0 ? filteredPhotos.value : photos2D.value;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  target.forEach((photo) => {
    const [x, y] = photo.position || [0, 0];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const paddingX = (maxX - minX) * 0.1 || 10;
  const paddingY = (maxY - minY) * 0.1 || 10;
  const bounds = {
    minX: minX - paddingX,
    maxX: maxX + paddingX,
    minY: minY - paddingY,
    maxY: maxY + paddingY,
  };

  const centerX = ((bounds.minX + bounds.maxX) / 2) * SCALE_FACTOR;
  const centerY = ((bounds.minY + bounds.maxY) / 2) * SCALE_FACTOR;

  const boundsWidth = (bounds.maxX - bounds.minX) * SCALE_FACTOR;
  const boundsHeight = (bounds.maxY - bounds.minY) * SCALE_FACTOR;

  const containerWidth = pixiContainer.value.clientWidth;
  const containerHeight = pixiContainer.value.clientHeight;

  const scaleX = containerWidth / (boundsWidth + 100);
  const scaleY = containerHeight / (boundsHeight + 100);
  const targetScale = Math.min(scaleX, scaleY, 1);

  const targetOffsetX = containerWidth / 2 - centerX * targetScale;
  const targetOffsetY = containerHeight / 2 - centerY * targetScale;

  if (!animate) {
    scale.value = targetScale;
    offsetX.value = targetOffsetX;
    offsetY.value = targetOffsetY;
    syncTargetCamera();
    updateContainerTransform();
    scheduleLodUpdate();
    scheduleHiResUpdate();
    return;
  }

  // Animated transition using the flight system
  const dx = targetOffsetX - offsetX.value;
  const dy = targetOffsetY - offsetY.value;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const scaleDiff = Math.abs(targetScale - scale.value);
  const duration = Math.max(
    600,
    Math.min(1500, distance * 0.3 + scaleDiff * 200),
  );

  flightState.value = {
    startTime: performance.now(),
    duration,
    startOffsetX: offsetX.value,
    startOffsetY: offsetY.value,
    targetOffsetX,
    targetOffsetY,
    startScale: scale.value,
    targetScale,
  };
  isFlying.value = true;

  if (!animationFrameId.value) {
    animationFrameId.value = requestAnimationFrame(flightAnimationLoop);
  }
};

// Fly camera to frame all photos of a given pattern
const flyToPattern = (pattern) => {
  if (!pixiContainer.value || !pattern) return;

  const photoIds = pattern.clusterPhotos || [];
  if (photoIds.length === 0) return;

  const idSet = new Set(photoIds.map(String));

  // Collect positions of pattern photos
  const positions = [];
  for (const photo of photos2D.value) {
    if (!idSet.has(String(photo.id))) continue;
    const [px, py] = photo.position || [0, 0];
    positions.push([px, py]);
  }

  if (positions.length === 0) return;

  // Exclude outliers using IQR on distance from median center
  let used = positions;
  if (positions.length >= 6) {
    // Median center
    const xs = positions.map((p) => p[0]).sort((a, b) => a - b);
    const ys = positions.map((p) => p[1]).sort((a, b) => a - b);
    const medianX = xs[Math.floor(xs.length / 2)];
    const medianY = ys[Math.floor(ys.length / 2)];

    // Distances from median center
    const dists = positions.map((p) =>
      Math.sqrt((p[0] - medianX) ** 2 + (p[1] - medianY) ** 2),
    );
    const sorted = [...dists].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const cutoff = q3 + 1.5 * iqr;

    const filtered = positions.filter((_, i) => dists[i] <= cutoff);
    // Only use filtered set if we keep at least 60% of photos
    if (filtered.length >= positions.length * 0.6) {
      used = filtered;
    }
  }

  // Compute bounding box of kept photos
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [px, py] of used) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  // Add padding (10% of bounds or at least 1 unit)
  const padX = Math.max((maxX - minX) * 0.1, 1);
  const padY = Math.max((maxY - minY) * 0.1, 1);
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const centerX = ((minX + maxX) / 2) * SCALE_FACTOR;
  const centerY = ((minY + maxY) / 2) * SCALE_FACTOR;
  const boundsWidth = (maxX - minX) * SCALE_FACTOR;
  const boundsHeight = (maxY - minY) * SCALE_FACTOR;

  const containerWidth = pixiContainer.value.clientWidth;
  const containerHeight = pixiContainer.value.clientHeight;

  const scaleX = containerWidth / (boundsWidth + 100);
  const scaleY = containerHeight / (boundsHeight + 100);
  const targetScale = Math.min(scaleX, scaleY, MAX_SCALE);

  const targetOffsetX = containerWidth / 2 - centerX * targetScale;
  const targetOffsetY = containerHeight / 2 - centerY * targetScale;

  // Animated transition using the flight system
  const dx = targetOffsetX - offsetX.value;
  const dy = targetOffsetY - offsetY.value;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const scaleDiff = Math.abs(targetScale - scale.value);
  const duration = Math.max(
    600,
    Math.min(1500, distance * 0.3 + scaleDiff * 200),
  );

  flightState.value = {
    startTime: performance.now(),
    duration,
    startOffsetX: offsetX.value,
    startOffsetY: offsetY.value,
    targetOffsetX,
    targetOffsetY,
    startScale: scale.value,
    targetScale,
  };
  isFlying.value = true;

  if (!animationFrameId.value) {
    animationFrameId.value = requestAnimationFrame(flightAnimationLoop);
  }
};

// ============================================================================
// Photo Flight Navigation (similar to 3D Atlas)
// ============================================================================

// Store pending photo ID if user clicks "Take to 2D" before photos are loaded
const pendingPhotoFlightId = ref(null);

// Animation state for camera flight
const isFlying = ref(false);
const flightState = ref(null);

/**
 * Smoothly flies camera to a specific photo
 * @param {string|number} photoId - The photo ID to fly to
 * @returns {boolean} true if flight initiated, false if photo not found
 */
const flyToPhoto = (photoId) => {
  if (!pixiContainer.value || !photoContainer.value) {
    console.warn("🚫 flyToPhoto: Container not ready");
    return false;
  }

  // Find the photo in photos2D
  const photo = photos2D.value.find((p) => String(p.id) === String(photoId));

  if (!photo) {
    console.warn(`🚫 flyToPhoto: Photo ${photoId} not found in 2D scene`);
    return false;
  }

  // Check if photo has valid position (stored as [x, y] array)
  if (!photo.position || !Array.isArray(photo.position)) {
    console.warn(`🚫 flyToPhoto: Photo ${photoId} has no position array`);
    return false;
  }

  const [x, y] = photo.position;

  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    console.warn(`🚫 flyToPhoto: Photo ${photoId} has invalid position values`);
    return false;
  }

  // Wait for loading to complete before flying
  if (isLoadingPositions.value || isLoadingTextures.value) {
    console.warn(
      `🚫 flyToPhoto: Still loading (positions: ${isLoadingPositions.value}, textures: ${isLoadingTextures.value})`,
    );
    return false;
  }

  // Check if sprite exists (photo must be rendered)
  const sprite = photoSprites.value.get(photo.id);
  if (!sprite) {
    console.warn(`🚫 flyToPhoto: Sprite not found for photo ${photoId}`);
    return false;
  }

  console.log(`🎯 flyToPhoto: Flying to photo ${photoId} at position`, {
    x,
    y,
  });

  // Get photo position in world space (already scaled by SCALE_FACTOR in the data)
  const photoWorldX = x * SCALE_FACTOR;
  const photoWorldY = y * SCALE_FACTOR;

  // Container dimensions
  const containerWidth = pixiContainer.value.clientWidth;
  const containerHeight = pixiContainer.value.clientHeight;

  // Calculate target zoom based on photo size to make it occupy ~80% of viewport
  // Get the sprite's actual dimensions
  const spriteWidth = sprite.width;
  const spriteHeight = sprite.height;

  // Calculate the scale needed to fit photo at 80% of viewport
  const targetViewportCoverage = 0.8;
  const scaleForWidth = (containerWidth * targetViewportCoverage) / spriteWidth;
  const scaleForHeight =
    (containerHeight * targetViewportCoverage) / spriteHeight;

  // Use the smaller scale to ensure the photo fits in viewport
  const TARGET_ZOOM = Math.min(scaleForWidth, scaleForHeight);

  console.log(
    `📐 Calculated zoom: ${TARGET_ZOOM.toFixed(2)} (sprite: ${spriteWidth.toFixed(0)}x${spriteHeight.toFixed(0)}, viewport: ${containerWidth}x${containerHeight})`,
  );

  // Calculate target offset to center the photo
  const targetOffsetX = containerWidth / 2 - photoWorldX * TARGET_ZOOM;
  const targetOffsetY = containerHeight / 2 - photoWorldY * TARGET_ZOOM;

  // Start values
  const startOffsetX = offsetX.value;
  const startOffsetY = offsetY.value;
  const startScale = scale.value;

  // Calculate flight duration based on distance
  const dx = targetOffsetX - startOffsetX;
  const dy = targetOffsetY - startOffsetY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const scaleDiff = Math.abs(TARGET_ZOOM - startScale);

  // Duration: minimum 800ms, scale with distance and zoom change
  const duration = Math.max(
    800,
    Math.min(2000, distance * 0.5 + scaleDiff * 200),
  );

  // Store flight state
  flightState.value = {
    startTime: performance.now(),
    duration: duration,
    startOffsetX,
    startOffsetY,
    targetOffsetX,
    targetOffsetY,
    startScale,
    targetScale: TARGET_ZOOM,
  };

  isFlying.value = true;

  console.log(
    `✈️ Flight initiated: duration=${duration.toFixed(0)}ms, distance=${distance.toFixed(1)}px`,
  );

  // Start animation loop if not running
  if (!animationFrameId.value) {
    animationFrameId.value = requestAnimationFrame(flightAnimationLoop);
  }

  return true;
};

/**
 * Fly the camera to a beacon's world position.
 */
const flyToBeacon = (beacon) => {
  if (!pixiContainer.value || !photoContainer.value) return;

  const [wx, wy] = beacon.worldPosition || [0, 0];
  const canvasX = wx * SCALE_FACTOR;
  const canvasY = wy * SCALE_FACTOR;

  const containerWidth = pixiContainer.value.clientWidth;
  const containerHeight = pixiContainer.value.clientHeight;

  // Zoom level that frames the cell area nicely
  const TARGET_ZOOM = Math.max(MIN_SCALE, Math.min(MAX_SCALE, 2));

  const targetOffsetX = containerWidth / 2 - canvasX * TARGET_ZOOM;
  const targetOffsetY = containerHeight / 2 - canvasY * TARGET_ZOOM;

  const startOffsetX = offsetX.value;
  const startOffsetY = offsetY.value;
  const startScale = scale.value;

  const dx = targetOffsetX - startOffsetX;
  const dy = targetOffsetY - startOffsetY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const scaleDiff = Math.abs(TARGET_ZOOM - startScale);
  const duration = Math.max(
    600,
    Math.min(1500, distance * 0.4 + scaleDiff * 150),
  );

  flightState.value = {
    startTime: performance.now(),
    duration,
    startOffsetX,
    startOffsetY,
    targetOffsetX,
    targetOffsetY,
    startScale,
    targetScale: TARGET_ZOOM,
  };

  isFlying.value = true;

  if (!animationFrameId.value) {
    animationFrameId.value = requestAnimationFrame(flightAnimationLoop);
  }
};

/**
 * Animation loop for smooth camera flight
 */
const flightAnimationLoop = () => {
  if (!isFlying.value || !flightState.value) {
    // Stop animation when flight is complete
    if (!isTransitioning.value && !hasPendingCameraAnimation()) {
      animationFrameId.value = null;
      lastAnimationTick = 0;
    } else {
      // Keep running if there are other animations
      animationFrameId.value = requestAnimationFrame(animationLoop);
    }
    return;
  }

  const now = performance.now();
  const elapsed = now - flightState.value.startTime;
  const progress = Math.min(elapsed / flightState.value.duration, 1);

  // Easing function: ease-in-out cubic for smooth start and stop
  const eased =
    progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

  // Interpolate offset and scale
  offsetX.value =
    flightState.value.startOffsetX +
    (flightState.value.targetOffsetX - flightState.value.startOffsetX) * eased;
  offsetY.value =
    flightState.value.startOffsetY +
    (flightState.value.targetOffsetY - flightState.value.startOffsetY) * eased;
  scale.value =
    flightState.value.startScale +
    (flightState.value.targetScale - flightState.value.startScale) * eased;

  // Update container transform
  updateContainerTransform();

  if (progress >= 1) {
    // Flight complete
    isFlying.value = false;
    flightState.value = null;
    syncTargetCamera();
    console.log("✅ Flight complete");

    // Update LOD after flight completes
    scheduleLodUpdate();
    scheduleHiResUpdate();

    // Continue animation loop if there are transitions, otherwise stop
    if (isTransitioning.value || hasPendingCameraAnimation()) {
      animationFrameId.value = requestAnimationFrame(animationLoop);
    } else {
      animationFrameId.value = null;
      lastAnimationTick = 0;
    }
  } else {
    // Continue flight
    animationFrameId.value = requestAnimationFrame(animationLoop);
  }
};

// Update the regular animation loop to handle both transitions and flights
const animationLoop = (currentTime) => {
  const previousTick = lastAnimationTick || currentTime;
  const deltaFrames = Math.max(1, (currentTime - previousTick) / (1000 / 60));
  lastAnimationTick = currentTime;

  // Handle flight animation
  if (isFlying.value) {
    flightAnimationLoop();
    return; // Flight loop will handle continuation
  }

  let shouldContinue = false;

  // Handle sprite transitions
  if (isTransitioning.value) {
    updateTransitionPositions(currentTime);
    shouldContinue = true;
  }

  if (hasPendingCameraAnimation()) {
    updateCameraTowardsTarget(deltaFrames);
    updateContainerTransform();
    shouldContinue = true;
  }

  if (shouldContinue) {
    animationFrameId.value = requestAnimationFrame(animationLoop);
  } else {
    animationFrameId.value = null; // self-stop
    lastAnimationTick = 0;
  }
};

const startAnimationLoop = () => {
  if (!animationFrameId.value) {
    lastAnimationTick = 0;
    animationFrameId.value = requestAnimationFrame(animationLoop);
  }
};

const stopAnimationLoop = () => {
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
  lastAnimationTick = 0;
};

// Selection handlers
const clearSelection = () => {
  const ids = [...selectedPhotoIds.value];
  selectedPhotoIds.value = [];
  ids.forEach((id) => clearSelectionOverlay(id));
};

// Filter change handlers
const onChunkChange = async (newChunk) => {
  selectedChunk.value = newChunk;

  // Check if we have existing photos to reposition
  const hasExistingPhotos =
    photos2D.value.length > 0 && photoSprites.value.size > 0;

  if (hasExistingPhotos) {
    console.log(
      "♻️ Existing photos detected: maintaining sprites, only updating positions",
    );

    // Change chunk (will reuse existing photos and update coordinates).
    // changeChunk() flips isLoadingPositions, which drives the "Building stage"
    // loader title automatically — no manual title assignment needed.
    await changeChunk(newChunk);

    // Reposition sprites with smooth animation
    repositionSprites(photos2D.value);

    // Update beacons cluster type after layout settles
    beaconsClusterType.value = newChunk;
  } else {
    console.log("🧹 First load: loading all photos and textures");

    // First load: full reload passing current viewport limit
    await loadAllPhotos(newChunk, false, photoLimit.value);

    // Frame the view as soon as we have positions (don't wait for textures)
    await nextTick();
    resetView(false);

    await loadPhotosToPixi();

    // Update beacons cluster type
    beaconsClusterType.value = newChunk;
  }
};

const onVisualAspectsChange = (aspects) => {
  selectedVisualAspects.value = aspects;
  updateSpriteVisibility();
};

const onArtisticScoresChange = (scores) => {
  artisticScoreFilters.value = scores;
  updateSpriteVisibility();
};

const onTimeRangeChange = (range) => {
  timeRangeFilter.value = range;
  updateSpriteVisibility();
};

// Tag search handler
const handleTagSearch = async (tags) => {
  const { included = [], excluded = [], mode = "OR" } = tags;

  // Clear tag filter if no tags are selected
  if (included.length === 0 && excluded.length === 0) {
    tagFilterResults.value = null;
    updateSpriteVisibility();
    return;
  }

  try {
    // Call the new direct tag search endpoint with mode parameter
    const { data: response } = await api.post("/api/search/tags/direct", {
      included,
      excluded,
      mode,
    });

    // Store the results
    tagFilterResults.value = response;

    // Update visibility to apply the filter
    updateSpriteVisibility();

    console.log(`✅ Tag search completed: ${response.length} photos matched`);
  } catch (error) {
    console.error("Error searching by tags:", error);
    message.error("Failed to search by tags");
  }
};

// Text semantic search handler
const handleTextSearch = async ({ query, searchMode = "broad", onDone }) => {
  // Clear search if query is empty
  if (!query || !query.trim()) {
    textSearchScoreMap.value = null;
    updateSpriteVisibility();
    onDone?.();
    return;
  }

  try {
    const { data: response } = await api.post("/api/search/semantic/sync", {
      description: query.trim(),
      options: {
        iteration: 1,
        pageSize: TEXT_SEARCH_MAX_RESULTS,
        searchMode,
        collections: [],
        visualAspects: [],
        artisticScores: {},
        withInsights: false,
        lightweight: true,
      },
    });

    if (response?.data?.results) {
      const scoreMap = new Map();
      // Flatten all iterations
      Object.values(response.data.results).forEach((items) => {
        items.forEach((item) => {
          const photo = item.photo;
          const stars = computePhotoStars(photo);
          scoreMap.set(photo.id, {
            labelScore: photo.labelScore,
            totalScore: photo.totalScore,
            stars,
          });
        });
      });
      textSearchScoreMap.value = scoreMap;
    } else {
      textSearchScoreMap.value = new Map();
    }

    updateSpriteVisibility();
  } catch (error) {
    console.error("Error in text search:", error);
    message.error("Failed to perform text search");
    textSearchScoreMap.value = null;
    updateSpriteVisibility();
  } finally {
    onDone?.();
  }
};

// Helper for tooltip stars display
const getHoveredPhotoStars = () => {
  if (!hoveredPhoto.value || !textSearchScoreMap.value) return 0;
  const scoreData = textSearchScoreMap.value.get(hoveredPhoto.value.id);
  return scoreData?.stars ?? 0;
};

// Collection modal handlers
const handleAddToCollection = () => {
  if (selectedPhotoIds.value.length === 0) return;
  showCollectionModal.value = true;
};

const handleCollectionAdded = () => {
  showCollectionModal.value = false;
  message.success("Photos added to collection");
  clearSelection();
};

const handleCollectionModalCancel = () => {
  showCollectionModal.value = false;
};

// Pattern highlight handlers
const handleHighlightPattern = (pattern) => {
  // Don't apply hover highlight if a pattern is already selected
  if (selectedPatternId.value !== null) return;

  if (!pattern) return;
  const clusterPhotoIds = pattern.clusterPhotos || [];
  const patternId = pattern.patternId ?? pattern.title;
  highlightPatternPhotos(clusterPhotoIds, patternId);
};

const handleUnhighlightPattern = (pattern) => {
  // Don't remove highlight on hover out if a pattern is selected
  if (selectedPatternId.value !== null) return;

  if (!pattern) return;
  const clusterPhotoIds = pattern.clusterPhotos || [];
  unhighlightPatternPhotos(clusterPhotoIds);
};

const handleSelectPattern = (pattern) => {
  console.log("[Photos2D] handleSelectPattern called with:", pattern);

  if (!pattern) {
    // Clear pattern selection
    if (selectedPatternId.value !== null) {
      const prevPattern = patternsForCurrentChunk.value.find(
        (p) => (p.patternId ?? p.title) === selectedPatternId.value,
      );
      if (prevPattern) {
        unhighlightPatternPhotos(prevPattern.clusterPhotos || []);
      }
    }
    selectedPatternId.value = null;
    return;
  }

  const patternId = pattern.patternId ?? pattern.title;
  const clusterPhotoIds = pattern.clusterPhotos || [];

  console.log("[Photos2D] Pattern ID:", patternId);
  console.log("[Photos2D] Cluster photo IDs:", clusterPhotoIds);
  console.log("[Photos2D] Current selectedPatternId:", selectedPatternId.value);

  // If clicking the same pattern, deselect it
  if (selectedPatternId.value === patternId) {
    console.log("[Photos2D] Deselecting pattern");
    selectedPatternId.value = null;
    unhighlightPatternPhotos(clusterPhotoIds);
  } else {
    // Select new pattern
    // First unhighlight previous if any
    if (selectedPatternId.value !== null) {
      const prevPattern = patternsForCurrentChunk.value.find(
        (p) => (p.patternId ?? p.title) === selectedPatternId.value,
      );
      if (prevPattern) {
        unhighlightPatternPhotos(prevPattern.clusterPhotos || []);
      }
    }

    selectedPatternId.value = patternId;
    console.log("[Photos2D] Calling highlightPatternPhotos");
    highlightPatternPhotos(clusterPhotoIds, patternId);
  }
};

// Download handler
const handleDownloadPhotos = async () => {
  try {
    console.log(
      "📥 Download action triggered for",
      selectedPhotos.value.length,
      "photos",
    );

    if (selectedPhotos.value.length === 1) {
      // Download single photo directly (not as ZIP)
      await downloadPhoto(selectedPhotos.value[0]);
    } else {
      // Download multiple photos as ZIP
      await downloadPhotosZip(selectedPhotos.value);
    }
  } catch (error) {
    console.error("Download photos failed:", error);
  }
};

// Tool handlers
const handleMoveToTool = () => {
  if (selectedPhotoIds.value.length > 0) {
    console.log(
      "🪄 Move to tool action triggered for",
      selectedPhotos.value.length,
      "photos",
    );
    openToolSelector();
  }
};

const handleSendToChat = async () => {
  await takeToChat(selectedPhotoIds.value, () => {});
};

const handleToolSelected = async (toolId, canvasId = null) => {
  // No pasar clearSelection para mantener la selección
  await takeToTool(toolId, selectedPhotoIds.value, () => {}, canvasId);
  closeToolSelector();
};

// Viewport limit change: full reload with new photo count
const onViewportLimitChange = async () => {
  // Full reload — fetching a different set of photos from backend
  await loadAllPhotos(selectedChunk.value, false, photoLimit.value);
  await nextTick();
  resetView(false);
  await loadPhotosToPixi();
};

// Retry load
const retryLoad = async () => {
  await loadAllPhotos(selectedChunk.value, false, photoLimit.value);

  // Frame immediately after positions are known
  await nextTick();
  resetView(false);

  await loadPhotosToPixi();
};

// Format date helper
const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Resize handler
let resizeObserver = null;
let resizeRafId = null;
const handleResize = () => {
  if (resizeRafId) cancelAnimationFrame(resizeRafId);
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = null;
    if (!pixiApp.value || !pixiContainer.value) return;
    const width = pixiContainer.value.clientWidth;
    const height = pixiContainer.value.clientHeight;
    if (!width || !height) return;
    pixiApp.value.renderer.resize(width, height);

    // Match the manual "Fit to view" behavior after layout changes
    // (e.g. opening/closing dashboard sidebar).
    if (
      photos2D.value.length > 0 &&
      !isLoadingPositions.value &&
      !isTransitioning.value &&
      props.isPreview
    ) {
      resetView(false);
    }
  });
};

const observePixiContainerResize = () => {
  if (resizeObserver || typeof ResizeObserver === "undefined") return;
  if (!pixiContainer.value) return;
  resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(pixiContainer.value);
};

const disconnectPixiContainerResize = () => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
};

// Animation frame loop
const animationFrameId = ref(null);

// Cleanup
const cleanup = () => {
  // Release LOD + HiRes state (timers, textures, spatial index)
  cleanupLod();

  // clearPatternTag();
  // patternTagsContainer.value = null;

  // Destroy all sprites explicitly before destroying the app
  for (const sprite of photoSprites.value.values()) {
    try {
      sprite.destroy({ children: false, texture: false });
    } catch (_) {}
  }
  photoSprites.value.clear();

  // Destroy placeholder texture (we manage it, not Pixi)
  if (placeholderTexture.value && !placeholderTexture.value.destroyed) {
    try {
      placeholderTexture.value.destroy(true);
    } catch (_) {}
    placeholderTexture.value = null;
  }

  // Remove canvas event listeners BEFORE destroying Pixi
  cleanupInteraction();

  if (pixiApp.value) {
    pixiApp.value.destroy(true, { children: true, texture: true });
    pixiApp.value = null;
  }
  photoContainer.value = null;
  textureManager.reset({ destroyTextures: true });
};

// Lifecycle
onMounted(async () => {
  // Register event listener BEFORE any async work (initPixi, loadAllPhotos, etc.)
  // so that events dispatched shortly after router.push are never lost.
  const handleFlyToPhotoEvent = (event) => {
    const { photoId } = event.detail;
    console.log("📍 Received 2d:flyToPhoto event", photoId);
    console.log("📊 Current photos2D.value.length:", photos2D.value.length);
    console.log(
      "⏳ Loading states - positions:",
      isLoadingPositions.value,
      "textures:",
      isLoadingTextures.value,
    );

    // Cancel any active flight
    isFlying.value = false;
    flightState.value = null;

    // Check if still loading
    if (
      isLoadingPositions.value ||
      isLoadingTextures.value ||
      photos2D.value.length === 0
    ) {
      console.log("⏳ Still loading, will retry when ready");
      pendingPhotoFlightId.value = photoId;
      return;
    }

    // Try to fly immediately if everything is loaded
    setTimeout(() => {
      console.log(
        "🔍 Attempting flight, photos2D.value.length:",
        photos2D.value.length,
      );
      const success = flyToPhoto(photoId);
      if (!success) {
        console.warn("⚠️ Failed to fly to photo, will retry when photos load");
        pendingPhotoFlightId.value = photoId;
      }
    }, 300);
  };

  window.addEventListener("2d:flyToPhoto", handleFlyToPhotoEvent);

  // Store reference to clean up later
  window._2dAtlasEventCleanup = () => {
    window.removeEventListener("2d:flyToPhoto", handleFlyToPhotoEvent);
  };

  await nextTick();
  await initPixi();

  // Start fetching catalog photos in background so originalUrl becomes available.
  // If it fails, we still render thumbnails.
  const storePromise = photosStore.getOrFetch(false).catch(() => null);

  window.addEventListener("resize", handleResize);
  observePixiContainerResize();

  // Start animation loop
  startAnimationLoop();

  // Load photos
  await loadAllPhotos(selectedChunk.value, false, photoLimit.value);

  // Frame the view as soon as we have positions (don't wait for textures)
  await nextTick();
  resetView(false);

  await loadPhotosToPixi();

  // Show dismissible info message about the viewport limit (only once per session)
  // if (!limitMessageShown.value && photos2D.value.length > 0) {
  //   limitMessageShown.value = true;
  //   message.info(
  //     `Showing your ${photoLimit.value.toLocaleString()} most recent photos. Expand the viewport in the settings panel.`,
  //     { duration: 9000, closable: true },
  //   );
  // }

  // Once store data is available, try hi-res promotion again.
  storePromise?.then(() => scheduleHiResUpdate());

  // Check if there's a pending photo flight that arrived during loading
  // This handles the case where the event arrived while textures were loading
  if (pendingPhotoFlightId.value && !isLoadingTextures.value) {
    const photoId = pendingPhotoFlightId.value;
    console.log(
      "🎯 Processing pending flight after mount completion:",
      photoId,
    );
    pendingPhotoFlightId.value = null;

    // Small delay to ensure all sprites are fully initialized
    setTimeout(() => {
      console.log("🎬 Executing pending flight:", photoId);
      const success = flyToPhoto(photoId);
      if (!success) {
        console.warn("⚠️ Pending flight failed after mount");
      }
    }, 300);
  }

  // Hide config panel on mobile by default
  if (isMobile.value) {
    showConfigPanel.value = false;
  }

  // Start tag beacons update loop
  tagBeaconsSystem.startUpdateLoop();
});

onUnmounted(() => {
  // Clean up event listeners
  if (window._2dAtlasEventCleanup) {
    window._2dAtlasEventCleanup();
    delete window._2dAtlasEventCleanup;
  }

  window.removeEventListener("resize", handleResize);
  disconnectPixiContainerResize();
  stopAnimationLoop();
  if (filterSnapReflowTimer) {
    clearTimeout(filterSnapReflowTimer);
    filterSnapReflowTimer = null;
  }
  tagBeaconsSystem.reset();
  cleanupPatternTags();
  cleanup();
  dismissCachingBanner();
});

let filterSnapReflowTimer = null;
const scheduleSnapReflowAfterFilterChange = () => {
  if (!gridSnapToGrid.value) return;
  if (!photos2D.value.length) return;

  if (filterSnapReflowTimer) clearTimeout(filterSnapReflowTimer);
  filterSnapReflowTimer = setTimeout(() => {
    reapplyLayoutForCurrentView();
    if (photoSprites.value.size > 0) {
      repositionSprites(photos2D.value);
    }
    ensurePatternTag();
    scheduleHeatmapUpdate();
  }, 60);
};

// Watch for filter changes to update visibility
watch(
  [selectedVisualAspects, artisticScoreFilters, timeRangeFilter],
  () => {
    updateSpriteVisibility();
    scheduleSnapReflowAfterFilterChange();
    // Heatmap will be updated by scheduleSnapReflowAfterFilterChange or by sprite visibility change
  },
  { deep: true },
);

// Watch hoveredPhoto to set full alpha on hover when text search is active
let previousHoveredId = null;
watch(hoveredPhoto, (newPhoto, oldPhoto) => {
  if (!textSearchScoreMap.value) return;

  // Restore alpha on previously hovered sprite
  if (previousHoveredId !== null) {
    const oldSprite = photoSprites.value.get(previousHoveredId);
    if (oldSprite) {
      const scoreData = textSearchScoreMap.value.get(previousHoveredId);
      oldSprite.alpha = scoreData
        ? (TEXT_SEARCH_OPACITY[scoreData.stars] ?? TEXT_SEARCH_OPACITY[0])
        : TEXT_SEARCH_OPACITY.none;
    }
  }

  // Set full alpha on currently hovered sprite
  if (newPhoto) {
    const sprite = photoSprites.value.get(newPhoto.id);
    if (sprite) {
      sprite.alpha = 1;
    }
    previousHoveredId = newPhoto.id;
    nextTick(() => {
      repositionHoveredTooltip();
    });
  } else {
    previousHoveredId = null;
    clearTooltipAnchor();
  }
});

// Toggle overlap-free layout without reloading from backend
watch(gridRelaxationEnabled, () => {
  if (!photos2D.value.length) return;
  reapplyLayoutForCurrentView();
  if (photoSprites.value.size > 0) {
    repositionSprites(photos2D.value);
  }
  ensurePatternTag();
  scheduleHeatmapUpdate();
});

watch(gridRelaxationExpandStrength, () => {
  if (!photos2D.value.length) return;
  reapplyLayoutForCurrentView();
  if (photoSprites.value.size > 0) {
    repositionSprites(photos2D.value);
  }
  ensurePatternTag();
  scheduleHeatmapUpdate();
});

watch(gridSnapToGrid, () => {
  if (!photos2D.value.length) return;
  reapplyLayoutForCurrentView();
  if (photoSprites.value.size > 0) {
    repositionSprites(photos2D.value);
  }
  ensurePatternTag();
  scheduleHeatmapUpdate();
});

watch(
  () => photos2D.value,
  () => {
    // Save to dashboard cache if not in playground mode

    if (isTransitioning.value) return;
    ensurePatternTag();

    // Fallback: if there's a pending flight and we're not loading anymore, try it
    // This handles edge cases where the watcher misses the state transition
    if (
      pendingPhotoFlightId.value &&
      !isLoadingPositions.value &&
      !isLoadingTextures.value &&
      photos2D.value.length > 0 &&
      photoSprites.value.size > 0
    ) {
      const photoId = pendingPhotoFlightId.value;
      console.log(
        "🔄 Fallback: Detected pending flight with loaded photos:",
        photoId,
      );
      pendingPhotoFlightId.value = null;

      setTimeout(() => {
        console.log("🎬 Executing fallback flight:", photoId);
        const success = flyToPhoto(photoId);
        if (!success) {
          console.warn("⚠️ Fallback flight failed");
        }
      }, 200);
    }
  },
);

// Watch for textures loading completion to trigger pending photo flight
// This is the most reliable indicator that everything is ready
watch(isLoadingTextures, (newValue, oldValue) => {
  console.log(
    `📊 isLoadingTextures changed: ${oldValue} -> ${newValue}, pendingFlightId:`,
    pendingPhotoFlightId.value,
  );

  // Only act when loading transitions from true to false (loading complete)
  if (oldValue === true && newValue === false && pendingPhotoFlightId.value) {
    console.log(
      "✅ Textures finished loading, attempting pending photo flight",
    );
    console.log("📊 photos2D.value.length:", photos2D.value.length);
    console.log("📊 photoSprites.value.size:", photoSprites.value.size);

    const photoId = pendingPhotoFlightId.value;
    pendingPhotoFlightId.value = null;

    // Give a small delay for final sprite setup
    setTimeout(() => {
      console.log("🎬 Executing flight to photo after texture load:", photoId);
      const success = flyToPhoto(photoId);
      if (!success) {
        console.warn("⚠️ Flight failed after textures loaded");
      }
    }, 200);
  }
});

watch(isTransitioning, (v) => {
  if (v) {
    // Restart the on-demand animation loop when a transition begins.
    startAnimationLoop();
  } else {
    ensurePatternTag();
  }
});
</script>

<style scoped>
.photos-2d-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: black;
  overflow: hidden;
}

.pixi-container {
  width: 100%;
  height: 100%;
}

.pixi-container canvas {
  display: block;
  cursor: pointer; /* applied at canvas level instead of per-sprite to avoid per-sprite eventMode overhead */
}

.pixi-container.rect-selecting canvas {
  cursor: crosshair;
}

/* Error screen */
.error-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: white;
}

.error-content {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.error-content h2 {
  color: #ef4444;
  margin: 0 0 15px 0;
  font-size: 1.5em;
}

.error-content p {
  color: #e5e5e5;
  margin: 0 0 25px 0;
  line-height: 1.5;
}

.retry-btn {
  background: #4ade80;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 1em;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
}

.retry-btn:hover {
  background: #22c55e;
  transform: translateY(-1px);
}

/* Photo tooltip */
.photo-tooltip {
  position: absolute;
  /* background: rgba(30, 30, 30, 0.95); */
  border-radius: 8px;
  padding: 8px;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  max-width: 300px;
  animation: tooltipFadeIn 0.2s ease-out;
}

.tooltip-score-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 1px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  border-radius: 4px;
  padding: 3px 5px;
  z-index: 2;
}

.tooltip-star {
  color: #555;
}

.tooltip-star.filled {
  color: #fbbf24;
}

.tooltip-star.empty {
  color: #555;
}

.tooltip-star-question {
  color: #888;
}

@keyframes tooltipFadeIn {
  from {
    opacity: 0;
    transform: translate(-10px, -10px);
  }
  to {
    opacity: 1;
    transform: translate(0, 0);
  }
}

.tooltip-image {
  width: 100%;
  max-height: 188px;
  object-fit: cover;
  border-radius: 4px;
}

.tooltip-info {
  margin-top: 6px;
  font-size: 11px;
  color: #aaa;
}

.tooltip-date {
  display: block;
}

/* Rect-select overlay */
.rect-select-overlay {
  position: absolute;
  pointer-events: none;
  border: 2px solid var(--accent-color, #6366f1);
  background: color-mix(in srgb, var(--accent-color, #6366f1) 15%, transparent);
  border-radius: 2px;
  z-index: 900;
}

/* Discrete loader */
.discrete-loader {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-container, rgba(26, 26, 31, 0.95));
  backdrop-filter: blur(12px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
  box-shadow: var(--shadow-md);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  animation: loaderSlideUp 0.3s ease-out;
  max-width: 90vw;
}

@keyframes loaderSlideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.loader-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color, rgba(255, 255, 255, 0.2));
  border-top: 2px solid var(--primary-color, #3b82f6);
  border-radius: 50%;
  animation: discreteSpinner 1s linear infinite;
  flex-shrink: 0;
}

@keyframes discreteSpinner {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loader-text {
  color: var(--text-primary, #ffffff);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
  white-space: nowrap;
}

.loader-percentage {
  color: var(--primary-color, #3b82f6);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-semibold, 600);
  white-space: nowrap;
}

/* Zoom controls */
.zoom-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: var(--bg-container);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
  backdrop-filter: blur(10px);
  flex-direction: column;
  border: 1px solid var(--border-color);
}

.zoom-btn {
  /* background: var(--bg-surface); */
  background-color: var(--bg-surface);
  border: none;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.zoom-btn:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}

.zoom-level {
  color: #aaa;
  font-size: 12px;
  min-width: 40px;
  text-align: center;
}

/* Photo count indicator */
.photo-count-indicator {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(30, 30, 30, 0.9);
  border-radius: 8px;
  padding: 8px 12px;
  color: #aaa;
  font-size: 12px;
  z-index: 100;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Mobile adjustments for config panel floating buttons */
@media (max-width: 768px) {
  .pixi-container {
    padding-top: 60px; /* Space for mobile config buttons bar */
  }
}

/* ============================================ */
/* Tag Beacons Display                          */
/* ============================================ */

.tag-beacons-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1400;
}

.tag-beacon {
  position: absolute;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  color: white;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  backdrop-filter: blur(8px);
  user-select: none;
  will-change: transform, opacity;
  pointer-events: auto;
  cursor: pointer;
}

.tag-beacon::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--beacon-color);
  border-radius: 12px;
  opacity: 0.55;
  z-index: -1;
}

.tag-beacon-label {
  font-weight: 600;
}

.tag-beacon-count {
  font-size: 10px;
  opacity: 0.85;
}

@media (max-width: 767px) {
  .tag-beacon {
    font-size: 9px;
    padding: 3px 8px;
  }
}
</style>
