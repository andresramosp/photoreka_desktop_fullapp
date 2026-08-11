<template>
  <div class="collections-view view-container">
    <!-- Set View (when browsing a collection set) -->
    <div v-if="showSetView && viewingSet" class="set-view">
      <!-- Breadcrumb + Set Header -->
      <div class="set-header">
        <!-- Row 1: breadcrumb + set actions -->
        <div class="set-header-top">
          <div class="breadcrumb">
            <n-button
              text
              class="breadcrumb-item"
              :class="{
                'breadcrumb-drop-target': breadcrumbDragOver === 'root',
              }"
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

          <!-- Mobile overflow (collections is the only set view on mobile) -->
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

        <!-- Row 2: title + sort / view controls -->
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
            <div class="view-toggle">
              <n-button
                text
                class="view-toggle-btn"
                :class="{ 'is-active': viewMode === 'grid' }"
                @click="setViewMode('grid')"
                title="Grid view"
              >
                <template #icon
                  ><n-icon size="18"><GridOutline /></n-icon
                ></template>
              </n-button>
              <n-button
                text
                class="view-toggle-btn"
                :class="{ 'is-active': viewMode === 'list' }"
                @click="setViewMode('list')"
                title="List view"
              >
                <template #icon
                  ><n-icon size="18"><ReorderFourOutline /></n-icon
                ></template>
              </n-button>
            </div>
            <n-select
              v-model:value="sortType"
              :options="sortOptions"
              size="small"
              style="width: 120px"
              clearable
              placeholder="Sort"
              :filterable="false"
              class="sort-select"
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

      <div v-else :class="viewMode === 'list' ? 'card-list' : 'card-grid'">
        <!-- List (tree) view -->
        <template v-if="viewMode === 'list'">
          <div class="list-header">
            <span></span>
            <span></span>
            <span>Name</span>
            <span class="list-col-items">Contents</span>
            <span class="list-col-updated">Updated</span>
          </div>
          <template v-for="row in flatListRows" :key="row.key">
            <CollectionSetCard
              v-if="row.type === 'set'"
              :item="row.item"
              layout="list"
              :depth="row.depth"
              :has-children="row.hasChildren"
              :expanded="row.expanded"
              :photo-count="recursivePhotoCount(row.item.id)"
              @toggle-expand="toggleExpand(row.item.id)"
              @click="navigateToSet(row.item.id)"
              @drop-collections="onDropCollectionsIntoSet"
            />
            <CollectionCard
              v-else
              :item="row.item"
              type="collection"
              layout="list"
              :depth="row.depth"
              :is-selected="collectionSelection.isSelected(row.item.id)"
              :is-selection-mode="collectionSelection.isSelectionMode.value"
              :selected-ids="collectionSelection.selectedCollectionIds.value"
              @click="
                (_, ev) =>
                  onCollectionCardClick(row.item, ev, flatListCollections)
              "
              @select-toggle="
                () =>
                  collectionSelection.toggleSelectItem(
                    row.item.id,
                    flatListCollections.map((c) => c.id),
                  )
              "
            />
          </template>
        </template>

        <!-- Grid view -->
        <template v-else>
          <!-- Child sets -->
          <CollectionSetCard
            v-for="childSet in currentChildSets"
            :key="`set-${childSet.id}`"
            :item="childSet"
            layout="grid"
            :photo-count="recursivePhotoCount(childSet.id)"
            @click="navigateToSet(childSet.id)"
            @drop-collections="onDropCollectionsIntoSet"
          />

          <!-- Collections in this set -->
          <CollectionCard
            v-for="collection in currentSetCollections"
            :key="`col-${collection.id}`"
            :item="collection"
            type="collection"
            layout="grid"
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
        </template>
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
          <div class="view-toggle">
            <n-button
              text
              class="view-toggle-btn"
              :class="{ 'is-active': viewMode === 'grid' }"
              @click="setViewMode('grid')"
              title="Grid view"
            >
              <template #icon
                ><n-icon size="18"><GridOutline /></n-icon
              ></template>
            </n-button>
            <n-button
              text
              class="view-toggle-btn"
              :class="{ 'is-active': viewMode === 'list' }"
              @click="setViewMode('list')"
              title="List view"
            >
              <template #icon
                ><n-icon size="18"><ReorderFourOutline /></n-icon
              ></template>
            </n-button>
          </div>
          <n-select
            v-model:value="sortType"
            :options="sortOptions"
            style="width: 120px"
            clearable
            placeholder="Sort"
            :filterable="false"
            class="sort-select"
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

      <div
        v-else-if="hasRootContent"
        :class="viewMode === 'list' ? 'card-list' : 'card-grid'"
      >
        <!-- List (tree) view -->
        <template v-if="viewMode === 'list'">
          <div class="list-header">
            <span></span>
            <span></span>
            <span>Name</span>
            <span class="list-col-items">Contents</span>
            <span class="list-col-updated">Updated</span>
          </div>
          <template v-for="row in flatListRows" :key="row.key">
            <CollectionSetCard
              v-if="row.type === 'set'"
              :item="row.item"
              layout="list"
              :depth="row.depth"
              :has-children="row.hasChildren"
              :expanded="row.expanded"
              :photo-count="recursivePhotoCount(row.item.id)"
              @toggle-expand="toggleExpand(row.item.id)"
              @click="navigateToSet(row.item.id)"
              @drop-collections="onDropCollectionsIntoSet"
            />
            <CollectionCard
              v-else
              :item="row.item"
              type="collection"
              layout="list"
              :depth="row.depth"
              :is-selected="collectionSelection.isSelected(row.item.id)"
              :is-selection-mode="collectionSelection.isSelectionMode.value"
              :selected-ids="collectionSelection.selectedCollectionIds.value"
              @click="
                (_, ev) =>
                  onCollectionCardClick(row.item, ev, flatListCollections)
              "
              @select-toggle="
                () =>
                  collectionSelection.toggleSelectItem(
                    row.item.id,
                    flatListCollections.map((c) => c.id),
                  )
              "
            />
          </template>
        </template>

        <!-- Grid view -->
        <template v-else>
          <!-- Create New Collection card -->
          <CreateCard
            title="New Collection"
            subtitle="Start organizing your photos"
            @click="showCreateDialog"
          />

          <!-- Root-level sets -->
          <CollectionSetCard
            v-for="set in rootSets"
            :key="`set-${set.id}`"
            :item="set"
            layout="grid"
            :photo-count="recursivePhotoCount(set.id)"
            @click="navigateToSet(set.id)"
            @drop-collections="onDropCollectionsIntoSet"
          />

          <!-- Root-level collections (not inside any set) -->
          <CollectionCard
            v-for="collection in rootCollections"
            :key="`col-${collection.id}`"
            :item="collection"
            type="collection"
            layout="grid"
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
        </template>
      </div>

      <div v-if="!hasRootContent" class="empty-collections-state">
        <div class="empty-collections-content">
          <n-icon size="64" class="empty-collections-icon">
            <GridOutline />
          </n-icon>
          <h3 class="empty-collections-title">No collections yet</h3>
          <p class="empty-collections-description">
            Create your first collection or set to start organizing your photos.
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

    <!-- Create Collection Dialog -->
    <n-modal
      v-model:show="createDialogVisible"
      preset="dialog"
      :show-icon="false"
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
  ReorderFourOutline,
  FolderOutline,
  FolderOpenOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";
import CollectionCard from "@/components/CollectionCard.vue";
import CollectionSetCard from "@/components/CollectionSetCard.vue";
import CreateCard from "@/components/photos-grid/CreateCard.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useCollectionSelection } from "@/composables/useCollectionSelection.js";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();

// Multi-select for collection cards
const collectionSelection = useCollectionSelection();

// View mode
const showSetView = ref(false);

// Data
const viewingSet = ref(null);

// Edit states for set
const editingSetTitle = ref(false);
const editedSetTitle = ref("");
const isSavingSetTitle = ref(false);

// Dialogs
const createDialogVisible = ref(false);
const createSetDialogVisible = ref(false);
const deleteSetConfirmationVisible = ref(false);
const bulkDeleteConfirmationVisible = ref(false);
const createSetParentId = ref(null);

// View mode: grid (cards) | list
const viewMode = ref(
  localStorage.getItem("collectionsViewMode") === "list" ? "list" : "grid",
);
const setViewMode = (mode) => {
  viewMode.value = mode;
  localStorage.setItem("collectionsViewMode", mode);
};

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
  () => collectionsStore.isLoading || photosStore.isLoading,
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

// Total photos in a set, counting collections in it and all descendant sets
const recursivePhotoCount = (setId) =>
  collectionsStore.recursivePhotoCountOf(setId);

// ── Expandable tree (list view only) ────────────────────────────────────────
const expandedSets = ref(new Set());
const toggleExpand = (setId) => {
  const key = String(setId);
  const next = new Set(expandedSets.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedSets.value = next;
};

// Flatten sets + collections into ordered rows honoring the expanded state
const _buildRows = (sets, collections, depth) => {
  const rows = [];
  for (const s of sets) {
    const childSets = _sortList(collectionsStore.childSetsOf(s.id), "name");
    const childCols = _sortList(
      collectionsStore.collectionsInSet(s.id),
      "title",
    );
    const hasChildren = childSets.length + childCols.length > 0;
    const expanded = expandedSets.value.has(String(s.id));
    rows.push({
      key: `set-${s.id}`,
      type: "set",
      item: s,
      depth,
      hasChildren,
      expanded,
    });
    if (expanded && hasChildren) {
      rows.push(..._buildRows(childSets, childCols, depth + 1));
    }
  }
  for (const c of collections) {
    rows.push({ key: `col-${c.id}`, type: "collection", item: c, depth });
  }
  return rows;
};

const flatListRows = computed(() =>
  showSetView.value
    ? _buildRows(currentChildSets.value, currentSetCollections.value, 0)
    : _buildRows(rootSets.value, rootCollections.value, 0),
);

// Ordered collection items for range-select in the flattened list
const flatListCollections = computed(() =>
  flatListRows.value.filter((r) => r.type === "collection").map((r) => r.item),
);

// Navigation
const backToRoot = () => router.push({ name: "collections" });
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
  const setId = route.params.setId;
  if (setId) {
    const set = collectionsStore.getSetById(setId);
    if (set) {
      viewingSet.value = set;
      showSetView.value = true;
      collectionsStore.clearCurrentCollection();
      return;
    }
  }
  viewingSet.value = null;
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
  [() => route.params.setId, () => collectionsStore.allCollectionSets],
  updateViewState,
);
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.collections-view {
  /* padding: var(--spacing-2xl); */
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

.empty-collections-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 200px);
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

/* .set-header and its rows live in global.scss (SET VIEW HEADER block),
   shared with the series and portfolio set views. */

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

/* View mode toggle (grid / list) */
.view-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--border-radius-md, 8px);
  background: var(--bg-container);
  border: 1px solid var(--border-color);
}

.view-toggle-btn {
  color: var(--text-tertiary);
  border-radius: 6px;
  padding: 4px 8px;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.view-toggle-btn:hover {
  color: var(--text-secondary);
}

.view-toggle-btn.is-active {
  color: var(--primary-color);
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 14%,
    transparent
  );
}

/* List container for collections/sets (details view) */
.card-list {
  /* Shared column template — inherited by row cards via var(--list-cols) */
  --list-cols: 24px 28px minmax(0, 1fr) 250px 120px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.list-header {
  display: grid;
  grid-template-columns: var(--list-cols);
  align-items: center;
  gap: 12px;
  padding: 4px 12px 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .card-list {
    --list-cols: 24px 28px minmax(0, 1fr) auto;
  }
  .list-header .list-col-updated {
    display: none;
  }
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

@media (max-width: 768px) {
  .collections-view {
    padding: var(--spacing-lg);
  }

  /* Sorting is desktop-only for now. The asc/desc toggle goes with it —
     on its own it would be an orphan control with no way to clear the sort.
     The grid/list toggle stays. */
  .sort-select,
  .sort-order-icon {
    display: none;
  }
}
</style>
