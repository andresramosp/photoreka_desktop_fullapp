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
              @click="backToCollections"
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
              Back to Collections
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
          <!-- <p class="detail-meta">
            {{ (viewingCollection.photos || []).length }} photos • Updated
            {{ formatDate(viewingCollection.updatedAt) }}
          </p> -->
        </div>
      </div>

      <!-- Collection Photos Grid -->
      <div class="collection-photos">
        <PhotosGrid
          :collectionId="route.params.id"
          :photos="viewingCollection.photos || []"
          @refreshCollection="refreshCollection"
        />
      </div>
    </div>

    <!-- Collections Grid View (default view) -->
    <div v-else>
      <!-- Header Section -->
      <div class="collections-header">
        <div class="header-content">
          <h1 class="page-title">Collections</h1>
          <p class="page-subtitle">
            Organize your photos into beautiful collections for better
            management and storytelling.
          </p>
        </div>
      </div>

      <!-- Collections Grid -->
      <div v-if="isLoading" class="loading-state">
        <n-spin size="large">
          <div class="loading-text">Loading your collections...</div>
        </n-spin>
      </div>

      <div v-else class="card-grid">
        <!-- Create New Collection Card (only show when there are existing collections) -->
        <div
          v-if="collections.length > 0"
          class="card create-card"
          @click="showCreateDialog"
        >
          <div class="create-preview">
            <div class="create-icon">
              <n-icon size="48" color="var(--primary-color)">
                <AddOutline />
              </n-icon>
            </div>
          </div>
          <div class="card-info">
            <h3 class="card-title">Create New Collection</h3>
            <p class="card-meta">Start organizing your photos</p>
          </div>
        </div>

        <!-- Existing Collections -->
        <div
          v-for="collection in collections"
          :key="collection.id"
          class="action-card"
          @click="openCollection(collection)"
        >
          <div class="card-preview">
            <div class="photo-stack">
              <div
                v-for="(photo, index) in (collection.photos || []).slice(0, 3)"
                :key="photo.id"
                class="photo-item"
                :class="`photo-${index + 1}`"
              >
                <img
                  :src="photo.thumbnailUrl || photo.url"
                  :alt="photo.title || 'Photo'"
                  class="photo-thumbnail"
                  loading="lazy"
                />
              </div>
              <!-- Show empty placeholders if less than 3 photos -->
              <div
                v-for="index in Math.max(
                  0,
                  3 - (collection.photos || []).length,
                )"
                :key="`placeholder-${index}`"
                class="photo-item"
                :class="`photo-${(collection.photos || []).length + index}`"
              >
                <div class="photo-placeholder-empty"></div>
              </div>
            </div>
          </div>
          <div class="card-info">
            <h3 class="card-title">
              {{ collection.name || collection.title }}
            </h3>
            <p class="card-meta">
              {{ (collection.photos || []).length }} photos • Updated
              {{ formatDate(collection.updatedAt) }}
            </p>
          </div>
        </div>

        <!-- Empty State (when no collections exist) -->
        <div v-if="collections.length === 0" class="empty-collections-state">
          <div class="empty-collections-content">
            <n-icon size="64" class="empty-collections-icon">
              <ImagesOutline />
            </n-icon>
            <h3 class="empty-collections-title">No collections yet</h3>
            <p class="empty-collections-description">
              Create your first collection to start organizing your photos into
              beautiful collections.
            </p>
            <n-button
              type="primary"
              @click="showCreateDialog"
              class="create-collection-btn"
            >
              <template #icon>
                <n-icon>
                  <AddOutline />
                </n-icon>
              </template>
              Create Your First Collection
            </n-button>
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
      @positive-click="proceedToPhotoSelection"
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, h } from "vue";
import { useRoute, useRouter } from "vue-router";

defineOptions({
  name: "CollectionsView",
});
import {
  NButton,
  NIcon,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSpin,
  NDropdown,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  ImagesOutline,
  CreateOutline,
  CheckmarkOutline,
  CloseOutline,
  EllipsisVertical,
} from "@vicons/ionicons5";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotosGrid from "@/components/PhotosGrid.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();

// State
const createDialogVisible = ref(false);
const photosDialogVisible = ref(false);
const deleteConfirmationVisible = ref(false);
const formRef = ref(null);
const viewingCollection = ref(null); // Collection being viewed
const showCollectionView = ref(false); // Whether to show collection view or grid view

// Edit states for title and description
const editingTitle = ref(false);
const editingDescription = ref(false);
const editedTitle = ref("");
const editedDescription = ref("");
const isSavingTitle = ref(false);
const isSavingDescription = ref(false);

// Form data
const formData = ref({
  title: "",
  description: "",
});

const formRules = {
  title: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};

// Dropdown options for mobile
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
  if (key === "add-photos") {
    showAddPhotosDialog();
  } else if (key === "delete-collection") {
    showDeleteConfirmation();
  }
};

// Computed para saber si se puede mostrar la grid de colecciones
const isLoading = computed(() => {
  return (
    collectionsStore.isLoading ||
    photosStore.isLoading ||
    !Array.isArray(photosStore.allPhotos) ||
    photosStore.allPhotos.length === 0
  );
});

// Computed properties for store data
const collections = computed(() => collectionsStore.allCollections);

const refreshCollection = async () => {
  await collectionsStore.getOrFetch(true); // Force refresh
  updateViewingCollection();
};

const showCreateDialog = () => {
  formData.value = { title: "", description: "" };
  createDialogVisible.value = true;
};

const proceedToPhotoSelection = async () => {
  try {
    await formRef.value?.validate();
    createDialogVisible.value = false;

    // Crear colección vacía directamente
    const collectionData = {
      title: formData.value.title,
      description: formData.value.description,
      photoIds: [], // Colección vacía
    };

    const newCollection =
      await collectionsStore.createCollection(collectionData);

    message.success(
      `Collection "${formData.value.title}" created successfully`,
    );

    // Limpiar el formulario
    formData.value = { title: "", description: "" };

    // Navegar directamente a la colección recién creada
    router.push({
      name: "collection-detail",
      params: { id: newCollection.id },
    });
  } catch (error) {
    console.error("Error creating collection:", error);
    message.error("Failed to create collection. Please try again.");
  }
};

const showAddPhotosDialog = () => {
  photosDialogVisible.value = true;
};

const onPhotosSelected = async (photoIds) => {
  if (!photoIds || photoIds.length === 0) {
    message.warning("Please select at least one photo");
    return;
  }

  // Solo se usa para añadir fotos a colección existente
  if (showCollectionView.value && viewingCollection.value) {
    try {
      await collectionsStore.addPhotosToCollection(
        viewingCollection.value.id,
        photoIds,
      );

      message.success(
        `Added ${photoIds.length} photo${
          photoIds.length > 1 ? "s" : ""
        } to the collection.`,
      );
      photosDialogVisible.value = false;
      await refreshCollection();
    } catch (error) {
      console.error("Error adding photos to collection:", error);
      message.error("Failed to add photos. Please try again.");
    }
  }
};

const openCollection = (collection) => {
  router.push({ name: "collection-detail", params: { id: collection.id } });
};

const backToCollections = () => {
  router.push({ name: "collections" });
};

const showDeleteConfirmation = () => {
  deleteConfirmationVisible.value = true;
};

const deleteCollection = async () => {
  if (!viewingCollection.value) return;

  try {
    await collectionsStore.deleteCollection(viewingCollection.value.id);

    message.success(
      `Collection "${
        viewingCollection.value.name || viewingCollection.value.title
      }" deleted successfully`,
    );
    deleteConfirmationVisible.value = false;

    // Redirect back to collections
    router.push({ name: "collections" });
  } catch (error) {
    console.error("Error deleting collection:", error);
    message.error("Failed to delete collection. Please try again.");
  }
};

// Edit title methods
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
    updateViewingCollection();
  } catch (error) {
    console.error("Error updating collection name:", error);
    message.error("Failed to update collection name");
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
    updateViewingCollection();
  } catch (error) {
    console.error("Error updating collection description:", error);
    message.error("Failed to update collection description");
  } finally {
    isSavingDescription.value = false;
  }
};

const cancelEditDescription = () => {
  editingDescription.value = false;
  editedDescription.value = "";
};

const formatDate = (date) => {
  return collectionsStore.formatDate(date);
};

// Watch for route changes to update the view
const updateViewingCollection = () => {
  const id = route.params.id;
  if (id && collections.value.length > 0) {
    const collection = collectionsStore.getCollectionWithFullPhotos(
      id,
      photosStore,
    );
    if (collection) {
      viewingCollection.value = collection;
      showCollectionView.value = true;
      collectionsStore.setCurrentCollection(collection);
      return;
    }
  }
  viewingCollection.value = null;
  showCollectionView.value = false;
  collectionsStore.clearCurrentCollection();
};

onMounted(async () => {
  try {
    await photosStore.getOrFetch();
    await collectionsStore.getOrFetch();
    updateViewingCollection();
  } catch (error) {
    console.error("Error loading data:", error);
    message.error("Failed to load collections");
  }
});

watch(
  [() => route.params.id, collections, () => photosStore.allPhotos],
  updateViewingCollection,
);
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.collections-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
}

.collections-header {
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

/* Photo stack styles are in global.scss */

.collection-photos {
  width: 100%;
}

/* Edit mode styles */
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

/* Empty Collections State */
.empty-collections-state {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 400px;
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

/* Header Actions Buttons */
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

/* Mobile Responsive */
@media (max-width: 768px) {
  .collections-view {
    padding: var(--spacing-lg);
  }

  .page-title {
    font-size: var(--font-size-3xl);
  }

  .photo-stack {
    width: 70px;
    height: 70px;
  }

  .photo-item {
    width: 50px;
    height: 50px;
  }

  /* Show mobile menu, hide desktop buttons */
  .desktop-actions {
    display: none;
  }

  .mobile-actions {
    display: flex;
  }

  .detail-header {
    position: relative;
  }

  .detail-back-button {
    font-size: var(--font-size-sm);
  }

  /* Make title and description more compact on mobile */
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
