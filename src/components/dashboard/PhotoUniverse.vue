<template>
  <main class="panel panel-center">
    <div class="photo-universe-filled">
      <!-- Single generic loader while the initial mode is still ambiguous
           (e.g. "auto"/"canvas" waiting on the canvas list): avoids flashing
           one panel then swapping to another once its data resolves. -->
      <div v-if="!isInitialModeResolved" class="universe-initial-loader">
        <SpiralGridLoader variant="primary" :size="72" text="Loading" />
      </div>

      <template v-else>
        <header
          class="universe-header"
          :class="{ 'is-hidden': isChatFullscreen }"
          aria-label="Universe view header"
        >
          <h2 class="universe-title">
            {{ messageHeader }}
          </h2>
          <div class="universe-header-actions">
            <div class="universe-selector-container">
              <ModePopoverSelector
                v-model="previewPreference"
                :accent="false"
                icon="settings"
                :singleMode="true"
                :width="200"
                :options="visualizationOptions"
                header="Preview Preferences"
                placement="bottom-end"
                aria-label="Change universe visualization mode"
                class="universe-mode-selector"
                @update:modelValue="handleModeChange"
              />
            </div>
          </div>
        </header>

        <div class="universe-content" :class="universeContentClasses">
          <component
            :is="currentUniverseComponent"
            v-bind="currentUniverseProps"
            @loading-state-change="handleUniverseLoadingState"
            @update:is-fullscreen="setChatFullscreen"
            @open-full="openFullCanvas"
          />
        </div>

        <Transition name="loading-overlay-fade">
          <div v-if="showLoadingOverlay" class="photos2d-loading-overlay">
            <SpiralGridLoader variant="primary" :size="72" text="Loading" />
          </div>
        </Transition>

        <!-- Discrete Hover Floating Button -->
        <div v-if="fullViewLink" class="floating-btn-container">
          <button
            type="button"
            class="universe-btn"
            @click="handleFullViewClick"
          >
            <n-icon size="16">
              <FullscreenOutlined />
            </n-icon>
            <span>{{ fullViewLink.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  watch,
  onBeforeUnmount,
  defineAsyncComponent,
} from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useChatFullscreenStore } from "@/stores/chatFullscreen";
// @ts-ignore
import { useTagCloudStore } from "@/stores/tagCloudStore.js";
// @ts-ignore
import { usePhotosStore } from "@/stores/photos.js";
import PixiTagCloud from "@/components/tag-cloud/PixiTagCloud.vue";
// @ts-ignore
import Photos2D from "@/components/2d-atlas/Photos2D.vue";
import CanvasBoardPreview from "@/components/dashboard/CanvasBoardPreview.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import WorldMapView from "@/views/WorldMapView.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import { NIcon } from "naive-ui";
import { FullscreenOutlined } from "@vicons/antd";
// @ts-ignore
import { useLatestCanvas } from "@/composables/useLatestCanvas.js";
import {
  useLastPreviewScreen,
  rearmLastPreview,
} from "@/composables/useLastPreviewScreen";

// Kept out of the dashboard chunk: the chat pulls in a heavy dependency tree
// (photo dialogs, markdown) that most dashboard visits never render.
const ChatView = defineAsyncComponent(() => import("@/views/ChatView.vue"));

const props = defineProps<{
  excludedGroups?: string[];
  /** Forces the panel into a mode, overriding the stored preference. */
  forcedMode?: string | null;
  /** Conversation the chat should open on (deep links into /chat-lab/:id). */
  conversationId?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:mode", value: VisualizationMode): void;
}>();

type VisualizationMode =
  | "tagcloud"
  | "photos2d"
  | "worldmap"
  | "chat"
  | "canvas";

const DEFAULT_VISUALIZATION_MODE: VisualizationMode = "chat";

// The mode selector also offers "auto": instead of pinning one panel, follow
// the last previewable full screen the user opened (see useLastPreviewScreen).
type PreviewPreference = "auto" | VisualizationMode;
const DEFAULT_PREVIEW_PREFERENCE: PreviewPreference = "auto";

// v3: "auto" landed as the new default. As with the v1->v2 bump, the key is
// fresh so the default actually reaches existing users — the old pinned
// preference in v2 is intentionally not carried over.
const PREVIEW_PREFERENCE_STORAGE_KEY = "photoreka:universe:preview:v3";

const VISUALIZATION_MODES: VisualizationMode[] = [
  "tagcloud",
  "photos2d",
  "worldmap",
  "chat",
  "canvas",
];

function isVisualizationMode(value: unknown): value is VisualizationMode {
  return VISUALIZATION_MODES.includes(value as VisualizationMode);
}

function isPreviewPreference(value: unknown): value is PreviewPreference {
  return value === "auto" || isVisualizationMode(value);
}

function getStoredPreviewPreference(): PreviewPreference | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(PREVIEW_PREFERENCE_STORAGE_KEY);
  return isPreviewPreference(stored) ? stored : null;
}

const photosStore = usePhotosStore();

const tagCloudStore = useTagCloudStore();

const chatFullscreenStore = useChatFullscreenStore();

// Whether the user has any canvas to preview (for the mode option below).
// `hasCanvas` only counts canvases that actually hold photos.
const {
  hasCanvas,
  listLoaded: canvasListLoaded,
  isLoading: isCanvasDataLoading,
  canvasId: latestCanvasId,
  canvasName,
  loadLatestCanvas,
} = useLatestCanvas();

// Kicked off immediately (not onMounted) so the initial-mode gate below
// resolves as early as possible; cached, so the preview component reuses
// this same request when the mode is selected.
loadLatestCanvas();

const { lastPreviewMode, lastPreviewConsumed } = useLastPreviewScreen();

// Mirror the GPS-extraction logic from WorldMapView so we can disable the
// worldmap option when the user has no geolocalized photos.
function hasGpsCoordinates(photo: any): boolean {
  if (
    photo.inferredLocation?.lat != null &&
    photo.inferredLocation?.lng != null
  ) {
    return true;
  }
  const exif = photo.descriptions?.EXIF;
  if (!exif) return false;
  if (exif.gpsLatitude !== undefined && exif.gpsLongitude !== undefined)
    return true;
  if (exif.gps?.lat != null && exif.gps?.lng != null) return true;
  return false;
}

const hasPhotosWithGps = computed(() =>
  ((photosStore.allPhotos as any[]) ?? []).some(hasGpsCoordinates),
);

const isQuantumVoid = computed(() => photosStore.processedPhotos.length === 0);

const previewPreference = ref<PreviewPreference>(
  getStoredPreviewPreference() ?? DEFAULT_PREVIEW_PREFERENCE,
);

// In "auto" the panel follows the last previewable screen the user opened. Once
// that preview has been clicked through (or nothing has been visited yet) the
// dashboard falls back to the chat workspace. Data-availability guards keep it
// off a panel with nothing to draw — notably a /canvas visit where the user
// never actually built a canvas with photos.
const autoResolvedMode = computed<VisualizationMode>(() => {
  if (lastPreviewConsumed.value) return DEFAULT_VISUALIZATION_MODE;
  const mode = lastPreviewMode.value;
  if (!mode) return DEFAULT_VISUALIZATION_MODE;
  if (mode === "canvas" && canvasListLoaded.value && !hasCanvas.value) {
    return DEFAULT_VISUALIZATION_MODE;
  }
  if (mode === "worldmap" && !hasPhotosWithGps.value) {
    return DEFAULT_VISUALIZATION_MODE;
  }
  if (isQuantumVoid.value) return DEFAULT_VISUALIZATION_MODE;
  return mode;
});

// The canvas list loads asynchronously (see useLatestCanvas), so any mode
// resolution that could land on "canvas" is ambiguous until it's in: resolving
// early would mount the canvas panel only to swap it out (or in) once
// `hasCanvas` is known. Everything else (tagcloud/worldmap/photos2d/chat) is
// decided from data that's already loaded by the time PhotoUniverse mounts
// (see App.vue's isAppReady gate), so only these two cases need to wait.
const needsCanvasForInitialMode = computed(() => {
  if (isVisualizationMode(props.forcedMode)) return false;
  if (previewPreference.value === "canvas") return true;
  return (
    previewPreference.value === "auto" &&
    !lastPreviewConsumed.value &&
    lastPreviewMode.value === "canvas"
  );
});

// Drives the single generic loader shown before the panel commits to a mode —
// the fix for the old flicker between the catalog loader, a premature panel,
// and the panel it actually settles on.
const isInitialModeResolved = computed(
  () => !needsCanvasForInitialMode.value || canvasListLoaded.value,
);

const resolvePreviewMode = (): VisualizationMode =>
  previewPreference.value === "auto"
    ? autoResolvedMode.value
    : previewPreference.value;

const visualizationMode = ref<VisualizationMode>(
  (isVisualizationMode(props.forcedMode) ? props.forcedMode : null) ??
    resolvePreviewMode(),
);

// "auto" tracks navigation: re-resolve whenever the last previewable screen (or
// its consumed / data-guard state) changes — but only while "auto" is active
// and no forced mode owns the panel.
watch(autoResolvedMode, (mode) => {
  if (previewPreference.value !== "auto") return;
  if (isVisualizationMode(props.forcedMode)) return;
  visualizationMode.value = mode;
});

// A pinned "canvas" preference still needs a way out when the user turns out to
// have no canvas (with photos) to show.
watch(
  [canvasListLoaded, hasCanvas],
  ([loaded, has]) => {
    if (!loaded || has) return;
    if (
      previewPreference.value === "canvas" &&
      visualizationMode.value === "canvas"
    ) {
      visualizationMode.value = DEFAULT_VISUALIZATION_MODE;
    }
  },
  { immediate: true },
);

// A /chat-lab URL redirected here (photo hand-off, deep link, global search)
// lands as a forced mode, and can arrive after mount.
watch(
  () => props.forcedMode,
  (mode) => {
    if (isVisualizationMode(mode)) visualizationMode.value = mode;
  },
);

// The chat can ask to take over the whole dashboard: our header steps aside and
// the host collapses the side panels around us.
const { isFullscreen: isChatFullscreen, isLocked: isChatFullscreenLocked } =
  storeToRefs(chatFullscreenStore);

const setChatFullscreen = (value: boolean) => {
  chatFullscreenStore.set(value);
};

// Nothing but the chat can be fullscreen, so switching panels has to give the
// dashboard its sides back.
watch(visualizationMode, (mode) => {
  if (mode !== "chat") chatFullscreenStore.exit();
});

const isPhotos2DLoading = ref(true);
const isCanvasLoading = ref(true);

const isTagCloudLoading = computed(
  () =>
    !isQuantumVoid.value &&
    visualizationMode.value === "tagcloud" &&
    !tagCloudStore.isReady,
);
const showPhotos2DLoading = computed(
  () => visualizationMode.value === "photos2d" && isPhotos2DLoading.value,
);
const showCanvasLoading = computed(
  () =>
    visualizationMode.value === "canvas" &&
    (isCanvasLoading.value || isCanvasDataLoading.value),
);
const rawShowLoadingOverlay = computed(
  () =>
    isTagCloudLoading.value ||
    showPhotos2DLoading.value ||
    showCanvasLoading.value,
);
const showLoadingOverlay = ref(false);
const universeContentClasses = computed(() => ({
  "is-soft-loading": showLoadingOverlay.value,
  "is-fullscreen": isChatFullscreen.value,
}));

let showOverlayTimer: ReturnType<typeof setTimeout> | null = null;
let hideOverlayTimer: ReturnType<typeof setTimeout> | null = null;

const clearOverlayTimers = () => {
  if (showOverlayTimer) {
    clearTimeout(showOverlayTimer);
    showOverlayTimer = null;
  }

  if (hideOverlayTimer) {
    clearTimeout(hideOverlayTimer);
    hideOverlayTimer = null;
  }
};

watch(
  rawShowLoadingOverlay,
  (isLoading) => {
    if (isLoading) {
      if (hideOverlayTimer) {
        clearTimeout(hideOverlayTimer);
        hideOverlayTimer = null;
      }

      if (!showLoadingOverlay.value && !showOverlayTimer) {
        showOverlayTimer = setTimeout(() => {
          showLoadingOverlay.value = true;
          showOverlayTimer = null;
        }, 70);
      }
      return;
    }

    if (showOverlayTimer) {
      clearTimeout(showOverlayTimer);
      showOverlayTimer = null;
    }

    if (showLoadingOverlay.value && !hideOverlayTimer) {
      hideOverlayTimer = setTimeout(() => {
        showLoadingOverlay.value = false;
        hideOverlayTimer = null;
      }, 220);
    }
  },
  { immediate: true },
);

// The worldmap option is only offered when there are geolocalized photos, so a
// stored preference for it has to fall back once that stops being true.
watch(
  hasPhotosWithGps,
  (hasGps) => {
    if (!hasGps && visualizationMode.value === "worldmap") {
      visualizationMode.value = DEFAULT_VISUALIZATION_MODE;
    }
  },
  { immediate: true },
);

// An empty library leaves the chat as the only usable panel — it's what replaced
// the old "quantum void" placeholder. Snap to it without persisting, so the
// user's stored preference comes back once they have photos.
watch(
  isQuantumVoid,
  (isEmpty) => {
    if (isEmpty) visualizationMode.value = "chat";
  },
  { immediate: true },
);

// The dashboard mirrors our mode in its side panels: the chat only gets a quick
// access tile there while it is *not* the panel the user is looking at.
watch(visualizationMode, (mode) => emit("update:mode", mode), {
  immediate: true,
});

// Every panel but the chat needs a library to draw from. With none, they'd all
// render empty, so the chat is the only thing on offer.
const visualizationOptions = computed(() => [
  {
    label: "Auto",
    value: "auto",
    description: "Follow your last visited screen",
  },
  { label: "ChatLab", value: "chat" },
  {
    label: "Semantic Highlights",
    value: "tagcloud",
    disabled: isQuantumVoid.value,
    description: isQuantumVoid.value ? "No photos yet" : undefined,
  },
  {
    label: "Geographic View",
    value: "worldmap",
    disabled: isQuantumVoid.value || !hasPhotosWithGps.value,
    description: isQuantumVoid.value
      ? "No photos yet"
      : hasPhotosWithGps.value
        ? undefined
        : "No geolocalized photos yet",
  },
  {
    label: "Visual Preview",
    value: "photos2d",
    disabled: isQuantumVoid.value,
    description: isQuantumVoid.value ? "No photos yet" : undefined,
  },
  {
    label: "Canvas",
    value: "canvas",
    disabled: canvasListLoaded.value && !hasCanvas.value,
    description:
      canvasListLoaded.value && !hasCanvas.value ? "No canvas yet" : undefined,
  },
]);

const handleModeChange = (val: string) => {
  if (!isPreviewPreference(val)) return;

  previewPreference.value = val;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PREVIEW_PREFERENCE_STORAGE_KEY, val);
  }

  // Re-picking "auto" re-arms the gateway so the preview returns even if it was
  // clicked through earlier this session.
  if (val === "auto") rearmLastPreview();

  if (!isVisualizationMode(props.forcedMode)) {
    visualizationMode.value = resolvePreviewMode();
  }
};

const messageHeader = computed(() => {
  if (visualizationMode.value === "tagcloud") {
    return `Previewing your most relevant tags`;
  } else if (visualizationMode.value === "photos2d") {
    return `Previewing your 500 most recent photos`;
  } else if (visualizationMode.value === "chat") {
    return `Talking with your photos`;
  } else if (visualizationMode.value === "canvas") {
    // El nombre llega en async con la lista; hasta entonces, genérico.
    return canvasName.value
      ? `Previewing - ${canvasName.value}`
      : `Previewing your latest canvas`;
  }

  return `Previewing your photo locations on the world map`;
});

// Chat has no entry: its composer owns the bottom of the panel, where the
// floating button would land.
const FULL_VIEW_LINKS: Partial<
  Record<VisualizationMode, { to: string; label: string }>
> = {
  tagcloud: { to: "/tagcloud", label: "Open Full Cloud" },
  worldmap: { to: "/world-map", label: "Open Full World Map" },
  photos2d: { to: "/atlas?mode=2d", label: "Open Full Atlas" },
};

// The preview always shows the most recently *modified* canvas (see
// useLatestCanvas), while /canvas without a route param falls back to the
// last *opened* one (its own localStorage key). Pinning the id here keeps
// the click-through consistent with what the preview actually rendered.
const fullViewLink = computed(() => {
  if (visualizationMode.value === "canvas") {
    return {
      to: latestCanvasId.value ? `/canvas/${latestCanvasId.value}` : "/canvas",
      label: "Open Full Canvas",
    };
  }
  return FULL_VIEW_LINKS[visualizationMode.value];
});

const router = useRouter();

// Abrir la versión completa de cualquier preview. El panel vuelve a su DEFAULT
// (chat) al instante — el dashboard sigue vivo bajo KeepAlive, así que hay que
// reasignar el modo aquí mismo. La puerta "auto" la consume la propia
// navegación (ver recordPreviewScreenVisit en el router), igual que si el
// usuario entrara a la pantalla desde el menú o una URL.
const openFullView = (to: string) => {
  visualizationMode.value = DEFAULT_VISUALIZATION_MODE;
  router.push(to);
};

// Emitido por el preview del canvas (click en el tablero / estado vacío).
const openFullCanvas = () =>
  openFullView(
    latestCanvasId.value ? `/canvas/${latestCanvasId.value}` : "/canvas",
  );

const handleFullViewClick = () => {
  if (fullViewLink.value) openFullView(fullViewLink.value.to);
};

const PREVIEW_MIN_PHOTO_COUNT = 2;
const excludedGroupSet = computed(() => {
  const list = props.excludedGroups?.length
    ? props.excludedGroups
    : ["misc", "visual aspects", "abstract concept", "artistic scores"];

  return new Set(
    list
      .map((group) =>
        String(group || "")
          .trim()
          .toLowerCase()
          .replace(/_/g, " "),
      )
      .filter(Boolean),
  );
});

const tags = computed(() => {
  const incoming = tagCloudStore.data?.tags || [];
  if (excludedGroupSet.value.size === 0) return incoming;

  return incoming.filter((tag: any) => {
    const normalizedGroup = String(tag?.group || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ");
    return !excludedGroupSet.value.has(normalizedGroup);
  });
});

const previewTags = computed(() =>
  tags.value.filter(
    (tag: any) => Number(tag?.photoCount) >= PREVIEW_MIN_PHOTO_COUNT,
  ),
);

const currentUniverseComponent = computed(() => {
  switch (visualizationMode.value) {
    case "tagcloud":
      return PixiTagCloud;
    case "worldmap":
      return WorldMapView;
    case "chat":
      return ChatView;
    case "canvas":
      return CanvasBoardPreview;
    default:
      return Photos2D;
  }
});

const currentUniverseProps = computed(() => {
  switch (visualizationMode.value) {
    case "tagcloud":
      return {
        tags: previewTags.value,
        isPreview: true,
        showZoomControls: true,
      };
    case "worldmap":
      return { isPreview: true };
    case "chat":
      return {
        conversationId: props.conversationId ?? null,
        // Locked fullscreen (an empty library) leaves the toggle nothing to do,
        // so the chat drops it rather than offering a button that won't answer.
        allowFullscreen: !isChatFullscreenLocked.value,
        isFullscreen: isChatFullscreen.value,
      };
    case "canvas":
      return {};
    default:
      return { isPreview: true, photosLimit: 500 };
  }
});

const handleUniverseLoadingState = (isLoading: boolean) => {
  if (visualizationMode.value === "canvas") {
    isCanvasLoading.value = Boolean(isLoading);
  } else {
    isPhotos2DLoading.value = Boolean(isLoading);
  }
};

onMounted(() => {
  if (!isQuantumVoid.value) {
    tagCloudStore.prefetch();
  }
});

onBeforeUnmount(() => {
  clearOverlayTimers();
});
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background-color: var(--bg-deep-surface);
}

.panel-center {
  background-color: var(--bg-deep-surface);
  min-width: 0;
  border-left: 1px solid
    color-mix(in srgb, var(--accent-color) 18%, transparent);
  border-right: 1px solid
    color-mix(in srgb, var(--accent-color) 18%, transparent);
}

.photo-universe-filled {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  background: radial-gradient(
    ellipse at 50% 45%,
    color-mix(in srgb, var(--bg-surface-hover) 83%, var(--accent-color) 17%) 0%,
    color-mix(in srgb, var(--bg-deep-surface) 90%, var(--bg-card) 10%) 72%
  );
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

/* En light el accent (cyan700) es muy saturado y el manchón azul canta
   sobre el fondo casi blanco: bajamos el aporte de accent y aclaramos el
   borde para que el halo sea solo una insinuación de profundidad. */
html[data-theme="light"] .photo-universe-filled {
  background: radial-gradient(
    ellipse at 50% 45%,
    color-mix(in srgb, var(--bg-surface) 95%, var(--accent-color) 5%) 0%,
    var(--bg-deep-surface) 78%
  );
}

.universe-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding-top: 38px;
  box-sizing: border-box;
  transition:
    opacity 0.22s ease,
    transform 0.24s ease,
    filter 0.24s ease,
    padding-top 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.universe-content.is-fullscreen {
  padding-top: 0;
}

.universe-content.is-soft-loading {
  opacity: 0.3;
  transform: scale(0.992);
  filter: saturate(0.88) blur(0.4px);
}

.photos2d-loading-overlay {
  position: absolute;
  inset: 38px 0 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  pointer-events: none;
}

.universe-initial-loader {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-overlay-fade-enter-active,
.loading-overlay-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.loading-overlay-fade-enter-from,
.loading-overlay-fade-leave-to {
  opacity: 0;
  transform: scale(1.015);
}

.universe-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 11px;
  background: var(--bg-container);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 56%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, var(--border-color) 56%, transparent);
  box-shadow: 0 6px 14px color-mix(in srgb, var(--bg-overlay) 38%, transparent);
  z-index: 30;
  pointer-events: none;
  transition:
    opacity 0.28s ease,
    transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.universe-header.is-hidden {
  opacity: 0;
  transform: translateY(-100%);
}

.universe-header.is-hidden * {
  pointer-events: none;
}

.universe-title {
  margin: 0;
  display: block;
  white-space: nowrap;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  font-size: 11px;
}

.universe-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* The header is pointer-events: none so the panel below stays interactive —
   anything clickable in it has to opt back in. */
.universe-selector-container {
  pointer-events: auto;
}

/* Discrete Floating Button Styles */
.floating-btn-container {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%) translateY(10px);
  opacity: 0;
  pointer-events: none;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1200;
}

.photo-universe-filled:hover .floating-btn-container,
.photo-universe-filled:focus-within .floating-btn-container,
.floating-btn-container:hover {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.universe-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: color-mix(in srgb, var(--bg-card) 82%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid color-mix(in srgb, var(--accent-color) 36%, transparent);
  color: color-mix(in srgb, var(--text-primary) 80%, var(--accent-color) 20%);
  padding: 8px 18px;
  border-radius: 999px;
  text-decoration: none;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow:
    0 4px 16px color-mix(in srgb, var(--bg-overlay) 50%, transparent),
    0 0 12px color-mix(in srgb, var(--accent-color) 25%, transparent);
  transition: all 0.2s ease;
  cursor: pointer;
}

.universe-btn:hover {
  background: color-mix(
    in srgb,
    var(--bg-surface-hover) 90%,
    var(--accent-color) 10%
  );
  border-color: color-mix(in srgb, var(--accent-color) 54%, transparent);
  color: var(--text-primary);
}

.universe-btn:active {
  transform: scale(0.97);
}

@media (max-width: 680px) {
  .panel-center {
    min-height: 300px;
  }

  .universe-header {
    height: auto;
    min-height: 38px;
    padding: 6px 12px;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .universe-content {
    padding-top: 56px;
  }

  .photos2d-loading-overlay {
    inset: 56px 0 0;
  }

  .universe-title {
    padding: 0;
    font-size: 10px;
  }
}
</style>
