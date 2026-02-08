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
    <div v-else ref="pixiContainer" class="pixi-container"></div>

    <!-- Config Panel Component (Desktop) -->
    <Photos2DConfigPanel
      v-if="!isMobile"
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
      @chunk-change="onChunkChange"
      @visual-aspects-change="onVisualAspectsChange"
      @artistic-scores-change="onArtisticScoresChange"
      @time-range-change="onTimeRangeChange"
      @reset-view="resetView"
      @highlight-pattern="handleHighlightPattern"
      @unhighlight-pattern="handleUnhighlightPattern"
      @select-pattern="handleSelectPattern"
    />

    <!-- Config Panel Component (Mobile) -->
    <Photos2DConfigPanelMobile
      v-else
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
    />

    <!-- Hovered Photo Info -->
    <div
      v-if="hoveredPhoto && !showDiscreteLoader"
      class="photo-tooltip"
      :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"
    >
      <img
        v-if="hoveredPhoto.thumbnailUrl"
        :src="hoveredPhoto.thumbnailUrl"
        class="tooltip-image"
      />
      <div class="tooltip-info">
        <span v-if="hoveredPhoto.dateTaken" class="tooltip-date">
          {{ formatDate(hoveredPhoto.dateTaken) }}
        </span>
      </div>
    </div>

    <!-- Selected Photos Container -->
    <div
      v-if="selectedPhotos.length > 0 && !isPlayground"
      class="selected-photos-container"
      @click.stop
      @mousedown.stop
      @mouseup.stop
      @touchstart.stop
      @touchend.stop
      @touchmove.stop
    >
      <div class="selected-photos-header">
        <div class="header-left-group">
          <span class="selected-count"
            >{{ selectedPhotos.length }} selected</span
          >
          <FixedActionBar
            :selectedCount="selectedPhotos.length"
            :showDelete="false"
            :showAddToCollection="!isPlayground"
            :showMoveToTool="!isPlayground"
            :isDownloading="isDownloading"
            @download="handleDownloadPhotos"
            @add-to-collection="handleAddToCollection"
            @move-to-tool="handleMoveToTool"
          />
        </div>
        <button
          @click="clearSelection"
          class="clear-selection-btn"
          title="Clear selection"
          size="tiny"
        >
          <n-icon size="11">
            <CloseOutlined />
          </n-icon>
        </button>
      </div>
      <div class="selected-photos-list">
        <div
          v-for="photo in selectedPhotos"
          :key="photo.id"
          class="selected-photo-item"
        >
          <img
            :src="photo.thumbnailUrl || photo.originalUrl"
            :alt="photo.id"
            class="selected-photo-thumb"
          />
          <button
            @click="removeSelectedPhoto(photo.id)"
            class="remove-photo-btn"
            title="Remove from selection"
          >
            <n-icon size="12">
              <CloseOutlined />
            </n-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- Discrete Loading Indicator -->
    <div v-if="showDiscreteLoader" class="discrete-loader">
      <div class="loader-spinner"></div>
      <span class="loader-text">{{ loaderTitle }}</span>
      <span v-if="loadingProgress > 0" class="loader-percentage"
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
      :tools="availableTools"
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
import {
  CloseOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
} from "@vicons/antd";
import { useRouter } from "vue-router";
import * as PIXI from "pixi.js";

import FixedActionBar from "@/components/3d-atlas/FixedActionBar.vue";
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
import { useIsMobile } from "@/composables/useIsMobile.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { use2DTextureManager } from "@/composables/2d-viewer/use2DTextureManager.js";
import { useTheme } from "@/composables/useTheme.js";

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
});

// Initialize composables
const message = useMessage();
const router = useRouter();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  availableTools,
  takeToTool,
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

// Detect mobile device
const { isMobile } = useIsMobile();
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

// Spatial index for hi-res candidate picking (avoid scanning all visible photos)
const hiResSpatialIndex = shallowRef(new Map());
const HIRES_SPATIAL_CELL_SIZE = 220; // world units (sprite.x/y space)
const HIRES_MAX_CELL_RING = 6; // expands search area around viewport center

const buildHiResSpatialIndex = () => {
  const index = new Map();
  const cellSize = HIRES_SPATIAL_CELL_SIZE;

  photoSprites.value.forEach((sprite, photoId) => {
    if (!sprite) return;
    const cx = Math.floor(sprite.x / cellSize);
    const cy = Math.floor(sprite.y / cellSize);
    const key = `${cx},${cy}`;
    let list = index.get(key);
    if (!list) {
      list = [];
      index.set(key, list);
    }
    list.push(photoId);
  });

  hiResSpatialIndex.value = index;
};

// Canvas state
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const photoSize = ref(80);

// Interaction state
const isDragging = ref(false);
const dragStartPosition = ref({ x: 0, y: 0 });
const lastPointerPosition = ref({ x: 0, y: 0 });
const isPinching = ref(false);
const lastPinchDistance = ref(0);
const touchStartTime = ref(0);
const hadRecentPinch = ref(false);

// Pinch anchoring: keep the same world point under the pinch midpoint.
const lastPinchCenter = ref({ x: 0, y: 0 }); // screen (local to pixi container)
const lastPinchWorld = ref({ x: 0, y: 0 }); // world (photoContainer space)

// UI state
const showConfigPanel = ref(!isMobile.value);
const showDiscreteLoader = computed(
  () => isLoadingPositions.value || isLoadingTextures.value,
);
const loaderTitle = ref("Loading photos");
const loadingProgress = ref(0);
const isLoadingTextures = ref(false);

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
const tooltipPosition = ref({ x: 0, y: 0 });

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
const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

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

const applyZoomAboutScreenPoint = (screenX, screenY, newScaleRaw) => {
  const oldScale = Number(scale.value) || 1;
  const newScale = clampScale(newScaleRaw);
  if (newScale === oldScale) return;

  const scaleChange = newScale / oldScale;
  scale.value = newScale;
  offsetX.value = screenX - (screenX - offsetX.value) * scaleChange;
  offsetY.value = screenY - (screenY - offsetY.value) * scaleChange;
};

// Hi-res (originalUrl) swap when zooming close (3D-like behavior)
const HIRES_ENABLED = ref(true);
const HIRES_MIN_SCALE = 4.0;
const HIRES_MIN_SCREEN_SIZE_PX = 360; // sprite size on screen required to trigger upgrade
const activeHiResPhotoId = ref(null);
let hiResUpdateScheduled = false;
let hiResRequestToken = 0;

// Debounce hi-res updates while the user is zooming/panning.
// Creating an original texture is expensive (network + decode + canvas downscale + GPU upload).
const HIRES_IDLE_DELAY_MS = 160;
const HIRES_MIN_UPDATE_INTERVAL_MS = 250;
let hiResIdleTimer = null;

// Canvas interaction cleanup (listeners must be removed manually)
let canvasRef = null;
const canvasListeners = [];
let lastHiResUpdateAt = 0;

// ─── LOD system ─────────────────────────────────────────────────────────
// Simple & robust: every visible sprite in the viewport gets upgraded.
// No queues, no per-frame limits, no center-distance ranking.
// When LOD_ENABLED is false, ALL sprites use "high" quality unconditionally.
const LOD_ENABLED = ref(true); // ← AHORA ACTIVADO

// Screen-size thresholds (sprite size in pixels on screen) to decide quality.
// Calibrados para que el LOD sea perceptible:
// - scale 0.5 → 40px  → low  (vista general)
// - scale 1.5 → 120px → mid  (navegación normal)
// - scale 3.0 → 240px → high (acercamiento)
const LOD_MID_MIN_SCREEN_PX = 100; // Era 80, ahora requiere más zoom
const LOD_HIGH_MIN_SCREEN_PX = 160; // Era 150, ahora requiere bastante más zoom

// Debounce: wait for interaction to fully settle before doing LOD work.
// Longer debounce = smoother interaction, LOD only runs when user stops.
const LOD_DEBOUNCE_MS = 400;
let lodTimer = null;
let lodToken = 0; // monotonic token to discard stale async work
let lodRunning = false; // prevent overlapping LOD updates

// How many textures to create per batch during LOD update.
// Small batches yield to the event loop between them, keeping zoom/pan smooth.
const LOD_BATCH_SIZE = 8;

// Track current LOD level per photo so we know what to upgrade/downgrade.
const lodCurrentLevel = new Map(); // photoId -> 'low' | 'mid' | 'high'

const getViewportWorldBounds = () => {
  const w = pixiContainer.value?.clientWidth || 0;
  const h = pixiContainer.value?.clientHeight || 0;
  const s = Number(scale.value) || 1;
  const minX = (0 - offsetX.value) / s;
  const maxX = (w - offsetX.value) / s;
  const minY = (0 - offsetY.value) / s;
  const maxY = (h - offsetY.value) / s;
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
  };
};

const getApproxScreenSizePx = () => {
  const s = Number(scale.value) || 1;
  return Math.max(0, (Number(photoSize.value) || 0) * s);
};

/**
 * Determine the desired LOD quality for the current zoom level.
 * When LOD is disabled, always returns "high" so every sprite is max quality.
 */
const getDesiredLodQuality = () => {
  if (!LOD_ENABLED.value) return "high";
  const screenSize = getApproxScreenSizePx();
  if (screenSize >= LOD_HIGH_MIN_SCREEN_PX) return "high";
  if (screenSize >= LOD_MID_MIN_SCREEN_PX) return "mid";
  return "low";
};

/**
 * Get all visible photo IDs that are inside (or near) the viewport.
 * Uses generous padding to preload textures before they enter the visible area,
 * preventing the "quality pop" effect during panning.
 */
const getViewportPhotoIds = () => {
  if (!pixiContainer.value || !photoSprites.value?.size) return [];

  const bounds = getViewportWorldBounds();

  // Generous padding: 3× viewport width/height in world-space
  // This preloads textures ~2-3 screens ahead in each direction, ensuring smooth panning
  const w = pixiContainer.value?.clientWidth || 0;
  const h = pixiContainer.value?.clientHeight || 0;
  const s = Number(scale.value) || 1;
  const viewportWorldWidth = w / s;
  const viewportWorldHeight = h / s;

  // Scale padding by zoom level: more padding when zoomed out (covers more photos),
  // less padding when zoomed in (fewer photos, but each is more expensive to load)
  const paddingFactor = Math.max(0.3, Math.min(1.0, 2.0 / s)); // 30-100% of viewport size
  const marginX = viewportWorldWidth * paddingFactor;
  const marginY = viewportWorldHeight * paddingFactor;

  const minX = bounds.minX - marginX;
  const maxX = bounds.maxX + marginX;
  const minY = bounds.minY - marginY;
  const maxY = bounds.maxY + marginY;

  const ids = [];
  photoSprites.value.forEach((sprite, photoId) => {
    if (!sprite || !sprite.visible) return;
    const x = sprite.x;
    const y = sprite.y;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      ids.push(photoId);
    }
  });
  return ids;
};

/**
 * Apply a LOD texture to a single sprite. Returns true on success.
 */
const applyLodToSprite = async (photoId, quality) => {
  if (!photoId) return false;
  // Don't touch the active hi-res (original URL) sprite
  if (activeHiResPhotoId.value === photoId) return false;

  const sprite = photoSprites.value.get(photoId);
  if (!sprite) return false;

  const photo = photoById.value.get(photoId);
  if (!photo) return false;

  const currentLevel = lodCurrentLevel.get(photoId) || "low";
  if (currentLevel === quality) return false; // already at desired level

  const texture = await textureManager.getOrCreateTexture(photo, {
    quality,
    allowDownload: false, // LOD path: NEVER download, only use cached thumbnails
  });
  if (!texture) return false;

  sprite.texture = texture;
  sprite.__lodLevel = quality;
  applySpriteAspectFromTexture(sprite, texture);
  lodCurrentLevel.set(photoId, quality);

  // Release textures for levels above what we're setting
  if (quality === "low") {
    textureManager.releaseTexture(photoId, "mid");
    textureManager.releaseTexture(photoId, "high");
  } else if (quality === "mid") {
    textureManager.releaseTexture(photoId, "high");
  }

  return true;
};

/**
 * Helper: yield to the event loop so the browser can process input events.
 */
const yieldToEventLoop = () => new Promise((r) => setTimeout(r, 0));

/**
 * Core LOD update: upgrade viewport sprites, downgrade off-screen ones.
 * Processes in small batches to avoid blocking zoom/pan.
 * Never triggers network downloads — only uses already-cached thumbnails.
 */
const runLodUpdate = async () => {
  const token = ++lodToken;
  if (isTransitioning.value) return;
  if (isLoadingTextures.value) return; // don't compete with initial load
  if (lodRunning) return; // prevent overlapping runs

  lodRunning = true;
  try {
    const desiredQuality = getDesiredLodQuality();
    const viewportIds = new Set(getViewportPhotoIds());

    // 1) Upgrade viewport sprites to the desired quality (in small batches)
    const toUpgrade = [];
    for (const photoId of viewportIds) {
      if (activeHiResPhotoId.value === photoId) continue;
      const current = lodCurrentLevel.get(photoId) || "low";
      if (current !== desiredQuality) {
        toUpgrade.push(photoId);
      }
    }

    for (let i = 0; i < toUpgrade.length; i += LOD_BATCH_SIZE) {
      if (token !== lodToken) return; // cancelled by new interaction
      const batch = toUpgrade.slice(i, i + LOD_BATCH_SIZE);
      await Promise.all(
        batch.map((id) => applyLodToSprite(id, desiredQuality)),
      );
      if (i + LOD_BATCH_SIZE < toUpgrade.length) {
        await yieldToEventLoop(); // let browser process input
      }
    }

    if (token !== lodToken) return;

    // 2) Downgrade off-screen sprites back to "low" to free GPU memory
    const toDowngrade = [];
    for (const [photoId, level] of lodCurrentLevel) {
      if (level === "low") continue;
      if (viewportIds.has(photoId)) continue;
      if (activeHiResPhotoId.value === photoId) continue;
      toDowngrade.push(photoId);
    }

    for (let i = 0; i < toDowngrade.length; i += LOD_BATCH_SIZE) {
      if (token !== lodToken) return;
      const batch = toDowngrade.slice(i, i + LOD_BATCH_SIZE);
      await Promise.all(batch.map((id) => applyLodToSprite(id, "low")));
      if (i + LOD_BATCH_SIZE < toDowngrade.length) {
        await yieldToEventLoop();
      }
    }
  } finally {
    lodRunning = false;
  }
};

/**
 * Cancel any pending or in-progress LOD update.
 * Call this when a new interaction starts to abort stale work immediately.
 */
const cancelLodUpdate = () => {
  lodToken++; // invalidates any running async LOD work
  if (lodTimer) {
    clearTimeout(lodTimer);
    lodTimer = null;
  }
};

/**
 * Schedule a LOD update after interaction settles.
 * Multiple calls within the debounce window only trigger one update.
 */
const scheduleLodUpdate = () => {
  if (lodTimer) {
    clearTimeout(lodTimer);
    lodTimer = null;
  }
  lodTimer = setTimeout(() => {
    lodTimer = null;
    runLodUpdate().catch(() => {});
  }, LOD_DEBOUNCE_MS);
};

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
        ([key, minValue]) => {
          const score = scores[key];
          return score !== undefined && score >= minValue;
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

  return filtered;
});

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
};

// Cleanup canvas interaction
const cleanupInteraction = () => {
  if (!canvasRef) return;

  // Remove all listeners
  canvasListeners.forEach(([event, handler, options]) => {
    try {
      canvasRef.removeEventListener(event, handler, options);
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

  const oldScale = scale.value;
  const scaleBy = 1.1;
  const direction = e.deltaY > 0 ? -1 : 1;
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

  // Zoom towards mouse position
  applyZoomAboutScreenPoint(mouseX, mouseY, newScale);

  updateContainerTransform();
  // LOD update only after wheel interaction settles (debounced)
  scheduleLodUpdate();
  if (scale.value >= HIRES_MIN_SCALE) scheduleHiResUpdate();
};

const handleMouseDown = (e) => {
  if (e.button !== 0) return;
  isDragging.value = true;
  dragStartPosition.value = { x: e.clientX, y: e.clientY };
  lastPointerPosition.value = { x: e.clientX, y: e.clientY };
  cancelLodUpdate(); // abort any pending LOD work while dragging
};

const handleMouseMove = (e) => {
  // Update hover detection
  updateHoverState(e);

  if (!isDragging.value) return;

  const dx = e.clientX - lastPointerPosition.value.x;
  const dy = e.clientY - lastPointerPosition.value.y;

  offsetX.value += dx;
  offsetY.value += dy;

  lastPointerPosition.value = { x: e.clientX, y: e.clientY };
  updateContainerTransform();
  // Do NOT schedule LOD during drag — wait until mouseUp
};

const handleMouseUp = (e) => {
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

const getPhotoScreenSizePx = (sprite) => {
  if (!sprite) return 0;
  // Container scaling affects on-screen size.
  return Math.max(sprite.width, sprite.height) * (scale.value || 1);
};

const pickHiResCandidatePhotoId = () => {
  if (!pixiContainer.value) return null;
  if (scale.value < HIRES_MIN_SCALE) return null;
  if (!photoSprites.value?.size) return null;
  if (isTransitioning.value) return null;

  const centerX = pixiContainer.value.clientWidth / 2;
  const centerY = pixiContainer.value.clientHeight / 2;

  // Convert viewport center to world coordinates (sprite.x/y space)
  const centerWorldX = (centerX - offsetX.value) / (scale.value || 1);
  const centerWorldY = (centerY - offsetY.value) / (scale.value || 1);

  const index = hiResSpatialIndex.value;
  if (!index || index.size === 0) {
    // Best-effort fallback; index should normally exist after load.
    buildHiResSpatialIndex();
  }

  const cellSize = HIRES_SPATIAL_CELL_SIZE;
  const baseCx = Math.floor(centerWorldX / cellSize);
  const baseCy = Math.floor(centerWorldY / cellSize);

  let bestId = null;
  let bestDist2 = Infinity;

  // Search nearby cells around the viewport center.
  for (let r = 0; r <= HIRES_MAX_CELL_RING; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

        const key = `${baseCx + dx},${baseCy + dy}`;
        const ids = hiResSpatialIndex.value.get(key);
        if (!ids?.length) continue;

        for (const photoId of ids) {
          const sprite = photoSprites.value.get(photoId);
          if (!sprite || !sprite.visible) continue;
          if (!getPhotoOriginalUrl(photoId)) continue;

          const ddx = sprite.x - centerWorldX;
          const ddy = sprite.y - centerWorldY;
          const d2 = ddx * ddx + ddy * ddy;

          if (d2 < bestDist2) {
            bestDist2 = d2;
            bestId = photoId;
          }
        }
      }
    }
  }

  if (!bestId) return null;

  const bestSprite = photoSprites.value.get(bestId);
  const screenSize = getPhotoScreenSizePx(bestSprite);
  if (screenSize < HIRES_MIN_SCREEN_SIZE_PX) return null;

  return bestId;
};

const applySpriteAspectFromTexture = (sprite, texture) => {
  if (!sprite || !texture) return;
  const w = texture.width || texture.baseTexture?.width;
  const h = texture.height || texture.baseTexture?.height;
  if (!w || !h) return;
  const aspectRatio = h / w;
  sprite.width = photoSize.value;
  sprite.height = photoSize.value * aspectRatio;
};

const downgradeActiveHiRes = async () => {
  const currentId = activeHiResPhotoId.value;
  if (!currentId) return;

  console.log(`⬇️ HiRes degradar: ${currentId} → LOW`);

  const photo = photoById.value.get(currentId);
  const sprite = photoSprites.value.get(currentId);

  try {
    if (photo && sprite) {
      const thumbTexture = await textureManager.getOrCreateTexture(photo, {
        quality: "thumb",
      });
      if (thumbTexture) {
        sprite.texture = thumbTexture;
        applySpriteAspectFromTexture(sprite, thumbTexture);
        sprite.__lodLevel = "low";
        lodCurrentLevel.set(currentId, "low");
      }
    }
  } finally {
    // Free hi-res GPU memory
    textureManager.releaseTexture(currentId, "original");
    activeHiResPhotoId.value = null;
  }
};

const updateHiResTarget = async () => {
  if (!HIRES_ENABLED.value) {
    if (activeHiResPhotoId.value) {
      console.log(
        `📵 HiRes deshabilitado, degradando ${activeHiResPhotoId.value}`,
      );
    }
    await downgradeActiveHiRes();
    return;
  }

  const targetId = pickHiResCandidatePhotoId();
  if (!targetId) {
    if (activeHiResPhotoId.value) {
      console.log(
        `📥 HiRes sin candidatos cerca, degradando ${activeHiResPhotoId.value}`,
      );
    }
    await downgradeActiveHiRes();
    return;
  }

  if (activeHiResPhotoId.value === targetId) {
    console.log(`🔄 HiRes ya está en ${targetId}`);
    return;
  }

  // Switch target: downgrade old first
  await downgradeActiveHiRes();

  const token = ++hiResRequestToken;
  const photo = photoById.value.get(targetId);
  const sprite = photoSprites.value.get(targetId);
  if (!photo || !sprite) return;

  const originalUrl = getPhotoOriginalUrl(targetId);
  if (!originalUrl) return;

  const originalTexture = await textureManager.getOrCreateTexture(photo, {
    quality: "original",
    urlOverride: originalUrl,
  });

  // If another request superseded this one, abort.
  if (token !== hiResRequestToken) return;

  if (originalTexture) {
    sprite.texture = originalTexture;
    applySpriteAspectFromTexture(sprite, originalTexture);
    activeHiResPhotoId.value = targetId;
    console.log(`🖼️ HiRes cargado: foto ${targetId} (original URL)`);

    // Ensure we don't keep additional mid/high LOD textures for the same photo.
    lodCurrentLevel.set(targetId, "original");
    try {
      textureManager.releaseTexture(targetId, "high");
      textureManager.releaseTexture(targetId, "mid");
    } catch (_) {}
    sprite.__lodLevel = "original";
  }
};

const scheduleHiResUpdate = () => {
  // Fast path: if we're not zoomed in enough, ensure we drop back to thumb.
  if (scale.value < HIRES_MIN_SCALE) {
    // Don't await inside pointer handlers.
    downgradeActiveHiRes().catch(() => {});
    return;
  }

  if (hiResIdleTimer) {
    clearTimeout(hiResIdleTimer);
    hiResIdleTimer = null;
  }

  hiResIdleTimer = setTimeout(() => {
    // Throttle: avoid doing heavy work too frequently.
    const now = performance.now();
    if (now - lastHiResUpdateAt < HIRES_MIN_UPDATE_INTERVAL_MS) return;
    lastHiResUpdateAt = now;

    if (hiResUpdateScheduled) return;
    hiResUpdateScheduled = true;
    requestAnimationFrame(async () => {
      hiResUpdateScheduled = false;
      try {
        await updateHiResTarget();
      } catch (_) {
        // Non-fatal: keep viewer responsive
      }
    });
  }, HIRES_IDLE_DELAY_MS);
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
    return;
  }

  // Tooltip is disabled when zoomed in; avoid expensive hit-testing.
  if (scale.value >= 1.5) {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hoveredPhoto.value = null;
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
    const halfSize = photoSize.value / 2;

    for (const photo of filteredPhotos.value) {
      const [px, py] = photo.position || [0, 0];
      const canvasX = px * SCALE_FACTOR;
      const canvasY = py * SCALE_FACTOR;

      if (
        worldX >= canvasX - halfSize &&
        worldX <= canvasX + halfSize &&
        worldY >= canvasY - halfSize &&
        worldY <= canvasY + halfSize
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
        tooltipPosition.value = { x: e.clientX + 15, y: e.clientY + 15 };
      } else {
        hoveredPhoto.value = null;
      }
    } else {
      hoveredPhoto.value = null;
    }
  }, HOVER_DEBOUNCE_MS);
};

// Handle click for selection
const handleClick = (e) => {
  if (!pixiContainer.value) return;

  const rect = pixiContainer.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Convert to world coordinates
  const worldX = (mouseX - offsetX.value) / scale.value;
  const worldY = (mouseY - offsetY.value) / scale.value;

  // Find photo under cursor
  const halfSize = photoSize.value / 2;

  for (const photo of filteredPhotos.value) {
    const [px, py] = photo.position || [0, 0];
    const canvasX = px * SCALE_FACTOR;
    const canvasY = py * SCALE_FACTOR;

    if (
      worldX >= canvasX - halfSize &&
      worldX <= canvasX + halfSize &&
      worldY >= canvasY - halfSize &&
      worldY <= canvasY + halfSize
    ) {
      // Toggle selection
      const photoId = photo.id;
      const index = selectedPhotoIds.value.indexOf(photoId);

      if (index === -1) {
        selectedPhotoIds.value.push(photoId);
      } else {
        selectedPhotoIds.value.splice(index, 1);
      }

      // Update sprite selection visual
      updateSpriteSelection(photoId);
      break;
    }
  }
};

// Update sprite selection visual
const updateSpriteSelection = (photoId) => {
  const sprite = photoSprites.value.get(photoId);
  if (sprite) {
    const isSelected = selectedPhotoIds.value.includes(photoId);
    // sprite.tint = isSelected ? 0x88ff88 : 0xffffff;
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

  isLoadingTextures.value = true;
  loadingProgress.value = 0;
  loaderTitle.value = "Loading photos";

  // Clear existing sprites - DESTROY them to free GPU memory (not just remove from container)
  for (const sprite of photoSprites.value.values()) {
    try {
      sprite.destroy({ children: false, texture: false }); // texture managed by textureManager
    } catch (_) {}
  }
  photoContainer.value.removeChildren();
  photoSprites.value.clear();
  lodCurrentLevel.clear();
  hiResSpatialIndex.value = new Map();

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

  // Reduce batch size to avoid rate limiting (12 concurrent max, similar to 3D)
  const batchSize = 24;

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
        // eventMode 'none': we do manual hit-testing in updateHoverState/handleClick,
        // so Pixi's event system doesn't need to traverse 5k+ sprites.
        sprite.eventMode = "none";
        // cursor is set on the canvas element via CSS, not per-sprite.

        // Store reference
        photoSprites.value.set(photo.id, sprite);
        photoContainer.value.addChild(sprite);

        // Load actual texture (cached via IndexedDB + in-memory)
        const texture = await textureManager.getOrCreateTexture(photo, {
          quality: "thumb",
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

    // Small delay between batches to avoid overwhelming Cloudflare
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  isLoadingTextures.value = false;
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
};

// Update sprite visibility based on filters
const updateSpriteVisibility = () => {
  if (!photoSprites.value.size) return;

  const filteredIds = new Set(filteredPhotos.value.map((p) => p.id));

  photoSprites.value.forEach((sprite, photoId) => {
    sprite.visible = filteredIds.has(photoId);
  });

  scheduleLodUpdate();
  scheduleHiResUpdate();
  scheduleHeatmapUpdate();
};

// Zoom controls
const zoomIn = () => {
  const centerX = pixiContainer.value?.clientWidth / 2 || 0;
  const centerY = pixiContainer.value?.clientHeight / 2 || 0;

  const oldScale = scale.value;
  scale.value = Math.min(MAX_SCALE, scale.value * 1.1);

  const scaleChange = scale.value / oldScale;
  offsetX.value = centerX - (centerX - offsetX.value) * scaleChange;
  offsetY.value = centerY - (centerY - offsetY.value) * scaleChange;

  updateContainerTransform();
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

const zoomOut = () => {
  const centerX = pixiContainer.value?.clientWidth / 2 || 0;
  const centerY = pixiContainer.value?.clientHeight / 2 || 0;

  const oldScale = scale.value;
  scale.value = Math.max(MIN_SCALE, scale.value / 1.1);

  const scaleChange = scale.value / oldScale;
  offsetX.value = centerX - (centerX - offsetX.value) * scaleChange;
  offsetY.value = centerY - (centerY - offsetY.value) * scaleChange;

  updateContainerTransform();
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

const resetView = () => {
  if (!pixiContainer.value || photos2D.value.length === 0) return;

  const bounds = getBounds.value;
  const centerX = ((bounds.minX + bounds.maxX) / 2) * SCALE_FACTOR;
  const centerY = ((bounds.minY + bounds.maxY) / 2) * SCALE_FACTOR;

  const boundsWidth = (bounds.maxX - bounds.minX) * SCALE_FACTOR;
  const boundsHeight = (bounds.maxY - bounds.minY) * SCALE_FACTOR;

  const containerWidth = pixiContainer.value.clientWidth;
  const containerHeight = pixiContainer.value.clientHeight;

  const scaleX = containerWidth / (boundsWidth + 100);
  const scaleY = containerHeight / (boundsHeight + 100);
  scale.value = Math.min(scaleX, scaleY, 1);

  offsetX.value = containerWidth / 2 - centerX * scale.value;
  offsetY.value = containerHeight / 2 - centerY * scale.value;

  updateContainerTransform();
  scheduleLodUpdate();
  scheduleHiResUpdate();
};

// Selection handlers
const clearSelection = () => {
  selectedPhotoIds.value.forEach((id) => {
    const sprite = photoSprites.value.get(id);
    if (sprite) sprite.tint = 0xffffff;
  });
  selectedPhotoIds.value = [];
};

const removeSelectedPhoto = (photoId) => {
  const index = selectedPhotoIds.value.indexOf(photoId);
  if (index !== -1) {
    selectedPhotoIds.value.splice(index, 1);
    const sprite = photoSprites.value.get(photoId);
    if (sprite) sprite.tint = 0xffffff;
  }
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

    // Show loader while repositioning
    loaderTitle.value = "Building stage";

    // Change chunk (will reuse existing photos and update coordinates)
    await changeChunk(newChunk);

    // Reposition sprites with smooth animation
    repositionSprites(photos2D.value);
  } else {
    console.log("🧹 First load: loading all photos and textures");

    // First load: full reload
    await changeChunk(newChunk);

    // Frame the view as soon as we have positions (don't wait for textures)
    await nextTick();
    resetView();

    await loadPhotosToPixi();
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
    message.error("Error downloading photos");
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

const handleToolSelected = async (toolId) => {
  // No pasar clearSelection para mantener la selección
  await takeToTool(toolId, selectedPhotoIds.value, () => {});
  closeToolSelector();
};

// Retry load
const retryLoad = async () => {
  await loadAllPhotos(selectedChunk.value);

  // Frame immediately after positions are known
  await nextTick();
  resetView();

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
const handleResize = () => {
  if (pixiApp.value && pixiContainer.value) {
    pixiApp.value.renderer.resize(
      pixiContainer.value.clientWidth,
      pixiContainer.value.clientHeight,
    );
  }
};

// Animation frame loop
const animationFrameId = ref(null);

// Only run the rAF loop while there's an active transition (saves CPU/GPU when idle).
const animationLoop = () => {
  if (isTransitioning.value) {
    updateTransitionPositions(performance.now());
    animationFrameId.value = requestAnimationFrame(animationLoop);
  } else {
    animationFrameId.value = null; // self-stop
  }
};

const startAnimationLoop = () => {
  if (!animationFrameId.value) {
    animationFrameId.value = requestAnimationFrame(animationLoop);
  }
};

const stopAnimationLoop = () => {
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value);
    animationFrameId.value = null;
  }
};

// Cleanup
const cleanup = () => {
  // Cancel pending timers
  if (hiResIdleTimer) {
    clearTimeout(hiResIdleTimer);
    hiResIdleTimer = null;
  }

  if (lodTimer) {
    clearTimeout(lodTimer);
    lodTimer = null;
  }

  lodCurrentLevel.clear();

  // Ensure we free any hi-res texture currently in use.
  try {
    textureManager.releaseTexture(activeHiResPhotoId.value, "original");
  } catch (_) {}
  activeHiResPhotoId.value = null;

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
  hiResSpatialIndex.value = new Map();
  textureManager.reset({ destroyTextures: true });
};

// Lifecycle
onMounted(async () => {
  await nextTick();
  await initPixi();

  // Start fetching catalog photos in background so originalUrl becomes available.
  // If it fails, we still render thumbnails.
  const storePromise = photosStore.getOrFetch(false).catch(() => null);

  window.addEventListener("resize", handleResize);

  // Start animation loop
  startAnimationLoop();

  // Load photos
  await loadAllPhotos(selectedChunk.value);

  // Frame the view as soon as we have positions (don't wait for textures)
  await nextTick();
  resetView();

  await loadPhotosToPixi();

  // Once store data is available, try hi-res promotion again.
  storePromise?.then(() => scheduleHiResUpdate());

  // Hide config panel on mobile by default
  if (isMobile.value) {
    showConfigPanel.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  stopAnimationLoop();
  if (filterSnapReflowTimer) {
    clearTimeout(filterSnapReflowTimer);
    filterSnapReflowTimer = null;
  }
  cleanupPatternTags();
  cleanup();
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

// When LOD_ENABLED changes, immediately re-evaluate all sprites.
watch(LOD_ENABLED, () => {
  scheduleLodUpdate();
});

watch(
  () => photos2D.value,
  () => {
    if (isTransitioning.value) return;
    ensurePatternTag();
  },
);

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
  position: fixed;
  /* background: rgba(30, 30, 30, 0.95); */
  border-radius: 8px;
  padding: 8px;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  max-width: 200px;
  animation: tooltipFadeIn 0.2s ease-out;
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
  max-height: 150px;
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

/* Selected photos container */
.selected-photos-container {
  position: absolute;
  left: 10px;
  top: 10px;
  background: var(--bg-container);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  padding: 10px;
  width: 287px;
  z-index: 1500;
  pointer-events: auto;
  animation: slideInFromLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideInFromLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.selected-photos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-left-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 1;
  min-width: 0;
}

.selected-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.clear-selection-btn {
  background: rgba(255, 82, 82, 0.2);
  border: 1px solid rgba(255, 82, 82, 0.3);
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  color: #ff5252;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.clear-selection-btn:hover {
  background: rgba(255, 82, 82, 0.3);
  border-color: rgba(255, 82, 82, 0.5);
}

.selected-photos-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
  max-width: 100%;
}

.selected-photos-list::-webkit-scrollbar {
  height: 6px;
}

.selected-photos-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.selected-photos-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.selected-photos-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.selected-photo-item {
  position: relative;
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid rgba(100, 181, 246, 0.5);
  transition: all 0.2s ease;
  cursor: pointer;
}

.selected-photo-item:hover {
  transform: scale(1.05);
  border-color: rgba(100, 181, 246, 0.8);
}

.selected-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-photo-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;
  opacity: 0;
}

.selected-photo-item:hover .remove-photo-btn {
  opacity: 1;
}

.remove-photo-btn:hover {
  background: rgba(255, 82, 82, 0.9);
  border-color: rgba(255, 82, 82, 0.5);
}

/* Mobile adjustments for selected photos */
@media (max-width: 767px) {
  .selected-photos-container {
    left: 10px;
    right: 0px;
    top: auto;
    bottom: 0px;
    max-width: calc(100vw - 10px);
    padding: 8px;
  }

  .selected-photo-item {
    width: 50px;
    height: 50px;
  }

  .zoom-controls {
    right: 5px !important;
    bottom: 5px !important;
  }
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
</style>
