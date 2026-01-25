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
      <h2 class="section-title">Quick Actions</h2>

      <div class="actions-grid">
        <!-- Did you know? Card -->
        <!-- Daily Eureka Card - Hidden on mobile -->
        <div
          v-if="!isMobileLimitedMode"
          class="action-card did-you-know"
          :class="{
            disabled:
              appAccessMode === 'blocked' ||
              (!photoInsight && !isLoadingInsight),
            loading: isLoadingInsight,
            'has-photo':
              photoInsight && photoInsight.photo && !isLoadingInsight,
            hovering: isHoveringInsight,
          }"
          @mouseenter="handleMouseEnter"
          @mouseleave="handleMouseLeave"
          :style="
            photoInsight && photoInsight.photo && !isLoadingInsight
              ? {
                  '--photo-bg': `url(${photoInsight.photo.thumbnailUrl})`,
                }
              : {}
          "
        >
          <div class="insight-content">
            <div v-if="isLoadingInsight" class="insight-loader">
              <div class="loader-spinner"></div>
            </div>
            <!-- <div v-else-if="!isHoveringInsight" class="insight-question-btn">
              <n-icon size="20">
                <QuestionIcon />
              </n-icon>
            </div> -->
          </div>
          <div v-if="!isHoveringInsight" class="insight-overlay">
            <h3 class="action-title">Daily Eureka!</h3>
            <p class="action-description">Discover insights in your images</p>
          </div>

          <!-- Carousel overlay -->
          <div
            v-show="
              isHoveringInsight &&
              photoInsight &&
              photoInsight.insights &&
              photoInsight.insights.length > 0
            "
            class="insight-carousel-overlay"
          >
            <div class="carousel-content">
              <button
                v-if="photoInsight && photoInsight.insights.length > 1"
                class="carousel-arrow carousel-arrow-left"
                @click.stop="prevInsight"
              >
                <n-icon size="20">
                  <ArrowLeftIcon />
                </n-icon>
              </button>

              <div class="insight-text-container">
                <transition name="insight-slide" mode="out-in">
                  <div :key="currentInsightIndex" class="insight-text-slide">
                    <p>
                      {{
                        photoInsight
                          ? photoInsight.insights[currentInsightIndex]
                          : ""
                      }}
                    </p>
                  </div>
                </transition>
              </div>

              <button
                v-if="photoInsight && photoInsight.insights.length > 1"
                class="carousel-arrow carousel-arrow-right"
                @click.stop="nextInsight"
              >
                <n-icon size="20">
                  <ArrowRightIcon />
                </n-icon>
              </button>
            </div>

            <!-- Dots indicator -->
            <div
              v-if="photoInsight && photoInsight.insights.length > 1"
              class="carousel-dots"
            >
              <div
                v-for="(_, index) in photoInsight.insights"
                :key="index"
                class="carousel-dot"
                :class="{ active: index === currentInsightIndex }"
                @click.stop="currentInsightIndex = index"
              ></div>
            </div>
          </div>
        </div>

        <div
          class="action-card upload-photos"
          :class="{ disabled: false }"
          @click="goToUpload"
        >
          <div class="action-icon">
            <n-icon size="32">
              <ArrowUpIcon />
            </n-icon>
          </div>
          <h3 class="action-title">Import Photos</h3>
          <p class="action-description">Add to your library</p>
        </div>

        <div
          class="action-card catalog"
          :class="{ disabled: appAccessMode === 'blocked' }"
          @click="goToCatalog"
        >
          <div class="action-icon">
            <n-icon size="32">
              <LayersOutline />
            </n-icon>
          </div>
          <h3 class="action-title">Workspace</h3>
          <p class="action-description">Browse your photo catalog</p>
        </div>

        <!-- Explorer Card - Only shown on mobile as replacement for Canvas -->
        <div
          v-if="isMobileLimitedMode"
          class="action-card explorer"
          :class="{ disabled: appAccessMode === 'blocked' }"
          @click="goToExplorer"
        >
          <div class="action-icon">
            <n-icon size="32">
              <SearchIcon />
            </n-icon>
          </div>
          <h3 class="action-title">Explorer</h3>
          <p class="action-description">Search your photos</p>
        </div>

        <!-- Canvas Card with Preview - Hidden on mobile -->
        <div
          v-if="!isMobileLimitedMode"
          class="action-card"
          :class="{ disabled: appAccessMode === 'blocked' }"
          @click="goToCanvas"
        >
          <CanvasPreview :canvas-data="canvasData" />
        </div>

        <!-- <div
          class="action-card portfolio-report"
          @click="goToPortfolioReport"
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
      <h2 class="section-title">Recent collections</h2>

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
        <div
          v-for="collection in collections"
          :key="collection.id"
          class="project-card"
          @click="openProject(collection.id)"
        >
          <div class="project-preview">
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
          <div class="project-info">
            <h3 class="project-title">{{ collection.name }}</h3>
            <p class="project-meta">
              {{ collection.photoCount || 0 }} photos • Last updated
              {{ formatDate(collection.updatedAt) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Series Section -->
    <div v-show="false" class="recent-series-section">
      <h2 class="section-title">Recent series</h2>

      <!-- Loading state -->
      <div v-if="isLoadingSeries" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading series...</p>
      </div>

      <!-- Empty state when blocked OR no series available -->
      <div
        v-else-if="appAccessMode === 'blocked' || series.length === 0"
        class="empty-state"
      >
        <div class="empty-state-icon">
          <n-icon size="64" color="var(--text-tertiary)">
            <SeriesIcon />
          </n-icon>
        </div>
        <h3 class="empty-state-title">No series yet</h3>
        <p class="empty-state-description">
          <router-link
            v-show="appAccessMode !== 'blocked'"
            to="/series"
            class="empty-state-link"
          >
            Create your first series
          </router-link>
        </p>
      </div>

      <div v-else class="projects-grid">
        <div
          v-for="seriesItem in series"
          :key="seriesItem.id"
          class="project-card"
          @click="openSeries(seriesItem.id)"
        >
          <div class="project-preview">
            <div class="photo-stack">
              <div
                v-for="(photo, index) in (seriesItem.photos || []).slice(0, 3)"
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
                  3 - (seriesItem.photos || []).length,
                )"
                :key="`placeholder-${index}`"
                class="photo-item"
                :class="`photo-${(seriesItem.photos || []).length + index}`"
              >
                <div class="photo-placeholder-empty"></div>
              </div>
            </div>
          </div>
          <div class="project-info">
            <h3 class="project-title">
              {{ seriesItem.name || seriesItem.title }}
            </h3>
            <p class="project-meta">
              {{ seriesItem.photoCount || 0 }} photos • Last updated
              {{ formatDate(seriesItem.updatedAt) }}
            </p>
          </div>
        </div>
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
import { isMobileDevice } from "@/utils/utils.js";

// Import @vicons icons from ionicons5 for reliability
import {
  CloudUploadOutline as ArrowUpIcon,
  AddOutline as AddIcon,
  FolderOpenOutline as CollectionsIcon,
  ImageOutline as PhotoHubIcon,
  SettingsOutline as SettingsIcon,
  HelpCircleOutline as QuestionIcon,
  ChevronBackOutline as ArrowLeftIcon,
  ChevronForwardOutline as ArrowRightIcon,
  AnalyticsOutline as AnalyticsIcon,
  FilmOutline as SeriesIcon,
  SearchOutline as SearchIcon,
  LayersOutline,
} from "@vicons/ionicons5";
import { Workspace } from "@vicons/carbon";

const router = useRouter();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const userStore = useUserStore();
const message = useMessage();

// Check if in mobile limited mode
const isMobileLimitedMode = computed(() => isMobileDevice());

// Computed collections from store
const collections = computed(() => {
  // Ordenar por fecha de actualización descendente y tomar solo las 4 más recientes
  return (collectionsStore.allCollections || [])
    .slice()
    .sort(
      (a: { updatedAt: string }, b: { updatedAt: string }) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 4);
});
const isLoadingCollections = computed(() => collectionsStore.isLoading);

// Computed series from store
const series = computed(() => {
  // Ordenar por fecha de actualización descendente y tomar solo las 4 más recientes
  return (seriesStore.allSeries || [])
    .slice()
    .sort(
      (a: { updatedAt: string }, b: { updatedAt: string }) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 4);
});
const isLoadingSeries = computed(() => seriesStore.isLoading);

// Photo insight state
interface PhotoInsight {
  photo: {
    id: string;
    originalFileName: string;
    thumbnailUrl: string;
    originalUrl: string;
  };
  insights: string[];
}

const photoInsight = ref<PhotoInsight | null>(null);
const isLoadingInsight = ref(false);
const isHoveringInsight = ref(false);
const currentInsightIndex = ref(0);
// Configurable insight fetch limit per day (via VITE_INSIGHT_FETCH_LIMIT), default to 1
const insightFetchLimit = 1;

// Canvas data from localStorage
const canvasData = ref<any>(null);

const appAccessMode = computed(() => photosStore.appAccessMode);

// Load collections
const loadCollections = async () => {
  try {
    await collectionsStore.getOrFetch();
  } catch (error) {
    console.error("Error loading collections:", error);
    message.error("Failed to load collections");
  }
};

// Load series
const loadSeries = async () => {
  try {
    await seriesStore.getOrFetch();
  } catch (error) {
    console.error("Error loading series:", error);
    message.error("Failed to load series");
  }
};

// Watch for changes in appAccessMode to fetch photo insight

const fetchPhotoInsight = async () => {
  try {
    // Only continue if there are photos in the store
    if (!Array.isArray(photosStore.photos) || photosStore.photos.length === 0) {
      return;
    }
    // Determine today's date and previous fetch info
    const today = new Date().toDateString();
    const lastFetchDate = localStorage.getItem("photoInsightLastFetch");
    let fetchCount = Number(
      localStorage.getItem("photoInsightFetchCount") || 0,
    );
    // Reset count if a new day
    if (lastFetchDate !== today) {
      fetchCount = 0;
    }
    const cachedInsight = localStorage.getItem("photoInsightData");
    // Use cache if we've reached the daily limit
    if (cachedInsight && fetchCount >= insightFetchLimit) {
      photoInsight.value = JSON.parse(cachedInsight);
      return;
    }
    // Select a random photo for a new insight
    const randomIndex = Math.floor(Math.random() * photosStore.photos.length);
    const randomPhoto = photosStore.photos[randomIndex];
    if (!randomPhoto || !randomPhoto.id) {
      return;
    }
    isLoadingInsight.value = true;
    const { data } = await api.get(
      `/api/catalog/photoInsight/${randomPhoto.id}`,
    );

    // Transform the new response format to match expected structure
    if (
      data &&
      typeof data === "object" &&
      (data.cultural || data.technical || data.evaluation)
    ) {
      // Convert object to array for consistent handling
      const insights = [];
      if (data.cultural) insights.push(data.cultural);
      if (data.technical) insights.push(data.technical);
      if (data.evaluation) insights.push(data.evaluation);

      photoInsight.value = {
        photo: randomPhoto,
        insights: insights,
      };
    } else {
      photoInsight.value = data;
    }

    // Cache data, update date and increment count
    localStorage.setItem(
      "photoInsightData",
      JSON.stringify(photoInsight.value),
    );
    localStorage.setItem("photoInsightLastFetch", today);
    localStorage.setItem("photoInsightFetchCount", String(fetchCount + 1));
    // Store the last photo ID fetched (optional)
    localStorage.setItem("photoInsightPhotoId", String(randomPhoto.id));
  } catch (error) {
    console.error("Error fetching photo insight:", error);
  } finally {
    isLoadingInsight.value = false;
  }
};

watch(
  appAccessMode,
  async (newValue) => {
    // Solo llamar si no está bloqueado y hay fotos en el store
    if (
      newValue !== "blocked" &&
      Array.isArray(photosStore.photos) &&
      photosStore.photos.length > 0
    ) {
      fetchPhotoInsight();
      loadCollections();
      loadSeries();
    }
  },
  { immediate: true },
);

const nextInsight = () => {
  if (photoInsight.value && photoInsight.value.insights) {
    currentInsightIndex.value =
      (currentInsightIndex.value + 1) % photoInsight.value.insights.length;
  }
};

const prevInsight = () => {
  if (photoInsight.value && photoInsight.value.insights) {
    currentInsightIndex.value =
      currentInsightIndex.value === 0
        ? photoInsight.value.insights.length - 1
        : currentInsightIndex.value - 1;
  }
};

const handleMouseEnter = () => {
  isHoveringInsight.value = true;
};

const handleMouseLeave = () => {
  isHoveringInsight.value = false;
};

const openProject = (collectionId: string) => {
  // Navigate to collections view with the specific collection ID
  router.push({ name: "collection-detail", params: { id: collectionId } });
};

const openSeries = (seriesId: string) => {
  // Navigate to series view with the specific series ID
  router.push({ name: "series-detail", params: { id: seriesId } });
};

const goToCatalog = () => {
  // Navigate to workspace
  router.push({ name: "workspace" });
};

const goToCanvas = () => {
  // Navigate to sync-area with catalog tab active
  router.push({ name: "canvas" });
};

const goToExplorer = () => {
  // Navigate to search/explorer
  router.push({ name: "search" });
};

const goToPlan = () => {
  // Navigate to sync-area with catalog tab active
  router.push({ name: "plan" });
};

const goToUpload = () => {
  // Navigate to sync-area with catalog tab active
  router.push({ name: "sync-area", hash: "#upload" });
};

const goToPortfolioReport = () => {
  // Navigate to portfolio-report
  router.push({ name: "portfolio-report" });
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
  background-color: var(--bg-card) !important;
  border: 1px solid var(--border-color) !important;
  flex: 1;
  transition: var(--transition-normal);
  min-height: 120px;
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

.action-icon {
  margin-bottom: var(--spacing-lg);
  color: var(--text-primary);
}

.new-project .action-icon {
  color: var(--success-color);
}

.upload-photos .action-icon {
  color: var(--primary-color);
}

.ai-search .action-icon {
  color: var(--secondary-color);
}

.catalog .action-icon {
  color: var(--warning-color);
}

.portfolio-report .action-icon {
  color: var(--info-color);
}

/* Canvas Card Styles */
.canvas-card {
  position: relative;
  padding: 0;
  overflow: hidden;
  height: 160px;
  min-height: 160px;
}

/* Did you know card styles */
.did-you-know {
  position: relative;
  overflow: hidden;
  background-color: var(--bg-card);
}

.did-you-know.has-photo {
  background-color: var(
    --bg-container
  ); /* Dark gray background for extra space */
}

.did-you-know.has-photo::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  background-image: var(--photo-bg);
  background-color: var(--bg-container);
  border-radius: var(--radius-md);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}

.did-you-know.has-photo::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.3) 50%,
    rgba(0, 0, 0, 0.6) 100%
  );
  border-radius: var(--radius-md);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
}

/* Carousel overlay styles */
.insight-carousel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5); /* More transparent overlay */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 4;
  border-radius: var(--radius-md);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
  visibility: hidden;
}

.did-you-know.hovering .insight-carousel-overlay {
  opacity: 1;
  visibility: visible;
}

.carousel-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: var(--spacing-lg);
  position: relative;
}

.carousel-arrow {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
  flex-shrink: 0;
}

.carousel-arrow:hover {
  background: rgba(255, 255, 255, 0.3);
}

.carousel-arrow-left {
  margin-right: var(--spacing-md);
  margin-left: 5px;
}

.carousel-arrow-right {
  margin-left: var(--spacing-md);
  margin-right: 5px;
}

.insight-text-container {
  flex: 1;
  padding: 0 var(--spacing-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  height: 100%;
}

.insight-text-slide {
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* Transición para el slider de insights */
.insight-slide-enter-active,
.insight-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.insight-slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.insight-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.insight-text-slide p {
  color: var(--text-primary);
  font-size: 13px;
  line-height: var(--line-height-relaxed);
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  font-weight: 500;
}

.carousel-dots {
  position: absolute;
  bottom: var(--spacing-md);
  left: 50%;
  display: flex;
  gap: var(--spacing-xs);
  z-index: 5;
}

.carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.carousel-dot.active {
  background: white;
}

.carousel-dot:hover {
  background: rgba(255, 255, 255, 0.7);
}

.insight-content {
  position: relative;
  z-index: 3;
  margin-bottom: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.insight-overlay {
  position: relative;
  z-index: 3;
  text-align: center;
}

.did-you-know.has-photo .insight-overlay .action-title {
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.did-you-know.has-photo .insight-overlay .action-description {
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  margin: 0;
  line-height: var(--line-height-normal);
}

.did-you-know:not(.has-photo) .insight-overlay .action-title {
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.did-you-know:not(.has-photo) .insight-overlay .action-description {
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-normal);
}

.insight-question-btn {
  background-color: var(--primary-color);
  color: white;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-normal);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 3;
  margin-bottom: var(--spacing-lg);
}

.did-you-know:hover .insight-question-btn {
  background-color: var(--primary-color-hover);
}

.insight-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  position: relative;
  z-index: 3;
  margin-bottom: var(--spacing-lg);
}

.loader-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(var(--text-primary), 0.3);
  border-top: 2px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.did-you-know.has-photo .loader-spinner {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid var(--primary-color);
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.did-you-know .action-icon {
  color: var(--info-color);
}

.action-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.action-description {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-normal);
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

  .action-card {
    height: 140px;
    padding: 20px;
    min-height: 140px;
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

  .action-card {
    height: 120px;
    padding: 16px;
    min-height: 120px;
  }

  .action-title {
    font-size: 14px;
  }

  .action-description {
    font-size: 12px;
  }

  .section-title {
    font-size: 20px;
  }

  /* Mobile adjustments for did-you-know card */
  .insight-question-btn {
    width: 32px;
    height: 32px;
  }

  .insight-loader {
    width: 32px;
    height: 32px;
  }

  .loader-spinner {
    width: 20px;
    height: 20px;
  }

  /* Mobile carousel adjustments */
  .carousel-content {
    padding: var(--spacing-md);
  }

  .carousel-arrow {
    width: 28px;
    height: 28px;
  }

  .carousel-arrow-left {
    margin-right: var(--spacing-sm);
  }

  .carousel-arrow-right {
    margin-left: var(--spacing-sm);
  }

  .insight-text-slide p {
    font-size: var(--font-size-xs);
  }

  .carousel-dots {
    bottom: var(--spacing-sm);
  }

  .carousel-dot {
    width: 6px;
    height: 6px;
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

.project-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.project-card:hover {
  border-color: #2563eb;
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.2);
}

.project-preview {
  position: relative;
  height: 120px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Photo stack styles are in global.scss */

.project-info {
  text-align: center;
}

.project-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.project-meta {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
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

  .project-card {
    padding: 16px;
  }

  .project-preview {
    height: 100px;
    margin-bottom: 12px;
  }

  .photo-stack {
    width: 70px;
    height: 70px;
  }

  .photo-item {
    width: 50px;
    height: 50px;
  }

  .project-title {
    font-size: 16px;
  }

  .project-meta {
    font-size: 12px;
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

/* Large devices - hover effects */
@media (min-width: 1024px) {
  .action-card:hover {
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
  }

  .action-card.disabled:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
