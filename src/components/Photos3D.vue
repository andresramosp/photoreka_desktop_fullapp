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
        :position="[0, 0, 250]"
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
        <div class="section-toggle" @click="toggleMoreFilters">
          <span class="section-toggle-label">Search filters</span>
          <div class="section-toggle-indicators">
            <span
              v-if="
                selectedVisualAspects.length > 0 ||
                Object.keys(artisticScoreFilters).length > 0 ||
                searchResults.length > 0
              "
              class="active-indicator"
            >
              {{
                selectedVisualAspects.length +
                Object.keys(artisticScoreFilters).length +
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
            <div v-if="!isPlayground" class="filter-item">
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

            <!-- Artistic Scores Filter (Collapsible) -->
            <div class="filter-item">
              <div
                class="scores-toggle"
                @click="showArtisticScores = !showArtisticScores"
              >
                <div style="display: flex; align-items: center; gap: 4px">
                  <span class="scores-toggle-label">Visual Scores</span>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon size="12" color="#ffffffd1" style="cursor: help">
                        <InfoCircleFilled />
                      </n-icon>
                    </template>
                    Filter photos by minimum score threshold (1-10)
                  </n-tooltip>
                </div>
                <div style="display: flex; align-items: center; gap: 8px">
                  <button
                    v-if="Object.keys(artisticScoreFilters).length > 0"
                    @click.stop="clearArtisticScores"
                    class="clear-scores-btn"
                    title="Clear all scores"
                  >
                    <n-icon size="12">
                      <CloseOutlined />
                    </n-icon>
                  </button>
                  <n-icon
                    size="12"
                    class="toggle-icon"
                    :class="{ rotated: showArtisticScores }"
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

              <!-- Collapsible Scores Content -->
              <div v-if="showArtisticScores" class="artistic-scores-sliders">
                <div
                  v-for="(group, groupKey) in artisticScoresGroups"
                  :key="groupKey"
                  class="score-group"
                >
                  <div class="score-group-header">{{ group.label }}</div>
                  <div
                    v-for="criterion in group.criteria"
                    :key="criterion.value"
                    class="score-slider-item"
                  >
                    <div class="score-slider-header">
                      <span class="score-slider-label">{{
                        criterion.label
                      }}</span>
                      <span
                        v-if="artisticScoreFilters[criterion.value]"
                        class="score-slider-value"
                      >
                        ≥ {{ artisticScoreFilters[criterion.value] }}
                      </span>
                    </div>
                    <n-slider
                      v-model:value="artisticScoreFilters[criterion.value]"
                      :min="1"
                      :max="10"
                      :step="0.5"
                      :disabled="showDiscreteLoader"
                      @update:value="onArtisticScoresChange"
                      @click.stop
                      class="score-slider"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Display Options Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleDisplayOptions">
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

          <!-- Floating Tags Toggle -->
          <div
            class="control-item"
            style="
              margin-top: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            "
          >
            <label class="control-label" style="margin: 0"
              >Show Floating Tags</label
            >
            <n-switch
              v-model:value="floatingTagsSystem.config.enabled"
              size="small"
              @click.stop
            />
          </div>

          <!-- Detection Radius Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Tags Detection Radius
            </label>
            <div class="slider-container">
              <n-slider
                v-model:value="floatingTagsSystem.config.detectionRadius"
                :min="20"
                :max="150"
                :step="10"
                :marks="{ 20: '20', 50: '50', 100: '100', 150: '150' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>

          <!-- Max Tags Slider -->
          <div class="control-item-full" style="margin-top: 12px">
            <label
              class="control-label"
              style="margin-bottom: 8px; display: block"
            >
              Max Tags to Show
            </label>
            <div class="slider-container">
              <n-slider
                v-model:value="floatingTagsSystem.config.maxTagsToShow"
                :min="5"
                :max="30"
                :step="5"
                :marks="{ 5: '5', 15: '15', 30: '30' }"
                class="radial-slider"
                @click.stop
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Controls Toggle -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleNavigationControls">
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
              <div class="control-icon-group">
                <span class="control-icon-text">🖱️</span>
                <span class="control-text"
                  >Right-click on stage to activate camera controls</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">👆</span>
                <span class="control-text"
                  >Left-click on photos to select/deselect</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">🖱️⚙️</span>
                <span class="control-text">Accelerate movement speed</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-key">Esc</div>
                <span class="control-text">Return to normal mouse</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-keys-group">
                  <div class="keyboard-key">W</div>
                  <div class="keyboard-key">A</div>
                  <div class="keyboard-key">S</div>
                  <div class="keyboard-key">D</div>
                </div>
                <span class="control-text">Forward/back/left/right</span>
              </div>
            </div>

            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-key">F</div>
                <span class="control-text">Move up</span>
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <div class="keyboard-key">V</div>
                <span class="control-text">Move down</span>
              </div>
            </div>
          </template>

          <!-- Touch Controls (Mobile) -->
          <template v-else>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">☝️</span>
                <span class="control-text"
                  >One finger drag to rotate camera view</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">🤏</span>
                <span class="control-text"
                  >Two finger pinch to move forward/backward</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">✌️</span>
                <span class="control-text"
                  >Two finger drag to move left/right/forward/back</span
                >
              </div>
            </div>
            <div class="control-tip">
              <div class="control-icon-group">
                <span class="control-icon-text">💡</span>
                <span class="control-text"
                  >Combine gestures for smooth navigation</span
                >
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Floating Tags Display (individual floating tags) -->
    <div
      v-if="
        floatingTagsSystem &&
        floatingTagsSystem.config.enabled &&
        floatingTagsSystem.activeTags.length > 0
      "
      class="floating-tags-wrapper"
    >
      <div
        v-for="(tag, index) in floatingTagsSystem.activeTags"
        :key="`${tag.category}_${tag.name}`"
        class="floating-tag"
        :style="{
          '--tag-color': tag.color,
          '--tag-index': index,
          opacity: 0.7 + tag.intensity * 0.3,
        }"
      >
        {{ tag.name }}
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
            :src="photo.thumbnailUrl || photo.url || photo.originalUrl"
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
      <span
        v-if="loaderStage === 'downloading' && loadingProgress > 0"
        class="loader-percentage"
        >{{ loadingProgress }}%</span
      >
    </div>

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedPhotoIds.length"
      :photo-ids="selectedPhotoIds"
      @add-to-collection="handleCollectionAdded"
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
  markRaw,
  nextTick,
} from "vue";
import { TresCanvas } from "@tresjs/core";
import {
  NTooltip,
  NSelect,
  NIcon,
  NSlider,
  NTreeSelect,
  NSwitch,
  useMessage,
} from "naive-ui";
import { CloseOutlined, SettingOutlined, InfoCircleFilled } from "@vicons/antd";
import { useRouter } from "vue-router";

import FixedActionBar from "@/components/3d-atlas/FixedActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { use3DPhotos } from "@/composables/3d-viewer/use3DPhotos.js";
import { useFirstPersonControls } from "@/composables//3d-viewer/useFirstPersonControls.js";
import { useTouchControls } from "@/composables/3d-viewer/useTouchControls.js";
import { useFloatingTags } from "@/composables/3d-viewer/useFloatingTags.js";
import { usePhotoTextureManager } from "@/composables/3d-viewer/usePhotoTextureManager.js";
import { use3DPhotoEffects } from "@/composables/3d-viewer/use3DPhotoEffects.js";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useHasTouch } from "@/composables/useHasTouch.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { api } from "@/utils/axios";
import * as THREE from "three";
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

// Initialize composables and utilities
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

// 🎯 Sistema de fade basado en densidad DIRECCIONAL (muro de niebla hacia adelante)
// Composable para manejo de fotos 3D (pasar userId si está en modo catálogo y lowPerformance)
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

// 🆕 Composable para gestión de texturas
const textureManager = usePhotoTextureManager(
  useLowPerformance.value,
  props.isPlayground
);

// 🆕 Composable para efectos visuales
const effectsManager = use3DPhotoEffects();

// Extraer las propiedades que necesitamos de los composables
const {
  textureQueue,
  downloadedImagesCache,
  totalPhotosToLoad,
  loadedPhotosCount,
  loadingProgress,
  error429Stats,
  cacheStats,
  cachedPhotoIds,
  loaderStage,
  loaderTitle,
  loaderSubtitle,
  initDB,
  getCacheStats,
  bulkCacheImages,
  limitTexture,
} = textureManager;

const {
  visiblePhotos,
  isTransitioning,
  inflateFactor,
  originalPositions,
  useBillboarding,
  octreeNeedsRebuild,
  isCameraMoving,
  queryRadius,
  clearOctree,
} = effectsManager;

// Referencias del DOM y Three.js
const containerRef = ref();
const canvasRef = ref();
const cameraRef = ref();

// Estado del componente
const currentPosition = ref({ x: 0, y: 0, z: 80 });

// Toggle states for collapsible sections
const showMoreFilters = ref(false);
const showDisplayOptions = ref(false);
const showArtisticScores = ref(false);

const showNavigationControls = ref(true);

// Funciones para toggles excluyentes
const toggleMoreFilters = () => {
  showMoreFilters.value = !showMoreFilters.value;
  if (showMoreFilters.value) {
    showDisplayOptions.value = false;
    showNavigationControls.value = false;
  }
};

const toggleDisplayOptions = () => {
  showDisplayOptions.value = !showDisplayOptions.value;
  if (showDisplayOptions.value) {
    showMoreFilters.value = false;
    showNavigationControls.value = false;
  }
};

const toggleNavigationControls = () => {
  showNavigationControls.value = !showNavigationControls.value;
  if (showNavigationControls.value) {
    showMoreFilters.value = false;
    showDisplayOptions.value = false;
  }
};

// Filtro de aspectos visuales
const selectedVisualAspects = ref([]);

// Filtro de artistic scores - Nuevo sistema con sliders
const { artisticScores } = useArtisticScores();
const artisticScoresGroups = artisticScores;
const artisticScoreFilters = ref({});

// Filtro de búsqueda textual
const searchQuery = ref("");
const isSearching = ref(false);
const searchResults = ref([]);
let searchTimeout = null;

// Sistema de selección de fotos
const selectedPhotos = ref([]);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let touchStartPos = null;
const TOUCH_MOVE_THRESHOLD = 10; // pixels

// Modal states for actions
const showCollectionModal = ref(false);

// Computed para selectedPhotoIds (compatible con composables)
const selectedPhotoIds = computed(() => selectedPhotos.value.map((p) => p.id));

// Sistema de hover para fotos
const hoveredPhoto = ref(null);
const originalHoverMaterial = ref(null);

// Handler para limpiar hover al salir del modo cámara
let handlePointerLockChange = null;

// Loader discreto con progreso
const showDiscreteLoader = ref(true);
// Fase inicial: reducimos trabajo por frame hasta que se cargue suficiente
const initialLoadingPhase = ref(true);

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
  clearColor: "#000000",
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
const gridHelper = markRaw(new THREE.GridHelper(400, 40));
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

// Variables locales para gestión de colas (todavía usadas en processTextureQueue)
const queuedIds = new Set();
const scheduledDownloads = new Set();
let dynamicBatch = 4;
const MIN_BATCH = 2;
const MAX_BATCH = 10;
const FULL_QUEUE_SCHEDULING = true;

// Floating Tags System - pasamos cameraRef en lugar de camera para que sea reactivo
const floatingTagsSystem = ref(null);

// Control de navegación durante carga inicial
const navigationBlocked = ref(false);
const downloadPhaseComplete = ref(false);
const cachePhaseComplete = ref(false);

// Performance optimization: throttling variables
let frameCounter = 0;
const THROTTLE_INTERVAL = 7;
let lastCameraPosition = { x: 0, y: 0, z: 0 };
const CAMERA_MOVE_THRESHOLD = 0.8;

// Distance calculation cache
const distanceCache = new Map();
let cacheValidPosition = { x: 0, y: 0, z: 0 };

// Función para limpiar la cola de texturas de fotos ya cargadas
const cleanTextureQueue = () => {
  return textureManager.cleanTextureQueue(photosWithMaterials.value);
};

// Función para actualizar el progreso de carga
const updateLoadingProgress = () => {
  textureManager.updateLoadingProgress(
    photosWithMaterials.value,
    downloadPhaseComplete.value
  );
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
    const hasScoreFilters = Object.keys(artisticScoreFilters.value).length > 0;
    if (selectedVisualAspects.value.length === 0 && !hasScoreFilters) {
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

    // Filtro de Artistic Scores - Nuevo sistema con umbrales por slider
    if (hasScoreFilters) {
      if (!photo.descriptions?.artistic_scores) {
        passesArtisticScores = false;
      } else {
        // Para pasar el filtro, la foto debe cumplir TODOS los umbrales configurados
        passesArtisticScores = Object.entries(artisticScoreFilters.value).every(
          ([scoreKey, threshold]) => {
            const scoreValue = photo.descriptions?.artistic_scores?.[scoreKey];
            return scoreValue !== undefined && scoreValue >= threshold;
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
  const activeScoreFilters = Object.keys(artisticScoreFilters.value).length;
  if (activeScoreFilters > 0) {
    filterInfo.push(`${activeScoreFilters} artistic scores`);
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
    (selectedVisualAspects.value.length > 0 || activeScoreFilters > 0) &&
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
};

// Handler para cambio en filtro de artistic scores
const onArtisticScoresChange = () => {
  console.log(
    "🔄 onArtisticScoresChange triggered:",
    artisticScoreFilters.value
  );
  applyFilters();

  // updateLODDistances eliminado

  // 🔧 CRITICAL: Marcar octree para reconstrucción con fotos filtradas
  octreeNeedsRebuild.value = true;

  updateVisiblePhotos();
};

// Función para limpiar todos los filtros de scores
const clearArtisticScores = () => {
  artisticScoreFilters.value = {};
  onArtisticScoresChange();
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
};

// Delegar al textureManager
const bulkCacheDownloadedImages = async () => {
  return textureManager.bulkCacheDownloadedImages(photosWithMaterials.value);
};

// Función para configurar el loader
const setupLoaderForPhotos = async (photos) => {
  console.log("🚀 setupLoaderForPhotos iniciado para", photos.length, "fotos");

  totalPhotosToLoad.value = photos.length;
  loadedPhotosCount.value = 0;
  loadingProgress.value = 0;

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

// Delegar a textureManager
const downloadImageOnly = (
  photoObj,
  retryCount = 0,
  isOnDemandRetry = false
) => {
  return textureManager.downloadImageOnly(
    photoObj,
    retryCount,
    isOnDemandRetry
  );
};

// Delegar a textureManager
const createLODObject = (imageElement, position) => {
  return textureManager.createLODObject(imageElement, position);
};

// Delegar creación de texturas al textureManager
const enqueueInitialTexturesBulk = () => {
  const count = textureManager.enqueueInitialTexturesBulk(
    photosWithMaterials.value
  );
  if (count > 0) {
    textureManager.startTextureCreationLoop(
      lodGroup,
      photosWithMaterials.value,
      () => {
        updateLoadingProgress();
        checkAllTexturesLoaded();
        updateVisiblePhotos();
      }
    );
  }
};

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
  const cachedBlobs = await textureManager.loadImagesFromCache(newPhotos);
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
    effectsManager.applyRadialScaling(photosWithMaterials.value);
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
};

// ✨ Nueva función optimizada para cambios de chunk que reutiliza texturas
const updatePhotosPositions = async (newPhotos) => {
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

  // Animar usando effectsManager
  effectsManager.animatePositionTransition(
    photosWithMaterials.value,
    startPositions,
    effectsManager.calculateScaledPositions(
      targetPositions,
      inflateFactor.value
    ),
    pendingOriginalPositions // Pasar las nuevas posiciones originales para actualizar al final
  );

  // Imágenes a descargar (solo las nuevas)
  const toTexture = photosWithMaterials.value.filter(
    (p) => !p.__imageDownloaded && !p.__downloading
  );

  // Descarga silenciosa bajo demanda: NO mostrar loader ni bloquear navegación
  if (toTexture.length > 0) {
    console.log(
      `🔄 (silencioso) ${toTexture.length} fotos nuevas por descargar`
    );

    // No tocar loaderStage/loaderTitle ni navigationBlocked en este flujo
    // Cargamos desde cache lo que exista, sin cambiar UI
    await textureManager.loadImagesFromCache(toTexture);

    // Encolar las que falten para descarga de red
    textureManager.enqueueAllNonCachedPhotos(
      toTexture,
      cameraRef.value?.position
    );

    // Iniciar loop mínimo de descarga si no está corriendo
    if (!downloadLoopId) {
      startDownloadLoop();
    }
    // Al terminar, la creación de texturas ocurrirá en checkAllTexturesLoaded()
  } else {
    console.log("✅ No hay fotos nuevas por descargar, solo recolocando");
  }

  applyFilters();

  // ⚠️ NOTA: NO actualizamos LOD aquí porque las posiciones están en transición
  // El LOD se actualizará automáticamente al finalizar la animación en updateTransitionPositions()
};

// Handler para cambio en el slider de escaleo
const onInflateFactorChange = () => {
  effectsManager.applyRadialScaling(photosWithMaterials.value);
  // Marcar octree para reconstrucción después de escalado radial
  octreeNeedsRebuild.value = true;
  updateVisiblePhotos();
};

// Toggle floating tags system
const toggleFloatingTags = () => {
  if (floatingTagsSystem.value) {
    floatingTagsSystem.value.config.enabled =
      !floatingTagsSystem.value.config.enabled;
    console.log(
      "🏷️ Floating tags:",
      floatingTagsSystem.value.config.enabled ? "enabled" : "disabled"
    );
  }
};

// Delegar a effectsManager
const updateVisiblePhotos = () => {
  effectsManager.updateVisiblePhotos(
    cameraRef.value,
    photosWithMaterials.value,
    filteredPhotos.value
  );

  // Lógica adicional específica del componente (encolado de texturas)
  if (!cameraRef.value || visiblePhotos.value.length === 0) return;

  const cameraPos = cameraRef.value.position;

  // Rehidratar fotos evictadas
  visiblePhotos.value.forEach((photo) => {
    if (
      photo.__evicted &&
      !photo.__textureLoaded &&
      downloadedImagesCache.has(photo.id)
    ) {
      textureManager.enqueueTexture(photo);
      photo.__evicted = false;
    }
  });

  // Encolar fotos visibles para descarga
  textureManager.enqueueAllNonCachedPhotos(visiblePhotos.value, cameraPos);

  // Reintento bajo demanda para errores 429
  let onDemandScheduled = 0;
  const MAX_ONDEMAND_RETRIES_PER_FRAME = 3;
  for (const photo of visiblePhotos.value) {
    if (onDemandScheduled >= MAX_ONDEMAND_RETRIES_PER_FRAME) break;
    if (
      photo.__downloadError &&
      photo.__canRetryOnDemand &&
      !photo.__downloading &&
      !scheduledDownloads.has(photo.id)
    ) {
      photo.__canRetryOnDemand = false;
      scheduledDownloads.add(photo.id);
      downloadImageOnly(photo, 0, true)
        .catch(() => {})
        .finally(() => {
          scheduledDownloads.delete(photo.id);
        });
      onDemandScheduled++;
    }
  }
};

// Delegar a effectsManager
const calculateDistancesForVisiblePhotos = (cameraPosition) => {
  return effectsManager.calculateDistancesForVisiblePhotos(cameraPosition);
};

// Delegar a effectsManager
const updateBillboardRotations = (photosWithDistances) => {
  effectsManager.updateBillboardRotations(
    photosWithDistances,
    cameraRef.value?.position
  );
};

// Delegar a effectsManager - OPTIMIZADO: usar solo fotos visibles
const applyDistanceFading = () => {
  effectsManager.applyDistanceFading(
    cameraRef.value,
    visiblePhotos.value, // ✅ Solo fotos visibles (~200) en lugar de todas (~2000)
    frameCounter
  );
};

// Handler para cambio de chunk
const onChunkChange = async (newValue) => {
  // 🚨 SIEMPRE mostrar loader "Building stage" mientras el backend calcula posiciones
  // Este loader se ocultará automáticamente cuando lleguen las fotos y terminen de procesarse
  loaderTitle.value = "Building stage";
  loadingProgress.value = 0;
  showLoader();

  // Si no hay fotos existentes, hacer limpieza completa
  const isFirstLoad = photosWithMaterials.value.length === 0;
  if (isFirstLoad) {
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
    const transitionCompleted = effectsManager.updateTransitionPositions(
      photosWithMaterials.value,
      frameStart
    );

    // Si la transición terminó, actualizar visibilidad y efectos, y ocultar loader
    if (transitionCompleted) {
      // Forzar actualización de matrices de cámara ANTES de frustum culling
      if (cameraRef.value) {
        cameraRef.value.updateMatrixWorld(true);
        cameraRef.value.updateProjectionMatrix();
      }

      // Limpiar cache de distancias para forzar recálculo
      distanceCache.clear();

      updateVisiblePhotos();

      // 🚨 Ocultar loader "Building stage" cuando termine la animación de reposicionamiento
      hideLoader();
    }
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
        // 🎯 Detectar si la cámara está en movimiento (para billboarding adaptativo)
        effectsManager.updateCameraMovementState(cameraRef.value);

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

    // 🚀 OPTIMIZACIÓN: Throttle más agresivo para hover (cada 5 frames en lugar de cada frame)
    // Actualizar hover basado en crosshair si estamos en modo cámara (no touch)
    // Deshabilitar hover en modo playground
    if (
      !hasTouch.value &&
      fpControls.value?.mouseState?.isPointerLocked &&
      !props.isPlayground
    ) {
      if (frameCounter % 5 === 0) {
        updatePhotoHover(0, 0); // Centro de la pantalla
      }
    }

    // 🎯 OPTIMIZACIÓN CRÍTICA: Throttle de fading (cada 3 frames = ~20 FPS)
    // Procesar solo fotos visibles en lugar de todas (2000+ → ~200)
    if (
      frameCounter % 3 === 0 &&
      cameraRef.value &&
      visiblePhotos.value.length > 0
    ) {
      applyDistanceFading();
    }
  }

  // Procesar cola de descargas (siempre, incluso durante bloqueo)
  textureManager.processTextureQueue(photosWithMaterials.value, () => {
    checkAllTexturesLoaded();
  });

  animationId = requestAnimationFrame(animate);
};

// Loop mínimo solo para descargas (sin eventos Three.js)
let downloadLoopId = null;
const startDownloadLoop = () => {
  const downloadLoop = () => {
    // Solo procesar cola de descargas, sin eventos Three.js
    textureManager.processTextureQueue(photosWithMaterials.value, () => {
      checkAllTexturesLoaded();
    });

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

// Funciones para manejo de selección de fotos
const handleTouchStart = (event) => {
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
  }
};

// Función compartida para detectar hover (usada por mouse y crosshair)
const updatePhotoHover = (normalizedX, normalizedY) => {
  if (!cameraRef.value || !containerRef.value) return;

  // Deshabilitar hover en modo playground
  if (props.isPlayground) {
    return;
  }

  // Actualizar raycaster con las coordenadas proporcionadas
  mouse.x = normalizedX;
  mouse.y = normalizedY;
  raycaster.setFromCamera(mouse, cameraRef.value);

  // 🚀 OPTIMIZACIÓN: Solo considerar fotos VISIBLES (ya filtradas por frustum culling)
  // En lugar de recorrer todas photosWithMaterials (2000+), usar solo visiblePhotos (~100-300)
  const photoMeshes = [];
  visiblePhotos.value.forEach((photo) => {
    // Solo considerar fotos visibles (no filtradas y con opacity > 0)
    if (photo.isVisible === false) return;
    if (photo.lodObject?.material?.opacity === 0) return;

    if (photo.lodObject) {
      if (photo.lodObject.isLOD) {
        // Si es LOD, obtener el mesh actual visible
        photo.lodObject.traverse((child) => {
          if (child.isMesh && child.name !== "hoverBorder") {
            // Ignorar bordes de hover
            photoMeshes.push({ mesh: child, photo });
          }
        });
      } else if (photo.lodObject.isMesh) {
        // Si es mesh directo
        photoMeshes.push({ mesh: photo.lodObject, photo });
      }
    }
  });

  // Detectar intersecciones
  const intersects = raycaster.intersectObjects(
    photoMeshes.map((pm) => pm.mesh)
  );

  if (intersects.length > 0) {
    // Hay una foto bajo el cursor/crosshair
    const hoveredMesh = intersects[0].object;
    const hoveredPhotoData = photoMeshes.find((pm) => pm.mesh === hoveredMesh);

    // Cambiar cursor a pointer (solo si no estamos en modo cámara)
    if (containerRef.value && !fpControls.value?.mouseState?.isPointerLocked) {
      containerRef.value.style.cursor = "pointer";
    }

    if (
      hoveredPhotoData &&
      hoveredPhotoData.photo.id !== hoveredPhoto.value?.id
    ) {
      // Restaurar foto anterior si existe
      clearPhotoHover();

      // Aplicar hover a la nueva foto
      hoveredPhoto.value = hoveredPhotoData.photo;

      // Crear un borde brillante añadiendo un plano ligeramente más grande detrás
      if (hoveredPhotoData.photo.lodObject) {
        // Crear geometría para el borde (ligeramente más grande)
        const borderGeometry = new THREE.PlaneGeometry(4.15, 3.15);
        // Obtener el color de la variable CSS --primary-color-hover
        let cssHoverColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--secondary-color-hover")
          .trim();
        // Convertir a número hexadecimal para Three.js
        let borderColor = 0xffffff;
        if (/^#([0-9a-fA-F]{6})$/.test(cssHoverColor)) {
          borderColor = parseInt(cssHoverColor.replace("#", ""), 16);
        }
        const borderMaterial = new THREE.MeshBasicMaterial({
          color: borderColor,
          transparent: true,
          opacity: 0.4,
          depthTest: true,
          depthWrite: false,
        });
        const borderMesh = new THREE.Mesh(borderGeometry, borderMaterial);

        // Posicionar el borde justo detrás de la foto
        borderMesh.position.z = -0.01;
        borderMesh.name = "hoverBorder";

        // Añadir el borde como hijo del LOD object
        hoveredPhotoData.photo.lodObject.add(borderMesh);
      }
    }
  } else {
    // No hay foto bajo el cursor/crosshair
    // Restaurar cursor (solo si no estamos en modo cámara)
    if (containerRef.value && !fpControls.value?.mouseState?.isPointerLocked) {
      containerRef.value.style.cursor = "default";
    }
    clearPhotoHover();
  }
};

// Función para manejar el hover sobre fotos con el mouse
const handleMouseMove = (event) => {
  // Solo aplicar hover si no es dispositivo táctil Y no estamos en modo cámara
  if (hasTouch.value || !cameraRef.value || !containerRef.value) return;
  if (fpControls.value?.mouseState?.isPointerLocked) return; // En modo cámara, el crosshair se encarga

  // Deshabilitar hover en modo playground
  if (props.isPlayground) return;

  // Calcular coordenadas del mouse normalizadas (-1 to +1)
  const rect = containerRef.value.getBoundingClientRect();
  const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const normalizedY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  updatePhotoHover(normalizedX, normalizedY);
};

// Función para limpiar el efecto hover
const clearPhotoHover = () => {
  if (hoveredPhoto.value && hoveredPhoto.value.lodObject) {
    // Buscar y eliminar el borde de hover
    const borderMesh =
      hoveredPhoto.value.lodObject.getObjectByName("hoverBorder");
    if (borderMesh) {
      // Limpiar geometría y material
      if (borderMesh.geometry) borderMesh.geometry.dispose();
      if (borderMesh.material) borderMesh.material.dispose();
      // Remover del padre
      hoveredPhoto.value.lodObject.remove(borderMesh);
    }
  }

  hoveredPhoto.value = null;
  originalHoverMaterial.value = null;
};
const handlePhotoClick = (event) => {
  if (!cameraRef.value || !containerRef.value) return;

  // Deshabilitar selección de fotos en modo playground
  if (props.isPlayground) {
    console.log("🎮 Selección de fotos deshabilitada en modo playground");
    return;
  }

  console.log("🖱️ Click detectado, tipo:", event.type);

  // Si estamos en modo cámara, usar la foto con hover activa
  if (fpControls.value?.mouseState?.isPointerLocked && hoveredPhoto.value) {
    console.log("📸 Click en modo cámara - seleccionando foto con hover");
    event.preventDefault();
    event.stopPropagation();
    togglePhotoSelection(hoveredPhoto.value);
    return;
  }

  // Para touch, verificar que no fue un drag
  if (event.type === "touchend") {
    if (!touchStartPos) return;

    const touch = event.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.y);

    // Si se movió mucho, considerarlo un drag, no un tap
    if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
      touchStartPos = null;
      return;
    }
    touchStartPos = null;
  }

  // Calcular coordenadas del mouse/touch normalizadas (-1 to +1)
  const rect = containerRef.value.getBoundingClientRect();

  let clientX, clientY;
  if (event.type === "touchend") {
    const touch = event.changedTouches[0];
    clientX = touch.clientX;
    clientY = touch.clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  // Actualizar raycaster
  raycaster.setFromCamera(mouse, cameraRef.value);

  // 🚀 OPTIMIZACIÓN: Solo considerar fotos VISIBLES (ya filtradas por frustum culling)
  // En lugar de recorrer todas photosWithMaterials (2000+), usar solo visiblePhotos (~100-300)
  const photoMeshes = [];
  visiblePhotos.value.forEach((photo) => {
    // Solo considerar fotos visibles (no filtradas y con opacity > 0)
    if (photo.isVisible === false) return;
    if (photo.lodObject?.material?.opacity === 0) return;

    if (photo.lodObject) {
      if (photo.lodObject.isLOD) {
        // Si es LOD, obtener el mesh actual visible
        photo.lodObject.traverse((child) => {
          if (child.isMesh && child.name !== "hoverBorder") {
            // Ignorar bordes de hover
            photoMeshes.push({ mesh: child, photo });
          }
        });
      } else if (photo.lodObject.isMesh) {
        // Si es mesh directo
        photoMeshes.push({ mesh: photo.lodObject, photo });
      }
    }
  });

  // Detectar intersecciones
  const intersects = raycaster.intersectObjects(
    photoMeshes.map((pm) => pm.mesh)
  );

  if (intersects.length > 0) {
    // Click en una foto - seleccionar/deseleccionar
    console.log("📸 Click en foto detectado");
    event.preventDefault();
    event.stopPropagation();

    const clickedMesh = intersects[0].object;
    const clickedPhotoData = photoMeshes.find((pm) => pm.mesh === clickedMesh);

    if (clickedPhotoData) {
      togglePhotoSelection(clickedPhotoData.photo);
    }
  } else {
    console.log(
      "🌌 Click en el vacío (no se activa cámara con click izquierdo)"
    );
  }
  // No hacer nada si click en el vacío con botón izquierdo
};

// Manejador para click derecho (activar cámara)
const handleRightClick = (event) => {
  event.preventDefault(); // Prevenir menú contextual
  console.log("🖱️ Right-click detectado, activando cámara...");

  if (!hasTouch.value && fpControls.value) {
    fpControls.value.requestPointerLock();
  }
};

const togglePhotoSelection = (photo) => {
  const index = selectedPhotos.value.findIndex((p) => p.id === photo.id);

  if (index !== -1) {
    // Ya está seleccionada, deseleccionar
    selectedPhotos.value.splice(index, 1);
    console.log(`📸 Foto deseleccionada: ${photo.id}`);
  } else {
    // No está seleccionada, seleccionar
    selectedPhotos.value.push(photo);
    console.log(`📸 Foto seleccionada: ${photo.id}`);
  }
};

const removeSelectedPhoto = (photoId) => {
  const index = selectedPhotos.value.findIndex((p) => p.id === photoId);
  if (index !== -1) {
    selectedPhotos.value.splice(index, 1);
  }
};

const clearSelection = () => {
  selectedPhotos.value = [];
  console.log("🗑️ Selección limpiada");
};

// Event handlers for FixedActionBar actions
const handleDownloadPhotos = async () => {
  try {
    console.log(
      "� Download action triggered for",
      selectedPhotos.value.length,
      "photos"
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

const handleAddToCollection = () => {
  if (selectedPhotoIds.value.length > 0) {
    console.log(
      "� Add to collection action triggered for",
      selectedPhotos.value.length,
      "photos"
    );
    showCollectionModal.value = true;
  }
};

const handleCollectionAdded = (data) => {
  console.log("✅ Photos added to collection:", data);
  message.success(
    `Added ${selectedPhotoIds.value.length} photos to collection`
  );
  // Mantener selección después de agregar a colección
};

const handleCollectionModalCancel = () => {
  showCollectionModal.value = false;
};

const handleMoveToTool = () => {
  if (selectedPhotoIds.value.length > 0) {
    console.log(
      "🪄 Move to tool action triggered for",
      selectedPhotos.value.length,
      "photos"
    );
    openToolSelector();
  }
};

const handleToolSelected = async (toolId) => {
  // No pasar clearSelection para mantener la selección
  await takeToTool(toolId, selectedPhotoIds.value, () => {});
  closeToolSelector();
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
      max: 80, // velocidad tope (ajustable)
      accelerateInSeconds: 8,
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

  // Inicializar sistema de tags flotantes
  console.log("🏷️ Inicializando sistema de tags flotantes");
  floatingTagsSystem.value = useFloatingTags(
    cameraRef,
    photos3D,
    queryRadius // Pasar la función correcta del octree
  );

  // Iniciar el loop de actualización de tags
  floatingTagsSystem.value.startUpdateLoop();

  // Desactivar debug después de 10 segundos para no saturar la consola
  setTimeout(() => {
    if (floatingTagsSystem.value) {
      floatingTagsSystem.value.disableDebug();
      console.log("🏷️ Debug de tags flotantes desactivado");
    }
  }, 10000);

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

    // Añadir event listeners para selección de fotos ANTES de inicializar controles
    // para que tengan prioridad
    if (containerRef.value) {
      // Para dispositivos táctiles
      if (hasTouch.value) {
        containerRef.value.addEventListener("touchstart", handleTouchStart, {
          passive: true,
        });
        containerRef.value.addEventListener("touchend", handlePhotoClick, {
          passive: false,
        });
      } else {
        // Para dispositivos de escritorio
        containerRef.value.addEventListener("click", handlePhotoClick);
        containerRef.value.addEventListener("contextmenu", handleRightClick);
        containerRef.value.addEventListener("mousemove", handleMouseMove, {
          passive: true,
        });
      }
      console.log("🖱️ Event listeners de selección inicializados");
    }

    // Listener para limpiar hover cuando sales del modo cámara
    handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        // Salimos del modo cámara - limpiar hover del crosshair
        clearPhotoHover();
      }
    };
    document.addEventListener("pointerlockchange", handlePointerLockChange);

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

  // Limpiar efecto hover activo
  clearPhotoHover();

  // Limpiar listener de pointer lock
  if (handlePointerLockChange) {
    document.removeEventListener("pointerlockchange", handlePointerLockChange);
  }

  // Limpiar event listeners de selección de fotos
  if (containerRef.value) {
    if (hasTouch.value) {
      containerRef.value.removeEventListener("touchstart", handleTouchStart);
      containerRef.value.removeEventListener("touchend", handlePhotoClick);
    } else {
      containerRef.value.removeEventListener("click", handlePhotoClick);
      containerRef.value.removeEventListener("contextmenu", handleRightClick);
      containerRef.value.removeEventListener("mousemove", handleMouseMove);
    }
  }

  // Limpiar controles FPS y touch
  if (fpControls.value) {
    fpControls.value.cleanup();
  }
  if (touchControls.value) {
    touchControls.value.cleanup();
  }

  // Limpiar sistema de tags flotantes
  if (floatingTagsSystem.value) {
    floatingTagsSystem.value.stopUpdateLoop();
    floatingTagsSystem.value.reset();
    floatingTagsSystem.value = null;
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
  cursor: default; /* Default cursor, changes to pointer on photo hover */
  /* Touch-specific optimizations */
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  transition: cursor 0.1s ease;
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
  width: 350px;
  max-height: 85vh;
  overflow-y: auto;
  overflow-x: hidden; /* Prevent horizontal scroll */
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: fixed;
  right: 15px;
  top: 15px;
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

/* Toggle Button Styles */
.toggle-btn {
  padding: 4px 12px;
  border-radius: 12px;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.toggle-btn:hover {
  background-color: rgba(255, 255, 255, 0.15);
  transform: scale(1.05);
}

.toggle-btn.active {
  background-color: #2563eb;
  color: white;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
}

.toggle-btn.active:hover {
  background-color: #1d4ed8;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.5);
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

/* Artistic Scores Sliders Container */
.artistic-scores-sliders {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 8px;
  padding-left: 8px;
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.scores-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 8px 0;
  transition: opacity 0.2s ease;
}

.scores-toggle:hover {
  opacity: 0.8;
}

.scores-toggle-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.score-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-group-header {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: 4px;
}

.score-slider-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.score-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 16px;
}

.score-slider-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
}

.score-slider-value {
  font-size: 10px;
  color: rgba(59, 130, 246, 0.9);
  font-weight: 600;
  background: rgba(59, 130, 246, 0.15);
  padding: 2px 6px;
  border-radius: 8px;
}

.score-slider {
  margin: 0 !important;
}

/* Clear scores button */
.clear-scores-btn {
  background: rgba(239, 68, 68, 0.15);
  border: none;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
}

.clear-scores-btn:hover {
  background: rgba(239, 68, 68, 0.25);
}

.clear-scores-btn .n-icon {
  color: rgba(239, 68, 68, 0.9);
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
  top: 15px;
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
  margin: var(--spacing-sm) 0;
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

/* Control Icons and Keys */
.control-icon-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: rgba(59, 130, 246, 0.85);
  filter: drop-shadow(0 0 1px rgba(59, 130, 246, 0.25));
}

.control-icon-text {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.control-text {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.keyboard-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 2px 5px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.12),
    rgba(255, 255, 255, 0.04)
  );
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 600;
  font-family: "Segoe UI", system-ui, sans-serif;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15),
    inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
  text-shadow: 0 0.5px 0.5px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.keyboard-keys-group {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
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

/* ============================================ */
/* Selected Photos Container */
/* ============================================ */

.selected-photos-container {
  position: absolute;
  left: 10px;
  top: 10px;
  background: rgba(26, 26, 31, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  padding: 10px;
  width: 287px;
  z-index: 1500;
  pointer-events: auto;
  animation: slideInFromLeft-a2447bcd 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
    left: 5px;
    max-width: calc(100vw - 10px);
    padding: 8px;
  }

  .selected-photo-item {
    width: 50px;
    height: 50px;
  }

  .remove-photo-btn {
    opacity: 1; /* Always visible on mobile */
  }
}

/* ============================================ */
/* Floating Tags Display - Scattered Style */
/* ============================================ */

.floating-tags-wrapper {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
  pointer-events: none;
  z-index: 1500;
}

.floating-tag {
  display: inline-block;
  padding: 4px 10px;
  font-size: 11px;
  color: white;
  position: relative;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  backdrop-filter: blur(8px);
  pointer-events: none;
  user-select: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: tagPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation-delay: calc(var(--tag-index) * 0.05s);
}

.floating-tag::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--tag-color);
  border-radius: 12px;
  opacity: 0.7;
  z-index: -1;
}

@keyframes tagPop {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Solo animación de entrada, sin flotación continua */
.floating-tag {
  animation: tagPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation-delay: calc(var(--tag-index) * 0.05s);
}

/* Mobile responsive adjustments */
@media (max-width: 767px) {
  .floating-tags-wrapper {
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 20px);
    gap: 5px;
    justify-content: center;
  }

  .floating-tag {
    font-size: 9px;
    padding: 3px 8px;
  }
}

/* Tablet adjustments */
@media (min-width: 768px) and (max-width: 1024px) {
  .floating-tags-wrapper {
    max-width: 350px;
  }

  .floating-tag {
    font-size: 9px;
    padding: 3px 9px;
  }
}
</style>
