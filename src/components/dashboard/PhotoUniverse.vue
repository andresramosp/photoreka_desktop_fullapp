<template>
  <main class="panel panel-center">
    <div class="photo-universe-filled">
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
              v-model="visualizationMode"
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
          @loading-state-change="handlePhotos2DLoadingState"
          @update:is-fullscreen="setChatFullscreen"
        />
      </div>

      <Transition name="loading-overlay-fade">
        <div v-if="showLoadingOverlay" class="photos2d-loading-overlay">
          <SpiralGridLoader
            variant="primary"
            :size="72"
            :duration="1200"
            :text="loadingOverlaySubtitle"
          />
        </div>
      </Transition>

      <!-- Discrete Hover Floating Button -->
      <div v-if="fullViewLink" class="floating-btn-container">
        <router-link :to="fullViewLink.to" class="universe-btn">
          <n-icon size="16">
            <FullscreenOutlined />
          </n-icon>
          <span>{{ fullViewLink.label }}</span>
        </router-link>
      </div>
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
import { storeToRefs } from "pinia";
import { useChatFullscreenStore } from "@/stores/chatFullscreen";
// @ts-ignore
import { useTagCloudStore } from "@/stores/tagCloudStore.js";
// @ts-ignore
import { usePhotosStore } from "@/stores/photos.js";
import PixiTagCloud from "@/components/tag-cloud/PixiTagCloud.vue";
// @ts-ignore
import Photos2D from "@/components/2d-atlas/Photos2D.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import WorldMapView from "@/views/WorldMapView.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import { NIcon } from "naive-ui";
import { FullscreenOutlined } from "@vicons/antd";

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

type VisualizationMode = "tagcloud" | "photos2d" | "worldmap" | "chat";

const DEFAULT_VISUALIZATION_MODE: VisualizationMode = "chat";

// v2: the default moved to "chat", and the old key holds pre-chat preferences
// that would otherwise keep every existing user on their old panel forever.
const VISUALIZATION_MODE_STORAGE_KEY = "photoreka:universe:mode:v2";

const VISUALIZATION_MODES: VisualizationMode[] = [
  "tagcloud",
  "photos2d",
  "worldmap",
  "chat",
];

function isVisualizationMode(value: unknown): value is VisualizationMode {
  return VISUALIZATION_MODES.includes(value as VisualizationMode);
}

function getStoredVisualizationMode(): VisualizationMode | null {
  if (typeof window === "undefined") return null;

  const storedMode = window.localStorage.getItem(
    VISUALIZATION_MODE_STORAGE_KEY,
  );
  return isVisualizationMode(storedMode) ? storedMode : null;
}

const photosStore = usePhotosStore();

const tagCloudStore = useTagCloudStore();

const chatFullscreenStore = useChatFullscreenStore();

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

const storedVisualizationMode = getStoredVisualizationMode();
const visualizationMode = ref<VisualizationMode>(
  (isVisualizationMode(props.forcedMode) ? props.forcedMode : null) ??
    storedVisualizationMode ??
    DEFAULT_VISUALIZATION_MODE,
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
const { isFullscreen: isChatFullscreen } = storeToRefs(chatFullscreenStore);

const setChatFullscreen = (value: boolean) => {
  chatFullscreenStore.set(value);
};

// Nothing but the chat can be fullscreen, so switching panels has to give the
// dashboard its sides back.
watch(visualizationMode, (mode) => {
  if (mode !== "chat") chatFullscreenStore.exit();
});

const isPhotos2DLoading = ref(true);

const isQuantumVoid = computed(() => photosStore.processedPhotos.length === 0);
const isTagCloudLoading = computed(
  () =>
    !isQuantumVoid.value &&
    visualizationMode.value === "tagcloud" &&
    !tagCloudStore.isReady,
);
const showPhotos2DLoading = computed(
  () => visualizationMode.value === "photos2d" && isPhotos2DLoading.value,
);
const rawShowLoadingOverlay = computed(
  () => isTagCloudLoading.value || showPhotos2DLoading.value,
);
const showLoadingOverlay = ref(false);
const loadingOverlaySubtitle = computed(() =>
  visualizationMode.value === "tagcloud"
    ? "Mapping semantic space"
    : visualizationMode.value === "worldmap"
      ? "Mapping photo locations"
      : "Mapping photo coordinates",
);
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
]);

const handleModeChange = (val: string) => {
  if (!isVisualizationMode(val)) return;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(VISUALIZATION_MODE_STORAGE_KEY, val);
  }
};

const messageHeader = computed(() => {
  if (visualizationMode.value === "tagcloud") {
    return `Previewing your most relevant tags`;
  } else if (visualizationMode.value === "photos2d") {
    return `Previewing your 500 most recent photos`;
  } else if (visualizationMode.value === "chat") {
    return `Talking with your photos`;
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
  photos2d: { to: "/2d-atlas", label: "Open Full Atlas" },
};

const fullViewLink = computed(() => FULL_VIEW_LINKS[visualizationMode.value]);

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
        allowFullscreen: true,
        isFullscreen: isChatFullscreen.value,
      };
    default:
      return { isPreview: true, photosLimit: 500 };
  }
});

const handlePhotos2DLoadingState = (isLoading: boolean) => {
  isPhotos2DLoading.value = Boolean(isLoading);
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
