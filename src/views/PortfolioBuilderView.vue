<template>
  <div class="portfolio-builder-view view-container">
    <!-- Loading state -->
    <div v-if="isLoading" class="loading-state">
      <SpiralGridLoader variant="primary" :size="48" />
    </div>

    <!-- Set View -->
    <div v-else-if="showSetView && viewingSet" class="set-view">
      <div class="set-header">
        <div class="breadcrumb">
          <n-button
            text
            class="breadcrumb-item"
            :class="{ 'breadcrumb-drop-target': breadcrumbDragOver === 'root' }"
            @click="backToRoot"
            @dragover.prevent="onBreadcrumbDragOver('root', $event)"
            @dragleave="onBreadcrumbDragLeave($event)"
            @drop.prevent="onBreadcrumbDrop(null, $event)"
          >
            <template #icon>
              <n-icon><GridOutline /></n-icon>
            </template>
            Portfolios
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
              @dragleave="onBreadcrumbDragLeave($event)"
              @drop.prevent="onBreadcrumbDrop(crumb.id, $event)"
            >
              {{ crumb.name }}
            </n-button>
          </template>
        </div>

        <div class="set-title-row">
          <div v-if="!editingSetTitle" class="title-display">
            <h1 class="detail-title">{{ viewingSet.name }}</h1>
            <n-button text class="edit-button" @click="startEditSetTitle">
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
              v-if="portfolioSelection.isSelectionMode.value"
              type="error"
              ghost
              @click="showBulkDeleteConfirmation"
            >
              Delete Selected ({{
                portfolioSelection.selectedIds.value.length
              }})
            </n-button>
            <n-button type="primary" ghost @click="openWizardInSet">
              <template #icon>
                <n-icon><SparklesOutline /></n-icon>
              </template>
              New Portfolio
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

      <div v-if="setIsEmpty" class="portfolio-placeholder compact">
        <div class="placeholder-content">
          <n-icon :size="64" color="var(--text-tertiary)">
            <FolderOpenOutline />
          </n-icon>
          <h3 class="placeholder-title">This set is empty</h3>
          <p class="placeholder-description">
            Add sets or portfolios to organize your work.
          </p>
          <div class="placeholder-actions">
            <n-button type="primary" @click="openWizardInSet">
              <template #icon>
                <n-icon><SparklesOutline /></n-icon>
              </template>
              New Portfolio
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
          item-type="portfolio"
          content-label="portfolio"
          @click="navigateToSet(childSet.id)"
          @drop-items="onDropBuildsIntoSet"
        />

        <CollectionCard
          v-for="item in currentSetItems"
          :key="item.id"
          :item="item"
          type="collection"
          drag-type="portfolio"
          item-label="portfolio"
          :show-update-date="false"
          :is-selected="portfolioSelection.isSelected(item.id)"
          :is-selection-mode="portfolioSelection.isSelectionMode.value"
          :selected-ids="portfolioSelection.selectedIds.value"
          @click="(_, ev) => onPortfolioCardClick(item, ev, currentSetItems)"
          @select-toggle="
            () =>
              portfolioSelection.toggleSelectItem(
                item.id,
                currentSetItems.map((p) => p.id),
              )
          "
        />
      </div>
    </div>

    <!-- Empty state placeholder -->
    <div v-else-if="!hasRootContent" class="portfolio-placeholder">
      <div class="placeholder-content">
        <n-icon
          :size="64"
          color="var(--text-tertiary)"
          class="placeholder-icon"
        >
          <component :is="PortfolioIcon" />
        </n-icon>

        <h3 class="placeholder-title">Build Your First Portfolio</h3>
        <p class="placeholder-description">
          Let AI analyze your catalog and curate a polished portfolio that
          showcases your strongest work.
        </p>

        <div class="feature-hints">
          <div class="feature-hint-item">
            <n-icon :size="20">
              <SparklesOutline />
            </n-icon>
            <div class="feature-hint-text">
              <strong>AI-Curated Selection</strong>
              <span
                >Intelligent photo selection based on quality & diversity</span
              >
            </div>
          </div>

          <div class="feature-hint-item">
            <n-icon :size="20">
              <ImagesOutline />
            </n-icon>
            <div class="feature-hint-text">
              <strong>Cohesive Layout</strong>
              <span>Automatically arranged for visual impact and flow</span>
            </div>
          </div>

          <div class="feature-hint-item">
            <n-icon :size="20">
              <OptionsOutline />
            </n-icon>
            <div class="feature-hint-text">
              <strong>Customizable Styles</strong>
              <span>Fine-tune themes, mood, and artistic direction</span>
            </div>
          </div>
        </div>

        <div class="placeholder-actions">
          <n-button type="primary" size="large" @click="openWizard">
            <template #icon>
              <n-icon><SparklesOutline /></n-icon>
            </template>
            Build a new portfolio
          </n-button>
          <n-button size="large" @click="showCreateSetDialog">
            <template #icon>
              <n-icon><FolderOutline /></n-icon>
            </template>
            Create Set
          </n-button>
          <!-- <n-button size="large" @click="openManualDialog">
            <template #icon>
              <n-icon><CreateOutline /></n-icon>
            </template>
            Create Manually
          </n-button> -->
        </div>
      </div>
    </div>

    <!-- Content with cards (when builds exist) -->
    <div v-else>
      <div class="root-toolbar">
        <n-button @click="showCreateSetDialog">
          <template #icon>
            <n-icon><FolderOutline /></n-icon>
          </template>
          New Set
        </n-button>
        <div class="sort-controls">
          <n-button
            v-if="portfolioSelection.isSelectionMode.value"
            type="error"
            ghost
            @click="showBulkDeleteConfirmation"
          >
            Delete Selected ({{ portfolioSelection.selectedIds.value.length }})
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

      <div class="card-grid">
        <!-- Create card -->
        <CreateCard
          v-if="!ENABLE_CREATE_OPTIONS"
          title="New Portfolio"
          subtitle="Start compiling your best photos"
          @click="openWizard"
        />

        <!-- Dual-action create card (ENABLE_CREATE_OPTIONS = true) -->
        <div
          v-else
          class="portfolio-create-card"
          :class="{ 'is-open': showCreateOptions }"
          @click="showCreateOptions && (showCreateOptions = false)"
        >
          <Transition name="create-fade" mode="out-in">
            <div
              v-if="!showCreateOptions"
              key="closed"
              class="portfolio-create-default"
              @click.stop="showCreateOptions = true"
            >
              <div class="portfolio-create-icon">
                <n-icon :size="32" color="var(--primary-color)">
                  <AddOutline />
                </n-icon>
              </div>
              <h3 class="portfolio-create-title">New Portfolio</h3>
              <p class="portfolio-create-subtitle">
                Choose how you want to build it
              </p>
            </div>
            <div v-else key="open" class="portfolio-create-options">
              <button
                type="button"
                class="portfolio-create-btn ai"
                @click.stop="openWizard"
              >
                <n-icon :size="18"><SparklesOutline /></n-icon>
                <span class="btn-label">AI Powered</span>
                <span class="btn-desc">Wizard + automatic curation</span>
              </button>
              <button
                type="button"
                class="portfolio-create-btn manual"
                @click.stop="openManualDialog"
              >
                <n-icon :size="18"><CreateOutline /></n-icon>
                <span class="btn-label">Manual</span>
                <span class="btn-desc">Start empty and pick photos</span>
              </button>
            </div>
          </Transition>
        </div>

        <CollectionSetCard
          v-for="set in rootSets"
          :key="`set-${set.id}`"
          :item="set"
          item-type="portfolio"
          content-label="portfolio"
          @click="navigateToSet(set.id)"
          @drop-items="onDropBuildsIntoSet"
        />

        <!-- Existing build cards -->
        <CollectionCard
          v-for="item in rootItems"
          :key="item.id"
          :item="item"
          type="collection"
          drag-type="portfolio"
          item-label="portfolio"
          :show-update-date="false"
          :is-selected="portfolioSelection.isSelected(item.id)"
          :is-selection-mode="portfolioSelection.isSelectionMode.value"
          :selected-ids="portfolioSelection.selectedIds.value"
          @click="(_, ev) => onPortfolioCardClick(item, ev, rootItems)"
          @select-toggle="
            () =>
              portfolioSelection.toggleSelectItem(
                item.id,
                rootItems.map((p) => p.id),
              )
          "
        />
      </div>
    </div>

    <!-- Build wizard dialog -->
    <PortfolioBuildWizard
      v-model:show="showWizard"
      :target-set-id="createSetParentId"
      @build-complete="onBuildComplete"
    />

    <!-- Create Set Dialog -->
    <n-modal
      v-model:show="showSetDialog"
      preset="dialog"
      title="Create New Set"
      positive-text="Create Set"
      negative-text="Cancel"
      @positive-click="createBuildSet"
      @negative-click="showSetDialog = false"
    >
      <div class="manual-form">
        <n-form ref="setFormRef" :model="setForm" :rules="setRules">
          <n-form-item label="Name" path="name">
            <n-input
              v-model:value="setForm.name"
              placeholder="Enter set name..."
              maxlength="100"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="setForm.description"
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

    <!-- Manual create dialog -->
    <n-modal
      v-model:show="showManualDialog"
      preset="dialog"
      title="Create New Portfolio"
      positive-text="Create Portfolio"
      negative-text="Cancel"
      :loading="isCreatingManual"
      @positive-click="createManualPortfolio"
      @negative-click="showManualDialog = false"
    >
      <div class="manual-form">
        <n-form ref="manualFormRef" :model="manualForm" :rules="manualRules">
          <n-form-item label="Name" path="name">
            <n-input
              v-model:value="manualForm.name"
              placeholder="Enter portfolio name..."
              maxlength="200"
              show-count
            />
          </n-form-item>
          <n-form-item label="Description" path="description">
            <n-input
              v-model:value="manualForm.description"
              type="textarea"
              placeholder="Add a description (optional)..."
              :rows="3"
              maxlength="2000"
              show-count
            />
          </n-form-item>
        </n-form>
      </div>
    </n-modal>

    <!-- Bulk Delete Confirmation Dialog -->
    <n-modal
      v-model:show="bulkDeleteVisible"
      preset="dialog"
      title="Delete Selected Portfolios"
      positive-text="Delete Selected"
      negative-text="Cancel"
      type="error"
      :loading="store.isDeleting"
      @positive-click="bulkDeleteBuilds"
      @negative-click="bulkDeleteVisible = false"
    >
      <p>
        Are you sure you want to delete
        <strong>{{ portfolioSelection.selectedIds.value.length }}</strong>
        selected portfolios?
      </p>
    </n-modal>

    <!-- Delete Set Confirmation Dialog -->
    <n-modal
      v-model:show="deleteSetVisible"
      preset="dialog"
      title="Delete Set"
      positive-text="Delete Set"
      negative-text="Cancel"
      type="error"
      @positive-click="deleteBuildSet"
      @negative-click="deleteSetVisible = false"
    >
      <p>
        Are you sure you want to delete the set
        <strong>"{{ viewingSet?.name }}"</strong>?
      </p>
      <p>Child sets and portfolios will be moved to the parent set.</p>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SpiralGridLoader from "../components/SpiralGridLoader.vue";
import {
  NIcon,
  NButton,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  SparklesOutline,
  ImagesOutline,
  OptionsOutline,
  CreateOutline,
  FolderOutline,
  FolderOpenOutline,
  GridOutline,
  ChevronForwardOutline,
  CheckmarkOutline,
  CloseOutline,
} from "@vicons/ionicons5";
import { TOOL_ICONS, getToolById } from "@/config/toolsConfig";
import CollectionCard from "@/components/CollectionCard.vue";
import CollectionSetCard from "@/components/CollectionSetCard.vue";
import CreateCard from "@/components/photos-grid/CreateCard.vue";
import PortfolioBuildWizard from "@/components/portfolio-builder/PortfolioBuildWizardStepped.vue";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { useCardSelection } from "@/composables/useCardSelection";

const PortfolioIcon = TOOL_ICONS[getToolById("portfolios").icon];

defineOptions({ name: "PortfolioBuilderView" });

const route = useRoute();
const router = useRouter();
const message = useMessage();
const store = usePortfolioBuildsStore();
const portfolioSelection = useCardSelection();

// Set to true to re-enable the AI / Manual split options on the create card
const ENABLE_CREATE_OPTIONS = false;

const showWizard = ref(false);
const showManualDialog = ref(false);
const showSetDialog = ref(false);
const bulkDeleteVisible = ref(false);
const deleteSetVisible = ref(false);
const showCreateOptions = ref(false);
const createSetParentId = ref(null);
const viewingSet = ref(null);
const showSetView = ref(false);
const editingSetTitle = ref(false);
const editedSetTitle = ref("");
const isSavingSetTitle = ref(false);
const manualFormRef = ref(null);
const setFormRef = ref(null);
const manualForm = ref({ name: "", description: "" });
const setForm = ref({ name: "", description: "" });
const manualRules = {
  name: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};
const setRules = {
  name: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};
const isCreatingManual = ref(false);

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

const isLoading = computed(() => store.isLoading);
const rootSets = computed(() => _sortList(store.rootSets, "name"));
const rootBuilds = computed(() => store.rootBuilds);
const hasRootContent = computed(
  () => store.rootBuilds.length > 0 || store.rootSets.length > 0,
);
const currentChildSets = computed(() =>
  _sortList(
    viewingSet.value ? store.childSetsOf(viewingSet.value.id) : [],
    "name",
  ),
);
const currentSetBuilds = computed(() =>
  viewingSet.value ? store.buildsInSet(viewingSet.value.id) : [],
);
const setIsEmpty = computed(
  () =>
    currentChildSets.value.length === 0 && currentSetBuilds.value.length === 0,
);
const breadcrumb = computed(() =>
  viewingSet.value ? store.getBreadcrumbFor(viewingSet.value.id) : [],
);

const mapBuildToItem = (build) => {
  const previews = (build.photoItems || []).slice(0, 3);
  const total = build.resultCount ?? build.targetSize ?? previews.length;
  const filler = Array.from(
    { length: Math.max(0, total - previews.length) },
    () => ({ id: null, url: "" }),
  );
  return {
    id: build.id,
    name: build.config?.name || `Portfolio #${build.id}`,
    photos: [...previews, ...filler],
    createdAt: build.createdAt,
    updatedAt: build.createdAt,
    setId: build.setId,
  };
};

const rootItems = computed(() =>
  _sortList(rootBuilds.value.map(mapBuildToItem), "name"),
);
const currentSetItems = computed(() =>
  _sortList(currentSetBuilds.value.map(mapBuildToItem), "name"),
);

onMounted(async () => {
  document.addEventListener("keydown", onKeyDown);
  await Promise.all([store.getOrFetch(), store.getOrFetchSets()]);
  updateViewState();
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeyDown);
});

const openWizard = async () => {
  createSetParentId.value = null;
  showCreateOptions.value = false;
  showWizard.value = true;
};

const openWizardInSet = async () => {
  createSetParentId.value = viewingSet.value?.id ?? null;
  showCreateOptions.value = false;
  showWizard.value = true;
};

const openManualDialog = () => {
  if (!showSetView.value) createSetParentId.value = null;
  showCreateOptions.value = false;
  manualForm.value = { name: "", description: "" };
  showManualDialog.value = true;
};

const createManualPortfolio = async () => {
  try {
    await manualFormRef.value?.validate();
  } catch {
    return false;
  }
  isCreatingManual.value = true;
  try {
    const { buildId } = await store.createManual({
      name: manualForm.value.name.trim(),
      description: manualForm.value.description.trim() || undefined,
      setId: createSetParentId.value,
    });
    showManualDialog.value = false;

    manualForm.value = { name: "", description: "" };
    await Promise.all([store.fetchBuilds(), store.fetchBuildSets()]);
    router.push({ name: "portfolio-detail", params: { id: buildId } });
  } catch (err) {
    console.error("[PortfolioBuilderView] createManual error:", err);
    message.error(err.response?.data?.error || "Failed to create portfolio");
    return false;
  } finally {
    isCreatingManual.value = false;
  }
};

const onBuildComplete = async (result) => {
  console.log("[PortfolioBuilderView] Build complete:", result);
  await Promise.all([store.fetchBuilds(), store.fetchBuildSets()]);
};

const handleBuildClick = (item) => {
  router.push({ name: "portfolio-detail", params: { id: item.id } });
};

const backToRoot = () => router.push({ name: "portfolios" });
const navigateToSet = (setId) =>
  router.push({ name: "portfolio-set", params: { setId } });

const showCreateSetDialog = () => {
  createSetParentId.value = null;
  setForm.value = { name: "", description: "" };
  showSetDialog.value = true;
};

const showCreateSubsetDialog = () => {
  createSetParentId.value = viewingSet.value?.id ?? null;
  setForm.value = { name: "", description: "" };
  showSetDialog.value = true;
};

const createBuildSet = async () => {
  try {
    await setFormRef.value?.validate();
    await store.createBuildSet({
      name: setForm.value.name,
      description: setForm.value.description,
      parentSetId: createSetParentId.value,
    });

    setForm.value = { name: "", description: "" };
    showSetDialog.value = false;
  } catch (error) {
    console.error("[PortfolioBuilderView] createBuildSet error:", error);
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
    await store.updateBuildSet(viewingSet.value.id, {
      name: editedSetTitle.value.trim(),
      description: viewingSet.value.description,
    });
    message.success("Set name updated");
    editingSetTitle.value = false;
    updateViewState();
  } catch (error) {
    console.error("[PortfolioBuilderView] saveSetTitle error:", error);
  } finally {
    isSavingSetTitle.value = false;
  }
};

const cancelEditSetTitle = () => {
  editingSetTitle.value = false;
  editedSetTitle.value = "";
};

const showDeleteSetConfirmation = () => {
  deleteSetVisible.value = true;
};

const deleteBuildSet = async () => {
  if (!viewingSet.value) return;
  try {
    const parentId = viewingSet.value.parentSetId;
    const setName = viewingSet.value.name;
    await store.deleteBuildSet(viewingSet.value.id);
    message.success(`Set "${setName}" deleted`);
    deleteSetVisible.value = false;
    if (parentId) navigateToSet(parentId);
    else backToRoot();
  } catch (error) {
    console.error("[PortfolioBuilderView] deleteBuildSet error:", error);
  }
};

const showBulkDeleteConfirmation = () => {
  bulkDeleteVisible.value = true;
};

const bulkDeleteBuilds = async () => {
  const ids = [...portfolioSelection.selectedIds.value];
  if (ids.length === 0) return;
  try {
    await store.deleteBuilds(ids);
    message.success(
      `${ids.length} portfolio${ids.length === 1 ? "" : "s"} deleted`,
    );
    portfolioSelection.clearAll();
    bulkDeleteVisible.value = false;
  } catch (error) {
    console.error("[PortfolioBuilderView] bulkDeleteBuilds error:", error);
    message.error("Failed to delete portfolios");
  }
};

const onPortfolioCardClick = (item, nativeEvent, orderedList) => {
  const orderedIds = orderedList.map((portfolio) => portfolio.id);
  const handled = portfolioSelection.handleCardSelect(
    item.id,
    nativeEvent,
    orderedIds,
  );
  if (!handled) handleBuildClick(item);
};

const onDropBuildsIntoSet = async (buildIds, setId) => {
  const ids = Array.isArray(buildIds) ? buildIds : [buildIds];
  try {
    await Promise.all(ids.map((id) => store.moveBuildToSet(id, setId)));
    const set = store.getSetById(setId);
    message.success(
      ids.length === 1
        ? `Portfolio moved to "${set?.name || "set"}"`
        : `${ids.length} portfolios moved to "${set?.name || "set"}"`,
    );
    portfolioSelection.clearAll();
  } catch (error) {
    console.error("[PortfolioBuilderView] onDropBuildsIntoSet error:", error);
    message.error("Failed to move portfolios");
  }
};

const breadcrumbDragOver = ref(null);

const onBreadcrumbDragOver = (crumbId, event) => {
  if (
    event.dataTransfer?.types.includes("application/x-portfolio-id") ||
    event.dataTransfer?.types.includes("application/x-portfolio-ids")
  ) {
    breadcrumbDragOver.value = crumbId;
    event.dataTransfer.dropEffect = "move";
  }
};

const onBreadcrumbDragLeave = (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    breadcrumbDragOver.value = null;
  }
};

const onBreadcrumbDrop = async (targetSetId, event) => {
  breadcrumbDragOver.value = null;
  let ids = [];
  const multiRaw = event.dataTransfer?.getData("application/x-portfolio-ids");
  if (multiRaw) {
    try {
      const parsed = JSON.parse(multiRaw);
      if (Array.isArray(parsed)) ids = parsed;
    } catch {
      ids = [];
    }
  }
  if (ids.length === 0) {
    const single = event.dataTransfer?.getData("application/x-portfolio-id");
    if (single) ids = [single];
  }
  if (ids.length === 0) return;

  try {
    await Promise.all(ids.map((id) => store.moveBuildToSet(id, targetSetId)));
    portfolioSelection.clearAll();
    message.success(
      targetSetId
        ? `${ids.length} portfolio${ids.length === 1 ? "" : "s"} moved`
        : `${ids.length} portfolio${ids.length === 1 ? "" : "s"} moved to root`,
    );
  } catch (error) {
    console.error("[PortfolioBuilderView] onBreadcrumbDrop error:", error);
    message.error("Failed to move portfolios");
  }
};

const onKeyDown = (event) => {
  if (event.key === "Escape" && portfolioSelection.isSelectionMode.value) {
    portfolioSelection.clearAll();
  }
};

const updateViewState = () => {
  const setId = route.params.setId;
  if (setId) {
    const set = store.getSetById(setId);
    if (set) {
      viewingSet.value = set;
      showSetView.value = true;
      return;
    }
  }
  viewingSet.value = null;
  showSetView.value = false;
};

watch([() => route.params.setId, () => store.allBuildSets], updateViewState);
watch(
  () => route.fullPath,
  () => portfolioSelection.clearAll(),
);
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.portfolio-builder-view {
  margin: 0 auto;
  background-color: var(--bg-body);
}

.view-header {
  margin-bottom: var(--spacing-2xl);
}

.view-header-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.view-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.view-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}

/* Placeholder empty state */
.portfolio-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 500px;
  padding: 48px 24px;
}

.placeholder-content {
  text-align: center;
  max-width: 560px;
}

.placeholder-icon {
  margin-bottom: 16px;
}

.placeholder-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.placeholder-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
  line-height: 1.6;
}

.feature-hints {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 32px;
  text-align: left;
}

.feature-hint-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: var(--text-secondary);
}

.feature-hint-item .n-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--primary-color);
}

.feature-hint-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-hint-text strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.feature-hint-text span {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.placeholder-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

/* Dual-action create card */
.portfolio-create-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border: 2px dashed #2c2c32;
  border-radius: 16px;
  padding: 20px;
  background-color: transparent;
  cursor: pointer;
  min-height: 200px;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    box-shadow 0.2s;
}

.portfolio-create-card:hover {
  border-color: var(--primary-color);
  background-color: rgba(37, 99, 235, 0.04);
}

.portfolio-create-default {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  width: 100%;
}

.portfolio-create-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.create-fade-enter-active,
.create-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.create-fade-enter-from,
.create-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.portfolio-create-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: rgba(37, 99, 235, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.portfolio-create-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.portfolio-create-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.portfolio-create-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.portfolio-create-btn {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 10px;
  row-gap: 2px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background-color: var(--bg-surface, transparent);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s,
    background-color 0.15s,
    transform 0.1s;
}

.portfolio-create-btn:hover {
  border-color: var(--primary-color);
  background-color: rgba(37, 99, 235, 0.08);
}

.portfolio-create-btn:active {
  transform: scale(0.98);
}

.portfolio-create-btn .n-icon {
  grid-row: span 2;
  color: var(--primary-color);
}

.portfolio-create-btn .btn-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.portfolio-create-btn .btn-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.3;
}

.portfolio-create-btn.ai .n-icon {
  color: var(--primary-color);
}

.portfolio-create-btn.manual .n-icon {
  color: var(--text-secondary);
}

.manual-form {
  padding: 4px 0;
}

.root-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.sort-controls {
  display: flex;
  align-items: center;
  gap: 8px;
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

.set-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.set-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 4px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-height: 32px;
}

.breadcrumb-item {
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--text-secondary);
}

.breadcrumb-current {
  color: var(--text-primary);
  font-weight: 600;
}

.breadcrumb-drop-target {
  background-color: rgba(37, 99, 235, 0.12);
  color: var(--primary-color);
}

.breadcrumb-sep {
  color: var(--text-tertiary);
}

.set-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.title-display,
.title-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 240px;
  flex: 1 1 auto;
}

.title-edit {
  max-width: 520px;
}

.detail-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.edit-button,
.action-button {
  color: var(--text-secondary);
}

.set-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.set-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.portfolio-placeholder.compact {
  min-height: 360px;
}

/* Responsive */
@media (max-width: 768px) {
  .portfolio-builder-view {
    padding: var(--spacing-lg);
  }

  .view-title {
    font-size: 20px;
  }

  .view-header {
    margin-bottom: var(--spacing-lg);
  }

  .set-title-row,
  .set-actions,
  .root-toolbar {
    align-items: stretch;
  }

  .set-actions,
  .root-toolbar {
    flex-direction: column;
  }

  .detail-title {
    font-size: 22px;
  }
}
</style>
