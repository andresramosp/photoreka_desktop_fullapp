<template>
  <main class="panel panel-center">
    <div class="photo-universe-filled" :class="{
        'has-halo': showHalo,
        'halo-subtle': showHalo && visualizationMode === 'chat',
      }">
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
        <!-- On a seed day the panel waits here rather than drawing a screen the
             seed would land on top of a moment later. Blank until we know it is
             a seed day at all, which is a couple of queries away. -->
        <div v-if="isAwaitingSeed" class="seed-loading">
          <SpiralGridLoader
            v-if="isGeneratingSeed"
            variant="primary"
            :size="72"
            text="Composing this week's moodboard seed"
          />
        </div>
        <component
          v-else
          :is="currentUniverseComponent"
          v-bind="currentUniverseProps"
          @loading-state-change="handleUniverseLoadingState"
          @update:is-fullscreen="setChatFullscreen"
          @open-full="openFullCanvas"
        />
      </div>

      <!-- Photos2D is the one preview screen without a built-in loader of its
           own (just a discrete %-progress indicator), so it keeps this overlay. -->
      <Transition name="loading-overlay-fade">
        <div v-if="showLoadingOverlay" class="photos2d-loading-overlay">
          <SpiralGridLoader
            variant="primary"
            :size="72"
            text="Mapping photo coordinates"
          />
        </div>
      </Transition>

      <!-- Discrete Hover Floating Button -->
      <div
        v-if="fullViewLink && !isAwaitingSeed"
        class="floating-btn-container"
      >
        <button type="button" class="universe-btn" @click="handleFullViewClick">
          <n-icon size="16">
            <FullscreenOutlined />
          </n-icon>
          <span>{{ fullViewLink.label }}</span>
        </button>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  defineAsyncComponent,
} from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useChatFullscreenStore } from "@/stores/chatFullscreen";
import { useChatStore } from "@/stores/chat.js";
// @ts-ignore
import { useTagCloudStore } from "@/stores/tagCloudStore.js";
// @ts-ignore
import { usePhotosStore } from "@/stores/photos.js";
import PixiTagCloud from "@/components/tag-cloud/PixiTagCloud.vue";
// @ts-ignore
import Photos2D from "@/components/2d-atlas/Photos2D.vue";
import CanvasBoardPreview from "@/components/dashboard/CanvasBoardPreview.vue";
import SuggestedCanvasPreview from "@/components/dashboard/SuggestedCanvasPreview.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import WorldMapView from "@/views/WorldMapView.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import { NIcon } from "naive-ui";
import { FullscreenOutlined } from "@vicons/antd";
// @ts-ignore
import { useLatestCanvas } from "@/composables/useLatestCanvas.js";
// @ts-ignore
import { useSuggestedCanvas } from "@/composables/useSuggestedCanvas.js";
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
  (e: "update:mode", value: PanelMode): void;
}>();

type VisualizationMode =
  "tagcloud" | "photos2d" | "worldmap" | "chat" | "canvas";

// "suggested" is the weekly moodboard seed taking the panel over. It is never
// a preference: it cannot be picked, stored, or forced, only shown once.
type PanelMode = VisualizationMode | "suggested";

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

const resolvePreviewMode = (): VisualizationMode =>
  previewPreference.value === "auto"
    ? autoResolvedMode.value
    : previewPreference.value;

const visualizationMode = ref<PanelMode>(
  (isVisualizationMode(props.forcedMode) ? props.forcedMode : null) ??
    resolvePreviewMode(),
);

// "auto" tracks navigation: re-resolve whenever the last previewable screen (or
// its consumed / data-guard state) changes — but only while "auto" is active
// and no forced mode owns the panel.
watch(autoResolvedMode, (mode) => {
  if (previewPreference.value !== "auto") return;
  if (isVisualizationMode(props.forcedMode)) return;
  if (visualizationMode.value === "suggested") return;
  visualizationMode.value = mode;
});

// ── Weekly moodboard seed ───────────────────────────────────
// Once a week the backend may propose a themed set of photos as a canvas seed.
// It overrides the stored preference and the "auto" gateway, but never a
// forced mode: a deep link into a conversation has to land on that chat.
//
// The seed stays on offer (across reloads, for a day) until the user opens it
// or picks another panel in the selector. Nothing that happens without the
// user's hand — an empty-library flash, a re-keyed view, a route change —
// puts it away: those only move the panel, and the takeover below re-asserts.
const {
  proposal: suggestedProposal,
  statusKnown: seedStatusKnown,
  isGenerating: isGeneratingSeed,
  loadSuggestedCanvas,
  markSeen: markSuggestedSeen,
  markOpened: markSuggestedOpened,
  createCanvasFromProposal,
  dismissProposal,
} = useSuggestedCanvas();

loadSuggestedCanvas();

// Holds the panel while a seed may still be on its way. Never against a forced
// mode (a deep link has to land where it points) and never on an empty library,
// where there is no seed to wait for.
const isAwaitingSeed = computed(() => {
  if (isVisualizationMode(props.forcedMode) || isQuantumVoid.value)
    return false;
  return !seedStatusKnown.value || isGeneratingSeed.value;
});

watch(
  [suggestedProposal, isQuantumVoid],
  ([proposal, isEmpty]) => {
    if (!proposal || isEmpty) return;
    if (isVisualizationMode(props.forcedMode)) return;
    visualizationMode.value = "suggested";
    markSuggestedSeen();
  },
  { immediate: true },
);

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

// The ambient glow belongs to the chat's welcome screen; once a transcript is on
// screen it would just tint the messages.
const chatStore = useChatStore();
const showHalo = computed(
  () => visualizationMode.value !== "chat" || chatStore.messages.length === 0,
);

const setChatFullscreen = (value: boolean) => {
  chatFullscreenStore.set(value);
};

// Nothing but the chat can be fullscreen, so switching panels has to give the
// dashboard its sides back.
watch(visualizationMode, (mode) => {
  if (mode !== "chat") chatFullscreenStore.exit();
});

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

  // Choosing a panel over the seed is the one explicit way to put it away,
  // whether it is on screen or still being composed.
  if (visualizationMode.value === "suggested" || isAwaitingSeed.value) {
    dismissProposal();
  }

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
  if (isGeneratingSeed.value) {
    return `Putting together this week's moodboard seed`;
  }

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
  } else if (visualizationMode.value === "suggested") {
    return `This week's moodboard seed, picked from your catalog`;
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
  // The seed's own hint pill takes the button's place.
  if (visualizationMode.value === "suggested") return undefined;
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

// The seed only becomes a real canvas when the user opens it: it is created
// then, laid out exactly as previewed, and the board opens on it.
let isOpeningSuggested = false;
const openSuggestedCanvas = async () => {
  if (isOpeningSuggested) return;
  isOpeningSuggested = true;
  try {
    const id = await createCanvasFromProposal();
    markSuggestedOpened();
    dismissProposal();
    openFullView(`/canvas/${id}`);
  } catch (error) {
    console.error("Error creating canvas from suggestion:", error);
  } finally {
    isOpeningSuggested = false;
  }
};

// Emitido por el preview del canvas (click en el tablero / estado vacío).
const openFullCanvas = () => {
  if (visualizationMode.value === "suggested") {
    openSuggestedCanvas();
    return;
  }
  openFullView(
    latestCanvasId.value ? `/canvas/${latestCanvasId.value}` : "/canvas",
  );
};

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
    case "suggested":
      return SuggestedCanvasPreview;
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
    case "suggested":
      return {};
    default:
      return { isPreview: true, photosLimit: 500 };
  }
});

// Only Photos2D lacks its own full loader (just a discrete %-progress
// indicator), so it's the one exception still routed through this overlay.
const isPhotos2DLoading = ref(true);
const showPhotos2DLoading = computed(
  () => visualizationMode.value === "photos2d" && isPhotos2DLoading.value,
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
  showPhotos2DLoading,
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

const handleUniverseLoadingState = (isLoading: boolean) => {
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
  background: var(--bg-deep-surface);
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

.photo-universe-filled.has-halo {
  background: radial-gradient(
    ellipse 155% 90% at 50% 0%,
    color-mix(in srgb, var(--bg-surface-hover) 91%, var(--accent-color) 9%) 0%,
    color-mix(in srgb, var(--bg-deep-surface) 90%, var(--bg-card) 10%) 65%
  );
}

/* En light el accent (cyan700) es muy saturado y el manchón azul canta
   sobre el fondo casi blanco: bajamos el aporte de accent y aclaramos el
   borde para que el halo sea solo una insinuación de profundidad. */
html[data-theme="light"] .photo-universe-filled.has-halo {
  background: radial-gradient(
    ellipse 155% 90% at 50% 0%,
    color-mix(in srgb, var(--bg-surface) 95%, var(--accent-color) 5%) 0%,
    var(--bg-deep-surface) 72%
  );
}

.photo-universe-filled.has-halo.halo-subtle {
  background: radial-gradient(
    ellipse 155% 90% at 50% 0%,
    color-mix(in srgb, var(--bg-surface-hover) 99%, var(--accent-color) 1%) 0%,
    color-mix(in srgb, var(--bg-deep-surface) 90%, var(--bg-card) 10%) 65%
  );
}

html[data-theme="light"] .photo-universe-filled.has-halo.halo-subtle {
  background: radial-gradient(
    ellipse 155% 90% at 50% 0%,
    color-mix(in srgb, var(--bg-surface) 99.5%, var(--accent-color) 0.5%) 0%,
    var(--bg-deep-surface) 72%
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
.seed-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

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
