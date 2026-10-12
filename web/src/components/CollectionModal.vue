<template>
  <n-modal
    v-model:show="showModal"
    preset="dialog"
    :title="modalTitle"
    positive-text="Add"
    negative-text="Cancel"
    :show-icon="false"
    :positive-button-props="{ disabled: isAddDisabled, loading: isAdding }"
    @positive-click="handleAdd"
    @negative-click="handleCancel"
    style="width: 500px"
  >
    <div class="collection-modal-content">
      <!-- Tabs -->
      <n-tabs v-model:value="activeTab" type="line" class="tabs-fill" animated>
        <n-tab-pane name="collections">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <component :is="getIconComponent('GridOutline')" />
              </n-icon>
              Collections
            </span>
          </template>
          <!-- Create New Collection Button -->
          <div class="create-new-card surface-create" @click="showCreateDialog('collection')">
            <n-icon size="24" color="var(--accent-color)">
              <AddOutline />
            </n-icon>
            <div>
              <h4 class="create-new-title">Create New Collection</h4>
              <p class="create-new-subtitle">Add photos to a new collection</p>
            </div>
          </div>

          <p class="modal-description">
            Or select a collection to add {{ photoCount }} photo{{
              photoCount === 1 ? "" : "s"
            }}
            to:
          </p>

          <n-input
            v-model:value="collectionSearch"
            placeholder="Search collections by name..."
            clearable
            class="search-input"
          />

          <div v-if="isLoadingCollections" class="loading-state">
            <SpiralGridLoader variant="primary" :size="40" />
            <span>Loading collections...</span>
          </div>

          <div v-else class="collections-list">
            <!-- Empty state message -->
            <div v-if="collections.length === 0" class="empty-list-message">
              <p>No collections yet. Create your first one above.</p>
            </div>

            <div
              v-else-if="filteredCollections.length === 0"
              class="empty-list-message"
            >
              <p>No collections found with that name.</p>
            </div>

            <!-- Existing Collections -->
            <div
              v-for="collection in filteredCollections"
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

        <n-tab-pane v-if="isSeriesAvailable" name="series">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <component :is="getIconComponent('ListOutline')" />
              </n-icon>
              Series
            </span>
          </template>
          <!-- Create New Series Button -->
          <div class="create-new-card surface-create" @click="showCreateDialog('series')">
            <n-icon size="24" color="var(--accent-color)">
              <AddOutline />
            </n-icon>
            <div>
              <h4 class="create-new-title">Create New Series</h4>
              <p class="create-new-subtitle">Add photos to a new series</p>
            </div>
          </div>

          <p class="modal-description">
            Or select a series to add {{ photoCount }} photo{{
              photoCount === 1 ? "" : "s"
            }}
            to:
          </p>

          <n-input
            v-model:value="seriesSearch"
            placeholder="Search series by name..."
            clearable
            class="search-input"
          />

          <div v-if="isLoadingSeries" class="loading-state">
            <SpiralGridLoader variant="primary" :size="40" />
            <span>Loading series...</span>
          </div>

          <div v-else class="collections-list">
            <!-- Empty state message -->
            <div v-if="seriesList.length === 0" class="empty-list-message">
              <p>No series yet. Create your first one above.</p>
            </div>

            <div
              v-else-if="filteredSeries.length === 0"
              class="empty-list-message"
            >
              <p>No series found with that name.</p>
            </div>

            <!-- Existing Series -->
            <div
              v-for="series in filteredSeries"
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

        <n-tab-pane v-if="isPortfoliosAvailable" name="portfolios">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <component :is="getIconComponent('BriefcaseOutline')" />
              </n-icon>
              Portfolios
            </span>
          </template>
          <!-- Create New Portfolio Button -->
          <div class="create-new-card surface-create" @click="showCreateDialog('portfolio')">
            <n-icon size="24" color="var(--accent-color)">
              <AddOutline />
            </n-icon>
            <div>
              <h4 class="create-new-title">Create New Portfolio</h4>
              <p class="create-new-subtitle">Add photos to a new portfolio</p>
            </div>
          </div>

          <p class="modal-description">
            Or select a portfolio to add {{ photoCount }} photo{{
              photoCount === 1 ? "" : "s"
            }}
            to:
          </p>

          <n-input
            v-model:value="portfolioSearch"
            placeholder="Search portfolios by name..."
            clearable
            class="search-input"
          />

          <div v-if="isLoadingPortfolios" class="loading-state">
            <SpiralGridLoader variant="primary" :size="40" />
            <span>Loading portfolios...</span>
          </div>

          <div v-else class="collections-list">
            <!-- Empty state message -->
            <div v-if="portfolios.length === 0" class="empty-list-message">
              <p>No portfolios yet. Create your first one above.</p>
            </div>

            <div
              v-else-if="filteredPortfolios.length === 0"
              class="empty-list-message"
            >
              <p>No portfolios found with that name.</p>
            </div>

            <!-- Existing Portfolios -->
            <div
              v-for="portfolio in filteredPortfolios"
              :key="portfolio.id"
              class="collection-item"
              :class="{ selected: selectedPortfolio?.id === portfolio.id }"
              @click="selectedPortfolio = portfolio"
            >
              <div class="collection-info">
                <h4 class="collection-name">{{ portfolio.name }}</h4>
                <p class="collection-description">
                  {{ portfolio.description || "No description" }}
                </p>
                <span class="collection-count"
                  >{{ portfolio.photoCount || 0 }} photos</span
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
      :show-icon="false"
      :title="createDialogLabels.title"
      :positive-text="createDialogLabels.positiveText"
      negative-text="Cancel"
      :positive-button-props="{ loading: isCreating }"
      @positive-click="createNew"
      @negative-click="createDialogVisible = false"
    >
      <div class="create-form">
        <n-form ref="formRef" :model="formData" :rules="formRules">
          <n-form-item label="Name" path="title">
            <n-input
              v-model:value="formData.title"
              :placeholder="createDialogLabels.placeholder"
              :maxlength="createDialogLabels.nameMaxLength"
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
  useMessage,
  useNotification,
  NIcon,
  NForm,
  NFormItem,
  NInput,
  NTabs,
  NTabPane,
} from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import { AddOutline } from "@vicons/ionicons5";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds.js";
import { useToolsAvailability } from "@/composables/useToolsAvailability.js";
import { getIconComponent } from "@/config/toolsConfig.js";

const emit = defineEmits([
  "add-to-collection",
  "add-to-series",
  "add-to-portfolio",
  "cancel",
  "navigate",
]);
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
  // Which tab to open on ("collections", "series", "portfolios")
  initialTab: {
    type: String,
    default: "collections",
  },
});

const message = useMessage();
const notification = useNotification();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const portfolioBuildsStore = usePortfolioBuildsStore();
const router = useRouter();
const { isAvailable: isToolAvailable } = useToolsAvailability();

// Local state
const showModal = ref(false);
const activeTab = ref("collections");
const selectedCollection = ref(null);
const selectedSeries = ref(null);
const selectedPortfolio = ref(null);
const createDialogVisible = ref(false);
const createDialogType = ref("collection"); // 'collection' | 'series' | 'portfolio'
// Loading flags for the footer confirm buttons (real API waits).
const isAdding = ref(false);
const isCreating = ref(false);
const formRef = ref(null);
const collectionSearch = ref("");
const seriesSearch = ref("");
const portfolioSearch = ref("");

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
const isLoadingPortfolios = computed(() => portfolioBuildsStore.isLoading);
// Only completed builds can take new photos — the layout of a build still
// running is overwritten when it finishes.
const portfolios = computed(() =>
  portfolioBuildsStore.allBuilds
    .filter((build) => build.status === "completed")
    .map((build) => ({
      id: build.id,
      name: build.config?.name || `Portfolio #${build.id}`,
      description: build.config?.description || "",
      photoCount: build.resultCount ?? (build.photoItems || []).length,
    })),
);
const isSeriesAvailable = computed(() => isToolAvailable("series"));
const isPortfoliosAvailable = computed(() => isToolAvailable("portfolios"));
const modalTitle = computed(() => {
  if (activeTab.value === "series") return "Add to Series";
  if (activeTab.value === "portfolios") return "Add to Portfolio";
  return "Add to Collection";
});
const isAddDisabled = computed(() => {
  if (activeTab.value === "series") return !selectedSeries.value;
  if (activeTab.value === "portfolios") return !selectedPortfolio.value;
  return !selectedCollection.value;
});
const createDialogLabels = computed(() => {
  if (createDialogType.value === "series") {
    return {
      title: "Create New Series",
      positiveText: "Create Series",
      placeholder: "Enter series name...",
      nameMaxLength: 100,
    };
  }
  if (createDialogType.value === "portfolio") {
    return {
      title: "Create New Portfolio",
      positiveText: "Create Portfolio",
      placeholder: "Enter portfolio name...",
      nameMaxLength: 200,
    };
  }
  return {
    title: "Create New Collection",
    positiveText: "Create Collection",
    placeholder: "Enter collection name...",
    nameMaxLength: 100,
  };
});
const isTabAvailable = (tab) => {
  if (tab === "series") return isSeriesAvailable.value;
  if (tab === "portfolios") return isPortfoliosAvailable.value;
  return true;
};
const filteredCollections = computed(() => {
  const term = collectionSearch.value.trim().toLowerCase();
  if (!term) {
    return collections.value;
  }

  return collections.value.filter((collection) =>
    (collection.name || "").toLowerCase().includes(term),
  );
});
const filteredSeries = computed(() => {
  const term = seriesSearch.value.trim().toLowerCase();
  if (!term) {
    return seriesList.value;
  }

  return seriesList.value.filter((series) => {
    const seriesName = (series.name || series.title || "").toLowerCase();
    return seriesName.includes(term);
  });
});
const filteredPortfolios = computed(() => {
  const term = portfolioSearch.value.trim().toLowerCase();
  if (!term) {
    return portfolios.value;
  }

  return portfolios.value.filter((portfolio) =>
    portfolio.name.toLowerCase().includes(term),
  );
});

// Watch for show prop changes
watch(
  () => props.show,
  (newShow) => {
    showModal.value = newShow;
    if (newShow) {
      activeTab.value = isTabAvailable(props.initialTab)
        ? props.initialTab
        : "collections";
      selectedCollection.value = null;
      selectedSeries.value = null;
      selectedPortfolio.value = null;
      collectionSearch.value = "";
      seriesSearch.value = "";
      portfolioSearch.value = "";
      loadData();
    }
  },
  { immediate: true },
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
  } else if (newTab === "portfolios" && !portfolioBuildsStore.hasBeenLoaded) {
    loadPortfolios();
  }
});

// Watch for series availability change - switch tab if series becomes unavailable
watch(isSeriesAvailable, (available) => {
  if (!available && activeTab.value === "series") {
    activeTab.value = "collections";
  }
});

// Watch for portfolios availability change - switch tab if portfolios becomes unavailable
watch(isPortfoliosAvailable, (available) => {
  if (!available && activeTab.value === "portfolios") {
    activeTab.value = "collections";
  }
});

// Methods
const loadData = async () => {
  const tasks = [loadCollections(), loadSeries()];
  if (isPortfoliosAvailable.value) tasks.push(loadPortfolios());
  await Promise.all(tasks);
};

const loadCollections = async () => {
  try {
    await collectionsStore.getOrFetch();
  } catch (error) {
    console.error("Error loading collections:", error);
  }
};

const loadSeries = async () => {
  try {
    await seriesStore.getOrFetch();
  } catch (error) {
    console.error("Error loading series:", error);
  }
};

const loadPortfolios = async () => {
  try {
    await portfolioBuildsStore.getOrFetch();
  } catch (error) {
    console.error("Error loading portfolios:", error);
  }
};

const handleAdd = async () => {
  isAdding.value = true;
  try {
    if (activeTab.value === "collections") {
      await handleAddToCollection();
    } else if (activeTab.value === "series") {
      await handleAddToSeries();
    } else if (activeTab.value === "portfolios") {
      await handleAddToPortfolio();
    }
  } finally {
    isAdding.value = false;
  }
  // Keep the dialog open on failure; the add handlers close it on success.
  return false;
};

// Notification action shared by every "photos added" toast below: a link-styled
// button that navigates to the destination that just received the photos.
const viewButton = (label, path) =>
  h(
    "button",
    {
      style: {
        color: "var(--accent-color)",
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
        emit("navigate", path);
        router.push(path);
      },
    },
    label,
  );

const handleAddToCollection = async () => {
  if (selectedCollection.value && props.photoIds.length > 0) {
    try {
      await collectionsStore.addPhotosToCollection(
        selectedCollection.value.id,
        props.photoIds,
      );
      const collection = selectedCollection.value;
      notification.success({
        title: "Photos added to collection",
        content: `Successfully added ${props.photoCount} photo${
          props.photoCount === 1 ? "" : "s"
        } to "${collection.name}"`,
        action: () =>
          viewButton("View collection", `/collections/${collection.id}`),
        duration: 5000,
      });

      emit("add-to-collection", {
        collection,
        photoIds: props.photoIds,
      });
      handleCancel();
    } catch (error) {
      console.error("Error adding photos to collection:", error);
    }
  }
};

const handleAddToSeries = async () => {
  if (selectedSeries.value && props.photoIds.length > 0) {
    try {
      // Use ordered photo IDs if available (respects horizontal alignment order)
      const photoIdsToAdd = props.photoIds;
      await seriesStore.addPhotosToSeries(
        selectedSeries.value.id,
        photoIdsToAdd,
      );
      const series = selectedSeries.value;
      notification.success({
        title: "Photos added to series",
        content: `Successfully added ${props.photoCount} photo${
          props.photoCount === 1 ? "" : "s"
        } to "${series.name || series.title}"`,
        action: () => viewButton("View series", `/series/${series.id}`),
        duration: 5000,
      });

      emit("add-to-series", {
        series,
        photoIds: photoIdsToAdd,
      });
      handleCancel();
    } catch (error) {
      console.error("Error adding photos to series:", error);
    }
  }
};

const handleAddToPortfolio = async () => {
  if (!selectedPortfolio.value || props.photoIds.length === 0) return;

  try {
    const portfolio = selectedPortfolio.value;
    const { added } = await portfolioBuildsStore.addPhotosToBuild(
      portfolio.id,
      props.photoIds,
    );

    if (added === 0) {
      message.info(
        props.photoCount === 1
          ? "That photo is already in this portfolio"
          : "Those photos are already in this portfolio",
      );
      handleCancel();
      return;
    }

    notification.success({
      title: "Photos added to portfolio",
      content: `Successfully added ${added} photo${
        added === 1 ? "" : "s"
      } to "${portfolio.name}"`,
      action: () => viewButton("View portfolio", `/portfolios/${portfolio.id}`),
      duration: 5000,
    });

    emit("add-to-portfolio", {
      portfolio,
      photoIds: props.photoIds,
    });
    handleCancel();
  } catch (error) {
    console.error("Error adding photos to portfolio:", error);
  }
};

const showCreateDialog = (type) => {
  formData.value = { title: "", description: "" };
  createDialogType.value = type;
  createDialogVisible.value = true;
};

const createNew = async () => {
  isCreating.value = true;
  try {
    if (createDialogType.value === "collection") {
      await createNewCollection();
    } else if (createDialogType.value === "portfolio") {
      await createNewPortfolio();
    } else {
      await createNewSeries();
    }
  } finally {
    isCreating.value = false;
  }
  // Keep the create dialog open on validation/API failure; the create
  // handlers close it themselves on success.
  return false;
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

    const newCollection =
      await collectionsStore.createCollection(collectionData);

    notification.success({
      title: "Collection created and photos added",
      content: `Successfully created "${formData.value.title}" with ${
        props.photoCount
      } photo${props.photoCount === 1 ? "" : "s"}`,
      action: () =>
        viewButton("View collection", `/collections/${newCollection.id}`),
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
  }
};

const createNewSeries = async () => {
  try {
    await formRef.value?.validate();

    // Use ordered photo IDs if available (respects horizontal alignment order)
    const photoIdsToAdd = props.photoIds;

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
      action: () => viewButton("View series", `/series/${newSeries.id}`),
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
  }
};

const createNewPortfolio = async () => {
  try {
    await formRef.value?.validate();

    // Manually-curated portfolios are created empty and then filled through the
    // same layout endpoint the portfolio detail view uses.
    const name = formData.value.title.trim();
    const { buildId } = await portfolioBuildsStore.createManual({
      name,
      description: formData.value.description.trim() || undefined,
    });
    const { added } = await portfolioBuildsStore.addPhotosToBuild(
      buildId,
      props.photoIds,
    );

    // The freshly created portfolio isn't in the cached list yet.
    await portfolioBuildsStore.fetchBuilds();

    notification.success({
      title: "Portfolio created and photos added",
      content: `Successfully created "${name}" with ${added} photo${
        added === 1 ? "" : "s"
      }`,
      action: () => viewButton("View portfolio", `/portfolios/${buildId}`),
      duration: 5000,
    });

    emit("add-to-portfolio", {
      portfolio: { id: buildId, name },
      photoIds: props.photoIds,
    });

    // Reset form and close dialogs
    formData.value = { title: "", description: "" };
    createDialogVisible.value = false;
    handleCancel();
  } catch (error) {
    console.error("Error creating portfolio:", error);
  }
};

const handleCancel = () => {
  showModal.value = false;
  selectedCollection.value = null;
  selectedSeries.value = null;
  selectedPortfolio.value = null;
  collectionSearch.value = "";
  seriesSearch.value = "";
  portfolioSearch.value = "";
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
  color: var(--text-secondary);
  margin-bottom: 20px;
  margin-top: 16px;
  font-size: 14px;
}

.search-input {
  margin-bottom: 12px;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  padding: 40px 0;
  color: var(--text-primary);
}

.empty-collections {
  text-align: center;
  padding: 40px 0;
  color: var(--text-primary);
}

.empty-list-message {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-primary);
  font-size: 14px;
}

.empty-list-message p {
  margin: 0;
}

.collections-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-body);
}

.collection-item {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
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
  border-color: var(--accent-color);
}

/* Standalone "create new" card that sits above the search + list */
.create-new-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  margin-top: 16px;
  border-radius: 8px;
}

.create-new-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-color);
  margin: 0;
}

.create-new-subtitle {
  font-size: 12px;
  color: var(--text-primary);
  margin: 0;
}

.collection-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.collection-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.collection-description {
  font-size: 12px;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 380px;
}

.collection-count {
  font-size: 12px;
  color: var(--accent-color);
  font-weight: 500;
}

/* Create Form Styles */
.create-form {
  padding-top: 16px;
}

/* Tabs Styles — same line tabs used in the Import Area (Lightbox / Analyses) */
:deep(.n-tabs .n-tab-pane) {
  padding-top: 0;
}

.tab-title {
  display: flex;
  justify-content: center;
  gap: 5px;
  align-items: center;
}

:deep(.n-tabs-nav) {
  background-color: var(--bg-container);
}

:deep(.n-tabs-tab) {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  padding: var(--spacing-md) var(--spacing-xl);
  transition: var(--transition-fast);
}

:deep(.n-tabs-tab:hover) {
  color: var(--text-primary);
}

:deep(.n-tabs-tab--active) {
  color: var(--text-primary) !important;
}

:deep(.n-tabs-bar) {
  background-color: var(--primary-color) !important;
}
</style>
