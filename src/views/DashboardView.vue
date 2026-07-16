<template>
  <div class="dashboard-container view-container">
    <div
      class="dashboard-grid"
      :class="{ 'is-chat-fullscreen': isChatFullscreen }"
    >
      <!-- ══════════════════════════════════════════ -->
      <!-- LEFT PANEL — Insights & Analytics          -->
      <!-- ══════════════════════════════════════════ -->
      <aside class="panel panel-left">
        <div class="panel-body">
          <!-- Welcome + Stats -->
          <WelcomeSection
            :user-short-name="userStore.userShortName"
            :avg-aesthetic-score="avgAestheticScore"
            :photos-count="photos.length"
            :preferred-source="userStore.user?.preferredSource"
            :analyzed-photos-remaining="
              userStore.user?.usage?.analyzedPhotosRemaining
            "
            @go-workspace="navigateToWorkspace"
            @go-upload="navigateToImportArea"
          />

          <div class="panel-sections-scroll-area">
            <div class="panel-section">
              <div class="section-label">Quick Access</div>
              <SmartToolsSection
                :app-access-mode="appAccessMode"
                :is-mobile-limited-mode="isMobileLimitedMode"
                :show-chat-tool="universeMode !== 'chat'"
                :show-2d-atlas-tool="universeMode !== 'photos2d'"
              />
            </div>
            <!-- Daily artistic curation — relocated here while the right
                 panel is collapsed on narrow desktop/tablet widths -->
            <div v-if="isDailyCurationInLeftPanel" class="panel-section">
              <div class="section-label">DAILY EUREKA</div>
              <div class="daily-eureka-card">
                <DailyEurekaCard v-if="!isDashboardEmpty" />
                <div v-else class="panel-empty-state panel-empty-state--boxed">
                  <n-icon size="32" color="var(--text-tertiary)">
                    <CollectionsIcon />
                  </n-icon>
                  <p>Nothing here yet</p>
                </div>
              </div>
            </div>

            <!-- Recent Collections & Series -->
            <div class="panel-section panel-section--grow">
              <div class="section-label">RECENT LIBRARY</div>

              <div class="collections-scroll-area">
                <div v-if="isLoadingCollections" class="mini-loading">
                  <div class="mini-spinner" />
                  <span>Loading…</span>
                </div>

                <div
                  v-else-if="
                    appAccessMode === 'blocked' || collections.length === 0
                  "
                  class="panel-empty-state"
                >
                  <n-icon size="32" color="var(--text-tertiary)">
                    <CollectionsIcon />
                  </n-icon>
                  <p>Nothing here yet</p>
                  <router-link
                    v-if="appAccessMode !== 'blocked'"
                    to="/collections"
                    class="panel-empty-state-link"
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
                  <CreateCard
                    class="dashboard-create-collection-card"
                    title="Add Collections"
                    subtitle="Start organizing your photos"
                    @click="navigateToCollections"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- ══════════════════════════════════════════ -->
      <!-- CENTER — Photo Universe (quantum void)     -->
      <!-- ══════════════════════════════════════════ -->
      <PhotoUniverse
        v-if="!isMobileLimitedMode"
        :photo-count="photos.length"
        :forced-mode="forcedUniverseMode"
        :conversation-id="requestedConversationId"
        @update:mode="universeMode = $event"
      />

      <!-- ══════════════════════════════════════════ -->
      <!-- RIGHT PANEL — Catalog Control Panel        -->
      <!-- ══════════════════════════════════════════ -->
      <aside class="panel panel-right">
        <div class="panel-body">
          <!-- Daily artistic curation (fixed, non-scrollable) -->
          <div v-if="!isDailyCurationInLeftPanel" class="panel-section">
            <div class="section-label">DAILY EUREKA</div>
            <div class="daily-eureka-card">
              <DailyEurekaCard v-if="!isDashboardEmpty" />
              <div v-else class="panel-empty-state panel-empty-state--boxed">
                <n-icon size="32" color="var(--text-tertiary)">
                  <CollectionsIcon />
                </n-icon>
                <p>Nothing here yet</p>
              </div>
            </div>
          </div>

          <div class="panel-sections-scroll-area">
            <!-- Quick Stats -->
            <div class="panel-section">
              <div class="section-header-row">
                <div class="section-label section-label--inline">
                  Genre & Scoring Stats
                </div>
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

            <!-- Main Patterns -->
            <div class="panel-section panel-section--grow">
              <PatternsSection />
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useChatFullscreenStore } from "@/stores/chatFullscreen";

defineOptions({
  name: "DashboardView",
});
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds.js";
import { useUserStore } from "@/stores/userStore.js";
import CollectionCard from "@/components/CollectionCard.vue";
import CreateCard from "@/components/photos-grid/CreateCard.vue";
import DailyEurekaCard from "@/components/dashboard/DailyEurekaCard.vue";
import GaugesSection from "@/components/dashboard/GaugesSection.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import PhotoUniverse from "@/components/dashboard/PhotoUniverse.vue";
import SmartToolsSection from "@/components/dashboard/SmartToolsSection.vue";
import WelcomeSection from "@/components/dashboard/WelcomeSection.vue";
import PatternsSection from "@/components/dashboard/PatternsSection.vue";
import { isMobileDevice } from "@/utils/utils.js";

// Import @vicons icons from ionicons5 for reliability
import {
  FolderOpenOutline as CollectionsIcon,
  WalkOutline,
  BriefcaseOutline,
  CameraOutline,
  PersonOutline,
  ImageOutline,
  ApertureOutline,
  MoonOutline,
  ColorPaletteOutline,
  GridOutline,
} from "@vicons/ionicons5";

import { BookOpen16Regular, Camera20Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";

const route = useRoute();
const router = useRouter();
const photosStore = usePhotosStore();

// The /chat-lab routes redirect here on desktop (see router/index.ts), carrying
// the chat request in the query. We capture it once and strip it from the URL:
// it's a one-shot instruction, not state the dashboard should keep replaying on
// reload or when the user switches to another panel.
const forcedUniverseMode = ref<string | null>(null);
const requestedConversationId = ref<string | null>(null);

// The chat panel can take over the dashboard: the side panels fold away and the
// universe keeps the full width to itself. The state is shared (see the store)
// because the sidebar logo collapses it on its way home.
const { isFullscreen: isChatFullscreen } = storeToRefs(
  useChatFullscreenStore(),
);

// Which panel the universe is showing (its own stored preference, unless a
// forced mode or an empty library overrides it). The left panel offers a chat
// or 2D Atlas quick access tile only while the center is on something else —
// each tile is a way back to that panel, not a link to the view we are already in.
const universeMode = ref<string>("chat");

const readFirst = (value: unknown): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
};

watch(
  () => route.query,
  async (query) => {
    if (route.name !== "dashboard") return;
    if (readFirst(query.view) !== "chat") return;

    requestedConversationId.value = readFirst(query.conversation);
    forcedUniverseMode.value = "chat";

    const rest = { ...query };
    delete rest.view;
    delete rest.conversation;
    router.replace({ name: "dashboard", query: rest });

    // forcedMode is a one-shot command, not persistent state. The dashboard is
    // kept alive, so if we leave it set to "chat", a later request to reopen the
    // chat (after the user switched the center panel to another view) sets it to
    // "chat" again — an unchanged value PhotoUniverse's watcher never sees, and
    // the click does nothing. Clear it once consumed so it can fire again.
    await nextTick();
    forcedUniverseMode.value = null;
  },
  { immediate: true },
);
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const portfolioBuildsStore = usePortfolioBuildsStore();
const userStore = useUserStore();

// Check if in mobile limited mode
const isMobileLimitedMode = computed(() => isMobileDevice());

/* Narrow desktop / tablet: the right panel is hidden by CSS, so its daily
   curation card is rendered inside the left panel instead. Must stay in sync
   with the matching media query in the styles below. */
const narrowLayoutQuery = window.matchMedia(
  "(min-width: 681px) and (max-width: 1324px)",
);
const isDailyCurationInLeftPanel = ref(narrowLayoutQuery.matches);
const onNarrowLayoutChange = (e: MediaQueryListEvent) => {
  isDailyCurationInLeftPanel.value = e.matches;
};
narrowLayoutQuery.addEventListener("change", onNarrowLayoutChange);
onBeforeUnmount(() => {
  narrowLayoutQuery.removeEventListener("change", onNarrowLayoutChange);
});

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
  const allItems = [
    ...(collectionsStore.allCollections || []).map((item: any) => ({
      ...item,
      itemType: "collection",
    })),
  ];

  if (!isMobileLimitedMode.value) {
    allItems.push(
      ...(seriesStore.allSeries || []).map((item: any) => ({
        ...item,
        itemType: "series",
      })),
      ...(portfolioBuildsStore.allBuilds || []).map((build: any) => ({
        ...build,
        itemType: "portfolio",
        name: build.config?.name || build.name || `Portfolio #${build.id}`,
        photos: build.photoItems || [],
        updatedAt: build.updatedAt || build.createdAt,
      })),
    );
  }

  // Ordenar por fecha de actualización/creación descendente y tomar solo los 4 más recientes
  return allItems
    .sort((a: any, b: any) => getItemTimestamp(b) - getItemTimestamp(a))
    .slice(0, 6);
});
const isLoadingCollections = computed(
  () =>
    collectionsStore.isLoading ||
    (!isMobileLimitedMode.value &&
      (seriesStore.isLoading || portfolioBuildsStore.isLoading)),
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
  isDashboardGaugesMode(savedGaugesMode)
    ? savedGaugesMode
    : isMobileDevice()
      ? "main"
      : "genre",
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

const navigateToImportArea = () => {
  router.push({ name: "import-area", hash: "#upload" });
};

const navigateToCollections = () => {
  router.push({ name: "collections" });
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
  /* Side widths live in variables so the chat's fullscreen mode can collapse
     them to zero and let the grid animate the columns closed. */
  --panel-left-width: clamp(260px, 23vw, 450px);
  --panel-right-width: clamp(260px, 23vw, 450px);
  grid-template-columns:
    var(--panel-left-width)
    minmax(0, 1fr)
    var(--panel-right-width);
  grid-template-rows: 1fr;
  overflow: hidden;
  transition: grid-template-columns 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.dashboard-grid.is-chat-fullscreen {
  --panel-left-width: 0px;
  --panel-right-width: 0px;
}

.dashboard-grid.is-chat-fullscreen .panel-left,
.dashboard-grid.is-chat-fullscreen .panel-right {
  opacity: 0;
  pointer-events: none;
  border-color: transparent;
}

.dashboard-grid .panel-left,
.dashboard-grid .panel-right {
  min-width: 0;
  transition:
    opacity 0.28s ease,
    border-color 0.4s ease;
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

.panel-sections-scroll-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dashboard-section-gap);
  overflow-y: auto;
  overflow-x: hidden;
  /* Extend to the panel edge so the scrollbar is not inset by panel-body padding */
  margin-right: -16px;
  padding-right: 12px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.panel-sections-scroll-area::-webkit-scrollbar {
  width: 4px;
}

.panel-sections-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
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

.panel-right .panel-sections-scroll-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dashboard-section-gap);
  overflow-y: auto;
  overflow-x: hidden;
  margin-right: -16px;
  padding-right: 12px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.panel-right .panel-sections-scroll-area::-webkit-scrollbar {
  width: 4px;
}

.panel-right .panel-sections-scroll-area::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
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

/* Takes the leftover height of the scroll area so an empty section can center
   its placeholder, but never shrinks below its content once it has cards. */
.panel-section--grow {
  flex: 1 0 auto;
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

.photos-primary-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0;
  justify-content: center;
}

.photos-primary-icon {
  color: var(--accent-color);
  flex-shrink: 0;
}

.photos-primary-count {
  font-size: 24px;
  font-weight: 800;
  color: var(--accent-color);
  line-height: 1;
  letter-spacing: -0.03em;
}

.photos-primary-label {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
  line-height: 1.05;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photos-workspace-link {
  margin: 0;
  height: auto;
  min-height: 0;
  line-height: 1.05;
  text-align: left;
  justify-content: flex-start;
}

.photos-workspace-link :deep(.n-button__content) {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.05;
}

.photos-workspace-link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  outline-offset: 2px;
  border-radius: 4px;
}

@media (max-width: 360px) {
  .photos-primary-stat {
    flex-direction: column;
    align-items: stretch;
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

/* ─────────────────────────────────────────────
   Collections stack (right panel)
───────────────────────────────────────────── */
.collections-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-create-collection-card {
  border-radius: 12px;
  padding: 12px;
}

.dashboard-create-collection-card :deep(.create-preview) {
  height: 60px;
  margin-bottom: 10px;
}

.dashboard-create-collection-card :deep(.create-icon-circle) {
  width: 46px;
  height: 46px;
}

.dashboard-create-collection-card :deep(.card-title) {
  font-size: 14px;
}

.dashboard-create-collection-card :deep(.card-meta) {
  font-size: 12px;
}

.collections-scroll-area {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  min-height: 0;
  overflow: visible;
  padding-right: 0;
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

/* ─────────────────────────────────────────────
   Responsive
───────────────────────────────────────────── */
@media (max-width: 1200px) {
  .dashboard-grid {
    --panel-left-width: clamp(230px, 24vw, 300px);
    --panel-right-width: clamp(240px, 28vw, 320px);
  }
}

/* Narrow desktop / tablet: drop the right panel and keep only the left one,
   which takes over the daily curation card (see isDailyCurationInLeftPanel). */
@media (min-width: 681px) and (max-width: 1324px) {
  .dashboard-grid {
    --panel-left-width: clamp(250px, 34vw, 350px);
    grid-template-columns: var(--panel-left-width) minmax(0, 1fr);
  }

  .panel-right {
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
    max-height: 100dvh;
    overflow: hidden;
  }

  .panel-right {
    overflow: visible;
  }

  .panel-body {
    flex: none;
    overflow: visible;
  }

  .panel-left .panel-body {
    display: flex;
    flex-direction: column;
    gap: var(--dashboard-section-gap);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .panel-left .panel-sections-scroll-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    margin-right: -16px;
    padding-right: 12px;
  }

  .panel-sections-scroll-area {
    flex: none;
    min-height: auto;
    overflow: visible;
    margin-right: 0;
    padding-right: 0;
  }

  .panel-right .panel-body {
    display: flex;
    flex-direction: column;
    gap: var(--dashboard-section-gap);
    overflow: visible;
  }

  .panel-section--grow {
    flex: none;
  }

  .collections-scroll-area {
    min-height: auto;
    overflow: visible;
  }
}
</style>
