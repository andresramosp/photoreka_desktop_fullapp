<template>
  <div
    class="canvas-container"
    :class="{
      'playground-mode': isPlayground,
      'show-dots': toolbarState.showDots,
      [`bg-${canvasBackgroundId}`]: true,
    }"
    :style="[
      canvasBackgroundStyle,
      { '--chat-panel-width': `${effectiveChatPanelWidth}px` },
    ]"
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
          @mousemove="onStagePointerMove"
          @mouseup="onStagePointerUp"
          @mouseleave="onStagePointerLeave"
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
              v-if="showOuterHalo && HALO_STYLE === 'filled'"
              :config="{
                x: vision.circle.value.x,
                y: vision.circle.value.y,
                listening: false,
              }"
            >
              <!-- Outer ring: a circle in the secondary colour, wide enough to enclose every
                   photo, for "the whole board the chat is aware of". Its wash is barely
                   there so it never competes with the focus glow at the centre (a solid
                   second layer read as a hole around it). Concentric with the focus halo
                   (same group centre), so it is placed at the group's local origin. Stroke
                   and dash scale with the radius so the ring looks the same at any size or
                   zoom. Turned off entirely by OUTER_HALO_ENABLED in useCanvasVisionRadius.

                   Hidden under a region: two dashed boundaries, one inside the other, read
                   as clutter rather than as nesting, and the region is the mark the user is
                   working with. The board level is not lost by dropping it — the tutorial
                   and the context readout both still say the chat knows the whole canvas. -->
              <v-circle
                v-if="vision.outerCircle.value && !isRegionMode"
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
                  // The null gradient stops clear any stale radial-gradient left on the
                  // node — vue-konva merges attrs, never removes.
                  fillRadialGradientColorStops: null,
                  fill: outerHaloFill,
                  listening: false,
                }"
              />
              <!-- A halo, not a ring: concentric bands fading outwards, so it reads as a
                   soft region of attention rather than as a boundary something is inside
                   or outside of. Konva has no radial gradient on a Circle without a
                   fillRadialGradient, which is what this is. Gated on the halo being ON —
                   turned off, the outer ring above stays but this focus glow goes. -->
              <v-circle
                v-if="showVisionHalo"
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
            <!-- The region frame. A hand-picked selection too large for the chat to be
                 shown (past MAX_FOCUSED_PHOTOS) is a reduced canvas rather than a focus,
                 so it wears the board's own dashed purple — the outer halo's exact style —
                 instead of the focus blue: a piece of the board the chat reaches as
                 metadata, not photos it looks at. Same layer as the halo, so it sits under
                 the photos and never tints them. -->
            <v-group v-if="showRegionFrame" :config="{ listening: false }">
              <v-rect
                :config="{
                  x: regionFrame.x,
                  y: regionFrame.y,
                  width: regionFrame.width,
                  height: regionFrame.height,
                  cornerRadius: regionFrame.radius * 0.06,
                  stroke: regionFrameStroke,
                  strokeWidth: Math.max(regionFrame.radius * 0.004, 2),
                  dash: [regionFrame.radius * 0.04, regionFrame.radius * 0.028],
                  fill: regionFrameFill,
                  listening: false,
                }"
              />
              <v-text
                :config="{
                  x: regionFrame.x + regionFrame.labelSize * 0.8,
                  y: regionFrame.y - regionFrame.labelSize * 1.5,
                  text: regionFrame.label,
                  fontSize: regionFrame.labelSize,
                  fontStyle: 'bold',
                  fill: regionColor,
                  listening: false,
                }"
              />
            </v-group>
            <!-- El marco de la selección del tablero: la caja que abarca las fotos
                 seleccionadas. Pintura y nada más — sin escucha, y en la capa de debajo,
                 así cada foto conserva intactos su arrastre, su hover y sus botones. Quien
                 recoge el arrastre desde el hueco entre las fotos es el stage: ver
                 beginFrameDrag. -->
            <v-rect
              v-if="showSelectionFrame"
              :config="{
                x: selectionFrame.x,
                y: selectionFrame.y,
                width: selectionFrame.width,
                height: selectionFrame.height,
                cornerRadius: 12,
                stroke: selectionFrameStroke,
                strokeWidth: 3,
                dash: [12, 7],
                fill: selectionFrameFill,
                listening: false,
              }"
            />
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
                stroke: isCheckedSelectionMode ? accentColor : primaryColor,
                strokeWidth: 2,
                fill: isCheckedSelectionMode
                  ? 'rgba(34, 211, 238, 0.1)'
                  : 'rgba(37, 99, 235, 0.1)',
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
                      (photo.selected && !isRegionMode) ||
                      photo.checked ||
                      haloHighlightIds.has(photo.id) ||
                      isHoverHighlighted(photo) ||
                      isPhotoSpotlighted(photo)
                        ? 7
                        : photo.isNew
                          ? 4
                          : 2.5,
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
                    opacity: 0.4,
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
                      !isCheckedSelectionMode &&
                      !photo.imageBroken &&
                      isExpansionEnabled &&
                      expansionMode == 'canvas' &&
                      !photo.inTrash &&
                      photo.hovered &&
                      (toolbarState.expansion.type !== 'tags' ||
                        photo.tags.some((t) => t.tag.selected))
                    "
                    @click="handleAddPhotoFromPhoto"
                    :sizeFactor="dynamicSizeFactor"
                  />
                  <PhotoCenterButton
                    v-else-if="
                      !showChatAttachControls &&
                      !isCheckedSelectionMode &&
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

                  <!-- The spotlight, in the same centre slot the '+' uses: with the chat
                       open the photo's canvas controls give way to its chat control, so the
                       two never compete for the middle of the frame.

                       Gated on the mark leaving a ZONE behind it (see `canSpotlight`). A
                       photo singled out with nothing around it is just a focus by another
                       name, so rather than teach that equivalence the affordance is simply
                       not there — which covers the no-focus case and the
                       spotlight-the-only-focused-photo case with one rule.

                       Offered on ANY photo that passes, inside the focus or not: holding a
                       shot from elsewhere on the board up against the zone is one of the
                       things this is for. -->
                  <PhotoAttachButton
                    v-if="
                      showChatAttachControls &&
                      canSpotlight(photo) &&
                      !photo.imageBroken &&
                      !photo.inTrash &&
                      photo.hovered
                    "
                    :photo="photo"
                    :fill="accentColor"
                    :active="isPhotoSpotlighted(photo)"
                    :sizeFactor="1.3"
                    @click="({ photo: p }) => togglePhotoSpotlight(p)"
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
                       checked so the marked set is legible without hovering every photo,
                       and on every photo once any is marked: from then on a plain click
                       marks too, so the circles have to read as the live control.
                       Gone entirely while the chat is open: there the click is the
                       spotlight, and a second per-photo pick would only muddy which of the
                       chat's levels a mark belongs to. -->
                  <PhotoSelectionCircle
                    v-if="
                      !showChatAttachControls &&
                      !photo.imageBroken &&
                      !photo.inTrash &&
                      (photo.hovered || photo.checked || isCheckedSelectionMode)
                    "
                    :photo="photo"
                    :checked="!!photo.checked"
                    :fill="accentColor"
                    :sizeFactor="1.3"
                    @toggle="handleToggleChecked"
                  />

                  <!-- Botón de info (esquina superior derecha). Oculto con el chat
                       abierto, igual que el círculo de selección: el clic ya está
                       reservado al spotlight, así que este botón perdería su destino. -->
                  <PhotoInfoButton
                    v-if="
                      !showChatAttachControls &&
                      !photo.imageBroken &&
                      photo.hovered &&
                      !photo.inTrash
                    "
                    :photo="photo"
                    :photo-width="photo.config.width"
                    :fill="accentColor"
                    :sizeFactor="1.3"
                    @click="handleInfoButtonClick"
                  />

                  <!-- With the chat open the centre slot belongs to the spotlight button
                       above: the '+' blocks are gated off (!showChatAttachControls) so the
                       two never sit under the same pointer. A plain click still marks the
                       photo as focus, exactly as it does with the chat closed — see
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

          <!-- La acción del marco, en su propia capa para que quede siempre por encima de
               las fotos: el zIndex que cada foto lleva en su config las reordena dentro de
               la capa que comparten, y el botón acabaría enterrado bajo alguna. -->
          <v-layer>
            <v-group
              v-if="showSelectionButton"
              :config="{
                x: selectionFrame.x + selectionFrame.width,
                y: selectionFrame.y,
                opacity: selectionButtonHovered ? 1 : 0.9,
              }"
              @click="groupSelectedPhotos"
              @tap="groupSelectedPhotos"
              @mouseover="onSelectionButtonOver"
              @mouseout="onSelectionButtonOut"
            >
              <v-circle
                :config="{
                  radius: SELECTION_BUTTON_RADIUS,
                  fill: primaryColor,
                  stroke: 'rgba(255, 255, 255, 0.9)',
                  strokeWidth: 3,
                  shadowColor: 'black',
                  shadowBlur: 16,
                  shadowOpacity: 0.45,
                }"
              />
              <v-rect
                v-for="(cell, index) in SELECTION_BUTTON_CELLS"
                :key="index"
                :config="{
                  x: cell.x,
                  y: cell.y,
                  width: SELECTION_BUTTON_CELL,
                  height: SELECTION_BUTTON_CELL,
                  cornerRadius: 2,
                  fill: 'white',
                  listening: false,
                }"
              />
            </v-group>
          </v-layer>
        </v-stage>

        <!-- Board data is being fetched (initial load / canvas switch). Sits over the
             stage, which stays mounted underneath so its refs and fit logic survive. -->
        <Transition name="canvas-loader-fade">
          <div v-if="showCanvasLoader" class="canvas-loader-overlay">
            <SpiralGridLoader :size="72" variant="primary" />
          </div>
        </Transition>
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
        :has-selected-photos="hasManualFocus"
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
            @duplicate-canvas="handleDuplicateCanvas"
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
              <!-- <div v-if="!isPlayground" class="config-section">
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
              </div> -->

              <!-- Canvas Section -->
              <div class="config-section">
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
              <div v-if="false" class="config-section">
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

          <n-tooltip placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                secondary
                type="primary"
                :disabled="!canUndo"
                @click="undoCanvas"
              >
                <template #icon>
                  <n-icon size="20">
                    <ArrowUndoOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            Undo (Ctrl+Z)
          </n-tooltip>

          <n-tooltip placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                secondary
                type="primary"
                :disabled="!canRedo"
                @click="redoCanvas"
              >
                <template #icon>
                  <n-icon size="20">
                    <ArrowRedoOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            Redo (Ctrl+Shift+Z)
          </n-tooltip>

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
         attach a conversation to.

         It slides in from the right edge instead of appearing whole (see `.ccp-slide`),
         and the board is only fitted once it has landed — @after-enter — because the fit
         has to measure the stage at its final width. -->
    <Transition name="ccp-slide" @after-enter="centerBoardForChat">
      <CanvasChatPanel
        v-if="isChatPanelOpen && !isPlayground"
        ref="chatPanelRef"
        :canvas-id="activeCanvasId"
        :width="effectiveChatPanelWidth"
        :board-photo-ids="boardPhotoIds"
        :discarded-photo-ids="discardedPhotoIds"
        :focus-photo-ids="chatFocusIds"
        :region-photo-ids="chatRegionIds"
        :region-mode="chatFocus.isRegion"
        :focused-photos="chatFocus.photos"
        :covered-count="chatFocus.total"
        :focus-source="chatFocus.source"
        :max-focused="MAX_FOCUSED_PHOTOS"
        :spotlighted-photos="spotlightPhotos"
        :spotlight-photo-ids="chatSpotlightIds"
        :layout="chatLayout"
        :has-separate-groups="chatHasSeparateGroups"
        :vision-enabled="vision.enabled.value"
        @close="setChatPanelOpen(false)"
        @toggle-vision="vision.toggle"
        @clear-focus="clearBoardSelection"
        @resize="setChatPanelWidth"
        @highlight-photo="hoverHighlightId = $event"
        @locate-photo="centerViewOnPhoto($event)"
        @clear-spotlight="clearChatSpotlight"
        @fit-to-view="fitStageToVisionRing"
        :materialize-group="materializeChatGroup"
      />
    </Transition>
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
import { useCanvasHistory } from "@/composables/canvas/useCanvasHistory.js";
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
  ArrowUndoOutline,
  ArrowRedoOutline,
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
import PhotoAttachButton from "@/components/canvas/PhotoControls/PhotoAttachButton.vue";
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
import { useIndexedDBCache } from "@/composables/useIndexedDBCache.js";
import { useBackgroundImageCache } from "@/composables/useBackgroundImageCache.js";
import CanvasChatPanel from "@/components/canvas/CanvasChatPanel.vue";
import {
  useCanvasVisionRadius,
  getViewportBounds,
  HALO_FADED_OPACITY,
} from "@/composables/canvas/useCanvasVisionRadius.js";
import {
  useCanvasChatContext,
  LEVELS,
  MAX_FOCUSED_PHOTOS,
} from "@/composables/canvas/useCanvasChatContext.js";
import CanvasManagerPopover from "@/components/canvas/CanvasManagerPopover.vue";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { usePhotoQueryParams } from "@/composables/usePhotoQueryParams.js";
import { useTheme } from "@/composables/useTheme.js";
import AppLogo from "@/components/AppLogo.vue";
import { ExpandAltOutlined } from "@vicons/antd";
import ColorPickerPills from "@/components/ColorPickerPills.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
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
const { bulkLoadFromCache } = useIndexedDBCache();
const { scheduleBackgroundCache } = useBackgroundImageCache();
const {
  hasUnsavedChanges,
  isSaving,
  isLoading: isCanvasDataLoading,
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
  duplicateCanvas,
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

const resetRelatedPhotosSearch = () => {
  const defaults = getDefaultConfig().expansion;
  toolbarState.value.expansion.type = defaults.type;
  toolbarState.value.expansion.scope = defaults.scope;
};

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
    expansion: (() => {
      const { type, scope, ...expansionPreferences } =
        toolbarState.value.expansion;
      return expansionPreferences;
    })(),
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

/**
 * The region's hue (pink). Drawn at the same time as the board's purple ring — a region is
 * a piece of the board, and "how does this area sit in the canvas?" is a question the agent
 * answers from both — so the two need to be told apart at a glance. Read once at setup like
 * the three above.
 */
const regionColor = getComputedStyle(document.documentElement)
  .getPropertyValue("--region-color")
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
  centerViewOnBounds,
} = useCanvasStage(
  stageRef,
  photos,
  toolbarState,
  () => isCheckedSelectionMode.value,
);

// Undo/redo for the board's geometry. Instantiated before useCanvasPhoto so drag-end and
// unstack can record a history entry when they settle. See useCanvasHistory for the model.
const history = useCanvasHistory();
const { undo: undoCanvas, redo: redoCanvas, canUndo, canRedo } = history;

const {
  handleDragStart,
  handleDragMove,
  handleDragEnd,
  handleMouseOver,
  handleMouseOut,
  unstackPhotos,
  isHoveringTrash,
  handlePhotoDrop,
  snapPhotosToNeighbors,
} = useCanvasPhoto(stageRef, photos, photoRefs, stageConfig, history.commit);

// The board's mutating store actions each close one undoable step. Committing here (rather
// than at every caller) means no add/trash path can be missed; commit() is idempotent, so a
// trash-via-drag — deletePhotos called from inside handleDragEnd — records exactly one entry.
canvasStore.$onAction(({ name, after }) => {
  if (!["addPhotos", "addPhotosFromPhoto", "deletePhotos"].includes(name)) {
    return;
  }
  after(() => history.commit());
});

// A freshly (de)serialized board is a new starting point — no undo reaches across a load or
// a canvas switch. `isCanvasDataLoading` goes true→false once deserialize has placed the
// photos, so the baseline captured here is the loaded board, not an empty one.
watch(isCanvasDataLoading, (loading, wasLoading) => {
  if (wasLoading && !loading) history.reset();
});

const { animatePhoto, animatePhotoGroup, animatePhotoGroupExplosion } =
  usePhotoAnimations();

// ── Chat docked to this board ───────────────────────────────────────────────

const CHAT_PANEL_OPEN_KEY = "photoreka:canvas:chat-open";
const CHAT_PANEL_WIDTH_KEY = "photoreka:canvas:chat-width";
// Matches CanvasChatPanel's MAX_WIDTH: opens at the widest it's allowed to be.
const DEFAULT_CHAT_PANEL_WIDTH = 780;
const MIN_CHAT_PANEL_WIDTH = 380;

// Per browser, not per canvas: someone who works with the chat open works with it open on
// every board, and re-opening it on each one would be busywork.
const isChatPanelOpen = ref(localStorage.getItem(CHAT_PANEL_OPEN_KEY) === "1");
// A width the user dragged to is theirs and is kept; anything outside the panel's own
// range (a stale value from when the ceiling was lower is still valid, a corrupt one is
// not) falls back to the full width.
const chatPanelWidth = ref(
  (() => {
    const stored = Number(localStorage.getItem(CHAT_PANEL_WIDTH_KEY));
    return stored >= MIN_CHAT_PANEL_WIDTH && stored <= DEFAULT_CHAT_PANEL_WIDTH
      ? stored
      : DEFAULT_CHAT_PANEL_WIDTH;
  })(),
);

const setChatPanelOpen = (open) => {
  isChatPanelOpen.value = open;
  localStorage.setItem(CHAT_PANEL_OPEN_KEY, open ? "1" : "0");
};

const setChatPanelWidth = (width) => {
  chatPanelWidth.value = width;
  localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(width));
};

// The width the user dragged to is an absolute pixel value, so on a narrow window it eats
// most of the board. The stored preference is kept as-is (it is theirs, and returns in full
// on a wide screen); what the panel actually renders at is that value clamped against the
// current viewport — never more than this fraction of it, never below the panel's own
// minimum. Mobile is out of scope: there the board and chat are never shown together.
const CHAT_PANEL_MAX_VIEWPORT_FRACTION = 0.4;

const windowWidth = ref(window.innerWidth);
const handleWindowResize = () => {
  windowWidth.value = window.innerWidth;
};
onMounted(() => window.addEventListener("resize", handleWindowResize));
onUnmounted(() => window.removeEventListener("resize", handleWindowResize));

const effectiveChatPanelWidth = computed(() => {
  const ceiling = Math.round(
    windowWidth.value * CHAT_PANEL_MAX_VIEWPORT_FRACTION,
  );
  return Math.max(
    MIN_CHAT_PANEL_WIDTH,
    Math.min(chatPanelWidth.value, ceiling),
  );
});

// ── Handing board photos to the chat ────────────────────────────────────────

const chatPanelRef = ref(null);

/**
 * Whether the chat's interaction mode is active. While the chat is open a photo's centre
 * controls belong to the chat: the canvas '+' gives way to the spotlight button, which is
 * the only way to single a photo out. Only in a saved canvas — never in the playground,
 * which has no chat.
 *
 * The click is NOT part of this. It toggles the board selection here exactly as it does
 * with the chat closed, and that selection IS the focus — so one gesture means one thing
 * whether or not the chat is open.
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

/**
 * The photos the user has spotlighted — the finest of the chat's three nested levels.
 *
 * Board state, owned here, exactly like the focus beside it. It used to live in the chat's
 * composer as an ordinary attachment and travel back through an echo, which made the board
 * ask the chat about its own photos and — worse — made a photo genuinely attached from the
 * transcript come back wearing the spotlight border. The two are different things: a
 * spotlight points at a photo already ON the board, an attachment brings one in from
 * outside it.
 *
 * Numbers, matching every other board id set.
 */
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

// The halo is capped to the same number so what it covers never exceeds what the chat is
// shown — see the radius cap in useCanvasVisionRadius.
const vision = useCanvasVisionRadius(photos, stageViewport, MAX_FOCUSED_PHOTOS);

/**
 * Everything the chat is told about this board — which level the turn is about, and the
 * photo sets that make it up.
 *
 * The single owner of that model: the halo feeds it, the panel and the readout read it,
 * and nothing here re-derives a level of its own. What stays in this view is only how the
 * levels are DRAWN — the ring, the region frame, the per-photo highlight — which is a
 * different question from what they are.
 */
const {
  level: chatLevel,
  hasManualFocus,
  focus: chatFocus,
  focusIds: chatFocusIds,
  regionIds: chatRegionIds,
  spotlightPhotos,
  spotlightPhotoIds: chatSpotlightIds,
  layout: chatLayout,
  hasSeparateGroups: chatHasSeparateGroups,
  isPhotoSpotlighted,
  togglePhotoSpotlight,
  clearChatSpotlight,
  canSpotlight,
} = useCanvasChatContext({
  photos,
  visionPhotos: vision.visiblePhotos,
  boardPhotoIds,
});

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
 * A soft secondary-colour wash for the outer ring's interior.
 *
 * Kept much lighter than the stroke so the ring reads in purple without turning the board
 * into a heavy tinted disk.
 */
const outerHaloFill = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(secondaryColor);
  return isHex ? `${secondaryColor}12` : secondaryColor;
})();

/**
 * The region frame's stroke and interior — the outer ring's exact recipe and alpha, in the
 * region's own hue. Same shape language (a dashed boundary the chat is aware of), different
 * colour, because both are on screen at once and they are not the same scope.
 */
const regionFrameStroke = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(regionColor);
  return isHex ? `${regionColor}73` : regionColor;
})();

const regionFrameFill = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(regionColor);
  return isHex ? `${regionColor}12` : regionColor;
})();

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

/**
 * The outer ambient ring — "the whole board the chat is aware of" — shows whenever the halo
 * COULD be on: chat open, not the playground, and the opening fit settled. It deliberately
 * does NOT require `vision.enabled`: turning the halo off drops the focus glow but the board
 * is still context, so its ring stays. Nor does a hand-picked focus or a REGION hide it —
 * marking photos out narrows what the chat looks at or operates on, it does not change how
 * much of the board the chat knows about, and the agent is given both at once: "how does
 * this area sit within the canvas?" is answered from the board AND the region. So both are
 * drawn together, told apart by hue — purple for the board, pink for the region — rather
 * than by one of them giving way.
 */
const showOuterHalo = computed(
  () => isChatPanelOpen.value && !isPlayground.value && haloReady.value,
);

/**
 * The focus glow proper — the outer ring's conditions, PLUS the halo actually being on and no
 * hand-picked selection. A manual focus replaces the glow: then THOSE photos are what the chat
 * looks at, and two competing indications of "these photos" is the ambiguity this replaced.
 */
const showVisionHalo = computed(
  () => showOuterHalo.value && vision.enabled.value && !hasManualFocus.value,
);

/**
 * Photos the halo actually feeds the chat, drawn as if the user had picked them by hand.
 *
 * The halo's soft gradient says "roughly here", but a photo sitting under its faint rim
 * reads as ambiguous — in or out? Borrowing the board's own selection border removes the
 * guess: same blue, same weight as a click. It stays a VISUAL echo only — `photo.selected`
 * is untouched, so the halo/selection distinction that drives `chatFocus` still holds.
 *
 * Follows `chatFocus.sentPhotos` — the photos the chat is actually shown — not everything
 * under the ring. The radius already caps itself so the two normally coincide, but this
 * keeps the highlight honest even if the radius is ever widened past the cap in code.
 * Empty unless the halo is actually on screen.
 */
const haloHighlightIds = computed(() =>
  showVisionHalo.value
    ? new Set(chatFocus.value.sentPhotos.map((photo) => photo.id))
    : new Set(),
);

/** True when a photo wears the board's selection look — a real pick, a corner-circle mark,
 *  the chat's halo, or attached to the chat. These are the ones a zoomed-out fill overlay
 *  reinforces, each in its own colour (see getPhotoStrokeColor). */
const isFocusHighlighted = (photo) =>
  (photo.selected && !isRegionMode.value) ||
  photo.checked ||
  haloHighlightIds.value.has(photo.id) ||
  isPhotoSpotlighted(photo);

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
 * The selection as a REGION, on screen: too many photos for the chat to be shown, so none
 * is, and the chat reaches them as metadata only. The look changes with it, and only while
 * the chat is open, like the halo: no focus blue on the picked photos, the rest of the
 * board dimmed, and a frame in the board's own dashed purple.
 */
const isRegionMode = computed(
  () =>
    chatLevel.value === LEVELS.REGION &&
    isChatPanelOpen.value &&
    !isPlayground.value,
);

const regionIdSet = computed(() =>
  isRegionMode.value
    ? new Set(chatFocus.value.photos.map((photo) => photo.id))
    : new Set(),
);

/**
 * The frame drawn around the region: the box its photos span, padded, plus its label.
 * `radius` is the outer halo's radius equivalent — half the longer side — so the ring's
 * stroke and dash formulas transfer unchanged.
 */
const regionFrame = computed(() => {
  if (!isRegionMode.value) return null;
  const rects = chatFocus.value.photos
    .map((photo) => photo.config)
    .filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y));
  if (rects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of rects) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + (c.width ?? 0));
    maxY = Math.max(maxY, c.y + (c.height ?? 0));
  }
  const longest = Math.max(maxX - minX, maxY - minY, 1);
  const pad = Math.max(longest * 0.04, 24);
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;
  const radius = Math.max(width, height) / 2;
  const count = chatFocus.value.total;
  return {
    x: minX - pad,
    y: minY - pad,
    width,
    height,
    radius,
    labelSize: Math.min(Math.max(radius * 0.05, 14), 40),
    label: `Region · ${count} photo${count === 1 ? "" : "s"}`,
  };
});

const showRegionFrame = computed(() => regionFrame.value !== null);

/**
 * Put the board under the radius when the chat opens.
 *
 * The radius follows the middle of the viewport, so "centre it on the photos" is really
 * "centre the photos in the viewport" — which is what the fit already does. Opening the
 * chat over whatever corner the user had panned to would otherwise hand the chat an empty
 * halo, which is the least useful state it has.
 *
 * The fit has to run AFTER the stage has taken its new width, which is why this hangs off
 * the panel's @after-enter rather than the watch below: while the panel is still sliding
 * in the stage is wider than it will end up, and fitting against that width centres the
 * photos behind the panel. The explicit handleResize is the same guarantee for the last
 * frame — the ResizeObserver would get there too, but on its own schedule.
 */
/** Safety timer that re-reveals the halo if a fit bails without tweening — see below. */
let haloRevealFallback = null;

const revealHalo = () => {
  clearTimeout(haloRevealFallback);
  haloRevealFallback = null;
  haloReady.value = true;
};

/**
 * Park the halo for the whole opening gesture — the slide AND the fit that follows it — so
 * it appears already in place instead of chasing the viewport across the board.
 * `onFitComplete` reveals it when the fit tween lands; the fallback only covers the paths
 * where the fit bails without tweening (no stageRef, zero-sized stage, an empty board), so
 * the halo can never get stuck hidden.
 */
const hideHaloWhileChatOpens = () => {
  haloReady.value = false;
  clearTimeout(haloRevealFallback);
  haloRevealFallback = setTimeout(revealHalo, 1200);
};

const centerBoardForChat = () => {
  if (photos.value.length === 0) return;
  nextTick(() => {
    handleResize();
    fitStageToPhotos();
  });
};

/**
 * Frame the whole outer vision ring, not just the photos inside it.
 *
 * The canvas-chat tutorial opens on the "board" level — the chat aware of the entire
 * canvas — so its walkthrough should show that ring whole. `centerBoardForChat` (the
 * normal chat-open fit) still crops to the photo bounding box; this one fits the ring
 * that is actually drawn (`vision.outerCircle`), so the framing matches the halo. Falls
 * back to the photo fit when there is no ring on screen to frame — the outer layer turned
 * off (OUTER_HALO_ENABLED), or a region drawn, which hides it.
 */
const fitStageToVisionRing = () => {
  if (photos.value.length === 0) return;
  nextTick(() => {
    handleResize();
    const ring = isRegionMode.value ? null : vision.outerCircle.value;
    if (!ring) {
      fitStageToPhotos();
      return;
    }
    canvasStore.fitStageToBounds(
      {
        minX: ring.x - ring.radius,
        minY: ring.y - ring.radius,
        maxX: ring.x + ring.radius,
        maxY: ring.y + ring.radius,
      },
      0.06,
    );
  });
};

/** How long a materialised group takes to travel to its new home, in seconds. */
const GROUP_MOVE_DURATION = 0.65;

/** True when a world-space rectangle already sits entirely inside what is on screen. */
const isBoundsFullyVisible = (bounds) => {
  const view = getViewportBounds(canvasStore.viewport);
  return (
    bounds.minX >= view.left &&
    bounds.maxX <= view.right &&
    bounds.minY >= view.top &&
    bounds.maxY <= view.bottom
  );
};

/**
 * Materialise a grouping the chat proposed.
 *
 * A reply often answers with labelled sets ("Night scenes", "Interiors and cafés") that
 * exist only in the transcript. This is the one gesture that makes one of them real: the
 * photos are brought to the board if they are not on it yet, then pulled out of wherever
 * they sit and laid down as a single block in a clear area, in the order the reply gave
 * them — so the grouping the chat described is the grouping the board shows.
 *
 * Photos already placed MOVE rather than duplicate: the group is the same photos, said
 * again in space.
 *
 * @param {{photos: Array<{id: number|string, thumbnailUrl?: string}>}} group
 * @returns {Promise<number>} how many photos ended up in the block
 */
const materializeChatGroup = async ({ photos: groupPhotos }) => {
  const wanted = (groupPhotos ?? []).filter((photo) =>
    Number.isFinite(Number(photo.id)),
  );
  if (wanted.length === 0) return 0;

  // One undo step for the whole thing: the add below lands photos at a throwaway spot and
  // the layout moves them a moment later, so the batch hides that intermediate state and
  // records a single entry once the group has settled.
  history.beginBatch();
  try {
    return await materializeChatGroupInner(wanted);
  } finally {
    history.endBatch();
  }
};

const materializeChatGroupInner = async (wanted) => {
  const placed = new Set(photos.value.map((photo) => Number(photo.id)));
  const missing = wanted.filter((photo) => !placed.has(Number(photo.id)));
  // No auto-fit: these land wherever the store finds room and are moved again a moment
  // later, so fitting to that intermediate arrangement would only lurch the board twice.
  if (missing.length) await canvasStore.addPhotos(missing, false, false);

  const plan = canvasStore.planGroupPlacement(
    wanted.map((photo) => Number(photo.id)),
  );
  if (!plan) return 0;

  // The photos added just above have no Konva node until the board has rendered them.
  await nextTick();

  for (const { photo, x, y } of plan.targets) {
    const node = photoRefs.value[photo.id]?.getNode();
    // The tween reads the node's current position when it is built, so it has to be built
    // BEFORE the config is committed. Committing straight after is what makes the movement
    // safe: a re-render in the middle of it (the glow below, a hover) writes the node to
    // its destination, and the tween's next frame simply takes it back — where the reverse
    // order would leave the photo snapped back to where it started.
    if (node) animatePhoto(node, x, y, GROUP_MOVE_DURATION);
    photo.config.x = x;
    photo.config.y = y;
  }

  canvasStore.applyGlowEffect(plan.targets.map(({ photo }) => photo.id));
  // Travel to the block only if it landed somewhere the user cannot see: a group assembled
  // off-screen is a change they would otherwise miss, but one that formed in front of them
  // does not need the board moved out from under it. Pan only — the zoom is theirs to keep.
  if (!isBoundsFullyVisible(plan.bounds)) {
    setTimeout(
      () => centerViewOnBounds(plan.bounds),
      GROUP_MOVE_DURATION * 1000,
    );
  }

  return plan.targets.length;
};

/* ---------------------------------------------------------------------------
 * El marco de la selección del tablero.
 *
 * Con varias fotos seleccionadas, la selección pasa a tener una superficie propia: se
 * arrastra desde cualquier punto del marco, no sólo desde las fotos, y ofrece en su
 * esquina la acción de compactarlas en bloque.
 *
 * Sólo con el chat cerrado. Con el chat abierto esa misma selección ya se dibuja como
 * focus o como region, y dos marcos sobre las mismas fotos serían justo la ambigüedad
 * que la region vino a resolver.
 * ------------------------------------------------------------------------- */

const SELECTION_FRAME_PAD = 18;

const selectedBoardPhotos = computed(() =>
  photos.value.filter((photo) => photo.selected),
);

/** La caja que abarca la selección, en coordenadas del tablero. */
const selectionFrame = computed(() => {
  const items = selectedBoardPhotos.value;
  if (items.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { config } of items) {
    if (!config || !Number.isFinite(config.x) || !Number.isFinite(config.y)) {
      continue;
    }
    minX = Math.min(minX, config.x);
    minY = Math.min(minY, config.y);
    maxX = Math.max(maxX, config.x + (config.width ?? 0));
    maxY = Math.max(maxY, config.y + (config.height ?? 0));
  }
  if (!Number.isFinite(minX)) return null;

  return {
    x: minX - SELECTION_FRAME_PAD,
    y: minY - SELECTION_FRAME_PAD,
    width: maxX - minX + SELECTION_FRAME_PAD * 2,
    height: maxY - minY + SELECTION_FRAME_PAD * 2,
  };
});

const showSelectionFrame = computed(
  () => !isChatPanelOpen.value && selectionFrame.value !== null,
);

/**
 * El hue de la selección, con la misma receta de alfa que el marco de region: un borde
 * discreto y un interior apenas teñido, bastante para leer el área como una sola pieza sin
 * competir con el resaltado que ya lleva cada foto.
 */
const selectionFrameStroke = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(primaryColor);
  return isHex ? `${primaryColor}d9` : primaryColor;
})();

const selectionFrameFill = (() => {
  const isHex = /^#[0-9a-f]{6}$/i.test(primaryColor);
  return isHex ? `${primaryColor}26` : primaryColor;
})();

/**
 * El arrastre del marco NO usa el drag de Konva.
 *
 * Un nodo arrastrable cuya posición sale de las mismas fotos que el arrastre mueve tiene
 * dos dueños — Konva durante el gesto, Vue en cada re-render — y acaban peleándose: el
 * marco se despega de sus fotos y el gesto no se suelta. Aquí el marco es sólo pintura
 * derivada de la caja, y el gesto se lee del stage: un único dueño de la posición.
 *
 * Guarda el punto donde empezó el gesto y la posición de partida de cada foto, para que la
 * traslación se calcule siempre contra el origen y no acumule error frame a frame.
 */
let frameDrag = null;

/** El puntero en coordenadas del tablero (deshace el pan/zoom del stage). */
const boardPointerPosition = (stage) => {
  const pointer = stage?.getPointerPosition();
  if (!pointer) return null;
  return stage.getAbsoluteTransform().copy().invert().point(pointer);
};

const isPointInSelectionFrame = (point, pad = 0) => {
  const frame = selectionFrame.value;
  if (!frame || !point) return false;
  return (
    point.x >= frame.x - pad &&
    point.x <= frame.x + frame.width + pad &&
    point.y >= frame.y - pad &&
    point.y <= frame.y + frame.height + pad
  );
};

/** @returns {boolean} si el gesto lo recoge el marco, y no el stage. */
const beginFrameDrag = (event) => {
  const stage = event.target.getStage();
  // Sobre una foto manda la foto: su propio arrastre ya mueve el grupo entero.
  if (!showSelectionFrame.value || !stage || event.target !== stage)
    return false;
  // Ctrl/Cmd sigue siendo "añadir a la selección" también dentro del marco.
  if (event.evt?.ctrlKey || event.evt?.metaKey) return false;

  const point = boardPointerPosition(stage);
  if (!isPointInSelectionFrame(point)) return false;

  frameDrag = {
    origin: point,
    moved: false,
    items: selectedBoardPhotos.value.map((photo) => ({
      photo,
      x: photo.config.x,
      y: photo.config.y,
    })),
  };
  // El tablero no se desplaza mientras se mueve la selección. El stage ya quedó apuntado
  // para arrastrar en su propio mousedown; apagar la bandera lo descarta antes del primer
  // movimiento, igual que hace el rectángulo de selección.
  stageConfig.draggable = false;
  // El puntero puede soltarse fuera del canvas, donde el stage ya no oye el mouseup.
  window.addEventListener("mouseup", endFrameDrag);
  return true;
};

const updateFrameDrag = (stage) => {
  const point = boardPointerPosition(stage);
  if (!point) return;

  const dx = point.x - frameDrag.origin.x;
  const dy = point.y - frameDrag.origin.y;
  if (dx === 0 && dy === 0) return;

  frameDrag.moved = true;
  for (const { photo, x, y } of frameDrag.items) {
    photo.config.x = x + dx;
    photo.config.y = y + dy;
  }
};

const endFrameDrag = () => {
  if (!frameDrag) return;

  const { moved, items } = frameDrag;
  frameDrag = null;
  window.removeEventListener("mouseup", endFrameDrag);
  stageConfig.draggable = true;

  // Un clic que no llegó a mover nada no es un arrastre: ni alinea ni deja entrada en el
  // historial. Sigue su camino como el clic en hueco que es, y deshace la selección.
  if (!moved) return;

  if (toolbarState.value.expansion.autoAlign) {
    snapPhotosToNeighbors(items.map(({ photo }) => photo));
  }
  history.commit();
};

/**
 * El puntero sobre el marco. El botón de agrupar sólo sale aquí: fuera del gesto no hay
 * nada que agrupar, y un botón permanente en la esquina compite con las fotos.
 *
 * El margen es el radio del botón, que cuelga del vértice: sin él, el botón se apagaría
 * justo cuando el puntero sale del marco para alcanzarlo.
 */
const isSelectionFrameHovered = ref(false);

/** Una sola pista de que el área es agarrable: el cursor, sobre el hueco entre las fotos. */
const updateFrameCursor = (event) => {
  const stage = event.target.getStage();
  if (!stage) return;

  const point = boardPointerPosition(stage);
  const inFrame = showSelectionFrame.value && isPointInSelectionFrame(point);
  isSelectionFrameHovered.value =
    showSelectionFrame.value &&
    isPointInSelectionFrame(point, SELECTION_BUTTON_RADIUS);

  // El cursor sólo se toca sobre el hueco: encima de una foto manda el cursor de la foto.
  if (event.target !== stage) return;
  stage.container().style.cursor = inFrame ? "move" : "default";
};

const selectionButtonHovered = ref(false);

const showSelectionButton = computed(
  () =>
    showSelectionFrame.value &&
    (isSelectionFrameHovered.value || selectionButtonHovered.value),
);

/** Las cuatro celdas del icono: el resultado de la acción, las fotos ya en bloque. */
const SELECTION_BUTTON_RADIUS = 36;
const SELECTION_BUTTON_CELL = 12.5;
const SELECTION_BUTTON_GAP = 4;
const SELECTION_BUTTON_CELLS = [-1, 0].flatMap((row) =>
  [-1, 0].map((col) => ({
    x:
      col * (SELECTION_BUTTON_CELL + SELECTION_BUTTON_GAP) +
      SELECTION_BUTTON_GAP / 2,
    y:
      row * (SELECTION_BUTTON_CELL + SELECTION_BUTTON_GAP) +
      SELECTION_BUTTON_GAP / 2,
  })),
);

const onSelectionButtonOver = (event) => {
  selectionButtonHovered.value = true;
  event.target.getStage().container().style.cursor = "pointer";
};

const onSelectionButtonOut = (event) => {
  selectionButtonHovered.value = false;
  event.target.getStage().container().style.cursor = "default";
};

/**
 * Compacta la selección en un bloque, donde ya está: la misma colocación que materializa
 * un grupo propuesto por el chat, pero pedida desde el tablero.
 */
const groupSelectedPhotos = () => {
  const plan = canvasStore.planGroupPlacement(
    selectedBoardPhotos.value.map((photo) => photo.id),
  );
  if (!plan) return;

  for (const { photo, x, y } of plan.targets) {
    const node = photoRefs.value[photo.id]?.getNode();
    if (node) animatePhoto(node, x, y, GROUP_MOVE_DURATION);
    photo.config.x = x;
    photo.config.y = y;
  }
  history.commit();
};

watch(isChatPanelOpen, (open) => {
  if (open) {
    // The corner-circle marks belong to the closed-chat mode: their control is hidden while
    // the chat is open (see the template), so drop any that were standing when it opened —
    // otherwise they would stay lit and keep the action bar up with no way to clear them.
    clearCanvasSelections();
    // Same for the related-photos strip: it is the closed-chat way of pulling more photos
    // in, and leaving it up would have two surfaces proposing photos for the same board.
    showRelatedPhotos.value = false;
    hideHaloWhileChatOpens();
  } else {
    // A spotlight is a thing you point AT the chat; with the chat gone it means nothing.
    clearChatSpotlight();
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

/** The marking mode: once any photo wears a corner-circle mark, a plain click on a
 *  photo marks it too, the way any photo grid behaves once its selection starts. */
const isCheckedSelectionMode = computed(() => checkedPhotos.value.length > 0);

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
  // Solo trae las que no estén ya en el store: el canvas únicamente necesita
  // id + thumbnailUrl, y re-pedir cada una golpea el pesado /api/catalog/:id.
  const missingIds = photoIds.filter(
    (id) => !photosStore.photos.some((p) => p.id == id),
  );
  if (missingIds.length > 0) {
    await Promise.all(missingIds.map((id) => photosStore.fetchPhoto(id)));
  }

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
    _forgetImage(photo.id);

    // Remove from photos array permanently
    photos.value.splice(photoIndex, 1);

    // Force stage re-render
    const stage = stageRef.value?.getStage();
    if (stage) {
      stage.batchDraw();
    }

    history.commit();
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
    // This strip always starts a new related-photo search. Its criterion and scope are
    // intentionally transient, unlike the other expansion preferences.
    resetRelatedPhotosSearch();
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
  // A region dims everything OUTSIDE it — the picked photos keep their look and the rest
  // of the board recedes: the inverse of the focus, which lights what it holds.
  if (isRegionMode.value && !regionIdSet.value.has(photo.id)) {
    return base * HALO_FADED_OPACITY;
  }
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
  if (isPhotoSpotlighted(photo)) return accentColor;
  // Blue: picked on the board — moved, expanded from, and what the chat looks at. Not as
  // a region: there the chat looks at nothing, and the frame plus the dimmed rest of the
  // board are what say which photos are picked.
  if (photo.selected && !isRegionMode.value) return primaryColor;
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

// True while the board's photo set is being fetched — the initial mount load, a
// canvas switch, or the query-param add. The stage stays mounted underneath (Konva
// refs, fit logic and the resize observer all need it), so this only drives the
// centred SpiralGridLoader overlay, not a v-if on the stage.
const isInitialCanvasLoad = ref(false);

const showCanvasLoader = computed(
  () =>
    isCanvasDataLoading.value ||
    isSwitchingCanvas.value ||
    isInitialCanvasLoad.value,
);

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
    // Empty new board — its history starts here (createCanvas clears via clearStore, which
    // does not toggle the loading flag the load/switch watcher keys off).
    history.reset();
  }
};

const handleRenameCanvas = async (id, name) => {
  const ok = await renameCanvas(id, name);
  if (ok) {
    window.dispatchEvent(new Event("canvas:list-updated"));
  }
};

const handleDuplicateCanvas = async (id) => {
  // El backend copia la data guardada en BD; si duplicamos el canvas activo con cambios
  // sin guardar, los persistimos antes para que la copia refleje lo que hay en pantalla.
  if (id === activeCanvasId.value && hasUnsavedChanges.value) {
    await saveCanvas();
  }
  const newId = await duplicateCanvas(id);
  if (newId) {
    window.dispatchEvent(new Event("canvas:list-updated"));
    await handleSwitchCanvas(newId);
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
    _forgetImage(photo.id);
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

  // Reset is not undoable (the modal says so): the empty board becomes the new baseline.
  history.reset();
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
  const selectedPhotos = checkedPhotos.value;

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
  const selectedIds = selectedPhotoIds.value;

  // Clear selections
  const clearSelections = () => {
    clearCanvasSelections();
  };

  // When the destination is a canvas and we're already in CanvasView,
  // router.push('/canvas') would be a no-op (same route), so handle it directly.
  if (toolId === "canvas") {
    if (selectedIds.length === 0) return;

    // Only fetch photos missing from the store; the canvas only needs
    // id + thumbnailUrl, and re-fetching each hits the heavy /api/catalog/:id.
    const missingIds = selectedIds.filter(
      (id) => !photosStore.photos.some((p) => p.id == id),
    );
    if (missingIds.length > 0) {
      await Promise.all(missingIds.map((id) => photosStore.fetchPhoto(id)));
    }
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
  const selectedIds = selectedPhotoIds.value;
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

  // Undo / redo. Guarded by !isTyping so Ctrl/Cmd+Z inside the chat composer stays native
  // text undo. Redo is Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y.
  if ((event.ctrlKey || event.metaKey) && !isTyping) {
    const k = event.key.toLowerCase();
    if (k === "z" && !event.shiftKey) {
      event.preventDefault();
      undoCanvas();
    } else if ((k === "z" && event.shiftKey) || k === "y") {
      event.preventDefault();
      redoCanvas();
    }
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
    // Same key on Mac and Windows — no separate binding needed.
    if (showRelatedPhotos.value) {
      hideRelatedPhotos();
    }
    photos.value.forEach((photo) => {
      photo.selected = false;
    });
    // Escape drops the focus these were marked under, so the spotlight goes with it — the
    // same rule the focus watcher applies, stated here because the halo can keep a focus
    // alive that this clear does not reach.
    if (showChatAttachControls.value) clearChatSpotlight();
    // Now that a plain click marks photos once marking has started, the marks need a
    // keyboard way out too, not just the action bar's clear.
    clearCanvasSelections();
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

  // An empty click lets go of every pick at once, the spotlight included — otherwise a
  // board cleared of its marks would keep photos lit with nothing to read them against.
  if (showChatAttachControls.value) clearChatSpotlight();

  // Close any open menus. The related-photos toolbar is NOT dismissed here — a click on
  // empty canvas is how the board's own selection is cleared, and the toolbar (with its
  // own close button now) should stay up until the user explicitly closes it.
  closeConfigMenu();
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
  // El marco de la selección se queda con el gesto antes que nadie: dentro de él, arrastrar
  // mueve la selección en vez de desplazar el tablero o abrir un rectángulo.
  if (beginFrameDrag(event)) return;
  handleMouseDown(event);
};

const onStagePointerMove = (event) => {
  if (frameDrag) {
    updateFrameDrag(event.target.getStage());
    return;
  }
  updateFrameCursor(event);
  handleMouseMove(event);
};

const onStagePointerUp = (event) => {
  endFrameDrag();
  handleMouseUp(event);
};

/**
 * Sólo la salida del propio stage apaga el hover del marco: el mouseleave de cada foto
 * burbujea hasta aquí, y tomarlo por bueno haría parpadear el botón al cruzar de una foto
 * a otra dentro del marco.
 */
const onStagePointerLeave = (event) => {
  if (event.target !== event.target.getStage()) return;
  isSelectionFrameHovered.value = false;
  selectionButtonHovered.value = false;
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

  // Already marking photos for the action bar: the click joins that, so a long run of
  // photos does not have to be hit circle by circle.
  if (isCheckedSelectionMode.value) {
    photo.checked = !photo.checked;
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

      // Mirror the click: toggles the board selection for quick multi-selection gestures.
      if (isCheckedSelectionMode.value) {
        photo.checked = !photo.checked;
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

// The photo.src that photo.image currently represents, keyed by photo id. A
// cache-backed image has an internal .src of blob:… , so it can't be compared
// against photo.src directly to tell "already loaded" from "needs reload".
const _loadedImageSrc = new Map();

// Object URLs minted from cached blobs, keyed by photo id. Konva redraws the raw
// HTMLImageElement on every batchDraw, and a browser under memory pressure can drop
// the decoded bitmap and need the source again — so the URL is kept alive as long as
// photo.image points at it and revoked only when the image is replaced or the view
// unmounts. Network-loaded images have no entry here (nothing to revoke).
const _imageObjectUrls = new Map();

const _releaseObjectUrl = (photoId) => {
  const url = _imageObjectUrls.get(photoId);
  if (url) {
    URL.revokeObjectURL(url);
    _imageObjectUrls.delete(photoId);
  }
};

const _forgetImage = (photoId) => {
  _pendingImageLoads.delete(photoId);
  _loadedImageSrc.delete(photoId);
  _releaseObjectUrl(photoId);
};

// Draw the decoded image onto the stage.
const _attachCanvasImage = (photo, img, src) => {
  _pendingImageLoads.delete(photo.id);
  _loadedImageSrc.set(photo.id, src);
  photo.imageBroken = false;
  // markRaw prevents Vue from wrapping the HTMLImageElement in a reactive Proxy.
  // Passing a Proxy to the native drawImage() API causes browsers to misidentify
  // it as a canvas element with 0×0 dimensions, throwing InvalidStateError.
  photo.image = markRaw(img);
  const stage = stageRef.value?.getStage();
  if (stage) stage.batchDraw();
};

const _markCanvasImageBroken = (photo, srcForLog) => {
  _forgetImage(photo.id);
  console.warn(`Failed to load image: ${srcForLog}`);
  photo.imageBroken = true;
  // Leave photo.image null so Konva never draws a broken element.
  const stage = stageRef.value?.getStage();
  if (stage) stage.batchDraw();
};

// Network path: load straight from R2 (thumbnailUrl). On success, hand the id/URL to
// the background cache so the NEXT visit to this canvas resolves it from IndexedDB.
// Never in the playground: its srcs are local blob: URLs for throwaway photos.
const _loadCanvasImageFromNetwork = (photo) => {
  const src = photo.src;
  const img = new Image();
  img.onerror = () => _markCanvasImageBroken(photo, src);
  img.onload = () => {
    _attachCanvasImage(photo, img, src);
    if (!isPlayground.value && !src.startsWith("blob:")) {
      scheduleBackgroundCache(photo.id, src);
    }
  };
  img.src = src;
};

// Cache path, in bulk: decode every stored blob in parallel, then attach them all
// in a single pass + one batchDraw, so a fully-cached board paints in one frame
// instead of trickling in image by image. A blob that fails to decode falls back
// to the (progressive) network path rather than showing the photo as broken.
const _loadCanvasImagesFromBlobs = async (entries) => {
  const decoded = await Promise.all(
    entries.map(async ({ photo, blob }) => {
      const src = photo.src;
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.src = objectUrl;
      try {
        await img.decode();
        return { photo, src, img, objectUrl, ok: true };
      } catch {
        URL.revokeObjectURL(objectUrl);
        return { photo, ok: false };
      }
    }),
  );

  let painted = false;
  for (const r of decoded) {
    // The store may have moved on (canvas switch) while decoding.
    if (_pendingImageLoads.get(r.photo.id) !== r.photo.src) {
      if (r.objectUrl) URL.revokeObjectURL(r.objectUrl);
      continue;
    }
    if (!r.ok) {
      _loadCanvasImageFromNetwork(r.photo);
      continue;
    }
    _releaseObjectUrl(r.photo.id);
    _imageObjectUrls.set(r.photo.id, r.objectUrl);
    _pendingImageLoads.delete(r.photo.id);
    _loadedImageSrc.set(r.photo.id, r.src);
    r.photo.imageBroken = false;
    r.photo.image = markRaw(r.img);
    painted = true;
  }

  if (painted) {
    const stage = stageRef.value?.getStage();
    if (stage) stage.batchDraw();
  }
};

watch(
  () => photos.value.map((p) => p.src),
  async () => {
    // Purge stale pending-load entries and object URLs for photos no longer in the
    // store (e.g. after a canvas switch the array is fully replaced; without this,
    // photos that reappear with the same ID would have their load skipped while
    // photo.image stays null).
    const currentIds = new Set(photos.value.map((p) => p.id));
    for (const id of [..._pendingImageLoads.keys()]) {
      if (!currentIds.has(id)) _forgetImage(id);
    }
    for (const id of [..._loadedImageSrc.keys()]) {
      if (!currentIds.has(id)) _forgetImage(id);
    }

    const toLoad = [];

    photos.value.forEach((photo) => {
      // Already loaded and valid — nothing to do
      if (
        photo.image &&
        _loadedImageSrc.get(photo.id) === photo.src &&
        !photo.imageBroken
      ) {
        // Check if existing image became invalid (deleted from server after initial load)
        if (photo.image.complete && photo.image.naturalWidth === 0) {
          console.warn(`Image became invalid: ${photo.src}`);
          photo.imageBroken = true;
          photo.image.onload = null;
          photo.image.onerror = null;
          photo.image = null;
          _forgetImage(photo.id);
          const stage = stageRef.value?.getStage();
          if (stage) stage.batchDraw();
        }
        return;
      }

      // Already loading this exact src — skip
      if (_pendingImageLoads.get(photo.id) === photo.src) return;

      // Clear previous image if src changed
      if (photo.image) {
        photo.image.onload = null;
        photo.image.onerror = null;
        photo.image = null;
        photo.imageBroken = false;
      }
      _loadedImageSrc.delete(photo.id);
      _releaseObjectUrl(photo.id);

      // Claim the slot synchronously so a re-entrant run (during the await below)
      // skips this photo instead of starting a second load.
      _pendingImageLoads.set(photo.id, photo.src);
      toLoad.push(photo);
    });

    if (toLoad.length === 0) return;

    // One bulk IndexedDB read for the whole batch. Missing or unavailable cache →
    // every photo falls through to the network path. Skipped in the playground,
    // which never writes to the shared cache.
    let cachedBlobs = new Map();
    if (!isPlayground.value) {
      try {
        cachedBlobs = await bulkLoadFromCache(toLoad.map((p) => p.id));
      } catch {
        cachedBlobs = new Map();
      }
    }

    // Network misses start loading immediately and paint as they arrive; cache
    // hits are decoded together and painted in one frame.
    const cacheHits = [];
    toLoad.forEach((photo) => {
      // The store may have moved on (canvas switch) while we awaited.
      if (_pendingImageLoads.get(photo.id) !== photo.src) return;
      const blob = cachedBlobs.get(photo.id);
      if (blob) cacheHits.push({ photo, blob });
      else _loadCanvasImageFromNetwork(photo);
    });
    if (cacheHits.length) _loadCanvasImagesFromBlobs(cacheHits);
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
        _forgetImage(photo.id);
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
  isInitialCanvasLoad.value = true;
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
  } finally {
    isInitialCanvasLoad.value = false;
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

  // Revoke any object URLs minted from cached blobs.
  for (const id of [..._imageObjectUrls.keys()]) {
    _releaseObjectUrl(id);
  }
  _pendingImageLoads.clear();
  _loadedImageSrc.clear();

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
/* The chat docks with a slide rather than a jump cut: a negative right margin parks the
   panel off the board's right edge (the container clips it) and the board, being the flex
   item that grows, widens back into the space as it retracts. Margin rather than width so
   the panel's own contents never reflow mid-animation.

   Enter/leave only — dragging the resize edge has to stay 1:1 with the pointer. */
.ccp-slide-enter-active,
.ccp-slide-leave-active {
  transition: margin-right 280ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ccp-slide-enter-from,
.ccp-slide-leave-to {
  margin-right: calc(-1 * var(--chat-panel-width, 460px));
}

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

.canvas-loader-overlay {
  position: absolute;
  inset: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.canvas-loader-fade-enter-active,
.canvas-loader-fade-leave-active {
  transition: opacity 0.2s ease;
}

.canvas-loader-fade-enter-from,
.canvas-loader-fade-leave-to {
  opacity: 0;
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
  background-color: #a0a0a0 !important;
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
