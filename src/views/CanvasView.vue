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
    <!-- Everything that belongs to the board itself. A wrapper rather than the container
         directly, because every overlay below is absolutely positioned and would
         otherwise resolve against the container — putting the top-right controls and the
         trash zone underneath the chat panel. -->
    <div class="canvas-main">
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
          @mousedown="onStagePointerDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @click="handleStageClick"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
        >
          <!-- Chat vision halo, FILLED variant, in its own layer BENEATH the photos so its
               soft glow sits under them instead of tinting them. A separate layer (rather
               than an early node in the photo layer) because the photos reorder themselves
               by zIndex, which would otherwise drag the halo back above some of them. It
               inherits the stage's pan/zoom like every layer, so world coordinates hold. -->
          <v-layer :config="{ listening: false }">
            <v-group
              v-if="showVisionHalo && HALO_STYLE === 'filled'"
              :config="{
                x: vision.circle.value.x,
                y: vision.circle.value.y,
                listening: false,
              }"
            >
              <!-- Outer ring: an unfilled circle in the secondary colour, wide enough to
                   enclose every photo, for "the whole board the chat is aware of". Unfilled
                   so it never competes with the focus glow at the centre (a filled second
                   layer read as a hole around it). Concentric with the focus halo (same
                   group centre), so it is placed at the group's local origin. Stroke and
                   dash scale with the radius so the ring looks the same at any size or zoom.
                   Turned off entirely by OUTER_HALO_ENABLED in useCanvasVisionRadius. -->
              <v-circle
                v-if="vision.outerCircle.value"
                :config="{
                  radius: vision.outerCircle.value.radius,
                  stroke: outerHaloStroke,
                  strokeWidth: Math.max(
                    vision.outerCircle.value.radius * 0.004,
                    2,
                  ),
                  dash: [
                    vision.outerCircle.value.radius * 0.04,
                    vision.outerCircle.value.radius * 0.028,
                  ],
                  // Truly unfilled. fillEnabled:false suppresses the fill, and the null
                  // gradient stops clear any stale radial-gradient left on the node from an
                  // earlier filled version — vue-konva merges attrs and never removes them.
                  fillEnabled: false,
                  fillRadialGradientColorStops: null,
                  fill: null,
                  listening: false,
                }"
              />
              <!-- A halo, not a ring: concentric bands fading outwards, so it reads as a
                   soft region of attention rather than as a boundary something is inside
                   or outside of. Konva has no radial gradient on a Circle without a
                   fillRadialGradient, which is what this is. -->
              <v-circle
                :config="{
                  radius: vision.circle.value.radius,
                  fillRadialGradientStartPoint: { x: 0, y: 0 },
                  fillRadialGradientStartRadius:
                    vision.circle.value.radius * 0.55,
                  fillRadialGradientEndPoint: { x: 0, y: 0 },
                  fillRadialGradientEndRadius: vision.circle.value.radius,
                  fillRadialGradientColorStops: [
                    0,
                    haloColorStops.inner,
                    0.7,
                    haloColorStops.mid,
                    1,
                    haloColorStops.outer,
                  ],
                  listening: false,
                }"
              />
            </v-group>
          </v-layer>

          <v-layer>
            <!-- Rectángulo de selección -->
            <v-rect
              v-if="selectionRect.visible"
              :config="{
                x: selectionRect.x,
                y: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
                stroke: primaryColor,
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
                opacity: getPhotoOpacity(photo),
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
                    // Both selections carry the same weight — neither is a lesser
                    // state, they are two different things — so colour alone separates
                    // them. See getPhotoStrokeColor.
                    strokeWidth:
                      photo.selected ||
                      photo.checked ||
                      haloHighlightIds.has(photo.id) ||
                      isHoverHighlighted(photo) ||
                      isPhotoAttached(photo)
                        ? 7
                        : photo.isNew
                          ? 4
                          : 2.5,
                    // Selected, but past the cap on what the chat can be shown. Halved
                    // rather than hidden: it IS selected, it just did not make the cut,
                    // and that is what the panel's '12 of 20' is pointing at.
                    strokeOpacity: focusOverflowIds.has(photo.id) ? 0.35 : 1,
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

                <!-- Zoomed-out selection reinforcement: a translucent accent wash over the
                     whole photo, in the same colour as its selection border. Only when the
                     board is far enough out that the border alone is too thin to notice. -->
                <v-rect
                  v-if="
                    !photo.imageBroken &&
                    photo.image &&
                    vision.selectionFillActive.value &&
                    (isFocusHighlighted(photo) || isHoverHighlighted(photo))
                  "
                  :config="{
                    x: 0,
                    y: 0,
                    width: photo.config.width,
                    height: photo.config.height,
                    fill: getPhotoStrokeColor(photo),
                    opacity: focusOverflowIds.has(photo.id) ? 0.25 : 0.45,
                    listening: false,
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
                      !showChatAttachControls &&
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
                      !showChatAttachControls &&
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

                  <!-- Selection circle (top-left). Marks photos for the action bar —
                       download, collection, tool — and nothing else. The plain click on
                       the photo drives the board's own selection (move, expand) — and,
                       while the chat is open, the spotlight instead. Stays visible while
                       checked so the marked set is legible without hovering every photo.
                       Gone entirely while the chat is open: there the click is the
                       spotlight, and a second per-photo pick would only muddy which of the
                       chat's levels a mark belongs to. -->
                  <PhotoSelectionCircle
                    v-if="
                      !showChatAttachControls &&
                      !photo.imageBroken &&
                      !photo.inTrash &&
                      (photo.hovered || photo.checked)
                    "
                    :photo="photo"
                    :checked="!!photo.checked"
                    :fill="accentColor"
                    :sizeFactor="1.3"
                    @toggle="handleToggleChecked"
                  />

                  <!-- Botón de info (esquina superior derecha) -->
                  <PhotoInfoButton
                    v-if="!photo.imageBroken && photo.hovered && !photo.inTrash"
                    :photo="photo"
                    :photo-width="photo.config.width"
                    :fill="accentColor"
                    :sizeFactor="1.3"
                    @click="handleInfoButtonClick"
                  />

                  <!-- No centre button while the chat is open. The '+' blocks above are
                       gated off (!showChatAttachControls) so nothing sits under the pointer,
                       and a plain click on the photo spotlights it — the message's SUBJECT,
                       the finest of the chat's three levels: the board · the focus · the
                       spotlight. The persistent purple border marks the state; see
                       handlePhotoClick. -->
                </template>
              </v-group>
            </v-group>

            <!-- Chat vision halo, OUTLINE variant only. Kept last in this top layer so the
                 ring draws over the photos — a boundary line has to sit on top to be seen.
                 The FILLED variant lives in a layer beneath the photos instead (see the
                 bottom layer above), so its tint never shades them.

                 Never listening: it is fixed to the viewport centre and a hit-tested shape
                 would swallow clicks, drags and hovers meant for the photos.

                 Hidden while the user has photos selected: then THEY are what the chat
                 looks at, and two competing indications of "these photos" is exactly the
                 ambiguity this replaced. -->
            <v-group
              v-if="showVisionHalo && HALO_STYLE === 'outline'"
              :config="{
                x: vision.circle.value.x,
                y: vision.circle.value.y,
                listening: false,
              }"
            >
              <!-- Just the boundary, dashed and unfilled, so the photos underneath keep
                   their true colour. Stroke and dash scale with the radius so the ring
                   looks the same at any halo size or zoom. -->
              <v-circle
                :config="{
                  radius: vision.circle.value.radius,
                  stroke: primaryColor,
                  strokeWidth: Math.max(vision.circle.value.radius * 0.006, 2),
                  dash: [
                    vision.circle.value.radius * 0.05,
                    vision.circle.value.radius * 0.035,
                  ],
                  fillEnabled: false,
                  listening: false,
                }"
              />
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
        @highlight-photo="hoverHighlightId = $event"
        @locate-photo="centerViewOnPhoto($event)"
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
        @add-to-portfolio="handleCollectionAdded"
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
            @reset-canvas="showResetCanvasModal = true"
          />

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

          <n-tooltip
            v-if="hasUnsavedChanges"
            placement="bottom"
            trigger="hover"
          >
            <template #trigger>
              <n-button
                secondary
                type="primary"
                :loading="isSaving"
                @click="handleSaveCanvas"
              >
                <template #icon>
                  <n-icon size="20">
                    <SaveOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            Save changes
          </n-tooltip>
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

          <n-button secondary type="primary" @click="showPhotosDialog = true">
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

          <!-- Chat. Only when the panel is closed: once it is open its own header
               carries the control to hide it again. -->
          <n-tooltip v-if="!isChatPanelOpen" placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                secondary
                type="primary"
                @click="setChatPanelOpen(true)"
              >
                <template #icon>
                  <n-icon><RobotOutlined /></n-icon>
                </template>
              </n-button>
            </template>
            Chat about this canvas
          </n-tooltip>
        </n-space>
      </div>

      <!-- Floating Action Bar -->
      <FloatingActionBar
        :top-position="70"
        :selected-ids="selectedPhotoIds"
        :show-add-to-collection="true"
        :show-move-to-tool="true"
        :show-send-to-chat="true"
        :is-downloading="isDownloading"
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

    <!-- Chat docked to this board. Not in the playground, which has no saved canvas to
         attach a conversation to. -->
    <CanvasChatPanel
      v-if="isChatPanelOpen && !isPlayground"
      ref="chatPanelRef"
      :canvas-id="activeCanvasId"
      :width="chatPanelWidth"
      :board-photo-ids="boardPhotoIds"
      :discarded-photo-ids="discardedPhotoIds"
      :focus-photo-ids="chatFocusIds"
      :focused-photos="chatFocus.photos"
      :covered-count="chatFocus.total"
      :focus-source="chatFocus.source"
      :max-focused="MAX_FOCUSED_PHOTOS"
      :vision-enabled="vision.enabled.value"
      @close="setChatPanelOpen(false)"
      @toggle-vision="vision.toggle"
      @clear-focus="clearBoardSelection"
      @resize="setChatPanelWidth"
      @highlight-photo="hoverHighlightId = $event"
      @locate-photo="centerViewOnPhoto($event)"
      @attached-photos-change="setChatAttachedIds"
    />
  </div>
</template>

<script setup>
import { isDemoEmail } from "@/config/demoUsers";
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
  TrashOutline,
  AddOutline,
  RemoveOutline,
  ChatbubblesOutline,
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
import PhotoSelectionCircle from "@/components/canvas/PhotoControls/PhotoSelectionCircle.vue";
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
import CanvasChatPanel from "@/components/canvas/CanvasChatPanel.vue";
import {
  useCanvasVisionRadius,
  sortPhotosInReadingOrder,
  HALO_FADED_OPACITY,
} from "@/composables/canvas/useCanvasVisionRadius.js";
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
const isDemoUser = computed(() => isDemoEmail(userStore.user?.email));
const route = useRoute();
const router = useRouter();
const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const {
  hasUnsavedChanges,
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
    scope: "catalog",
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

/**
 * The focus level's border colour — the photos the chat looks at, whether picked on the
 * board or covered by the halo.
 *
 * Primary blue, deliberately NOT the accent: colour is the only thing telling the levels
 * apart now — blue for the focus, purple for the board, accent (cyan) for the spotlight.
 *
 * Read the same way as the accent, once at setup. A live theme switch leaves both stale
 * until the view remounts; that is how `accentColor` has always behaved here.
 */
const primaryColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--primary-color")
  .trim();

/**
 * The secondary (purple) colour — the board level's hue: the outer ring drawn around the
 * whole canvas. Read once at setup like the accent and primary above.
 */
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
  centerViewOnPhoto,
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

// ── Chat docked to this board ───────────────────────────────────────────────

const CHAT_PANEL_OPEN_KEY = "photoreka:canvas:chat-open";
const CHAT_PANEL_WIDTH_KEY = "photoreka:canvas:chat-width";
const DEFAULT_CHAT_PANEL_WIDTH = 460;

// Per browser, not per canvas: someone who works with the chat open works with it open on
// every board, and re-opening it on each one would be busywork.
const isChatPanelOpen = ref(localStorage.getItem(CHAT_PANEL_OPEN_KEY) === "1");
const chatPanelWidth = ref(
  Number(localStorage.getItem(CHAT_PANEL_WIDTH_KEY)) ||
    DEFAULT_CHAT_PANEL_WIDTH,
);

const setChatPanelOpen = (open) => {
  isChatPanelOpen.value = open;
  localStorage.setItem(CHAT_PANEL_OPEN_KEY, open ? "1" : "0");
};

const setChatPanelWidth = (width) => {
  chatPanelWidth.value = width;
  localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(width));
};

// ── Handing board photos to the chat ────────────────────────────────────────

const chatPanelRef = ref(null);

/**
 * Whether the chat's interaction mode is active. While the chat is open the photo's centre
 * '+' buttons are suppressed and a plain click spotlights the photo instead of adding it to
 * the board selection. Only in a saved canvas — never in the playground, which has no chat.
 */
const showChatAttachControls = computed(
  () => isChatPanelOpen.value && !isPlayground.value,
);

/**
 * A board photo as the chat's composer expects it: the photosStore shape, which the canvas
 * photo still carries underneath (see `createPhoto` in the store), minus the Konva config
 * and the loaded image — neither belongs in a message.
 */
const toChatPhoto = ({ config, image, tags, ...photo }) => ({
  ...photo,
  thumbnailUrl: photo.thumbnailUrl || photo.src,
});

/** Board photos → the composer's attachments, through the panel's queue. */
const attachPhotosToChat = (canvasPhotos) => {
  chatPanelRef.value?.attachPhotos(canvasPhotos.map(toChatPhoto));
};

/** Drop a board photo from the composer — the remove half of the spotlight toggle. */
const detachPhotoFromChat = (photo) => {
  chatPanelRef.value?.detachPhotos([photo.id]);
};

// A click (or tap) spotlights a photo while the chat is open: already spotlighted → dropped,
// otherwise added.
const togglePhotoSpotlight = (photo) => {
  if (isPhotoAttached(photo)) detachPhotoFromChat(photo);
  else attachPhotosToChat([photo]);
};

/**
 * Drop the whole spotlight — detach every photo currently attached to the composer. Used
 * by the same empty-space click that clears the board selection, so both kinds of pick let
 * go together. Routed through the panel's detach queue so the composer's chips clear too;
 * the board's own `chatAttachedIdSet` then follows the `attached-photos-change` echo.
 */
const clearChatSpotlight = () => {
  const ids = [...chatAttachedIdSet.value];
  if (ids.length) chatPanelRef.value?.detachPhotos(ids);
};

/**
 * Ids of the photos currently spotlighted in the chat, relayed up by the panel (which reads
 * them from ChatView's composer). A board photo in this set wears a persistent purple border
 * whether or not it is hovered. Stringified to match the composer's id shape.
 */
const chatAttachedIdSet = ref(new Set());
const setChatAttachedIds = (ids) => {
  chatAttachedIdSet.value = new Set(ids.map(String));
};
const isPhotoAttached = (photo) =>
  chatAttachedIdSet.value.has(String(photo.id));

/**
 * The photos actually placed on the board.
 *
 * Two jobs downstream, and they need the same set: the agent never proposes a photo that
 * is already out, and everything that DESCRIBES the board — the `canvas` search scope, the
 * profile `canvas_overview` builds — is computed over exactly this.
 */
const boardPhotoIds = computed(() =>
  photos.value.map((photo) => Number(photo.id)).filter(Number.isFinite),
);

/**
 * Photos the user threw in the trash zone. Sent separately, not folded into the board.
 *
 * They still have to be excluded from what the chat proposes — handing back the photo the
 * user just discarded is the most obviously wrong thing it could do — and the server does
 * exclude them. But they are no longer part of what the board IS, and a profile that
 * averaged in rejected work would describe a set that exists nowhere. One list per
 * question, instead of one list answering the wrong one.
 */
const discardedPhotoIds = computed(() =>
  canvasStore.discardedPhotos
    .map((photo) => Number(photo.id))
    .filter(Number.isFinite),
);

/**
 * A spotlighted photo thrown in the trash (or otherwise removed from the board) must stop
 * being the chat's subject too. The composer keeps its own attachment list, decoupled from
 * the board, so it will not drop the photo on its own — the focus and board context both
 * read `photos` and self-heal, but the spotlight does not. Detach any attached id that is
 * no longer on the board.
 */
watch(boardPhotoIds, (ids) => {
  if (!chatAttachedIdSet.value.size) return;
  const onBoard = new Set(ids.map(String));
  const orphaned = [...chatAttachedIdSet.value].filter(
    (id) => !onBoard.has(id),
  );
  if (orphaned.length) chatPanelRef.value?.detachPhotos(orphaned);
});

/**
 * The chat's vision radius. Lives here rather than in the panel because it is drawn on
 * the stage and reads the same photos and viewport the board does; the panel only
 * displays its count and forwards the ids.
 */
/**
 * The stage as it actually is, assembled from the three places that hold it.
 *
 * `stageConfig` is only half a source of truth: pan and zoom are applied to the Konva
 * stage imperatively and synced back into `stageOffset` and `toolbarState.zoomLevel`,
 * never into `stageConfig.scale`. Reading the config alone would leave the radius sitting
 * at scale 1 over a board at any other zoom.
 */
const stageViewport = computed(() => ({
  width: stageConfig.width,
  height: stageConfig.height,
  x: stageOffset.x,
  y: stageOffset.y,
  scale: toolbarState.value.zoomLevel || 1,
}));

// Mirror the live viewport into the store so the "viewport" search scope can react to pans
// and zooms (see getViewportPhotos). A fresh object each time, so watchers fire on any move.
watch(
  stageViewport,
  (v) => {
    canvasStore.viewport = { ...v };
  },
  { immediate: true },
);

/**
 * How many hand-picked photos the chat looks at.
 *
 * A cap on the REPORT, never on the gesture: the board selection also moves photos in
 * bulk, and refusing the thirteenth click would break the canvas's primary interaction to
 * protect a secondary one. So the user can select as many as they like, the chat sees the
 * first twelve in reading order, and the panel says so.
 *
 * Not a mirror of the server's `CANVAS_VIEW_MAX_PHOTOS`, which is a ceiling against an
 * untrusted client and sits well above this. This one is the product rule.
 */
const MAX_FOCUSED_PHOTOS = 12;

// The halo is capped to the same number so what it covers never exceeds what the chat is
// shown — see the radius cap in useCanvasVisionRadius.
const vision = useCanvasVisionRadius(photos, stageViewport, MAX_FOCUSED_PHOTOS);

/**
 * How the vision halo is drawn:
 *  - "filled": the soft radial-gradient region — a glow that reads as "roughly here".
 *  - "outline": a dashed ring with no fill, so it never tints the photos it sits over.
 * Flip this constant to switch; nothing else depends on the choice.
 */
const HALO_STYLE = "filled";

/**
 * The halo's fill: opaque-ish at the centre, gone at the rim.
 *
 * Konva paints on a canvas, where CSS custom properties never resolve, so the primary has
 * to arrive as a literal colour, so the alpha rides in an 8-digit hex.
 */
const haloColorStops = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(primaryColor);
  const alpha = (hex) => (isHex ? `${primaryColor}${hex}` : primaryColor);
  return {
    inner: alpha("1f"),
    mid: alpha("12"),
    outer: alpha("00"),
  };
})();

/**
 * The outer ring's stroke, in the theme's secondary colour, so the two layers read as
 * different things — a filled blue glow for "the photos I look at closely" (the focus), a
 * wider unfilled purple ring for "the whole board I'm aware of". Purple is the board's
 * colour now; the focus wears the primary and the spotlight the accent. Kept translucent
 * so it stays ambient rather than reading as a hard container edge.
 */
const outerHaloStroke = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(secondaryColor);
  return isHex ? `${secondaryColor}73` : secondaryColor;
})();

/**
 * Photos the user picked by hand, in the board's reading order.
 *
 * `photo.selected` is the board's own selection — set by clicking a photo or dragging a
 * rectangle around a group — and it already means "these ones" for moving and expanding.
 * Pointing the chat at the same set is the third reading of the same gesture, not a
 * fourth one to learn.
 */
const focusedPhotos = computed(() =>
  sortPhotosInReadingOrder(photos.value.filter((photo) => photo.selected)),
);

/** A hand-picked set overrides the halo entirely — see the template. */
const hasManualFocus = computed(() => focusedPhotos.value.length > 0);

/**
 * False while a fit is animating the board under the halo, true once it settles.
 *
 * The halo is centred on the viewport, so opening the chat (which resizes the stage and then
 * tweens a fit) would drag the halo across the board in two visible jumps — once when the
 * panel narrows the stage, once when the fit tween lands. Holding the halo hidden until the
 * fit finishes lets it simply appear, already in place. See `centerBoardForChat` and the
 * store's `onFitComplete`.
 */
const haloReady = ref(true);

const showVisionHalo = computed(
  () =>
    isChatPanelOpen.value &&
    !isPlayground.value &&
    vision.enabled.value &&
    !hasManualFocus.value &&
    haloReady.value,
);

/**
 * Photos the halo actually feeds the chat, drawn as if the user had picked them by hand.
 *
 * The halo's soft gradient says "roughly here", but a photo sitting under its faint rim
 * reads as ambiguous — in or out? Borrowing the board's own selection border removes the
 * guess: same blue, same weight as a click. It stays a VISUAL echo only — `photo.selected`
 * is untouched, so the halo/selection distinction that drives `chatFocus` still holds.
 *
 * Follows `chatFocus.photos` — the twelve the chat is actually shown — not everything under
 * the ring. The radius already caps itself so the two normally coincide, but this keeps the
 * highlight honest even if the radius is ever widened past the cap in code.
 * Empty unless the halo is actually on screen.
 */
const haloHighlightIds = computed(() =>
  showVisionHalo.value
    ? new Set(chatFocus.value.photos.map((photo) => photo.id))
    : new Set(),
);

/** True when a photo wears the board's selection look — a real pick, a corner-circle mark,
 *  the chat's halo, or attached to the chat. These are the ones a zoomed-out fill overlay
 *  reinforces, each in its own colour (see getPhotoStrokeColor). */
const isFocusHighlighted = (photo) =>
  photo.selected ||
  photo.checked ||
  haloHighlightIds.value.has(photo.id) ||
  isPhotoAttached(photo);

/**
 * Id de la foto del canvas que el usuario está señalando desde el strip de
 * resultados en modo scope="canvas". Las fotos ya están en el lienzo, así que
 * en vez de arrastrarlas se resalta la que hay debajo del ratón — mismo efecto
 * que el halo filled (borde cuando está cerca, capa superpuesta cuando está
 * lejos), pero en accent en lugar de primary.
 */
const hoverHighlightId = ref(null);

const isHoverHighlighted = (photo) =>
  hoverHighlightId.value != null &&
  Number(photo.id) === Number(hoverHighlightId.value);

/**
 * What the chat actually sees: the hand-picked photos when there are any, the halo's
 * otherwise.
 *
 * `total` is what the focus holds and `photos` is what fits under the cap — the panel
 * shows both, so a truncation is never silent. `photos` carries the objects rather than
 * ids because the context panel renders their thumbnails: the same list, one source.
 */
const chatFocus = computed(() => {
  const source = hasManualFocus.value ? "selection" : "halo";
  const all = hasManualFocus.value
    ? focusedPhotos.value
    : vision.visiblePhotos.value;

  return {
    source,
    total: all.length,
    photos: all.slice(0, MAX_FOCUSED_PHOTOS),
  };
});

const chatFocusIds = computed(() =>
  chatFocus.value.photos
    .map((photo) => Number(photo.id))
    .filter(Number.isFinite),
);

/**
 * Ids beyond the cap. Drawn dimmer on the board so "12 of 20" has a visible answer
 * instead of leaving the user to guess which twelve made it.
 */
const focusOverflowIds = computed(() => {
  if (chatFocus.value.source !== "selection") return new Set();
  return new Set(
    focusedPhotos.value.slice(MAX_FOCUSED_PHOTOS).map((photo) => photo.id),
  );
});

/**
 * Put the board under the radius when the chat opens.
 *
 * The radius follows the middle of the viewport, so "centre it on the photos" is really
 * "centre the photos in the viewport" — which is what the fit already does. Opening the
 * chat over whatever corner the user had panned to would otherwise hand the chat an empty
 * halo, which is the least useful state it has.
 *
 * The fit has to run AFTER the stage has taken its new width: the panel appearing is what
 * narrows it, and fitting against the old width centres the photos behind the panel. The
 * explicit handleResize is that guarantee — the ResizeObserver would get there too, but
 * on its own schedule.
 *
 * The halo is hidden for the duration and revealed once the fit settles, so it appears in
 * its final spot instead of jumping across the board as the viewport moves.
 */
/** Safety timer that re-reveals the halo if a fit bails without tweening — see below. */
let haloRevealFallback = null;

const revealHalo = () => {
  clearTimeout(haloRevealFallback);
  haloRevealFallback = null;
  haloReady.value = true;
};

const centerBoardForChat = () => {
  if (photos.value.length === 0) return;
  // Hide the halo across the resize + fit tween so it appears already in place rather than
  // jumping to follow the moving viewport. `onFitComplete` reveals it when the tween lands;
  // the fallback only covers the rare paths where the fit bails without tweening (no
  // stageRef, zero-sized stage), so the halo can never get stuck hidden.
  haloReady.value = false;
  clearTimeout(haloRevealFallback);
  haloRevealFallback = setTimeout(revealHalo, 800);
  nextTick(() => {
    handleResize();
    fitStageToPhotos();
  });
};

watch(isChatPanelOpen, (open) => {
  if (open) {
    // The corner-circle marks belong to the closed-chat mode: their control is hidden while
    // the chat is open (see the template), so drop any that were standing when it opened —
    // otherwise they would stay lit and keep the action bar up with no way to clear them.
    clearCanvasSelections();
    centerBoardForChat();
  } else {
    // A spotlight is a thing you point AT the chat; with the chat gone it means nothing.
    // ChatView unmounts with the panel, so the detach queue has nothing to drain — clear
    // the board's own set directly, which is what paints the spotlight border.
    chatAttachedIdSet.value = new Set();
  }
});

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

/**
 * Photos MARKED with the top-left circle, for the actions that take them off the board:
 * download, add to a collection, send to a tool or to ChatLab.
 *
 * A different flag from `photo.selected`, which is the board's own selection — clicking a
 * photo moves it, expands from it and points the chat at it. One flag was doing both jobs,
 * so every plain click threw up the action bar and every bulk move looked like the start
 * of an export.
 */
const checkedPhotos = computed(() =>
  photos.value.filter((photo) => photo.checked),
);

const selectedPhotosCount = computed(() => checkedPhotos.value.length);

const selectedPhotoIds = computed(() =>
  checkedPhotos.value.map((photo) => photo.id),
);

// Get selected photo positions for ordering in series (canvas only)
// Keys are stringified IDs for consistent lookup
const selectedPhotoPositions = computed(() => {
  const positions = {};
  checkedPhotos.value.forEach((photo) => {
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
  if (!collection || !collection.photoIds) return [];

  return collection.photoIds;
});

// Filter context to pass to expansion components
const filterContext = computed(() => ({
  collectionId: selectedCollectionFilter.value,
  photoIds: collectionPhotoIds.value,
}));

// Event handlers

/**
 * A photo was dropped on the board.
 *
 * The drop handler is source-agnostic — it reads an array of photos off the dataTransfer
 * and nothing else — so it serves the related-photos toolbar and the chat panel alike.
 * What differs is the aftermath: the toolbar is a shelf of candidates and a photo taken
 * from it should leave, while the chat is a transcript and a photo dropped from a reply
 * must stay where it was said. Hence the no-op when the toolbar is not mounted, which is
 * also what stops a chat drop from throwing on a missing ref.
 */
function handlePhotoDropAndRemove(event) {
  const removeFromToolbar =
    relatedPhotosToolbarRef.value?.removePhotoFromList ?? (() => {});
  handlePhotoDrop(event, removeFromToolbar);
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

/**
 * Soft fade on the photos the halo does NOT cover, so the covered ones read at full strength
 * against them. Only bites while the halo is on screen AND the board is zoomed in past the
 * overlay/border threshold: zoomed further out the covered photos already wear the overlay
 * wash, so the fade would be redundant. See HALO_FADED_OPACITY / selectionFillActive.
 */
const getPhotoOpacity = (photo) => {
  const base = photo.imageBroken ? 0.6 : (photo.config.opacity ?? 1);
  if (
    showVisionHalo.value &&
    !vision.selectionFillActive.value &&
    !haloHighlightIds.value.has(photo.id)
  ) {
    return base * HALO_FADED_OPACITY;
  }
  return base;
};

const getPhotoStrokeColor = (photo) => {
  if (photo.imageBroken)
    return photo.selected
      ? "rgba(255, 165, 0, 0.8)"
      : "rgba(128, 128, 128, 0.4)";
  if (photo.inTrash) return "rgba(250, 11, 11, 0.5)";
  // Señalada desde el strip (scope=canvas): accent, por encima de cualquier
  // otro estado para que quede claro cuál es la foto localizada.
  if (isHoverHighlighted(photo)) return accentColor;
  // Accent: attached to the chat — the message's SUBJECT, the finest level. Above the board
  // selection so a photo that is both reads as attached, matching the context panel, which
  // shows a photo in both roles under "attached".
  if (isPhotoAttached(photo)) return accentColor;
  // Blue: picked on the board — moved, expanded from, and what the chat looks at.
  if (photo.selected) return primaryColor;
  // Cyan: marked with the corner circle, for the actions that take photos off the board.
  // The same colour as the circle itself, so the border reads as that circle's doing.
  // Kept ahead of the halo so a deliberate mark isn't recoloured by an ambient one.
  if (photo.checked) return accentColor;
  // Same blue as a real selection for photos the halo covers: the chat looks at them too,
  // so they wear the selection's border even though they were never clicked. Visual only —
  // see haloHighlightIds.
  if (haloHighlightIds.value.has(photo.id)) return primaryColor;
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
  hoverHighlightId.value = null;
};

watch(
  () => toolbarState.value.expansion.scope,
  () => {
    hoverHighlightId.value = null;
  },
);

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

/** Clears the action-bar marks. The board's own selection is untouched. */
const clearCanvasSelections = () => {
  photos.value.forEach((photo) => {
    if (photo.checked) {
      photo.checked = false;
    }
  });
};

const handleToggleChecked = ({ photo }) => {
  photo.checked = !photo.checked;
};

/** Drops the board selection, handing the chat back to the halo. */
const clearBoardSelection = () => {
  photos.value.forEach((photo) => {
    if (photo.selected) photo.selected = false;
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
//
// Watched on the container, not only on the window: opening, closing or dragging the chat
// panel changes the stage's width without the window ever resizing, and a stage left at
// the old width draws the board under the panel.
let stageResizeObserver = null;

const observeStageSize = () => {
  if (stageResizeObserver || !canvasContainer.value) return;
  stageResizeObserver = new ResizeObserver(() => handleResize());
  stageResizeObserver.observe(canvasContainer.value);
};

const unobserveStageSize = () => {
  stageResizeObserver?.disconnect();
  stageResizeObserver = null;
};

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
      // Written back, not just applied: `stageConfig` is what anything reading the
      // viewport reactively sees (the chat's vision radius, for one), and leaving it at
      // the window's size puts the circle's centre wherever the panel is not.
      stageConfig.width = w;
      stageConfig.height = h;
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
    // Same reasoning as the empty-space click: with the chat open the spotlight is the
    // other half of "these photos", so it lets go on the same gesture.
    if (showChatAttachControls.value) clearChatSpotlight();
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
    // The board's selection only. Marks made with the corner circle survive a click on
    // empty space on purpose: they are an in-progress list for an action, and gathering
    // one means panning around the board, which would clear it on the way. The action bar
    // carries its own explicit clear.
    photo.selected = false;
    // Also hide hover state/buttons when clicking/touching outside
    photo.hovered = false;
  });

  // The spotlight is the same gesture with the chat open, so it lets go on the same empty
  // click the board selection does — otherwise the two picks would clear on different rules.
  if (showChatAttachControls.value) clearChatSpotlight();

  // Close any open menus
  closeConfigMenu();
  showRelatedPhotos.value = false;
};

/**
 * Where the pointer went down on the stage, in screen pixels. Used to tell a click that
 * clears the selection from a pan that must preserve it.
 */
const stagePointerDownPos = ref(null);

/** How far the pointer may travel between press and release and still count as a click. */
const STAGE_CLICK_DRAG_THRESHOLD = 6;

const onStagePointerDown = (event) => {
  const stage = event.target.getStage();
  stagePointerDownPos.value = stage ? stage.getPointerPosition() : null;
  handleMouseDown(event);
};

const handleStageClick = (event) => {
  const stage = event.target.getStage();

  // Only an empty-space click clears the selection, and never mid rectangle-select.
  if (event.target !== stage || selectionRect.visible) return;

  // A click that travelled was the tail of a pan — the user dragged the board, and the
  // selection (and with it the halo staying suppressed) must survive untouched. Only a
  // click that stayed put is a real "clear everything" gesture.
  const start = stagePointerDownPos.value;
  const end = stage.getPointerPosition();
  stagePointerDownPos.value = null;
  if (
    start &&
    end &&
    Math.hypot(end.x - start.x, end.y - start.y) > STAGE_CLICK_DRAG_THRESHOLD
  ) {
    return;
  }

  resetCanvasState();
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

  event.cancelBubble = true;

  // With the chat open the click is reserved for the spotlight (the chat's finest level):
  // the focus is set by the halo or a drag-box, so a plain click singles a photo out
  // instead of adding it to the board selection.
  if (showChatAttachControls.value) {
    togglePhotoSpotlight(photo);
    return;
  }

  // Canvas click is additive/toggle by default (multi-select without modifiers).
  // Ctrl/Cmd keeps the same toggle behavior for consistency across platforms.
  photo.selected = !photo.selected;
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

      // Mirror the click: with the chat open a tap spotlights the photo, otherwise it
      // toggles the board selection for quick multi-selection gestures.
      if (showChatAttachControls.value) {
        togglePhotoSpotlight(photo);
      } else {
        photo.selected = !photo.selected;
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
  observeStageSize();
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
  // Reveal the vision halo once any fit tween settles — see `haloReady`.
  canvasStore.onFitComplete = revealHalo;

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
  unobserveStageSize();
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
  display: flex;
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

/* The board's own column. Takes what the chat panel leaves, and is the containing block
   every overlay below resolves against — see the comment on the element itself. */
.canvas-main {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
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
