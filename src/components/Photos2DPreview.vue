<template>
  <div class="photos-preview-container" ref="containerRef">
    <!-- Error State -->
    <div v-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <!-- Active Loading Indicator -->
    <div v-else-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading Photoreka Universe...</p>
    </div>

    <!-- PixiJS Canvas -->
    <div ref="pixiContainer" class="pixi-container"></div>

    <!-- Minimal Controls Overlay -->
    <div
      class="preview-controls-overlay"
      v-if="loadedPhotosCount > 0 && !isLoading && !error"
    >
      <button @click="zoomIn" class="ctrl-btn" title="Zoom In">
        <n-icon size="16">
          <ZoomInOutlined />
        </n-icon>
      </button>
      <button @click="zoomOut" class="ctrl-btn" title="Zoom Out">
        <n-icon size="16">
          <ZoomOutOutlined />
        </n-icon>
      </button>
      <button
        @click="() => resetView(true)"
        class="ctrl-btn"
        title="Fit Layout / Reset View"
      >
        <n-icon size="16">
          <FullscreenOutlined />
        </n-icon>
      </button>

      <!-- Sync Status Badge (Optional / subtle indication if we are loading delta) -->
      <span v-if="isSyncing" class="sync-badge">Syncing...</span>
    </div>

    <!-- Tag Beacons overlay -->
    <div
      v-if="
        tagBeaconsSystem.config.value.enabled &&
        tagBeaconsSystem.visibleBeacons.value.length > 0
      "
      class="tag-beacons-wrapper"
    >
      <div
        v-for="beacon in tagBeaconsSystem.visibleBeacons.value"
        :key="beacon.key"
        class="tag-beacon"
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

    <!-- Discrete float button to go to full 2D model -->
    <div class="atlas-launch-wrapper" v-if="loadedPhotosCount > 0">
      <button class="launch-atlas-btn" @click="goToFullAtlas">
        <n-icon size="14">
          <LayersOutline />
        </n-icon>
        <span>View 2D Atlas</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  nextTick,
  watch,
} from "vue";
import { useRouter } from "vue-router";
import { NIcon } from "naive-ui";
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
} from "@vicons/antd";
import { LayersOutline } from "@vicons/ionicons5";
import * as PIXI from "pixi.js";

import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore";
import { use2DPhotos } from "@/composables/2d-viewer/use2DPhotos.js";
import { use2DTextureManager } from "@/composables/2d-viewer/use2DTextureManager.js";
import { use2DLayoutCache } from "@/composables/2d-viewer/use2DLayoutCache.js";
import { useTagBeacons2D } from "@/composables/2d-viewer/useTagBeacons2D.js";
import { useTheme } from "@/composables/useTheme.js";

defineOptions({
  name: "Photos2DPreview",
});

const router = useRouter();
const photosStore = usePhotosStore();
const userStore = useUserStore();
const { isDarkMode } = useTheme();
const { getLayoutFromCache, saveLayoutToCache, checkSyncStatus } =
  use2DLayoutCache();

// Standard props / composables
const { photos2D, isLoadingPositions, loadAllPhotos } = use2DPhotos(null, true);
const textureManager = use2DTextureManager(true, false);

// DOM and PixiJS Refs
const containerRef = ref<HTMLElement | null>(null);
const pixiContainer = ref<HTMLElement | null>(null);
const pixiApp = shallowRef<PIXI.Application | null>(null);
const photoContainer = shallowRef<PIXI.Container | null>(null);

// Performance / scale parameters (simplified compared to full Photos2D.vue)
const photoSize = ref(60); // smaller sprites for dashboard
const SCALE_FACTOR = 50;
const MIN_SCALE = 0.01;
const MAX_SCALE = 6;
const ZOOM_SENSITIVITY = 0.0015;

const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);

// Tag Beacons – use photos2D directly as filtered source (no extra filtering in preview)
// Config values are exposed and can be tweaked directly here.
const tagBeaconsSystem = useTagBeacons2D(
  photos2D,
  pixiContainer,
  scale,
  offsetX,
  offsetY,
  SCALE_FACTOR,
  "general", // cluster type (matches the default loadAllPhotos chunk)
);
// Sensible defaults for the dashboard preview (fewer beacons, cleaner look)
tagBeaconsSystem.config.value.enabled = true;
tagBeaconsSystem.config.value.maxBeacons = 25;
tagBeaconsSystem.config.value.topTagsPerCell = 1;
tagBeaconsSystem.config.value.cellSize = 50;
tagBeaconsSystem.config.value.minPhotosInCell = 3;
tagBeaconsSystem.config.value.minDominantTagPhotos = 1;
tagBeaconsSystem.config.value.minDominantShare = 0.06;
tagBeaconsSystem.config.value.mergeSameTagRadius = 90;
tagBeaconsSystem.config.value.recomputeInterval = 3000;

// Interaction States
const isDragging = ref(false);
const lastPointerPosition = ref({ x: 0, y: 0 });
const isPinching = ref(false);
const lastPinchDistance = ref(0);
const lastPinchWorld = ref({ x: 0, y: 0 });

// View States
const isLoading = ref(true);
const isSyncing = ref(false);
const error = ref<string | null>(null);
const loadedPhotosCount = ref(0);

// Color palette for tag-based photo coloring
const PALETTE = [
  0x6e5adc, 0x4a8fe0, 0x5ec97e, 0xf0a033, 0xe05c5c, 0x9b59b6, 0x26bba4,
  0xe8744a, 0x3a9bd5, 0xc0ca33,
];

const hashTagsToColor = (tags: string[] | undefined): number => {
  if (!tags || tags.length === 0) return 0x3a3060;
  let h = 0;
  const tag = tags[0];
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
};

// Camera zoom interpolation properties (simplifies zoom action)
const targetCamera = { x: 0, y: 0, scale: 1 };
const CAMERA_LERP = 0.15;
const CAMERA_EPSILON = 0.01;
let animationFrameId: number | null = null;
let lastAnimationTick = 0;

const currentUserId = computed(() => userStore.user?.id || null);
const processedPhotos = computed(() => photosStore.processedPhotos || []);

const ensureUserScopeReady = async () => {
  if (currentUserId.value) return currentUserId.value;
  if (!userStore.isInitialized) {
    try {
      await userStore.initAuth();
    } catch (_) {}
  }
  return userStore.user?.id || null;
};

// Zoom mapping clamp
const clampScale = (value: number) => {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
};

const screenToWorld = (screenX: number, screenY: number, scl = scale.value) => {
  const s = scl || 1;
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
  screenX: number,
  screenY: number,
  newScaleRaw: number,
  cameraState: any = null,
) => {
  const currentX = cameraState ? cameraState.x : offsetX.value;
  const currentY = cameraState ? cameraState.y : offsetY.value;
  const oldScale = (cameraState ? cameraState.scale : scale.value) || 1;
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

const updateContainerTransform = () => {
  if (!photoContainer.value) return;
  photoContainer.value.x = offsetX.value;
  photoContainer.value.y = offsetY.value;
  photoContainer.value.scale.set(scale.value);
};

// Check if animation should keep ticking
const hasPendingCameraAnimation = () => {
  return (
    Math.abs(targetCamera.x - offsetX.value) > CAMERA_EPSILON ||
    Math.abs(targetCamera.y - offsetY.value) > CAMERA_EPSILON ||
    Math.abs(targetCamera.scale - scale.value) > CAMERA_EPSILON
  );
};

// Linear camera transitions
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

  return true;
};

// Simple loop ticker
const animationLoop = (currentTime: number) => {
  const previousTick = lastAnimationTick || currentTime;
  const deltaFrames = Math.max(1, (currentTime - previousTick) / (1000 / 60));
  lastAnimationTick = currentTime;

  let shouldContinue = false;

  if (hasPendingCameraAnimation()) {
    updateCameraTowardsTarget(deltaFrames);
    updateContainerTransform();
    shouldContinue = true;
  }

  if (shouldContinue) {
    animationFrameId = requestAnimationFrame(animationLoop);
  } else {
    animationFrameId = null;
    lastAnimationTick = 0;
  }
};

const startAnimationLoop = () => {
  if (!animationFrameId) {
    lastAnimationTick = 0;
    animationFrameId = requestAnimationFrame(animationLoop);
  }
};

onMounted(async () => {
  window.addEventListener("resize", handleResize);
  tagBeaconsSystem.startUpdateLoop();
  await nextTick();

  const cacheUserId = await ensureUserScopeReady();

  // 1. First try to load from front-end cache immediately
  const cachedData = cacheUserId
    ? getLayoutFromCache("general", cacheUserId)
    : null;

  if (cachedData && cachedData.photos && cachedData.photos.length > 0) {
    console.log(
      `✨ [2DPreview] Instant layout load from cache. Total photos: ${cachedData.photos.length}`,
    );

    // Convert cached format back into photos2D compatible format
    photos2D.value = cachedData.photos.map((p: any) => {
      const storePhoto = photosStore.processedPhotos?.find(
        (sp: any) => String(sp.id) === String(p.id)
      );
      const thumbUrl = storePhoto?.thumbnailUrl || storePhoto?.url || p.thumb || null;
      return {
        id: p.id,
        position: p.pos,
        thumbnailUrl: thumbUrl,
        url: thumbUrl,
        tags: Array.isArray(p.tags) ? p.tags : (storePhoto?.tags || []),
      };
    });

    isLoading.value = false;
    loadedPhotosCount.value = photos2D.value.length;

    // Initialize PIXI and render
    await initPixi();
    resetView(false);
    await loadTextures();

    // Background update if needed
    triggerLazySync(cachedData);
  } else {
    // 2. Fetch fresh layout since cache is empty
    console.log("⚡ [2DPreview] Cache empty. Loading fresh layout...");
    await loadFreshUniverse();
  }
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  tagBeaconsSystem.reset();
  cleanup();
});

// Load the fresh data and cache it
const loadFreshUniverse = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Limit dashboard preview to 2000 photos for lightweight memory & faster drawing
    await loadAllPhotos("general", false, 2000);

    if (photos2D.value && photos2D.value.length > 0) {
      loadedPhotosCount.value = photos2D.value.length;
      isLoading.value = false;

      // Save newly fetched layout map to Cache for next dashboard visit!
      if (currentUserId.value) {
        saveLayoutToCache(photos2D.value, "general", currentUserId.value);
      }

      await initPixi();
      resetView(false);
      await loadTextures();
    } else {
      error.value = "Awaiting photos in workspace";
      isLoading.value = false;
    }
  } catch (err: any) {
    console.error("❌ Error loading fresh universe:", err);
    error.value = "Awaiting photos in workspace";
    isLoading.value = false;
  }
};

// Lazy comparison sync with store (compares what's inside Vuex/Pinia photos store vs Cache)
const triggerLazySync = async (cachedData: any) => {
  // Let the store initialize if not loaded yet
  if (!photosStore.isInitialized) {
    try {
      await photosStore.getOrFetch(false);
    } catch (_) {
      return;
    }
  }

  const storePhotos = processedPhotos.value;
  if (!storePhotos || storePhotos.length === 0) return;

  // Decide whether a sync is needed based on IDs mismatch
  const inSync = checkSyncStatus(cachedData.photos, storePhotos);

  if (!inSync) {
    console.log(
      "♻️ [2DPreview] Cache is out of sync with Pinia store! Triggering slow/lazy background update...",
    );
    isSyncing.value = true;

    // Run after a small delay to avoid fighting with initial render animations
    setTimeout(async () => {
      try {
        // Fetch up-to-date coordinate coordinates from backend & perform layout and snap & relaxation
        await loadAllPhotos("general", false, 2000);

        if (photos2D.value && photos2D.value.length > 0) {
          loadedPhotosCount.value = photos2D.value.length;
          // Cache the layout
          if (currentUserId.value) {
            saveLayoutToCache(photos2D.value, "general", currentUserId.value);
          }

          await loadTextures();
          resetView(true);
        }
      } catch (err) {
        console.warn("⚠️ Background layout sync failed (non-fatal):", err);
      } finally {
        isSyncing.value = false;
      }
    }, 4000);
  } else {
    // Cache is in sync, but we might have initialized without Pinia store photos being available.
    // Let's trigger a loadTextures call now that the Pinia store is fully available,
    // so any photos that were missing `thumb` in local storage cache (due to base64 exclusion)
    // can now resolve their image URLs from the store and display properly!
    console.log("🔗 [2DPreview] Cache is in sync with Pinia store. Making sure all thumbnail URLs are populated...");
    let updatedAny = false;
    for (const photo of photos2D.value) {
      if (!photo.thumbnailUrl || !photo.url) {
        const storePhoto = storePhotos.find((sp: any) => String(sp.id) === String(photo.id));
        if (storePhoto) {
          photo.thumbnailUrl = storePhoto.thumbnailUrl || storePhoto.url;
          photo.url = storePhoto.thumbnailUrl || storePhoto.url;
          updatedAny = true;
        }
      }
    }
    if (updatedAny) {
      await loadTextures();
    }
  }
};

// Initialize Simplistic PixiJS
const initPixi = async () => {
  if (!pixiContainer.value) return;

  const app = new PIXI.Application();

  // High efficiency context parameters
  await app.init({
    background: isDarkMode.value ? 0x06060e : 0xf2f2f7,
    resizeTo: pixiContainer.value,
    antialias: false,
    resolution: 1, // Cap at low density for instant performance on dashboard
    autoDensity: true,
  });

  pixiContainer.value.appendChild(app.canvas);
  pixiApp.value = app;

  const container = new PIXI.Container();
  container.sortableChildren = false;
  app.stage.addChild(container);
  photoContainer.value = container;

  setupInteraction(app);
};

// Load textures and draw the photos layout
const loadTextures = async () => {
  if (!photoContainer.value || !pixiApp.value) return;

  try {
    // Clear previous children and any textures/sprites inside the container
    const currentChildren = photoContainer.value.children.slice();
    photoContainer.value.removeChildren();
    for (const child of currentChildren) {
      try {
        child.destroy({ texture: false });
      } catch (_) {}
    }

    const photosToLoad = photos2D.value;
    if (!photosToLoad.length) {
      loadedPhotosCount.value = 0;
      return;
    }

    await textureManager.initDB();

    // Solid gray placeholder texture
    const pG = new PIXI.Graphics();
    pG.rect(0, 0, photoSize.value, photoSize.value * 0.75);
    pG.fill({ color: 0x1c1c24 });
    const placeholderTexture = pixiApp.value.renderer.generateTexture(pG);
    pG.destroy();

    // Build the sprites inside the single container / layer
    const w = photoSize.value;
    const h = Math.round(w * 0.75);

    // Create the Sprites
    const sprites: PIXI.Sprite[] = [];
    for (const photo of photosToLoad) {
      const [x, y] = photo.position || [0, 0];
      const canvasX = x * SCALE_FACTOR;
      const canvasY = y * SCALE_FACTOR;

      const sprite = new PIXI.Sprite(placeholderTexture);
      sprite.anchor.set(0.5);
      sprite.x = canvasX;
      sprite.y = canvasY;
      sprite.width = w;
      sprite.height = h;

      photoContainer.value.addChild(sprite);
      sprites.push(sprite);
    }

    loadedPhotosCount.value = photosToLoad.length;

    // Load actual thumbnails in background batches
    const batchSize = 100;
    for (let i = 0; i < photosToLoad.length; i += batchSize) {
      const batch = photosToLoad.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (photo: any, index: number) => {
          const spriteIdx = i + index;
          const sprite = sprites[spriteIdx];
          if (!sprite || sprite.destroyed) return;

          // If the photo object doesn't have thumbnailUrl, check the Pinia store fallback
          if (!photo.thumbnailUrl || !photo.url) {
            const storePhoto = photosStore.processedPhotos?.find(
              (sp: any) => String(sp.id) === String(photo.id)
            );
            if (storePhoto) {
              photo.thumbnailUrl = storePhoto.thumbnailUrl || storePhoto.url;
              photo.url = storePhoto.thumbnailUrl || storePhoto.url;
            }
          }

          // Request the texture from textureManager
          const texture = await textureManager.getOrCreateTexture(photo, {
            quality: "thumb",
            maxSide: 120, // smallest thumbnails
          });

          if (texture && !sprite.destroyed) {
            sprite.texture = texture;
            const ar = texture.height / texture.width;
            sprite.width = w;
            sprite.height = Math.round(w * ar);
          }
        }),
      );

      // Clean up DOM references
      textureManager.freeSourceImageCache(batch);

      // Yield back control to browser events
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    try {
      placeholderTexture.destroy(true);
    } catch (_) {}
  } catch (err) {
    console.error("❌ Error loading photo preview textures:", err);
  }
};

// Simplified interactions
const setupInteraction = (app: PIXI.Application) => {
  const canvas = app.canvas;

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });

  // Touch triggers
  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", handleTouchEnd);
};

const handleMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return;
  isDragging.value = true;
  lastPointerPosition.value = { x: e.clientX, y: e.clientY };
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const dx = e.clientX - lastPointerPosition.value.x;
  const dy = e.clientY - lastPointerPosition.value.y;

  offsetX.value += dx;
  offsetY.value += dy;

  lastPointerPosition.value = { x: e.clientX, y: e.clientY };
  updateContainerTransform();
  syncTargetCamera();
};

const handleMouseUp = () => {
  isDragging.value = false;
};

const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  if (!pixiContainer.value) return;

  const rect = pixiContainer.value.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
  const newScale = clampScale(targetCamera.scale * factor);

  if (applyZoomAboutScreenPoint(mouseX, mouseY, newScale, targetCamera)) {
    startAnimationLoop();
  }
};

// Simplistic multi-touch pinch-to-zoom
const handleTouchStart = (e: TouchEvent) => {
  e.preventDefault();
  const touches = e.touches;

  if (touches.length === 1) {
    isDragging.value = true;
    lastPointerPosition.value = {
      x: touches[0].clientX,
      y: touches[0].clientY,
    };
  } else if (touches.length === 2) {
    isPinching.value = true;
    isDragging.value = false;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    lastPinchDistance.value = Math.sqrt(dx * dx + dy * dy);

    const midX = (touches[0].clientX + touches[1].clientX) / 2;
    const midY = (touches[0].clientY + touches[1].clientY) / 2;

    if (pixiContainer.value) {
      const rect = pixiContainer.value.getBoundingClientRect();
      const localX = midX - rect.left;
      const localY = midY - rect.top;
      lastPinchWorld.value = screenToWorld(localX, localY);
    }
  }
};

const handleTouchMove = (e: TouchEvent) => {
  e.preventDefault();
  const touches = e.touches;

  if (isPinching.value && touches.length === 2) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const prevDist = lastPinchDistance.value || dist || 1;
    const pinchScale = dist / prevDist;

    const oldScale = scale.value;
    const newScale = clampScale(oldScale * pinchScale);
    scale.value = newScale;

    if (pixiContainer.value) {
      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;
      const rect = pixiContainer.value.getBoundingClientRect();
      const localX = midX - rect.left;
      const localY = midY - rect.top;

      const worldAnchor = lastPinchWorld.value;
      offsetX.value = localX - worldAnchor.x * newScale;
      offsetY.value = localY - worldAnchor.y * newScale;
    }

    lastPinchDistance.value = dist;
    updateContainerTransform();
    syncTargetCamera();
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
  }
};

const handleTouchEnd = (e: TouchEvent) => {
  if (e.touches.length === 1) {
    isPinching.value = false;
    isDragging.value = true;
    const t = e.touches[0];
    lastPointerPosition.value = { x: t.clientX, y: t.clientY };
  } else {
    isDragging.value = false;
    isPinching.value = false;
  }
};

// Fit to bounds
const resetView = (animate = true) => {
  if (!pixiContainer.value || photos2D.value.length === 0) return;

  const target = photos2D.value;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  target.forEach((photo: any) => {
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

  const scaleX = containerWidth / (boundsWidth + 50);
  const scaleY = containerHeight / (boundsHeight + 50);
  const targetScale = Math.min(scaleX, scaleY, 0.8);

  const targetOffsetX = containerWidth / 2 - centerX * targetScale;
  const targetOffsetY = containerHeight / 2 - centerY * targetScale;

  if (!animate) {
    scale.value = targetScale;
    offsetX.value = targetOffsetX;
    offsetY.value = targetOffsetY;
    syncTargetCamera();
    updateContainerTransform();
    return;
  }

  // Linear target glide
  targetCamera.x = targetOffsetX;
  targetCamera.y = targetOffsetY;
  targetCamera.scale = targetScale;
  startAnimationLoop();
};

const zoomIn = () => {
  if (!pixiContainer.value) return;
  const cx = pixiContainer.value.clientWidth / 2;
  const cy = pixiContainer.value.clientHeight / 2;
  if (
    applyZoomAboutScreenPoint(cx, cy, targetCamera.scale * 1.3, targetCamera)
  ) {
    startAnimationLoop();
  }
};

const zoomOut = () => {
  if (!pixiContainer.value) return;
  const cx = pixiContainer.value.clientWidth / 2;
  const cy = pixiContainer.value.clientHeight / 2;
  if (
    applyZoomAboutScreenPoint(cx, cy, targetCamera.scale / 1.3, targetCamera)
  ) {
    startAnimationLoop();
  }
};

const handleResize = () => {
  if (pixiApp.value && pixiContainer.value) {
    pixiApp.value.renderer.resize(
      pixiContainer.value.clientWidth,
      pixiContainer.value.clientHeight,
    );
    resetView(false);
  }
};

const goToFullAtlas = () => {
  router.push({ name: "2d-view" });
};

const cleanup = () => {
  if (photoContainer.value) {
    photoContainer.value.removeChildren().forEach((child) => {
      try {
        child.destroy({ texture: false });
      } catch (_) {}
    });
  }

  if (pixiApp.value) {
    pixiApp.value.destroy(true, { children: true, texture: true });
    pixiApp.value = null;
  }
  photoContainer.value = null;
  textureManager.reset({ destroyTextures: true });
};

// Keep background synchronized with color shifts
watch(isDarkMode, (newDark) => {
  if (pixiApp.value) {
    pixiApp.value.renderer.background.color = newDark ? 0x06060e : 0xf2f2f7;
  }
});

// Re-project beacons on pan / zoom (cheap – no re-cluster)
watch(
  () => [scale.value, offsetX.value, offsetY.value],
  () => {
    if (
      tagBeaconsSystem.config.value.enabled &&
      tagBeaconsSystem.visibleBeacons.value.length > 0
    ) {
      tagBeaconsSystem.updateScreenPositions();
    }
  },
);
</script>

<style scoped>
.photos-preview-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: #06060e;
}

.pixi-container {
  width: 100%;
  height: 100%;
  display: block;
}

.loading-state,
.error-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #8e8e93);
  z-index: 10;
  background: radial-gradient(
    ellipse at 50% 48%,
    #0c0c22 0%,
    #07071a 35%,
    #030310 70%,
    #010108 100%
  );
  gap: 15px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(110, 90, 220, 0.2);
  border-top-color: var(--primary-color, rgb(110, 90, 220));
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.preview-controls-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(16, 14, 36, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(130, 112, 220, 0.2);
  border-radius: 6px;
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 20;
}

.ctrl-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(184, 168, 255, 0.72);
  border-radius: 4px;
  transition:
    background 0.15s,
    color 0.15s;
}

.ctrl-btn:hover {
  background: rgba(130, 112, 220, 0.2);
  color: #fff;
}

.sync-badge {
  font-size: 9px;
  color: rgba(184, 168, 255, 0.6);
  padding: 0 4px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.05em;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.9;
  }
}

.atlas-launch-wrapper {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 20;
}

.launch-atlas-btn {
  background: rgba(16, 14, 36, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(130, 112, 220, 0.28);
  color: rgba(184, 168, 255, 0.85);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    transform 0.15s;
}

.launch-atlas-btn:hover {
  background: rgba(30, 24, 60, 0.85);
  border-color: rgba(130, 112, 220, 0.5);
  color: #fff;
  transform: translateY(-1px);
}

.launch-atlas-btn:active {
  transform: translateY(0);
}

/* ── Tag Beacons ─────────────────────────────────────── */
.tag-beacons-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}

.tag-beacon {
  position: absolute;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 3px 8px;
  font-size: 10px;
  color: white;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
  white-space: nowrap;
  backdrop-filter: blur(6px);
  user-select: none;
  will-change: transform, opacity;
  pointer-events: none;
}

.tag-beacon::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--beacon-color);
  border-radius: 10px;
  opacity: 0.5;
  z-index: -1;
}

.tag-beacon-label {
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.03em;
}

.tag-beacon-count {
  font-size: 9px;
  opacity: 0.8;
}
</style>
