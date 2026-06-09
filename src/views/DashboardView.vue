<template>
  <div class="dashboard-container view-container">
    <div class="dashboard-grid">
      <!-- ══════════════════════════════════════════ -->
      <!-- LEFT PANEL — Insights & Analytics          -->
      <!-- ══════════════════════════════════════════ -->
      <aside class="panel panel-left">
        <header class="panel-header">
          <span class="panel-label">PHOTOREKA INSIGHTS &amp; ANALYTICS</span>
        </header>
        <div class="panel-body">
          <!-- Welcome block -->
          <div class="welcome-block">
            <h2 class="welcome-name">
              WELCOME BACK,&nbsp;{{ userStore.userShortName?.toUpperCase() }}.
            </h2>
            <p class="welcome-tagline">
              <template v-if="avgAestheticScore != null">
                Your total portfolio Aesthetic Avg. is
                <strong>{{ avgAestheticScore.toFixed(1) }}</strong
                >.
              </template>
              <template v-else>Ready to explore your photo universe.</template>
            </p>
          </div>

          <!-- Score gauges -->
          <div class="score-gauges">
            <ScoreGauge label="Aesthetic Quality" :value="avgAestheticScore" />
            <ScoreGauge label="Storytelling" :value="avgStorytellingScore" />
          </div>

          <!-- Daily artistic curation -->
          <div class="section-label">DAILY ARTISTIC CURATION</div>
          <DailyEurekaCard />
        </div>
      </aside>

      <!-- ══════════════════════════════════════════ -->
      <!-- CENTER — Photo Universe (quantum void)     -->
      <!-- ══════════════════════════════════════════ -->
      <PhotoUniverse :photo-count="photos.length" />

      <!-- ══════════════════════════════════════════ -->
      <!-- RIGHT PANEL — Catalog Control Panel        -->
      <!-- ══════════════════════════════════════════ -->
      <aside class="panel panel-right">
        <header class="panel-header">
          <span class="panel-label">CATALOG CONTROL PANEL</span>
        </header>
        <div class="panel-body">
          <!-- Smart Tools -->
          <div class="section-label">SMART TOOLS</div>
          <div class="tools-container">
            <nav class="tools-list">
              <!-- Promo tools from config -->
              <button
                v-for="tool in promoTools"
                :key="tool.id"
                class="tool-item"
                :class="{ 'tool-item--disabled': appAccessMode === 'blocked' }"
                :disabled="appAccessMode === 'blocked'"
                @click="goToTool(tool.id)"
              >
                <n-icon size="18" color="var(--primary-color)">
                  <component :is="getIconComponent(tool.icon)" />
                </n-icon>
                <div class="tool-text">
                  <span class="tool-name">{{ tool.name }}</span>
                </div>
                <span class="tool-badge-new">NEW</span>
              </button>

              <!-- Canvas -->
              <button
                v-if="!isMobileLimitedMode"
                class="tool-item"
                @click="goToTool('canvas')"
              >
                <n-icon size="18" color="var(--primary-color)">
                  <Workspace />
                </n-icon>
                <div class="tool-text">
                  <span class="tool-name">Canvas</span>
                  <span v-if="canvasCount > 0" class="tool-sub">{{
                    activeCanvasName
                  }}</span>
                </div>
              </button>

              <!-- Explorer (mobile only) -->
              <button
                v-if="isMobileLimitedMode"
                class="tool-item"
                :class="{ 'tool-item--disabled': appAccessMode === 'blocked' }"
                :disabled="appAccessMode === 'blocked'"
                @click="goToTool('search')"
              >
                <n-icon size="18" color="var(--primary-color)">
                  <SearchIcon />
                </n-icon>
                <span class="tool-name">Explorer</span>
              </button>

              <!-- Workspace -->
              <button
                class="tool-item"
                :class="{ 'tool-item--disabled': appAccessMode === 'blocked' }"
                :disabled="appAccessMode === 'blocked'"
                @click="goToTool('workspace')"
              >
                <n-icon size="18" color="var(--primary-color)">
                  <LayersOutline />
                </n-icon>
                <div class="tool-text">
                  <span class="tool-name">Your Workspace</span>
                  <span v-if="photos.length > 0" class="tool-sub">
                    {{ photos.length }}
                    {{ photos.length === 1 ? "photo" : "photos" }}
                  </span>
                </div>
              </button>

              <!-- Report & Statistics (desktop only) -->
              <button
                v-if="!isMobileLimitedMode"
                class="tool-item"
                :class="{ 'tool-item--disabled': appAccessMode === 'blocked' }"
                :disabled="appAccessMode === 'blocked'"
                @click="goToTool('report')"
              >
                <n-icon size="18" color="var(--primary-color)">
                  <AnalyticsOutline />
                </n-icon>
                <div class="tool-text">
                  <span class="tool-name">Report &amp; Statistics</span>
                </div>
              </button>
            </nav>
          </div>

          <!-- Recent Collections & Series -->
          <div class="section-label section-label--spaced">
            RECENT COLLECTIONS &amp; SERIES
          </div>

          <div v-if="isLoadingCollections" class="mini-loading">
            <div class="mini-spinner" />
            <span>Loading…</span>
          </div>

          <div
            v-else-if="appAccessMode === 'blocked' || collections.length === 0"
            class="mini-empty"
          >
            <n-icon size="32" color="var(--text-tertiary)">
              <CollectionsIcon />
            </n-icon>
            <p>Nothing here yet</p>
            <router-link
              v-if="appAccessMode !== 'blocked'"
              to="/collections"
              class="mini-empty-link"
              >Manage collections</router-link
            >
          </div>

          <div v-else class="collections-stack">
            <CollectionCard
              v-for="item in collections.slice(0, 3)"
              :key="item.id"
              :item="item"
              :type="item.itemType"
              :show-update-date="false"
              :selectable="false"
              @click="
                item.itemType === 'collection'
                  ? openProject(item.id)
                  : openSeries(item.id)
              "
            />
          </div>
        </div>
      </aside>
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
import CollectionCard from "@/components/CollectionCard.vue";
import DailyEurekaCard from "@/components/DailyEurekaCard.vue";
import PhotoUniverse from "@/components/PhotoUniverse.vue";
import ScoreGauge from "@/components/ScoreGauge.vue";
import { isMobileDevice } from "@/utils/utils.js";
import { getPromoTools, getIconComponent } from "@/config/toolsConfig.js";

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

const avgAestheticScore = computed(() => {
  const photos = (photosStore.photos || []) as any[];
  if (!photos.length) return null;
  const scores = photos
    .map((p) => p.descriptions?.artistic_scores?.aesthetic_quality)
    .filter((s) => typeof s === "number");
  if (!scores.length) return null;
  return scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
});

const avgStorytellingScore = computed(() => {
  const photos = (photosStore.photos || []) as any[];
  if (!photos.length) return null;
  const scores = photos
    .map((p) => p.descriptions?.artistic_scores?.storytelling)
    .filter((s) => typeof s === "number");
  if (!scores.length) return null;
  return scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
});

// Promo tools derived from centralized config (desktop-only)
const promoTools = computed(() =>
  isMobileLimitedMode.value ? [] : getPromoTools("desktop"),
);

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

// Canvas count and active name
const canvasCount = ref(0);
const activeCanvasName = ref("");

const loadCanvasInfo = async () => {
  try {
    if (userStore.isAuthenticated) {
      const res = await api.get("/api/canvas");
      const list = res.data || [];
      canvasCount.value = list.length;
      if (list.length > 0) {
        const activeId = localStorage.getItem("photoreka_active_canvas_id");
        const active = activeId
          ? list.find((c: any) => String(c.id) === String(activeId))
          : null;
        activeCanvasName.value = (active || list[0]).name || "My Canvas";
      }
    } else {
      const savedCanvas = localStorage.getItem("photoreka_canvas_data");
      canvasCount.value = savedCanvas ? 1 : 0;
      activeCanvasName.value = savedCanvas ? "My Canvas" : "";
    }
  } catch (error) {
    console.error("Error loading canvas info:", error);
  }
};

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
  loadCanvasInfo();
});
</script>

<style scoped>
/* ─────────────────────────────────────────────
   Root layout
───────────────────────────────────────────── */
.dashboard-container {
  padding: 0;
  margin: 0;
  height: 100%;
  min-height: 0;
  background-color: var(--bg-body);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dashboard-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 340px 1fr 340px;
  grid-template-rows: 1fr;
  overflow: hidden;
}

/* ─────────────────────────────────────────────
   Panel base
───────────────────────────────────────────── */
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background-color: var(--bg-deep-surface);
}

.panel-header {
  flex-shrink: 0;
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-deep-surface);
}

.panel-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}
.panel-body::-webkit-scrollbar {
  width: 4px;
}
.panel-body::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

/* ─────────────────────────────────────────────
   Left panel
───────────────────────────────────────────── */
.panel-left {
  border-right: 1px solid var(--border-color);
}

/* ─────────────────────────────────────────────
   Right panel
───────────────────────────────────────────── */
.panel-right {
  border-left: 1px solid var(--border-color);
}

/* ─────────────────────────────────────────────
   Section labels
───────────────────────────────────────────── */
.section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.section-label--spaced {
  margin-top: 28px;
}

/* ─────────────────────────────────────────────
   Welcome block (left panel)
───────────────────────────────────────────── */
.welcome-block {
  margin-bottom: 20px;
}

.welcome-name {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-primary);
  margin: 0 0 4px;
  line-height: 1.35;
}

.welcome-tagline {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

/* ─────────────────────────────────────────────
   Score gauge cards (left panel)
───────────────────────────────────────────── */
.score-gauges {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

/* ─────────────────────────────────────────────
   Tools list (right panel)
───────────────────────────────────────────── */
.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tools-container {
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 10px;
  margin-bottom: 4px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-surface);
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.tool-item:hover {
  background-color: var(--bg-card);
  border-color: var(--border-color-hover);
}

.tool-item--disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
.tool-item--disabled:hover {
  background-color: transparent;
}

.tool-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-sub {
  font-size: 10px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-badge-new {
  flex-shrink: 0;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary-color);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 5px;
}

/* ─────────────────────────────────────────────
   Collections stack (right panel)
───────────────────────────────────────────── */
.collections-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ─────────────────────────────────────────────
   Mini loading / empty states
───────────────────────────────────────────── */
.mini-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.mini-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 8px;
  text-align: center;
}

.mini-empty p {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.mini-empty-link {
  font-size: 11px;
  color: var(--primary-color);
  text-decoration: none;
}
.mini-empty-link:hover {
  text-decoration: underline;
}

/* ─────────────────────────────────────────────
   Responsive
───────────────────────────────────────────── */
@media (max-width: 1200px) {
  .dashboard-grid {
    grid-template-columns: 300px 1fr 300px;
  }
}

@media (max-width: 900px) {
  /* Two-column: hide left panel, keep center + right */
  .dashboard-grid {
    grid-template-columns: 1fr 300px;
  }
  .panel-left {
    display: none;
  }
}

@media (max-width: 680px) {
  /* Single column: stack all panels */
  .dashboard-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto 300px auto;
    overflow-y: auto;
  }
  .panel-left {
    display: flex;
  }
  .panel-right {
    overflow: visible;
  }
  .panel-body {
    overflow: visible;
  }
}
</style>
