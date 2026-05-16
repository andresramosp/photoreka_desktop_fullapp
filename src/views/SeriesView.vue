<template>
  <div class="series-view view-container">
    <!-- Public View: Loading State -->
    <div v-if="isPublicView && isLoading" class="public-loading-state">
      <n-spin size="large">
        <div class="loading-text">Loading series...</div>
      </n-spin>
    </div>

    <!-- Public View: Error State -->
    <div v-else-if="isPublicView && publicLoadError" class="public-error-state">
      <div class="error-content">
        <n-icon size="64" color="#ef4444">
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            />
          </svg>
        </n-icon>
        <h2 class="error-title">Series not found</h2>
        <p class="error-description">
          The series you're looking for doesn't exist or is not available.
        </p>
        <n-button type="primary" @click="router.push({ name: 'landing' })">
          Go to Home
        </n-button>
      </div>
    </div>

    <!-- Public View: Fullscreen only (minimal UI, fullscreen opens automatically) -->
    <div v-else-if="isPublicView && viewingSeries" class="public-series-view">
      <!-- Minimal background while fullscreen is open -->
      <div class="public-background">
        <h1 class="public-series-title">
          {{ viewingSeries.name || viewingSeries.title }}
        </h1>
        <p class="public-series-meta">
          {{ (viewingSeries.photos || []).length }} photos
        </p>
      </div>
    </div>

    <!-- Series Detail View (when viewing a specific series) -->
    <div v-else-if="showSeriesView && viewingSeries" class="series-detail-view">
      <!-- Series Header -->
      <div class="detail-header">
        <div class="detail-header-content">
          <div class="detail-header-actions">
            <n-button text @click="backToSeries" class="detail-back-button">
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
                    />
                  </svg>
                </n-icon>
              </template>
              {{ backLabel }}
            </n-button>
            <div style="display: flex; gap: 12px">
              <n-button
                v-if="!isPublicView"
                :disabled="!canUndo || isSaving"
                @click="undoLastChange"
                title="Undo last removal"
              >
                <template #icon>
                  <n-icon>
                    <ArrowUndoOutline />
                  </n-icon>
                </template>
                Undo
              </n-button>
              <n-button
                v-if="!isPublicView"
                :disabled="!hasChanges || isSaving"
                @click="discardChanges"
              >
                <template #icon>
                  <n-icon>
                    <CloseOutline />
                  </n-icon>
                </template>
                Discard
              </n-button>
              <n-button
                v-if="!isPublicView"
                :type="hasChanges ? 'primary' : 'default'"
                ghost
                :disabled="!hasChanges || isSaving"
                :loading="isSaving"
                @click="saveChanges"
              >
                <template #icon>
                  <n-icon>
                    <SaveOutline />
                  </n-icon>
                </template>
                Save
              </n-button>
              <n-button
                type="primary"
                @click="openFullscreenViewer"
                class="play-series-button"
                :disabled="
                  !(editablePhotos && editablePhotos.length > 0) || isSaving
                "
              >
                <template #icon>
                  <n-icon>
                    <PlayOutline />
                  </n-icon>
                </template>
                Play
              </n-button>
              <n-button
                type="primary"
                ghost
                @click="showAddPhotosDialog"
                class="add-photos-button"
              >
                <template #icon>
                  <n-icon>
                    <AddOutline />
                  </n-icon>
                </template>
                Add Photos
              </n-button>
              <n-button
                type="error"
                ghost
                @click="showDeleteConfirmation"
                class="detail-delete-button"
              >
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                      />
                    </svg>
                  </n-icon>
                </template>
                Delete Series
              </n-button>
            </div>
          </div>
          <div class="series-title-row">
            <div v-if="!editingTitle" class="title-display">
              <h1 class="detail-title">
                {{ viewingSeries.name || viewingSeries.title }}
              </h1>
              <n-button
                v-if="!isPublicView"
                text
                class="edit-button"
                @click="startEditTitle"
                title="Edit series name"
              >
                <template #icon>
                  <n-icon size="20">
                    <CreateOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
            <div v-else class="title-edit">
              <n-input
                v-model:value="editedTitle"
                placeholder="Enter series name..."
                maxlength="100"
              />
              <n-button
                text
                class="action-button"
                @click="saveTitle"
                :loading="isSavingTitle"
              >
                <template #icon>
                  <n-icon size="20">
                    <CheckmarkOutline />
                  </n-icon>
                </template>
              </n-button>
              <n-button text class="action-button" @click="cancelEditTitle">
                <template #icon>
                  <n-icon size="20">
                    <CloseOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
            <n-button
              text
              class="share-button"
              @click="copySeriesLink"
              title="Copy link to clipboard"
            >
              <template #icon>
                <n-icon size="24">
                  <ShareSocialOutline />
                </n-icon>
              </template>
            </n-button>
          </div>
          <div v-if="!editingDescription" class="description-display">
            <p class="detail-description" v-if="viewingSeries.description">
              {{ viewingSeries.description }}
            </p>
            <n-button
              v-if="!isPublicView"
              text
              class="edit-button"
              @click="startEditDescription"
              title="Edit series description"
            >
              <template #icon>
                <n-icon size="20">
                  <CreateOutline />
                </n-icon>
              </template>
            </n-button>
          </div>
          <div v-else class="description-edit">
            <n-input
              v-model:value="editedDescription"
              placeholder="Enter series description (optional)..."
              maxlength="500"
            />
            <div class="description-actions">
              <n-button
                text
                class="action-button"
                @click="saveDescription"
                :loading="isSavingDescription"
              >
                <template #icon>
                  <n-icon size="20">
                    <CheckmarkOutline />
                  </n-icon>
                </template>
              </n-button>
              <n-button
                text
                class="action-button"
                @click="cancelEditDescription"
              >
                <template #icon>
                  <n-icon size="20">
                    <CloseOutline />
                  </n-icon>
                </template>
              </n-button>
            </div>
          </div>
          <!-- <p class="detail-meta">
            {{ (viewingSeries.photos || []).length }} photos • Updated
            {{ formatDate(viewingSeries.updatedAt) }}
          </p> -->
        </div>
      </div>

      <!-- Series Photos Strip -->
      <div class="series-photos">
        <SeriesPhotoStrip
          :photos="editablePhotos"
          :series-id="route.params.id"
          :selected-photo-ids="localSelectedPhotoIds"
          :suggested-photos-info="suggestedPhotosInfo"
          :refreshing-photo-id="refreshingPhotoId"
          @add-photos="showAddPhotosDialog"
          @add-photos-at="handleAddPhotosAt"
          @suggest-photo-at="handleSuggestPhotoAt"
          @refresh-suggestion="handleRefreshSuggestion"
          @remove-photo="handleRemovePhoto"
          @reorder="handleReorder"
          @move-photo="handleMovePhoto"
          @photos-updated="handlePhotosUpdated"
          @select-photo="togglePhotoSelection"
          @show-info="handleShowPhotoInfo"
        />
      </div>
    </div>

    <!-- Set View (when browsing a series set) -->
    <div v-else-if="showSetView && viewingSet" class="set-view">
      <div class="set-header">
        <div class="breadcrumb">
          <n-button
            text
            class="breadcrumb-item"
            :class="{ 'breadcrumb-drop-target': breadcrumbDragOver === 'root' }"
            @click="backToSeriesRoot"
            @dragover.prevent="onBreadcrumbDragOver('root', $event)"
            @dragleave="onBreadcrumbDragLeave('root', $event)"
            @drop.prevent="onBreadcrumbDrop(null, $event)"
          >
            <template #icon>
              <n-icon><GridOutline /></n-icon>
            </template>
            Series
          </n-button>
          <template v-for="(crumb, i) in breadcrumb" :key="crumb.id">
            <n-icon size="14" class="breadcrumb-sep">
              <ChevronForwardOutline />
            </n-icon>
            <n-button
              text
              class="breadcrumb-item"
              :class="{
                'breadcrumb-current': i === breadcrumb.length - 1,
                'breadcrumb-drop-target': breadcrumbDragOver === crumb.id,
              }"
              @click="
                i < breadcrumb.length - 1 ? navigateToSet(crumb.id) : null
              "
              @dragover.prevent="onBreadcrumbDragOver(crumb.id, $event)"
              @dragleave="onBreadcrumbDragLeave(crumb.id, $event)"
              @drop.prevent="onBreadcrumbDrop(crumb.id, $event)"
            >
              {{ crumb.name }}
            </n-button>
          </template>
        </div>

        <div class="set-title-row">
          <div v-if="!editingSetTitle" class="title-display">
            <h1 class="detail-title">{{ viewingSet.name }}</h1>
            <n-button
              text
              class="edit-button"
              @click="startEditSetTitle"
              title="Edit set name"
            >
              <template #icon>
                <n-icon size="20"><CreateOutline /></n-icon>
              </template>
            </n-button>
          </div>
          <div v-else class="title-edit">
            <n-input
              v-model:value="editedSetTitle"
              placeholder="Enter set name..."
              maxlength="100"
            />
            <n-button
              text
              class="action-button"
              @click="saveSetTitle"
              :loading="isSavingSetTitle"
            >
              <template #icon>
                <n-icon size="20"><CheckmarkOutline /></n-icon>
              </template>
            </n-button>
            <n-button text class="action-button" @click="cancelEditSetTitle">
              <template #icon>
                <n-icon size="20"><CloseOutline /></n-icon>
              </template>
            </n-button>
          </div>

          <div class="sort-controls">
            <n-select
              v-model:value="sortType"
              :options="sortOptions"
              size="small"
              style="width: 120px"
              clearable
              placeholder="Sort"
              :filterable="false"
            />
            <n-button
              v-if="sortActive"
              text
              size="tiny"
              @click="toggleSortOrder"
              class="sort-order-icon"
              :title="
                sortOrder === 'desc'
                  ? 'Descending (click for Ascending)'
                  : 'Ascending (click for Descending)'
              "
            >
              <n-icon size="18">
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px">
                  <path
                    v-if="sortOrder === 'desc'"
                    d="M19,17H22L18,21L14,17H17V3H19V17M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                    fill="currentColor"
                  />
                  <path
                    v-else
                    d="M19,7H22L18,3L14,7H17V21H19V7M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                    fill="currentColor"
                  />
                </svg>
              </n-icon>
            </n-button>
          </div>

          <div class="set-actions">
            <n-button
              v-if="seriesSelection.isSelectionMode.value"
              type="error"
              ghost
              @click="showBulkDeleteConfirmation"
            >
              Delete Selected ({{ seriesSelection.selectedIds.value.length }})
            </n-button>
            <n-button type="primary" ghost @click="showCreateSeriesInSet">
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
              New Series
            </n-button>
            <n-button @click="showCreateSubsetDialog">
              <template #icon>
                <n-icon><FolderOutline /></n-icon>
              </template>
              New Set
            </n-button>
            <n-button type="error" ghost @click="showDeleteSetConfirmation">
              Delete Set
            </n-button>
          </div>
        </div>

        <p v-if="viewingSet.description" class="set-description">
          {{ viewingSet.description }}
        </p>
      </div>

      <div v-if="setIsEmpty" class="empty-series-state">
        <div class="empty-series-content">
          <n-icon size="64" class="empty-series-icon">
            <FolderOpenOutline />
          </n-icon>
          <h3 class="empty-series-title">This set is empty</h3>
          <p class="empty-series-description">
            Add sets or series to organize your sequences.
          </p>
          <div class="empty-actions">
            <n-button type="primary" @click="showCreateSeriesInSet">
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
              New Series
            </n-button>
            <n-button @click="showCreateSubsetDialog">
              <template #icon>
                <n-icon><FolderOutline /></n-icon>
              </template>
              New Set
            </n-button>
          </div>
        </div>
      </div>

      <div v-else class="card-grid">
        <CollectionSetCard
          v-for="childSet in currentChildSets"
          :key="`set-${childSet.id}`"
          :item="childSet"
          item-type="series"
          content-label="series"
          @click="navigateToSet(childSet.id)"
          @drop-items="onDropSeriesIntoSet"
        />

        <CollectionCard
          v-for="series in currentSetSeries"
          :key="`series-${series.id}`"
          :item="series"
          type="series"
          drag-type="series"
          item-label="series"
          :is-selected="seriesSelection.isSelected(series.id)"
          :is-selection-mode="seriesSelection.isSelectionMode.value"
          :selected-ids="seriesSelection.selectedIds.value"
          @click="(_, ev) => onSeriesCardClick(series, ev, currentSetSeries)"
          @select-toggle="
            () =>
              seriesSelection.toggleSelectItem(
                series.id,
                currentSetSeries.map((s) => s.id),
              )
          "
        />
      </div>
    </div>

    <!-- Series Grid View (default view) -->
    <div v-else>
      <!-- Header Section -->

      <!-- Series Grid -->
      <div v-if="isLoading" class="loading-state">
        <n-spin size="large">
          <div class="loading-text">Loading your series...</div>
        </n-spin>
      </div>

      <div v-if="!isLoading && hasRootContent" class="root-toolbar">
        <n-button @click="showCreateSetDialog">
          <template #icon>
            <n-icon><FolderOutline /></n-icon>
          </template>
          New Set
        </n-button>
        <div class="sort-controls">
          <n-button
            v-if="seriesSelection.isSelectionMode.value"
            type="error"
            ghost
            @click="showBulkDeleteConfirmation"
          >
            Delete Selected ({{ seriesSelection.selectedIds.value.length }})
          </n-button>
          <n-select
            v-model:value="sortType"
            :options="sortOptions"
            style="width: 120px"
            clearable
            placeholder="Sort"
            :filterable="false"
          />
          <n-button
            v-if="sortActive"
            text
            size="tiny"
            @click="toggleSortOrder"
            class="sort-order-icon"
            :title="
              sortOrder === 'desc'
                ? 'Descending (click for Ascending)'
                : 'Ascending (click for Descending)'
            "
          >
            <n-icon size="18">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px">
                <path
                  v-if="sortOrder === 'desc'"
                  d="M19,17H22L18,21L14,17H17V3H19V17M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
                <path
                  v-else
                  d="M19,7H22L18,3L14,7H17V21H19V7M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
              </svg>
            </n-icon>
          </n-button>
        </div>
      </div>

      <div v-if="!isLoading" class="card-grid">
        <!-- Create New Series Card (only show when there are existing series) -->
        <CreateCard
          v-if="hasRootContent"
          title="Create New Series"
          subtitle="Start your photo sequence"
          @click="showCreateDialog"
        />

        <CollectionSetCard
          v-for="set in rootSets"
          :key="`set-${set.id}`"
          :item="set"
          item-type="series"
          content-label="series"
          @click="navigateToSet(set.id)"
          @drop-items="onDropSeriesIntoSet"
        />

        <!-- Existing Series -->
        <CollectionCard
          v-for="series in rootSeries"
          :key="series.id"
          :item="series"
          type="series"
          drag-type="series"
          item-label="series"
          :is-selected="seriesSelection.isSelected(series.id)"
          :is-selection-mode="seriesSelection.isSelectionMode.value"
          :selected-ids="seriesSelection.selectedIds.value"
          @click="(_, ev) => onSeriesCardClick(series, ev, rootSeries)"
          @select-toggle="
            () =>
              seriesSelection.toggleSelectItem(
                series.id,
                rootSeries.map((s) => s.id),
              )
          "
        />

        <!-- Empty State (when no series exist) -->
        <div v-if="!hasRootContent" class="empty-series-state">
          <div class="empty-series-content">
            <n-icon size="64" class="empty-series-icon">
              <ListOutline />
            </n-icon>
            <h3 class="empty-series-title">No series yet</h3>
            <p class="empty-series-description">
              Create your first series to start arranging your photos in a
              sequential narrative.
            </p>
            <div class="empty-actions">
              <n-button
                type="primary"
                @click="showCreateDialog"
                class="create-series-btn"
              >
                <template #icon>
                  <n-icon><AddOutline /></n-icon>
                </template>
                Create Series
              </n-button>
              <n-button @click="showCreateSetDialog" class="create-series-btn">
                <template #icon>
                  <n-icon><FolderOutline /></n-icon>
                </template>
                Create Set
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Series Dialog -->
    <n-modal
      v-model:show="createDialogVisible"
      preset="dialog"
      title="Create New Series"
      positive-text="Create Series"
      negative-text="Cancel"
      @positive-click="createSeries"
      @negative-click="createDialogVisible = false"
    >
      <div class="create-form">
        <n-form ref="formRef" :model="formData" :rules="formRules">
          <n-form-item label="Name" path="title">
            <n-input
              v-model:value="formData.title"
              placeholder="Enter series name..."
              maxlength="100"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="formData.description"
              placeholder="Add a description (optional)..."
              :rows="3"
              maxlength="500"
              show-count
            />
          </n-form-item>
        </n-form>
      </div>
    </n-modal>

    <!-- Create Set Dialog -->
    <n-modal
      v-model:show="createSetDialogVisible"
      preset="dialog"
      title="Create New Set"
      positive-text="Create Set"
      negative-text="Cancel"
      @positive-click="createSeriesSet"
      @negative-click="createSetDialogVisible = false"
    >
      <div class="create-form">
        <n-form ref="setFormRef" :model="setFormData" :rules="setFormRules">
          <n-form-item label="Name" path="name">
            <n-input
              v-model:value="setFormData.name"
              placeholder="Enter set name..."
              maxlength="100"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="setFormData.description"
              placeholder="Add a description (optional)..."
              :rows="3"
              maxlength="500"
              show-count
            />
          </n-form-item>
        </n-form>
      </div>
    </n-modal>

    <!-- Photos Selection Dialog -->
    <PhotosDialog
      v-model="photosDialogVisible"
      :is-trash="false"
      :title="`Add Photos to ${
        viewingSeries?.name || viewingSeries?.title || 'Series'
      }`"
      :displayLightboxTab="false"
      :displaySearch="true"
      @add-photos="onPhotosSelected"
    />

    <!-- Delete Series Confirmation Dialog -->
    <n-modal
      v-model:show="deleteConfirmationVisible"
      preset="dialog"
      title="Delete Series"
      positive-text="Delete Series"
      negative-text="Cancel"
      type="error"
      :loading="seriesStore.isDeleting"
      @positive-click="deleteSeries"
      @negative-click="deleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the series
          <strong>"{{ viewingSeries?.name || viewingSeries?.title }}"</strong>?
        </p>
        <p class="delete-warning">
          <n-icon size="16" color="#f5a623" style="margin-right: 8px">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
              />
            </svg>
          </n-icon>
          Don't worry - your photos will not be deleted, only the series will be
          removed.
        </p>
      </div>
    </n-modal>

    <!-- Bulk Delete Series Confirmation Dialog -->
    <n-modal
      v-model:show="bulkDeleteConfirmationVisible"
      preset="dialog"
      title="Delete Selected Series"
      positive-text="Delete Selected"
      negative-text="Cancel"
      type="error"
      :loading="seriesStore.isDeleting"
      @positive-click="bulkDeleteSeries"
      @negative-click="bulkDeleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete
          <strong>{{ seriesSelection.selectedIds.value.length }}</strong>
          selected series?
        </p>
        <p class="delete-warning">
          Don't worry - your photos will not be deleted, only the series will be
          removed.
        </p>
      </div>
    </n-modal>

    <!-- Delete Set Confirmation Dialog -->
    <n-modal
      v-model:show="deleteSetConfirmationVisible"
      preset="dialog"
      title="Delete Set"
      positive-text="Delete Set"
      negative-text="Cancel"
      type="error"
      @positive-click="deleteSeriesSet"
      @negative-click="deleteSetConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the set
          <strong>"{{ viewingSet?.name }}"</strong>?
        </p>
        <p class="delete-warning">
          Child sets and series will be moved to the parent set.
        </p>
      </div>
    </n-modal>

    <!-- Series Fullscreen Viewer -->
    <SeriesFullscreenViewer
      v-model="fullscreenViewerVisible"
      :photos="isPublicView ? viewingSeries?.photos || [] : editablePhotos"
      :start-index="0"
      :is-public-view="isPublicView"
    />

    <!-- Floating Action Bar (only show in series detail view) -->
    <FloatingActionBar
      v-if="showSeriesView && !isPublicView"
      :selected-ids="localSelectedPhotoIds"
      :show-delete="false"
      :show-add-to-collection="false"
      :show-move-to-tool="true"
      :show-send-to-chat="true"
      :is-downloading="isDownloading"
      @clear-selection="localClearAllSelections"
      @download="handleDownloadMultiple"
      @delete="handleRemoveSelectedFromSeries"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="handleMoveToTool"
      @send-to-chat="handleSendToChat"
    />

    <!-- Photo Tool Selector Modal -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="localSelectedPhotoIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="photoInfoDialogVisible"
      :selected-photo="selectedPhotoForInfo"
      @change-photo="selectedPhotoForInfo = $event"
    />

    <!-- Unsaved Changes Dialog -->
    <n-modal
      v-model:show="showUnsavedModal"
      preset="dialog"
      title="Unsaved Changes"
      positive-text="Save & Leave"
      negative-text="Leave Without Saving"
      type="warning"
      :mask-closable="false"
      style="width: 524px"
      @positive-click="handleSaveAndLeave"
      @negative-click="handleLeaveWithoutSaving"
      @close="handleStayOnPage"
    >
      <div class="unsaved-changes-confirmation">
        <p>You have unsaved changes in this series.</p>
        <p class="unsaved-warning">
          <n-icon size="16" style="margin-right: 8px; flex-shrink: 0">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
              />
            </svg>
          </n-icon>
          If you leave now, your changes to the photo order will be lost.
        </p>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";

defineOptions({
  name: "SeriesView",
});

import {
  NButton,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSpin,
  NSelect,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  ListOutline,
  PlayOutline,
  ShareSocialOutline,
  CreateOutline,
  CheckmarkOutline,
  CloseOutline,
  SaveOutline,
  ArrowUndoOutline,
  FolderOutline,
  FolderOpenOutline,
  GridOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";
import PhotosDialog from "@/components/PhotosDialog.vue";
import CollectionCard from "@/components/CollectionCard.vue";
import CollectionSetCard from "@/components/CollectionSetCard.vue";
import CreateCard from "@/components/photos-grid/CreateCard.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import { useUserStore } from "@/stores/userStore";
import SeriesPhotoStrip from "@/components/SeriesPhotoStrip.vue";
import SeriesFullscreenViewer from "@/components/SeriesFullscreenViewer.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useSeriesStore } from "@/stores/series.js";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection";
import { useCardSelection } from "@/composables/useCardSelection";
import { usePhotoDownload } from "@/composables/usePhotoDownload";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection";
import { usePhotoQueryParams } from "@/composables/usePhotoQueryParams.js";
import { api } from "@/utils/axios";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const seriesStore = useSeriesStore();
const userStore = useUserStore();

// Local photo selection
const {
  selectedPhotosRecord: localSelectedPhotosRecord,
  selectedPhotoIds: localSelectedPhotoIds,
  togglePhotoSelection: localTogglePhotoSelection,
  clearAllSelections: localClearAllSelections,
} = useLocalPhotoSelection();

const seriesSelection = useCardSelection();

// Photo download utilities
const { downloadPhotosZip, isDownloading } = usePhotoDownload();

// Photo query params handling (e.g., ?source=lightroom&ids=123,456)
const { getPhotoIdsFromQuery } = usePhotoQueryParams();

// Photo tool selection utilities
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

// State
const createDialogVisible = ref(false);
const createSetDialogVisible = ref(false);
const photosDialogVisible = ref(false);
const showCollectionModal = ref(false);
const deleteConfirmationVisible = ref(false);
const deleteSetConfirmationVisible = ref(false);
const bulkDeleteConfirmationVisible = ref(false);
const createSetParentId = ref(null);

// Unsaved changes navigation guard state
const showUnsavedModal = ref(false);
let pendingNavigation = null;
const fullscreenViewerVisible = ref(false);
const photoInfoDialogVisible = ref(false);
const selectedPhotoForInfo = ref(null);
const formRef = ref(null);
const setFormRef = ref(null);
const viewingSeries = ref(null); // Series being viewed
const viewingSet = ref(null);
const showSeriesView = ref(false); // Whether to show series view or grid view
const showSetView = ref(false);
const isPublicView = ref(false); // Whether this is a public anonymous view
const publicLoadError = ref(false); // Whether there was an error loading the public series

// Edit states for title and description
const editingTitle = ref(false);
const editingDescription = ref(false);
const editedTitle = ref("");
const editedDescription = ref("");
const isSavingTitle = ref(false);
const isSavingDescription = ref(false);

// Edit states for set
const editingSetTitle = ref(false);
const editedSetTitle = ref("");
const isSavingSetTitle = ref(false);

// When user opens a “hole” between photos, we store the target insert position here.
// This is the index in the ordered photos array where the new photo(s) should be inserted.
const pendingInsertIndex = ref(null);

// Track discarded photos by gap context (neighboring photos) to avoid re-suggesting them
// Map: "leftPhotoId-rightPhotoId" -> Set of discarded photoIds
const discardedPhotosByContext = ref(new Map());

// Track recently suggested photos with their context to identify them when removed
// Map: photoId -> { insertIndex, leftId, rightId, timestamp }
const recentlySuggestedPhotos = ref(new Map());

// Track photo being refreshed to show loading state
const refreshingPhotoId = ref(null);

// ---- Local editable state (deferred save pattern) ----
// The user edits this locally; nothing is persisted until "Save" is pressed.
const editablePhotos = ref([]); // full photo objects, ordered
const originalPhotos = ref([]); // snapshot from server for discard
const originalPhotoIds = ref([]); // id order snapshot for change detection
const removedPhotosHistory = ref([]); // stack of { photo, index } for Undo
const currentEditingSeriesId = ref(null); // track which series is currently loaded editable
const isSaving = ref(false);

const hasChanges = computed(() => {
  const currentIds = editablePhotos.value.map((p) => p.id);
  if (currentIds.length !== originalPhotoIds.value.length) return true;
  return currentIds.some((id, i) => id !== originalPhotoIds.value[i]);
});

const canUndo = computed(() => removedPhotosHistory.value.length > 0);

// Initialize / reset local state from the loaded series
const initEditableState = (series) => {
  const photos = Array.isArray(series?.photos) ? series.photos : [];
  editablePhotos.value = [...photos];
  originalPhotos.value = [...photos];
  originalPhotoIds.value = photos.map((p) => p.id);
  removedPhotosHistory.value = [];
  currentEditingSeriesId.value = series?.id ?? null;
};

// Form data
const formData = ref({
  title: "",
  description: "",
});
const setFormData = ref({ name: "", description: "" });

const formRules = {
  title: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};
const setFormRules = {
  name: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};

// Computed para saber si se puede mostrar la grid de series
const isLoading = computed(() => {
  // For public view, only check seriesStore loading
  if (isPublicView.value) {
    return seriesStore.isLoading;
  }
  return (
    seriesStore.isLoading ||
    photosStore.isLoading ||
    !Array.isArray(photosStore.allPhotos) ||
    photosStore.allPhotos.length === 0
  );
});

// Computed properties for store data
const allSeries = computed(() => seriesStore.allSeries);

// Sorting
const sortType = ref(null); // null | 'name' | 'date'
const sortOrder = ref("desc"); // 'asc' | 'desc'
const sortActive = computed(() => sortType.value !== null);

const sortOptions = [
  { label: "Name", value: "name" },
  { label: "Date", value: "date" },
];

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
};

const _sortList = (list, nameKey) => {
  if (!list || list.length === 0) return list;
  if (!sortType.value) return list;
  return [...list].sort((a, b) => {
    let va, vb;
    if (sortType.value === "name") {
      va = (a[nameKey] || a.name || a.title || "").toLowerCase();
      vb = (b[nameKey] || b.name || b.title || "").toLowerCase();
    } else if (sortType.value === "date") {
      va = new Date(a.createdAt || 0).getTime();
      vb = new Date(b.createdAt || 0).getTime();
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortOrder.value === "asc" ? cmp : -cmp;
  });
};

const rootSeries = computed(() => _sortList(seriesStore.rootSeries, "name"));
const rootSets = computed(() => _sortList(seriesStore.rootSets, "name"));
const hasRootContent = computed(
  () => seriesStore.rootSeries.length > 0 || seriesStore.rootSets.length > 0,
);
const currentChildSets = computed(() =>
  _sortList(
    viewingSet.value ? seriesStore.childSetsOf(viewingSet.value.id) : [],
    "name",
  ),
);
const currentSetSeries = computed(() =>
  _sortList(
    viewingSet.value ? seriesStore.seriesInSet(viewingSet.value.id) : [],
    "name",
  ),
);
const setIsEmpty = computed(
  () =>
    currentChildSets.value.length === 0 && currentSetSeries.value.length === 0,
);
const breadcrumb = computed(() =>
  viewingSet.value ? seriesStore.getBreadcrumbFor(viewingSet.value.id) : [],
);
const backLabel = computed(() => {
  if (viewingSeries.value?.setId) {
    const set = seriesStore.getSetById(viewingSeries.value.setId);
    return set ? `Back to "${set.name}"` : "Back to Series";
  }
  return "Back to Series";
});

// Computed: Map of suggested photo IDs with their info for the current series
const suggestedPhotosInfo = computed(() => {
  const info = {};
  for (const [photoId, data] of recentlySuggestedPhotos.value.entries()) {
    info[photoId] = data;
  }
  return info;
});

const refreshSeries = async () => {
  await seriesStore.getOrFetch(true); // Force refresh
  updateViewingSeries();
};

// Helper: find a full photo object for a given id, preferring photosStore
const resolvePhotoById = (id) => {
  const fromStore = (photosStore.allPhotos || []).find((p) => p.id === id);
  if (fromStore) return { ...fromStore };
  const fromEditable = editablePhotos.value.find((p) => p.id === id);
  if (fromEditable) return { ...fromEditable };
  const fromOriginal = originalPhotos.value.find((p) => p.id === id);
  if (fromOriginal) return { ...fromOriginal };
  return null;
};

const showCreateDialog = () => {
  createSetParentId.value = null;
  formData.value = { title: "", description: "" };
  createDialogVisible.value = true;
};

const showCreateSeriesInSet = () => {
  createSetParentId.value = viewingSet.value?.id ?? null;
  formData.value = { title: "", description: "" };
  createDialogVisible.value = true;
};

const createSeries = async () => {
  try {
    await formRef.value?.validate();
    createDialogVisible.value = false;

    // Create empty series directly
    const seriesData = {
      title: formData.value.title,
      description: formData.value.description,
      photoIds: [], // Empty series
      setId: createSetParentId.value,
    };

    const newSeries = await seriesStore.createSeries(seriesData);

    message.success(`Series "${formData.value.title}" created successfully`);

    // Clear form
    formData.value = { title: "", description: "" };

    // Navigate directly to the newly created series
    router.push({
      name: "series-detail",
      params: { id: newSeries.id },
    });
  } catch (error) {
    console.error("Error creating series:", error);
  }
};

const showCreateSetDialog = () => {
  createSetParentId.value = null;
  setFormData.value = { name: "", description: "" };
  createSetDialogVisible.value = true;
};

const showCreateSubsetDialog = () => {
  createSetParentId.value = viewingSet.value?.id ?? null;
  setFormData.value = { name: "", description: "" };
  createSetDialogVisible.value = true;
};

const createSeriesSet = async () => {
  try {
    await setFormRef.value?.validate();
    createSetDialogVisible.value = false;
    await seriesStore.createSeriesSet({
      name: setFormData.value.name,
      description: setFormData.value.description,
      parentSetId: createSetParentId.value,
    });
    message.success(`Set "${setFormData.value.name}" created successfully`);
    setFormData.value = { name: "", description: "" };
  } catch (error) {
    console.error("Error creating series set:", error);
  }
};

const startEditSetTitle = () => {
  editedSetTitle.value = viewingSet.value?.name ?? "";
  editingSetTitle.value = true;
};

const saveSetTitle = async () => {
  if (!viewingSet.value || !editedSetTitle.value.trim()) {
    message.warning("Set name cannot be empty");
    return;
  }
  isSavingSetTitle.value = true;
  try {
    await seriesStore.updateSeriesSet(viewingSet.value.id, {
      name: editedSetTitle.value.trim(),
      description: viewingSet.value.description,
    });
    message.success("Set name updated");
    editingSetTitle.value = false;
    updateViewingSeries();
  } catch (error) {
    console.error("Error updating set name:", error);
  } finally {
    isSavingSetTitle.value = false;
  }
};

const cancelEditSetTitle = () => {
  editingSetTitle.value = false;
  editedSetTitle.value = "";
};

const showDeleteSetConfirmation = () => {
  deleteSetConfirmationVisible.value = true;
};

const deleteSeriesSet = async () => {
  if (!viewingSet.value) return;
  try {
    const parentId = viewingSet.value.parentSetId;
    const setName = viewingSet.value.name;
    await seriesStore.deleteSeriesSet(viewingSet.value.id);
    message.success(`Set "${setName}" deleted`);
    deleteSetConfirmationVisible.value = false;
    if (parentId) {
      router.push({ name: "series-set", params: { setId: parentId } });
    } else {
      router.push({ name: "series" });
    }
  } catch (error) {
    console.error("Error deleting series set:", error);
  }
};

const showAddPhotosDialog = () => {
  pendingInsertIndex.value = null;
  photosDialogVisible.value = true;
};

const handleAddPhotosAt = (insertIndex) => {
  pendingInsertIndex.value = insertIndex;
  photosDialogVisible.value = true;
};

// Suggest a photo: only fetches a suggestion from the search API (read-only)
// and inserts it into the LOCAL editable list. Not persisted until Save.
const handleSuggestPhotoAt = async (payload) => {
  if (!viewingSeries.value) return;

  const insertIndex =
    typeof payload === "number" ? payload : payload?.insertIndex;
  const criteria = typeof payload === "object" ? payload?.criteria : "story";
  const safeCriteria = criteria || "story";

  const explicitLeftId =
    typeof payload === "object" ? payload?.leftId : undefined;
  const explicitRightId =
    typeof payload === "object" ? payload?.rightId : undefined;

  const photos = editablePhotos.value;

  const left =
    explicitLeftId !== undefined
      ? { id: explicitLeftId }
      : insertIndex > 0
        ? photos[insertIndex - 1]
        : null;
  const right =
    explicitRightId !== undefined
      ? { id: explicitRightId }
      : insertIndex < photos.length
        ? photos[insertIndex]
        : null;

  const anchorIds = [left?.id, right?.id].filter(Boolean);

  if (anchorIds.length === 0) {
    message.warning("Add at least one neighboring photo first");
    return;
  }

  const contextKey = `${left?.id || "start"}-${right?.id || "end"}`;
  const discardedForThisGap =
    discardedPhotosByContext.value.get(contextKey) || new Set();

  // Exclude: photos already in the (editable) series and any discarded for this gap
  const currentPhotosIds = [
    ...photos.map((p) => p.id),
    ...Array.from(discardedForThisGap),
  ];

  try {
    const response = await api.post(`/api/search/byPhotos`, {
      anchorIds,
      currentPhotosIds,
      criteria: safeCriteria,
      opposite: false,
      inverted: false,
      resultLength: 1,
    });

    const backendPhotos = Array.isArray(response.data)
      ? response.data
      : [response.data];
    const suggested = backendPhotos[0];

    if (!suggested?.id) {
      message.error("No suggestion found");
      return;
    }

    // Track this suggestion with its context and criteria
    recentlySuggestedPhotos.value.set(suggested.id, {
      insertIndex,
      leftId: left?.id || null,
      rightId: right?.id || null,
      criteria: safeCriteria,
      timestamp: Date.now(),
    });

    // Insert LOCALLY only
    const newPhoto = resolvePhotoById(suggested.id) || { ...suggested };
    const safeIndex = Math.min(
      Math.max(Number(insertIndex) || 0, 0),
      editablePhotos.value.length,
    );
    const next = [...editablePhotos.value];
    next.splice(safeIndex, 0, newPhoto);
    editablePhotos.value = next;
  } catch (error) {
    console.error("Error getting suggestion:", error);
  }
};

const openFullscreenViewer = () => {
  if (editablePhotos.value?.length > 0) {
    fullscreenViewerVisible.value = true;
  }
};

// Photos picked in the dialog: add to LOCAL state only.
const onPhotosSelected = async (photoIds) => {
  if (!photoIds || photoIds.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }

  if (!(showSeriesView.value && viewingSeries.value)) return;

  // Filter out photos already in the editable list
  const existingIds = new Set(editablePhotos.value.map((p) => p.id));
  const uniqueIds = photoIds.filter((id) => !existingIds.has(id));

  if (uniqueIds.length === 0) {
    message.warning("All selected photos are already in the series");
    photosDialogVisible.value = false;
    pendingInsertIndex.value = null;
    return;
  }

  const resolved = uniqueIds.map((id) => resolvePhotoById(id)).filter(Boolean);

  if (resolved.length === 0) {
    message.error("Could not load selected photos");
    return;
  }

  const next = [...editablePhotos.value];
  if (pendingInsertIndex.value !== null) {
    const safeIndex = Math.min(
      Math.max(Number(pendingInsertIndex.value) || 0, 0),
      next.length,
    );
    next.splice(safeIndex, 0, ...resolved);
  } else {
    next.push(...resolved);
  }
  editablePhotos.value = next;

  message.success(
    `Added ${resolved.length} photo${resolved.length > 1 ? "s" : ""}. Remember to save.`,
  );
  photosDialogVisible.value = false;
  pendingInsertIndex.value = null;
};

// Refresh a suggestion: remove locally and ask for a new one (no backend mutation).
const handleRefreshSuggestion = async (photoId) => {
  if (!viewingSeries.value) return;

  const suggestionInfo = recentlySuggestedPhotos.value.get(photoId);
  if (!suggestionInfo) {
    message.warning("This photo was not suggested");
    return;
  }

  const contextKey = `${suggestionInfo.leftId || "start"}-${
    suggestionInfo.rightId || "end"
  }`;

  if (!discardedPhotosByContext.value.has(contextKey)) {
    discardedPhotosByContext.value.set(contextKey, new Set());
  }
  discardedPhotosByContext.value.get(contextKey).add(photoId);
  recentlySuggestedPhotos.value.delete(photoId);

  refreshingPhotoId.value = photoId;

  try {
    // Remove locally (no history push — it was a transient suggestion)
    const idx = editablePhotos.value.findIndex((p) => p.id === photoId);
    if (idx !== -1) {
      const next = [...editablePhotos.value];
      next.splice(idx, 1);
      editablePhotos.value = next;
    }

    await handleSuggestPhotoAt({
      insertIndex: suggestionInfo.insertIndex,
      criteria: suggestionInfo.criteria,
      leftId: suggestionInfo.leftId,
      rightId: suggestionInfo.rightId,
    });
  } catch (error) {
    console.error("Error refreshing suggestion:", error);
  } finally {
    refreshingPhotoId.value = null;
  }
};

// Remove a photo: local only, pushed to undo history.
const handleRemovePhoto = (photoId) => {
  if (!viewingSeries.value) return;

  const suggestionInfo = recentlySuggestedPhotos.value.get(photoId);
  if (suggestionInfo && Date.now() - suggestionInfo.timestamp < 5 * 60 * 1000) {
    const contextKey = `${suggestionInfo.leftId || "start"}-${
      suggestionInfo.rightId || "end"
    }`;
    if (!discardedPhotosByContext.value.has(contextKey)) {
      discardedPhotosByContext.value.set(contextKey, new Set());
    }
    discardedPhotosByContext.value.get(contextKey).add(photoId);
    recentlySuggestedPhotos.value.delete(photoId);
  }

  const idx = editablePhotos.value.findIndex((p) => p.id === photoId);
  if (idx === -1) return;
  const [removed] = editablePhotos.value.splice(idx, 1);
  removedPhotosHistory.value.push({ photo: removed, index: idx });
  // trigger reactivity
  editablePhotos.value = [...editablePhotos.value];
};

// Reorder (drag & drop): strip already provides the new ordered array via
// @photos-updated. @reorder fires too — we just ignore the backend payload here.
const handleReorder = () => {
  // No-op: deferred until save. Local order is tracked via @photos-updated.
};

// Move left/right: strip also emits @photos-updated with the final array,
// so this handler stays a no-op to avoid double-applying the change.
const handleMovePhoto = () => {
  // No-op: handled by @photos-updated.
};

const handlePhotosUpdated = (updatedPhotos) => {
  // Strip sends the full ordered photo array after drag/move operations
  if (Array.isArray(updatedPhotos)) {
    editablePhotos.value = [...updatedPhotos];
  }
};

const togglePhotoSelection = (photoId) => {
  localTogglePhotoSelection(photoId);
};

const handleDownloadMultiple = async () => {
  if (localSelectedPhotoIds.value.length === 0) {
    message.warning("Please select at least one photo to download");
    return;
  }

  try {
    // Get full photo objects from selected IDs (from editable list)
    const selectedPhotos = editablePhotos.value.filter((photo) =>
      localSelectedPhotoIds.value.includes(photo.id),
    );

    await downloadPhotosZip(selectedPhotos);
    message.success(`Downloaded ${selectedPhotos.length} photo(s)`);
    localClearAllSelections();
  } catch (error) {
    console.error("Error downloading photos:", error);
  }
};

// Remove multiple selected: local only.
const handleRemoveSelectedFromSeries = () => {
  if (!viewingSeries.value || localSelectedPhotoIds.value.length === 0) {
    return;
  }

  const selectedSet = new Set(localSelectedPhotoIds.value);
  // Capture removed items with their original indices (in descending order
  // so pushing and later undoing via pop preserves positions correctly).
  const toRemove = [];
  editablePhotos.value.forEach((p, i) => {
    if (selectedSet.has(p.id)) toRemove.push({ photo: p, index: i });
  });

  if (toRemove.length === 0) return;

  editablePhotos.value = editablePhotos.value.filter(
    (p) => !selectedSet.has(p.id),
  );
  // Push in original-index ascending order so undo pops latest first
  for (const entry of toRemove) removedPhotosHistory.value.push(entry);

  message.info(
    `Removed ${toRemove.length} photo${toRemove.length > 1 ? "s" : ""} (not saved yet)`,
  );
  localClearAllSelections();
};

// Undo last removal
const undoLastChange = () => {
  const last = removedPhotosHistory.value.pop();
  if (!last) return;
  const next = [...editablePhotos.value];
  const insertAt = Math.min(last.index, next.length);
  next.splice(insertAt, 0, last.photo);
  editablePhotos.value = next;
};

// Discard all local changes
const discardChanges = () => {
  editablePhotos.value = [...originalPhotos.value];
  removedPhotosHistory.value = [];
  recentlySuggestedPhotos.value.clear();
  discardedPhotosByContext.value.clear();
};

// Persist local changes to the backend
const saveChanges = async () => {
  if (!viewingSeries.value || !hasChanges.value) return;

  const seriesId = viewingSeries.value.id;
  const currentIds = editablePhotos.value.map((p) => p.id);
  const originalIds = originalPhotoIds.value;

  const originalSet = new Set(originalIds);
  const currentSet = new Set(currentIds);
  const toRemove = originalIds.filter((id) => !currentSet.has(id));
  const toAdd = currentIds.filter((id) => !originalSet.has(id));

  isSaving.value = true;
  try {
    if (toRemove.length > 0) {
      await seriesStore.removePhotosFromSeries(seriesId, toRemove);
    }
    if (toAdd.length > 0) {
      await seriesStore.addPhotosToSeries(seriesId, toAdd);
    }
    // Always push the final order so the server matches the local arrangement
    await seriesStore.updatePhotoOrder(
      seriesId,
      currentIds.map((photoId, order) => ({ photoId, order })),
    );

    message.success("Series saved");

    // Re-sync snapshots from the updated store
    await seriesStore.getOrFetch(true);
    const fresh = seriesStore.getSeriesWithFullPhotos(seriesId, photosStore);
    if (fresh) {
      viewingSeries.value = fresh;
      seriesStore.setCurrentSeries(fresh);
      initEditableState(fresh);
    }
  } catch (error) {
    console.error("Error saving series:", error);
    message.error("Failed to save series");
  } finally {
    isSaving.value = false;
  }
};

const handleMoveToTool = () => {
  if (localSelectedPhotoIds.value.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }
  openToolSelector();
};

const handleSendToChat = async () => {
  await takeToChat(localSelectedPhotoIds.value, localClearAllSelections);
};

const handleToolSelected = async (toolId, canvasId = null) => {
  // Ordenar los IDs según el orden de la serie para todas las herramientas
  let photoIds = localSelectedPhotoIds.value;

  if (editablePhotos.value?.length) {
    // Filtrar las fotos de la serie manteniendo solo las seleccionadas, en el orden correcto
    const selectedSet = new Set(photoIds);
    photoIds = editablePhotos.value
      .filter((photo) => selectedSet.has(photo.id))
      .map((photo) => photo.id);

    console.log("🎬 IDs ordenados según serie:", photoIds);
  }

  await takeToTool(toolId, photoIds, localClearAllSelections, canvasId);
  closeToolSelector();
};

const openSeries = (series) => {
  router.push({ name: "series-detail", params: { id: series.id } });
};

const backToSeriesRoot = () => router.push({ name: "series" });
const navigateToSet = (setId) =>
  router.push({ name: "series-set", params: { setId } });

const backToSeries = () => {
  const targetSetId = viewingSeries.value?.setId;
  const navigateBack = () => {
    recentlySuggestedPhotos.value.clear();
    discardedPhotosByContext.value.clear();
    if (targetSetId) {
      router.push({ name: "series-set", params: { setId: targetSetId } });
    } else {
      router.push({ name: "series" });
    }
  };

  if (hasChanges.value) {
    pendingNavigation = navigateBack;
    showUnsavedModal.value = true;
    return;
  }
  navigateBack();
};

// Unsaved changes modal handlers
const handleLeaveWithoutSaving = () => {
  showUnsavedModal.value = false;
  if (pendingNavigation) {
    const nav = pendingNavigation;
    pendingNavigation = null;
    nav();
  }
};

const handleStayOnPage = () => {
  showUnsavedModal.value = false;
  if (pendingNavigation) {
    const nav = pendingNavigation;
    pendingNavigation = null;
    nav(false);
  }
};

const handleSaveAndLeave = async () => {
  await saveChanges();
  showUnsavedModal.value = false;
  if (pendingNavigation) {
    const nav = pendingNavigation;
    pendingNavigation = null;
    nav();
  }
};

onBeforeRouteLeave((_to, _from, next) => {
  if (hasChanges.value && showSeriesView.value && !isPublicView.value) {
    pendingNavigation = next;
    showUnsavedModal.value = true;
  } else {
    next();
  }
});

// Edit title methods
const startEditTitle = () => {
  editedTitle.value =
    viewingSeries.value.name || viewingSeries.value.title || "";
  editingTitle.value = true;
};

const saveTitle = async () => {
  if (!viewingSeries.value || !editedTitle.value.trim()) {
    message.warning("Series name cannot be empty");
    return;
  }

  isSavingTitle.value = true;
  try {
    await seriesStore.updateSeries(viewingSeries.value.id, {
      title: editedTitle.value.trim(),
      description: viewingSeries.value.description,
    });
    message.success("Series name updated");
    editingTitle.value = false;
    updateViewingSeries();
  } catch (error) {
    console.error("Error updating series name:", error);
  } finally {
    isSavingTitle.value = false;
  }
};

const cancelEditTitle = () => {
  editingTitle.value = false;
  editedTitle.value = "";
};

// Edit description methods
const startEditDescription = () => {
  editedDescription.value = viewingSeries.value.description || "";
  editingDescription.value = true;
};

const saveDescription = async () => {
  if (!viewingSeries.value) return;

  isSavingDescription.value = true;
  try {
    await seriesStore.updateSeries(viewingSeries.value.id, {
      title: viewingSeries.value.name || viewingSeries.value.title,
      description: editedDescription.value.trim() || "",
    });
    message.success("Series description updated");
    editingDescription.value = false;
    updateViewingSeries();
  } catch (error) {
    console.error("Error updating series description:", error);
  } finally {
    isSavingDescription.value = false;
  }
};

const cancelEditDescription = () => {
  editingDescription.value = false;
  editedDescription.value = "";
};

const showDeleteConfirmation = () => {
  deleteConfirmationVisible.value = true;
};

const deleteSeries = async () => {
  if (!viewingSeries.value) return;

  try {
    const parentSetId = viewingSeries.value.setId;
    await seriesStore.deleteSeries(viewingSeries.value.id);

    message.success(`Series deleted successfully`);
    deleteConfirmationVisible.value = false;

    if (parentSetId) {
      router.push({ name: "series-set", params: { setId: parentSetId } });
    } else {
      router.push({ name: "series" });
    }
  } catch (error) {
    console.error("Error deleting series:", error);
  }
};

const showBulkDeleteConfirmation = () => {
  bulkDeleteConfirmationVisible.value = true;
};

const bulkDeleteSeries = async () => {
  const ids = [...seriesSelection.selectedIds.value];
  if (ids.length === 0) return;
  try {
    await seriesStore.deleteSeriesMany(ids);
    message.success(
      `${ids.length} ${ids.length === 1 ? "series" : "series"} deleted`,
    );
    bulkDeleteConfirmationVisible.value = false;
    seriesSelection.clearAll();
  } catch (error) {
    console.error("Error bulk deleting series:", error);
    message.error("Failed to delete series");
  }
};

const onSeriesCardClick = (series, nativeEvent, orderedList) => {
  const orderedIds = orderedList.map((s) => s.id);
  const handled = seriesSelection.handleCardSelect(
    series.id,
    nativeEvent,
    orderedIds,
  );
  if (!handled) openSeries(series);
};

const onDropSeriesIntoSet = async (seriesIds, setId) => {
  const ids = Array.isArray(seriesIds) ? seriesIds : [seriesIds];
  try {
    await Promise.all(ids.map((id) => seriesStore.moveSeriesToSet(id, setId)));
    const set = seriesStore.getSetById(setId);
    message.success(
      ids.length === 1
        ? `Series moved to "${set?.name || "set"}"`
        : `${ids.length} series moved to "${set?.name || "set"}"`,
    );
    seriesSelection.clearAll();
  } catch (error) {
    console.error("Error moving series:", error);
    message.error("Failed to move series");
  }
};

const breadcrumbDragOver = ref(null);

const onBreadcrumbDragOver = (crumbId, e) => {
  if (
    e.dataTransfer?.types.includes("application/x-series-id") ||
    e.dataTransfer?.types.includes("application/x-series-ids")
  ) {
    breadcrumbDragOver.value = crumbId;
    e.dataTransfer.dropEffect = "move";
  }
};

const onBreadcrumbDragLeave = (crumbId, e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    breadcrumbDragOver.value = null;
  }
};

const onBreadcrumbDrop = async (targetSetId, e) => {
  breadcrumbDragOver.value = null;

  let ids = [];
  const multiRaw = e.dataTransfer?.getData("application/x-series-ids");
  if (multiRaw) {
    try {
      const parsed = JSON.parse(multiRaw);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = [];
    }
  }
  if (ids.length === 0) {
    const single = e.dataTransfer?.getData("application/x-series-id");
    if (single) ids = [single];
  }
  if (ids.length === 0) return;

  try {
    await Promise.all(
      ids.map((id) => seriesStore.moveSeriesToSet(id, targetSetId)),
    );
    seriesSelection.clearAll();
    if (targetSetId) {
      const set = seriesStore.getSetById(targetSetId);
      message.success(
        ids.length === 1
          ? `Series moved to "${set?.name || "set"}"`
          : `${ids.length} series moved to "${set?.name || "set"}"`,
      );
    } else {
      message.success(
        ids.length === 1
          ? "Series moved to root"
          : `${ids.length} series moved to root`,
      );
    }
  } catch (error) {
    console.error("Error moving series via breadcrumb:", error);
    message.error("Failed to move series");
  }
};

const _onKeyDown = (e) => {
  if (e.key === "Escape" && seriesSelection.isSelectionMode.value) {
    seriesSelection.clearAll();
  }
};

const formatDate = (date) => {
  return seriesStore.formatDate(date);
};

// Show photo info dialog
const handleShowPhotoInfo = async (photoId) => {
  console.log("[SeriesView] handleShowPhotoInfo called with photoId:", photoId);

  try {
    // Fetch full photo data from API
    const fullPhoto = await photosStore.fetchPhoto(photoId);
    console.log("[SeriesView] Full photo fetched from API:", fullPhoto);

    if (fullPhoto) {
      selectedPhotoForInfo.value = fullPhoto;
      photoInfoDialogVisible.value = true;
    } else {
      console.error("[SeriesView] Photo not found:", photoId);
      message.error("Photo not found");
    }
  } catch (error) {
    console.error("[SeriesView] Error fetching photo:", error);
  }
};

// Copy series link to clipboard
const copySeriesLink = async () => {
  if (!viewingSeries.value) return;

  const userEmail = userStore.user?.email;
  const seriesName = viewingSeries.value.name || viewingSeries.value.title;

  if (!userEmail || !seriesName) {
    message.error("Unable to generate share link");
    return;
  }

  // Extract username from email (part before @)
  const userName = userEmail.split("@")[0];

  // Replace spaces with underscores and encode for URL
  const urlName = seriesName.replace(/\s+/g, "_").toLowerCase();
  const shareUrl = `${window.location.origin}/shared-series/${userName}/${urlName}`;

  try {
    await navigator.clipboard.writeText(shareUrl);
    message.success("Link copied to clipboard!");
  } catch (error) {
    console.error("Failed to copy link:", error);
    message.error("Failed to copy link to clipboard");
  }
};

// Watch for route changes to update the view
const updateViewingSeries = () => {
  // Skip if this is a public view (handled separately)
  if (isPublicView.value) return;

  const id = route.params.id;
  if (id && allSeries.value.length > 0) {
    const series = seriesStore.getSeriesWithFullPhotos(id, photosStore);
    if (series) {
      // If switching to a different series, clear tracking & reset editable state
      if (viewingSeries.value?.id !== series.id) {
        recentlySuggestedPhotos.value.clear();
        discardedPhotosByContext.value.clear();
      }
      viewingSeries.value = series;
      viewingSet.value = null;
      showSeriesView.value = true;
      showSetView.value = false;
      seriesStore.setCurrentSeries(series);

      // Initialize editable state only when loading a different series,
      // so we don't clobber in-progress edits on unrelated store refreshes.
      if (String(currentEditingSeriesId.value) !== String(series.id)) {
        initEditableState(series);
      }
      return;
    }
  }

  const setId = route.params.setId;
  if (setId) {
    const set = seriesStore.getSetById(setId);
    if (set) {
      viewingSet.value = set;
      viewingSeries.value = null;
      showSetView.value = true;
      showSeriesView.value = false;
      seriesStore.clearCurrentSeries();
      return;
    }
  }

  viewingSeries.value = null;
  viewingSet.value = null;
  showSeriesView.value = false;
  showSetView.value = false;
  seriesStore.clearCurrentSeries();
  if (currentEditingSeriesId.value !== null) {
    editablePhotos.value = [];
    originalPhotos.value = [];
    originalPhotoIds.value = [];
    removedPhotosHistory.value = [];
    currentEditingSeriesId.value = null;
  }
};

// Load public series by name for anonymous users
const loadPublicSeries = async () => {
  const { userId, serieName } = route.params;
  if (!userId || !serieName) {
    publicLoadError.value = true;
    return;
  }

  try {
    // Replace underscores back to spaces for backend call
    const decodedName = String(serieName).replace(/_/g, " ");
    const series = await seriesStore.fetchSeriesByName(userId, decodedName);
    if (series) {
      viewingSeries.value = series;
      showSeriesView.value = true;
      // Auto-open fullscreen viewer for public view
      if (series.photos && series.photos.length > 0) {
        fullscreenViewerVisible.value = true;
      }
    } else {
      publicLoadError.value = true;
    }
  } catch (error) {
    console.error("Error loading public series:", error);
    publicLoadError.value = true;
  }
};

onMounted(async () => {
  document.addEventListener("keydown", _onKeyDown);

  // Check if this is a public view route
  if (route.name === "shared-series") {
    isPublicView.value = true;
    await loadPublicSeries();
    return;
  }

  // Normal authenticated flow
  try {
    await Promise.all([
      photosStore.getOrFetch(),
      seriesStore.getOrFetch(),
      seriesStore.getOrFetchSets(),
    ]);
    updateViewingSeries();

    // Load photos from query params if present (e.g., ?source=lightroom&ids=123,456)
    const photoIdsFromQuery = getPhotoIdsFromQuery({
      clearAfterLoad: true,
      onReady: async (photoIds) => {
        if (photoIds.length > 0 && viewingSeries.value) {
          await onPhotosSelected(photoIds);
          console.log(
            `✅ Added ${photoIds.length} photos from URL to series (async)`,
          );
        }
      },
    });

    // Caso sync: si el store ya estaba cargado, añadir las fotos inmediatamente
    if (photoIdsFromQuery.length > 0 && viewingSeries.value) {
      await onPhotosSelected(photoIdsFromQuery);
      console.log(
        `✅ Added ${photoIdsFromQuery.length} photos from URL to series`,
      );
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
});

onUnmounted(() => {
  document.removeEventListener("keydown", _onKeyDown);
});

watch(
  [
    () => route.params.id,
    () => route.params.setId,
    allSeries,
    () => seriesStore.allSeriesSets,
    () => photosStore.allPhotos,
  ],
  updateViewingSeries,
);

// Watch for fullscreen viewer closing in public view to redirect
watch(fullscreenViewerVisible, (isVisible) => {
  if (!isVisible && isPublicView.value) {
    // When user closes fullscreen in public view, redirect to landing
    router.push({ name: "landing" });
  }
});
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.series-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
}

.series-list-header {
  margin-bottom: var(--spacing-3xl);
}

.header-content {
  text-align: left;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.page-subtitle {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  margin: 0;
}

/* Series Grid */
.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
  text-align: center;
}

.loading-text {
  margin-top: var(--spacing-md);
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}

/* Sequential photo arrangement for series cards */
.photo-sequence {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sequence-photo {
  position: relative;
  width: 50px;
  height: 60px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  overflow: hidden;
}

.photo-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

.sequence-number {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  z-index: 1;
}

/* Hover effects for photo sequence (now with 3 photos) */
.card:hover .sequence-photo {
  transform: translateY(-4px);
}

.card:hover .sequence-photo.sequence-1 {
  transform: translateY(-6px);
}
.card:hover .sequence-photo.sequence-2 {
  transform: translateY(-4px);
}
.card:hover .sequence-photo.sequence-3 {
  transform: translateY(-6px);
}

/* Series Detail View Styles */
.series-detail-view {
  margin: 0 auto;
  background-color: var(--bg-body);
}

.play-series-button {
  font-size: var(--font-size-sm);
}

.play-series-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.series-title-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: var(--spacing-xs);
}

.share-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  min-width: 32px;
  margin-top: 5px;
}

.share-button:hover {
  color: var(--primary-color);
}

/* Edit mode styles */
.title-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.title-edit {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.title-edit :deep(.n-input) {
  max-width: 600px;
}

.title-edit :deep(.n-input__input) {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.description-display {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.description-display .detail-description {
  margin: 0;
}

.description-edit {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
  align-items: flex-start;
}

.description-edit :deep(.n-input) {
  max-width: 400px;
}

.description-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
}

.edit-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  flex-shrink: 0;
  padding: 0;
  min-width: 32px;
}

.edit-button:hover {
  color: var(--primary-color);
}

.action-button {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  padding: 0;
  min-width: 32px;
  flex-shrink: 0;
}

.action-button:hover {
  color: var(--primary-color);
}

.series-photos {
  width: 100%;
}

.root-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.sort-order-icon {
  color: var(--text-secondary);
  transition: color 0.2s ease;
  padding: 0;
  min-width: 32px;
}

.sort-order-icon:hover {
  color: var(--primary-color);
}

.set-header {
  margin-bottom: var(--spacing-2xl);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--spacing-md);
  flex-wrap: wrap;
}

.breadcrumb-item {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  padding: 0 2px;
}

.breadcrumb-item:hover {
  color: var(--primary-color);
}

.breadcrumb-item.breadcrumb-drop-target {
  color: var(--primary-color);
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 10%,
    transparent
  );
  border-radius: 6px;
  outline: 2px solid var(--primary-color, #6366f1);
  outline-offset: 1px;
}

.breadcrumb-current {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  cursor: default;
}

.breadcrumb-sep {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.set-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.set-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
  flex-wrap: wrap;
}

.set-description {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
  margin: var(--spacing-xs) 0 0 0;
}

.empty-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

/* Empty Series State */
.empty-series-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: calc(100vh - 300px);

  text-align: center;
}

.empty-series-content {
  max-width: 400px;
}

.empty-series-icon {
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-lg);
}

.empty-series-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.empty-series-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: 1.5;
}

.create-series-btn {
  font-size: var(--font-size-md);
  padding: var(--spacing-md) var(--spacing-xl);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .series-view {
    padding: var(--spacing-lg);
  }

  .page-title {
    font-size: var(--font-size-3xl);
  }

  .sequence-photo {
    width: 40px;
    height: 50px;
  }
}

@media (max-width: 1024px) {
  .series-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1600px) {
  .series-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Public View Styles */
.public-loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--bg-body);
}

.public-error-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: var(--bg-body);
}

.error-content {
  text-align: center;
  max-width: 400px;
  padding: var(--spacing-2xl);
}

.error-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: var(--spacing-lg) 0 var(--spacing-md) 0;
}

.error-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: 1.5;
}

.public-series-view {
  min-height: 100vh;
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.public-background {
  text-align: center;
  color: white;
  opacity: 0.7;
}

.public-series-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  margin: 0 0 var(--spacing-sm) 0;
}

.public-series-meta {
  font-size: var(--font-size-lg);
  margin: 0;
  opacity: 0.7;
}
</style>
