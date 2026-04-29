<template>
  <div class="tag-cloud-container" ref="containerRef">
    <!-- Error -->
    <div v-if="error" class="state-screen">
      <div class="state-content">
        <h2>Unable to load tag cloud</h2>
        <p>{{ error }}</p>
        <button @click="loadTags" class="primary-btn">Retry</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="discrete-loader">
      <div class="loader-spinner"></div>
      <span class="loader-text">{{ loadingMessage }}</span>
    </div>

    <!-- Empty -->
    <div v-else-if="tags.length === 0" class="state-screen">
      <div class="state-content">
        <h2>No tags yet</h2>
        <p>
          Once your photos are analyzed, their tags will appear here floating in
          a 2D semantic space.
        </p>
      </div>
    </div>

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

    <!-- Config Panel -->
    <TagCloudConfigPanel
      v-if="tags.length > 0"
      v-model:minPhotoCount="minPhotoCount"
      v-model:limit="limit"
      v-model:showDots="showDots"
      :tagCount="tags.length"
      :totalCandidates="metadata?.totalCandidates ?? null"
      @filters-changed="onFiltersChanged"
      @reset-view="resetView"
    />

    <!-- Hover tooltip: full (visible label) -->
    <div
      v-if="hoveredTag"
      class="tag-tooltip"
      :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
    >
      <div class="tt-name">{{ hoveredTag.name }}</div>
      <div class="tt-meta">
        <span class="tt-group">{{ hoveredTag.group }}</span>
        <span class="tt-count">{{ hoveredTag.photoCount }} photos</span>
      </div>
    </div>

    <!-- Hover tooltip: compact (dot without visible label) -->
    <div
      v-else-if="dotTooltipTag"
      class="tag-tooltip tooltip-compact"
      :style="{ left: dotTooltipPos.x + 'px', top: dotTooltipPos.y + 'px' }"
    >
      {{ dotTooltipTag.name }}
    </div>

    <!-- Zoom Controls -->
    <div class="zoom-controls">
      <button v-if="!isMobile" @click="zoomIn" class="zoom-btn" title="Zoom In">
        <n-icon size="18">
          <ZoomInOutlined />
        </n-icon>
      </button>
      <!-- <span class="zoom-level">{{ Math.round(camera.scale * 100) }}%</span> -->
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
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { NIcon } from "naive-ui";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
} from "@vicons/antd";
import * as PIXI from "pixi.js";
import { api } from "@/utils/axios";
import { isMobileDevice } from "@/utils/utils.js";
import TagCloudConfigPanel from "./TagCloudConfigPanel.vue";

const emit = defineEmits(["tags-selected"]);

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------
const containerRef = ref(null);
const pixiContainer = ref(null);
const loading = ref(true);
const loadingMessage = ref("Loading tag cloud…");
const error = ref(null);
const tags = ref([]); // raw tags from backend, sorted by photoCount desc
const metadata = ref(null);
const hoveredTag = ref(null); // visible-label hover → full tooltip + forces label placement
const tooltipPos = ref({ x: 0, y: 0 });
const dotTooltipTag = ref(null); // dot hover (no visible label) → compact tooltip, does NOT trigger label relayout
const dotTooltipPos = ref({ x: 0, y: 0 });
const isMobile = ref(isMobileDevice());
const selectionRect = ref(null); // { x, y, w, h } in canvas-relative px

// Filters
const minPhotoCount = ref(1);
const limit = ref(10000);
const showDots = ref(true);

// ---------------------------------------------------------------------------
// PIXI handles & layout state
// ---------------------------------------------------------------------------
let app = null;
let world = null; // contains the dot layer; transformed by camera
let dotsGraphics = null; // single Graphics with all dots
let labelsContainer = null; // screen-space labels
let labelsByIndex = new Map(); // persistent labels keyed by tag index

// Parallel typed arrays (indexed like `tags.value`)
let positions = null; // Float32Array [x0,y0,...]
let dotRadii = null; // Float32Array
let dotColors = null; // Uint32Array

// Camera
const camera = { x: 0, y: 0, scale: 1 };
const targetCamera = { x: 0, y: 0, scale: 1 };
const minScale = 0.05;
const maxScale = 120;
let baseScale = 1;
const ZOOM_SENSITIVITY = 0.0035;
const CAMERA_LERP = 0.18;
const CAMERA_EPSILON = 0.001;
const LABEL_FADE_IN = 0.5;
const LABEL_FADE_OUT = 0.3;
const LABEL_HIDE_THRESHOLD = 0.03;
const TAG_INTERACTION_MODE = "label-highlight"; // "dot-tooltip" | "label-highlight"
const LABEL_HIGHLIGHT_TINT = 0x06b6d4;

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

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
let filterDebounceTimer = null;

const loadTags = async () => {
  loading.value = true;
  loadingMessage.value = "Generating tag cloud…";
  error.value = null;
  try {
    const { data } = await api.post("/api/tagcloud/2d", {
      outputDims: 2,
      minPhotoCount: Math.max(1, minPhotoCount.value || 1),
      limit: Math.max(100, limit.value || 8000),
    });
    const incoming = (data?.tags || []).filter(
      (t) => Array.isArray(t.coordinates) && t.coordinates.length >= 2,
    );
    incoming.sort((a, b) => (b.photoCount || 0) - (a.photoCount || 0));
    tags.value = incoming;
    metadata.value = data?.metadata || null;
    hoveredTag.value = null;
    setHoveredLabelIndex(-1);
    selectedTagIds = new Set();
    await nextTick();
    if (app) {
      clearLabels();
      buildScene();
      resetView();
    }
  } catch (err) {
    console.error("[TagCloud] Failed to load tags:", err);
    error.value =
      err?.response?.data?.message || err.message || "Failed to load tag cloud";
  } finally {
    loading.value = false;
  }
};

const onFiltersChanged = () => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => loadTags(), 300);
};

watch(showDots, (val) => {
  if (dotsGraphics) dotsGraphics.visible = val;
});

watch(hoveredTag, () => {
  scheduleLabelUpdate();
});

// ---------------------------------------------------------------------------
// PIXI init
// ---------------------------------------------------------------------------
const initPixi = async () => {
  if (!pixiContainer.value) return;

  app = new PIXI.Application();
  await app.init({
    resizeTo: pixiContainer.value,
    background: 0x0d0d12,
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
      console.warn("[TagCloud] destroy error", e);
    }
    app = null;
    world = null;
    dotsGraphics = null;
    labelsContainer = null;
    labelsByIndex = new Map();
    hoveredLabelIndex = -1;
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

  const N = tags.value.length;
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
  for (const t of tags.value) {
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

  positions = new Float32Array(N * 2);
  dotRadii = new Float32Array(N);
  dotColors = new Uint32Array(N);

  for (let i = 0; i < N; i++) {
    const t = tags.value[i];
    positions[i * 2] = (t.coordinates[0] - cx) * worldScale;
    positions[i * 2 + 1] = (t.coordinates[1] - cy) * worldScale;

    const norm = (t.photoCount - minCount) / countSpan;
    const sized = Math.sqrt(norm); // compress dynamic range
    dotRadii[i] = 1.5 + sized * 5; // 1.5..6.5
    dotColors[i] = GROUP_COLORS[t.group] || DEFAULT_COLOR;
  }

  // Group circles by color and draw all of them in a single Graphics
  // (fewer style switches => fewer batches).
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

  baseScale = 1;
  dotsGraphics.visible = showDots.value;
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const applyCamera = () => {
  if (!world) return;
  world.x = camera.x;
  world.y = camera.y;
  world.scale.set(camera.scale, camera.scale);
  scheduleLabelUpdate();
};

const syncTargetCamera = () => {
  targetCamera.x = camera.x;
  targetCamera.y = camera.y;
  targetCamera.scale = camera.scale;
};

const resetView = () => {
  if (!app) return;
  camera.scale = baseScale;
  camera.x = app.renderer.width / 2;
  camera.y = app.renderer.height / 2;
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

const onTick = () => {
  if (!app) return;

  const delta = Math.max(1, app.ticker.deltaTime);
  const lerpFactor = 1 - Math.pow(1 - CAMERA_LERP, delta);
  let cameraChanged = false;

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

  if (cameraChanged) {
    applyCamera();
  }

  updateLabelAlphas();
};

// ---------------------------------------------------------------------------
// Labels: collision-aware, viewport-culled, capped count
// ---------------------------------------------------------------------------
const BASE_MAX_VISIBLE_LABELS = 250;
const MAX_MAX_VISIBLE_LABELS = 1400;
let labelUpdateRaf = null;

const scheduleLabelUpdate = () => {
  if (labelUpdateRaf) return;
  labelUpdateRaf = requestAnimationFrame(() => {
    labelUpdateRaf = null;
    updateLabels();
  });
};

const getOrCreateLabel = (index) => {
  let label = labelsByIndex.get(index);
  if (label) return label;

  label = new PIXI.Text({
    text: "",
    style: {
      // fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 13,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, alpha: 0.7 },
      align: "center",
    },
  });
  label.anchor.set(0.5, 0.5);
  label.eventMode = "none";
  label.alpha = 0;
  label.visible = false;
  label.targetAlpha = 0;
  label.tint = 0xffffff;
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
      tags.value[index] != null &&
      selectedTagIds.has(tags.value[index].id);

    label.tint = isHovered || isSelected ? LABEL_HIGHLIGHT_TINT : 0xffffff;
    label.scale.set(isHovered ? 1.04 : 1);
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
    app.canvas.style.cursor = "pointer";
    return;
  }
  app.canvas.style.cursor = "grab";
};

const updateLabelAlphas = () => {
  for (const label of labelsByIndex.values()) {
    const targetAlpha = label.targetAlpha ?? 0;
    if (targetAlpha > 0 && !label.visible) {
      label.visible = true;
    }

    const fadeSpeed =
      targetAlpha > label.alpha ? LABEL_FADE_IN : LABEL_FADE_OUT;
    const nextAlpha = label.alpha + (targetAlpha - label.alpha) * fadeSpeed;
    label.alpha =
      Math.abs(targetAlpha - nextAlpha) < 0.01 ? targetAlpha : nextAlpha;

    if (targetAlpha === 0 && label.alpha <= LABEL_HIDE_THRESHOLD) {
      label.alpha = 0;
      label.visible = false;
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
  return tags.value.findIndex((tag) => tag.id === hoveredTag.value.id);
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

const placeLabelAtIndex = (index, grid, cellKey, cellSize, force = false) => {
  if (index < 0 || index >= tags.value.length) return false;

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

  const rankRatio = index / Math.max(1, tags.value.length);
  const t = tags.value[index];
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

const updateLabels = () => {
  hideAllLabels();
  if (!app || !positions || tags.value.length === 0) return;

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

  const N = tags.value.length;
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
};

// ---------------------------------------------------------------------------
// Hover hit-testing (manual; ~22k iterations is fine)
// ---------------------------------------------------------------------------
const HOVER_RADIUS_PX = 14;

const findTagAtScreen = (sx, sy) => {
  if (!positions) return -1;
  const N = tags.value.length;
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
      out.push(tags.value[index]);
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
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);
};

const unbindInteractions = () => {
  if (!app) return;
  const canvas = app.canvas;
  canvas.removeEventListener("wheel", onWheel);
  canvas.removeEventListener("pointerdown", onPointerDown);
  canvas.removeEventListener("pointermove", onCanvasPointerMove);
  canvas.removeEventListener("pointerleave", onCanvasPointerLeave);
  canvas.removeEventListener("click", onCanvasClick);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("resize", onResize);
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

  // Ctrl/Cmd + drag → start rectangle selection
  if (e.ctrlKey || e.metaKey) {
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

const emitTagsSelected = (selectedTags) => {
  selectedTagIds = new Set(selectedTags.map((t) => t.id));
  syncLabelInteractionStates();
  emit("tags-selected", selectedTags);
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
        emitTagsSelected(found);
      }
    } else if (r && e) {
      // Treat as a click on a single visible label
      const { x, y } = getCanvasPoint(e.clientX, e.clientY);
      const idx = findVisibleLabelAtScreen(x, y);
      if (idx >= 0) {
        emitTagsSelected([tags.value[idx]]);
      }
    }
    updateCanvasCursor();
    return;
  }
  isPanning = false;
  updateCanvasCursor();
};

const onCanvasPointerMove = (e) => {
  if (isPanning || isSelecting) return;
  if (!app) return;
  const rect = app.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const labelIndex = findVisibleLabelAtScreen(sx, sy);
  setHoveredLabelIndex(labelIndex);

  if (labelIndex >= 0) {
    // Hovering a visible label → full tooltip + forces label placement via watch
    hoveredTag.value = tags.value[labelIndex];
    tooltipPos.value = { x: sx + 14, y: sy + 14 };
    dotTooltipTag.value = null;
    return;
  }

  // Clear full tooltip immediately so label layout isn't disturbed
  hoveredTag.value = null;

  // Hovering a dot whose label isn't visible at this zoom → compact tooltip only
  // (dotTooltipTag is NOT watched, so label layout is untouched)
  const dotIdx = findTagAtScreen(sx, sy);
  if (dotIdx >= 0) {
    dotTooltipTag.value = tags.value[dotIdx];
    dotTooltipPos.value = { x: sx + 5, y: sy + 5 };
    return;
  }

  dotTooltipTag.value = null;
};

const onCanvasPointerLeave = () => {
  hoveredTag.value = null;
  dotTooltipTag.value = null;
  setHoveredLabelIndex(-1);
};

const onCanvasClick = (e) => {
  if (!app) return;
  // Ignore the click that follows a Ctrl/Cmd-drag selection
  if (e.ctrlKey || e.metaKey) return;
  const rect = app.canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  // Visible label takes priority; fall back to dot hit-test
  const labelIndex = findVisibleLabelAtScreen(sx, sy);
  const index = labelIndex >= 0 ? labelIndex : findTagAtScreen(sx, sy);
  if (index >= 0) {
    emitTagsSelected([tags.value[index]]);
  }
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
  await loadTags();
});

onBeforeUnmount(() => {
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
  if (labelUpdateRaf) cancelAnimationFrame(labelUpdateRaf);
  unbindInteractions();
  destroyPixi();
});

defineExpose({
  clearSelection,
});
</script>

<style scoped>
.tag-cloud-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-base, #0d0d12);
  color: var(--text-primary, #fff);
}

.pixi-container {
  position: absolute;
  inset: 0;
  cursor: grab;
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

.state-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  background: var(--bg-overlay, rgba(13, 13, 18, 0.85));
}

.state-content {
  text-align: center;
  max-width: 420px;
  padding: 40px;
}

.state-content h2 {
  margin: 0 0 12px 0;
  font-size: 1.4em;
  color: var(--text-primary, #f3f4f6);
}

.state-content p {
  margin: 0 0 20px 0;
  color: var(--text-secondary, #d1d5db);
  line-height: 1.5;
}

.primary-btn {
  background: var(--primary-color, #3b82f6);
  color: var(--text-on-primary, #fff);
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
}

.primary-btn:hover {
  background: var(--primary-color-hover, #2563eb);
  transform: translateY(-1px);
}

.discrete-loader {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-container, rgba(26, 26, 31, 0.95));
  backdrop-filter: blur(12px);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
  box-shadow: var(--shadow-md);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
  z-index: 20;
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
}

.tt-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.tt-meta {
  display: flex;
  gap: 10px;
  color: var(--text-secondary, #9ca3af);
}

.tt-group {
  text-transform: capitalize;
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
</style>
