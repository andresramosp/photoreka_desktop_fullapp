<template>
  <div
    class="canvas-container"
    :class="{
      'playground-mode': isPlayground,
      'show-dots': toolbarState.showDots,
    }"
  >
    <div
      ref="canvasContainer"
      @dragover.prevent
      @drop="handlePhotoDropAndRemove"
    >
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
              stroke: secondaryColor,
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
              opacity: photo.imageBroken ? 0.6 : photo.config.opacity ?? 1,
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
                stageRef.getStage().container().style.cursor =
                  interactionMode === 'select' ? 'pointer' : 'pointer';
              "
              @mouseout="
                handleMouseOut(photo);
                stageRef.getStage().container().style.cursor =
                  interactionMode === 'select' ? 'crosshair' : 'default';
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
                    photo.hovered
                  "
                  :photo="photo"
                  :fill="secondaryColor"
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
      :base-image="selectedPhotoForToolbar"
      :is-visible="showRelatedPhotos"
      :is-loading="isLoadingRelatedPhotos"
      :toolbar-state="toolbarState"
      @close="hideRelatedPhotos"
      @loading="isLoadingRelatedPhotos = $event"
      @photos-selected="onPhotosSelected"
      @search-type-changed="onSearchTypeChanged"
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
      :tools="availableTools"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

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
            <n-button @click="handleClearCanvas">
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
          <n-button @click="openConfig">
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

              <!-- Layout Pills -->
              <div
                class="config-item"
                :class="{ disabled: !toolbarState.expansion.enabled }"
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
                    :disabled="!toolbarState.expansion.enabled"
                    @click="toolbarState.photoOptions.spreadMode = layout"
                  >
                    {{ layout.charAt(0).toUpperCase() + layout.slice(1) }}
                  </n-button>
                </div>
              </div>

              <!-- Photo Count -->
              <div
                class="config-item"
                :class="{ disabled: !toolbarState.expansion.enabled }"
              >
                <span class="config-label">Photos</span>
                <n-input-number
                  v-model:value="toolbarState.photoOptions.count"
                  :min="1"
                  :max="5"
                  size="small"
                  style="width: 80px"
                  :disabled="!toolbarState.expansion.enabled"
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

        <!-- Download Button - Only show when photos are selected -->
        <n-button
          v-if="selectedPhotosCount > 0"
          type="primary"
          :loading="isDownloading"
          @click="handleDownloadSelectedPhotos"
        >
          <template #icon>
            <n-icon size="20">
              <CloudDownloadOutline />
            </n-icon>
          </template>
          <span v-if="selectedPhotosCount > 1"
            >({{ selectedPhotosCount }})</span
          >
        </n-button>

        <!-- Add to Collection Button - Only show when photos are selected -->
        <n-button
          v-if="selectedPhotosCount > 0"
          type="info"
          @click="handleAddToCollection"
        >
          <template #icon>
            <n-icon size="20">
              <AlbumsOutline />
            </n-icon>
          </template>
          <span v-if="selectedPhotosCount > 1"
            >({{ selectedPhotosCount }})</span
          >
        </n-button>

        <!-- Take Photos To Tool Button - Only show when photos are selected -->
        <n-button
          v-if="selectedPhotosCount > 0"
          type="info"
          @click="openToolSelector"
          :disabled="isProcessingTool"
        >
          <template #icon>
            <n-icon> <MagicWand /> </n-icon>
          </template>
          <span v-if="selectedPhotosCount > 1"
            >({{ selectedPhotosCount }})</span
          >
        </n-button>

        <n-button
          :disabled="isSaved"
          @click="handleSaveCanvas"
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

    <!-- Playground Logo - Top Right -->
    <div v-if="isPlayground" class="canvas-controls playground-logo">
      <div class="logo-container-playground">
        <!-- <img
          :src="logoName"
          alt="Photoreka"
          class="logo-brand-image-playground"
        /> -->
        <AppLogo :height="50" :showText="false" />
      </div>
    </div>

    <!-- Top Center Mode Switch -->
    <div
      v-if="!isPlayground && isExpansionEnabled"
      class="canvas-controls top-center"
    >
      <div class="btn-group-pill">
        <div class="expandable-button-group" ref="expandableGroupRef">
          <n-tooltip placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                :type="expansionMode === 'catalog' ? 'primary' : 'default'"
                @click="selectCatalogMode"
                class="mode-button left-button"
              >
                <template #icon>
                  <n-icon>
                    <FolderOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            Expand photos from your catalog
          </n-tooltip>

          <div
            class="expandable-container"
            :class="{ expanded: canvasModeIsExpanded }"
          >
            <n-tooltip placement="bottom" trigger="hover">
              <template #trigger>
                <n-button
                  :type="expansionMode === 'canvas' ? 'primary' : 'default'"
                  @click.stop="handleOnCanvasClick"
                  class="mode-button right-button"
                >
                  <template #icon>
                    <n-icon> <Workspace /></n-icon>
                  </template>
                  <span v-if="canvasModeIsExpanded" class="button-text">{{
                    expansionTypeOptions.find(
                      (opt) => opt.value == toolbarState.expansion.type
                    ).label
                  }}</span>
                  <n-icon v-if="canvasModeIsExpanded" class="dropdown-arrow">
                    <svg viewBox="0 0 24 24">
                      <path fill="currentColor" d="M7 10l5 5 5-5z" />
                    </svg>
                  </n-icon>
                </n-button>
              </template>
              Expand photos directly on canvas
            </n-tooltip>

            <div v-if="isDropdownOpen" class="dropdown-menu" @click.stop>
              <div
                v-for="option in filteredExpansionTypeOptions"
                :key="option.value"
                :class="[
                  'dropdown-item',
                  {
                    active: toolbarState.expansion.type === option.value,
                    disabled: option.disabled,
                  },
                ]"
                @click="!option.disabled && selectOption(option)"
              >
                <n-icon class="option-icon">
                  <component :is="option.icon" />
                </n-icon>
                <span>{{ option.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Left Controls -->
    <div class="canvas-controls bottom-left">
      <n-button-group vertical>
        <n-tooltip placement="right" trigger="hover">
          <template #trigger>
            <n-button @click="zoomTick(1)" size="small">
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"
                    />
                  </svg>
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
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3S3 5.91 3 9.5S5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                    />
                    <path fill="currentColor" d="M7 9h5v1H7z" />
                  </svg>
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
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M9 9H15V15H9V9M11 11V13H13V11H11M2 3H8V5H4V9H2V3M22 3V9H20V5H16V3H22M2 21V15H4V19H8V21H2M22 21H16V19H20V15H22V21Z"
                    />
                  </svg>
                </n-icon>
              </template>
            </n-button>
          </template>
          Fit view to photos
        </n-tooltip>

        <n-tooltip placement="right" trigger="hover">
          <template #trigger>
            <n-button
              :type="interactionMode === 'pan' ? 'primary' : 'default'"
              @click="toggleInteractionMode"
              size="small"
            >
              <template #icon>
                <n-icon v-if="interactionMode === 'pan'">
                  <HandLeftOutline />
                </n-icon>
                <n-icon v-else>
                  <SelectAllFilled />
                </n-icon>
              </template>
            </n-button>
          </template>
          <span v-if="interactionMode === 'pan'">
            Pan mode active - Click to switch to Select mode (S)
          </span>
          <span v-else>
            Select mode active - Draw rectangle to select photos, Ctrl+click for
            multi-select (S)
          </span>
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
    <div
      v-if="!isPlayground"
      @click="showTrashDialog = true"
      :class="['trash-zone', { hovering: isHoveringTrash }]"
    >
      🗑️
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
// import PhotoDetectionAreas from "@/components/canvas/PhotoControls/PhotoDetectionAreas.vue";
import {
  AlbumsOutline,
  ExpandOutline,
  FolderOutline,
  HandLeftOutline,
  ImageOutline,
  RefreshOutline,
  ReloadOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { usePhotosStore } from "@/stores/photos";
import {
  ref,
  onMounted,
  onUnmounted,
  computed,
  h,
  watch,
  watchEffect,
  nextTick,
  defineOptions,
} from "vue";
import { useRoute } from "vue-router";
import {
  NButton,
  NButtonGroup,
  NIcon,
  NSpace,
  NSwitch,
  NInputNumber,
  NTooltip,
} from "naive-ui";
import { storeToRefs } from "pinia";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import ExpandPhotoButtons from "@/components/canvas/PhotoControls/ExpandPhotoButtons.vue";
import PhotoCenterButton from "@/components/canvas/PhotoControls/PhotoCenterButton.vue";
import TagPillsCanvas from "@/components/canvas/TagPills/TagPillsCanvas.vue";
import RelatedPhotosToolbar from "@/components/canvas/RelatedPhotosToolbar.vue";
import PlaygroundUpgradeModal from "@/components/PlaygroundUpgradeModal.vue";
import PlaygroundPhotosDialog from "@/components/PlaygroundPhotosDialog.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { SaveOutline, CloudDownloadOutline } from "@vicons/ionicons5";
import { SelectAllFilled } from "@vicons/material";
import { MagicWand, Workspace } from "@vicons/carbon";
import logoName from "@/assets/logos/logo_name_sub_white_center.png";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { useCanvasPersistence } from "@/composables/useCanvasPersistence.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import AppLogo from "@/components/AppLogo.vue";

// Define component name for KeepAlive
defineOptions({
  name: "CanvasView",
});

const canvasStore = useCanvasStore();
const photosStore = usePhotosStore();
const route = useRoute();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const {
  hasUnsavedChanges,
  isSaved,
  saveCanvas,
  loadCanvas,
  clearSavedCanvas,
  hasSavedCanvas,
  initializeChangeDetection,
} = useCanvasPersistence();

// Photo tool selection (only Framer available from Canvas)
const canvasTools = [
  {
    id: "framer",
    name: "Framer",
    description: "Add frames and borders to photos",
    icon: "ImageFrame",
    route: "/framer",
  },
];

const {
  isProcessing: isProcessingTool,
  showToolSelector,
  availableTools,
  takeToTool,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection(canvasTools);

// Playground mode detection
const isPlayground = computed(() => route.meta?.playground === true);

// const photosStore = usePhotosStore();
const { photos } = storeToRefs(canvasStore);
const { basicMode } = storeToRefs(canvasStore);

// Refs
const stageRef = ref(null);
const canvasContainer = ref();
const expandableGroupRef = ref();
const relatedPhotosToolbarRef = ref();

const photoRefs = ref({});
const setPhotoRef = (id) => (el) => {
  if (el) photoRefs.value[id] = el;
};

const toolbarState = ref({
  mouseMode: "move",
  zoomLevel: 0,
  expansion: {
    type: "embedding",
    inverted: false,
    opposite: false,
    autoAlign: false,
    enabled: true, // New property to enable/disable expansion functionality
  },
  showDots: true, // toggle grid dots background
  photoOptions: {
    count: 3,
    spreadMode: "perpendicular",
  },
});

// State
const basicModeDismissed = ref(false);
const expansionMode = ref(isPlayground.value ? "canvas" : "catalog");
const interactionMode = ref("pan");
const showRelatedPhotos = ref(false);
const showPhotosDialog = ref(false);
const showTrashDialog = ref(false);
const showPhotoInfoDialog = ref(false);
const selectedPhotoForToolbar = ref(null);
const selectedDialogPhoto = ref(null);
const isLoadingRelatedPhotos = ref(false);

// Playground state
const showPlaygroundUpgradeModal = ref(false);

// Collection modal state
const showCollectionModal = ref(false);

// Expandable dropdown state
const canvasModeIsExpanded = ref(false);
const isDropdownOpen = ref(false);

// Config menu state
const showConfigMenu = ref(false);
const configMenuRef = ref(null);

// Dropdown options with SVG icons

const secondaryColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--secondary-color")
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
  handleSelectPhoto,
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

// Update expansionMode based on expansion enabled state
watch(
  () => toolbarState.value.expansion.enabled,
  (enabled) => {
    if (!enabled) {
      expansionMode.value = null;
      showRelatedPhotos.value = false;
    } else if (expansionMode.value === null) {
      expansionMode.value = "catalog";
    }
  }
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
    selectedPhotoForToolbar.value = event.photo;
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
      true
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
        toolbarState.value.photoOptions.spreadMode
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
  if (photo.selected) return secondaryColor;
  if (photo.isNew) return "#22d3ee";
  // if (photo.hovered) return primaryColor;
  return "gray";
};

const handleSaveCanvas = async () => {
  try {
    const success = saveCanvas();
    if (success) {
      // Mostrar feedback visual si es necesario
      console.log("Canvas saved successfully");
    } else {
      console.error("Failed to save canvas");
    }
  } catch (error) {
    console.error("Error saving canvas:", error);
  }
};

const handleClearCanvas = () => {
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

  // Limpiar el canvas guardado en localStorage
  clearSavedCanvas();

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

const fitStageToPhotos = (extraPaddingRatio = 0.1) => {
  // Delegate to store method
  canvasStore.fitStageToPhotos(extraPaddingRatio, TOOLBAR_WIDTH);
};

const openConfig = () => {
  showConfigMenu.value = !showConfigMenu.value;
};

const toggleInteractionMode = () => {
  interactionMode.value = interactionMode.value === "pan" ? "select" : "pan";
  // Update toolbarState.mouseMode to sync with the stage behavior
  toolbarState.value.mouseMode =
    interactionMode.value === "pan" ? "move" : "select";
};

// Mode selection functions
const selectCatalogMode = () => {
  if (!toolbarState.value.expansion.enabled) return;
  expansionMode.value = "catalog";
  canvasModeIsExpanded.value = false;
  isDropdownOpen.value = false;
};

const handleOnCanvasClick = () => {
  if (!toolbarState.value.expansion.enabled) return;
  if (expansionMode.value !== "canvas") {
    // First click: switch to catalog mode and expand button
    expansionMode.value = "canvas";
    canvasModeIsExpanded.value = true;
    isDropdownOpen.value = false;
    showRelatedPhotos.value = false;
  } else if (!isDropdownOpen.value) {
    // Second click: open dropdown (already in catalog mode and expanded)
    isDropdownOpen.value = true;
  } else {
    // Third click: close dropdown but keep expanded and in catalog mode
    isDropdownOpen.value = false;
  }
};

const selectOption = (option) => {
  toolbarState.value.expansion.type = option.value;
  isDropdownOpen.value = false;
};

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

const handleCollectionAdded = (data) => {
  // Clear selections after successfully adding to collection
  photos.value.forEach((photo) => {
    if (photo.selected) {
      photo.selected = false;
    }
  });
  showCollectionModal.value = false;
};

const handleCollectionModalCancel = () => {
  showCollectionModal.value = false;
};

const handleToolSelected = async (toolId) => {
  // Get selected photo IDs
  const selectedIds = photos.value
    .filter((photo) => photo.selected)
    .map((photo) => photo.id);

  // Clear selections
  const clearSelections = () => {
    photos.value.forEach((photo) => {
      if (photo.selected) {
        photo.selected = false;
      }
    });
  };

  // Use the composable function to take photos to tool
  await takeToTool(toolId, selectedIds, clearSelections);
  closeToolSelector();
};

const openPhotoInfo = (photo, event) => {
  event.cancelBubble = true;
  selectedDialogPhoto.value = photo;
  showPhotoInfoDialog.value = true;
};

// Resize handling
const handleResize = () => {
  if (stageRef.value && canvasContainer.value) {
    const stage = stageRef.value.getStage();
    const container = canvasContainer.value;
    stage.width(container.clientWidth);
    stage.height(container.clientHeight);
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
  const target = event.target;

  if (
    isDropdownOpen.value &&
    expandableGroupRef.value &&
    !expandableGroupRef.value.contains(target)
  ) {
    isDropdownOpen.value = false;
    // Keep the button expanded if in catalog mode
  }
};

const handleKeyDown = (event) => {
  // Check if user is typing in an input field
  const isTyping =
    ["INPUT", "TEXTAREA"].includes(event.target.tagName) ||
    event.target.contentEditable === "true" ||
    event.target.isContentEditable;

  // Delete selected photos ONLY when Delete (Supr) key is pressed
  // Backspace is reserved for text editing and should not delete photos
  if (event.key === "Delete" && !isTyping) {
    event.preventDefault();
    deleteSelectedPhotos();
  }

  // Toggle interaction mode with 'S' key
  if (event.key === "s" || event.key === "S") {
    // Only if not typing in an input field
    if (!isTyping) {
      event.preventDefault();
      toggleInteractionMode();
    }
  }

  // Zoom in with 'A' key
  if (event.key === "a" || event.key === "A") {
    // Only if not typing in an input field
    if (!isTyping) {
      event.preventDefault();
      zoomTick(1);
    }
  }

  // Zoom out with 'Z' key
  if (event.key === "z" || event.key === "Z") {
    // Only if not typing in an input field
    if (!isTyping) {
      event.preventDefault();
      zoomTick(-1);
    }
  }

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
  isDropdownOpen.value = false;
  showRelatedPhotos.value = false;
};

const handleStageClick = (event) => {
  // If clicking on empty space (not on a photo), deselect all photos
  // but only if we're not in select mode or if we're not doing rectangle selection
  if (
    event.target === event.target.getStage() &&
    (interactionMode.value !== "select" || !selectionRect.visible)
  ) {
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
        Math.pow(touch.clientY - event.target._stageTouchStartPos.y, 2)
    );

    // Consider it a tap if duration < 300ms and distance < 15px (more responsive for stage)
    if (touchDuration < 300 && touchDistance < 15) {
      // If touching empty space (not on a photo), perform same actions as click
      if (
        event.target === event.target.getStage() &&
        (interactionMode.value !== "select" || !selectionRect.visible)
      ) {
        resetCanvasState();
      }
    }

    // Clean up touch tracking
    delete event.target._stageTouchStartTime;
    delete event.target._stageTouchStartPos;
  }
};

const handlePhotoClick = (photo, event) => {
  // Always toggle hover state
  photo.hovered = !photo.hovered;

  // In select mode, handle photo selection
  if (interactionMode.value === "select") {
    const isCtrlOrCmd = event.evt.ctrlKey || event.evt.metaKey;

    if (isCtrlOrCmd) {
      // Multi-select: toggle this photo's selection
      photo.selected = !photo.selected;
    } else {
      // Single select: deselect all others and select this one
      photos.value.forEach((p) => {
        p.selected = p.id === photo.id;
      });
    }

    // Prevent stage click handler from running
    event.cancelBubble = true;
  } else {
    // In pan mode, handle selection with single click (avoiding drag conflicts)
    // Only select if this wasn't part of a drag operation
    if (!photo._wasDragged) {
      handleSelectPhoto(photo, event);
    }
    // Reset drag flag
    photo._wasDragged = false;
  }
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
        Math.pow(touch.clientY - photo._touchStartPos.y, 2)
    );

    // Consider it a tap if duration < 500ms and distance < 10px
    if (touchDuration < 500 && touchDistance < 10) {
      // Reset the drag flag since this was just a tap
      photo._potentiallyDragged = false;

      // Toggle hover state on tap
      photo.hovered = !photo.hovered;

      // Handle selection - single tap now selects in both modes
      if (interactionMode.value === "select") {
        photo.selected = !photo.selected;
      } else {
        // In pan mode, handle selection with tap (same as single click)
        handleSelectPhoto(photo, event);
      }
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

watch(
  () => photos.value.map((p) => p.src),
  () => {
    photos.value.forEach((photo) => {
      if (!photo.image || photo.image.src !== photo.src) {
        // Clear previous image if src changed
        if (photo.image && photo.image.src !== photo.src) {
          photo.image.onload = null;
          photo.image.onerror = null;
          photo.image = null;
          photo.imageBroken = false;
        }

        const img = new Image();

        // Handle image load errors to prevent broken state
        img.onerror = () => {
          console.warn(`Failed to load image: ${photo.src}`);
          // Set a flag to indicate this image is broken
          photo.imageBroken = true;
          // Clear the image reference to prevent drawing attempts
          photo.image = null;
          // Force a re-render
          const stage = stageRef.value?.getStage();
          if (stage) {
            stage.batchDraw();
          }
        };

        img.onload = () => {
          // Reset broken flag when image loads successfully
          photo.imageBroken = false;
          // Ensure the photo object still references this image
          if (photo.image === img) {
            // Force a re-render by updating the stage
            const stage = stageRef.value?.getStage();
            if (stage) {
              stage.batchDraw();
            }
          }
        };

        img.src = photo.src;
        photo.image = img;
      } else if (photo.image && !photo.imageBroken) {
        // Check if existing image is still valid by testing if it's complete and not broken
        // This handles cases where the image was deleted from the server after being loaded
        if (photo.image.complete && photo.image.naturalWidth === 0) {
          console.warn(`Image became invalid: ${photo.src}`);
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
  },
  { immediate: true }
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

// Keep interactionMode and toolbarState.mouseMode in sync
watch(
  interactionMode,
  (newMode) => {
    toolbarState.value.mouseMode = newMode === "pan" ? "move" : "select";

    // Update stage cursor based on interaction mode
    if (stageRef.value) {
      const stage = stageRef.value.getStage();
      if (stage && stage.container()) {
        stage.container().style.cursor =
          newMode === "select" ? "crosshair" : "default";
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  window.addEventListener("resize", handleResize);
  document.addEventListener("click", handleClickOutside);
  document.addEventListener("keydown", handleKeyDown);
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
        relatedPhotosToolbarRef.value.removePhotoFromList
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
      console.log("Canvas loaded from localStorage");
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

  // Auto-open photos dialog in playground mode
  if (isPlayground.value) {
    showPhotosDialog.value = true;
  }

  // Start periodic image validation check (every 5 seconds)
  imageValidationInterval = setInterval(checkImageValidity, 5000);

  // Auto-save canvas every 10 seconds
  const autoSaveInterval = setInterval(() => {
    handleSaveCanvas();
  }, 10000);
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
  height: calc(100vh); /* Subtract header height */
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
  padding: 5px;
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
  width: 125px; /* Expanded width to fit text and dropdown arrow */
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
  font-size: 14px;
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
  border-radius: 12px;
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
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
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
  border-radius: 12px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  margin-top: 8px;
  min-width: 280px;
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
    width: 120px; /* Slightly smaller on tablets */
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
    width: 100px; /* Even smaller on mobile */
  }

  .button-text {
    font-size: 12px;
  }
}
.trash-zone {
  position: absolute;
  width: 100px;
  height: 100px;
  bottom: 0px;
  display: flex;
  right: 1px;
  /* background-color: rgba(255, 0, 0, 0.1); */
  /* border: 1px solid rgba(250, 11, 11, 0.5); */
  border-radius: 8px;
  font-size: 40px;
  text-align: center;
  align-items: center;
  line-height: 90px;

  transition: background-color 0.2s, border-color 0.2s, transform 0.2s ease;
  transform: rotate(0deg) scale(1);
  align-content: center;
  justify-content: center;
  cursor: pointer;
}

.trash-zone.hovering {
  background-color: rgba(255, 0, 0, 0.25);
  border-color: darkred;
  transform: rotate(8deg) scale(1.08);
  transition: transform 0.2s ease, background-color 0.2s ease,
    border-color 0.2s ease;
}

.canvas-container {
  background-color: black !important;
}

.canvas-container.show-dots {
  background-color: black !important;
  background-image: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.11) 1.2px,
    transparent 1.2px
  );
  background-size: 45px 45px;
}
</style>
