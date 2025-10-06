<template>
  <div class="photos-3d-container" ref="containerRef">
    <!-- Error Screen -->
    <div v-if="error" class="error-screen">
      <div class="error-content">
        <h2>Error al cargar la visualización 3D</h2>
        <p>{{ error }}</p>
        <button @click="retryLoad" class="retry-btn">Reintentar</button>
      </div>
    </div>

    <!-- 3D Canvas -->
    <TresCanvas v-else v-bind="gl" ref="canvasRef">
      <TresPerspectiveCamera
        ref="cameraRef"
        :position="[0, 0, 120]"
        :fov="75"
        :aspect="cameraAspect"
        :near="1"
        :far="1000"
      />

      <!-- Lighting -->
      <primitive :object="lightsGroup" />

      <!-- LOD Group containing all photo LODs -->
      <primitive :object="lodGroup" />

      <!-- Grid helper -->
      <primitive :object="gridHelper" />
    </TresCanvas>

    <!-- Config Panels (Outside UI Overlay to avoid positioning conflicts) -->
    <!-- Collapsed Panel (Small Corner Button) -->
    <div
      v-if="!showConfigPanel"
      class="collapsed-panel"
      @click="showConfigPanel = true"
      @click.stop
      @touchstart.stop
      @touchmove.stop
      @touchend.stop
    >
      <n-icon class="settings-icon">
        <SettingOutlined />
      </n-icon>
    </div>

    <!-- Expanded Panel Content -->
    <div
      v-if="showConfigPanel"
      class="control-panel"
      @click.stop
      @wheel.stop
      @touchstart.stop
      @touchmove.stop
      @touchend.stop
      :style="{ top: isPlayground ? '15px' : '70px' }"
    >
      <!-- Close Button (Top Right Corner) -->
      <button class="close-panel-btn-corner" @click="showConfigPanel = false">
        <n-icon>
          <CloseOutlined />
        </n-icon>
      </button>

      <!-- Clustering Type Section (Always Visible) -->
      <div class="control-section">
        <h4 class="section-title">Clustering Type</h4>
        <div class="control-item-full">
          <n-select
            :disabled="showDiscreteLoader"
            v-model:value="selectedChunk"
            @update:value="onChunkChange"
            :options="chunkOptions"
            size="small"
            class="embedding-select"
            placeholder="Select embedding type"
            @click.stop
          />
        </div>
      </div>

      <!-- More Filters Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="showMoreFilters = !showMoreFilters">
          <span class="section-toggle-label">Search filters</span>
          <div class="section-toggle-indicators">
            <span
              v-if="
                selectedVisualAspects.length > 0 ||
                selectedArtisticScores.length > 0 ||
                searchResults.length > 0
              "
              class="active-indicator"
            >
              {{
                selectedVisualAspects.length +
                selectedArtisticScores.length +
                (searchResults.length > 0 ? 1 : 0)
              }}
            </span>
            <n-icon
              size="12"
              class="toggle-icon"
              :class="{ rotated: showMoreFilters }"
            >
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
                />
              </svg>
            </n-icon>
          </div>
        </div>

        <!-- Collapsible Filters Container -->
        <div v-if="showMoreFilters" class="filters-container">
          <div class="filters-content">
            <!-- Text Search Filter -->
            <div class="filter-item">
              <div style="display: flex; align-items: center; gap: 4px">
                <label class="filter-label" style="margin: 0"
                  >Search by Content</label
                >
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon size="12" color="#ffffffd1" style="cursor: help">
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Applies a shallow and approximate text-based search
                </n-tooltip>
              </div>
              <n-input
                v-model:value="searchQuery"
                placeholder="Search photos by description..."
                size="small"
                :clearable="!isSearching"
                class="text-search-input"
                @input="onSearchChange"
                @clear="clearSearch"
                @keydown.stop
              >
                <template #prefix>
                  <n-icon size="16">
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                      />
                    </svg>
                  </n-icon>
                </template>
                <template #suffix>
                  <n-spin
                    v-if="isSearching"
                    size="small"
                    class="search-spinner"
                  />
                </template>
              </n-input>
            </div>
            <!-- Visual Aspects Filter -->
            <div class="filter-item">
              <label class="filter-label">Visual Aspects</label>
              <n-tree-select
                v-model:value="selectedVisualAspects"
                multiple
                clearable
                placeholder="Any aspect"
                :options="treeSelectOptions"
                :max-tag-count="2"
                class="aspects-select"
                :disabled="showDiscreteLoader"
                size="small"
                check-strategy="child"
                :show-path="false"
                expand-on-click
                @update:value="onVisualAspectsChange"
                @click.stop
              >
                <template #empty>
                  <div style="padding: 8px; color: #888; font-size: 12px">
                    No visual aspects found
                  </div>
                </template>
              </n-tree-select>
            </div>

            <!-- Artistic Scores Filter -->
            <div class="filter-item">
              <div style="display: flex; align-items: center; gap: 4px">
                <label class="filter-label" style="margin: 0"
                  >Visual Scores</label
                >
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon size="12" color="#ffffffd1" style="cursor: help">
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Will include photos above 7 in the selected scores
                </n-tooltip>
              </div>
              <n-tree-select
                v-model:value="selectedArtisticScores"
                multiple
                clearable
                placeholder="Any"
                :options="createArtisticScoresTreeOptions()"
                :max-tag-count="2"
                class="aspects-select"
                :disabled="showDiscreteLoader"
                size="small"
                check-strategy="child"
                :show-path="false"
                expand-on-click
                @update:value="onArtisticScoresChange"
                @click.stop
              >
                <template #empty>
                  <div style="padding: 8px; color: #888; font-size: 12px">
                    No artistic scores found
                  </div>
                </template>
              </n-tree-select>
            </div>
          </div>
        </div>
      </div>

      <!-- Display Options Toggle -->
      <div class="control-section">
        <div
          class="section-toggle"
          @click="showDisplayOptions = !showDisplayOptions"
        >
          <span class="section-toggle-label">Display Options</span>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showDisplayOptions }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <!-- Display Options Content -->
        <div v-if="showDisplayOptions" class="options-container">
          <!-- Radial Scaling Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Radial Scaling
            </label>
            <div class="slider-container">
              <n-slider
                v-model:value="inflateFactor"
                @update:value="onInflateFactorChange"
                :min="1"
                :max="3"
                :step="0.1"
                :marks="{ 1: '1x', 2: '2x', 3: '3x' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Controls Toggle -->
      <div class="control-section">
        <div
          class="section-toggle"
          @click="showNavigationControls = !showNavigationControls"
        >
          <span class="section-toggle-label">Navigation Controls</span>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showNavigationControls }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <!-- Navigation Controls Content -->
        <div v-if="showNavigationControls" class="controls-info">
          <!-- Desktop Controls -->
          <template v-if="!hasTouch">
            <div class="control-tip">
              <strong>Click on stage:</strong> Activate camera controls
            </div>
            <div class="control-tip">
              <strong>Escape:</strong> Return to normal mouse
            </div>
            <div class="control-tip">
              <strong>WASD:</strong> Navigate forward/back/left/right
            </div>
            <div class="control-tip">
              <strong>Wheel:</strong> Accelerate movement speed
            </div>
            <div class="control-tip"><strong>F:</strong> Move up</div>
            <div class="control-tip"><strong>V:</strong> Move down</div>
          </template>

          <!-- Touch Controls (Mobile) -->
          <template v-else>
            <div class="control-tip">
              <strong>One finger drag:</strong> Rotate camera view
            </div>
            <div class="control-tip">
              <strong>Two finger pinch:</strong> Move forward/backward
            </div>
            <div class="control-tip">
              <strong>Two finger drag:</strong> Move left/right/forward/back
            </div>
            <div class="control-tip">
              <strong>Tip:</strong> Combine gestures for smooth navigation
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Discrete Loading Indicator -->
    <div v-if="showDiscreteLoader" class="discrete-loader">
      <div class="loader-spinner"></div>
      <span class="loader-text">{{ loaderTitle }}</span>
      <span
        v-if="loaderStage === 'downloading' && loadingProgress > 0"
        class="loader-percentage"
        >{{ loadingProgress }}%</span
      >
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  markRaw,
  nextTick,
} from "vue";
import { TresCanvas } from "@tresjs/core";
import { NTooltip, NSelect, NIcon, NSlider, NTreeSelect } from "naive-ui";
import { CloseOutlined, SettingOutlined, InfoCircleFilled } from "@vicons/antd";

import { use3DPhotos } from "@/composables/3d-viewer/use3DPhotos.js";
import { useFirstPersonControls } from "@/composables//3d-viewer/useFirstPersonControls.js";
import { useTouchControls } from "@/composables/3d-viewer/useTouchControls.js";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useIndexedDBCache } from "@/composables/useIndexedDBCache.js";
import { useOctree } from "@/composables/3d-viewer/useOctree.js";
import { useHasTouch } from "@/composables/useHasTouch.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { api } from "@/utils/axios";
import * as THREE from "three";
import pLimit from "p-limit";
// (LOD helpers removidos para mipmaps) - import eliminado definitivamente
// import "@/composables/3d-viewer/useTextureLOD.js"; // Eliminado: no side-effects necesarios
// getMaxVisibleDistance eliminado: ya no ocultamos por distancia, solo opacity fade

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

// Detect mobile device for UI adjustments
const { isMobile } = useIsMobile();
// Detect touch capability for controls
const { hasTouch } = useHasTouch();
// Unified low performance heuristic (mobile OR touch device such as light tablet)
const useLowPerformance = computed(() => isMobile.value || hasTouch.value);

// ===== Debug Flag (wrap noisy logs) =====
const DEBUG_3D = false; // pon a true temporalmente si quieres verbosidad
function dlog(...args) {
  if (DEBUG_3D) console.log(...args);
}

// Initialize showConfigPanel after isMobile is determined
const showConfigPanel = ref(true); // Will be set correctly in onMounted

// ===== Retry Configuration for 429 Errors =====
const MAX_RETRIES = 3; // Maximum number of retry attempts for failed downloads
const INITIAL_RETRY_DELAY = 1000; // Initial delay in ms (exponential backoff)
const RETRY_MULTIPLIER = 2; // Multiplier for exponential backoff
const MAX_RETRY_DELAY = 10000; // Maximum delay between retries (10 seconds)

const FADE_START_ABSOLUTE = 40; // inicio de reducción de opacidad
const FADE_END_ABSOLUTE = 180; // fin de reducción

const MAX_PHOTOS_FOR_BILLBOARD = 5000; // Billboard solo para fotos cercanas

// Stats for monitoring 429 errors
const error429Stats = ref({
  total: 0,
  retried: 0,
  recovered: 0,
  failed: 0,
});

// Composable para manejo de fotos 3D (pasar userId si está en modo catálogo)
const {
  photos3D,
  isLoadingPositions,
  currentChunk,
  error,
  chunkOptions,

  loadAllPhotos,
  changeChunk,
  reset,
} = use3DPhotos(props.catalogUserId, useLowPerformance.value);

// Referencias del DOM y Three.js
const containerRef = ref();
const canvasRef = ref();
const cameraRef = ref();

// Estado del componente
const useBillboarding = ref(true);
// Nota: Distance opacity ahora está pre-establecida en cada nivel LOD (no requiere toggle)
const currentPosition = ref({ x: 0, y: 0, z: 80 });

// Debug mode for octree visualization

// Toggle states for collapsible sections
const showMoreFilters = ref(false);
const showDisplayOptions = ref(false);
const showNavigationControls = ref(true);

// Filtro de aspectos visuales
const selectedVisualAspects = ref([]);

// Filtro de artistic scores
const selectedArtisticScores = ref([]);

// Filtro de búsqueda textual
const searchQuery = ref("");
const isSearching = ref(false);
const searchResults = ref([]);
let searchTimeout = null;

// Loader discreto con progreso
const showDiscreteLoader = ref(true);
const loaderTitle = ref("");
const loaderSubtitle = ref("Preparing your photo collection...");
const loaderStage = ref("loading"); // 'loading' | 'downloading' | 'caching' | 'creating'
const totalPhotosToLoad = ref(0);
const loadedPhotosCount = ref(0);
const loadingProgress = ref(0);
// Fase inicial: reducimos trabajo por frame hasta que se cargue suficiente
const initialLoadingPhase = ref(true);

// Escaleo radial
const inflateFactor = ref(1);
const originalPositions = ref([]);

// (performance mode eliminado)

// Animación de transición
const isTransitioning = ref(false);
const animationStartTime = ref(0);
const TRANSITION_DURATION = 1500; // 1.5 segundos

// Valor local del selector para evitar conflictos con v-model
const selectedChunk = ref(null);

// First Person Controls (keyboard/mouse)
const fpControls = ref(null);
// Touch Controls (mobile)
const touchControls = ref(null);
let animationId = null;

// Aspect ratio dinámico para evitar problemas de resize
const cameraAspect = ref(1);

// Función para actualizar aspect ratio sin disparar recargas
const updateCameraAspect = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    const newAspect = rect.width / rect.height || 1;
    // Solo actualizar si hay un cambio significativo (>5%) para evitar micro-ajustes
    if (Math.abs(cameraAspect.value - newAspect) > 0.05) {
      cameraAspect.value = newAspect;
    }
  }
};

// Canvas configuration - Optimized for memory efficiency and context stability
// IMPORTANTE: NO usar ref() aquí para evitar reactividad que cause re-cargas de fotos
const gl = {
  clearColor: "#1a1a1a",
  antialias: false, // Disabled for better performance with many textures
  powerPreference: "high-performance", // Prioriza GPU dedicada para máximo rendimiento
  forceWebGL: true, // Force WebGL over Canvas 2D
  preserveDrawingBuffer: false, // Better performance
  premultipliedAlpha: false, // Better performance
  stencil: false, // Disable stencil buffer to save memory
  depth: true, // Keep depth buffer for proper rendering
  failIfMajorPerformanceCaveat: false, // Allow software rendering
  pixelRatio: 0.75, // Lower pixel ratio for better performance
  precision: "lowp", // Use low precision shaders for better performance
  logarithmicDepthBuffer: true, // Mejor precisión del z-buffer para escenas grandes
  outputColorSpace: "srgb", // Usar sRGB para mantener colores correctos
};

// Three.js objects - NO LIGHTS needed for MeshBasicMaterial
// MeshBasicMaterial is unlit, lights would cause washing/brightening

// Create empty lights group (mantener para compatibilidad con código existente)
// 🎯 markRaw: Objetos Three.js NO deben ser reactivos para mejor performance
const lightsGroup = markRaw(new THREE.Group());
// NO añadir luces - MeshBasicMaterial no las usa y pueden causar problemas

// Geometry for photo planes - Optimized for GPU
// 🎯 markRaw: Evita que Vue haga este objeto reactivo (mejora de performance)
const planeGeometry = markRaw(new THREE.PlaneGeometry(4, 3));
// Set to not update geometry buffers frequently (GPU optimization)
planeGeometry.attributes.position.setUsage(THREE.StaticDrawUsage);
planeGeometry.attributes.uv.setUsage(THREE.StaticDrawUsage);
planeGeometry.attributes.normal.setUsage(THREE.StaticDrawUsage);

// Grid helper
// 🎯 markRaw: Grid helper tampoco necesita ser reactivo
const gridHelper = markRaw(new THREE.GridHelper(200, 40));
gridHelper.position.y = -50;

// Group for LOD objects
const lodGroup = markRaw(new THREE.Group());

// Texture loader (habilitar CORS anónimo para Cloudflare si aplica)
const textureLoader = new THREE.TextureLoader();
try {
  textureLoader.setCrossOrigin && textureLoader.setCrossOrigin("anonymous");
} catch (_) {}

// Helper function to dispose photo render object (LOD o Mesh simple)
const disposeLODObject = (lodObject) => {
  if (!lodObject) return;
  // Si era un THREE.LOD, recorrer; si es Mesh directo, tratarlo como único hijo
  if (lodObject.isLOD) {
    lodObject.traverse((child) => {
      if (child.isMesh) {
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  } else if (lodObject.isMesh) {
    if (lodObject.material) {
      if (lodObject.material.map) lodObject.material.map.dispose();
      lodObject.material.dispose();
    }
  }
  if (lodObject.parent) lodObject.parent.remove(lodObject);
};

// Fotos con materiales cargados
const photosWithMaterials = ref([]);

// Cola de texturas pendientes (IDs) y control dinámico de batch
const textureQueue = ref([]);
const queuedIds = new Set();
const scheduledDownloads = new Set(); // evita doble scheduling mientras p-limit gestiona
let dynamicBatch = 4; // tamaño inicial
const MIN_BATCH = 2;
const MAX_BATCH = 10;
// Límite de concurrencia de descargas simultáneas - Reducido para estabilidad
const MAX_CONCURRENT_DOWNLOADS = 12;
// Modo: pre-scheduling de toda la cola (true) o incremental por frame (false)
const FULL_QUEUE_SCHEDULING = true;
// Limitador de concurrencia usando p-limit
const limitTexture = pLimit(MAX_CONCURRENT_DOWNLOADS);

// Map para almacenar imágenes descargadas (imageId -> HTMLImageElement)
const downloadedImagesCache = new Map();

// IndexedDB Cache
const {
  initDB,

  bulkLoadFromCache,
  bulkCacheImages,
  getCacheStats,
} = useIndexedDBCache();

// Octree for spatial partitioning
const {
  buildOctree,
  queryFrustum,

  getStats: getOctreeStats,

  clear: clearOctree,
} = useOctree(8, 5); // maxObjects=8, maxLevels=5
const octreeNeedsRebuild = ref(true);

// Cache statistics
const cacheStats = ref({ totalImages: 0 });
const cachedPhotoIds = ref(new Set());
const isCachingImages = ref(false);
const cachingProgress = ref(0);

// Control de navegación durante carga inicial
const navigationBlocked = ref(false);
const downloadPhaseComplete = ref(false);
const cachePhaseComplete = ref(false);

// Performance optimization: throttling variables
let frameCounter = 0;
const THROTTLE_INTERVAL = 7; // Execute heavy operations every N frames
let lastCameraPosition = { x: 0, y: 0, z: 0 };
const CAMERA_MOVE_THRESHOLD = 0.8; // Minimum movement to trigger updates

// Reusable THREE.js objects to avoid garbage collection
// 🎯 markRaw: Objetos reutilizables no necesitan tracking reactivo
const reusableFrustum = markRaw(new THREE.Frustum());
const reusableMatrix = markRaw(new THREE.Matrix4());
const reusableVector3 = markRaw(new THREE.Vector3());
const reusableSphere = markRaw(new THREE.Sphere());

// Distance calculation cache
const distanceCache = new Map();
let cacheValidPosition = { x: 0, y: 0, z: 0 };

// Frustum culling - solo renderizar fotos visibles
const visiblePhotos = ref([]); // SOLO fotos actualmente en el frustum
const cachedPhotosSet = new Set(); // IDs de fotos con texturas cargadas (para evitar recargas)

// Función para limpiar la cola de texturas de fotos ya cargadas
const cleanTextureQueue = () => {
  const initialQueueLength = textureQueue.value.length;
  if (initialQueueLength === 0) return 0;

  // Filtrar solo las fotos que realmente necesitan descarga
  const validIds = textureQueue.value.filter((id) => {
    const photo = photosWithMaterials.value.find((p) => p.id === id);
    return photo && !photo.__imageDownloaded && !photo.__downloading;
  });

  // Limpiar IDs que ya no son válidos del Set
  textureQueue.value.forEach((id) => {
    const photo = photosWithMaterials.value.find((p) => p.id === id);
    if (!photo || photo.__imageDownloaded) {
      queuedIds.delete(id);
    }
  });

  textureQueue.value = validIds;
  const cleanedCount = initialQueueLength - validIds.length;

  if (cleanedCount > 0) {
    console.log(
      `🧼 cleanTextureQueue: Limpiados ${cleanedCount} elementos obsoletos de la cola`
    );
  }

  return cleanedCount;
};

// Función para actualizar el progreso de carga
const updateLoadingProgress = () => {
  if (totalPhotosToLoad.value === 0) {
    loadedPhotosCount.value = 0;
    loadingProgress.value = 0;
    return;
  }

  // Durante fase de descarga, contar imágenes descargadas
  // Después de bulk creation, contar texturas cargadas
  const loadedPhotos = downloadPhaseComplete.value
    ? photosWithMaterials.value.filter((photo) => photo.__textureLoaded)
    : photosWithMaterials.value.filter((photo) => photo.__imageDownloaded);

  loadedPhotosCount.value = loadedPhotos.length;

  const progress = Math.round(
    (loadedPhotosCount.value / totalPhotosToLoad.value) * 100
  );
  loadingProgress.value = Math.min(progress, 100);
  dlog("📊 Progreso de carga:", {
    loaded: loadedPhotosCount.value,
    total: totalPhotosToLoad.value,
    progress: loadingProgress.value + "%",
  });

  if (
    initialLoadingPhase.value &&
    (loadingProgress.value >= 80 ||
      (textureQueue.value.length === 0 && !isLoadingPositions.value))
  ) {
    initialLoadingPhase.value = false;
    dlog("🚀 Finaliza initialLoadingPhase (threshold alcanzado)");
  }
};

// Función para verificar si todas las texturas están cargadas
const checkAllTexturesLoaded = async () => {
  // Primero limpiar la cola de elementos obsoletos
  cleanTextureQueue();

  // Actualizar progreso
  updateLoadingProgress();

  dlog("🔍 checkAllTexturesLoaded - Estado actual:", {
    photosCount: photosWithMaterials.value.length,
    isLoadingPositions: isLoadingPositions.value,
    queueLength: textureQueue.value.length,
    progress: loadingProgress.value + "%",
  });

  // Si no hay fotos y ya no está cargando, ocultar loader
  if (photosWithMaterials.value.length === 0 && !isLoadingPositions.value) {
    return;
  }

  // Si no hay fotos pero aún está cargando, mantener loader
  if (photosWithMaterials.value.length === 0 && isLoadingPositions.value) {
    return;
  }

  // Verificar estado de cada foto
  const loadedPhotos = photosWithMaterials.value.filter(
    (photo) => photo.__textureLoaded
  );
  const loadingPhotos = photosWithMaterials.value.filter(
    (photo) => photo.__loading
  );

  // Verificar si fase de descarga está completa
  const allDownloaded = photosWithMaterials.value.every(
    (photo) => photo.__imageDownloaded
  );
  const nothingDownloading = photosWithMaterials.value.every(
    (photo) => !photo.__downloading
  );
  const noQueuePending = textureQueue.value.length === 0;

  // 🎯 Si terminó la descarga/cache-load pero aún no cacheamos ni creamos texturas
  if (
    allDownloaded &&
    nothingDownloading &&
    noQueuePending &&
    !isLoadingPositions.value &&
    !downloadPhaseComplete.value
  ) {
    console.log("🎉 Todas las imágenes disponibles. Procesando...");
    downloadPhaseComplete.value = true;

    // Verificar cuántas vienen de cache vs descargadas
    const fromCache = photosWithMaterials.value.filter(
      (p) => p.__fromCache
    ).length;
    const downloaded = photosWithMaterials.value.length - fromCache;
    console.log(
      `📊 Origen: ${fromCache} desde cache, ${downloaded} descargadas`
    );

    // Solo cachear las que NO vinieron de cache (las recién descargadas)
    if (downloaded > 0 && !props.isPlayground) {
      console.log(`💾 Cacheando ${downloaded} imágenes nuevas...`);
      await bulkCacheDownloadedImages();
    } else {
      if (props.isPlayground) {
        console.log(`⚠️ Cacheo deshabilitado en modo playground`);
      } else {
        console.log(
          `✅ Todas las imágenes vinieron de cache, saltando fase de cacheo`
        );
      }
    }

    console.log("🎨 Preparando creación incremental de texturas...");
    cachePhaseComplete.value = true;

    // 🔧 CRÍTICO: Solo crear texturas si NO existen LOD objects
    // En cambios de chunk, los LOD objects ya existen y solo necesitan actualizar posiciones
    const needsTextureCreation = photosWithMaterials.value.some(
      (p) => p.__imageDownloaded && !p.lodObject
    );

    if (needsTextureCreation) {
      console.log("🎨 Encolando creación incremental de texturas...");
      enqueueInitialTexturesBulk();
    } else {
      console.log("✅ LOD objects ya existen, saltando creación de texturas");
    }

    // Reactivar navegación
    navigationBlocked.value = false;

    // Activar controles de navegación si existen
    if (fpControls.value) {
      console.log("🎮 Activando controles de navegación (keyboard/mouse)...");
      fpControls.value.setup();
    }
    if (touchControls.value) {
      console.log("📱 Activando controles táctiles (touch)...");
      touchControls.value.setup();
    }

    // Ocultar loader
    hideLoader();
  }
};

// Computed para las opciones del tree select de aspectos visuales
const treeSelectOptions = computed(() => {
  return visualAspectsOptions.map((group) => ({
    label: group.label,
    key: group.key,
    disabled: false,
    checkable: false,
    children: group.children.map((child) => ({
      label: child.label,
      key: child.value,
      disabled: false,
      checkable: true,
    })),
  }));
});

// Computed para las opciones del tree select de artistic scores
const createArtisticScoresTreeOptions = () => {
  const { artisticScores } = useArtisticScores();

  return Object.entries(artisticScores).map(([groupKey, group]) => ({
    label: group.label,
    key: groupKey,
    disabled: false,
    checkable: false,
    children: group.criteria.map((criterion) => ({
      label: criterion.label,
      key: criterion.value,
      disabled: false,
      checkable: true,
    })),
  }));
};

// Create a mapping from visual aspect values to their categories
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

// Aplicar filtro de aspectos visuales Y búsqueda textual (solo marca visibilidad, no elimina fotos)
const applyFilters = () => {
  // Crear Set de IDs de fotos que pasan el filtro de búsqueda textual
  const searchFilteredIds = new Set();
  const hasSearchFilter =
    searchQuery.value.trim() && searchResults.value.length > 0;

  if (hasSearchFilter) {
    searchResults.value.forEach((photo) => searchFilteredIds.add(photo.id));
  }

  photosWithMaterials.value.forEach((photo) => {
    // Aplicar filtro de búsqueda textual PRIMERO (más restrictivo)
    if (hasSearchFilter && !searchFilteredIds.has(photo.id)) {
      photo.isVisible = false;
      // Ocultar con opacity en lugar de visible
      if (photo.lodObject && photo.lodObject.material) {
        photo.lodObject.material.opacity = 0;
        photo.lodObject.material.transparent = true;
      }
      return;
    }

    // Si no hay filtros de aspectos ni scores, mostrar foto
    if (
      selectedVisualAspects.value.length === 0 &&
      selectedArtisticScores.value.length === 0
    ) {
      photo.isVisible = true;
      // Restaurar opacity (applyDistanceFading lo ajustará según distancia)
      if (photo.lodObject && photo.lodObject.material) {
        photo.lodObject.material.opacity = 1.0;
        photo.lodObject.material.transparent = true;
      }
      return;
    }

    let passesVisualAspects = true;
    let passesArtisticScores = true;

    // Filtro de Visual Aspects (lógica OR dentro de categorías, AND entre categorías)
    if (selectedVisualAspects.value.length > 0) {
      if (!photo.descriptions?.visual_aspects) {
        passesVisualAspects = false;
      } else {
        // Agrupar aspectos seleccionados por categoría
        const selectedByCategory = new Map();
        selectedVisualAspects.value.forEach((selectedAspect) => {
          const category = visualAspectCategoryMap.get(selectedAspect);
          if (category) {
            if (!selectedByCategory.has(category)) {
              selectedByCategory.set(category, []);
            }
            selectedByCategory.get(category).push(selectedAspect);
          }
        });

        // Para que la foto sea visible, debe cumplir TODAS las categorías seleccionadas (AND)
        // Pero dentro de cada categoría, solo necesita cumplir UNA opción (OR)
        passesVisualAspects = Array.from(selectedByCategory.entries()).every(
          ([category, aspectsInCategory]) => {
            const photoAspects = photo.descriptions?.visual_aspects?.[category];
            if (!photoAspects || !Array.isArray(photoAspects)) {
              return false;
            }

            // OR: debe tener al menos uno de los aspectos de esta categoría
            const hasAnyAspectInCategory = aspectsInCategory.some((aspect) =>
              photoAspects.includes(aspect)
            );

            return hasAnyAspectInCategory;
          }
        );
      }
    }

    // Filtro de Artistic Scores (score > 7 para cada score seleccionado)
    if (selectedArtisticScores.value.length > 0) {
      if (!photo.descriptions?.artistic_scores) {
        passesArtisticScores = false;
      } else {
        // Para pasar el filtro, la foto debe tener TODOS los scores seleccionados con valor > 7
        passesArtisticScores = selectedArtisticScores.value.every(
          (scoreKey) => {
            const scoreValue = photo.descriptions?.artistic_scores?.[scoreKey];
            return scoreValue !== undefined && scoreValue > 7;
          }
        );
      }
    }

    // La foto es visible solo si pasa AMBOS filtros (AND lógico)
    photo.isVisible = passesVisualAspects && passesArtisticScores;

    // Sync mesh opacity (no tocar visible)
    if (photo.lodObject && photo.lodObject.material) {
      photo.lodObject.material.opacity = photo.isVisible ? 1.0 : 0;
      photo.lodObject.material.transparent = true;
    }
  });

  const visibleCount = photosWithMaterials.value.filter(
    (p) => p.isVisible
  ).length;
  const hiddenCount = photosWithMaterials.value.filter(
    (p) => p.isVisible === false
  ).length;

  // Log resumen de la lógica aplicada
  const filterInfo = [];
  if (selectedVisualAspects.value.length > 0) {
    filterInfo.push(`${selectedVisualAspects.value.length} visual aspects`);
  }
  if (selectedArtisticScores.value.length > 0) {
    filterInfo.push(`${selectedArtisticScores.value.length} artistic scores`);
  }
  if (hasSearchFilter) {
    filterInfo.push(
      `text search: "${searchQuery.value}" (${searchResults.value.length} results)`
    );
  }

  if (filterInfo.length > 0) {
    console.log(
      `🔍 Filtros aplicados: ${filterInfo.join(
        " + "
      )} | Visibles: ${visibleCount} | Ocultas: ${hiddenCount}`
    );
  }

  // Debug adicional: mostrar algunas fotos que NO pasaron el filtro
  if (
    (selectedVisualAspects.value.length > 0 ||
      selectedArtisticScores.value.length > 0) &&
    hiddenCount > 0
  ) {
    const hiddenExamples = photosWithMaterials.value
      .filter((p) => p.isVisible === false)
      .slice(0, 3)
      .map((p) => ({
        id: String(p.id).substring(0, 8) + "...",
        hasVisualAspects: !!p.descriptions?.visual_aspects,
        hasScores: !!p.descriptions.artistic_scores,
        aspectKeys: p.descriptions?.visual_aspects
          ? Object.keys(p.descriptions.visual_aspects)
          : [],
        scoreKeys: p.descriptions.artistic_scores
          ? Object.keys(p.descriptions.artistic_scores)
          : [],
      }));
    console.log("🔍 Ejemplos de fotos ocultas por filtro:", hiddenExamples);
  }
};

// Computed para fotos filtradas (solo las marcadas como visibles)
const filteredPhotos = computed(() => {
  return photosWithMaterials.value.filter((photo) => photo.isVisible !== false);
});

// Handler para cambio en filtro de aspectos visuales
const onVisualAspectsChange = () => {
  console.log(
    "🔄 onVisualAspectsChange triggered:",
    selectedVisualAspects.value
  );
  applyFilters();

  // Update LOD distances based on new filtered count
  const visibleCount = filteredPhotos.value.length;
  // updateLODDistances eliminado

  // 🔧 CRITICAL: Marcar octree para reconstrucción con fotos filtradas
  octreeNeedsRebuild.value = true;

  updateVisiblePhotos();
  updatePhotoEffects(); // Aplica Billboard con distancias pre-calculadas
};

// Handler para cambio en filtro de artistic scores
const onArtisticScoresChange = () => {
  console.log(
    "🔄 onArtisticScoresChange triggered:",
    selectedArtisticScores.value
  );
  applyFilters();

  // Update LOD distances based on new filtered count
  const visibleCount = filteredPhotos.value.length;
  // updateLODDistances eliminado

  // 🔧 CRITICAL: Marcar octree para reconstrucción con fotos filtradas
  octreeNeedsRebuild.value = true;

  updateVisiblePhotos();
  updatePhotoEffects(); // Aplica Billboard con distancias pre-calculadas
};

// Search functionality - Similar a PhotosDialog.vue
const onSearchChange = () => {
  // Clear any existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // If search is empty, clear search
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }

  // Debounce search to avoid too many API calls
  searchTimeout = setTimeout(async () => {
    await performSearch();
  }, 1000);
};

const performSearch = async () => {
  if (!searchQuery.value.trim()) {
    clearSearch();
    return;
  }

  isSearching.value = true;
  searchResults.value = [];

  try {
    const payload = {
      description: searchQuery.value.trim(),
      options: {
        iteration: 1,
        pageSize: 100,
        searchMode: "low_precision",
      },
    };

    const { data: response } = await api.post(
      "/api/search/semantic/sync",
      payload
    );

    // Handle direct response from sync endpoint
    if (response.data && response.data.results) {
      let photos = [];
      Object.entries(response.data.results).forEach(([iter, items]) => {
        photos.push(...items.map((i) => i.photo));
      });
      // Filtrar solo fotos con totalScore > 0.5
      photos = photos.filter((photo) => photo.totalScore > 0.5);
      searchResults.value = photos;

      console.log(
        `🔍 Búsqueda textual completada: "${searchQuery.value}" - ${photos.length} resultados (totalScore > 0.5)`
      );
    } else {
      // If no results, show empty array
      searchResults.value = [];
      console.log(`🔍 Búsqueda textual sin resultados: "${searchQuery.value}"`);
    }

    // Apply filters with search results
    applyFilters();

    // Update LOD distances based on new filtered count
    const visibleCount = filteredPhotos.value.length;
    // updateLODDistances eliminado

    // 🔧 CRITICAL: Marcar octree para reconstrucción con fotos filtradas
    octreeNeedsRebuild.value = true;

    updateVisiblePhotos();
    updatePhotoEffects();
  } catch (error) {
    console.error("❌ Error searching photos:", error);
    searchResults.value = [];
  } finally {
    isSearching.value = false;
  }
};

const clearSearch = () => {
  searchQuery.value = "";
  searchResults.value = [];
  isSearching.value = false;
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }

  console.log("🔍 Búsqueda textual limpiada");

  // Reapply filters without search
  applyFilters();

  // Update LOD distances based on new filtered count
  const visibleCount = filteredPhotos.value.length;
  // updateLODDistances eliminado

  // 🔧 CRITICAL: Marcar octree para reconstrucción con fotos filtradas
  octreeNeedsRebuild.value = true;

  updateVisiblePhotos();
  updatePhotoEffects();
};

// Función de easing para animaciones suaves
const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// Variable para almacenar las posiciones target de la animación actual
let animationTargetPositions = [];
// Variable para almacenar las posiciones originales pendientes de actualizar
let pendingOriginalPositionsUpdate = null;

// Función para animar la transición entre posiciones
const animatePositionTransition = (
  fromPositions,
  toPositions,
  newOriginalPositions = null
) => {
  if (fromPositions.length !== toPositions.length) {
    console.warn("⚠️ Número diferente de posiciones en la transición:", {
      from: fromPositions.length,
      to: toPositions.length,
    });

    // 🔧 SOLUCIÓN: Ajustar arrays para que tengan la misma longitud
    const minLength = Math.min(fromPositions.length, toPositions.length);
    const adjustedFromPositions = fromPositions.slice(0, minLength);
    const adjustedToPositions = toPositions.slice(0, minLength);

    // Llamar recursivamente con arrays ajustados
    return animatePositionTransition(
      adjustedFromPositions,
      adjustedToPositions,
      newOriginalPositions
    );
  }

  if (fromPositions.length === 0) {
    console.warn("⚠️ No hay posiciones para animar");
    return;
  }

  // Guardar posiciones target para la animación
  animationTargetPositions = [...toPositions]; // Hacer copia profunda

  // Guardar posiciones originales pendientes para actualizar al final de la animación
  pendingOriginalPositionsUpdate = newOriginalPositions;

  isTransitioning.value = true;
  animationStartTime.value = performance.now();
};

// Función para actualizar las posiciones durante la animación
const updateTransitionPositions = (currentTime) => {
  if (!isTransitioning.value || animationTargetPositions.length === 0) {
    // Log solo una vez para evitar spam
    if (isTransitioning.value && animationTargetPositions.length === 0) {
      console.warn(
        "⚠️ updateTransitionPositions: isTransitioning=true pero no hay animationTargetPositions"
      );
    }
    return;
  }

  const elapsed = currentTime - animationStartTime.value;
  const progress = Math.min(elapsed / TRANSITION_DURATION, 1);
  const easedProgress = easeInOutCubic(progress);

  // Interpolar posiciones para cada foto (usar la longitud mínima por seguridad)
  const maxIndex = Math.min(
    photosWithMaterials.value.length,
    animationTargetPositions.length
  );

  for (let index = 0; index < maxIndex; index++) {
    const photo = photosWithMaterials.value[index];
    const targetPos = animationTargetPositions[index];
    const startPos = photo.transitionStartPosition || photo.position;

    // Interpolar cada componente
    photo.position = [
      startPos[0] + (targetPos[0] - startPos[0]) * easedProgress,
      startPos[1] + (targetPos[1] - startPos[1]) * easedProgress,
      startPos[2] + (targetPos[2] - startPos[2]) * easedProgress,
    ];

    // Sync LOD object position
    if (photo.lodObject) {
      photo.lodObject.position.set(
        photo.position[0],
        photo.position[1],
        photo.position[2]
      );
    }
  }

  // Finalizar animación
  if (progress >= 1) {
    isTransitioning.value = false;

    // Asegurar posiciones finales exactas
    const maxFinalIndex = Math.min(
      photosWithMaterials.value.length,
      animationTargetPositions.length
    );
    for (let index = 0; index < maxFinalIndex; index++) {
      photosWithMaterials.value[index].position = [
        ...animationTargetPositions[index],
      ];
    }

    // 🔧 Actualizar originalPositions AHORA que terminó la animación
    if (pendingOriginalPositionsUpdate) {
      originalPositions.value = pendingOriginalPositionsUpdate;
      console.log("✅ originalPositions actualizado después de la animación");
    }

    // Limpiar propiedades temporales
    photosWithMaterials.value.forEach((photo) => {
      delete photo.transitionStartPosition;
    });

    // Limpiar referencias
    animationTargetPositions = [];
    pendingOriginalPositionsUpdate = null;

    // Forzar actualización de matrices de cámara ANTES de frustum culling
    if (cameraRef.value) {
      cameraRef.value.updateMatrixWorld(true);
      cameraRef.value.updateProjectionMatrix();
    }

    // Limpiar cache de distancias para forzar recálculo
    distanceCache.clear();

    // Marcar octree para reconstrucción después de cambios de posición
    octreeNeedsRebuild.value = true;

    updateVisiblePhotos();
    updatePhotoEffects(); // Aplica Billboard con distancias pre-calculadas
  }
}; // Nueva fase: Cachear todas las imágenes descargadas en IndexedDB
const bulkCacheDownloadedImages = async () => {
  // Skip caching if isPlayground
  if (props.isPlayground) {
    console.log(`⚠️ Cacheo deshabilitado en modo playground`);
    isCachingImages.value = false;
    cachingProgress.value = 100;
    return;
  }

  isCachingImages.value = true;
  loaderStage.value = "caching";
  loaderTitle.value = "Caching images";
  loaderSubtitle.value = "Saving images for faster future loads...";
  cachingProgress.value = 0;

  const imagesToCache = [];

  // Debug: contar fotos por estado
  const totalPhotos = photosWithMaterials.value.length;
  const downloadedPhotos = photosWithMaterials.value.filter(
    (p) => p.__imageDownloaded
  ).length;
  const withImageElement = photosWithMaterials.value.filter(
    (p) => p.__imageElement
  ).length;
  const withErrors = photosWithMaterials.value.filter(
    (p) => p.__downloadError
  ).length;

  console.log(`📊 Estado antes de cachear:`, {
    total: totalPhotos,
    downloaded: downloadedPhotos,
    withImageElement: withImageElement,
    errors: withErrors,
    eligibleForCache: photosWithMaterials.value.filter(
      (p) => p.__imageDownloaded && !p.__downloadError && p.__imageElement
    ).length,
  });

  // Preparar datos para cacheo en bulk - SOLO las que NO vienen de cache
  for (const photo of photosWithMaterials.value) {
    // 🎯 Skip fotos que ya vienen de cache (no necesitan re-cachearse)
    if (photo.__fromCache) {
      continue;
    }

    if (
      photo.__imageDownloaded &&
      !photo.__downloadError &&
      photo.__imageElement
    ) {
      try {
        // Convert HTMLImageElement to Blob
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = photo.__imageElement.width;
        canvas.height = photo.__imageElement.height;
        ctx.drawImage(photo.__imageElement, 0, 0);

        const blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95);
        });

        if (blob) {
          imagesToCache.push({
            id: photo.id,
            blob: blob,
            url: photo.__imageUrl,
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error preparing image ${photo.id} for cache:`, error);
      }
    }
  }

  console.log(`💾 Cacheando ${imagesToCache.length} imágenes en IndexedDB...`);

  // Skip caching if isPlayground
  if (props.isPlayground) {
    console.log(`⚠️ Cacheo deshabilitado en modo playground`);
  } else if (imagesToCache.length > 0) {
    try {
      const result = await bulkCacheImages(imagesToCache);
      console.log(
        `✅ Cacheo completado: ${result.success} exitosos, ${result.failed} fallidos`
      );

      // Update cache stats
      cacheStats.value = await getCacheStats();
      console.log(
        `📊 Total de imágenes en cache después de guardar: ${cacheStats.value.totalImages}`
      );

      // Add newly cached IDs to set
      imagesToCache.forEach(({ id }) => cachedPhotoIds.value.add(id));
    } catch (error) {
      console.error("❌ Error durante cacheo en bulk:", error);
    }
  } else {
    console.warn(
      `⚠️ No hay imágenes elegibles para cachear de ${photosWithMaterials.value.length} fotos totales`
    );
  }

  isCachingImages.value = false;
  cachingProgress.value = 100;
};

// Función para configurar el loader
const setupLoaderForPhotos = async (photos) => {
  console.log("🚀 setupLoaderForPhotos iniciado para", photos.length, "fotos");

  totalPhotosToLoad.value = photos.length;
  loadedPhotosCount.value = 0;
  loadingProgress.value = 0;
  cachingProgress.value = 0;

  loaderStage.value = "loading";
  loaderTitle.value = "Loading photos";
};

// Función para ocultar loader (mantener navegación siempre activa)
const hideLoader = () => {
  showDiscreteLoader.value = false;
  console.log("✅ Loader ocultado - Carga completada");
};

// Función para mostrar loader (sin bloquear navegación)
const showLoader = () => {
  showDiscreteLoader.value = true;
  console.log("⏳ Mostrando loader discreto");
};

// FASE 1: Solo descargar imágenes sin crear texturas Three.js
const downloadImageOnly = async (
  photoObj,
  retryCount = 0,
  isOnDemandRetry = false
) => {
  if (photoObj.__imageDownloaded || photoObj.__downloading) return;
  photoObj.__downloading = true;
  const imageUrl =
    photoObj.thumbnailUrl || photoObj.url || photoObj.originalUrl;

  if (!imageUrl) {
    photoObj.__downloading = false;
    photoObj.__imageDownloaded = true;
    photoObj.__downloadError = true;
    return;
  }

  try {
    // Descargar imagen SIN crear textura Three.js
    const imageElement = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (error) => reject(error);
      img.src = imageUrl;
    });

    if (!imageElement) {
      throw new Error("Image element is null");
    }

    // 🔑 CRÍTICO: Guardar imagen ORIGINAL sin redimensionar para poder crear
    // texturas de diferentes resoluciones (ULTRA, FULL, REDUCED) sin pérdida de calidad
    downloadedImagesCache.set(photoObj.id, imageElement);

    // Store image metadata for bulk caching later
    photoObj.__imageElement = imageElement;
    photoObj.__imageUrl = imageUrl;

    photoObj.__imageDownloaded = true;
    photoObj.__downloadError = false;
    photoObj.__canCreateTexture = true; // Marcar que está lista para crear textura en bulk
    photoObj.__retryCount = undefined; // Limpiar contador de reintentos si existía

    // Si esta foto se recuperó después de un error 429, actualizar stats
    if (photoObj.__had429Error) {
      error429Stats.value.recovered++;
      console.log(
        `✅ Foto recuperada después de error 429 (retry ${retryCount}):`,
        photoObj.id
      );
      photoObj.__had429Error = false;
    }

    // Actualizar progreso
    updateLoadingProgress();
  } catch (e) {
    // Detectar error 429 (Too Many Requests)
    const is429Error =
      e.message?.includes("429") ||
      e.toString().includes("429") ||
      e.status === 429;

    if (is429Error) {
      error429Stats.value.total++;
      photoObj.__had429Error = true;
      console.warn(
        `⚠️ Error 429 detectado para foto ${photoObj.id} (intento ${
          retryCount + 1
        }/${MAX_RETRIES})`
      );
    }

    // Intentar retry si no hemos alcanzado el máximo y es un error recuperable
    if (retryCount < MAX_RETRIES && (is429Error || !e.message)) {
      error429Stats.value.retried++;
      photoObj.__retryCount = retryCount + 1;

      // Calcular delay con backoff exponencial
      const delay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(RETRY_MULTIPLIER, retryCount),
        MAX_RETRY_DELAY
      );

      console.log(
        `🔄 Reintentando descarga en ${delay}ms... (intento ${retryCount + 1})`
      );

      // Esperar y reintentar
      await new Promise((resolve) => setTimeout(resolve, delay));
      photoObj.__downloading = false; // Reset flag antes de retry
      return downloadImageOnly(photoObj, retryCount + 1, isOnDemandRetry);
    }

    // Si llegamos aquí, falló definitivamente
    console.warn(
      `❌ Fallo definitivo descarga imagen (${retryCount} reintentos):`,
      imageUrl,
      e
    );
    error429Stats.value.failed++;
    photoObj.__imageDownloaded = true;
    photoObj.__downloadError = true;
    // Solo permitir retry bajo demanda si NO es ya un retry bajo demanda (evita bucle infinito)
    if (!isOnDemandRetry) {
      photoObj.__canRetryOnDemand = true;
    }
    updateLoadingProgress();
  } finally {
    photoObj.__downloading = false;
  }
};

// (getPerformanceMultiplier eliminado)

// Helper: crear un único Mesh (sin mipmaps en móvil para ahorrar VRAM)
const createLODObject = (imageElement, position) => {
  // Ajuste dinámico adicional: si hay muchas fotos en dispositivo low perf (móvil o touch), bajar más
  let maxSide = useLowPerformance.value ? 256 : 1024;
  // if (useLowPerformance.value && photosWithMaterials.value.length > 1500)
  //   maxSide = 128;
  // if (useLowPerformance.value && photosWithMaterials.value.length > 2500)
  //   maxSide = 320;
  let source = imageElement;
  const needsResize =
    imageElement.width > maxSide || imageElement.height > maxSide;
  if (needsResize) {
    const scale = Math.min(
      maxSide / imageElement.width,
      maxSide / imageElement.height
    );
    const w = Math.round(imageElement.width * scale);
    const h = Math.round(imageElement.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageElement, 0, 0, w, h);
    source = canvas;
  }

  const texture = new THREE.Texture(source);
  texture.needsUpdate = true;
  if (useLowPerformance.value) {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  } else {
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }

  // Usar sRGB color space para mantener colores correctos
  texture.colorSpace = THREE.SRGBColorSpace;

  try {
    texture.anisotropy = useLowPerformance.value ? 1 : 4; // reducir en low performance
  } catch (_) {}

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01, // Bajo para permitir opacidades bajas
    depthWrite: false,
    depthTest: true,
    opacity: 1,
    side: THREE.FrontSide,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(planeGeometry, material);
  mesh.position.set(position[0], position[1], position[2]);

  // Ajustar escala para mantener aspect ratio real
  const targetAspect = source.width / source.height;
  const baseAspect = 4 / 3; // planeGeometry base
  if (targetAspect > baseAspect) {
    mesh.scale.set(targetAspect / baseAspect, 1, 1);
  } else {
    mesh.scale.set(1, baseAspect / targetAspect, 1);
  }

  return markRaw(mesh);
};

// ===========================
// 🔄 CREACIÓN INCREMENTAL DE TEXTURAS
// ===========================
const textureCreationQueue = [];
let textureCreationRunning = false;
let lastFrameCreationTime = 0;
let adaptiveBatch = 0;

// (LRU eliminado: mantenemos toda textura creada; rely on downscaled sizes for memory control)

const CONFIG_CREATION = {
  mobileBase: 4,
  desktopBase: 500, // ↑ Mucho más agresivo en desktop para carga casi-bulk
  maxBatchDesktop: 1000, // ↑ Sin límite práctico en desktop potente
  maxBatchMobile: 18,
  minBatch: 2,
  targetFrameMs: 16.6,
  upperFrameMs: 28,
  frameBudgetMsMobile: 5.5,
  frameBudgetMsDesktop: 100, // ↑ Permite gastar más tiempo por frame en desktop
};

const getBaseBatch = () =>
  useLowPerformance.value
    ? CONFIG_CREATION.mobileBase
    : CONFIG_CREATION.desktopBase;
const getMaxBatch = () =>
  useLowPerformance.value
    ? CONFIG_CREATION.maxBatchMobile
    : CONFIG_CREATION.maxBatchDesktop;
const getFrameBudget = () =>
  useLowPerformance.value
    ? CONFIG_CREATION.frameBudgetMsMobile
    : CONFIG_CREATION.frameBudgetMsDesktop;

function enqueueTexture(photo) {
  if (!photo) return;
  if (photo.__textureLoaded) return;
  if (photo.__downloadError) return;
  if (!downloadedImagesCache.get(photo.id)) return; // no image available
  // Evitar duplicados
  if (!textureCreationQueue.includes(photo)) textureCreationQueue.push(photo);
}

function startTextureCreationLoop() {
  if (textureCreationRunning) return;
  textureCreationRunning = true;
  adaptiveBatch = getBaseBatch();
  loaderStage.value = "creating";
  loaderTitle.value = "Creating Textures";
  loaderSubtitle.value = "Preparing 3D view...";

  // =============================
  // 🚀 Desktop Bulk Mode (sin steps)
  // Petición del usuario: en desktop crear TODAS las texturas de golpe, sin loop incremental.
  // useLowPerformance => true en móvil o dispositivos táctiles (heurística ya definida arriba).
  // Si NO es low performance, hacemos bulk completo ignorando presupuestos de frame.
  if (!useLowPerformance.value) {
    try {
      let created = 0;
      while (textureCreationQueue.length) {
        const photo = textureCreationQueue.shift();
        if (!photo) continue;
        const imageElement = downloadedImagesCache.get(photo.id);
        if (!imageElement) continue;
        try {
          const lodObject = createLODObject(imageElement, photo.position);
          if (photo.lodObject) disposeLODObject(photo.lodObject);
          photo.lodObject = lodObject;
          photo.__textureLoaded = true;
          photo.__loading = false;
          lodObject.visible = true;
          if (photo.isVisible === false && lodObject.material) {
            lodObject.material.opacity = 0;
            lodObject.material.transparent = true;
          }
          lodGroup.add(lodObject);
          // Liberar imagen original para ahorrar memoria
          photo.__imageElement = undefined;
          downloadedImagesCache.delete(photo.id);
          created++;
        } catch (err) {
          console.warn("Texture creation error (bulk)", photo.id, err);
        }
      }
      updateLoadingProgress();
      console.log(
        `🧩 Bulk desktop texture creation completada (${created} texturas)`
      );
    } finally {
      textureCreationRunning = false;
      // Verificar fases y limpiar
      checkAllTexturesLoaded();
      updateVisiblePhotos();
      updatePhotoEffects();
    }
    return; // Salimos: no ejecutamos el modo incremental
  }

  const step = (ts) => {
    const start = performance.now();
    const frameBudget = getFrameBudget();
    let created = 0;

    // Auto-tune batch basado en frameTime previo
    if (lastFrameCreationTime) {
      if (lastFrameCreationTime < 12 && adaptiveBatch < getMaxBatch())
        adaptiveBatch++;
      else if (
        lastFrameCreationTime > CONFIG_CREATION.upperFrameMs &&
        adaptiveBatch > CONFIG_CREATION.minBatch
      )
        adaptiveBatch--;
    }

    while (
      textureCreationQueue.length &&
      created < adaptiveBatch &&
      performance.now() - start < frameBudget
    ) {
      const photo = textureCreationQueue.shift();
      if (!photo) break;
      const imageElement = downloadedImagesCache.get(photo.id);
      if (!imageElement) continue;
      try {
        const lodObject = createLODObject(imageElement, photo.position);
        if (photo.lodObject) disposeLODObject(photo.lodObject);
        photo.lodObject = lodObject;
        photo.__textureLoaded = true;
        photo.__loading = false;
        lodObject.visible = true;
        if (photo.isVisible === false && lodObject.material) {
          lodObject.material.opacity = 0;
          lodObject.material.transparent = true;
        }
        lodGroup.add(lodObject);
        // (LRU removed: no tracking needed)
        // Liberar imagen original
        photo.__imageElement = undefined;
        downloadedImagesCache.delete(photo.id);
        created++;
      } catch (err) {
        console.warn("Texture creation error", photo.id, err);
      }
    }

    // Actualizar progreso (usa fotos con __textureLoaded como criterio en fase creación)
    updateLoadingProgress();
    lastFrameCreationTime = performance.now() - start;

    if (textureCreationQueue.length) {
      requestAnimationFrame(step);
    } else {
      textureCreationRunning = false;
      // Verificar si ya terminamos toda la fase de creación
      checkAllTexturesLoaded();
      updateVisiblePhotos();
      updatePhotoEffects();
    }

    // (LRU removed: no texture budget enforcement)
  };

  requestAnimationFrame(step);
}

function enqueueInitialTexturesBulk() {
  // Encolar todas las fotos cuya imagen ya está descargada pero sin textura
  photosWithMaterials.value.forEach((p) => {
    if (p.__imageDownloaded && !p.__textureLoaded && !p.__downloadError) {
      enqueueTexture(p);
    }
  });
  if (textureCreationQueue.length) startTextureCreationLoop();
}

// Listener de pérdida de contexto WebGL (diagnóstico de saturación)
if (typeof window !== "undefined") {
  window.addEventListener(
    "webglcontextlost",
    (e) => {
      console.warn("⚠️ WebGL context lost: posible saturación de VRAM", e);
    },
    { capture: true }
  );
}

// (updateLODDistances eliminado)

// Nueva función para encolar TODAS las fotos no cacheadas (sin filtro de frustum)
const enqueueAllNonCachedPhotos = (photos) => {
  if (!photos || photos.length === 0) return 0;

  let enqueuedCount = 0;
  const cameraPos = cameraRef.value?.position || { x: 0, y: 0, z: 0 };

  photos.forEach((photo) => {
    if (
      !photo.__imageDownloaded &&
      !photo.__downloading &&
      !queuedIds.has(photo.id) &&
      !scheduledDownloads.has(photo.id)
    ) {
      // Pre-calcular prioridad por distancia al cuadrado (sin sqrt)
      const dx = photo.position[0] - cameraPos.x;
      const dy = photo.position[1] - cameraPos.y;
      const dz = photo.position[2] - cameraPos.z;
      photo.__priority = dx * dx + dy * dy + dz * dz;
      textureQueue.value.push(photo.id);
      queuedIds.add(photo.id);
      enqueuedCount++;
    }
  });

  // Ordenar cola por prioridad si agregamos elementos
  if (enqueuedCount > 0 && textureQueue.value.length > 1) {
    textureQueue.value.sort((aId, bId) => {
      const a = photosWithMaterials.value.find((p) => p.id === aId);
      const b = photosWithMaterials.value.find((p) => p.id === bId);
      return (a?.__priority || 0) - (b?.__priority || 0);
    });
  }

  dlog(`📋 Encoladas ${enqueuedCount} fotos no cacheadas para carga`);
  return enqueuedCount;
};

// Nueva función: Cargar imágenes desde cache antes de descargar
const loadImagesFromCache = async (photos) => {
  loaderStage.value = "loading";
  loaderTitle.value = "Loading photos";
  loaderSubtitle.value = "Checking local storage...";

  const photoIds = photos.map((p) => p.id);

  console.log(`🔍 Cargando fotos desde cache para ${photoIds.length} fotos...`);

  // Skip cache if isPlayground
  if (props.isPlayground) {
    console.log(`⚠️ Cache deshabilitado en modo playground`);
    return new Map();
  }

  try {
    // Load cached images in bulk (devuelve solo los que existen)
    const cachedBlobs = await bulkLoadFromCache(photoIds);

    console.log(`✅ Cargadas ${cachedBlobs.size} imágenes desde cache`);

    if (cachedBlobs.size > 0) {
      loaderSubtitle.value = `Loading ${cachedBlobs.size} photos from cache...`;
      cachedPhotoIds.value = new Set(cachedBlobs.keys());

      // Convert Blobs to HTMLImageElements and store in cache
      let loadedFromCache = 0;
      for (const [photoId, blob] of cachedBlobs.entries()) {
        try {
          const imageUrl = URL.createObjectURL(blob);
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              URL.revokeObjectURL(imageUrl);
              resolve(image);
            };
            image.onerror = reject;
            image.src = imageUrl;
          });

          downloadedImagesCache.set(photoId, img);

          // Mark photo as downloaded from cache
          const photo = photos.find((p) => p.id === photoId);
          if (photo) {
            photo.__imageDownloaded = true;
            photo.__downloadError = false;
            photo.__canCreateTexture = true;
            photo.__fromCache = true;
            photo.__imageElement = img;
            photo.__imageUrl =
              photo.thumbnailUrl || photo.url || photo.originalUrl; // For potential re-caching
          }

          loadedFromCache++;
        } catch (error) {
          console.warn(`⚠️ Error loading cached image ${photoId}:`, error);
          // Remove from cached set if loading fails
          cachedPhotoIds.value.delete(photoId);
        }
      }

      console.log(
        `✅ ${loadedFromCache} imágenes cargadas exitosamente desde cache`
      );
      updateLoadingProgress();
    }

    // Update cache stats
    cacheStats.value = await getCacheStats();

    return cached.size;
  } catch (error) {
    console.error("❌ Error cargando desde cache:", error);
    return 0;
  }
};

// Integración nueva: Inicializar foto con placeholder y encolar su ID
const registerNewPhotos = async (newPhotos) => {
  dlog("🔄 Registrando fotos nuevas, configurando loader discreto");

  // Bloquear navegación durante carga inicial
  navigationBlocked.value = true;
  downloadPhaseComplete.value = false;
  cachePhaseComplete.value = false;

  // Configurar el loader según el estado de cache
  await setupLoaderForPhotos(newPhotos);
  showLoader();

  // ===== PASO 1: Buscar en cache y cargar en bulk =====
  loaderStage.value = "loading";
  loaderTitle.value = "Loading photos";
  loaderSubtitle.value = "Checking local storage...";

  const photoIds = newPhotos.map((p) => p.id);
  console.log(`🔍 Cargando fotos desde cache para ${photoIds.length} fotos...`);

  // Skip cache if isPlayground
  let cachedBlobs = new Map();
  if (props.isPlayground) {
    console.log(`⚠️ Cache deshabilitado en modo playground`);
  } else {
    // Cargar blobs desde cache en bulk (devuelve solo los que existen)
    cachedBlobs = await bulkLoadFromCache(photoIds);
  }
  console.log(`✅ Cargadas ${cachedBlobs.size} imágenes desde cache`);

  // Convertir blobs a HTMLImageElements y guardar en downloadedImagesCache
  for (const [photoId, blob] of cachedBlobs.entries()) {
    try {
      const imageUrl = URL.createObjectURL(blob);
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(imageUrl);
          resolve(image);
        };
        image.onerror = reject;
        image.src = imageUrl;
      });

      // Guardar en el mismo Map que las descargadas
      downloadedImagesCache.set(photoId, img);
    } catch (error) {
      console.warn(`⚠️ Error loading cached image ${photoId}:`, error);
      cachedBlobs.delete(photoId); // Remover de la lista de cacheadas
    }
  }

  console.log(`✅ ${downloadedImagesCache.size} imágenes listas desde cache`);

  // ===== PASO 2: Descargar las restantes desde network =====
  const photosToDownload = newPhotos.filter((p) => !cachedBlobs.has(p.id));

  if (photosToDownload.length > 0) {
    console.log(`📥 Descargando ${photosToDownload.length} fotos restantes...`);
    loaderStage.value = "downloading";
    loaderTitle.value = "Loading photos";
    loaderSubtitle.value = `Downloading ${photosToDownload.length} photos...`;

    // Descargar en paralelo con p-limit
    const downloadPromises = photosToDownload.map((photo) =>
      limitTexture(async () => {
        const imageUrl = photo.thumbnailUrl || photo.url || photo.originalUrl;
        if (!imageUrl) return;

        try {
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = imageUrl;
          });

          // Guardar en el mismo Map
          downloadedImagesCache.set(photo.id, img);

          // Actualizar progreso
          const loaded = downloadedImagesCache.size;
          const total = newPhotos.length;
          loadingProgress.value = Math.round((loaded / total) * 100);
        } catch (error) {
          console.warn(`⚠️ Error descargando ${photo.id}:`, error);
        }
      })
    );

    await Promise.all(downloadPromises);
    console.log(
      `✅ Total de imágenes cargadas: ${downloadedImagesCache.size}/${newPhotos.length}`
    );
  } else {
    console.log(`✅ Todas las fotos estaban en cache!`);
  }

  // ===== PASO 3: Cachear las nuevas descargas =====
  if (photosToDownload.length > 0 && !props.isPlayground) {
    console.log(`💾 Cacheando ${photosToDownload.length} nuevas imágenes...`);
    loaderStage.value = "caching";
    loaderTitle.value = "Caching images";

    const imagesToCache = [];
    for (const photo of photosToDownload) {
      const img = downloadedImagesCache.get(photo.id);
      if (!img) continue;

      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95);
        });

        if (blob) {
          imagesToCache.push({
            id: photo.id,
            blob: blob,
            url: photo.thumbnailUrl || photo.url || photo.originalUrl,
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error preparando ${photo.id} para cache:`, error);
      }
    }

    if (imagesToCache.length > 0) {
      const result = await bulkCacheImages(imagesToCache);
      console.log(
        `✅ Cacheo completado: ${result.success} exitosos, ${result.failed} fallidos`
      );
    }
  } else if (photosToDownload.length > 0 && props.isPlayground) {
    console.log(
      `⚠️ Cacheo deshabilitado en modo playground (${photosToDownload.length} imágenes descargadas)`
    );
  }

  // ===== PASO 4: Crear texturas =====
  console.log(`🎨 Creando texturas para ${newPhotos.length} fotos...`);
  loaderStage.value = "creating";
  loaderTitle.value = "Creating Textures";

  const prepared = newPhotos.map((p) => ({
    ...p,
    lodObject: null,
    position: p.position || [0, 0, 0],
    billboardRotation: [0, 0, 0],
    __textureLoaded: false,
    __loading: false,
    __imageDownloaded: downloadedImagesCache.has(p.id),
    __downloading: false,
    __downloadError: !downloadedImagesCache.has(p.id),
    __canCreateTexture: downloadedImagesCache.has(p.id),
    isVisible: true,
  }));

  // Guardar posiciones originales
  if (originalPositions.value.length === 0) {
    originalPositions.value = prepared.map((p) => [...p.position]);
  } else {
    const newOriginals = prepared
      .slice(photosWithMaterials.value.length)
      .map((p) => [...p.position]);
    originalPositions.value = [...originalPositions.value, ...newOriginals];
  }

  photosWithMaterials.value = [...photosWithMaterials.value, ...prepared];

  if (inflateFactor.value !== 1.0) {
    applyRadialScaling();
  }

  applyFilters();

  // Encolar texturas iniciales (creación incremental)
  enqueueInitialTexturesBulk();

  // Reactivar navegación
  navigationBlocked.value = false;

  if (fpControls.value) {
    fpControls.value.setup();
  }
  if (touchControls.value) {
    touchControls.value.setup();
  }

  hideLoader();

  // Marcar octree para reconstrucción con nuevas fotos
  octreeNeedsRebuild.value = true;

  updateVisiblePhotos();
  updatePhotoEffects();
};

// ✨ Nueva función optimizada para cambios de chunk que reutiliza texturas
const updatePhotosPositions = async (newPhotos) => {
  const byId = new Map(newPhotos.map((p) => [p.id, p]));
  const existingById = new Map(photosWithMaterials.value.map((p) => [p.id, p]));

  // Guardar start positions para animación (solo de las que persisten)
  const startPositions = [];
  const targetPositions = [];
  const newOriginalPositions = [];

  // 1. Mutar existentes que siguen estando
  newPhotos.forEach((np) => {
    const existing = existingById.get(np.id);
    const targetPos = np.position || np.coordinates || [0, 0, 0];
    newOriginalPositions.push([...targetPos]);
    if (existing) {
      // preparar transición - usar posición ACTUAL como punto de inicio
      const currentPos = existing.position || targetPos;
      startPositions.push([...currentPos]);
      targetPositions.push([...targetPos]);
      existing.transitionStartPosition = [...currentPos];
      // NO actualizar existing.position aquí - se hará durante la animación
      existing.coordinates = targetPos;

      // 🔧 NO sincronizar LOD position aquí - mantener posición actual
      // La sincronización se hará durante la animación en updateTransitionPositions
    }
  });

  // 2. Añadir nuevas que no existían
  newPhotos.forEach((np) => {
    if (!existingById.has(np.id)) {
      const targetPos = np.position || np.coordinates || [0, 0, 0];
      const obj = {
        ...np,
        lodObject: null,
        position: [0, 0, 0],
        billboardRotation: [0, 0, 0],
        __textureLoaded: false,
        __loading: false,
        __imageDownloaded: false,
        __downloading: false,
        __downloadError: false,
        isVisible: true,
        transitionStartPosition: [0, 0, 0],
      };
      photosWithMaterials.value.push(obj);
      startPositions.push([0, 0, 0]);
      targetPositions.push([...targetPos]);
      newOriginalPositions.push([...targetPos]);
    }
  });

  // 3. Eliminar las que ya no vienen
  if (photosWithMaterials.value.length !== newPhotos.length) {
    const validIds = new Set(newPhotos.map((p) => p.id));

    // Limpiar LOD objects de fotos que se van a eliminar
    photosWithMaterials.value.forEach((photo) => {
      if (!validIds.has(photo.id) && photo.lodObject) {
        disposeLODObject(photo.lodObject);
      }
    });

    photosWithMaterials.value = photosWithMaterials.value.filter((p) =>
      validIds.has(p.id)
    );
  }

  // 🔧 NO actualizar originalPositions aquí - se hará cuando termine la animación
  // Guardar en variable temporal para actualizar después
  const pendingOriginalPositions = newOriginalPositions;

  // Marcar octree para reconstrucción después de la animación
  octreeNeedsRebuild.value = true;

  // Animar
  animatePositionTransition(
    startPositions,
    calculateScaledPositions(targetPositions, inflateFactor.value),
    pendingOriginalPositions // Pasar las nuevas posiciones originales para actualizar al final
  );

  // Imágenes a descargar (solo las nuevas)
  const toTexture = photosWithMaterials.value.filter(
    (p) => !p.__imageDownloaded && !p.__downloading
  );

  // Solo mostrar loader y bloquear navegación si hay fotos nuevas que descargar
  if (toTexture.length > 0) {
    console.log(`🔄 Hay ${toTexture.length} fotos nuevas por descargar`);
    await setupLoaderForPhotos(toTexture);
    showLoader();
    navigationBlocked.value = true;
    downloadPhaseComplete.value = false;
    cachePhaseComplete.value = false;

    // Intentar cargar desde cache primero
    const cachedCount = await loadImagesFromCache(toTexture);

    if (cachedCount > 0) {
      console.log(
        `⚡ ${cachedCount} fotos cargadas desde cache en cambio de chunk`
      );
      loaderStage.value = "downloading";
      loaderSubtitle.value = `Loading ${
        toTexture.length - cachedCount
      } remaining photos...`;
    }

    enqueueAllNonCachedPhotos(toTexture);

    // Iniciar loop mínimo de descarga si no está corriendo
    if (!downloadLoopId) {
      startDownloadLoop();
    }
    // Cuando termine descarga se encolarán texturas en checkAllTexturesLoaded()
  } else {
    console.log("✅ No hay fotos nuevas por descargar, solo recolocando");
    // Asegurar que el loader esté oculto
    hideLoader();
  }

  applyFilters();
  updatePhotoEffects(); // Aplica Billboard con distancias pre-calculadas

  // ⚠️ NOTA: NO actualizamos LOD aquí porque las posiciones están en transición
  // El LOD se actualizará automáticamente al finalizar la animación en updateTransitionPositions()
};

// Función para calcular posiciones escaladas sin modificar el estado
const calculateScaledPositions = (positions, scaleFactor) => {
  console.log("📏 calculateScaledPositions:", {
    inputLength: positions.length,
    scaleFactor,
    samplePositions: positions.slice(0, 2),
  });

  if (positions.length === 0) {
    console.warn("⚠️ calculateScaledPositions: array de posiciones vacío");
    return [];
  }

  // Calcular centroide de las posiciones
  const centroid = [
    positions.reduce((sum, pos) => sum + pos[0], 0) / positions.length,
    positions.reduce((sum, pos) => sum + pos[1], 0) / positions.length,
    positions.reduce((sum, pos) => sum + pos[2], 0) / positions.length,
  ];

  // Aplicar escaleo radial y devolver nuevas posiciones
  const scaledPositions = positions.map((originalPos) => {
    const vector = [
      originalPos[0] - centroid[0],
      originalPos[1] - centroid[1],
      originalPos[2] - centroid[2],
    ];

    return [
      centroid[0] + vector[0] * scaleFactor,
      centroid[1] + vector[1] * scaleFactor,
      centroid[2] + vector[2] * scaleFactor,
    ];
  });

  console.log("📏 Posiciones escaladas (sample):", scaledPositions.slice(0, 2));
  return scaledPositions;
};

// Función para aplicar escaleo radial
const applyRadialScaling = () => {
  if (
    photosWithMaterials.value.length === 0 ||
    originalPositions.value.length === 0
  )
    return;

  // 🔧 NO aplicar escalado durante una transición de animación
  // Esto evita que los LOD objects salten a posiciones incorrectas
  if (isTransitioning.value) {
    console.log("⏸️ Escalado radial pospuesto: animación en curso");
    return;
  }

  // Usar la función de cálculo y aplicar al estado
  const scaledPositions = calculateScaledPositions(
    originalPositions.value,
    inflateFactor.value
  );

  photosWithMaterials.value.forEach((photo, index) => {
    if (index >= scaledPositions.length) return;
    photo.position = scaledPositions[index];

    // Sync LOD object position
    if (photo.lodObject) {
      photo.lodObject.position.set(
        photo.position[0],
        photo.position[1],
        photo.position[2]
      );
    }
  });
};

// Handler para cambio en el slider de escaleo
const onInflateFactorChange = () => {
  applyRadialScaling();
  // Marcar octree para reconstrucción después de escalado radial
  octreeNeedsRebuild.value = true;
  updateVisiblePhotos();
  updatePhotoEffects(); // Aplica Billboard con distancias pre-calculadas
};

// (onPerformanceModeChange eliminado)

const updateVisiblePhotos = () => {
  if (!cameraRef.value || filteredPhotos.value.length === 0) {
    visiblePhotos.value = [];
    return;
  }

  const camera = cameraRef.value;

  // Rebuild octree if needed (after position changes)
  if (octreeNeedsRebuild.value && filteredPhotos.value.length > 0) {
    buildOctree(filteredPhotos.value);
    octreeNeedsRebuild.value = false;
    const stats = getOctreeStats();
    console.log("🌳 Octree rebuilt for frustum culling:", stats);
  }

  // 🔧 CRÍTICO: Mantener fotos filtradas con opacity=0 en lugar de visible=false
  // Esto asegura que las fotos filtradas se oculten pero sin usar visible
  const filteredIds = new Set(filteredPhotos.value.map((p) => p.id));
  photosWithMaterials.value.forEach((photo) => {
    if (
      !filteredIds.has(photo.id) &&
      photo.lodObject &&
      photo.lodObject.material
    ) {
      photo.lodObject.material.opacity = 0;
      photo.lodObject.material.transparent = true;
    }
  });

  // Reutilizar objetos existentes para evitar garbage collection
  reusableMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  reusableFrustum.setFromProjectionMatrix(reusableMatrix);

  // � OPTIMIZACIÓN OCTREE: Query solo objetos en nodos relevantes
  const candidatePhotos =
    filteredPhotos.value.length > 100
      ? queryFrustum(reusableFrustum)
      : filteredPhotos.value;

  // �🔥 CRÍTICO: Filtrar SOLO fotos que intersectan con el frustum ACTUAL
  // Verificación final con esfera para mayor precisión
  visiblePhotos.value = candidatePhotos.filter((photo) => {
    // 🔧 PRIMER CHECK: Respetar filtros - si está explícitamente oculta, skip (opacity ya está en 0)
    if (photo.isVisible === false) {
      return false;
    }

    reusableVector3.set(...photo.position);
    reusableSphere.set(reusableVector3, 2); // Radio de la esfera de la foto

    // Verificar frustum para fotos dentro del rango visible
    const isInFrustum = reusableFrustum.intersectsSphere(reusableSphere);

    // TODAS LAS FOTOS SON SIEMPRE VISIBLES - no tocar visible en absoluto
    // La opacidad se controla en applyDistanceFading

    return isInFrustum;
  });

  // 🔍 DEBUG: Log para verificar filtrado
  if (
    frameCounter % 60 === 0 &&
    (selectedVisualAspects.value.length > 0 ||
      selectedArtisticScores.value.length > 0)
  ) {
    console.log("🔍 updateVisiblePhotos:", {
      candidatePhotos: candidatePhotos.length,
      filteredOut: candidatePhotos.filter((p) => p.isVisible === false).length,
      visiblePhotos: visiblePhotos.value.length,
      totalPhotos: photosWithMaterials.value.length,
    });
  }

  // Actualizar cache de fotos con texturas cargadas
  visiblePhotos.value.forEach((photo) => {
    if (photo.__textureLoaded) {
      cachedPhotosSet.add(photo.id);
    }
  });

  // Rehidratar: cualquier foto visible que fue evictada y cuya imagen ya está en cache
  visiblePhotos.value.forEach((photo) => {
    if (
      photo.__evicted &&
      !photo.__textureLoaded &&
      downloadedImagesCache.has(photo.id) &&
      !textureCreationQueue.includes(photo)
    ) {
      enqueueTexture(photo);
      photo.__evicted = false;
    }
  });

  // Encolar para carga real SOLO las que están visibles, no cargadas, y necesitan descarga de red
  const cameraPos = camera.position;
  visiblePhotos.value.forEach((photo) => {
    if (
      !photo.__imageDownloaded &&
      !photo.__downloading &&
      !queuedIds.has(photo.id) &&
      !scheduledDownloads.has(photo.id)
    ) {
      // Pre-calcular prioridad por distancia al cuadrado (sin sqrt)
      const dx = photo.position[0] - cameraPos.x;
      const dy = photo.position[1] - cameraPos.y;
      const dz = photo.position[2] - cameraPos.z;
      photo.__priority = dx * dx + dy * dy + dz * dz;
      textureQueue.value.push(photo.id);
      queuedIds.add(photo.id);
    }
  });

  // Ordenar cola global una vez tras inserciones (small optimization)
  if (textureQueue.value.length > 1) {
    textureQueue.value.sort((aId, bId) => {
      const a = photosWithMaterials.value.find((p) => p.id === aId);
      const b = photosWithMaterials.value.find((p) => p.id === bId);
      return (a?.__priority || 0) - (b?.__priority || 0);
    });
  }
};

// 🚀 NUEVA: Calcular distancias para todas las fotos visibles UNA SOLA VEZ por frame
// Esto evita recalcular distancias múltiples veces en LOD y Billboard
// Nota: La opacidad ya está pre-establecida en cada nivel LOD
const calculateDistancesForVisiblePhotos = (cameraPosition) => {
  return visiblePhotos.value.map((photo) => {
    const distSq =
      Math.pow(cameraPosition.x - photo.position[0], 2) +
      Math.pow(cameraPosition.y - photo.position[1], 2) +
      Math.pow(cameraPosition.z - photo.position[2], 2);

    return {
      photo,
      distSq,
      distance: Math.sqrt(distSq), // Calcular una sola vez
    };
  });
};

// 🎯 Helper: Actualizar Billboard con cálculo de distancias integrado
// Usar esta función cuando se llame fuera del loop principal
// Nota: La opacidad ya está pre-establecida en cada nivel LOD, no necesita cálculo
const updatePhotoEffects = () => {
  if (!cameraRef.value || visiblePhotos.value.length === 0) return;

  const photosWithDistances = calculateDistancesForVisiblePhotos(
    cameraRef.value.position
  );

  // Ordenar por distancia una sola vez
  photosWithDistances.sort((a, b) => a.distSq - b.distSq);

  // Aplicar billboarding
  if (useBillboarding.value) updateBillboardRotations(photosWithDistances);

  // El fading ya se aplica cada frame en el loop principal, no hace falta aquí
};

// Función para actualizar rotaciones billboard
// 🎯 OPTIMIZADO: Usa distancias pre-calculadas y aplica solo a fotos cercanas
// (fotos lejanas son pequeñas, no se nota tanto la rotación)
const updateBillboardRotations = (photosWithDistances) => {
  if (!cameraRef.value || photosWithDistances.length === 0) return;

  const camera = cameraRef.value;
  const cameraPosition = camera.position;

  // 🎯 Solo aplicar billboard a fotos cercanas si hay muchas
  // (optimización visual: fotos lejanas son tan pequeñas que no se nota)
  let photosToProcess = photosWithDistances;

  if (photosWithDistances.length > MAX_PHOTOS_FOR_BILLBOARD) {
    // Ya vienen ordenadas por distancia, solo tomar las N más cercanas
    photosToProcess = photosWithDistances.slice(0, MAX_PHOTOS_FOR_BILLBOARD);

    dlog(
      `🎨 Billboard: Procesando ${photosToProcess.length}/${photosWithDistances.length} fotos cercanas`
    );
  }

  // 🚀 Billboard directo: aplicar lookAt() sin interpolación
  // Es el método más eficiente y suave (sin retraso)
  photosToProcess.forEach(({ photo }) => {
    if (!photo.lodObject) return;

    // Aplicar lookAt() directamente al LOD object
    // Three.js optimiza esto internamente
    photo.lodObject.lookAt(cameraPosition);
  });
};

// Parámetros de fading simplificados

const applyDistanceFading = (photosWithDistances) => {
  if (!cameraRef.value) return;
  // IMPORTANTE: procesar TODAS las fotos con lodObject, no solo visibles en frustum
  // porque fotos lejanas/ocultas también necesitan fade para no verse opacas al girar
  const allPhotosToFade = photosWithMaterials.value.filter((p) => p.lodObject);
  if (allPhotosToFade.length === 0) return;

  // Simplificado: usar distancias absolutas fijas para fading
  const fadeStart = FADE_START_ABSOLUTE;
  const fadeEnd = FADE_END_ABSOLUTE;
  const fadeRange = Math.max(1, fadeEnd - fadeStart);

  const cameraPos = cameraRef.value.position;

  for (const photo of allPhotosToFade) {
    // Calcular distancia para todas las fotos, no usar precalculada de visibles
    const dx = photo.position[0] - cameraPos.x;
    const dy = photo.position[1] - cameraPos.y;
    const dz = photo.position[2] - cameraPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const mesh = photo.lodObject.isLOD ? null : photo.lodObject;
    if (!mesh || !mesh.material) continue;

    // 🔧 CRÍTICO: Respetar filtros - ocultar con opacity si está filtrada
    if (photo.isVisible === false) {
      mesh.material.opacity = 0;
      mesh.material.transparent = true;
    } else {
      // Aplicar transparencia basada en distancia
      if (distance < fadeStart) {
        mesh.material.opacity = 1.0;
      } else if (distance >= fadeEnd) {
        mesh.material.opacity = 0.05; // Opacidad muy baja en lugar de ocultar
      } else {
        const fadeProgress = (distance - fadeStart) / fadeRange;
        mesh.material.opacity = Math.max(0.05, 1.0 - fadeProgress);
      }
      mesh.material.transparent = true;
    }
  }
};

// Handler para cambio de chunk
const onChunkChange = async (newValue) => {
  // 🚨 MOSTRAR LOADER INMEDIATAMENTE antes de la llamada a la API
  loaderTitle.value = "Building stage";
  loadingProgress.value = 0;
  showLoader();

  // Si no hay fotos existentes, hacer limpieza completa
  if (photosWithMaterials.value.length === 0) {
    console.log("🧹 Primera carga: limpieza completa");
    visiblePhotos.value = [];
    originalPositions.value = [];
    textureQueue.value = [];
    queuedIds.clear();
  } else {
    console.log(
      "♻️ Fotos existentes detectadas: manteniendo LODs, solo actualizando posiciones"
    );
    // NO limpiar LOD objects - solo limpiar cola de texturas
    // Los LODs se reutilizarán y solo se actualizarán sus posiciones
    textureQueue.value = [];
    queuedIds.clear();
  }

  await changeChunk(newValue);
};

// Función de retry
const retryLoad = async () => {
  reset();
  showLoader();
  loaderTitle.value = "Building stage";
  await loadAllPhotos(currentChunk.value);
};

// Función de animación
const animate = () => {
  const frameStart = performance.now();
  frameCounter++;

  // Calcular frame time y ajustar batch dinámico (Quick Win 2)
  if (!animate._last) animate._last = frameStart;
  const frameTime = frameStart - animate._last;
  animate._last = frameStart;
  if (frameTime < 14 && dynamicBatch < MAX_BATCH) dynamicBatch++;
  else if (frameTime > 26 && dynamicBatch > MIN_BATCH) dynamicBatch--;

  // Bloquear controles durante fase de descarga inicial
  if (!navigationBlocked.value) {
    // Update keyboard/mouse controls
    if (fpControls.value) {
      fpControls.value.update();
    }
    // Update touch controls if available
    if (touchControls.value) {
      touchControls.value.update();
    }
  }

  // Actualizar transición de posiciones si está activa
  if (isTransitioning.value) {
    updateTransitionPositions(frameStart);
  }

  // Actualizar posición actual
  let cameraPositionChanged = false;
  if (cameraRef.value) {
    const pos = cameraRef.value.position;
    const newPosition = {
      x: pos.x,
      y: pos.y,
      z: pos.z,
    };

    // Check if camera has moved significantly
    const dx = newPosition.x - lastCameraPosition.x;
    const dy = newPosition.y - lastCameraPosition.y;
    const dz = newPosition.z - lastCameraPosition.z;
    const distanceMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distanceMoved > CAMERA_MOVE_THRESHOLD) {
      cameraPositionChanged = true;
      lastCameraPosition = { ...newPosition };
    }

    currentPosition.value = newPosition;
  }

  const frustumInterval = initialLoadingPhase.value ? 9 : THROTTLE_INTERVAL;

  // Solo ejecutar eventos Three.js si no estamos en fase de descarga bloqueada
  if (!navigationBlocked.value) {
    if (frameCounter % frustumInterval === 0 || cameraPositionChanged) {
      updateVisiblePhotos();

      // Update LOD levels based on camera position (THREE.LOD.update())
      if (cameraRef.value) {
        visiblePhotos.value.forEach((photo) => {
          if (photo.lodObject && photo.lodObject.isLOD) {
            photo.lodObject.update(cameraRef.value);
          }
        });
      }

      // Calcular distancias UNA SOLA VEZ para todo el frame
      if (visiblePhotos.value.length > 0 && cameraRef.value) {
        const photosWithDistances = calculateDistancesForVisiblePhotos(
          cameraRef.value.position
        );

        // Ordenar por distancia una sola vez (de cerca a lejos)
        photosWithDistances.sort((a, b) => a.distSq - b.distSq);

        // Aplicar billboarding (la opacidad ya está en los materiales LOD)
        if (useBillboarding.value)
          updateBillboardRotations(photosWithDistances);
      }
    }

    // Aplicar fading SIEMPRE cada frame (no throttled) para respuesta inmediata
    // La función ahora procesa todas las fotos internamente
    if (cameraRef.value && photosWithMaterials.value.length > 0) {
      applyDistanceFading();
    }
  }

  // Procesar cola de descargas (siempre, incluso durante bloqueo)
  processTextureQueue();

  animationId = requestAnimationFrame(animate);
};

// Procesador de cola usando p-limit: enqueuea tareas (opcionalmente toda la cola) respetando prioridad ya calculada
const processTextureQueue = () => {
  if (textureQueue.value.length === 0) return;

  // Limpieza ligera de elementos inválidos / ya descargados al frente
  while (textureQueue.value.length) {
    const idFront = textureQueue.value[0];
    const objFront = photosWithMaterials.value.find((p) => p.id === idFront);
    if (!objFront || objFront.__imageDownloaded) {
      textureQueue.value.shift();
      queuedIds.delete(idFront);
      continue;
    }
    break;
  }

  if (textureQueue.value.length === 0) return;

  const toSchedule = FULL_QUEUE_SCHEDULING
    ? textureQueue.value.length
    : Math.min(dynamicBatch, textureQueue.value.length);

  // Nota: p-limit mantiene su propia cola; aquí simplemente pre-programamos en orden de prioridad.
  for (let i = 0; i < toSchedule; i++) {
    const id = textureQueue.value.shift();
    queuedIds.delete(id);
    const photoObj = photosWithMaterials.value.find((p) => p.id === id);
    if (
      !photoObj ||
      photoObj.__imageDownloaded ||
      photoObj.__downloading ||
      scheduledDownloads.has(id)
    )
      continue;
    scheduledDownloads.add(id);
    limitTexture(() => downloadImageOnly(photoObj))
      .catch(() => {})
      .finally(() => {
        scheduledDownloads.delete(id);
        // Cuando terminen todas las tareas pendientes y la cola esté vacía, verificar loader
        if (textureQueue.value.length === 0) {
          // microtask para esperar a que otras finalizaciones entren
          queueMicrotask(() => checkAllTexturesLoaded());
        } else if (!FULL_QUEUE_SCHEDULING) {
          // En modo incremental, intenta seguir drenando sin esperar al próximo frame
          queueMicrotask(() => processTextureQueue());
        }
      });
  }
};

// Loop mínimo solo para descargas (sin eventos Three.js)
let downloadLoopId = null;
const startDownloadLoop = () => {
  const downloadLoop = () => {
    // Solo procesar cola de descargas, sin eventos Three.js
    processTextureQueue();

    // Continuar mientras esté bloqueada la navegación
    if (navigationBlocked.value) {
      downloadLoopId = requestAnimationFrame(downloadLoop);
    } else {
      // Cuando termine fase de descarga, limpiar y el loop normal tomará el control
      downloadLoopId = null;
    }
  };

  downloadLoopId = requestAnimationFrame(downloadLoop);
};

// Inicializar controles FPS
const initFirstPersonControls = () => {
  if (!cameraRef.value || !containerRef.value) {
    console.warn("Camera or container not available for controls");
    return;
  }

  const camera = cameraRef.value;
  const domElement = containerRef.value;

  // Initialize appropriate controls based on touch capability
  if (hasTouch.value) {
    console.log("📱 Initializing touch controls for touch-enabled device");
    touchControls.value = useTouchControls(camera, domElement);

    // Solo activar controles si no estamos en fase de descarga bloqueada
    if (!navigationBlocked.value) {
      touchControls.value.setup();
    }

    // Configure touch controls (same profile as keyboard controls)
    touchControls.value.setSpeedProfile({
      initial: 0.01,
      max: 45,
      accelerateInSeconds: 12.5,
    });
    touchControls.value.setAccelerationRate(5);
    touchControls.value.setWorldScale(2);
    touchControls.value.setTouchSensitivity(0.0025);
  } else {
    console.log("🖱️ Initializing keyboard/mouse controls for non-touch device");
    fpControls.value = useFirstPersonControls(camera, domElement);

    // Solo activar controles si no estamos en fase de descarga bloqueada
    if (!navigationBlocked.value) {
      fpControls.value.setup();
    }

    fpControls.value.setSpeedProfile({
      initial: 0.01, // control fino inicial
      max: 45, // velocidad tope (ajustable)
      accelerateInSeconds: 12.5,
    });
    // Bajar aceleración lineal para que accelerateInSeconds tenga efecto
    fpControls.value.setAccelerationRate(5); // de 60 → 5 (mucho más suave)
    // Ajustar escalado global si el espacio es muy grande
    fpControls.value.setWorldScale(2); // duplica desplazamiento efectivo
    // Sensibilidad de ratón
    fpControls.value.setMouseSensitivity(0.0025);
    // Factor de velocidad de rueda del ratón más lento
    fpControls.value.setWheelSpeedFactor(0.15); // 15% = mucho más lento
    // Activar debug temporalmente para verificar
    fpControls.value.toggleDebug(true);
    setTimeout(() => fpControls.value.toggleDebug(false), 5000);
  }

  // Iniciar loop de animación
  animate();
};

// Watcher: registrar nuevas fotos con placeholder y carga inmediata de texturas cacheadas
watch(
  photos3D,
  async (newPhotos, oldPhotos) => {
    if (newPhotos.length > 0) {
      // Si no hay fotos con materiales (primera carga o limpieza completa)
      if (photosWithMaterials.value.length === 0) {
        await registerNewPhotos(newPhotos);
      }
      // Si ya tenemos fotos con materiales (cambio de chunk u optimización)
      else if (photosWithMaterials.value.length > 0) {
        await updatePhotosPositions(newPhotos);
      }
      // Si son fotos adicionales (paginación) - caso menos común
      else if (newPhotos.length > photosWithMaterials.value.length) {
        const newPhotosOnly = newPhotos.slice(photosWithMaterials.value.length);
        console.log(
          "📸 Registrando fotos adicionales (paginación):",
          newPhotosOnly.length
        );
        await registerNewPhotos(newPhotosOnly);
      }
    } else {
      console.log("⚠️ Watcher photos3D: No se ejecutó ninguna acción.", {
        newPhotosLength: newPhotos.length,
        photosWithMaterialsLength: photosWithMaterials.value.length,
        reason:
          newPhotos.length === 0
            ? "No hay fotos nuevas"
            : "Condiciones no cumplidas",
      });
    }
  },
  { immediate: false }
);

// Watcher: controlar el loader central cuando esté cargando
watch(isLoadingPositions, (newIsLoading, oldIsLoading) => {
  if (newIsLoading) {
    console.log("⏳ Proceso de carga iniciado");
    // No mostrar el loader aquí, se maneja en registerNewPhotos/updatePhotosPositions
  } else {
    console.log(
      "✅ isLoadingPositions = false, verificando si todas las texturas están listas"
    );
    // Cuando termine de cargar, verificar si todas las texturas están listas
    checkAllTexturesLoaded();
  }
});

// Watcher para aspectos visuales seleccionados
watch(
  selectedVisualAspects,
  () => {
    console.log(
      "🔄 selectedVisualAspects watcher triggered:",
      selectedVisualAspects.value
    );
    applyFilters();
    updateVisiblePhotos();
    updatePhotoEffects(); // Usa helper que calcula distancias internamente
  },
  { deep: true }
);

// Watcher para sincronizar currentChunk del composable con el selector local
watch(
  currentChunk,
  (newValue) => {
    if (selectedChunk.value !== newValue) {
      selectedChunk.value = newValue;
    }
  },
  { immediate: true }
);

// ResizeObserver para manejar cambios de tamaño sin disparar recargas
let resizeObserver = null;

// Lifecycle
onMounted(async () => {
  try {
    // Initialize showConfigPanel based on mobile detection
    // Wait a tick to ensure isMobile has been computed
    await nextTick();
    showConfigPanel.value = !isMobile.value;

    // Initialize IndexedDB
    console.log("💾 Inicializando IndexedDB cache...");
    try {
      await initDB();
      cacheStats.value = await getCacheStats();
      console.log(
        `✅ IndexedDB inicializado. Imágenes en cache: ${cacheStats.value.totalImages}`
      );
    } catch (error) {
      console.warn(
        "⚠️ No se pudo inicializar IndexedDB, funcionando sin cache:",
        error
      );
    }

    // Configuración siempre en modo low-power (sin GPU detection)
    console.log("🔧 Configuración de bajo rendimiento aplicada:");
    console.log("   - pixelRatio = 0.75");
    console.log("   - powerPreference = low-power");
    console.log("   - precision = lowp");

    // Configurar aspect ratio inicial
    updateCameraAspect();

    // Configurar ResizeObserver para manejar cambios de tamaño SIN recargar fotos
    if (containerRef.value && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        // Throttle para evitar actualizaciones excesivas
        requestAnimationFrame(() => {
          updateCameraAspect();
          console.log(
            "📼 Aspect ratio actualizado por resize:",
            cameraAspect.value
          );
        });
      });
      resizeObserver.observe(containerRef.value);
    }

    // Cargar fotos iniciales - usar un chunk por defecto si currentChunk es null
    const initialChunk = currentChunk.value || "story";
    // Sincronizar selector local
    selectedChunk.value = initialChunk;

    // Asegurar que currentChunk refleje el valor inicial
    if (currentChunk.value === null) {
      currentChunk.value = initialChunk;
    }
    loaderTitle.value = "Building stage";
    await loadAllPhotos(initialChunk);

    // Inicializar controles después de un pequeño delay
    setTimeout(() => {
      initFirstPersonControls();
    }, 100);
  } catch (error) {
    console.error("Error initializing 3D photos:", error);
    showDiscreteLoader.value = false;
  }
});

onUnmounted(() => {
  // Clear search timeout on unmount
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }

  // Mostrar estadísticas finales de errores 429
  if (error429Stats.value.total > 0) {
    console.log("📊 Estadísticas finales de errores 429:", {
      total: error429Stats.value.total,
      retried: error429Stats.value.retried,
      recovered: error429Stats.value.recovered,
      failed: error429Stats.value.failed,
      recoveryRate: `${Math.round(
        (error429Stats.value.recovered / error429Stats.value.total) * 100
      )}%`,
    });
  }

  // Ocultar loader discreto
  showDiscreteLoader.value = false;

  // Limpiar ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  // Limpiar controles FPS y touch
  if (fpControls.value) {
    fpControls.value.cleanup();
  }
  if (touchControls.value) {
    touchControls.value.cleanup();
  }

  // Cancelar animaciones
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (downloadLoopId) {
    cancelAnimationFrame(downloadLoopId);
  }

  // Limpiar caches
  distanceCache.clear();

  // Limpiar octree y su visualización debug
  clearOctree();

  // Limpiar objetos LOD
  photosWithMaterials.value.forEach((photo) => {
    if (photo.lodObject) {
      disposeLODObject(photo.lodObject);
    }
  });

  // Clear LOD group
  while (lodGroup.children.length > 0) {
    lodGroup.remove(lodGroup.children[0]);
  }

  // Limpiar cache de imágenes
  downloadedImagesCache.clear();
});
</script>

<style scoped>
.photos-3d-container {
  width: 100%;
  height: 100vh;
  position: relative;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  cursor: crosshair;
  /* Touch-specific optimizations */
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.photos-3d-container:fullscreen {
  cursor: none;
}

/* Mobile-specific cursor - use grab cursor for touch devices */
@media (hover: none) and (pointer: coarse) {
  .photos-3d-container {
    cursor: grab;
  }
  .photos-3d-container:active {
    cursor: grabbing;
  }
}

.ui-overlay {
  position: absolute;
  top: 70px;
  right: 15px;
  pointer-events: none;
  z-index: 100;
  /* Reserved for future UI elements */
}

.control-panel {
  background: rgba(26, 26, 31, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  min-width: 300px;
  max-width: 350px;
  max-height: 85vh;
  overflow-y: auto;
  overflow-x: hidden; /* Prevent horizontal scroll */
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: fixed;
  right: 15px;
  z-index: 2000;
  pointer-events: auto;
}

/* Mobile-specific styles for control panel */
@media (max-width: 767px) {
  .control-panel {
    min-width: 280px;
    max-width: calc(100vw - 10px);
    max-height: 80vh;
    top: 5px;
    right: 5px;
    padding: 8px;
  }

  .control-section {
    padding: 10px;
  }

  .section-title {
    font-size: 13px;
  }

  .control-label {
    font-size: 11px;
  }
}

.control-section {
  padding: var(--spacing-md);
}

.control-section:not(:last-child) {
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}

.section-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.control-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.control-item:last-child {
  margin-bottom: 0;
}

.control-item-full {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.control-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium, 500);
}

/* Toggle Section Styles */
.section-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
  padding: 8px 0;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.section-toggle:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

.section-toggle-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.section-toggle-indicators {
  display: flex;
  align-items: center;
  gap: 6px;
}

.active-indicator {
  font-size: 9px;
  color: #2563eb;
  background-color: rgba(37, 99, 235, 0.15);
  padding: 2px 5px;
  border-radius: 4px;
  font-weight: 600;
  min-width: 14px;
  text-align: center;
}

.toggle-icon {
  color: rgba(255, 255, 255, 0.5);
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* Filters Container */
.filters-container {
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.filters-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* Options Container (for Display Options) */
.options-container {
  margin-top: 0px;
  animation: slideDown 0.3s ease-out;
  display: flex;
  flex-direction: column;
}

/* Collapsed Panel (Small Corner Button) */
.collapsed-panel {
  position: fixed;
  top: 70px;
  right: 15px;
  width: 48px;
  height: 48px;
  background: rgba(26, 26, 31, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  z-index: 2000;
  pointer-events: auto;
}

/* Mobile-specific styles for collapsed panel */
@media (max-width: 767px) {
  .collapsed-panel {
    top: 5px;
    right: 5px;
    width: 42px;
    height: 42px;
  }

  .collapsed-panel .settings-icon {
    font-size: 18px;
  }
}

.collapsed-panel:hover {
  background: rgba(35, 35, 40, 0.95);
  border-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.collapsed-panel .settings-icon {
  color: #ffffff;
  font-size: 20px;
  transition: color 0.2s ease;
}

/* Expanded Panel Header */
.panel-header-expanded {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 16px;
}

.panel-title {
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.close-panel-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.close-panel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.close-panel-btn-corner {
  position: absolute;
  top: 3px;
  right: 3px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  z-index: 10;
}

.close-panel-btn-corner:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

/* Embedding Select */
.embedding-select {
  width: 100%;
}

/* Aspects Select */
.aspects-select {
  width: 100%;
}

/* Text Search Input */
.text-search-input {
  width: 100%;
}

.search-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-results-info {
  margin-top: 8px;
  font-size: 12px;
  color: var(--primary-color);
  text-align: center;
}

/* Slider Container */
.slider-container {
  width: 100%;
  padding: 0 8px 0 4px; /* Minimal padding, more on right to prevent overflow */
  box-sizing: border-box;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.radial-slider,
.lod-slider {
  width: 100%;
}

/* Adjust n-slider mark labels to be smaller and prevent overflow */
.radial-slider :deep(.n-slider-marks),
.lod-slider :deep(.n-slider-marks) {
  padding: 0 2px; /* Add small padding to marks container */
}

.radial-slider :deep(.n-slider-mark),
.lod-slider :deep(.n-slider-mark) {
  font-size: 9px !important;
  white-space: nowrap;
  overflow: visible;
  color: rgba(255, 255, 255, 0.8) !important;
}

.radial-slider :deep(.n-slider-mark-text),
.lod-slider :deep(.n-slider-mark-text) {
  font-size: 9px !important;
  transform: translateX(-50%);
  max-width: 60px;
  text-align: center;
  color: rgba(255, 255, 255, 0.8) !important;
}

/* Special handling for first and last marks to prevent overflow */
.radial-slider :deep(.n-slider-mark:first-child .n-slider-mark-text),
.lod-slider :deep(.n-slider-mark:first-child .n-slider-mark-text) {
  transform: translateX(0);
  text-align: left;
}

.radial-slider :deep(.n-slider-mark:last-child .n-slider-mark-text),
.lod-slider :deep(.n-slider-mark:last-child .n-slider-mark-text) {
  transform: translateX(-100%);
  text-align: right;
}

/* Info Icon */
.info-icon {
  color: var(--text-secondary);
  cursor: help;
  transition: color 0.2s ease;
}

.info-icon:hover {
  color: var(--text-primary);
}

/* Controls Info */
.controls-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.control-tip {
  margin: var(--spacing-xs) 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.4;
}

.control-tip:last-child {
  margin-bottom: 0;
}

.control-tip strong {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold, 600);
}

/* Animations for panel */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Error Screen */
.error-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-body);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.error-content {
  text-align: center;
  color: var(--text-primary);
  max-width: 400px;
  padding: var(--spacing-xl);
}

.error-content h2 {
  margin: 0 0 var(--spacing-lg) 0;
  font-size: var(--font-size-lg);
  color: var(--error-color);
}

.error-content p {
  margin: 0 0 var(--spacing-xl) 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.retry-btn {
  background: var(--primary-color);
  color: var(--text-primary);
  border: none;
  padding: var(--spacing-md) var(--spacing-2xl);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all 0.3s ease;
}

.retry-btn:hover {
  background: var(--primary-color-hover);
  transform: translateY(-1px);
}

.retry-btn:active {
  transform: translateY(0);
}

/* Discrete Loader */
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
  margin: 0;
  white-space: nowrap;
}

.loader-percentage {
  color: var(--primary-color, #3b82f6);
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-semibold, 600);
  white-space: nowrap;
}

.loader-stage-badge {
  font-size: 16px;
  line-height: 1;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}
</style>
