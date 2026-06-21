<template>
  <div class="collections-view view-container">
    <!-- Collection View (when viewing a specific collection) -->
    <div v-if="showCollectionView && viewingCollection" class="collection-view">
      <!-- Collection Header -->
      <div class="detail-header">
        <div class="detail-header-content">
          <div class="detail-header-actions">
            <n-button
              text
              @click="backFromCollection"
              class="detail-back-button"
            >
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
            <!-- Desktop buttons -->
            <div class="header-actions-buttons desktop-actions">
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
                Delete Collection
              </n-button>
            </div>
            <!-- Mobile overflow menu -->
            <div class="mobile-actions">
              <n-dropdown
                trigger="click"
                :options="dropdownOptions"
                @select="handleDropdownSelect"
              >
                <n-button text class="overflow-menu-button">
                  <template #icon>
                    <n-icon size="24">
                      <EllipsisVertical />
                    </n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </div>
          </div>
          <div class="title-row">
            <div v-if="!editingTitle" class="title-display">
              <h1 class="detail-title">
                {{ viewingCollection.name || viewingCollection.title }}
              </h1>
              <n-button
                text
                class="edit-button"
                @click="startEditTitle"
                title="Edit collection name"
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
                placeholder="Enter collection name..."
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
          </div>
          <div v-if="!editingDescription" class="description-display">
            <p class="detail-description" v-if="viewingCollection.description">
              {{ viewingCollection.description }}
            </p>
            <n-button
              text
              class="edit-button"
              @click="startEditDescription"
              title="Edit collection description"
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
              placeholder="Enter collection description (optional)..."
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
        </div>
      </div>

      <!-- Collection Photos Grid -->
      <div class="collection-photos">
        <PhotosGrid
          :collectionId="route.params.id"
          :photos="viewingCollection.photos || []"
          :showSuggestButton="(viewingCollection.photos || []).length > 0"
          :findDuplicatesEnabled="false"
          @refreshCollection="refreshCollection"
          @suggest-photos="suggestPhotosForCollection"
        />
      </div>
    </div>

    <!-- Set View (when browsing a collection set) -->
    <div v-else-if="showSetView && viewingSet" class="set-view">
      <!-- Breadcrumb + Set Header -->
      <div class="set-header">
        <!-- Breadcrumb -->
        <div class="breadcrumb">
          <n-button
            text
            class="breadcrumb-item"
            :class="{ 'breadcrumb-drop-target': breadcrumbDragOver === 'root' }"
            @click="backToRoot"
            @dragover.prevent="onBreadcrumbDragOver('root', $event)"
            @dragleave="onBreadcrumbDragLeave('root', $event)"
            @drop.prevent="onBreadcrumbDrop(null, $event)"
          >
            <template #icon
              ><n-icon><GridOutline /></n-icon
            ></template>
            Collections
          </n-button>
          <template v-for="(crumb, i) in breadcrumb" :key="crumb.id">
            <n-icon size="14" class="breadcrumb-sep"
              ><ChevronForwardOutline
            /></n-icon>
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

        <!-- Set title row -->
        <div class="set-title-row">
          <div v-if="!editingSetTitle" class="title-display">
            <h1 class="detail-title">{{ viewingSet.name }}</h1>
            <n-button
              text
              class="edit-button"
              @click="startEditSetTitle"
              title="Edit set name"
            >
              <template #icon
                ><n-icon size="20"><CreateOutline /></n-icon
              ></template>
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
              <template #icon
                ><n-icon size="20"><CheckmarkOutline /></n-icon
              ></template>
            </n-button>
            <n-button text class="action-button" @click="cancelEditSetTitle">
              <template #icon
                ><n-icon size="20"><CloseOutline /></n-icon
              ></template>
            </n-button>
          </div>

          <!-- Sort controls (set view) -->
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

          <!-- Set actions -->
          <div class="set-actions desktop-actions">
            <n-button
              v-if="collectionSelection.isSelectionMode.value"
              type="error"
              ghost
              @click="showBulkDeleteConfirmation"
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
              Delete Selected ({{
                collectionSelection.selectedCollectionIds.value.length
              }})
            </n-button>
            <n-button type="primary" ghost @click="showCreateCollectionInSet">
              <template #icon
                ><n-icon><AddOutline /></n-icon
              ></template>
              New Collection
            </n-button>
            <n-button @click="showCreateSubsetDialog">
              <template #icon
                ><n-icon><FolderOutline /></n-icon
              ></template>
              New Set
            </n-button>
            <n-button type="error" ghost @click="showDeleteSetConfirmation">
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
              Delete Set
            </n-button>
          </div>
          <!-- Mobile overflow for set view -->
          <div class="mobile-actions">
            <n-dropdown
              trigger="click"
              :options="setDropdownOptions"
              @select="handleSetDropdownSelect"
            >
              <n-button text class="overflow-menu-button">
                <template #icon
                  ><n-icon size="24"><EllipsisVertical /></n-icon
                ></template>
              </n-button>
            </n-dropdown>
          </div>
        </div>

        <p v-if="viewingSet.description" class="set-description">
          {{ viewingSet.description }}
        </p>
      </div>

      <!-- Set contents grid -->
      <div v-if="setIsEmpty" class="empty-collections-state">
        <div class="empty-collections-content">
          <n-icon size="64" class="empty-collections-icon"
            ><FolderOpenOutline
          /></n-icon>
          <h3 class="empty-collections-title">This set is empty</h3>
          <p class="empty-collections-description">
            Add sets or collections to organize your work.
          </p>
          <div
            style="
              display: flex;
              gap: 12px;
              justify-content: center;
              flex-wrap: wrap;
            "
          >
            <n-button type="primary" @click="showCreateCollectionInSet">
              <template #icon
                ><n-icon><AddOutline /></n-icon
              ></template>
              New Collection
            </n-button>
            <n-button @click="showCreateSubsetDialog">
              <template #icon
                ><n-icon><FolderOutline /></n-icon
              ></template>
              New Set
            </n-button>
          </div>
        </div>
      </div>

      <div v-else class="card-grid">
        <!-- <CreateCard
          title="New Collection"
          subtitle="Add a collection here"
          @click="showCreateCollectionInSet"
        /> -->

        <!-- Child sets -->
        <CollectionSetCard
          v-for="childSet in currentChildSets"
          :key="`set-${childSet.id}`"
          :item="childSet"
          @click="navigateToSet(childSet.id)"
          @drop-collections="onDropCollectionsIntoSet"
        />

        <!-- Collections in this set -->
        <CollectionCard
          v-for="collection in currentSetCollections"
          :key="`col-${collection.id}`"
          :item="collection"
          type="collection"
          :is-selected="collectionSelection.isSelected(collection.id)"
          :is-selection-mode="collectionSelection.isSelectionMode.value"
          :selected-ids="collectionSelection.selectedCollectionIds.value"
          @click="
            (_, ev) =>
              onCollectionCardClick(collection, ev, currentSetCollections)
          "
          @select-toggle="
            () =>
              collectionSelection.toggleSelectItem(
                collection.id,
                currentSetCollections.map((c) => c.id),
              )
          "
        />
      </div>
    </div>

    <!-- Root Grid View (default view) -->
    <div v-else>
      <!-- Root toolbar -->
      <div v-if="!isLoading && hasRootContent" class="root-toolbar">
        <n-button @click="showCreateSetDialog">
          <template #icon
            ><n-icon><FolderOutline /></n-icon
          ></template>
          New Set
        </n-button>
        <div class="sort-controls">
          <n-button
            v-if="collectionSelection.isSelectionMode.value"
            type="error"
            ghost
            @click="showBulkDeleteConfirmation"
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
            Delete Selected ({{
              collectionSelection.selectedCollectionIds.value.length
            }})
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

      <div v-if="isLoading" class="loading-state">
        <SpiralGridLoader
          variant="primary"
          :size="72"
          text="Loading your collections..."
        />
      </div>

      <div v-else class="card-grid">
        <!-- Create New Collection card (only show when there's existing content) -->
        <CreateCard
          v-if="hasRootContent"
          title="New Collection"
          subtitle="Start organizing your photos"
          @click="showCreateDialog"
        />

        <!-- Root-level sets -->
        <CollectionSetCard
          v-for="set in rootSets"
          :key="`set-${set.id}`"
          :item="set"
          @click="navigateToSet(set.id)"
          @drop-collections="onDropCollectionsIntoSet"
        />

        <!-- Root-level collections (not inside any set) -->
        <CollectionCard
          v-for="collection in rootCollections"
          :key="`col-${collection.id}`"
          :item="collection"
          type="collection"
          :is-selected="collectionSelection.isSelected(collection.id)"
          :is-selection-mode="collectionSelection.isSelectionMode.value"
          :selected-ids="collectionSelection.selectedCollectionIds.value"
          @click="
            (_, ev) => onCollectionCardClick(collection, ev, rootCollections)
          "
          @select-toggle="
            () =>
              collectionSelection.toggleSelectItem(
                collection.id,
                rootCollections.map((c) => c.id),
              )
          "
        />

        <!-- Empty State -->
        <div v-if="!hasRootContent" class="empty-collections-state">
          <div class="empty-collections-content">
            <n-icon size="64" class="empty-collections-icon">
              <GridOutline />
            </n-icon>
            <h3 class="empty-collections-title">No collections yet</h3>
            <p class="empty-collections-description">
              Create your first collection or set to start organizing your
              photos.
            </p>
            <div
              style="
                display: flex;
                gap: 12px;
                justify-content: center;
                flex-wrap: wrap;
              "
            >
              <n-button
                type="primary"
                @click="showCreateDialog"
                class="create-collection-btn"
              >
                <template #icon
                  ><n-icon><AddOutline /></n-icon
                ></template>
                Create Collection
              </n-button>
              <n-button
                @click="showCreateSetDialog"
                class="create-collection-btn"
              >
                <template #icon
                  ><n-icon><FolderOutline /></n-icon
                ></template>
                Create Set
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Collection Dialog -->
    <n-modal
      v-model:show="createDialogVisible"
      preset="dialog"
      title="Create New Collection"
      positive-text="Create Collection"
      negative-text="Cancel"
      @positive-click="proceedToCreateCollection"
      @negative-click="createDialogVisible = false"
    >
      <div class="create-form">
        <n-form ref="formRef" :model="formData" :rules="formRules">
          <n-form-item label="Name" path="title">
            <n-input
              v-model:value="formData.title"
              placeholder="Enter collection name..."
              maxlength="100"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="formData.description"
              type="textarea"
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
      :title="
        createSetParentId
          ? 'Create New Set inside \'' + (viewingSet?.name ?? '') + '\''
          : 'Create New Set'
      "
      positive-text="Create Set"
      negative-text="Cancel"
      @positive-click="proceedToCreateSet"
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
              type="textarea"
              placeholder="Add a description (optional)..."
              :rows="2"
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
        viewingCollection?.name || viewingCollection?.title || 'Collection'
      }`"
      :displayLightboxTab="false"
      :displaySearch="true"
      @add-photos="onPhotosSelected"
    />

    <!-- Suggested Photos Dialog -->
    <PhotosDialog
      v-model="suggestDialogVisible"
      :is-trash="false"
      :title="`Suggested Photos for ${
        viewingCollection?.name || viewingCollection?.title || 'Collection'
      }`"
      :displayLightboxTab="false"
      :displaySearch="false"
      :suggestedPhotos="suggestedPhotos"
      :loadingSuggestions="isSuggestingPhotos"
      @add-photos="onPhotosSelected"
    />

    <!-- Delete Collection Confirmation Dialog -->
    <n-modal
      v-model:show="deleteConfirmationVisible"
      preset="dialog"
      title="Delete Collection"
      positive-text="Delete Collection"
      negative-text="Cancel"
      type="error"
      :loading="collectionsStore.isDeleting"
      @positive-click="deleteCollection"
      @negative-click="deleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the collection
          <strong
            >"{{ viewingCollection?.name || viewingCollection?.title }}"</strong
          >?
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
          Don't worry - your photos will not be deleted, only the collection
          will be removed.
        </p>
      </div>
    </n-modal>

    <!-- Bulk Delete Collections Confirmation Dialog -->
    <n-modal
      v-model:show="bulkDeleteConfirmationVisible"
      preset="dialog"
      title="Delete Collections"
      positive-text="Delete All"
      negative-text="Cancel"
      type="error"
      :loading="collectionsStore.isDeleting"
      @positive-click="bulkDeleteCollections"
      @negative-click="bulkDeleteConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete
          <strong
            >{{
              collectionSelection.selectedCollectionIds.value.length
            }}
            collection{{
              collectionSelection.selectedCollectionIds.value.length !== 1
                ? "s"
                : ""
            }}</strong
          >?
        </p>
        <p class="delete-warning">
          This action cannot be undone. The collections will be permanently
          deleted. Photos inside them will not be deleted.
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
      @positive-click="deleteSet"
      @negative-click="deleteSetConfirmationVisible = false"
    >
      <div class="delete-confirmation">
        <p>
          Are you sure you want to delete the set
          <strong>"{{ viewingSet?.name }}"</strong>?
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
          Child sets and collections will be moved up to this set's parent (or
          root). No photos will be deleted.
        </p>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, h } from "vue";
import { useRoute, useRouter } from "vue-router";

defineOptions({
  name: "CollectionsView",
});
import {
  NButton,
  NButtonGroup,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NDropdown,
  NSelect,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  CreateOutline,
  CheckmarkOutline,
  CloseOutline,
  EllipsisVertical,
  GridOutline,
  FolderOutline,
  FolderOpenOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotosGrid from "@/components/PhotosGrid.vue";
import CollectionCard from "@/components/CollectionCard.vue";
import CollectionSetCard from "@/components/CollectionSetCard.vue";
import CreateCard from "@/components/photos-grid/CreateCard.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useCollectionSelection } from "@/composables/useCollectionSelection.js";
import { api } from "@/utils/axios";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();

// Multi-select for collection cards
const collectionSelection = useCollectionSelection();

// View mode
const showCollectionView = ref(false);
const showSetView = ref(false);

// Data
const viewingCollection = ref(null);
const viewingSet = ref(null);

// Edit states for collection
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

// Dialogs
const createDialogVisible = ref(false);
const createSetDialogVisible = ref(false);
const photosDialogVisible = ref(false);
const suggestDialogVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const deleteSetConfirmationVisible = ref(false);
const bulkDeleteConfirmationVisible = ref(false);
const createSetParentId = ref(null);

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
  if (!sortType.value) return list; // No sorting if sortType is null

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

// Suggestions
const suggestedPhotos = ref(null);
const isSuggestingPhotos = ref(false);

// Forms
const formRef = ref(null);
const setFormRef = ref(null);
const formData = ref({ title: "", description: "" });
const setFormData = ref({ name: "", description: "" });

const formRules = {
  title: { required: true, message: "Please enter a name", trigger: "blur" },
};
const setFormRules = {
  name: { required: true, message: "Please enter a name", trigger: "blur" },
};

// Mobile dropdown for collection view
const dropdownOptions = [
  {
    label: "Add Photos",
    key: "add-photos",
    icon: () => h(NIcon, null, { default: () => h(AddOutline) }),
  },
  {
    label: "Delete Collection",
    key: "delete-collection",
    icon: () =>
      h(NIcon, null, {
        default: () =>
          h(
            "svg",
            { viewBox: "0 0 24 24" },
            h("path", {
              fill: "currentColor",
              d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
            }),
          ),
      }),
  },
];
const handleDropdownSelect = (key) => {
  if (key === "add-photos") showAddPhotosDialog();
  else if (key === "delete-collection") showDeleteConfirmation();
};

// Mobile dropdown for set view
const setDropdownOptions = [
  {
    label: "New Collection",
    key: "new-collection",
    icon: () => h(NIcon, null, { default: () => h(AddOutline) }),
  },
  {
    label: "New Set",
    key: "new-set",
    icon: () => h(NIcon, null, { default: () => h(FolderOutline) }),
  },
  {
    label: "Delete Set",
    key: "delete-set",
    icon: () =>
      h(NIcon, null, {
        default: () =>
          h(
            "svg",
            { viewBox: "0 0 24 24" },
            h("path", {
              fill: "currentColor",
              d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
            }),
          ),
      }),
  },
];
const handleSetDropdownSelect = (key) => {
  if (key === "new-collection") showCreateCollectionInSet();
  else if (key === "new-set") showCreateSubsetDialog();
  else if (key === "delete-set") showDeleteSetConfirmation();
};

// Computed
const isLoading = computed(
  () =>
    collectionsStore.isLoading ||
    photosStore.isLoading ||
    !Array.isArray(photosStore.allPhotos) ||
    photosStore.allPhotos.length === 0,
);
const rootCollections = computed(() =>
  _sortList(collectionsStore.rootCollections, "title"),
);
const rootSets = computed(() => _sortList(collectionsStore.rootSets, "name"));
const hasRootContent = computed(
  () =>
    collectionsStore.rootCollections.length > 0 ||
    collectionsStore.rootSets.length > 0,
);
const currentChildSets = computed(() =>
  _sortList(
    viewingSet.value ? collectionsStore.childSetsOf(viewingSet.value.id) : [],
    "name",
  ),
);
const currentSetCollections = computed(() =>
  _sortList(
    viewingSet.value
      ? collectionsStore.collectionsInSet(viewingSet.value.id)
      : [],
    "title",
  ),
);
const setIsEmpty = computed(
  () =>
    currentChildSets.value.length === 0 &&
    currentSetCollections.value.length === 0,
);
const breadcrumb = computed(() =>
  viewingSet.value
    ? collectionsStore.getBreadcrumbFor(viewingSet.value.id)
    : [],
);
const backLabel = computed(() => {
  if (viewingCollection.value?.setId) {
    const set = collectionsStore.getSetById(viewingCollection.value.setId);
    return set ? `Back to "${set.name}"` : "Back to Collections";
  }
  return "Back to Collections";
});

// Navigation
const backToRoot = () => router.push({ name: "collections" });
const backFromCollection = () => {
  const setId = viewingCollection.value?.setId;
  if (setId) router.push({ name: "collection-set", params: { setId } });
  else router.push({ name: "collections" });
};
const navigateToSet = (setId) =>
  router.push({ name: "collection-set", params: { setId } });
const openCollection = (collection) =>
  router.push({ name: "collection-detail", params: { id: collection.id } });

// Collection create
const showCreateDialog = () => {
  createSetParentId.value = null;
  formData.value = { title: "", description: "" };
  createDialogVisible.value = true;
};
const showCreateCollectionInSet = () => {
  formData.value = { title: "", description: "" };
  createDialogVisible.value = true;
};
const proceedToCreateCollection = async () => {
  try {
    await formRef.value?.validate();
    createDialogVisible.value = false;
    const collectionData = {
      title: formData.value.title,
      description: formData.value.description,
      photoIds: [],
      setId: showSetView.value && viewingSet.value ? viewingSet.value.id : null,
    };
    const newCollection =
      await collectionsStore.createCollection(collectionData);
    message.success(
      `Collection "${formData.value.title}" created successfully`,
    );
    formData.value = { title: "", description: "" };
    router.push({
      name: "collection-detail",
      params: { id: newCollection.id },
    });
  } catch (error) {
    console.error("Error creating collection:", error);
  }
};

// Set create
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
const proceedToCreateSet = async () => {
  try {
    await setFormRef.value?.validate();
    createSetDialogVisible.value = false;
    const newSet = await collectionsStore.createCollectionSet({
      name: setFormData.value.name,
      description: setFormData.value.description,
      parentSetId: createSetParentId.value,
    });
    message.success(`Set "${setFormData.value.name}" created successfully`);
    setFormData.value = { name: "", description: "" };
  } catch (error) {
    console.error("Error creating set:", error);
  }
};

// Set edit
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
    await collectionsStore.updateCollectionSet(viewingSet.value.id, {
      name: editedSetTitle.value.trim(),
      description: viewingSet.value.description,
    });
    message.success("Set name updated");
    editingSetTitle.value = false;
    updateViewState();
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
const deleteSet = async () => {
  if (!viewingSet.value) return;
  try {
    const parentId = viewingSet.value.parentSetId;
    await collectionsStore.deleteCollectionSet(viewingSet.value.id);
    message.success(`Set "${viewingSet.value.name}" deleted`);
    deleteSetConfirmationVisible.value = false;
    if (parentId)
      router.push({ name: "collection-set", params: { setId: parentId } });
    else router.push({ name: "collections" });
  } catch (error) {
    console.error("Error deleting set:", error);
  }
};

// Collection photos
const showAddPhotosDialog = () => {
  photosDialogVisible.value = true;
};
const suggestPhotosForCollection = async () => {
  if (!viewingCollection.value) return;
  const photos = viewingCollection.value.photos || [];
  if (photos.length === 0) return;
  isSuggestingPhotos.value = true;
  suggestedPhotos.value = null;
  suggestDialogVisible.value = true;
  try {
    let anchorIds = [];
    if (photos.length > 20) {
      const sampleCount = Math.min(Math.ceil(photos.length * 0.25), 50);
      const step = photos.length / sampleCount;
      for (let i = 0; i < sampleCount; i++)
        anchorIds.push(photos[Math.floor(i * step)].id);
    } else {
      anchorIds = photos.map((p) => p.id);
    }
    const response = await api.post("/api/search/byPhotos", {
      anchorIds,
      currentPhotosIds: photos.map((p) => p.id),
      criteria: "embedding",
      opposite: false,
      inverted: false,
      resultLength: 54,
    });
    const backendPhotos = Array.isArray(response.data)
      ? response.data
      : [response.data];
    suggestedPhotos.value = backendPhotos
      .map(
        (bp) => photosStore.processedPhotos.find((p) => p.id === bp.id) || bp,
      )
      .filter(Boolean);
  } catch (error) {
    console.error("Error suggesting photos:", error);
    message.error("Could not find suggested photos");
  } finally {
    isSuggestingPhotos.value = false;
  }
};
const onPhotosSelected = async (photoIds) => {
  if (!photoIds || photoIds.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }
  if (showCollectionView.value && viewingCollection.value) {
    try {
      await collectionsStore.addPhotosToCollection(
        viewingCollection.value.id,
        photoIds,
      );
      message.success(
        `Added ${photoIds.length} photo${photoIds.length > 1 ? "s" : ""} to the collection.`,
      );
      photosDialogVisible.value = false;
      suggestDialogVisible.value = false;
      await refreshCollection();
    } catch (error) {
      console.error("Error adding photos:", error);
    }
  }
};
const refreshCollection = async () => {
  await collectionsStore.getOrFetch(true);
  updateViewState();
};
const showDeleteConfirmation = () => {
  deleteConfirmationVisible.value = true;
};
const showBulkDeleteConfirmation = () => {
  bulkDeleteConfirmationVisible.value = true;
};
const bulkDeleteCollections = async () => {
  const ids = [...collectionSelection.selectedCollectionIds.value];
  if (ids.length === 0) return;
  try {
    await collectionsStore.deleteCollections(ids);
    message.success(
      `${ids.length} collection${ids.length !== 1 ? "s" : ""} deleted successfully`,
    );
    bulkDeleteConfirmationVisible.value = false;
    collectionSelection.clearAll();
  } catch (error) {
    console.error("Error bulk deleting collections:", error);
    message.error("Failed to delete collections");
  }
};
const deleteCollection = async () => {
  if (!viewingCollection.value) return;
  try {
    await collectionsStore.deleteCollection(viewingCollection.value.id);
    message.success(
      `Collection "${viewingCollection.value.name || viewingCollection.value.title}" deleted successfully`,
    );
    deleteConfirmationVisible.value = false;
    backFromCollection();
  } catch (error) {
    console.error("Error deleting collection:", error);
  }
};

// Edit collection title
const startEditTitle = () => {
  editedTitle.value =
    viewingCollection.value.name || viewingCollection.value.title || "";
  editingTitle.value = true;
};
const saveTitle = async () => {
  if (!viewingCollection.value || !editedTitle.value.trim()) {
    message.warning("Collection name cannot be empty");
    return;
  }
  isSavingTitle.value = true;
  try {
    await collectionsStore.updateCollection(viewingCollection.value.id, {
      title: editedTitle.value.trim(),
      description: viewingCollection.value.description,
    });
    message.success("Collection name updated");
    editingTitle.value = false;
    updateViewState();
  } catch (error) {
    console.error("Error updating collection name:", error);
  } finally {
    isSavingTitle.value = false;
  }
};
const cancelEditTitle = () => {
  editingTitle.value = false;
  editedTitle.value = "";
};

// Edit collection description
const startEditDescription = () => {
  editedDescription.value = viewingCollection.value.description || "";
  editingDescription.value = true;
};
const saveDescription = async () => {
  if (!viewingCollection.value) return;
  isSavingDescription.value = true;
  try {
    await collectionsStore.updateCollection(viewingCollection.value.id, {
      title: viewingCollection.value.name || viewingCollection.value.title,
      description: editedDescription.value.trim() || "",
    });
    message.success("Collection description updated");
    editingDescription.value = false;
    updateViewState();
  } catch (error) {
    console.error("Error updating collection description:", error);
  } finally {
    isSavingDescription.value = false;
  }
};
const cancelEditDescription = () => {
  editingDescription.value = false;
  editedDescription.value = "";
};

const formatDate = (date) => collectionsStore.formatDate(date);

// Escape key: exit selection mode
const _onKeyDown = (e) => {
  if (e.key === "Escape" && collectionSelection.isSelectionMode.value) {
    collectionSelection.clearAll();
  }
};

// Collection card click — selection logic
const onCollectionCardClick = (collection, nativeEvent, orderedList) => {
  const orderedIds = orderedList.map((c) => c.id);
  const handled = collectionSelection.handleCollectionSelect(
    collection.id,
    nativeEvent,
    orderedIds,
  );
  if (!handled) openCollection(collection);
};

// Drag-and-drop: move one or more collections into a set
const onDropCollectionsIntoSet = async (collectionIds, setId) => {
  const ids = Array.isArray(collectionIds) ? collectionIds : [collectionIds];
  try {
    await Promise.all(
      ids.map((id) => collectionsStore.moveCollectionToSet(id, setId)),
    );
    const set = collectionsStore.getSetById(setId);
    if (ids.length === 1) {
      const col = collectionsStore.getCollectionById(ids[0]);
      message.success(
        `"${col?.name || col?.title || "Collection"}" moved to "${set?.name || "set"}"`,
      );
    } else {
      message.success(
        `${ids.length} collections moved to "${set?.name || "set"}"`,
      );
    }
    collectionSelection.clearAll();
  } catch (error) {
    console.error("Error moving collections:", error);
    message.error("Failed to move collections");
  }
};

// Drag-and-drop: drop onto breadcrumb to move collection to ancestor set or root
const breadcrumbDragOver = ref(null);

const onBreadcrumbDragOver = (crumbId, e) => {
  if (e.dataTransfer?.types.includes("application/x-collection-id")) {
    breadcrumbDragOver.value = crumbId;
    e.dataTransfer.dropEffect = "move";
  }
};

const onBreadcrumbDragLeave = (crumbId, e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (breadcrumbDragOver.value === crumbId) breadcrumbDragOver.value = null;
  }
};

const onBreadcrumbDrop = async (targetSetId, e) => {
  breadcrumbDragOver.value = null;

  // Support multi-id drag
  let ids = [];
  const multiRaw = e.dataTransfer?.getData("application/x-collection-ids");
  if (multiRaw) {
    try {
      const parsed = JSON.parse(multiRaw);
      if (Array.isArray(parsed) && parsed.length > 0) ids = parsed;
    } catch {}
  }
  if (ids.length === 0) {
    const single = e.dataTransfer?.getData("application/x-collection-id");
    if (single) ids = [single];
  }
  if (ids.length === 0) return;

  try {
    await Promise.all(
      ids.map((id) => collectionsStore.moveCollectionToSet(id, targetSetId)),
    );
    const label = targetSetId
      ? `"${collectionsStore.getSetById(targetSetId)?.name || "set"}"`
      : "root";
    if (ids.length === 1) {
      const col = collectionsStore.getCollectionById(ids[0]);
      message.success(
        `"${col?.name || col?.title || "Collection"}" moved to ${label}`,
      );
    } else {
      message.success(`${ids.length} collections moved to ${label}`);
    }
    collectionSelection.clearAll();
  } catch (error) {
    console.error("Error moving collections:", error);
    message.error("Failed to move collections");
  }
};

// Route-driven state
const updateViewState = () => {
  const collectionId = route.params.id;
  const setId = route.params.setId;
  if (collectionId) {
    const collection = collectionsStore.getCollectionWithFullPhotos(
      collectionId,
      photosStore,
    );
    if (collection) {
      viewingCollection.value = collection;
      showCollectionView.value = true;
      showSetView.value = false;
      collectionsStore.setCurrentCollection(collection);
      return;
    }
  }
  if (setId) {
    const set = collectionsStore.getSetById(setId);
    if (set) {
      viewingSet.value = set;
      showSetView.value = true;
      showCollectionView.value = false;
      viewingCollection.value = null;
      collectionsStore.clearCurrentCollection();
      return;
    }
  }
  viewingCollection.value = null;
  viewingSet.value = null;
  showCollectionView.value = false;
  showSetView.value = false;
  collectionsStore.clearCurrentCollection();
};

// ── Auto-scroll while dragging near viewport edges ──────────────────────────
let _dragScrollRaf = null;
let _lastDragY = null;

const _onDocDragOver = (e) => {
  _lastDragY = e.clientY;
};

const _tickDragScroll = () => {
  if (_lastDragY !== null) {
    const ZONE = 100; // px from top/bottom edge that triggers scrolling
    const MAX_SPEED = 14; // max px per frame
    const y = _lastDragY;
    const wh = window.innerHeight;
    if (y < ZONE) {
      window.scrollBy(0, -MAX_SPEED * (1 - y / ZONE));
    } else if (y > wh - ZONE) {
      window.scrollBy(0, MAX_SPEED * (1 - (wh - y) / ZONE));
    }
  }
  _dragScrollRaf = requestAnimationFrame(_tickDragScroll);
};

const _startDragScroll = () => {
  if (_dragScrollRaf) return;
  _lastDragY = null;
  _dragScrollRaf = requestAnimationFrame(_tickDragScroll);
};

const _stopDragScroll = () => {
  if (_dragScrollRaf) {
    cancelAnimationFrame(_dragScrollRaf);
    _dragScrollRaf = null;
  }
  _lastDragY = null;
};

onMounted(async () => {
  document.addEventListener("dragover", _onDocDragOver);
  document.addEventListener("dragstart", _startDragScroll);
  document.addEventListener("dragend", _stopDragScroll);
  document.addEventListener("keydown", _onKeyDown);
  try {
    await Promise.all([
      photosStore.getOrFetch(),
      collectionsStore.getOrFetch(),
      collectionsStore.getOrFetchSets(),
    ]);
    updateViewState();
  } catch (error) {
    console.error("Error loading data:", error);
  }
});

onUnmounted(() => {
  document.removeEventListener("dragover", _onDocDragOver);
  document.removeEventListener("dragstart", _startDragScroll);
  document.removeEventListener("dragend", _stopDragScroll);
  document.removeEventListener("keydown", _onKeyDown);
  _stopDragScroll();
});

watch(
  [
    () => route.params.id,
    () => route.params.setId,
    () => collectionsStore.allCollections,
    () => collectionsStore.allCollectionSets,
    () => photosStore.allPhotos,
  ],
  updateViewState,
);
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.collections-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
}

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

.collection-photos {
  width: 100%;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

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

.empty-collections-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 300px);
  text-align: center;
}

.empty-collections-content {
  max-width: 400px;
}

.empty-collections-icon {
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-lg);
}

.empty-collections-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.empty-collections-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: 1.5;
}

.create-collection-btn {
  font-size: var(--font-size-md);
  padding: var(--spacing-md) var(--spacing-xl);
}

.header-actions-buttons {
  display: flex;
  gap: 12px;
}

.desktop-actions {
  display: flex;
}

.mobile-actions {
  display: none;
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
}

.overflow-menu-button {
  color: var(--text-primary);
  padding: var(--spacing-sm);
}

.set-header {
  margin-bottom: var(--spacing-2xl);
}

.root-toolbar {
  display: flex;
  /* align-items: center; */
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.sort-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
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
    var(--primary-color, #6366f1) 12%,
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
  position: relative;
}

.set-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.set-description {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
  margin: var(--spacing-xs) 0 0 0;
}

@media (max-width: 768px) {
  .collections-view {
    padding: var(--spacing-lg);
  }

  .desktop-actions {
    display: none;
  }

  .mobile-actions {
    display: flex;
  }

  .detail-header {
    position: relative;
  }

  .set-title-row {
    position: relative;
  }

  .set-actions {
    display: none;
  }

  .detail-back-button {
    font-size: var(--font-size-sm);
  }

  .detail-title {
    font-size: var(--font-size-2xl);
  }

  .title-edit :deep(.n-input__input) {
    font-size: var(--font-size-2xl);
  }

  .detail-description {
    font-size: var(--font-size-sm);
  }
}
</style>
