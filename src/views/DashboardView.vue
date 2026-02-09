<template>
  <div class="dashboard-container view-container">
    <!-- Welcome Section -->
    <div class="welcome-section">
      <h1 class="welcome-title">
        Welcome back, {{ userStore.userShortName }}! 👋
      </h1>
      <p class="welcome-subtitle">
        Ready to organize and enhance your photos with Photoreka smart tools.
      </p>
    </div>

    <!-- Quick Actions Section -->
    <div class="quick-actions-section">
      <!-- <h2 class="section-title">Quick Actions</h2> -->

      <div class="actions-grid">
        <!-- Daily Eureka Card -->
        <DailyEurekaCard />

        <!-- <div
          class="action-card workspace-card"
          :class="{ disabled: appAccessMode === 'blocked' }"
          @click="goToTool('workspace')"
        >
          <WorkspacePreview :photos="recentPhotos" />
        </div> -->

        <DashboardActionCard
          :icon="LayersOutline"
          title="Your Workspace"
          :disabled="appAccessMode === 'blocked'"
          @click="goToTool('workspace')"
        >
          <template #description>
            <span v-if="photos.length > 0">
              {{ photos.length }} {{ photos.length === 1 ? "photo" : "photos" }}
            </span>
            <span v-else>No photos available</span>
          </template>
        </DashboardActionCard>

        <!-- Report and Statistics Card - Hidden on mobile, as it requires too much screen space for now. Will be redesigned in the future to be more mobile-friendly, but for now we want to avoid showing a card that leads to an empty page on mobile. -->
        <DashboardActionCard
          :icon="AnalyticsOutline"
          title="Report & Statistics"
          description="Understand your body of work"
          :disabled="appAccessMode === 'blocked'"
          @click="goToTool('report')"
        />
        <!-- Explorer Card - Only shown on mobile as replacement for Canvas -->
        <DashboardActionCard
          v-if="isMobileLimitedMode"
          :icon="SearchIcon"
          title="Explorer"
          description="Browse photos in natural language"
          additional-classes="explorer"
          icon-color="var(--primary-color)"
          :disabled="appAccessMode === 'blocked'"
          @click="goToTool('search')"
        />
        <!-- Canvas Card with Preview - Hidden on mobile -->
        <div
          v-if="
            !isMobileLimitedMode &&
            canvasData &&
            canvasData.data &&
            Array.isArray(canvasData.data.photos) &&
            canvasData.data.photos.length > 0
          "
          class="action-card"
          :class="{ disabled: appAccessMode === 'blocked' }"
          @click="goToTool('canvas')"
        >
          <CanvasPreview
            v-if="!isMobileLimitedMode"
            :canvas-data="canvasData"
          />
        </div>
        <DashboardActionCard
          v-else-if="!isMobileLimitedMode"
          :icon="Workspace"
          title="Canvas"
          description="Arrange and storyboard your photos"
          additional-classes="explorer"
          icon-color="var(--primary-color)"
          @click="goToTool('canvas')"
        />

        <!-- <div
          class="action-card report"
          @click="goToTool('report')"
          :class="{ disabled: appAccessMode === 'blocked' }"
        >
          <div class="action-icon">
            <n-icon size="32">
              <AnalyticsIcon />
            </n-icon>
          </div>
          <h3 class="action-title">Portfolio Report</h3>
          <p class="action-description">Analytics & insights</p>
        </div> -->
      </div>
    </div>

    <!-- Recent Projects and Series Section -->
    <div class="recent-projects-section">
      <h2 class="section-title">Recent Collections & Series</h2>

      <!-- Loading state -->
      <div v-if="isLoadingCollections" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading collections...</p>
      </div>

      <!-- Empty state when blocked OR no collections available -->
      <div
        v-else-if="appAccessMode === 'blocked' || collections.length === 0"
        class="empty-state"
      >
        <div class="empty-state-icon">
          <n-icon size="64" color="var(--text-tertiary)">
            <CollectionsIcon />
          </n-icon>
        </div>
        <h3 class="empty-state-title">Nothing here yet</h3>
        <p class="empty-state-description">
          <router-link
            v-show="appAccessMode !== 'blocked'"
            to="/collections"
            class="empty-state-link"
          >
            Manage your collections
          </router-link>
        </p>
      </div>

      <div v-else class="projects-grid">
        <CollectionCard
          v-for="item in collections"
          :key="item.id"
          :item="item"
          :type="item.itemType"
          :show-update-date="false"
          @click="
            item.itemType === 'collection'
              ? openProject(item.id)
              : openSeries(item.id)
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";

defineOptions({
  name: "DashboardView",
});
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { useUserStore } from "@/stores/userStore.js";
import { api } from "@/utils/axios.js"; // Needed for photo insight API call
import { useMessage } from "naive-ui";
import CanvasPreview from "@/components/CanvasPreview.vue";
import WorkspacePreview from "@/components/WorkspacePreview.vue";
import CollectionCard from "@/components/CollectionCard.vue";
import DailyEurekaCard from "@/components/DailyEurekaCard.vue";
import DashboardActionCard from "@/components/DashboardActionCard.vue";
import { isMobileDevice } from "@/utils/utils.js";

// Import @vicons icons from ionicons5 for reliability
import {
  CloudUploadOutline as ArrowUpIcon,
  AddOutline as AddIcon,
  FolderOpenOutline as CollectionsIcon,
  ImageOutline as PhotoHubIcon,
  SettingsOutline as SettingsIcon,
  HelpCircleOutline as QuestionIcon,
  AnalyticsOutline as AnalyticsIcon,
  FilmOutline as SeriesIcon,
  SearchOutline as SearchIcon,
  LayersOutline,
  AnalyticsOutline,
} from "@vicons/ionicons5";
import { LayersOutlined } from "@vicons/material";
import { Workspace } from "@vicons/carbon";

const router = useRouter();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const userStore = useUserStore();
const message = useMessage();

// Check if in mobile limited mode
const isMobileLimitedMode = computed(() => isMobileDevice());

// Computed collections and series combined from store
const collections = computed(() => {
  // Combinar colecciones y series (en móvil solo colecciones)
  const allItems = [
    ...(collectionsStore.allCollections || []).map((item: any) => ({
      ...item,
      itemType: "collection",
    })),
    // Solo incluir series si NO estamos en móvil
    ...(!isMobileLimitedMode.value
      ? (seriesStore.allSeries || []).map((item: any) => ({
          ...item,
          itemType: "series",
        }))
      : []),
  ];

  // Ordenar por fecha de actualización descendente y tomar solo los 4 más recientes
  return allItems
    .sort(
      (a: { updatedAt: string }, b: { updatedAt: string }) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 4);
});
const isLoadingCollections = computed(
  () => collectionsStore.isLoading || seriesStore.isLoading,
);

// Canvas data from localStorage
const canvasData = ref<any>(null);

// Recent photos for workspace preview
const photos = computed(() => {
  if (!photosStore.photos || !Array.isArray(photosStore.photos)) {
    return [];
  }
  // Return all photos for counting, component will slice for display
  return photosStore.photos;
});

const appAccessMode = computed(() => photosStore.appAccessMode);

// Load collections
const loadCollections = async () => {
  try {
    await collectionsStore.getOrFetch();
  } catch (error) {
    console.error("Error loading collections:", error);
  }
};

// Load series
const loadSeries = async () => {
  try {
    await seriesStore.getOrFetch();
  } catch (error) {
    console.error("Error loading series:", error);
  }
};

// Watch for changes in appAccessMode to load collections and series
watch(
  appAccessMode,
  async (newValue) => {
    if (
      newValue !== "blocked" &&
      Array.isArray(photosStore.photos) &&
      photosStore.photos.length > 0
    ) {
      loadCollections();
      loadSeries();
    }
  },
  { immediate: true },
);

const openProject = (collectionId: string) => {
  // Navigate to collections view with the specific collection ID
  router.push({ name: "collection-detail", params: { id: collectionId } });
};

const openSeries = (seriesId: string) => {
  // Navigate to series view with the specific series ID
  router.push({ name: "series-detail", params: { id: seriesId } });
};

const goToTool = (toolName: string) => {
  // Navigate to specific tool
  router.push({ name: toolName });
};

// Format date helper
const formatDate = (date: Date) => {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return "1 day ago";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 14) {
    return "1 week ago";
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else if (diffDays < 60) {
    return "1 month ago";
  } else {
    return `${Math.floor(diffDays / 30)} months ago`;
  }
};

// Load canvas data from localStorage
const loadCanvasData = () => {
  try {
    const savedCanvas = localStorage.getItem("photoreka_canvas_data");
    if (savedCanvas) {
      canvasData.value = JSON.parse(savedCanvas);
    }
  } catch (error) {
    console.error("Error loading canvas data:", error);
  }
};

// Load canvas on mount
onMounted(() => {
  loadCanvasData();
});
</script>

<style scoped>
.dashboard-container {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
  min-height: 100vh;
}

.welcome-section {
  margin-bottom: var(--spacing-3xl);
}

.welcome-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.welcome-subtitle {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

.stats-grid {
  display: flex;
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-4xl);
  transition: var(--transition-normal);
}

.stat-card {
  position: relative;
  background: linear-gradient(
    135deg,
    var(--bg-card) 0%,
    var(--primary-02) 100%
  ) !important;
  border: 1px solid var(--border-color) !important;
  flex: 1;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 120px;
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, transparent 0%, var(--primary-05) 100%);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.stat-card:hover::before {
  opacity: 1;
}

.stat-card:hover {
  border-color: var(--primary-50);
  box-shadow: 0 8px 24px var(--primary-15);
  transform: translateY(-2px);
}

.stat-content {
  padding: 4px;
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stat-label {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 8px;
  line-height: 1;
}

.stat-change {
  font-size: 12px;
  font-weight: 500;
}

.stat-change.positive {
  color: #22c55e;
}

.section-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-2xl) 0;
  line-height: var(--line-height-tight);
}

.actions-grid {
  display: flex;
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
  transition: var(--transition-normal);
}

/* Action Card Base Styles */
.action-card {
  position: relative;
  background: linear-gradient(
    135deg,
    var(--bg-card) 0%,
    var(--primary-02) 100%
  );
  border: 1px solid var(--border-color);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  min-height: 190px;
  flex: 1;
}

.action-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, transparent 0%, var(--primary-05) 100%);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.action-card:hover::before {
  opacity: 1;
}

.action-card:hover {
  border-color: var(--primary-50);
  box-shadow: 0 12px 32px var(--primary-15);
  transform: translateY(-4px);
}

.action-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.action-card.disabled:hover {
  border-color: var(--border-color);
  box-shadow: none;
  transform: none;
}

/* Canvas Card Styles */
.canvas-card {
  position: relative;
  padding: 0;
  overflow: hidden;
  min-height: 190px;
}

/* Workspace Card Styles */
.workspace-card {
  position: relative;
  padding: 0;
  overflow: hidden;
  min-height: 190px;
}

/* Mobile devices - stack vertically when too narrow */
@media (max-width: 768px) {
  .stats-grid {
    flex-direction: column;
    gap: 16px;
  }

  .actions-grid {
    flex-direction: column;
    gap: 16px;
  }

  .welcome-title {
    font-size: 24px;
  }

  .welcome-subtitle {
    font-size: 14px;
  }

  .stat-value {
    font-size: 24px;
  }

  .action-title {
    font-size: 16px;
  }
}

/* Very small screens - even more compact */
@media (max-width: 480px) {
  .welcome-title {
    font-size: 20px;
  }

  .stat-value {
    font-size: 20px;
  }

  .stat-label {
    font-size: 12px;
  }

  .stat-change {
    font-size: 10px;
  }

  .action-title {
    font-size: 16px;
  }

  .action-description {
    font-size: 13px;
  }

  .section-title {
    font-size: 20px;
  }
}

/* Tablet and up - ensure horizontal layout */
@media (min-width: 768px) {
  .stats-grid {
    flex-direction: row;
  }

  .actions-grid {
    flex-direction: row;
  }
}

/* Recent Projects Section */
.recent-projects-section {
  margin-top: 48px;
}

/* Recent Series Section */
.recent-series-section {
  margin-top: 48px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

/* Mobile adjustments for projects */

@media (max-width: 768px) {
  .recent-projects-section {
    margin-top: 32px;
  }

  .projects-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

@media (min-width: 768px) and (max-width: 1024px) {
  .projects-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
}

@media (min-width: 1600px) {
  .projects-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Tablet adjustments */
@media (min-width: 768px) and (max-width: 1024px) {
  .projects-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  text-align: center;
  min-height: 300px;
  align-content: center;
  align-items: center;
}

.empty-state-icon {
  margin-bottom: var(--spacing-xl);
}

.empty-state-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
  line-height: var(--line-height-tight);
}

.empty-state-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
  max-width: 400px;
}

.empty-state-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}

.empty-state-link:hover {
  color: var(--primary-color-hover);
  text-decoration: underline;
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  text-align: center;
  min-height: 300px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(var(--text-primary), 0.3);
  border-top: 3px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--spacing-lg);
}

.loading-state p {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}
</style>
