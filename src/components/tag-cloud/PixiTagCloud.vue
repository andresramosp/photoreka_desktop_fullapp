<template>
  <div class="pixi-tag-cloud-wrapper" ref="containerRef">
    <!-- PixiJS Canvas -->
    <div ref="pixiContainer" class="pixi-container">
      <!-- Rectangle selection overlay (Ctrl/Cmd + drag) -->
      <div
        v-if="selectionRect"
        class="selection-rect"
        :style="{
          left: selectionRect.x + 'px',
          top: selectionRect.y + 'px',
          width: selectionRect.w + 'px',
          height: selectionRect.h + 'px',
        }"
      ></div>
    </div>

    <!-- Hover tooltip: full (visible label) -->
    <div
      v-if="displayedTooltipTag"
      ref="tooltipRef"
      class="tag-tooltip"
      :class="{ 'tag-tooltip-preview': props.isPreview }"
      :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
    >
      <div v-if="props.isPreview" class="tt-preview-photo-wrap">
        <Transition name="tt-photo-fade">
          <img
            v-if="currentTooltipPhoto"
            :key="`img-${currentTooltipPhotoKey}`"
            :src="currentTooltipPhoto.url"
            :alt="currentTooltipPhoto.title"
            class="tt-preview-photo"
          />
          <div
            v-else
            :key="`empty-${currentTooltipPhotoKey}`"
            class="tt-preview-photo tt-preview-photo-placeholder"
          >
            <NSpin v-if="tooltipLoading" size="small" />
          </div>
        </Transition>
      </div>

      <div v-else class="tt-meta">
        <div class="tt-group-row">
          <n-icon size="14">
            <TagsOutlined />
          </n-icon>
          <span class="tt-group">{{
            normalizeGroupName(displayedTooltipTag.group)
          }}</span>
        </div>
        <div class="tt-count-row">
          <n-icon size="14">
            <PictureOutlined />
          </n-icon>
          <span class="tt-count"
            >{{ displayedTooltipTag.photoCount }} photos</span
          >
        </div>
      </div>
    </div>

    <!-- Hover tooltip: compact (dot without visible label) -->
    <div
      v-else-if="!props.isPreview && dotTooltipTag"
      class="tag-tooltip tooltip-compact"
      :style="{ left: dotTooltipPos.x + 'px', top: dotTooltipPos.y + 'px' }"
    >
      {{ dotTooltipTag.name }}
    </div>

    <!-- Zoom Controls -->
    <div v-if="showZoomControls" class="zoom-controls">
      <button v-if="!isMobile" @click="zoomIn" class="zoom-btn" title="Zoom In">
        <n-icon size="18">
          <ZoomInOutlined />
        </n-icon>
      </button>
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
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch,
} from "vue";
import { NIcon, NSpin } from "naive-ui";
import { useSmartTooltipPosition } from "@/composables/useSmartTooltipPosition.js";
import { api } from "@/utils/axios";
import { usePhotosStore } from "@/stores/photos.js";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  TagsOutlined,
  PictureOutlined,
} from "@vicons/antd";
import * as PIXI from "pixi.js";
import { isMobileDevice } from "@/utils/utils.js";

const props = defineProps({
  tags: {
    type: Array,
    required: true,
  },
  showDots: {
    type: Boolean,
    default: true,
  },
  balloonExpansion: {
    type: Number,
    default: 0.2,
  },
  isPreview: {
    type: Boolean,
    default: false,
  },
  showZoomControls: {
    type: Boolean,
    default: true,
  },
  dynamicSearch: {
    type: Boolean,
    default: false,
  },
  maxSearchTags: {
    type: Number,
    default: 20,
  },
});

const emit = defineEmits(["tags-selected"]);
const photosStore = usePhotosStore();

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------
const containerRef = ref(null);
const pixiContainer = ref(null);
const hoveredTag = ref(null); // visible-label hover → full tooltip + forces label placement
const tooltipRef = ref(null);
const {
  tooltipPosition: tooltipPos,
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
const dotTooltipTag = ref(null); // dot hover (no visible label) → compact tooltip, does NOT trigger label relayout
const dotTooltipPos = ref({ x: 0, y: 0 });
const isMobile = ref(isMobileDevice());
const selectionRect = ref(null); // { x, y, w, h } in canvas-relative px
const tooltipPhotos = ref([]);
const tooltipPhotoIndex = ref(0);
const tooltipLoading = ref(false);
const displayedTooltipTag = ref(null); // only set after debounce fires

const activeTooltipTag = computed(() => hoveredTag.value);
const currentTooltipPhoto = computed(() => {
  if (!tooltipPhotos.value.length) return null;
  const index = tooltipPhotoIndex.value % tooltipPhotos.value.length;
  return tooltipPhotos.value[index] || null;
});
const currentTooltipPhotoKey = computed(() => {
  const activeTagId =
    activeTooltipTag.value?.id ?? activeTooltipTag.value?.name;
  const photo = currentTooltipPhoto.value;
  if (!photo) return `empty-${String(activeTagId || "none")}`;
  return `${String(activeTagId || "none")}-${tooltipPhotoIndex.value}-${String(photo.id || "photo")}`;
});

// ---------------------------------------------------------------------------
// PIXI handles & layout state
// ---------------------------------------------------------------------------
let app = null;
let world = null; // contains the dot layer; transformed by camera
let dotsGraphics = null; // single Graphics with all dots
let labelsContainer = null; // screen-space labels
let labelsByIndex = new Map(); // persistent labels keyed by tag index

// Parallel typed arrays (indexed like `props.tags`)
let positions = null; // Float32Array [x0,y0,...] — current (expanded) positions used for rendering
let rawPositions = null; // Float32Array [x0,y0,...] — positions before expansion
let dotRadii = null; // Float32Array
let dotColors = null; // Uint32Array

// Expansion animation
let currentExpansionStrength = 0.2;
const EXPANSION_LERP = 0.1;
const EXPANSION_EPSILON = 0.0005;

// Camera
const camera = { x: 0, y: 0, scale: 1 };
const targetCamera = { x: 0, y: 0, scale: 1 };
const minScale = 0.05;
const maxScale = 120;
let baseScale = 1;
const ZOOM_SENSITIVITY = 0.0035;
const CAMERA_LERP = 0.18;
const CAMERA_EPSILON = 0.001;
const LABEL_FADE_IN = 1;
const LABEL_HIDE_THRESHOLD = 0.03;
const HOVER_SCALE_LERP = 0.15; // speed of scale animation on hover
const HOVER_TINT_LERP = 0.12; // speed of tint animation on hover
const TAG_INTERACTION_MODE = "label-highlight"; // "dot-tooltip" | "label-highlight"
const LABEL_HIGHLIGHT_TINT = 0x06b6d4;

// Balloon expansion: scales all positions around the centroid (which is origin after centering)
const computeCosmicScale = (strength) => {
  const t = Math.max(0, Math.min(1, strength));
  const eased = t * t; // quadratic ease
  return 1 + eased * 30; // up to ~31x
};

// Group color palette
const GROUP_COLORS = {
  person: 0xf472b6,
  animals: 0xfbbf24,
  objects: 0x60a5fa,
  toponym: 0x34d399,
  environment: 0x10b981,
  mood: 0xa78bfa,
  weather: 0x38bdf8,
  symbols: 0xf87171,
  "abstract concept": 0xc084fc,
  misc: 0x9ca3af,
};
const DEFAULT_COLOR = 0x9ca3af;

let hoveredLabelIndex = -1;
let selectedTagIds = new Set(); // IDs of tags from the last emitted search
let dynamicSearchTimer = null;
let lastDynamicSearchSignature = null;

const DYNAMIC_SEARCH_DEBOUNCE_MS = 350;
const TOOLTIP_PREVIEW_LIMIT = 5;
const TOOLTIP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TOOLTIP_ROTATION_MS = 3000;
const TOOLTIP_FETCH_DEBOUNCE_MS = 220;

let tooltipRotationTimer = null;
let tooltipFetchRequestId = 0;
let tooltipFetchDebounceTimer = null;

const normalizeGroupName = (groupName) => {
  if (!groupName) return "";
  return groupName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const stopTooltipRotation = () => {
  if (tooltipRotationTimer) {
    clearInterval(tooltipRotationTimer);
    tooltipRotationTimer = null;
  }
};

const startTooltipRotation = () => {
  stopTooltipRotation();
  if (tooltipPhotos.value.length <= 1) return;

  tooltipRotationTimer = setInterval(() => {
    if (!tooltipPhotos.value.length) return;
    tooltipPhotoIndex.value =
      (tooltipPhotoIndex.value + 1) % tooltipPhotos.value.length;
  }, TOOLTIP_ROTATION_MS);
};

const normalizeTooltipPhotos = (photos) =>
  photos
    .map((photo) => {
      const url = photo?.thumbnailUrl || photo?.originalUrl || photo?.url || "";
      if (!url) return null;
      return {
        id: photo.id,
        url,
        title: photo.originalFileName || photo.title || "Tag photo preview",
      };
    })
    .filter(Boolean)
    .slice(0, TOOLTIP_PREVIEW_LIMIT);

const fetchTooltipPhotosForTag = async (tag) => {
  if (!tag?.name) return [];

  const { data: matches } = await api.post(
    "/api/search/tags/direct",
    {
      included: [tag.name],
      excluded: [],
      mode: "OR",
      semantic: false,
      limit: TOOLTIP_PREVIEW_LIMIT,
    },
    {
      cache: true,
      cacheTtlMs: TOOLTIP_CACHE_TTL_MS,
      cacheKey: `pixi-tooltip-direct:${String(tag.id ?? tag.name)}`,
    },
  );

  const orderedIds = Array.from(
    new Set(
      (Array.isArray(matches) ? matches : [])
        .map((match) => match?.photoId)
        .filter((photoId) => photoId != null),
    ),
  ).slice(0, TOOLTIP_PREVIEW_LIMIT);

  if (orderedIds.length === 0) {
    return [];
  }

  if (!photosStore.isInitialized && !photosStore.isLoading) {
    try {
      await photosStore.getOrFetch(false);
    } catch (_) {
      // If catalog is unavailable, we'll use whatever is already in store.
    }
  }

  const photoMap = new Map(
    (photosStore.allPhotos || []).map((photo) => [String(photo.id), photo]),
  );
  const orderedPhotos = orderedIds
    .map((photoId) => photoMap.get(String(photoId)))
    .filter(Boolean);
  return normalizeTooltipPhotos(orderedPhotos);
};

watch(
  () => props.tags,
  async () => {
    hoveredTag.value = null;
    setHoveredLabelIndex(-1);
    selectedTagIds = new Set();
    await nextTick();
    if (app) {
      clearLabels();
      buildScene();
      resetView();
    }
  },
  { deep: true },
);

watch(
  () => props.showDots,
  (val) => {
    if (dotsGraphics) dotsGraphics.visible = val;
  },
);

watch(
  () => props.dynamicSearch,
  (enabled) => {
    selectedTagIds.clear();
    syncLabelInteractionStates();

    if (!enabled) {
      if (dynamicSearchTimer) {
        clearTimeout(dynamicSearchTimer);
        dynamicSearchTimer = null;
      }
      lastDynamicSearchSignature = null;
      emit("tags-selected", []);
      return;
    }

    scheduleDynamicSearchEmit(true);
  },
);

watch(
  () => props.maxSearchTags,
  () => {
    if (!props.dynamicSearch) return;
    lastDynamicSearchSignature = null;
    scheduleDynamicSearchEmit(true);
  },
);

watch(hoveredTag, () => {
  scheduleLabelUpdate();
});

watch(displayedTooltipTag, async (tag) => {
  if (!tag) {
    clearTooltipAnchor();
    return;
  }
  await nextTick();
  repositionTooltip();
});

watch(
  activeTooltipTag,
  async (tag) => {
    if (tooltipFetchDebounceTimer) {
      clearTimeout(tooltipFetchDebounceTimer);
      tooltipFetchDebounceTimer = null;
    }

    stopTooltipRotation();
    tooltipPhotoIndex.value = 0;

    if (!props.isPreview || !tag) {
      tooltipFetchRequestId++;
      tooltipPhotos.value = [];
      tooltipLoading.value = false;
      displayedTooltipTag.value = tag; // non-preview: show immediately (or clear)
      return;
    }

    // Preview mode: hide tooltip until the debounce fires
    displayedTooltipTag.value = null;
    const requestId = ++tooltipFetchRequestId;
    tooltipLoading.value = true;
    tooltipPhotos.value = [];

    tooltipFetchDebounceTimer = setTimeout(async () => {
      displayedTooltipTag.value = tag; // reveal tooltip now that we're committing to the fetch
      try {
        const photos = await fetchTooltipPhotosForTag(tag);
        if (requestId !== tooltipFetchRequestId) return;
        tooltipPhotos.value = photos;
        startTooltipRotation();
      } catch (error) {
        if (requestId !== tooltipFetchRequestId) return;
        tooltipPhotos.value = [];
        console.warn("[PixiTagCloud] Failed to fetch tooltip photos", error);
      } finally {
        if (requestId === tooltipFetchRequestId) {
          tooltipLoading.value = false;
        }
      }
    }, TOOLTIP_FETCH_DEBOUNCE_MS);
  },
  { immediate: true },
);

// ---------------------------------------------------------------------------
// PIXI init
// ---------------------------------------------------------------------------
const initPixi = async () => {
  if (!pixiContainer.value) return;

  app = new PIXI.Application();
  await app.init({
    resizeTo: pixiContainer.value,
    background: 0x000000,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  pixiContainer.value.appendChild(app.canvas);

  world = new PIXI.Container();
  world.eventMode = "none"; // we hit-test manually
  app.stage.addChild(world);

  dotsGraphics = new PIXI.Graphics();
  dotsGraphics.eventMode = "none";
  world.addChild(dotsGraphics);

  labelsContainer = new PIXI.Container();
  labelsContainer.eventMode = "none";
  app.stage.addChild(labelsContainer);

  bindInteractions();
  updateCanvasCursor();
  app.ticker.add(onTick);
};

const destroyPixi = () => {
  if (app) {
    try {
      app.ticker.remove(onTick);
      app.destroy(true, { children: true, texture: true });
    } catch (e) {
      console.warn("[PixiTagCloud] destroy error", e);
    }
    app = null;
    world = null;
    dotsGraphics = null;
    labelsContainer = null;
    labelsByIndex = new Map();
    hoveredLabelIndex = -1;
    rawPositions = null;
    currentExpansionStrength = 0;
  }
};

const clearLabels = () => {
  for (const label of labelsByIndex.values()) {
    label.destroy();
  }
  labelsByIndex.clear();
};

// ---------------------------------------------------------------------------
// Build scene (one-time per data load): all dots in one Graphics
// ---------------------------------------------------------------------------
const buildScene = () => {
  if (!app || !dotsGraphics) return;
  dotsGraphics.clear();

  const N = props.tags.length;
  if (N === 0) {
    positions = null;
    dotRadii = null;
    dotColors = null;
    return;
  }

  let minCount = Infinity;
  let maxCount = -Infinity;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const t of props.tags) {
    if (t.photoCount < minCount) minCount = t.photoCount;
    if (t.photoCount > maxCount) maxCount = t.photoCount;
    const [x, y] = t.coordinates;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const countSpan = Math.max(1, maxCount - minCount);
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);

  const w = app.renderer.width;
  const h = app.renderer.height;
  const padding = 80;
  const targetW = w - padding * 2;
  const targetH = h - padding * 2;
  const worldScale = Math.min(targetW / spanX, targetH / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  rawPositions = new Float32Array(N * 2);
  positions = new Float32Array(N * 2);
  dotRadii = new Float32Array(N);
  dotColors = new Uint32Array(N);

  for (let i = 0; i < N; i++) {
    const t = props.tags[i];
    rawPositions[i * 2] = (t.coordinates[0] - cx) * worldScale;
    rawPositions[i * 2 + 1] = (t.coordinates[1] - cy) * worldScale;

    const norm = (t.photoCount - minCount) / countSpan;
    const sized = Math.sqrt(norm); // compress dynamic range
    dotRadii[i] = 1.5 + sized * 5; // 1.5..6.5
    dotColors[i] = GROUP_COLORS[t.group] || DEFAULT_COLOR;
  }

  // Snap currentExpansionStrength to match balloonExpansion so new loads don't animate in
  currentExpansionStrength = props.balloonExpansion;
  applyExpansionToPositions();
  redrawDots();

  baseScale = 1;
  dotsGraphics.visible = props.showDots;
};

// Re-compute `positions` from `rawPositions` at the current expansion strength
const applyExpansionToPositions = () => {
  if (!rawPositions || !positions) return;
  const s = computeCosmicScale(currentExpansionStrength);
  const N = props.tags.length;
  for (let i = 0; i < N; i++) {
    positions[i * 2] = rawPositions[i * 2] * s;
    positions[i * 2 + 1] = rawPositions[i * 2 + 1] * s;
  }
};

// Redraw all dots in dotsGraphics at the current `positions`
const redrawDots = () => {
  if (!dotsGraphics || !positions || !dotColors) return;
  dotsGraphics.clear();
  const N = props.tags.length;
  const indicesByColor = new Map();
  for (let i = 0; i < N; i++) {
    const c = dotColors[i];
    let arr = indicesByColor.get(c);
    if (!arr) {
      arr = [];
      indicesByColor.set(c, arr);
    }
    arr.push(i);
  }
  for (const [color, idxs] of indicesByColor) {
    for (const i of idxs) {
      dotsGraphics.circle(positions[i * 2], positions[i * 2 + 1], dotRadii[i]);
    }
    dotsGraphics.fill({ color, alpha: 0.85 });
  }
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const applyCamera = () => {
  if (!world) return;
  world.x = camera.x;
  world.y = camera.y;
  world.scale.set(camera.scale, camera.scale);
  scheduleLabelUpdate(true);
};

const syncTargetCamera = () => {
  targetCamera.x = camera.x;
  targetCamera.y = camera.y;
  targetCamera.scale = camera.scale;
};

const resetView = () => {
  if (!app) return;
  const w = app.renderer.width;
  const h = app.renderer.height;
  const padding = 80;

  // If positions are available, fit the camera to the actual (expanded) bounding box
  if (positions && props.tags.length > 0) {
    const N = props.tags.length;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const fitScale = Math.min(
      (w - padding * 2) / spanX,
      (h - padding * 2) / spanY,
    );
    camera.scale = fitScale;
    camera.x = w / 2 - ((minX + maxX) / 2) * fitScale;
    camera.y = h / 2 - ((minY + maxY) / 2) * fitScale;
  } else {
    camera.scale = baseScale;
    camera.x = w / 2;
    camera.y = h / 2;
  }

  syncTargetCamera();
  applyCamera();
};

const zoomCameraAboutPoint = (screenX, screenY, newScaleRaw) => {
  const newScale = Math.max(minScale, Math.min(maxScale, newScaleRaw));
  if (newScale === targetCamera.scale) return;

  const wx = (screenX - targetCamera.x) / targetCamera.scale;
  const wy = (screenY - targetCamera.y) / targetCamera.scale;

  targetCamera.scale = newScale;
  targetCamera.x = screenX - wx * targetCamera.scale;
  targetCamera.y = screenY - wy * targetCamera.scale;
};

const zoomIn = () => {
  if (!app) return;
  const centerX = app.renderer.width / 2;
  const centerY = app.renderer.height / 2;
  zoomCameraAboutPoint(centerX, centerY, targetCamera.scale * 1.2);
};

const zoomOut = () => {
  if (!app) return;
  const centerX = app.renderer.width / 2;
  const centerY = app.renderer.height / 2;
  zoomCameraAboutPoint(centerX, centerY, targetCamera.scale / 1.2);
};

// Fly the camera to a tag by id, centering it at a comfortable zoom level
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// flightState: active timed-lerp flight (bypasses regular camera lerp)
let flightState = null;

const flyToTag = (tagId) => {
  if (!app || !positions || !dotRadii) return;
  const index = props.tags.findIndex((t) => t.id === tagId);
  if (index < 0) return;

  const wx = positions[index * 2];
  const wy = positions[index * 2 + 1];

  const w = app.renderer.width;
  const h = app.renderer.height;

  // Scale so the dot's radius covers ~35% of the smaller screen dimension
  const r = Math.max(0.0001, dotRadii[index]);
  const desiredScreenRadius = Math.min(w, h) * 0.35;
  const toScale = Math.min(
    maxScale,
    Math.max(minScale, desiredScreenRadius / r),
  );
  const toX = w / 2 - wx * toScale;
  const toY = h / 2 - wy * toScale;

  // Duration: min 900ms, max 2200ms, based on screen-space distance + scale change
  const dx = toX - camera.x;
  const dy = toY - camera.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scaleDiff = Math.abs(toScale - camera.scale);
  const duration = Math.max(900, Math.min(2200, dist * 0.4 + scaleDiff * 150));

  flightState = {
    startTime: performance.now(),
    duration,
    startX: camera.x,
    startY: camera.y,
    startScale: camera.scale,
    toX,
    toY,
    toScale,
  };

  // Also update targetCamera so user interactions after landing are consistent
  targetCamera.x = toX;
  targetCamera.y = toY;
  targetCamera.scale = toScale;
};

const onTick = () => {
  if (!app) return;

  const delta = Math.max(1, app.ticker.deltaTime);
  const lerpFactor = 1 - Math.pow(1 - CAMERA_LERP, delta);
  let cameraChanged = false;

  // --- Timed flight (flyToTag) overrides the regular lerp ---
  if (flightState) {
    const now = performance.now();
    const elapsed = now - flightState.startTime;
    const progress = Math.min(elapsed / flightState.duration, 1);
    const eased = easeInOutCubic(progress);

    camera.x =
      flightState.startX + (flightState.toX - flightState.startX) * eased;
    camera.y =
      flightState.startY + (flightState.toY - flightState.startY) * eased;
    camera.scale =
      flightState.startScale +
      (flightState.toScale - flightState.startScale) * eased;
    cameraChanged = true;

    if (progress >= 1) {
      camera.x = flightState.toX;
      camera.y = flightState.toY;
      camera.scale = flightState.toScale;
      flightState = null;
      syncTargetCamera();
    }
  } else {
    const dx = targetCamera.x - camera.x;
    const dy = targetCamera.y - camera.y;
    const ds = targetCamera.scale - camera.scale;

    if (
      Math.abs(dx) > CAMERA_EPSILON ||
      Math.abs(dy) > CAMERA_EPSILON ||
      Math.abs(ds) > CAMERA_EPSILON
    ) {
      camera.x += dx * lerpFactor;
      camera.y += dy * lerpFactor;
      camera.scale += ds * lerpFactor;

      if (Math.abs(targetCamera.x - camera.x) <= CAMERA_EPSILON) {
        camera.x = targetCamera.x;
      }
      if (Math.abs(targetCamera.y - camera.y) <= CAMERA_EPSILON) {
        camera.y = targetCamera.y;
      }
      if (Math.abs(targetCamera.scale - camera.scale) <= CAMERA_EPSILON) {
        camera.scale = targetCamera.scale;
      }

      cameraChanged = true;
    }
  } // end else (not flying)

  if (cameraChanged) {
    applyCamera();
  }

  // Expansion animation
  const expansionDelta = props.balloonExpansion - currentExpansionStrength;
  if (Math.abs(expansionDelta) > EXPANSION_EPSILON) {
    currentExpansionStrength += expansionDelta * EXPANSION_LERP * delta;
    if (
      Math.abs(props.balloonExpansion - currentExpansionStrength) <=
      EXPANSION_EPSILON
    ) {
      currentExpansionStrength = props.balloonExpansion;
    }
    applyExpansionToPositions();
    redrawDots();
    scheduleLabelUpdate(true);
  }

  updateLabelAlphas();
};

// ---------------------------------------------------------------------------
// Labels: collision-aware, viewport-culled, capped count
// ---------------------------------------------------------------------------
const BASE_MAX_VISIBLE_LABELS = 250;
const MAX_MAX_VISIBLE_LABELS = 1400;
let labelUpdateRaf = null;
let pendingDynamicSearchRefresh = false;

const scheduleLabelUpdate = (refreshDynamicSearch = false) => {
  pendingDynamicSearchRefresh =
    pendingDynamicSearchRefresh || refreshDynamicSearch;
  if (labelUpdateRaf) return;
  labelUpdateRaf = requestAnimationFrame(() => {
    const shouldRefreshDynamicSearch = pendingDynamicSearchRefresh;
    labelUpdateRaf = null;
    pendingDynamicSearchRefresh = false;
    updateLabels(shouldRefreshDynamicSearch);
  });
};

const getOrCreateLabel = (index) => {
  let label = labelsByIndex.get(index);
  if (label) return label;

  label = new PIXI.Text({
    text: "",
    style: {
      fontFamily: "Work Sans, system-ui, sans-serif",
      fontSize: 12,
      fill: "whitesmoke",
      stroke: { color: "black", width: 1, alpha: 1 },
      align: "center",
      fontStretch: "condensed",
      letterSpacing: -0.5,
    },
  });
  label.anchor.set(0.5, 0.5);
  label.eventMode = "none";
  label.alpha = 0;
  label.visible = false;
  label.targetAlpha = 0;
  label.tint = 0xffffff;
  label.targetScale = 1;
  label.targetTint = 0xffffff;
  labelsContainer.addChild(label);
  labelsByIndex.set(index, label);
  return label;
};

const hideAllLabels = () => {
  for (const label of labelsByIndex.values()) {
    label.targetAlpha = 0;
    label.hitRect = null;
  }
};

const syncLabelInteractionStates = () => {
  for (const [index, label] of labelsByIndex.entries()) {
    const isHovered =
      TAG_INTERACTION_MODE === "label-highlight" &&
      index === hoveredLabelIndex &&
      label.visible &&
      (label.targetAlpha ?? 0) > 0;
    const isSelected =
      selectedTagIds.size > 0 &&
      props.tags[index] != null &&
      selectedTagIds.has(props.tags[index].id);

    // Set target values for smooth animation
    label.targetTint =
      isHovered || isSelected ? LABEL_HIGHLIGHT_TINT : 0xffffff;
    label.targetScale = isHovered ? 1.04 : 1;
  }
};

const setHoveredLabelIndex = (index) => {
  if (hoveredLabelIndex === index) return;
  hoveredLabelIndex = index;
  syncLabelInteractionStates();
  updateCanvasCursor();
};

const updateCanvasCursor = () => {
  if (!app?.canvas) return;
  if (isPanning) {
    app.canvas.style.cursor = "grabbing";
    return;
  }
  if (hoveredLabelIndex >= 0) {
    app.canvas.style.cursor = props.isPreview ? "default" : "pointer";
    return;
  }
  app.canvas.style.cursor = "grab";
};

// Interpolate a tint value from current to target
const lerpTint = (current, target, factor) => {
  const cr = (current >> 16) & 0xff;
  const cg = (current >> 8) & 0xff;
  const cb = current & 0xff;

  const tr = (target >> 16) & 0xff;
  const tg = (target >> 8) & 0xff;
  const tb = target & 0xff;

  const nr = Math.round(cr + (tr - cr) * factor);
  const ng = Math.round(cg + (tg - cg) * factor);
  const nb = Math.round(cb + (tb - cb) * factor);

  return (nr << 16) | (ng << 8) | nb;
};

const updateLabelAlphas = () => {
  for (const label of labelsByIndex.values()) {
    const targetAlpha = label.targetAlpha ?? 0;
    if (targetAlpha === 0) {
      label.alpha = 0;
      label.visible = false;
    } else {
      if (!label.visible) {
        label.visible = true;
      }

      const nextAlpha =
        label.alpha + (targetAlpha - label.alpha) * LABEL_FADE_IN;
      label.alpha =
        Math.abs(targetAlpha - nextAlpha) < 0.01 ? targetAlpha : nextAlpha;
    }

    // Smooth scale animation
    const currentScale = label.scale.x;
    const targetScale = label.targetScale ?? 1;
    const scaleDelta = targetScale - currentScale;
    if (Math.abs(scaleDelta) > 0.001) {
      const nextScale = currentScale + scaleDelta * HOVER_SCALE_LERP;
      label.scale.set(nextScale);
    } else if (currentScale !== targetScale) {
      label.scale.set(targetScale);
    }

    // Smooth tint animation
    const targetTint = label.targetTint ?? 0xffffff;
    if (label.tint !== targetTint) {
      label.tint = lerpTint(label.tint, targetTint, HOVER_TINT_LERP);
    }
  }
};

const getDynamicMaxVisibleLabels = (scale) => {
  const zoomBoost = Math.min(1, scale / 4);
  return Math.round(
    BASE_MAX_VISIBLE_LABELS +
      (MAX_MAX_VISIBLE_LABELS - BASE_MAX_VISIBLE_LABELS) * zoomBoost,
  );
};

const getHoveredTagIndex = () => {
  if (!hoveredTag.value) return -1;
  return props.tags.findIndex((tag) => tag.id === hoveredTag.value.id);
};

const placeLabelRectInGrid = (grid, cellKey, rect, cellSize) => {
  const cx1 = Math.floor(rect.x1 / cellSize);
  const cy1 = Math.floor(rect.y1 / cellSize);
  const cx2 = Math.floor(rect.x2 / cellSize);
  const cy2 = Math.floor(rect.y2 / cellSize);

  for (let cx = cx1; cx <= cx2; cx++) {
    for (let cy = cy1; cy <= cy2; cy++) {
      const k = cellKey(cx, cy);
      let list = grid.get(k);
      if (!list) {
        list = [];
        grid.set(k, list);
      }
      list.push(rect);
    }
  }
};

const rectCollides = (grid, cellKey, rect, cellSize) => {
  const cx1 = Math.floor(rect.x1 / cellSize);
  const cy1 = Math.floor(rect.y1 / cellSize);
  const cx2 = Math.floor(rect.x2 / cellSize);
  const cy2 = Math.floor(rect.y2 / cellSize);

  for (let cx = cx1; cx <= cx2; cx++) {
    for (let cy = cy1; cy <= cy2; cy++) {
      const list = grid.get(cellKey(cx, cy));
      if (!list) continue;
      for (const existing of list) {
        if (
          rect.x1 < existing.x2 &&
          rect.x2 > existing.x1 &&
          rect.y1 < existing.y2 &&
          rect.y2 > existing.y1
        ) {
          return true;
        }
      }
    }
  }

  return false;
};

const getViewportVisibleTags = () => {
  if (!app) return [];

  const viewportRect = {
    x1: 0,
    y1: 0,
    x2: app.renderer.width,
    y2: app.renderer.height,
  };
  const visibleTags = [];

  for (const [index, label] of labelsByIndex.entries()) {
    if (
      !label.visible ||
      (label.targetAlpha ?? 0) <= 0 ||
      !label.hitRect ||
      !props.tags[index]
    ) {
      continue;
    }

    const rect = label.hitRect;
    const intersectsViewport =
      rect.x1 < viewportRect.x2 &&
      rect.x2 > viewportRect.x1 &&
      rect.y1 < viewportRect.y2 &&
      rect.y2 > viewportRect.y1;

    if (!intersectsViewport) continue;

    visibleTags.push(props.tags[index]);
  }

  visibleTags.sort((left, right) => {
    const photoCountDiff = (right.photoCount || 0) - (left.photoCount || 0);
    if (photoCountDiff !== 0) return photoCountDiff;
    return String(left.name || "").localeCompare(String(right.name || ""));
  });

  return visibleTags.slice(0, Math.max(1, props.maxSearchTags || 1));
};

const emitDynamicSearchSelection = () => {
  dynamicSearchTimer = null;
  if (!props.dynamicSearch) return;

  const visibleTags = getViewportVisibleTags();
  const signature = visibleTags.map((tag) => tag.id).join(",");
  if (signature === lastDynamicSearchSignature) return;

  lastDynamicSearchSignature = signature;
  emit("tags-selected", visibleTags);
};

const scheduleDynamicSearchEmit = (immediate = false) => {
  if (!props.dynamicSearch) return;

  if (dynamicSearchTimer) {
    clearTimeout(dynamicSearchTimer);
    dynamicSearchTimer = null;
  }

  if (immediate) {
    emitDynamicSearchSelection();
    return;
  }

  dynamicSearchTimer = setTimeout(
    emitDynamicSearchSelection,
    DYNAMIC_SEARCH_DEBOUNCE_MS,
  );
};

const placeLabelAtIndex = (index, grid, cellKey, cellSize, force = false) => {
  if (index < 0 || index >= props.tags.length) return false;

  const scale = camera.scale;
  const w = app.renderer.width;
  const h = app.renderer.height;
  const margin = 120;
  const wx = positions[index * 2];
  const wy = positions[index * 2 + 1];
  const sx = wx * scale + camera.x;
  const sy = wy * scale + camera.y;

  if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
    return false;
  }

  const rankRatio = index / Math.max(1, props.tags.length);
  const t = props.tags[index];
  const baseFs = 11 + (1 - rankRatio) * 14;
  const fs = Math.max(10, Math.min(28, baseFs * (0.85 + 0.15 * scale)));
  const estW = Math.max(20, t.name.length * fs * 0.55);
  const estH = fs * 1.15;
  const rect = {
    x1: sx - estW / 2,
    y1: sy - estH / 2,
    x2: sx - estW / 2 + estW,
    y2: sy + estH / 2,
  };

  if (!force && rectCollides(grid, cellKey, rect, cellSize)) {
    return false;
  }

  placeLabelRectInGrid(grid, cellKey, rect, cellSize);

  const label = getOrCreateLabel(index);
  if (label.text !== t.name) label.text = t.name;
  if (label.style.fontSize !== fs) label.style.fontSize = fs;
  label.x = sx;
  label.y = sy;
  label.targetAlpha = 1;
  label.hitRect = rect;
  label.visible = true;
  return true;
};

const updateLabels = (refreshDynamicSearch = false) => {
  hideAllLabels();
  if (!app || !positions || props.tags.length === 0) {
    if (refreshDynamicSearch) {
      scheduleDynamicSearchEmit();
    }
    return;
  }

  const w = app.renderer.width;
  const h = app.renderer.height;
  const scale = camera.scale;
  const maxVisibleLabels = getDynamicMaxVisibleLabels(scale);

  // At low zoom we keep only top tags; as we zoom in we admit more.
  const zoomBoost = Math.min(1, scale / 3);
  const margin = 120;

  // Spatial hash for collision detection between candidate label rects
  const cellSize = 64;
  const grid = new Map();
  const cellKey = (cx, cy) => cx * 100000 + cy;

  const N = props.tags.length;
  let placed = 0;
  const hoveredIndex = getHoveredTagIndex();

  if (
    hoveredIndex >= 0 &&
    placeLabelAtIndex(hoveredIndex, grid, cellKey, cellSize, true)
  ) {
    placed++;
  }

  for (let i = 0; i < N && placed < maxVisibleLabels; i++) {
    if (i === hoveredIndex) continue;

    const wx = positions[i * 2];
    const wy = positions[i * 2 + 1];
    const sx = wx * scale + camera.x;
    const sy = wy * scale + camera.y;

    if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin)
      continue;

    // tags are sorted by photoCount desc -> i is rank
    const rankRatio = i / N;
    const rankCutoff = 0.05 + 0.95 * zoomBoost;
    if (rankRatio > rankCutoff && placed > 30) continue;

    if (placeLabelAtIndex(i, grid, cellKey, cellSize)) {
      placed++;
    }
  }

  syncLabelInteractionStates();
  if (refreshDynamicSearch) {
    scheduleDynamicSearchEmit();
  }
};

// ---------------------------------------------------------------------------
// Hover hit-testing (manual; ~22k iterations is fine)
// ---------------------------------------------------------------------------
const HOVER_RADIUS_PX = 14;

const findTagAtScreen = (sx, sy) => {
  if (!positions) return -1;
  const N = props.tags.length;
  const scale = camera.scale;
  const wx = (sx - camera.x) / scale;
  const wy = (sy - camera.y) / scale;
  const rWorld = HOVER_RADIUS_PX / scale;
  const r2 = rWorld * rWorld;

  let best = -1;
  let bestDist = r2;
  for (let i = 0; i < N; i++) {
    const dx = positions[i * 2] - wx;
    const dy = positions[i * 2 + 1] - wy;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
};

const findVisibleLabelAtScreen = (sx, sy) => {
  for (const [index, label] of labelsByIndex.entries()) {
    if (
      !label.visible ||
      label.alpha <= LABEL_HIDE_THRESHOLD ||
      !label.hitRect
    ) {
      continue;
    }

    const { x1, y1, x2, y2 } = label.hitRect;
    if (sx >= x1 - 4 && sx <= x2 + 4 && sy >= y1 - 4 && sy <= y2 + 4) {
      return index;
    }
  }

  return -1;
};

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
let isPanning = false;
let panStart = { x: 0, y: 0, camX: 0, camY: 0 };

// Touch state
let isTouching = false;
let touchPanStart = { x: 0, y: 0, camX: 0, camY: 0 };
let isPinching = false;
let lastPinchDistance = 0;
let lastPinchWorldX = 0;
let lastPinchWorldY = 0;
let touchStartTime = 0;
let hadRecentPinch = false;

// Keyboard navigation state
const keysPressed = new Set();
const KEYBOARD_PAN_SPEED = 8;
let keyboardAnimationId = null;

// Rectangle selection state (Ctrl/Cmd + drag)
let isSelecting = false;
let selectStart = { x: 0, y: 0 }; // canvas-relative coords
const SELECTION_DRAG_THRESHOLD = 3;

const getCanvasPoint = (clientX, clientY) => {
  const rect = app.canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

const getTagsInScreenRect = (rx1, ry1, rx2, ry2) => {
  const out = [];
  for (const [index, label] of labelsByIndex.entries()) {
    if (
      !label.visible ||
      label.alpha <= LABEL_HIDE_THRESHOLD ||
      !label.hitRect
    ) {
      continue;
    }
    const r = label.hitRect;
    // AABB intersection
    if (r.x1 <= rx2 && r.x2 >= rx1 && r.y1 <= ry2 && r.y2 >= ry1) {
      out.push(props.tags[index]);
    }
  }
  return out;
};

const bindInteractions = () => {
  const canvas = app.canvas;
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove);
  canvas.addEventListener("pointerleave", onCanvasPointerLeave);
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("touchcancel", onTouchEnd);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);
  if (!props.isPreview) {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
  }
};

const unbindInteractions = () => {
  if (!app) return;
  const canvas = app.canvas;
  canvas.removeEventListener("wheel", onWheel);
  canvas.removeEventListener("pointerdown", onPointerDown);
  canvas.removeEventListener("pointermove", onCanvasPointerMove);
  canvas.removeEventListener("pointerleave", onCanvasPointerLeave);
  canvas.removeEventListener("click", onCanvasClick);
  canvas.removeEventListener("touchstart", onTouchStart);
  canvas.removeEventListener("touchmove", onTouchMove);
  canvas.removeEventListener("touchend", onTouchEnd);
  canvas.removeEventListener("touchcancel", onTouchEnd);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("resize", onResize);
  if (!props.isPreview) {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  }
};

const onWheel = (e) => {
  e.preventDefault();
  if (!app) return;
  const rect = app.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
  const newScale = Math.max(
    minScale,
    Math.min(maxScale, targetCamera.scale * factor),
  );
  if (newScale === targetCamera.scale) return;

  const wx = (mx - targetCamera.x) / targetCamera.scale;
  const wy = (my - targetCamera.y) / targetCamera.scale;

  targetCamera.scale = newScale;
  targetCamera.x = mx - wx * targetCamera.scale;
  targetCamera.y = my - wy * targetCamera.scale;
};

const onPointerDown = (e) => {
  if (!app) return;
  const rect = app.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // Ctrl/Cmd + drag → start rectangle selection (disabled in isPreview)
  if (!props.isPreview && (e.ctrlKey || e.metaKey)) {
    isSelecting = true;
    isPanning = false;
    selectStart = { x: sx, y: sy };
    selectionRect.value = { x: sx, y: sy, w: 0, h: 0 };
    try {
      app.canvas.setPointerCapture?.(e.pointerId);
    } catch (_) {}
    e.preventDefault();
    return;
  }

  if (findVisibleLabelAtScreen(sx, sy) >= 0) {
    isPanning = false;
    updateCanvasCursor();
    return;
  }

  isPanning = true;
  panStart = {
    x: e.clientX,
    y: e.clientY,
    camX: camera.x,
    camY: camera.y,
  };
};

const onPointerMove = (e) => {
  if (isSelecting) {
    const { x, y } = getCanvasPoint(e.clientX, e.clientY);
    const x1 = Math.min(selectStart.x, x);
    const y1 = Math.min(selectStart.y, y);
    const x2 = Math.max(selectStart.x, x);
    const y2 = Math.max(selectStart.y, y);
    selectionRect.value = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    return;
  }
  if (!isPanning) return;
  camera.x = panStart.camX + (e.clientX - panStart.x);
  camera.y = panStart.camY + (e.clientY - panStart.y);
  syncTargetCamera();
  applyCamera();
  updateCanvasCursor();
};

const getSelectedTags = () =>
  props.tags.filter((candidate) => selectedTagIds.has(candidate.id));

const mergeTagSelection = (incomingTags) => {
  const merged = new Map();

  for (const tag of getSelectedTags()) {
    merged.set(tag.id, tag);
  }

  for (const tag of incomingTags) {
    merged.set(tag.id, tag);
  }

  return props.tags.filter((candidate) => merged.has(candidate.id));
};

const emitTagsSelected = (selectedTags) => {
  if (props.dynamicSearch || props.isPreview) return;
  selectedTagIds = new Set(selectedTags.map((t) => t.id));
  syncLabelInteractionStates();
  emit("tags-selected", selectedTags);
};

const toggleTagSelection = (tag) => {
  if (!tag || props.dynamicSearch || props.isPreview) return;

  const nextSelection = selectedTagIds.has(tag.id)
    ? props.tags.filter(
        (candidate) =>
          selectedTagIds.has(candidate.id) && candidate.id !== tag.id,
      )
    : [...getSelectedTags(), tag];

  emitTagsSelected(nextSelection);
};

const clearSelection = () => {
  selectedTagIds.clear();
  syncLabelInteractionStates();
};

const onPointerUp = (e) => {
  if (isSelecting) {
    isSelecting = false;
    const r = selectionRect.value;
    selectionRect.value = null;
    if (
      r &&
      (r.w > SELECTION_DRAG_THRESHOLD || r.h > SELECTION_DRAG_THRESHOLD)
    ) {
      const found = getTagsInScreenRect(r.x, r.y, r.x + r.w, r.y + r.h);
      if (found.length > 0) {
        emitTagsSelected(mergeTagSelection(found));
      }
    } else if (r && e) {
      // Treat as a click on a single tag while preserving ctrl/cmd toggle behavior.
      const { x, y } = getCanvasPoint(e.clientX, e.clientY);
      const idx = findVisibleLabelAtScreen(x, y);
      const tagIndex = idx >= 0 ? idx : findTagAtScreen(x, y);
      if (tagIndex >= 0) {
        toggleTagSelection(props.tags[tagIndex]);
      }
    }
    updateCanvasCursor();
    return;
  }
  isPanning = false;
  updateCanvasCursor();
};

const onCanvasPointerMove = (e) => {
  if (isPanning || isSelecting) {
    hoveredTag.value = null;
    dotTooltipTag.value = null;
    clearTooltipAnchor();
    return;
  }
  if (!app) return;
  const rect = app.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const labelIndex = findVisibleLabelAtScreen(sx, sy);
  setHoveredLabelIndex(labelIndex);

  if (labelIndex >= 0) {
    // Hovering a visible label → full tooltip + forces label placement via watch
    hoveredTag.value = props.tags[labelIndex];
    placeTooltipAt({ x: sx, y: sy });
    dotTooltipTag.value = null;
    return;
  }

  hoveredTag.value = null;
  clearTooltipAnchor();

  if (props.isPreview) {
    dotTooltipTag.value = null;
    return;
  }

  const dotIdx = findTagAtScreen(sx, sy);
  if (dotIdx >= 0) {
    dotTooltipTag.value = props.tags[dotIdx];
    dotTooltipPos.value = { x: sx + 5, y: sy + 5 };
    return;
  }

  dotTooltipTag.value = null;
};

const onCanvasPointerLeave = () => {
  hoveredTag.value = null;
  dotTooltipTag.value = null;
  clearTooltipAnchor();
  setHoveredLabelIndex(-1);
};

const onCanvasClick = (e) => {
  if (!app || props.isPreview) return;
  // Ignore the click that follows a Ctrl/Cmd-drag selection
  if (e.ctrlKey || e.metaKey) return;
  const rect = app.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  // Visible label takes priority; fall back to dot hit-test
  const labelIndex = findVisibleLabelAtScreen(sx, sy);
  const index = labelIndex >= 0 ? labelIndex : findTagAtScreen(sx, sy);
  if (index >= 0) {
    emitTagsSelected([props.tags[index]]);
  }
};

// ---------------------------------------------------------------------------
// Touch handlers
// ---------------------------------------------------------------------------
const onTouchStart = (e) => {
  e.preventDefault();
  const touches = e.touches;

  if (touches.length === 1) {
    isPanning = false;
    isPinching = false;
    isTouching = true;
    touchStartTime = performance.now();
    touchPanStart = {
      x: touches[0].clientX,
      y: touches[0].clientY,
      camX: camera.x,
      camY: camera.y,
    };
  } else if (touches.length === 2) {
    isTouching = false;
    isPanning = false;
    isPinching = true;
    hadRecentPinch = true;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    lastPinchDistance = Math.sqrt(dx * dx + dy * dy);

    if (app) {
      const rect = app.canvas.getBoundingClientRect();
      const midX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const midY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      lastPinchWorldX = (midX - camera.x) / camera.scale;
      lastPinchWorldY = (midY - camera.y) / camera.scale;
    }
  }
};

const onTouchMove = (e) => {
  e.preventDefault();
  const touches = e.touches;

  if (isPinching && touches.length === 2) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (!app) return;
    const rect = app.canvas.getBoundingClientRect();
    const midX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
    const midY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;

    const prevDistance = lastPinchDistance || distance || 1;
    const pinchRatio = distance > 0 ? distance / prevDistance : 1;
    const newScale = Math.max(
      minScale,
      Math.min(maxScale, camera.scale * pinchRatio),
    );

    // Keep the anchored world point under the pinch midpoint
    camera.x = midX - lastPinchWorldX * newScale;
    camera.y = midY - lastPinchWorldY * newScale;
    camera.scale = newScale;

    lastPinchDistance = distance;
    // Recompute anchor from updated transform
    lastPinchWorldX = (midX - camera.x) / camera.scale;
    lastPinchWorldY = (midY - camera.y) / camera.scale;

    syncTargetCamera();
    applyCamera();
  } else if (isTouching && touches.length === 1) {
    const dx = touches[0].clientX - touchPanStart.x;
    const dy = touches[0].clientY - touchPanStart.y;
    camera.x = touchPanStart.camX + dx;
    camera.y = touchPanStart.camY + dy;
    syncTargetCamera();
    applyCamera();
  }
};

const onTouchEnd = (e) => {
  const wasPinching = isPinching;

  // Detect tap (short touch with minimal movement, no recent pinch, disabled in isPreview)
  if (
    !props.isPreview &&
    !wasPinching &&
    !hadRecentPinch &&
    isTouching &&
    e.changedTouches.length > 0
  ) {
    const touch = e.changedTouches[0];
    const duration = performance.now() - touchStartTime;
    const dx = Math.abs(touch.clientX - touchPanStart.x);
    const dy = Math.abs(touch.clientY - touchPanStart.y);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (duration < 300 && dx < 15 && dy < 15 && dist < 20 && app) {
      const rect = app.canvas.getBoundingClientRect();
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      const labelIndex = findVisibleLabelAtScreen(sx, sy);
      const index = labelIndex >= 0 ? labelIndex : findTagAtScreen(sx, sy);
      if (index >= 0) {
        emitTagsSelected([props.tags[index]]);
      }
    }
  }

  // If one finger remains after pinching, transition to pan
  if (e.touches && e.touches.length === 1) {
    isPinching = false;
    isTouching = true;
    touchStartTime = performance.now();
    const t = e.touches[0];
    touchPanStart = {
      x: t.clientX,
      y: t.clientY,
      camX: camera.x,
      camY: camera.y,
    };
  } else {
    isTouching = false;
    isPinching = false;
    if (hadRecentPinch) {
      setTimeout(() => {
        hadRecentPinch = false;
      }, 300);
    }
  }
};

// ---------------------------------------------------------------------------
// Keyboard navigation (WASD + arrows)
// ---------------------------------------------------------------------------
const handleKeyDown = (e) => {
  if (props.isPreview) return;
  const target = e.target;
  const tagName = target?.tagName?.toLowerCase();
  const isEditable = target?.isContentEditable;

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    isEditable ||
    target?.closest?.(".n-select") ||
    target?.closest?.(".n-input")
  )
    return;

  const key = e.key.toLowerCase();
  if (
    [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ].includes(key)
  ) {
    e.preventDefault();
    keysPressed.add(key);
    if (!keyboardAnimationId) {
      keyboardAnimationId = requestAnimationFrame(updateKeyboardPan);
    }
  }
};

const handleKeyUp = (e) => {
  if (props.isPreview) return;
  const target = e.target;
  const tagName = target?.tagName?.toLowerCase();
  const isEditable = target?.isContentEditable;

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    isEditable ||
    target?.closest?.(".n-select") ||
    target?.closest?.(".n-input")
  )
    return;

  keysPressed.delete(e.key.toLowerCase());

  if (keysPressed.size === 0 && keyboardAnimationId) {
    cancelAnimationFrame(keyboardAnimationId);
    keyboardAnimationId = null;
  }
};

const updateKeyboardPan = () => {
  if (keysPressed.size === 0) {
    keyboardAnimationId = null;
    return;
  }

  let dx = 0;
  let dy = 0;
  if (keysPressed.has("w") || keysPressed.has("arrowup"))
    dy += KEYBOARD_PAN_SPEED;
  if (keysPressed.has("s") || keysPressed.has("arrowdown"))
    dy -= KEYBOARD_PAN_SPEED;
  if (keysPressed.has("a") || keysPressed.has("arrowleft"))
    dx += KEYBOARD_PAN_SPEED;
  if (keysPressed.has("d") || keysPressed.has("arrowright"))
    dx -= KEYBOARD_PAN_SPEED;

  if (dx !== 0 || dy !== 0) {
    targetCamera.x += dx;
    targetCamera.y += dy;
  }

  keyboardAnimationId = requestAnimationFrame(updateKeyboardPan);
};

let resizeRaf = null;
const onResize = () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    if (!app) return;
    buildScene();
    resetView();
  });
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(async () => {
  await initPixi();
  buildScene();
  resetView();
});

onBeforeUnmount(() => {
  if (labelUpdateRaf) cancelAnimationFrame(labelUpdateRaf);
  if (dynamicSearchTimer) clearTimeout(dynamicSearchTimer);
  if (tooltipFetchDebounceTimer) clearTimeout(tooltipFetchDebounceTimer);
  if (keyboardAnimationId) cancelAnimationFrame(keyboardAnimationId);
  stopTooltipRotation();
  unbindInteractions();
  destroyPixi();
});

defineExpose({
  clearSelection,
  flyToTag,
  resetView,
  zoomIn,
  zoomOut,
});
</script>

<style scoped>
.pixi-tag-cloud-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: black;
  color: var(--text-primary, #fff);
}

.pixi-container {
  position: absolute;
  inset: 0;
  cursor: grab;
}

.pixi-container canvas {
  display: block;
  background: black;
}

.pixi-container:active {
  cursor: grabbing;
}

.selection-rect {
  position: absolute;
  pointer-events: none;
  border: 1px solid #06b6d4;
  background: rgba(6, 182, 212, 0.12);
  border-radius: 2px;
  z-index: 4;
}

.tag-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 20;
  background: var(--bg-container, rgba(26, 26, 31, 0.95));
  color: var(--text-primary, #fff);
  padding: 8px 10px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  font-size: 12px;
  box-shadow: var(--shadow-md, 0 4px 14px rgba(0, 0, 0, 0.4));
  white-space: nowrap;
  min-width: 140px;
}

.tag-tooltip-preview {
  background: rgba(30, 30, 30, 0.95);
  border: none;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  padding: 8px;
  min-width: 0;
  max-width: 300px;
  animation: tooltipFadeIn 0.2s ease-out;
}

.tt-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.tt-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-primay, #9ca3af);
}

.tt-preview-photo-wrap {
  margin: 0;
  position: relative;
  width: 300px;
  height: 188px;
}

.tt-preview-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  position: absolute;
  inset: 0;
}

.tt-preview-photo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface, rgba(255, 255, 255, 0.04));
  width: 100%;
  height: 100%;
  border-radius: 4px;
  position: absolute;
  inset: 0;
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

.tt-photo-fade-enter-active,
.tt-photo-fade-leave-active {
  transition: opacity 0.36s ease;
}

.tt-photo-fade-enter-from,
.tt-photo-fade-leave-to {
  opacity: 0;
}

.tt-group-row,
.tt-count-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tt-group {
  text-transform: capitalize;
}

.tt-rotation {
  font-size: 10px;
  color: var(--text-secondary, #9ca3af);
}

.tooltip-compact {
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  pointer-events: none;
}

/* Zoom controls */
.zoom-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: var(--bg-container, rgba(26, 26, 31, 0.95));
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
  backdrop-filter: blur(10px);
  flex-direction: column;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
}

.zoom-btn {
  background-color: var(--bg-surface, rgba(255, 255, 255, 0.05));
  border: none;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary, #d1d5db);
  transition: all 0.2s;
}

.zoom-btn:hover {
  background-color: rgba(255, 255, 255, 0.12);
  color: var(--text-primary, #ffffff);
}
</style>
