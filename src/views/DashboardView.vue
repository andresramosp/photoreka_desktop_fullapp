<template>
  <div class="dashboard-container view-container">
    <div class="dashboard-grid">
      <!-- ══════════════════════════════════════════ -->
      <!-- LEFT PANEL — Insights & Analytics          -->
      <!-- ══════════════════════════════════════════ -->
      <aside class="panel panel-left">
        <div class="panel-body">
          <!-- Welcome + Stats -->
          <div class="panel-section">
            <div class="welcome-block">
              <h2 class="welcome-name">
                WELCOME BACK,&nbsp;{{
                  userStore.userShortName?.toUpperCase()
                }}!👋
              </h2>
              <p class="welcome-tagline">
                <template v-if="avgAestheticScore != null">
                  Ready to organize your photos with Photoreka smart tools.
                </template>
                <template v-else
                  >Ready to explore your photo universe.</template
                >
              </p>
            </div>

            <div class="photo-stats-block">
              <div
                class="photos-primary-stat"
                role="group"
                aria-label="Photo stats"
              >
                <div class="photos-primary-info">
                  <n-icon size="16" class="photos-primary-icon">
                    <LayersOutline />
                  </n-icon>
                  <span class="photos-primary-count">{{
                    photos.length.toLocaleString()
                  }}</span>
                  <span class="photos-primary-label">Photos</span>
                </div>

                <n-button
                  type="info"
                  size="small"
                  @click="navigateToWorkspace"
                  aria-label="See in workspace"
                >
                  Explore your Workspace
                </n-button>
              </div>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="panel-section">
            <div class="section-header-row">
              <div class="section-label section-label--inline">Quick Stats</div>
              <ModePopoverSelector
                v-model="gaugesMode"
                :accent="false"
                :singleMode="true"
                icon="settings"
                :width="190"
                :options="gaugesModeOptions"
                header="Quick Stats Preferences"
                placement="bottom-end"
                aria-label="Change quick stats mode"
                class="quick-stats-mode-selector"
              />
            </div>
            <GaugesSection :mode="gaugesMode" />
          </div>

          <!-- Smart Tools -->
          <div class="panel-section panel-section--grow">
            <div class="section-label">SMART TOOLS</div>
            <div class="smart-tools-scroll-area">
              <SmartToolsSection
                :app-access-mode="appAccessMode"
                :is-mobile-limited-mode="isMobileLimitedMode"
              />
            </div>
          </div>
        </div>
      </aside>

      <!-- ══════════════════════════════════════════ -->
      <!-- CENTER — Photo Universe (quantum void)     -->
      <!-- ══════════════════════════════════════════ -->
      <PhotoUniverse v-if="!isMobileLimitedMode" :photo-count="photos.length" />

      <!-- ══════════════════════════════════════════ -->
      <!-- RIGHT PANEL — Catalog Control Panel        -->
      <!-- ══════════════════════════════════════════ -->
      <aside class="panel panel-right">
        <div class="panel-body">
          <!-- Daily artistic curation -->
          <div class="panel-section">
            <div class="section-label">DAILY ARTISTIC CURATION</div>
            <div class="daily-eureka-card">
              <DailyEurekaCard v-if="!isDashboardEmpty" />
              <div v-else class="mini-empty daily-eureka-empty">
                <n-icon size="32" color="var(--text-tertiary)">
                  <CollectionsIcon />
                </n-icon>
                <p>Nothing here yet</p>
              </div>
            </div>
          </div>

          <!-- Recent Collections & Series -->
          <div class="panel-section panel-section--grow">
            <div class="section-label">
              RECENT COLLECTIONS, SERIES &amp; PORTFOLIOS
            </div>

            <div class="collections-scroll-area">
              <div v-if="isLoadingCollections" class="mini-loading">
                <div class="mini-spinner" />
                <span>Loading…</span>
              </div>

              <div
                v-else-if="
                  appAccessMode === 'blocked' || collections.length === 0
                "
                class="mini-empty collections-empty-state"
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
                  v-for="item in collections.slice(0, 6)"
                  :key="item.id"
                  :item="item"
                  :type="item.itemType"
                  :compact="true"
                  :show-update-date="false"
                  :selectable="false"
                  @click="
                    item.itemType === 'collection'
                      ? openProject(item.id)
                      : item.itemType === 'series'
                        ? openSeries(item.id)
                        : openPortfolio(item.id)
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";

defineOptions({
  name: "DashboardView",
});
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds.js";
import { useUserStore } from "@/stores/userStore.js";
import CollectionCard from "@/components/CollectionCard.vue";
import DailyEurekaCard from "@/components/dashboard/DailyEurekaCard.vue";
import GaugesSection from "@/components/dashboard/GaugesSection.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import PhotoUniverse from "@/components/dashboard/PhotoUniverse.vue";
import SmartToolsSection from "@/components/dashboard/SmartToolsSection.vue";
import { isMobileDevice } from "@/utils/utils.js";

// Import @vicons icons from ionicons5 for reliability
import {
  FolderOpenOutline as CollectionsIcon,
  WalkOutline,
  BriefcaseOutline,
  CameraOutline,
  PersonOutline,
  ImageOutline,
  LayersOutline,
  ApertureOutline,
  MoonOutline,
  ColorPaletteOutline,
  GridOutline,
} from "@vicons/ionicons5";

import { BookOpen16Regular, Camera20Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";

const router = useRouter();
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const portfolioBuildsStore = usePortfolioBuildsStore();
const userStore = useUserStore();

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

const getItemTimestamp = (item: any): number => {
  const rawDate =
    item?.updated_at ?? item?.updatedAt ?? item?.created_at ?? item?.createdAt;

  const parsed = rawDate ? new Date(rawDate).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
};

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
    ...(portfolioBuildsStore.allBuilds || []).map((build: any) => ({
      ...build,
      itemType: "portfolio",
      name: build.config?.name || build.name || `Portfolio #${build.id}`,
      photos: build.photoItems || [],
      updatedAt: build.updatedAt || build.createdAt,
    })),
  ];

  // Ordenar por fecha de actualización/creación descendente y tomar solo los 4 más recientes
  return allItems
    .sort((a: any, b: any) => getItemTimestamp(b) - getItemTimestamp(a))
    .slice(0, 6);
});
const isLoadingCollections = computed(
  () =>
    collectionsStore.isLoading ||
    seriesStore.isLoading ||
    portfolioBuildsStore.isLoading,
);

// Recent photos for workspace preview
const photos = computed(() => {
  if (
    !photosStore.processedPhotos ||
    !Array.isArray(photosStore.processedPhotos)
  ) {
    return [];
  }
  // Return all photos for counting, component will slice for display
  return photosStore.processedPhotos;
});

const appAccessMode = computed(() => photosStore.appAccessMode);
const isDashboardEmpty = computed(
  () => appAccessMode.value === "blocked" || photos.value.length === 0,
);

type DashboardGaugesMode = "main" | "genre";
const DASHBOARD_GAUGES_MODE_KEY = "photoreka:dashboard:gauges:mode";

const isDashboardGaugesMode = (
  value: string | null,
): value is DashboardGaugesMode => value === "main" || value === "genre";

const savedGaugesMode =
  typeof window !== "undefined"
    ? window.localStorage.getItem(DASHBOARD_GAUGES_MODE_KEY)
    : null;

const gaugesMode = ref<DashboardGaugesMode>(
  isDashboardGaugesMode(savedGaugesMode) ? savedGaugesMode : "genre",
);

const gaugesModeOptions = [
  { label: "Main Scores", value: "main" },
  { label: "Genre Stats", value: "genre" },
];

watch(gaugesMode, (mode) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DASHBOARD_GAUGES_MODE_KEY, mode);
  }
});

const GENRE_BADGE_META: Record<string, { label: string; icon: any }> = {
  general: { label: "General", icon: Camera20Regular },
  street: { label: "Street", icon: WalkOutline },
  documentary: { label: "Documentary", icon: BookOpen16Regular },
  abstract: { label: "Artistic", icon: PaletteOutlined },
  commercial: { label: "Commercial", icon: BriefcaseOutline },
  portrait: { label: "Portrait", icon: PersonOutline },
  landscape: { label: "Landscape", icon: ImageOutline },
  architecture: { label: "Architecture", icon: GridOutline },
  travel: { label: "Travel", icon: CameraOutline },
  nature: { label: "Nature", icon: ApertureOutline },
  night: { label: "Night", icon: MoonOutline },
  conceptual: { label: "Conceptual", icon: ColorPaletteOutline },
};

const formatGenreLabel = (genre: string) =>
  genre
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const genreBadges = computed(() => {
  const counts = new Map<string, number>();

  photos.value.forEach((photo: any) => {
    const genres = photo?.descriptions?.visual_aspects?.genre;
    if (Array.isArray(genres) && genres.length > 0) {
      genres.forEach((rawGenre: string) => {
        const genre = String(rawGenre || "")
          .trim()
          .toLowerCase();
        if (!genre) return;
        counts.set(genre, (counts.get(genre) || 0) + 1);
      });
    }
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const meta = GENRE_BADGE_META[key];
      return {
        key,
        label: meta?.label || formatGenreLabel(key),
        icon: meta?.icon || CameraOutline,
        count,
      };
    });
});

// Pack badges into 2 rows, collapsing overflow into "Other"
const displayedGenreBadges = computed(() => {
  const all = genreBadges.value;
  if (!all.length) return [];

  // Estimate badge pixel width: icon + gaps + label chars + count chars + padding
  const estimateWidth = (label: string, count: number) =>
    12 + 5 + label.length * 6.8 + 3 + count.toString().length * 6.8 + 18;

  const PANEL_WIDTH = 300; // ~340px panel minus 32px padding minus scrollbar
  const GAP = 6;
  const MAX_ROWS = 2;

  let currentRow = 0;
  let rowUsed = 0;
  const visible: typeof all = [];

  for (let i = 0; i < all.length; i++) {
    const badge = all[i];
    const w = estimateWidth(badge.label, badge.count);
    const needed = rowUsed === 0 ? w : w + GAP;

    if (rowUsed + needed > PANEL_WIDTH) {
      currentRow++;
      rowUsed = 0;
    }

    if (currentRow >= MAX_ROWS) {
      // Aggregate the rest (including current) into Other
      const otherCount = all.slice(i).reduce((sum, b) => sum + b.count, 0);
      // Replace last visible badge if it's already "Other", else push
      const last = visible[visible.length - 1];
      if (last?.key === "other") {
        visible[visible.length - 1] = {
          key: "other",
          label: "Other",
          icon: GridOutline,
          count: last.count + otherCount,
        };
      } else {
        visible.push({
          key: "other",
          label: "Other",
          icon: GridOutline,
          count: otherCount,
        });
      }
      break;
    }

    rowUsed += rowUsed === 0 ? w : w + GAP;
    visible.push(badge);
  }

  return visible;
});

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

// Load portfolios
const loadPortfolios = async () => {
  try {
    await portfolioBuildsStore.getOrFetch();
  } catch (error) {
    console.error("Error loading portfolios:", error);
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
      loadPortfolios();
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

const openPortfolio = (portfolioId: string) => {
  // Navigate to portfolio view with the specific portfolio ID
  router.push({ name: "portfolio-detail", params: { id: portfolioId } });
};

const navigateToWorkspace = () => {
  router.push({ name: "workspace" });
};
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
  /* ── Single place to tune all inter-section spacing ── */
  --dashboard-section-gap: 14px;
  --dashboard-label-gap: 8px;
}

.dashboard-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns:
    clamp(250px, 22vw, 450px)
    minmax(0, 1fr)
    clamp(260px, 24vw, 450px);
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

.panel-left .panel-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: var(--dashboard-section-gap);
}

/* ─────────────────────────────────────────────
   Right panel
───────────────────────────────────────────── */
.panel-right {
  border-left: 1px solid var(--border-color);
}

.panel-right .panel-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: var(--dashboard-section-gap);
}

/* ─────────────────────────────────────────────
   Panel sections — spacing controlled by variables above
───────────────────────────────────────────── */
.panel-section {
  display: flex;
  flex-direction: column;
  gap: var(--dashboard-label-gap);
  flex-shrink: 0;
}

.panel-section--grow {
  flex: 1;
  min-height: 0;
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
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.section-label--inline {
  margin: 0;
  padding: 0;
  border-bottom: none;
}

.quick-stats-mode-selector {
  flex-shrink: 0;
}

/* ─────────────────────────────────────────────
   Welcome block (left panel)
───────────────────────────────────────────── */
.welcome-block {
  margin: 0;
}

.photo-stats-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.photos-primary-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-color);
  border-radius: 12px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.photos-primary-info {
  display: flex;
  gap: 7px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  align-items: center;
  /* justify-content: center; */
}

.photos-primary-icon {
  color: var(--accent-color);
  flex-shrink: 0;
}

.photos-primary-count {
  font-size: 22px;
  font-weight: 800;
  color: var(--accent-color);
  line-height: 1;
  letter-spacing: -0.03em;
}

.photos-primary-label {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photos-workspace-button {
  flex-shrink: 0;
  border: 1px solid
    color-mix(in srgb, var(--primary-color) 45%, var(--border-color));
  background: color-mix(in srgb, var(--primary-color) 15%, var(--bg-container));
  color: var(--text-primary);
  border-radius: 10px;
  padding: 0 12px;
  height: 34px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    transform 0.18s ease;
}

.photos-workspace-button:hover {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 22%, var(--bg-container));
}

.photos-workspace-button:focus-visible {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--primary-color) 35%, transparent);
}

.photos-workspace-button:active {
  transform: translateY(1px);
}

@media (max-width: 360px) {
  .photos-primary-stat {
    flex-direction: column;
    align-items: stretch;
  }

  .photos-workspace-button {
    width: 100%;
  }
}

.genre-badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.genre-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 4px 10px 4px 8px;
  background: var(--bg-container);
  white-space: nowrap;
}

.genre-badge-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.genre-badge-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.genre-badge-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  padding-left: 3px;
}

.welcome-name {
  font-size: 15px;
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

.daily-eureka-card {
  margin: 0;
}

.daily-eureka-empty {
  min-height: 180px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-container);
  justify-content: center;
}

/* ─────────────────────────────────────────────
   Collections stack (right panel)
───────────────────────────────────────────── */
.collections-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collections-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.collections-scroll-area::-webkit-scrollbar {
  width: 4px;
}

.collections-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.smart-tools-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.smart-tools-scroll-area::-webkit-scrollbar {
  width: 4px;
}

.smart-tools-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
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

.collections-empty-state {
  min-height: 100%;
  justify-content: center;
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
    grid-template-columns:
      clamp(230px, 24vw, 300px)
      minmax(0, 1fr)
      clamp(240px, 28vw, 320px);
  }
}

@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 1fr clamp(250px, 34vw, 350px);
  }

  .panel-left {
    display: none;
  }
}

@media (max-width: 680px) {
  /* Single column: stack panels in normal document flow */
  .dashboard-container {
    height: auto;
    min-height: 100%;
    overflow-y: auto;
  }

  .dashboard-grid {
    display: flex;
    flex-direction: column;
    overflow: visible;
  }

  .panel {
    overflow: visible;
  }

  .panel-left {
    display: flex;
  }

  .panel-right {
    overflow: visible;
  }

  .panel-body {
    flex: none;
    overflow: visible;
  }

  .panel-left .panel-body {
    display: block;
    overflow: visible;
  }

  .panel-right .panel-body {
    overflow: visible;
  }

  .collections-scroll-area {
    min-height: auto;
    overflow: visible;
  }

  .smart-tools-scroll-area {
    min-height: auto;
    overflow: visible;
  }
}
</style>
