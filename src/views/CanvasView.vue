<template>
  <div
    class="canvas-container"
    :class="{
      'playground-mode': isPlayground,
      'show-dots': toolbarState.showDots,
      [`bg-${canvasBackgroundId}`]: true,
    }"
    :style="canvasBackgroundStyle"
  >
    <div
      class="canvas-stage-wrapper"
      ref="canvasContainer"
      @dragover.prevent
      @drop="handlePhotoDropAndRemove"
    >
      <div
        v-if="isWoodBackground"
        class="canvas-wood-surface"
        :style="canvasWoodSurfaceStyle"
      ></div>

      <!-- Konva Canvas -->
      <v-stage
        ref="stageRef"
        :config="stageConfig"
        @wheel="handleWheel"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @click="handleStageClick"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
      >
        <v-layer>
          <!-- Rectángulo de selección -->
          <v-rect
            v-if="selectionRect.visible"
            :config="{
              x: selectionRect.x,
              y: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height,
              stroke: accentColor,
              strokeWidth: 2,
              fill: 'rgba(37, 99, 235, 0.1)',
              dash: [5, 3],
            }"
          />
          <!-- Fotos -->
          <v-group
            v-for="photo in photos"
            :key="photo.id"
            :ref="setPhotoRef(photo.id)"
            :config="{
              x: photo.config.x,
              y: photo.config.y,
              draggable: true,
              zIndex: photo.config.zIndex,
              opacity: photo.imageBroken ? 0.6 : (photo.config.opacity ?? 1),
              _isPhoto: true,
            }"
            @dragstart="handleDragStart(photo, $event)"
            @dragend="
              handleDragEnd(photo, $event, toolbarState.expansion.autoAlign)
            "
            @dragmove="handleDragMove(photo, $event)"
            @click="handlePhotoClick(photo, $event)"
            @touchstart="handlePhotoTouchStart(photo, $event)"
            @touchend="handlePhotoTouchEnd(photo, $event)"
          >
            <v-group
              :config="{}"
              @mouseover="
                handleMouseOver(photo);
                stageRef.getStage().container().style.cursor = 'pointer';
              "
              @mouseout="
                handleMouseOut(photo);
                stageRef.getStage().container().style.cursor = 'default';
              "
            >
              <!-- Área de hover con padding invisible -->
              <v-rect
                :config="{
                  x: -10,
                  y: -10,
                  width: photo.config.width + 20,
                  height: photo.config.height + 20,
                  fill: 'transparent',
                }"
              />

              <!-- Imagen -->
              <v-image
                v-if="!photo.imageBroken && photo.image"
                :config="{
                  x: 0,
                  y: 0,
                  width: photo.config.width,
                  height: photo.config.height,
                  image: photo.image,
                  stroke: getPhotoStrokeColor(photo),
                  strokeWidth: photo.selected ? 7 : photo.isNew ? 4 : 2.5,
                  shadowColor: photo.isNew ? '#22d3ee' : undefined,
                  shadowBlur: photo.isNew ? 15 : 0,
                  shadowOffset: photo.isNew ? { x: 0, y: 0 } : undefined,
                  shadowOpacity: photo.isNew ? 0.6 : 0,
                  // Disable Konva's buffer-canvas compositing for images.
                  // When shadow+stroke are both set, Konva routes rendering through
                  // stage.bufferCanvas which can have 0×0 dimensions in certain
                  // timing windows, causing drawImage to throw InvalidStateError.
                  perfectDrawEnabled: false,
                }"
              />

              <!-- Placeholder para imágenes rotas -->
              <v-rect
                v-else-if="photo.imageBroken"
                :config="{
                  x: 0,
                  y: 0,
                  width: photo.config.width,
                  height: photo.config.height,
                  fill: 'rgba(64, 64, 64, 0.2)',
                  stroke: photo.selected
                    ? getPhotoStrokeColor(photo)
                    : 'rgba(128, 128, 128, 0.4)',
                  strokeWidth: photo.selected ? 7 : 2,
                  dash: [8, 4],
                }"
              />

              <!-- Spinner de carga -->
              <v-group
                v-if="photo.loading && expansionMode == 'canvas'"
                :config="{
                  x: photo.config.width / 2,
                  y: photo.config.height / 2,
                  opacity: 0.7,
                }"
                ref="spinnerRefs"
              >
                <v-arc
                  :config="{
                    innerRadius: 15,
                    outerRadius: 45,
                    angle: 270,
                    fill: 'transparent',
                    stroke: 'white',
                    strokeWidth: 3,
                    rotation: photo.spinnerRotation || 0,
                  }"
                />
              </v-group>
              <!-- Filtro rojo pre-borrado -->
              <v-rect
                v-if="photo.inTrash"
                :config="{
                  x: 0,
                  y: 0,
                  width: photo.config.width,
                  height: photo.config.height,
                  fill: 'rgba(255, 0, 0, 0.3)',
                }"
              />
              <!-- Tags y botones -->
              <template>
                <!-- <PhotoDetectionAreas
                v-if="
                  toolbarState.expansion.type === 'composition' &&
                  toolbarState.expansion.onCanvas &&
                  photo.hovered
                "
                :photo="photo"
                :detectionAreas="photo.detectionAreas"
                :visible="photo.hovered"
                >/</PhotoDetectionAreas
              > -->
                <TagPillsCanvas
                  v-if="
                    !photo.imageBroken &&
                    toolbarState.expansion.type === 'tags' &&
                    expansionMode == 'canvas' &&
                    photo.hovered
                  "
                  :photo="photo"
                  :tags="photo.tags"
                  :visible="photo.hovered"
                />
                <ExpandPhotoButtons
                  :photo="photo"
                  :enableDiagonal="
                    toolbarState.photoOptions.spreadMode === 'circular'
                  "
                  v-if="
                    !photo.imageBroken &&
                    isExpansionEnabled &&
                    expansionMode == 'canvas' &&
                    !photo.inTrash &&
                    photo.hovered &&
                    (toolbarState.expansion.type !== 'tags' ||
                      photo.tags.some((t) => t.tag.selected)) &&
                    (toolbarState.expansion.type !== 'composition' ||
                      photo.detectionAreas.some((dt) => dt.selected))
                  "
                  @click="handleAddPhotoFromPhoto"
                  :sizeFactor="dynamicSizeFactor"
                />
                <PhotoCenterButton
                  v-else-if="
                    !photo.imageBroken &&
                    isExpansionEnabled &&
                    expansionMode !== 'canvas' &&
                    expansionMode !== null &&
                    !photo.inTrash &&
                    (photo.hovered ||
                      (photo.selected && anySelectedPhotoHovered))
                  "
                  :photo="photo"
                  :fill="accentColor"
                  icon="+"
                  font-size="30"
                  @click="handleAddPhotoFromPhoto"
                  :sizeFactor="1.3"
                />

                <!-- Botón de eliminar para fotos rotas -->
                <PhotoCenterButton
                  v-if="photo.imageBroken && photo.hovered"
                  :photo="photo"
                  :fill="'rgba(255, 0, 0, 0.8)'"
                  icon="×"
                  font-size="24"
                  @click="handleDeleteBrokenPhoto"
                  :sizeFactor="1.0"
                />

                <!-- Botón de info (esquina superior izquierda) -->
                <PhotoInfoButton
                  v-if="!photo.imageBroken && photo.hovered && !photo.inTrash"
                  :photo="photo"
                  :fill="accentColor"
                  :sizeFactor="1.3"
                  @click="handleInfoButtonClick"
                />
              </template>
            </v-group>
          </v-group>
        </v-layer>
      </v-stage>
    </div>

    <!-- Related Photos Toolbar -->
    <RelatedPhotosToolbar
      ref="relatedPhotosToolbarRef"
      v-if="showRelatedPhotos && isExpansionEnabled"
      :base-images="selectedPhotosForToolbar"
      :is-visible="showRelatedPhotos"
      :is-loading="isLoadingRelatedPhotos"
      :toolbar-state="toolbarState"
      :filter-context="filterContext"
      @close="hideRelatedPhotos"
      @loading="isLoadingRelatedPhotos = $event"
      @photos-selected="onPhotosSelected"
      @search-type-changed="onSearchTypeChanged"
      @photo-info="handleToolbarPhotoInfo"
    />

    <PhotosDialog
      v-if="!isPlayground"
      v-model="showPhotosDialog"
      @add-photos="handleAddPhotos"
    />
    <PlaygroundPhotosDialog
      v-if="isPlayground"
      v-model="showPhotosDialog"
      @add-photos="handleAddPlaygroundPhotos"
    />
    <PhotosDialog
      v-model="showTrashDialog"
      :is-trash="true"
      @add-photos="handleAddPhotos"
    />

    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      @change-photo="selectedDialogPhoto = $event"
    />

    <!-- Playground Upgrade Modal -->
    <PlaygroundUpgradeModal v-model="showPlaygroundUpgradeModal" />

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedPhotosCount"
      :photo-ids="selectedPhotoIds"
      :photo-positions="selectedPhotoPositions"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="handleCollectionModalCancel"
    />

    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="selectedPhotosCount"
      current-tool="canvas"
      :active-canvas-id="activeCanvasId"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <n-modal
      v-model:show="showResetCanvasModal"
      preset="dialog"
      title="Reset Canvas"
      positive-text="Reset"
      negative-text="Cancel"
      type="warning"
      :mask-closable="false"
      style="width: 480px"
      @positive-click="handleConfirmClearCanvas"
      @negative-click="handleCancelClearCanvas"
      @close="handleCancelClearCanvas"
    >
      <p>
        This will remove all photos from the canvas. This action cannot be
        undone.
      </p>
    </n-modal>

    <!-- Top Left Controls -->
    <div class="canvas-controls top-left">
      <n-space>
        <n-button type="primary" @click="showPhotosDialog = true">
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V9h-3V7H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4l2 3l3-4l4 5H5z"
                />
              </svg>
            </n-icon>
          </template>
          Add Photos
        </n-button>

        <n-tooltip placement="bottom" trigger="hover">
          <template #trigger>
            <n-button
              type="primary"
              secondary
              @click="showResetCanvasModal = true"
            >
              <template #icon>
                <n-icon>
                  <ReloadOutline />
                </n-icon>
              </template>
            </n-button>
          </template>
          Reset canvas
        </n-tooltip>

        <div class="config-menu-container" ref="configMenuRef">
          <n-button secondary type="primary" @click="openConfig">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.22,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.22,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"
                  />
                </svg>
              </n-icon>
            </template>
          </n-button>

          <!-- Config Menu Dropdown -->
          <div v-if="showConfigMenu" class="config-dropdown" @click.stop>
            <!-- Filters Section -->
            <div v-if="!isPlayground" class="config-section">
              <h4 class="section-title">Filters</h4>
              <div class="config-item">
                <span class="config-label">Collection</span>
                <n-select
                  v-model:value="selectedCollectionFilter"
                  :options="collectionsOptions"
                  placeholder="All Photos"
                  size="tiny"
                  style="width: 185px"
                />
              </div>
            </div>

            <!-- Canvas Section -->
            <div class="config-section">
              <h4 class="section-title">Canvas</h4>
              <div class="config-item">
                <span class="config-label">Auto Align</span>
                <n-switch v-model:value="toolbarState.expansion.autoAlign" />
              </div>
              <div class="config-item">
                <span class="config-label">Show Dots</span>
                <n-switch v-model:value="toolbarState.showDots" />
              </div>
              <div class="config-item">
                <span class="config-label">Background</span>
                <ColorPickerPills v-model="toolbarState.canvasBackground" />
              </div>
            </div>

            <!-- Expansion Section -->
            <div v-if="!isPlayground" class="config-section">
              <h4 class="section-title">
                Expansion
                <n-switch
                  v-model:value="toolbarState.expansion.enabled"
                  class="section-toggle"
                />
              </h4>

              <div
                class="config-item"
                :class="{ disabled: !toolbarState.expansion.enabled }"
              >
                <span class="config-label">On Canvas</span>
                <n-switch v-model:value="toolbarState.expansion.onCanvas" />
              </div>

              <div
                class="config-item"
                :class="{
                  disabled:
                    !toolbarState.expansion.enabled ||
                    !toolbarState.expansion.onCanvas,
                }"
              >
                <span class="config-label">Criteria</span>
                <n-select
                  v-model:value="toolbarState.expansion.type"
                  :options="filteredExpansionTypeOptions"
                  :render-label="renderCriteriaLabel"
                  placeholder="Select criteria"
                  size="tiny"
                  style="width: 185px"
                  :disabled="
                    !toolbarState.expansion.enabled ||
                    !toolbarState.expansion.onCanvas
                  "
                />
              </div>

              <!-- Layout Pills -->
              <div
                class="config-item"
                :class="{
                  disabled:
                    !toolbarState.expansion.enabled ||
                    !toolbarState.expansion.onCanvas,
                }"
              >
                <span class="config-label">Layout</span>
                <div class="layout-pills">
                  <n-button
                    v-for="layout in ['linear', 'perpendicular', 'circular']"
                    :key="layout"
                    :type="
                      toolbarState.photoOptions.spreadMode === layout
                        ? 'primary'
                        : 'default'
                    "
                    size="small"
                    class="layout-pill"
                    :disabled="
                      !toolbarState.expansion.enabled ||
                      !toolbarState.expansion.onCanvas
                    "
                    @click="toolbarState.photoOptions.spreadMode = layout"
                  >
                    {{ layout.charAt(0).toUpperCase() + layout.slice(1) }}
                  </n-button>
                </div>
              </div>

              <!-- Photo Count -->
              <div
                class="config-item"
                :class="{
                  disabled:
                    !toolbarState.expansion.enabled ||
                    !toolbarState.expansion.onCanvas,
                }"
              >
                <span class="config-label">Photos</span>
                <n-input-number
                  v-model:value="toolbarState.photoOptions.count"
                  :min="1"
                  :max="5"
                  size="small"
                  style="width: 80px"
                  :disabled="
                    !toolbarState.expansion.enabled ||
                    !toolbarState.expansion.onCanvas
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </n-space>
    </div>

    <!-- Top Right Controls -->
    <div v-if="!isPlayground" class="canvas-controls top-right">
      <n-space>
        <template v-if="basicMode && !basicModeDismissed">
          <div class="usage-limit-warning">
            <WarningBadge
              message="Basic mode"
              tooltip="Only chromatic and general expansions are available while there are lightbox photos on the canvas."
              :closable="true"
              @close="basicModeDismissed = true"
            />
          </div>
        </template>

        <!-- Canvas Manager -->
        <CanvasManagerPopover
          :is-playground="isPlayground"
          :active-canvas-id="activeCanvasId"
          :canvas-list="canvasList"
          :current-canvas-name="currentCanvasName"
          :is-switching="isSwitchingCanvas"
          @switch-canvas="handleSwitchCanvas"
          @create-canvas="handleCreateCanvas"
          @rename-canvas="handleRenameCanvas"
          @delete-canvas="handleDeleteCanvas"
        />

        <n-button
          :disabled="isSaved"
          :loading="isSaving"
          @click="handleSaveCanvas"
          secondary
          :type="hasUnsavedChanges ? 'primary' : 'default'"
          :title="hasUnsavedChanges ? 'Save changes' : 'No changes to save'"
        >
          <template #icon>
            <n-icon size="20">
              <SaveOutline />
            </n-icon> </template
          >Save
        </n-button></n-space
      >
    </div>

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :top-position="70"
      :selected-ids="selectedPhotoIds"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :show-send-to-chat="true"
      :is-downloading="isDownloading"
      :is-deleting="false"
      @clear-selection="clearCanvasSelections"
      @download="handleDownloadSelectedPhotos"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
      @send-to-chat="handleSendToChat"
    />

    <!-- Playground Logo - Top Right -->
    <div v-if="isPlayground" class="canvas-controls playground-logo">
      <div class="logo-container-playground">
        <AppLogo layout="horizontal" :height="45" />
      </div>
    </div>

    <!-- Bottom Left Controls -->
    <div class="canvas-controls bottom-left">
      <n-button-group vertical>
        <n-tooltip placement="right" trigger="hover">
          <template #trigger>
            <n-button @click="zoomTick(1)" size="small">
              <template #icon>
                <n-icon color="currentColor">
                  <AddOutline />
                </n-icon>
              </template>
            </n-button>
          </template>
          Zoom in
        </n-tooltip>

        <n-tooltip placement="right" trigger="hover">
          <template #trigger>
            <n-button @click="zoomTick(-1)" size="small">
              <template #icon>
                <n-icon>
                  <RemoveOutline />
                </n-icon>
              </template>
            </n-button>
          </template>
          Zoom out
        </n-tooltip>

        <n-tooltip placement="right" trigger="hover">
          <template #trigger>
            <n-button @click="fitStageToPhotos(0.1)" size="small">
              <template #icon>
                <n-icon>
                  <ExpandAltOutlined />
                </n-icon>
              </template>
            </n-button>
          </template>
          Fit view to photos
        </n-tooltip>

        <n-tooltip placement="right" trigger="hover">
          <template #trigger>
            <n-button @click="unstackPhotos" size="small">
              <template #icon>
                <n-icon>
                  <ExpandOutline />
                </n-icon>
              </template>
            </n-button>
          </template>
          Unstack photos
        </n-tooltip>
      </n-button-group>
    </div>
    <div v-if="!isPlayground" class="trash-zone-anchor">
      <div
        @click="showTrashDialog = true"
        :class="['trash-zone', { hovering: isHoveringTrash }]"
      >
        🗑️
        <n-badge
          v-if="trashPhotosCount > 0"
          class="trash-zone-badge"
          :value="trashPhotosCount"
          :max="999"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import WarningBadge from "@/components/WarningBadge.vue";
import {
  useCanvasStage,
  TOOLBAR_WIDTH,
  applyZoom,
} from "@/composables/canvas/useCanvasStage";
import { useCanvasPhoto } from "@/composables/canvas/useCanvasPhoto.js";
import { usePhotoAnimations } from "@/composables/canvas/usePhotoAnimations";
import { useCanvasStore, expansionTypeOptions } from "@/stores/canvas.js";
import { renderCriteriaLabel } from "@/config/searchCriteria";
import { useCollectionsStore } from "@/stores/collections.js";
// import PhotoDetectionAreas from "@/components/canvas/PhotoControls/PhotoDetectionAreas.vue";
import {
  AlbumsOutline,
  ExpandOutline,
  ImageOutline,
  RefreshOutline,
  ReloadOutline,
  TrashOutline,
  AddOutline,
  RemoveOutline,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";
import { usePhotosStore } from "@/stores/photos";
import { useUserStore } from "@/stores/userStore";
import {
  ref,
  onMounted,
  onUnmounted,
  onActivated,
  computed,
  h,
  watch,
  watchEffect,
  nextTick,
  defineOptions,
  markRaw,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTabDirtyStore } from "@/stores/tabDirtyStore";
import {
  NBadge,
  NButton,
  NButtonGroup,
  NIcon,
  NModal,
  NSpace,
  NSwitch,
  NInputNumber,
  NTooltip,
  NSelect,
} from "naive-ui";
import { storeToRefs } from "pinia";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import ExpandPhotoButtons from "@/components/canvas/PhotoControls/ExpandPhotoButtons.vue";
import PhotoCenterButton from "@/components/canvas/PhotoControls/PhotoCenterButton.vue";
import PhotoInfoButton from "@/components/canvas/PhotoControls/PhotoInfoButton.vue";
import TagPillsCanvas from "@/components/canvas/TagPills/TagPillsCanvas.vue";
import RelatedPhotosToolbar from "@/components/canvas/RelatedPhotosToolbar.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import PlaygroundUpgradeModal from "@/components/PlaygroundUpgradeModal.vue";
import PlaygroundPhotosDialog from "@/components/PlaygroundPhotosDialog.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { SaveOutline } from "@vicons/ionicons5";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { useCanvasPersistence } from "@/composables/useCanvasPersistence.js";
import CanvasManagerPopover from "@/components/canvas/CanvasManagerPopover.vue";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { usePhotoQueryParams } from "@/composables/usePhotoQueryParams.js";
import { useTheme } from "@/composables/useTheme.js";
import AppLogo from "@/components/AppLogo.vue";
import { ExpandAltOutlined } from "@vicons/antd";
import ColorPickerPills from "@/components/ColorPickerPills.vue";
import woodenTextureUrl from "@/assets/canvas/wooden-texture.jpg";

// Define component name for KeepAlive
defineOptions({
  name: "CanvasView",
});

const canvasStore = useCanvasStore();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const userStore = useUserStore();
const isDemoUser = computed(
  () => userStore.user?.email === "demo@photorekatest.com",
);
const route = useRoute();
const router = useRouter();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const {
  hasUnsavedChanges,
  isSaved,
  isSaving,
  activeCanvasId,
  canvasList,
  currentCanvasName,
  saveCanvas,
  loadCanvas,
  refreshCanvasList,
  clearSavedCanvas,
  createCanvas,
  switchCanvas,
  renameCanvas,
  deleteCanvas,
  hasSavedCanvas,
  initializeChangeDetection,
} = useCanvasPersistence();

// Photo query params handling (e.g., ?source=lightroom&ids=123,456)
const { getPhotoIdsFromQuery } = usePhotoQueryParams();

// Photo tool selection
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

// Playground mode detection
const isPlayground = computed(() => route.meta?.playground === true);

// const photosStore = usePhotosStore();
const { photos } = storeToRefs(canvasStore);
const { basicMode } = storeToRefs(canvasStore);

// Refs
const stageRef = ref(null);
const canvasContainer = ref();
const relatedPhotosToolbarRef = ref();

const photoRefs = ref({});
const setPhotoRef = (id) => (el) => {
  if (el) photoRefs.value[id] = el;
};

// Get theme composable
const { isDarkMode } = useTheme();

const CANVAS_CONFIG_KEY = "canvas-toolbar-config";

const getDefaultConfig = () => ({
  expansion: {
    type: "embedding",
    onCanvas: false,
    inverted: false,
    opposite: false,
    autoAlign: false,
    enabled: true,
  },
  showDots: true,
  canvasBackground: isDarkMode.value ? "default" : "gray",
  photoOptions: {
    count: 3,
    spreadMode: "perpendicular",
  },
});

const getSavedConfig = () => {
  try {
    const defaults = getDefaultConfig();
    const saved = localStorage.getItem(CANVAS_CONFIG_KEY);
    if (!saved) return defaults;

    const parsed = JSON.parse(saved);
    const merged = {
      ...defaults,
      ...parsed,
      expansion: {
        ...defaults.expansion,
        ...(parsed.expansion || {}),
      },
      photoOptions: {
        ...defaults.photoOptions,
        ...(parsed.photoOptions || {}),
      },
    };

    // Background always follows the theme on load, matching the 2D/3D/tag-cloud
    // atlases (which don't persist their background). A color the user picks with
    // the selector applies for the session but is not restored on reload.
    merged.canvasBackground = defaults.canvasBackground;

    return merged;
  } catch {
    return getDefaultConfig();
  }
};

const savedConfig = getSavedConfig();

const toolbarState = ref({
  mouseMode: "move",
  zoomLevel: 0,
  expansion: savedConfig.expansion,
  showDots: savedConfig.showDots,
  canvasBackground: savedConfig.canvasBackground,
  photoOptions: savedConfig.photoOptions,
});

// Follow the app theme until the user picks a color explicitly (object value).
// While canvasBackground is a string id ("default"/"gray"/…) it tracks the theme.
watch(isDarkMode, (newIsDarkMode) => {
  const bg = toolbarState.value.canvasBackground;
  if (!bg || typeof bg === "string") {
    toolbarState.value.canvasBackground = newIsDarkMode ? "default" : "gray";
  }
});

// Persist user preferences (not session state) to localStorage, except for demo users.
// canvasBackground is intentionally omitted: it follows the app theme on each load,
// consistent with the other atlases (which don't persist their background).
watch(
  () => ({
    expansion: toolbarState.value.expansion,
    showDots: toolbarState.value.showDots,
    photoOptions: toolbarState.value.photoOptions,
  }),
  (config) => {
    if (!isDemoUser.value) {
      localStorage.setItem(CANVAS_CONFIG_KEY, JSON.stringify(config));
    }
  },
  { deep: true },
);

// Computed to get background color ID for CSS class
const canvasBackgroundId = computed(() => {
  const bg = toolbarState.value.canvasBackground;
  if (!bg) return "default";
  const backgroundId = typeof bg === "object" ? bg.id : bg;

  // Keep compatibility with previously stored values.
  if (backgroundId === "lightGray") return "gray";

  return backgroundId;
});

const isWoodBackground = computed(() => canvasBackgroundId.value === "wood");

const canvasBackgroundStyle = computed(() => {
  if (!isWoodBackground.value) {
    return undefined;
  }

  return {
    backgroundColor: "#7a5230",
  };
});
const canvasWoodSurfaceStyle = computed(() => {
  const zoom = toolbarState.value.zoomLevel || 1;
  const woodWorldPaddingX = Math.max(stageConfig.width, 1600) * 8;
  const woodWorldPaddingY = Math.max(stageConfig.height, 900) * 8;
  const woodWorldWidth = stageConfig.width + woodWorldPaddingX * 2;
  const woodWorldHeight = stageConfig.height + woodWorldPaddingY * 2;
  const woodTextureWorldWidth = Math.max(stageConfig.width * 3, 2200);

  return {
    left: `${stageOffset.x - woodWorldPaddingX * zoom}px`,
    top: `${stageOffset.y - woodWorldPaddingY * zoom}px`,
    width: `${woodWorldWidth * zoom}px`,
    height: `${woodWorldHeight * zoom}px`,
    backgroundImage: [
      "radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 38%)",
      "linear-gradient(180deg, rgba(42, 24, 11, 0.08), rgba(22, 12, 6, 0.22))",
      `url(${woodenTextureUrl})`,
    ].join(", "),
    backgroundSize: `auto, auto, ${woodTextureWorldWidth * zoom}px auto`,
  };
});

// State
const showPhotosDialog = ref(false);
const showTrashDialog = ref(false);
const basicModeDismissed = ref(false);
const showRelatedPhotos = ref(false);
const showPhotoInfoDialog = ref(false);
const selectedPhotosForToolbar = ref([]);
const selectedDialogPhoto = ref(null);
const isLoadingRelatedPhotos = ref(false);
const showResetCanvasModal = ref(false);

// Playground state
const showPlaygroundUpgradeModal = ref(false);

// Collection modal state
const showCollectionModal = ref(false);

const tabDirtyStore = useTabDirtyStore();
// The canvas tab is a singleton (see ROUTE_TABS_CONFIG): regardless of which
// canvas is loaded, its tab key is the static "canvas" string. The dirty state
// must be registered under that same key so the unsaved dot (and close
// confirmation) match the singleton tab.
const _tabKey = computed(() =>
  activeCanvasId.value != null ? "canvas" : null,
);

// Config menu state
const showConfigMenu = ref(false);
const configMenuRef = ref(null);

// Filter state
const selectedCollectionFilter = ref(null);

const trashPhotosCount = computed(() => canvasStore.discardedPhotos.length);

// Dropdown options with SVG icons

const accentColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--accent-color")
  .trim();

const {
  stageConfig,
  stageOffset,
  selectionRect,
  updateStageOffset,
  handleWheel,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchStart: stageHandleTouchStart,
  handleTouchMove: stageHandleTouchMove,
  handleTouchEnd: stageHandleTouchEnd,
} = useCanvasStage(stageRef, photos, toolbarState);

const {
  handleDragStart,
  handleDragMove,
  handleDragEnd,
  handleMouseOver,
  handleMouseOut,
  unstackPhotos,
  isHoveringTrash,
  handlePhotoDrop,
} = useCanvasPhoto(stageRef, photos, photoRefs, stageConfig);

const { animatePhotoGroup, animatePhotoGroupExplosion } = usePhotoAnimations();

const anySelectedPhotoHovered = computed(() =>
  photos.value.some((p) => p.hovered && p.selected),
);

const dynamicSizeFactor = computed(() => {
  const baseSize = 1.25;
  const zoom = toolbarState.value.zoomLevel || 100;
  let newFactor = baseSize * (0.8 / zoom);
  return Math.min(Math.max(newFactor, 1), 5);
});

// Computed property to determine if expansion mode should be available
const isExpansionEnabled = computed(() => {
  return toolbarState.value.expansion.enabled;
});

const expansionMode = computed(() => {
  if (!toolbarState.value.expansion.enabled) return null;
  return toolbarState.value.expansion.onCanvas ? "canvas" : "catalog";
});

// Keep catalog toolbar closed when expansion is disabled or on-canvas mode is active.
watch(
  () => [
    toolbarState.value.expansion.enabled,
    toolbarState.value.expansion.onCanvas,
  ],
  ([enabled, onCanvas]) => {
    if (!enabled || onCanvas) {
      showRelatedPhotos.value = false;
    }
  },
);

// Count selected photos
const selectedPhotosCount = computed(() => {
  return photos.value.filter((photo) => photo.selected).length;
});

// Get selected photo IDs for collection modal
const selectedPhotoIds = computed(() => {
  return photos.value
    .filter((photo) => photo.selected)
    .map((photo) => photo.id);
});

// Get selected photo positions for ordering in series (canvas only)
// Keys are stringified IDs for consistent lookup
const selectedPhotoPositions = computed(() => {
  const positions = {};
  photos.value
    .filter((photo) => photo.selected)
    .forEach((photo) => {
      // Use string key for consistent lookup
      positions[String(photo.id)] = {
        x: photo.config.x,
        y: photo.config.y,
      };
    });
  return positions;
});

// Computed property to filter expansion options based on basicMode
const filteredExpansionTypeOptions = computed(() => {
  return expansionTypeOptions.map((opt) => {
    if (basicMode.value && !["embedding", "chromatic"].includes(opt.value)) {
      return { ...opt, disabled: true };
    }
    return { ...opt, disabled: false };
  });
});

// Collections for filter dropdown
const collectionsOptions = computed(() => {
  const collections = collectionsStore.allCollections || [];
  return [
    { label: "All Photos", value: null },
    ...collections.map((col) => ({
      label: col.name || col.title,
      value: col.id,
    })),
  ];
});

// Get photo IDs from selected collection for filtering
const collectionPhotoIds = computed(() => {
  if (!selectedCollectionFilter.value) return null;

  const collection = collectionsStore.getCollectionById(
    selectedCollectionFilter.value,
  );
  if (!collection || !collection.photos) return [];

  return collection.photos.map((p) => p.id);
});

// Filter context to pass to expansion components
const filterContext = computed(() => ({
  collectionId: selectedCollectionFilter.value,
  photoIds: collectionPhotoIds.value,
}));

// Event handlers

function handlePhotoDropAndRemove(event) {
  handlePhotoDrop(event, relatedPhotosToolbarRef.value.removePhotoFromList);
}

async function handleAddPhotos(photoIds) {
  // Fetch todas las fotos necesarias en paralelo
  await Promise.all(photoIds.map((id) => photosStore.fetchPhoto(id)));

  const photosToAdd = photoIds
    .map((id) => photosStore.photos.find((p) => p.id == id))
    .filter(Boolean);

  // Pass autoFit=true to enable automatic fitting
  await canvasStore.addPhotos(photosToAdd, false, true);
}

async function handleAddPlaygroundPhotos(photosData) {
  // For playground mode, use the canvas store like normal mode with auto-fit
  await canvasStore.addPhotos(photosData, false, true);
}

// Handle deletion of broken photos (permanent deletion, not trash)
function handleDeleteBrokenPhoto(event) {
  const { photo } = event;
  event.cancelBubble = true;

  // Permanently remove the broken photo from canvas
  const photoIndex = photos.value.findIndex((p) => p.id === photo.id);
  if (photoIndex !== -1) {
    // Clean up any image references
    if (photo.image) {
      photo.image.onload = null;
      photo.image.onerror = null;
      photo.image = null;
    }

    // Remove from photos array permanently
    photos.value.splice(photoIndex, 1);

    // Force stage re-render
    const stage = stageRef.value?.getStage();
    if (stage) {
      stage.batchDraw();
    }
  }
}

// State for preventing duplicate expansion calls
const isExpanding = ref(false);

function handleAddPhotoFromPhoto(event) {
  // IMPORTANTE: Cancelar la propagación del evento INMEDIATAMENTE
  // para evitar que se seleccione la foto al hacer clic en los botones de expansión
  event.cancelBubble = true;

  // Check if expansion is enabled first
  if (!toolbarState.value.expansion.enabled) {
    return;
  }

  // Prevent duplicate calls during expansion
  if (isExpanding.value) {
    return;
  }

  if (isPlayground.value) {
    // In playground mode, show upgrade modal instead of expanding
    showPlaygroundUpgradeModal.value = true;
    return;
  }

  if (expansionMode.value == "canvas") {
    handleAddPhotosToCanvas(event);
  } else {
    // Para expansión por tags, siempre usar solo la foto clicada
    // (los tags siempre se seleccionan de la foto principal)
    if (toolbarState.value.expansion.type === "tags") {
      selectedPhotosForToolbar.value = [event.photo];
    } else {
      // Para otros tipos: si la foto clicada NO está seleccionada, usar solo esa foto
      // Si SÍ está seleccionada, usar todas las fotos seleccionadas
      if (!event.photo.selected) {
        selectedPhotosForToolbar.value = [event.photo];
      } else {
        const selectedPhotos = photos.value.filter((photo) => photo.selected);
        selectedPhotosForToolbar.value = selectedPhotos;
      }
    }
    showRelatedPhotos.value = true;
  }
}

const handleAddPhotosToCanvas = async (event) => {
  const { photo, position } = event;
  event.cancelBubble = true;

  // Prevent duplicate calls
  if (isExpanding.value) {
    return;
  }

  isExpanding.value = true;

  try {
    const basePosition = { x: photo.config.x, y: photo.config.y };

    // Extraemos el margen y dimensiones para calcular offset
    const margin = 35;
    const photoWidth =
      photos.value.length > 0 ? photos.value[0].config.width : 200;
    const photoHeight =
      photos.value.length > 0 ? photos.value[0].config.height : 200;
    const offsetX = photoWidth + margin;
    const offsetY = photoHeight + margin;

    await canvasStore.addPhotosFromPhoto(
      [photo],
      toolbarState.value.expansion.type,
      toolbarState.value.photoOptions.count,
      basePosition,
      toolbarState.value.expansion.opposite,
      toolbarState.value.expansion.inverted,
      true,
      false, // autoFit
      filterContext.value, // Pass filter context
    );

    if (
      toolbarState.value.photoOptions.spreadMode == "linear" ||
      toolbarState.value.photoOptions.spreadMode == "perpendicular"
    ) {
      animatePhotoGroup(
        photoRefs,
        photos,
        basePosition,
        position,
        offsetX,
        offsetY,
        toolbarState.value.photoOptions.spreadMode,
      );
    } else {
      animatePhotoGroupExplosion(photoRefs, photos, basePosition, position);
    }
  } finally {
    // Reset the flag after a delay to allow future expansions
    setTimeout(() => {
      isExpanding.value = false;
    }, 500);
  }
};

const getPhotoStrokeColor = (photo) => {
  if (photo.imageBroken)
    return photo.selected
      ? "rgba(255, 165, 0, 0.8)"
      : "rgba(128, 128, 128, 0.4)";
  if (photo.inTrash) return "rgba(250, 11, 11, 0.5)";
  if (photo.selected) return accentColor;
  if (photo.isNew) return "#22d3ee";
  // if (photo.hovered) return accentColor;
  return "gray";
};

const handleSaveCanvas = async () => {
  try {
    const success = await saveCanvas();
    if (success) {
      console.log("Canvas saved successfully");
    } else {
      console.error("Failed to save canvas");
    }
  } catch (error) {
    console.error("Error saving canvas:", error);
  }
};

const isSwitchingCanvas = ref(false);

const getCanvasIdFromRouteParams = () => {
  const canvasIdParam = route.params.canvasId;

  if (canvasIdParam == null || String(canvasIdParam).trim() === "") {
    return null;
  }

  const parsed = Number(canvasIdParam);
  return Number.isFinite(parsed) ? parsed : null;
};

const syncCanvasIdToRoute = async (canvasId) => {
  if (isPlayground.value) return;

  const currentCanvasId = route.params.canvasId;
  const nextCanvasId =
    canvasId == null ? undefined : String(Math.trunc(Number(canvasId)));

  if ((currentCanvasId ?? undefined) === nextCanvasId) {
    return;
  }

  await router.replace({
    name: "canvas",
    params: { canvasId: nextCanvasId },
    query: route.query,
  });
};

const handleSwitchCanvas = async (id, options = {}) => {
  const { syncQuery = true } = options;
  const targetId = Number(id);

  if (!Number.isFinite(targetId)) {
    return;
  }

  // Auto-save current canvas before switching
  if (hasUnsavedChanges.value) {
    await saveCanvas();
  }
  isSwitchingCanvas.value = true;
  try {
    const ok = await switchCanvas(targetId);
    if (ok) {
      if (syncQuery && !isPlayground.value) {
        await syncCanvasIdToRoute(targetId);
      }
      setTimeout(() => fitStageToPhotos(), 100);
    }
  } finally {
    isSwitchingCanvas.value = false;
  }
};

const handleCreateCanvas = async () => {
  // Auto-save current canvas before creating new
  if (hasUnsavedChanges.value) {
    await saveCanvas();
  }
  const newId = await createCanvas();
  if (newId) {
    await syncCanvasIdToRoute(newId);
    window.dispatchEvent(new Event("canvas:list-updated"));

    // store already cleared by composable; reset stage
    const stage = stageRef.value.getStage();
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
    toolbarState.value.zoomLevel = 1;
    updateStageOffset();
  }
};

const handleRenameCanvas = async (id, name) => {
  const ok = await renameCanvas(id, name);
  if (ok) {
    window.dispatchEvent(new Event("canvas:list-updated"));
  }
};

const handleDeleteCanvas = async (id) => {
  const ok = await deleteCanvas(id);
  if (ok) {
    window.dispatchEvent(new Event("canvas:list-updated"));
  }
  // If the active canvas changed (deleted), fit stage to new canvas photos
  setTimeout(() => fitStageToPhotos(), 100);
};

const handleClearCanvas = async () => {
  // Clean up blob URLs for all photos before clearing
  [...canvasStore.photos, ...canvasStore.discardedPhotos].forEach((photo) => {
    if (photo.src && photo.src.startsWith("blob:")) {
      URL.revokeObjectURL(photo.src);
    }
    if (photo.thumbnailUrl && photo.thumbnailUrl.startsWith("blob:")) {
      URL.revokeObjectURL(photo.thumbnailUrl);
    }
    // Clean up image references to prevent memory leaks
    if (photo.image) {
      photo.image.onload = null;
      photo.image.onerror = null;
      photo.image = null;
    }
    photo.imageBroken = false;
  });

  // Limpiar fotos y descartados
  canvasStore.$patch({ photos: [] });
  canvasStore.$patch({ discardedPhotos: [] });

  // Limpiar el canvas guardado
  await clearSavedCanvas();

  // Resetear zoom y posición del stage
  const stage = stageRef.value.getStage();
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  stage.batchDraw();

  // Resetear el zoomLevel del estado
  toolbarState.value.zoomLevel = 1;

  // Resetear offset
  updateStageOffset();
};

const handleConfirmClearCanvas = async () => {
  showResetCanvasModal.value = false;
  await handleClearCanvas();
};

const handleCancelClearCanvas = () => {
  showResetCanvasModal.value = false;
};

const fitStageToPhotos = (extraPaddingRatio = 0.1) => {
  // Delegate to store method
  canvasStore.fitStageToPhotos(extraPaddingRatio, TOOLBAR_WIDTH);
};

const openConfig = () => {
  showConfigMenu.value = !showConfigMenu.value;
};

// Register/unregister dirty state for the tab system
watch(
  [hasUnsavedChanges, _tabKey],
  ([dirty, key]) => {
    if (!key) return;
    if (dirty && !isPlayground.value) {
      tabDirtyStore.register(key, {
        save: async () => {
          await saveCanvas();
        },
      });
    } else {
      tabDirtyStore.unregister(key);
    }
  },
  { immediate: true },
);

// Toolbar functions
const hideRelatedPhotos = () => {
  showRelatedPhotos.value = false;
};

const onPhotosSelected = (photoIds) => {
  console.log("Photos selected:", photoIds);
  // TODO: Handle selected photos
};

const onSearchTypeChanged = (searchType) => {
  console.log("Search type changed:", searchType);
  // TODO: Update related photos based on search type
};

const handleDownloadSelectedPhotos = async () => {
  const selectedPhotos = photos.value.filter((photo) => photo.selected);

  if (selectedPhotos.length === 0) return;

  if (selectedPhotos.length === 1) {
    // Download single photo
    await downloadPhoto(selectedPhotos[0]);
  } else {
    // Download multiple photos as ZIP
    await downloadPhotosZip(selectedPhotos);
  }
};

const handleAddToCollection = () => {
  if (selectedPhotoIds.value.length > 0) {
    showCollectionModal.value = true;
  }
};

const clearCanvasSelections = () => {
  photos.value.forEach((photo) => {
    if (photo.selected) {
      photo.selected = false;
    }
  });
};

const handleCollectionAdded = (data) => {
  // Clear selections after successfully adding to collection
  clearCanvasSelections();
  showCollectionModal.value = false;
};

const handleCollectionModalCancel = () => {
  showCollectionModal.value = false;
};

const handleToolSelected = async (toolId, canvasId = null) => {
  // Get selected photo IDs
  const selectedIds = photos.value
    .filter((photo) => photo.selected)
    .map((photo) => photo.id);

  // Clear selections
  const clearSelections = () => {
    clearCanvasSelections();
  };

  // When the destination is a canvas and we're already in CanvasView,
  // router.push('/canvas') would be a no-op (same route), so handle it directly.
  if (toolId === "canvas") {
    if (selectedIds.length === 0) return;

    await Promise.all(selectedIds.map((id) => photosStore.fetchPhoto(id)));
    const photosToAdd = selectedIds
      .map((id) => photosStore.photos.find((p) => p.id == id))
      .filter(Boolean);

    if (photosToAdd.length === 0) return;

    clearSelections();
    closeToolSelector();

    if (canvasId === "new") {
      await handleCreateCanvas();
    } else if (canvasId !== null) {
      await handleSwitchCanvas(canvasId);
    }

    await canvasStore.addPhotos(photosToAdd, false, true);
    return;
  }

  // For all other tools, use the composable (which navigates away)
  await takeToTool(toolId, selectedIds, clearSelections, canvasId);
  closeToolSelector();
};

const handleSendToChat = async () => {
  const selectedIds = photos.value
    .filter((photo) => photo.selected)
    .map((photo) => photo.id);
  const clearSelections = () => {
    clearCanvasSelections();
  };
  await takeToChat(selectedIds, clearSelections);
};

const openPhotoInfo = (photo, event) => {
  event.cancelBubble = true;
  selectedDialogPhoto.value = photo;
  showPhotoInfoDialog.value = true;
};

const handleInfoButtonClick = async ({ photo, event }) => {
  if (event) event.cancelBubble = true;
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  if (fullPhoto) {
    selectedDialogPhoto.value = fullPhoto;
    showPhotoInfoDialog.value = true;
  }
};

const handleToolbarPhotoInfo = async (photo) => {
  const fullPhoto = await photosStore.fetchPhoto(photo.id);
  selectedDialogPhoto.value = fullPhoto;
  showPhotoInfoDialog.value = true;
};

// Resize handling
const handleResize = () => {
  if (stageRef.value && canvasContainer.value) {
    const stage = stageRef.value.getStage();
    const container = canvasContainer.value;
    const w = container.clientWidth;
    const h = container.clientHeight;
    // Never set a zero-sized stage. A resize event can fire while the view is
    // detached/hidden by KeepAlive (clientWidth/Height === 0), which would
    // collapse the auto-fit zoom to 0 and make imported photos invisible.
    if (w > 0 && h > 0) {
      stage.width(w);
      stage.height(h);
    }
  }
};

// Close config menu function
const closeConfigMenu = () => {
  showConfigMenu.value = false;
};

// Click outside handler to close dropdown only
const handleClickOutside = (event) => {
  // Close config menu if clicking outside
  if (configMenuRef.value && !configMenuRef.value.contains(event.target)) {
    closeConfigMenu();
  }
};

const handleKeyDown = (event) => {
  // Check if user is typing in an input field (including Naive UI inputs)
  const targetElement = event.target;
  const isTyping =
    ["INPUT", "TEXTAREA"].includes(targetElement.tagName) ||
    targetElement.contentEditable === "true" ||
    targetElement.isContentEditable ||
    targetElement.getAttribute?.("contenteditable") === "true" ||
    // Check if typing in any input-like component (Naive UI, etc.)
    targetElement.closest?.("input, textarea, [contenteditable]") !== null ||
    document.activeElement?.tagName === "INPUT" ||
    document.activeElement?.tagName === "TEXTAREA";

  // Delete selected photos ONLY when Delete (Supr) key is pressed
  // Backspace is reserved for text editing and should not delete photos
  if (event.key === "Delete" && !isTyping) {
    event.preventDefault();
    deleteSelectedPhotos();
  }

  // Zoom in with 'A' key - DISABLED
  // if (event.key === "a" || event.key === "A") {
  //   // Only if not typing in an input field
  //   if (!isTyping) {
  //     event.preventDefault();
  //     zoomTick(1);
  //   }
  // }

  // Zoom out with 'Z' key - DISABLED
  // if (event.key === "z" || event.key === "Z") {
  //   // Only if not typing in an input field
  //   if (!isTyping) {
  //     event.preventDefault();
  //     zoomTick(-1);
  //   }
  // }

  // Escape key to deselect all photos
  if (event.key === "Escape") {
    photos.value.forEach((photo) => {
      photo.selected = false;
    });
  }
};

const deleteSelectedPhotos = () => {
  const selectedPhotos = photos.value.filter((photo) => photo.selected);

  if (selectedPhotos.length === 0) {
    return;
  }

  // Use canvas store method to move photos to trash instead of deleting them
  const selectedPhotoIds = selectedPhotos.map((photo) => photo.id);
  canvasStore.deletePhotos(selectedPhotoIds);

  // Update stage after deletion
  const stage = stageRef.value.getStage();
  stage.batchDraw();
};

// Helper function to reset canvas state (used by both click and touch)
const resetCanvasState = () => {
  photos.value.forEach((photo) => {
    photo.selected = false;
    // Also hide hover state/buttons when clicking/touching outside
    photo.hovered = false;
  });

  // Close any open menus
  closeConfigMenu();
  showRelatedPhotos.value = false;
};

const handleStageClick = (event) => {
  // If clicking on empty space (not on a photo), deselect all photos
  // unless a rectangle selection is currently being drawn
  if (event.target === event.target.getStage() && !selectionRect.visible) {
    resetCanvasState();
  }
};

// Touch event handlers for better tablet/mobile support
const handleTouchStart = (event) => {
  stageHandleTouchStart(event);

  // Store touch start data for tap detection on stage
  const touch = event.evt.touches[0];
  if (touch) {
    event.target._stageTouchStartTime = Date.now();
    event.target._stageTouchStartPos = { x: touch.clientX, y: touch.clientY };
  }
};

const handleTouchMove = (event) => {
  stageHandleTouchMove(event);
};

const handleTouchEnd = (event) => {
  stageHandleTouchEnd(event);

  // Handle tap on stage (similar to handleStageClick)
  const touch = event.evt.changedTouches[0];
  if (
    touch &&
    event.target._stageTouchStartTime &&
    event.target._stageTouchStartPos
  ) {
    const touchDuration = Date.now() - event.target._stageTouchStartTime;
    const touchDistance = Math.sqrt(
      Math.pow(touch.clientX - event.target._stageTouchStartPos.x, 2) +
        Math.pow(touch.clientY - event.target._stageTouchStartPos.y, 2),
    );

    // Consider it a tap if duration < 300ms and distance < 15px (more responsive for stage)
    if (touchDuration < 300 && touchDistance < 15) {
      // If touching empty space (not on a photo), perform same actions as click
      if (event.target === event.target.getStage() && !selectionRect.visible) {
        resetCanvasState();
      }
    }

    // Clean up touch tracking
    delete event.target._stageTouchStartTime;
    delete event.target._stageTouchStartPos;
  }
};

const handlePhotoClick = (photo, event) => {
  // Ignore click selection when it was a drag operation
  if (photo._wasDragged) {
    photo._wasDragged = false;
    return;
  }

  // Canvas click is additive/toggle by default (multi-select without modifiers).
  // Ctrl/Cmd keeps the same toggle behavior for consistency across platforms.
  photo.selected = !photo.selected;

  event.cancelBubble = true;
};

// Touch handlers for photos
const handlePhotoTouchStart = (photo, event) => {
  // Prevent default touch behavior and synthetic mouse events
  event.evt.preventDefault();
  event.cancelBubble = true;

  // Store touch start time and position for tap detection
  const touch = event.evt.touches[0];
  if (touch) {
    photo._touchStartTime = Date.now();
    photo._touchStartPos = { x: touch.clientX, y: touch.clientY };
    photo._touchActive = true;

    // Mark as potentially dragged - will be reset in touchend if it was just a tap
    photo._potentiallyDragged = true;
  }
};

const handlePhotoTouchEnd = (photo, event) => {
  // Prevent default touch behavior and synthetic mouse events
  event.evt.preventDefault();
  event.cancelBubble = true;

  const touch = event.evt.changedTouches[0];
  if (
    touch &&
    photo._touchStartTime &&
    photo._touchStartPos &&
    photo._touchActive
  ) {
    const touchDuration = Date.now() - photo._touchStartTime;
    const touchDistance = Math.sqrt(
      Math.pow(touch.clientX - photo._touchStartPos.x, 2) +
        Math.pow(touch.clientY - photo._touchStartPos.y, 2),
    );

    // Consider it a tap if duration < 500ms and distance < 10px
    if (touchDuration < 500 && touchDistance < 10) {
      // Reset the drag flag since this was just a tap
      photo._potentiallyDragged = false;

      // Toggle hover state on tap
      photo.hovered = !photo.hovered;

      // On touch, toggle selected state for quick multi-selection gestures.
      photo.selected = !photo.selected;
    } else {
      // This was likely a drag, so mark as dragged to prevent selection
      photo._wasDragged = true;
      // Reset after delay
      setTimeout(() => {
        photo._wasDragged = false;
        photo._potentiallyDragged = false;
      }, 50);
    }

    // Clean up touch tracking
    delete photo._touchStartTime;
    delete photo._touchStartPos;
    delete photo._touchActive;
  }
};

function zoomTick(direction = 1) {
  const stage = stageRef.value.getStage();
  const scaleBy = 1.11;

  const oldScale = stage.scaleX();
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

  const pointer = {
    x: stage.width() / 2,
    y: stage.height() / 2,
  };

  applyZoom(stage, newScale, updateStageOffset, pointer);
}

// Track in-progress image loads by photo ID to avoid duplicate requests
const _pendingImageLoads = new Map();

// Schedule a sequence of snapshots to capture state before/after the fit tween.

watch(
  () => photos.value.map((p) => p.src),
  () => {
    // Purge stale pending-load entries for photos no longer in the store
    // (e.g. after a canvas switch the array is fully replaced; without this,
    // photos that reappear with the same ID would have their load skipped
    // while photo.image stays null).
    const currentIds = new Set(photos.value.map((p) => p.id));
    for (const id of _pendingImageLoads.keys()) {
      if (!currentIds.has(id)) _pendingImageLoads.delete(id);
    }

    photos.value.forEach((photo) => {
      // Already loaded and valid — nothing to do
      if (photo.image && photo.image.src === photo.src && !photo.imageBroken) {
        // Check if existing image became invalid (deleted from server after initial load)
        if (photo.image.complete && photo.image.naturalWidth === 0) {
          console.warn(`Image became invalid: ${photo.src}`);
          photo.imageBroken = true;
          photo.image.onload = null;
          photo.image.onerror = null;
          photo.image = null;
          _pendingImageLoads.delete(photo.id);
          const stage = stageRef.value?.getStage();
          if (stage) stage.batchDraw();
        }
        return;
      }

      // Already loading this exact src — skip
      if (_pendingImageLoads.get(photo.id) === photo.src) {
        console.log(
          "🔍[IMG WATCH] skip (already loading)",
          photo.id,
          "hasImage:",
          !!photo.image,
        );
        return;
      }

      // Clear previous image if src changed
      if (photo.image) {
        photo.image.onload = null;
        photo.image.onerror = null;
        photo.image = null;
        photo.imageBroken = false;
      }

      _pendingImageLoads.set(photo.id, photo.src);
      const img = new Image();

      img.onerror = () => {
        _pendingImageLoads.delete(photo.id);
        console.warn(`Failed to load image: ${photo.src}`);
        photo.imageBroken = true;
        // Do NOT assign photo.image — keep it null so Konva never draws a broken element
        const stage = stageRef.value?.getStage();
        if (stage) stage.batchDraw();
      };

      img.onload = () => {
        _pendingImageLoads.delete(photo.id);
        photo.imageBroken = false;
        // markRaw prevents Vue from wrapping the HTMLImageElement in a reactive Proxy.
        // Passing a Proxy to the native drawImage() API causes browsers to misidentify
        // it as a canvas element with 0×0 dimensions, throwing InvalidStateError.
        photo.image = markRaw(img);
        const stage = stageRef.value?.getStage();

        if (stage) stage.batchDraw();
      };

      img.src = photo.src;
    });
  },
  { immediate: true },
);

watch(basicMode, (val) => {
  if (val) basicModeDismissed.value = false;
});

// Periodic check for broken images that were previously valid
let imageValidationInterval = null;
const checkImageValidity = () => {
  photos.value.forEach((photo) => {
    if (photo.image && !photo.imageBroken) {
      // Test if the image is still accessible by trying to draw it to a temporary canvas
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 1;
        canvas.height = 1;
        ctx.drawImage(photo.image, 0, 0, 1, 1);
      } catch (error) {
        console.warn(`Image validation failed for: ${photo.src}`, error);
        photo.imageBroken = true;
        photo.image.onload = null;
        photo.image.onerror = null;
        photo.image = null;
        // Force a re-render
        const stage = stageRef.value?.getStage();
        if (stage) {
          stage.batchDraw();
        }
      }
    }
  });
};

watch(
  () => route.params.canvasId,
  async () => {
    if (isPlayground.value || isSwitchingCanvas.value) {
      return;
    }

    const targetCanvasId = getCanvasIdFromRouteParams();
    if (targetCanvasId && targetCanvasId !== activeCanvasId.value) {
      await handleSwitchCanvas(targetCanvasId, { syncQuery: false });
    }
  },
);

watch(activeCanvasId, (id) => {
  void syncCanvasIdToRoute(id);
});

onMounted(async () => {
  window.addEventListener("resize", handleResize);
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("canvas:list-updated", refreshCanvasList);
  const stage = stageRef.value.getStage();
  stage.on("dragmove", updateStageOffset);

  // Configure Konva for better touch support
  stage.listening(true);

  // Enable touch events and improve touch handling
  const canvas = stage.content;
  if (canvas) {
    canvas.style.touchAction = "none";
    // Disable context menu on long press for better touch experience
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // Ensure touch events are properly handled
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), {
      passive: false,
    });
  }

  // Add touch drop support
  const canvasContainerEl = canvasContainer.value;
  if (canvasContainerEl) {
    canvasContainerEl.addEventListener("touchDrop", (e) => {
      handlePhotoDrop(
        e.detail,
        relatedPhotosToolbarRef.value.removePhotoFromList,
      );
    });
  }

  updateStageOffset();

  // Register stage reference and update function for auto-fitting
  canvasStore.setStageRef(stageRef.value);
  canvasStore.updateStageOffset = updateStageOffset;
  canvasStore.toolbarState = toolbarState;

  // Initialize canvas persistence
  initializeChangeDetection();

  // Try to load saved canvas
  try {
    const hasLoaded = await loadCanvas();
    if (hasLoaded) {
      const targetCanvasId = getCanvasIdFromRouteParams();
      if (targetCanvasId && targetCanvasId !== activeCanvasId.value) {
        await handleSwitchCanvas(targetCanvasId, { syncQuery: false });
      } else if (activeCanvasId.value) {
        await syncCanvasIdToRoute(activeCanvasId.value);
      }

      console.log("Canvas loaded successfully");
      // Fit stage to loaded photos after a short delay
      setTimeout(() => {
        fitStageToPhotos();
      }, 100);
    } else {
      // No saved canvas, proceed normally
      fitStageToPhotos();
    }
  } catch (error) {
    console.error("Error loading canvas:", error);
    fitStageToPhotos();
  }

  // Process pending photos queued from other views (e.g. takeToCanvas)
  if (canvasStore.pendingPhotosToAdd.length > 0) {
    const pending = [...canvasStore.pendingPhotosToAdd];
    canvasStore.pendingPhotosToAdd = [];
    console.log(
      "🔍[MOUNTED] processing pending",
      pending.length,
      "ids:",
      pending.map((p) => p.id),
      "pendingCanvasId:",
      canvasStore.pendingCanvasId,
      "activeCanvasId:",
      activeCanvasId.value,
    );
    // If a specific canvas was requested, switch to it first
    if (canvasStore.pendingCanvasId === "new") {
      canvasStore.pendingCanvasId = null;
      await handleCreateCanvas();
    } else if (canvasStore.pendingCanvasId !== null) {
      const targetId = canvasStore.pendingCanvasId;
      canvasStore.pendingCanvasId = null;
      await switchCanvas(targetId);
    }
    await canvasStore.addPhotos(pending, false, true);
    console.log(`✅ Added ${pending.length} pending photos to canvas`);
    __diagAfterAdd("MOUNTED");
  } else if (canvasStore.pendingCanvasId !== null) {
    // No photos to add, but a specific canvas was requested (e.g. from global search)
    const targetId = canvasStore.pendingCanvasId;
    canvasStore.pendingCanvasId = null;
    if (targetId === "new") {
      await handleCreateCanvas();
    } else {
      await switchCanvas(targetId);
    }
    setTimeout(() => fitStageToPhotos(), 100);
  }

  // Load photos from query params if present (e.g., ?source=lightroom&ids=123,456)
  // Sigue el mismo patrón que PhotosDialog: obtener photoIds y usar handleAddPhotos
  const photoIdsFromQuery = getPhotoIdsFromQuery({
    clearAfterLoad: true,
    // Callback para cuando el store se cargue después (caso async)
    onReady: async (photoIds) => {
      if (photoIds.length > 0) {
        await handleAddPhotos(photoIds);
        console.log(
          `✅ Added ${photoIds.length} photos from URL to canvas (async)`,
        );
      }
    },
  });

  // Caso sync: si el store ya estaba cargado, añadir las fotos inmediatamente
  if (photoIdsFromQuery.length > 0) {
    await handleAddPhotos(photoIdsFromQuery);
    console.log(
      `✅ Added ${photoIdsFromQuery.length} photos from URL to canvas`,
    );
  }

  // Auto-open photos dialog in playground mode
  if (isPlayground.value) {
    showPhotosDialog.value = true;
  }

  // Start periodic image validation check (every 5 seconds)

  // Fetch collections for filter dropdown (only in non-playground mode)
  if (!isPlayground.value) {
    collectionsStore.getOrFetch().catch((err) => {
      console.error("Failed to load collections for filter:", err);
    });
  }
});

// onActivated fires on BOTH first-mount and KeepAlive re-entries
// On first mount, onMounted (async) handles loadCanvas + pending photos.
// We must skip the first activation so we don't race with loadCanvas.
let _canvasActivatedOnce = false;
onActivated(async () => {
  if (!_canvasActivatedOnce) {
    // First activation coincides with onMounted — let onMounted handle everything.
    _canvasActivatedOnce = true;
    return;
  }
  // Subsequent activations: onMounted won't run, so process pending photos here.
  // The view was detached by KeepAlive, so the stage may carry a stale/zero size.
  // Refresh it from the now-visible container before any auto-fit runs.
  handleResize();
  if (canvasStore.pendingPhotosToAdd.length > 0) {
    const pending = [...canvasStore.pendingPhotosToAdd];
    canvasStore.pendingPhotosToAdd = [];

    // If a specific canvas was requested, switch to it first
    if (canvasStore.pendingCanvasId === "new") {
      canvasStore.pendingCanvasId = null;
      await handleCreateCanvas();
    } else if (canvasStore.pendingCanvasId !== null) {
      const targetId = canvasStore.pendingCanvasId;
      canvasStore.pendingCanvasId = null;
      await switchCanvas(targetId);
    }
    await canvasStore.addPhotos(pending, false, true);
    console.log(
      `✅ Added ${pending.length} pending photos to canvas (re-activated)`,
    );
  } else if (canvasStore.pendingCanvasId !== null) {
    // No photos to add, but a specific canvas was requested (e.g. from global search)
    const targetId = canvasStore.pendingCanvasId;
    canvasStore.pendingCanvasId = null;
    if (targetId === "new") {
      await handleCreateCanvas();
    } else {
      await switchCanvas(targetId);
    }
    setTimeout(() => fitStageToPhotos(), 100);
  }
});

onUnmounted(() => {
  // Clean up blob URLs before unmounting
  [...canvasStore.photos, ...canvasStore.discardedPhotos].forEach((photo) => {
    if (photo.src && photo.src.startsWith("blob:")) {
      URL.revokeObjectURL(photo.src);
    }
    if (photo.thumbnailUrl && photo.thumbnailUrl.startsWith("blob:")) {
      URL.revokeObjectURL(photo.thumbnailUrl);
    }
    // Clean up image references
    if (photo.image) {
      photo.image.onload = null;
      photo.image.onerror = null;
      photo.image = null;
    }
  });

  // Clear image validation interval
  if (imageValidationInterval) {
    clearInterval(imageValidationInterval);
    imageValidationInterval = null;
  }

  window.removeEventListener("resize", handleResize);
  document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("canvas:list-updated", refreshCanvasList);

  // Clean up touch drop listener
  const canvasContainerEl = canvasContainer.value;
  if (canvasContainerEl) {
    canvasContainerEl.removeEventListener("touchDrop", handlePhotoDrop);
  }

  // No glow interval cleanup needed since we're not using animations
});
</script>

<style scoped>
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-canvas, #1a1a1a);
  touch-action: none; /* Disable default touch behaviors */
  -webkit-touch-callout: none; /* Disable callout on iOS */
  -webkit-user-select: none; /* Disable text selection */
  -khtml-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  /* Improve touch responsiveness */
  -webkit-tap-highlight-color: transparent;
  -webkit-overflow-scrolling: touch;
}

.canvas-container.playground-mode {
  height: 100vh; /* Full screen in playground mode */
}

.canvas-stage-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.canvas-wood-surface {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  background-position:
    center,
    center,
    0 0;
  background-repeat: no-repeat, no-repeat, repeat;
  will-change: left, top, width, height, background-size;
}

.canvas-controls {
  position: absolute;
  z-index: 10;
}

.top-left {
  top: 16px;
  left: 16px;
}

.top-center {
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
}

.top-right {
  top: 16px;
  right: 16px;
}

.playground-logo {
  top: 1px;
  right: 4px;
  z-index: 1000;
}

.logo-container-playground {
  border-radius: 12px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-brand-image-playground {
  height: 50px;
  width: auto;
  object-fit: contain;
}

.bottom-left {
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selection-indicator {
  background: var(--bg-container, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(8px);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Expandable button group styles */
.expandable-button-group {
  display: flex;
  align-items: center;
  border-radius: 18px;
  background: var(--bg-container, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(8px);
  position: relative;
  z-index: 1;
}

.mode-button {
  border-radius: 0 !important;
  border: none !important;
}

.left-button {
  border-top-left-radius: 18px !important;
  border-bottom-left-radius: 18px !important;
  padding: 0 12px;
}

.expandable-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 40px; /* Initial width for just the icon */
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.expandable-container.expanded {
  width: 150px; /* Expanded width to fit text and dropdown arrow */
  overflow: visible; /* Allow dropdown to show outside container */
}

.right-button {
  width: 100%;
  border-top-right-radius: 18px !important;
  border-bottom-right-radius: 18px !important;
  justify-content: space-between;
  white-space: nowrap;
  padding: 0 12px;
  overflow: hidden;
}

.button-text {
  font-size: 12px;
  font-weight: 500;
  opacity: 0;
  animation: fadeIn 0.2s ease-in 0.1s forwards;
}

.dropdown-arrow {
  opacity: 0;
  animation: fadeIn 0.2s ease-in 0.1s forwards;
}

@keyframes fadeIn {
  to {
    opacity: 1;
  }
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-container, rgba(30, 30, 30, 0.95));
  backdrop-filter: blur(12px);

  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  margin-top: 4px;
  min-width: 140px;
  animation: slideDown 0.2s ease-out;
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

.dropdown-item {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.8));
  transition: all 0.2s ease;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: var(--bg-surface, rgba(255, 255, 255, 0.1));
  color: var(--text-primary, #ffffff);
}

.dropdown-item.active {
  background: var(--primary-color, #007bff);
  color: #ffffff;
}

.dropdown-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.dropdown-item.disabled:hover {
  background: transparent;
  color: var(--text-secondary, rgba(255, 255, 255, 0.8));
}

.option-icon {
  margin-right: 8px;
  width: 16px;
  height: 16px;
}

/* Config Menu Styles */
.config-menu-container {
  position: relative;
}

.config-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--bg-container, rgba(30, 30, 30, 0.95));
  backdrop-filter: blur(12px);
  /* border-radius: 12px; */
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  margin-top: 8px;
  min-width: 300px;
  animation: slideDown 0.2s ease-out;
}

.config-section {
  padding: var(--spacing-lg);
}

.config-section:not(:last-child) {
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}

.section-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-toggle {
  margin-left: auto;
}

.config-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.config-item:last-child {
  margin-bottom: 0;
}

.config-item.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.config-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}

.layout-pills {
  display: flex;
  gap: var(--spacing-xs);
}

.layout-pill {
  padding: 4px 8px !important;
  font-size: var(--font-size-xs) !important;
  border-radius: var(--radius-sm) !important;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .canvas-controls {
    font-size: 14px;
  }

  .top-left,
  .top-center,
  .top-right {
    top: 12px;
  }

  .top-left {
    left: 12px;
  }

  .top-right {
    right: 12px;
  }

  .playground-logo {
    right: 12px;
  }

  .expandable-container.expanded {
    width: 150px; /* Slightly smaller on tablets */
  }
}

@media (max-width: 480px) {
  .top-center {
    top: 70px; /* Move mode switch below other controls on mobile */
  }

  .top-left,
  .top-right {
    top: 8px;
  }

  .top-left {
    left: 8px;
  }

  .top-right {
    right: 8px;
  }

  .playground-logo {
    right: 8px;
  }

  .logo-container-playground {
    padding: 8px;
  }

  .logo-brand-image-playground {
    height: 24px;
  }

  .expandable-container.expanded {
    width: 150px; /* Even smaller on mobile */
  }

  .button-text {
    font-size: 12px;
  }
}
.trash-zone {
  position: relative;
  width: 100px;
  height: 100px;
  display: flex;
  /* background-color: rgba(255, 0, 0, 0.1); */
  /* border: 1px solid rgba(250, 11, 11, 0.5); */
  border-radius: 8px;
  font-size: 40px;
  text-align: center;
  align-items: center;
  line-height: 90px;

  transition:
    background-color 0.2s,
    border-color 0.2s,
    transform 0.2s ease;
  transform: rotate(0deg) scale(1);
  align-content: center;
  justify-content: center;
  cursor: pointer;
}

.trash-zone-anchor {
  position: absolute;
  right: 1px;
  bottom: 0;
  z-index: 11;
}

.trash-zone-badge {
  position: absolute;
  top: 16px;
  right: 14px;
}

.trash-zone-badge :deep(.n-badge-sup) {
  background-color: rgba(107, 114, 128, 0.9) !important;
  color: rgba(255, 255, 255, 0.9) !important;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.trash-zone.hovering {
  background-color: rgba(255, 0, 0, 0.25);
  border-color: darkred;
  transform: rotate(8deg) scale(1.08);
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

/* Unsaved Changes Dialog */
.unsaved-changes-confirmation {
  padding: var(--spacing-md) 0;
}

.unsaved-changes-confirmation p {
  margin: 0 0 var(--spacing-md) 0;
  line-height: 1.5;
}

.unsaved-warning {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--warning-color-suppl, rgba(245, 166, 35, 0.1));
  border: 1px solid var(--warning-color, rgba(245, 166, 35, 0.3));
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

/* Canvas background colors */
.canvas-container.bg-default {
  background-color: #000000 !important;
}

.canvas-container.bg-white {
  background-color: #ffffff !important;
}

.canvas-container.bg-gray,
.canvas-container.bg-lightGray {
  background-color: #d3d3d3 !important;
}

/* Dots overlay for each background */
.canvas-container.show-dots.bg-default {
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.15) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}

.canvas-container.show-dots.bg-white {
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.15) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}

.canvas-container.show-dots.bg-lightGray {
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.15) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}

.canvas-container.show-dots.bg-gray {
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.15) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}
</style>
