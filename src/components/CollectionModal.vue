<template>
  <n-modal
    v-model:show="showModal"
    preset="dialog"
    :title="activeTab === 'collections' ? 'Add to Collection' : 'Add to Series'"
    positive-text="Add"
    negative-text="Cancel"
    :positive-button-props="{
      disabled:
        activeTab === 'collections' ? !selectedCollection : !selectedSeries,
    }"
    @positive-click="handleAdd"
    @negative-click="handleCancel"
    style="width: 500px"
  >
    <div class="collection-modal-content">
      <!-- Tabs -->
      <n-tabs v-model:value="activeTab" type="segment" animated>
        <n-tab-pane name="collections" tab="Collections">
          <p class="modal-description">
            Select a collection to add {{ photoCount }} photo{{
              photoCount === 1 ? "" : "s"
            }}
            to:
          </p>

          <div v-if="isLoadingCollections" class="loading-state">
            <n-spin size="medium" />
            <span>Loading collections...</span>
          </div>

          <div v-else-if="collections.length === 0" class="empty-collections">
            <p>No collections found. Create a collection first.</p>
          </div>

          <div v-else class="collections-list">
            <!-- Create New Collection Button -->
            <div
              class="collection-item create-new-collection"
              @click="showCreateDialog('collection')"
            >
              <div class="collection-info">
                <div class="create-collection-content">
                  <n-icon size="24" color="#8b5cf6">
                    <AddOutline />
                  </n-icon>
                  <div>
                    <h4 class="collection-name">Create New Collection</h4>
                    <p class="collection-description">
                      Add photos to a new collection
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Existing Collections -->
            <div
              v-for="collection in collections"
              :key="collection.id"
              class="collection-item"
              :class="{ selected: selectedCollection?.id === collection.id }"
              @click="selectedCollection = collection"
            >
              <div class="collection-info">
                <h4 class="collection-name">{{ collection.name }}</h4>
                <p class="collection-description">
                  {{ collection.description || "No description" }}
                </p>
                <span class="collection-count"
                  >{{ collection.photoCount || 0 }} photos</span
                >
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="series" tab="Series">
          <p class="modal-description">
            Select a series to add {{ photoCount }} photo{{
              photoCount === 1 ? "" : "s"
            }}
            to:
          </p>

          <div v-if="isLoadingSeries" class="loading-state">
            <n-spin size="medium" />
            <span>Loading series...</span>
          </div>

          <div v-else-if="seriesList.length === 0" class="empty-collections">
            <p>No series found. Create a series first.</p>
          </div>

          <div v-else class="collections-list">
            <!-- Create New Series Button -->
            <div
              class="collection-item create-new-collection"
              @click="showCreateDialog('series')"
            >
              <div class="collection-info">
                <div class="create-collection-content">
                  <n-icon size="24" color="#8b5cf6">
                    <AddOutline />
                  </n-icon>
                  <div>
                    <h4 class="collection-name">Create New Series</h4>
                    <p class="collection-description">
                      Add photos to a new series
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Existing Series -->
            <div
              v-for="series in seriesList"
              :key="series.id"
              class="collection-item"
              :class="{ selected: selectedSeries?.id === series.id }"
              @click="selectedSeries = series"
            >
              <div class="collection-info">
                <h4 class="collection-name">
                  {{ series.name || series.title }}
                </h4>
                <p class="collection-description">
                  {{ series.description || "No description" }}
                </p>
                <span class="collection-count"
                  >{{ series.photoCount || 0 }} photos</span
                >
              </div>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>

    <!-- Create Collection/Series Dialog -->
    <n-modal
      v-model:show="createDialogVisible"
      preset="dialog"
      :title="
        createDialogType === 'collection'
          ? 'Create New Collection'
          : 'Create New Series'
      "
      :positive-text="
        createDialogType === 'collection'
          ? 'Create Collection'
          : 'Create Series'
      "
      negative-text="Cancel"
      @positive-click="createNew"
      @negative-click="createDialogVisible = false"
    >
      <div class="create-form">
        <n-form ref="formRef" :model="formData" :rules="formRules">
          <n-form-item label="Name" path="title">
            <n-input
              v-model:value="formData.title"
              :placeholder="
                createDialogType === 'collection'
                  ? 'Enter collection name...'
                  : 'Enter series name...'
              "
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
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, h } from "vue";
import { useRouter } from "vue-router";
import {
  NModal,
  NSpin,
  useMessage,
  useNotification,
  NIcon,
  NForm,
  NFormItem,
  NInput,
  NTabs,
  NTabPane,
} from "naive-ui";
import { AddOutline } from "@vicons/ionicons5";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";

const emit = defineEmits(["add-to-collection", "add-to-series", "cancel"]);
const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  photoCount: {
    type: Number,
    default: 0,
  },
  photoIds: {
    type: Array,
    default: () => [],
  },
  // Optional: photo positions from canvas for ordering in series
  // Format: { [photoId]: { x: number, y: number } }
  photoPositions: {
    type: Object,
    default: null,
  },
});

const message = useMessage();
const notification = useNotification();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const router = useRouter();

// Local state
const showModal = ref(false);
const activeTab = ref("collections");
const selectedCollection = ref(null);
const selectedSeries = ref(null);
const createDialogVisible = ref(false);
const createDialogType = ref("collection"); // 'collection' or 'series'
const formRef = ref(null);

// Form data for creating new collection/series
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

// Computed properties
const collections = computed(() => collectionsStore.allCollections);
const isLoadingCollections = computed(() => collectionsStore.isLoading);
const seriesList = computed(() => seriesStore.allSeries);
const isLoadingSeries = computed(() => seriesStore.isLoading);

// Get photo IDs ordered by horizontal position (for series)
// Always orders by X position (left to right) when positions are available
const orderedPhotoIdsForSeries = computed(() => {
  if (!props.photoPositions || props.photoIds.length <= 1) {
    return props.photoIds;
  }

  // Get positions for selected photos (handle both string and number IDs)
  const photosWithPositions = props.photoIds
    .filter((id) => {
      // Check with both string and original type
      return props.photoPositions[id] || props.photoPositions[String(id)];
    })
    .map((id) => {
      const pos = props.photoPositions[id] || props.photoPositions[String(id)];
      return {
        id,
        x: pos.x,
        y: pos.y,
      };
    });

  if (photosWithPositions.length <= 1) {
    return props.photoIds;
  }

  // Sort by X position (left to right) - no Y alignment check needed
  const sorted = [...photosWithPositions].sort((a, b) => a.x - b.x);
  return sorted.map((p) => p.id);
});

// Watch for show prop changes
watch(
  () => props.show,
  (newShow) => {
    showModal.value = newShow;
    if (newShow) {
      selectedCollection.value = null;
      selectedSeries.value = null;
      loadData();
    }
  },
  { immediate: true }
);

// Watch for modal close
watch(showModal, (newShow) => {
  if (!newShow && props.show) {
    emit("cancel");
  }
});

// Watch for tab change to load data if needed
watch(activeTab, (newTab) => {
  if (newTab === "collections" && !collectionsStore.hasBeenLoaded) {
    loadCollections();
  } else if (newTab === "series" && !seriesStore.hasBeenLoaded) {
    loadSeries();
  }
});

// Methods
const loadData = async () => {
  await Promise.all([loadCollections(), loadSeries()]);
};

const loadCollections = async () => {
  try {
    await collectionsStore.getOrFetch();
  } catch (error) {
    console.error("Error loading collections:", error);
    message.error("Failed to load collections");
  }
};

const loadSeries = async () => {
  try {
    await seriesStore.getOrFetch();
  } catch (error) {
    console.error("Error loading series:", error);
    message.error("Failed to load series");
  }
};

const handleAdd = async () => {
  if (activeTab.value === "collections") {
    await handleAddToCollection();
  } else {
    await handleAddToSeries();
  }
};

const handleAddToCollection = async () => {
  if (selectedCollection.value && props.photoIds.length > 0) {
    try {
      await collectionsStore.addPhotosToCollection(
        selectedCollection.value.id,
        props.photoIds
      );
      const collection = selectedCollection.value;
      notification.success({
        title: "Photos added to collection",
        content: `Successfully added ${props.photoCount} photo${
          props.photoCount === 1 ? "" : "s"
        } to "${collection.name}"`,
        action: () =>
          h(
            "button",
            {
              style: {
                color: "#8b5cf6",
                textDecoration: "none",
                fontWeight: "600",
                padding: "6px 12px",
                background: "rgba(139, 92, 246, 0.1)",
                borderRadius: "6px",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                transition: "all 0.2s ease",
                cursor: "pointer",
              },
              onMouseover: (e) => {
                e.target.style.background = "rgba(139, 92, 246, 0.2)";
              },
              onMouseout: (e) => {
                e.target.style.background = "rgba(139, 92, 246, 0.1)";
              },
              onClick: () => {
                router.push(`/collections/${collection.id}`);
              },
            },
            "View collection"
          ),
        duration: 5000,
      });

      emit("add-to-collection", {
        collection,
        photoIds: props.photoIds,
      });
      handleCancel();
    } catch (error) {
      console.error("Error adding photos to collection:", error);
      message.error("Failed to add photos to collection");
    }
  }
};

const handleAddToSeries = async () => {
  if (selectedSeries.value && props.photoIds.length > 0) {
    try {
      // Use ordered photo IDs if available (respects horizontal alignment order)
      const photoIdsToAdd = orderedPhotoIdsForSeries.value;
      await seriesStore.addPhotosToSeries(
        selectedSeries.value.id,
        photoIdsToAdd
      );
      const series = selectedSeries.value;
      notification.success({
        title: "Photos added to series",
        content: `Successfully added ${props.photoCount} photo${
          props.photoCount === 1 ? "" : "s"
        } to "${series.name || series.title}"`,
        action: () =>
          h(
            "button",
            {
              style: {
                color: "#8b5cf6",
                textDecoration: "none",
                fontWeight: "600",
                padding: "6px 12px",
                background: "rgba(139, 92, 246, 0.1)",
                borderRadius: "6px",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                transition: "all 0.2s ease",
                cursor: "pointer",
              },
              onMouseover: (e) => {
                e.target.style.background = "rgba(139, 92, 246, 0.2)";
              },
              onMouseout: (e) => {
                e.target.style.background = "rgba(139, 92, 246, 0.1)";
              },
              onClick: () => {
                router.push(`/series/${series.id}`);
              },
            },
            "View series"
          ),
        duration: 5000,
      });

      emit("add-to-series", {
        series,
        photoIds: photoIdsToAdd,
      });
      handleCancel();
    } catch (error) {
      console.error("Error adding photos to series:", error);
      message.error("Failed to add photos to series");
    }
  }
};

const showCreateDialog = (type) => {
  formData.value = { title: "", description: "" };
  createDialogType.value = type;
  createDialogVisible.value = true;
};

const createNew = async () => {
  if (createDialogType.value === "collection") {
    await createNewCollection();
  } else {
    await createNewSeries();
  }
};

const createNewCollection = async () => {
  try {
    await formRef.value?.validate();

    // Create collection with the selected photos
    const collectionData = {
      title: formData.value.title,
      description: formData.value.description,
      photoIds: props.photoIds,
    };

    const newCollection = await collectionsStore.createCollection(
      collectionData
    );

    notification.success({
      title: "Collection created and photos added",
      content: `Successfully created "${formData.value.title}" with ${
        props.photoCount
      } photo${props.photoCount === 1 ? "" : "s"}`,
      action: () =>
        h(
          "button",
          {
            style: {
              color: "#8b5cf6",
              textDecoration: "none",
              fontWeight: "600",
              padding: "6px 12px",
              background: "rgba(139, 92, 246, 0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              transition: "all 0.2s ease",
              cursor: "pointer",
            },
            onMouseover: (e) => {
              e.target.style.background = "rgba(139, 92, 246, 0.2)";
            },
            onMouseout: (e) => {
              e.target.style.background = "rgba(139, 92, 246, 0.1)";
            },
            onClick: () => {
              router.push(`/collections/${newCollection.id}`);
            },
          },
          "View collection"
        ),
      duration: 5000,
    });

    emit("add-to-collection", {
      collection: newCollection,
      photoIds: props.photoIds,
    });

    // Reset form and close dialogs
    formData.value = { title: "", description: "" };
    createDialogVisible.value = false;
    handleCancel();
  } catch (error) {
    console.error("Error creating collection:", error);
    message.error("Failed to create collection. Please try again.");
  }
};

const createNewSeries = async () => {
  try {
    await formRef.value?.validate();

    // Use ordered photo IDs if available (respects horizontal alignment order)
    const photoIdsToAdd = orderedPhotoIdsForSeries.value;

    // Create series with the selected photos
    const seriesData = {
      title: formData.value.title,
      description: formData.value.description,
      photoIds: photoIdsToAdd,
    };

    const newSeries = await seriesStore.createSeries(seriesData);

    notification.success({
      title: "Series created and photos added",
      content: `Successfully created "${formData.value.title}" with ${
        props.photoCount
      } photo${props.photoCount === 1 ? "" : "s"}`,
      action: () =>
        h(
          "button",
          {
            style: {
              color: "#8b5cf6",
              textDecoration: "none",
              fontWeight: "600",
              padding: "6px 12px",
              background: "rgba(139, 92, 246, 0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              transition: "all 0.2s ease",
              cursor: "pointer",
            },
            onMouseover: (e) => {
              e.target.style.background = "rgba(139, 92, 246, 0.2)";
            },
            onMouseout: (e) => {
              e.target.style.background = "rgba(139, 92, 246, 0.1)";
            },
            onClick: () => {
              router.push(`/series/${newSeries.id}`);
            },
          },
          "View series"
        ),
      duration: 5000,
    });

    emit("add-to-series", {
      series: newSeries,
      photoIds: photoIdsToAdd,
    });

    // Reset form and close dialogs
    formData.value = { title: "", description: "" };
    createDialogVisible.value = false;
    handleCancel();
  } catch (error) {
    console.error("Error creating series:", error);
    message.error("Failed to create series. Please try again.");
  }
};

const handleCancel = () => {
  showModal.value = false;
  selectedCollection.value = null;
  selectedSeries.value = null;
  createDialogVisible.value = false;
  formData.value = { title: "", description: "" };
  emit("cancel");
};
</script>

<style scoped>
/* Collection Modal Styles */
.collection-modal-content {
  padding: 16px 0;
}

.modal-description {
  color: #ffffffd1;
  margin-bottom: 20px;
  margin-top: 16px;
  font-size: 14px;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  padding: 40px 0;
  color: #ffffff73;
}

.empty-collections {
  text-align: center;
  padding: 40px 0;
  color: #ffffff73;
}

.collections-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #2c2c32;
  border-radius: 8px;
  background-color: #1a1a1f;
}

.collection-item {
  padding: 16px;
  border-bottom: 1px solid #2c2c32;
  cursor: pointer;
  transition: all 0.2s ease;
}

.collection-item:last-child {
  border-bottom: none;
}

.collection-item:hover {
  background-color: rgba(139, 92, 246, 0.1);
}

.collection-item.selected {
  background-color: rgba(139, 92, 246, 0.2);
  border-color: #8b5cf6;
}

.collection-item.create-new-collection {
  border: 2px dashed #2c2c32;
  background-color: rgba(139, 92, 246, 0.05);
}

.collection-item.create-new-collection:hover {
  border-color: #8b5cf6;
  background-color: rgba(139, 92, 246, 0.1);
}

.create-collection-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.create-collection-content .collection-name {
  color: #8b5cf6;
  font-weight: 600;
}

.create-collection-content .collection-description {
  color: #ffffff73;
}

.collection-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.collection-name {
  font-size: 16px;
  font-weight: 600;
  color: #ffffffd1;
  margin: 0;
}

.collection-description {
  font-size: 14px;
  color: #ffffff73;
  margin: 0;
}

.collection-count {
  font-size: 12px;
  color: #8b5cf6;
  font-weight: 500;
}

/* Create Form Styles */
.create-form {
  padding-top: 16px;
}

/* Tabs Styles */
:deep(.n-tabs .n-tab-pane) {
  padding-top: 0;
}
</style>
