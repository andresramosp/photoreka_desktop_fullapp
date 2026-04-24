<template>
  <div class="portfolio-builder-view view-container">
    <!-- Loading state -->
    <div v-if="isLoading" class="loading-state">
      <n-spin :size="32" />
    </div>

    <!-- Empty state placeholder -->
    <div v-if="!isLoading && builds.length === 0" class="portfolio-placeholder">
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
    <div v-else-if="!isLoading" class="card-grid">
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

      <!-- Existing build cards -->
      <CollectionCard
        v-for="item in buildItems"
        :key="item.id"
        :item="item"
        type="collection"
        :show-update-date="false"
        @click="handleBuildClick"
      />
    </div>

    <!-- Build wizard dialog -->
    <PortfolioBuildWizard
      v-model:show="showWizard"
      @build-complete="onBuildComplete"
    />

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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  NIcon,
  NSpin,
  NButton,
  NModal,
  NForm,
  NFormItem,
  NInput,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  SparklesOutline,
  ImagesOutline,
  OptionsOutline,
  CreateOutline,
} from "@vicons/ionicons5";
import { TOOL_ICONS, getToolById } from "@/config/toolsConfig";
import CollectionCard from "@/components/CollectionCard.vue";
import CreateCard from "@/components/photos-grid/CreateCard.vue";
import PortfolioBuildWizard from "@/components/portfolio-builder/PortfolioBuildWizardStepped.vue";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";

const PortfolioIcon = TOOL_ICONS[getToolById("portfolios").icon];

defineOptions({ name: "PortfolioBuilderView" });

const router = useRouter();
const message = useMessage();
const store = usePortfolioBuildsStore();

// Set to true to re-enable the AI / Manual split options on the create card
const ENABLE_CREATE_OPTIONS = false;

const showWizard = ref(false);
const showManualDialog = ref(false);
const showCreateOptions = ref(false);
const manualFormRef = ref(null);
const manualForm = ref({ name: "", description: "" });
const manualRules = {
  name: {
    required: true,
    message: "Please enter a name",
    trigger: "blur",
  },
};
const isCreatingManual = ref(false);

const isLoading = computed(() => store.isLoading);
const builds = computed(() => store.allBuilds);

const buildItems = computed(() =>
  builds.value.map((build) => {
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
      updatedAt: build.createdAt,
    };
  }),
);

onMounted(() => {
  store.getOrFetch();
});

const openWizard = async () => {
  showCreateOptions.value = false;
  showWizard.value = true;
};

const openManualDialog = () => {
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
    });
    showManualDialog.value = false;
    message.success(
      `Portfolio "${manualForm.value.name.trim()}" created successfully`,
    );
    manualForm.value = { name: "", description: "" };
    store.fetchBuilds();
    router.push({ name: "portfolio-detail", params: { id: buildId } });
  } catch (err) {
    console.error("[PortfolioBuilderView] createManual error:", err);
    message.error(err.response?.data?.error || "Failed to create portfolio");
    return false;
  } finally {
    isCreatingManual.value = false;
  }
};

const onBuildComplete = (result) => {
  console.log("[PortfolioBuilderView] Build complete:", result);
  store.fetchBuilds();
};

const handleBuildClick = (item) => {
  router.push({ name: "portfolio-detail", params: { id: item.id } });
};
</script>

<style scoped>
@import "@/assets/shared-card-styles.scss";

.portfolio-builder-view {
  padding: var(--spacing-2xl);
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
}
</style>
