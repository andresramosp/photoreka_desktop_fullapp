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

        <n-button type="primary" size="large" @click="openWizard">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
          Create First Portfolio
        </n-button>
      </div>
    </div>

    <!-- Content with cards (when builds exist) -->
    <div v-else-if="!isLoading" class="card-grid">
      <!-- Create card -->
      <div class="card create-card" @click="openWizard">
        <div class="create-preview">
          <div class="create-icon">
            <n-icon :size="36" color="var(--primary-color)">
              <AddOutline />
            </n-icon>
          </div>
        </div>
        <div class="card-info">
          <h3 class="card-title">New Build</h3>
          <p class="card-meta">Create a new AI-curated portfolio</p>
        </div>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { NIcon, NSpin, NButton, useMessage } from "naive-ui";
import {
  AddOutline,
  SparklesOutline,
  ImagesOutline,
  OptionsOutline,
} from "@vicons/ionicons5";
import { TOOL_ICONS, getToolById } from "@/config/toolsConfig";
import CollectionCard from "@/components/CollectionCard.vue";
import PortfolioBuildWizard from "@/components/portfolio-builder/PortfolioBuildWizardStepped.vue";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";

const PortfolioIcon = TOOL_ICONS[getToolById("portfolios").icon];

defineOptions({ name: "PortfolioBuilderView" });

const router = useRouter();
const message = useMessage();
const store = usePortfolioBuildsStore();

const showWizard = ref(false);
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
      name: `Portfolio #${build.id}`,
      photos: [...previews, ...filler],
      updatedAt: build.createdAt,
    };
  }),
);

onMounted(() => {
  store.getOrFetch();
});

const openWizard = async () => {
  // Quick eligibility check before opening
  try {
    const elig = await store.checkEligibility();
    if (!elig.eligible) {
      message.warning(
        elig.reason || "You are not eligible to build a portfolio yet.",
      );
      return;
    }
  } catch {
    // If eligibility check fails, still allow opening (the backend will enforce)
  }
  showWizard.value = true;
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
