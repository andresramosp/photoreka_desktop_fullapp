<template>
  <main class="panel panel-center">
    <!-- State: Empty Portfolio / Quantum Void -->
    <div v-if="isQuantumVoid" class="quantum-void">
      <div class="void-rings-layer">
        <div class="void-ring" style="--rs: 120px; --rd: 0s; --rdur: 6s" />
        <div class="void-ring" style="--rs: 240px; --rd: 1.2s; --rdur: 7.2s" />
        <div class="void-ring" style="--rs: 380px; --rd: 0.6s; --rdur: 8.5s" />
        <div class="void-ring" style="--rs: 540px; --rd: 1.8s; --rdur: 9.8s" />
        <div class="void-ring" style="--rs: 720px; --rd: 1s; --rdur: 11s" />
      </div>

      <div class="void-core" />

      <div class="void-caption">
        <p class="void-caption-main">· · · QUANTUM VOID · · ·</p>
        <p class="void-caption-sub">Awaiting for the Light</p>
      </div>

      <div class="floating-btn-container void-floating-btn-container">
        <router-link
          to="/import-area#upload"
          class="universe-btn void-import-btn"
        >
          Import Photos
        </router-link>
      </div>
    </div>

    <div v-else class="photo-universe-filled">
      <!-- <div class="floating-stats-container" aria-label="Tag cloud quick stats">
        <div
          v-for="badge in topBadges"
          :key="badge.label"
          class="universe-stat-badge"
        >
          <span class="stat-value">{{ badge.value }}</span>
          <span class="stat-label">{{ badge.label }}</span>
        </div>
      </div> -->

      <header class="universe-header" aria-label="Universe view header">
        <h2 class="universe-title">
          {{ messageHeader }}
        </h2>
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
      </header>

      <div class="universe-content" :class="universeContentClasses">
        <component
          :is="currentUniverseComponent"
          v-bind="currentUniverseProps"
          @loading-state-change="handlePhotos2DLoadingState"
        />
      </div>

      <Transition name="loading-overlay-fade">
        <div
          v-if="showLoadingOverlay"
          class="quantum-void loading photos2d-loading-overlay"
        >
          <div class="void-rings-layer">
            <div class="void-ring" style="--rs: 120px; --rd: 0s; --rdur: 3s" />
            <div
              class="void-ring"
              style="--rs: 240px; --rd: 0.5s; --rdur: 4s"
            />
            <div class="void-ring" style="--rs: 380px; --rd: 1s; --rdur: 5s" />
            <div
              class="void-ring"
              style="--rs: 540px; --rd: 1.5s; --rdur: 6s"
            />
            <div class="void-ring" style="--rs: 720px; --rd: 2s; --rdur: 7s" />
          </div>

          <div class="void-core" />

          <div class="void-caption">
            <p class="void-caption-main">· · · RENDERING PREVIEW · · ·</p>
            <p class="void-caption-sub">{{ loadingOverlaySubtitle }}</p>
          </div>
        </div>
      </Transition>

      <!-- Discrete Hover Floating Button -->
      <div class="floating-btn-container">
        <router-link
          :to="visualizationMode === 'tagcloud' ? '/tagcloud' : '/2d-view'"
          class="universe-btn"
        >
          <n-icon size="16">
            <FullscreenOutlined />
          </n-icon>
          <span>{{
            visualizationMode === "tagcloud"
              ? "Open Full Cloud"
              : "Open Full Atlas"
          }}</span>
        </router-link>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from "vue";
// @ts-ignore
import { useTagCloudStore } from "@/stores/tagCloudStore.js";
// @ts-ignore
import { usePhotosStore } from "@/stores/photos.js";
import PixiTagCloud from "@/components/tag-cloud/PixiTagCloud.vue";
// @ts-ignore
import Photos2D from "@/components/2d-atlas/Photos2D.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import { NIcon } from "naive-ui";
import { FullscreenOutlined } from "@vicons/antd";

const props = defineProps<{
  excludedGroups?: string[];
}>();

const photosStore = usePhotosStore();

const tagCloudStore = useTagCloudStore();

const visualizationMode = ref<"tagcloud" | "photos2d">(
  (typeof window !== "undefined" &&
    (window.localStorage.getItem("photoreka:universe:mode") as
      | "tagcloud"
      | "photos2d")) ||
    "tagcloud",
);

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
    : "Mapping photo coordinates",
);
const universeContentClasses = computed(() => ({
  "is-soft-loading": showLoadingOverlay.value,
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

const visualizationOptions = [
  { label: "Semantic Highlights", value: "tagcloud" },
  { label: "Visual Preview", value: "photos2d" },
];

const handleModeChange = (val: string) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("photoreka:universe:mode", val);
  }
};

const messageHeader = computed(() => {
  if (visualizationMode.value === "tagcloud") {
    return `Previewing your most relevant tags`;
  } else {
    return `Previewing your 500 most recent photos`;
  }
});
const excludedGroupSet = computed(() => {
  const list = props.excludedGroups?.length
    ? props.excludedGroups
    : ["misc", "visual aspects", "abstract concept"];

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

const currentUniverseComponent = computed(() =>
  visualizationMode.value === "tagcloud" ? PixiTagCloud : Photos2D,
);

const currentUniverseProps = computed(() =>
  visualizationMode.value === "tagcloud"
    ? {
        tags: tags.value,
        isPreview: true,
        showZoomControls: true,
      }
    : {
        isPreview: true,
        photosLimit: 500,
      },
);

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

.quantum-void {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 48%,
    color-mix(in srgb, var(--bg-surface-hover) 80%, var(--accent-color) 20%) 0%,
    color-mix(in srgb, var(--bg-card) 88%, var(--primary-color) 12%) 28%,
    color-mix(in srgb, var(--bg-container) 94%, var(--accent-color) 6%) 56%,
    var(--bg-deep-surface) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.quantum-void::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    color-mix(in srgb, var(--bg-overlay) 18%, transparent) 3px,
    color-mix(in srgb, var(--bg-overlay) 18%, transparent) 4px
  );
  pointer-events: none;
  z-index: 2;
}

.void-rings-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  transform: scale(0.9);
  transform-origin: center;
}

.void-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(calc(var(--rs, 200px) * 0.8), calc(100% - 88px));
  height: min(calc(var(--rs, 200px) * 0.8), calc(100% - 88px));
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--accent-color) 42%, transparent);
  transform: translate(-50%, -50%) scale(0.96);
  animation: ringPulse var(--rdur, 8s) ease-in-out infinite;
  animation-delay: var(--rd, 0s);
}

@keyframes ringPulse {
  0% {
    transform: translate(-50%, -50%) scale(0.94);
    opacity: 0.15;
  }
  45% {
    opacity: 0.45;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.05);
    opacity: 0.5;
  }
  100% {
    transform: translate(-50%, -50%) scale(0.94);
    opacity: 0.15;
  }
}

.void-core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 256px;
  height: 192px;
  border-radius: 50%;
  background:
    radial-gradient(
      ellipse at 42% 48%,
      color-mix(in srgb, var(--accent-color) 45%, transparent) 0%,
      transparent 65%
    ),
    radial-gradient(
      ellipse at 58% 52%,
      color-mix(in srgb, var(--primary-color) 35%, transparent) 0%,
      transparent 60%
    );
  filter: blur(22.4px);
  transform: translate(-50%, -50%);
  animation: corePulse 5.5s ease-in-out infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes corePulse {
  0%,
  100% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(0.95);
  }
  50% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(1.15);
  }
}

.void-caption {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  z-index: 3;
  animation: captionBreathe 6s ease-in-out infinite;
}

.void-caption-main {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-primary) 82%, var(--accent-color) 18%);
  margin: 0 0 6px;
  text-shadow: 0 0 12px color-mix(in srgb, var(--accent-color) 40%, transparent);
}

.void-caption-sub {
  font-size: 9.5px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-secondary) 75%, var(--accent-color) 25%);
  margin: 0;
}

.void-import-btn {
  pointer-events: auto;
  opacity: 0.96;
}

.quantum-void:hover .void-floating-btn-container {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

@keyframes captionBreathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

.photo-universe-filled {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  background: radial-gradient(
    ellipse at 50% 45%,
    color-mix(in srgb, var(--bg-surface-hover) 72%, var(--accent-color) 28%) 0%,
    color-mix(in srgb, var(--bg-deep-surface) 94%, var(--bg-card) 6%) 72%
  );
  overflow: hidden;
  position: relative;
}

.universe-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  transition:
    opacity 0.22s ease,
    transform 0.24s ease,
    filter 0.24s ease;
}

.universe-content.is-soft-loading {
  opacity: 0.3;
  transform: scale(0.992);
  filter: saturate(0.88) blur(0.4px);
}

.photos2d-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
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
  padding: 0 16px;
  background: color-mix(in srgb, var(--bg-deep-surface) 92%, var(--bg-card) 8%);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 56%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, var(--border-color) 56%, transparent);
  box-shadow: 0 6px 14px color-mix(in srgb, var(--bg-overlay) 38%, transparent);
  z-index: 11;
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

.universe-selector-container {
  pointer-events: auto;
}

/* Animation for spinning loading rings */
@keyframes ringSpin {
  0% {
    transform: translate(-50%, -50%) rotate(0deg) scale(0.96);
  }
  100% {
    transform: translate(-50%, -50%) rotate(360deg) scale(0.96);
  }
}

.quantum-void.loading .void-ring {
  border-color: color-mix(in srgb, var(--accent-color) 16%, transparent);
  border-top-color: color-mix(
    in srgb,
    var(--accent-color) 85%,
    var(--text-primary) 15%
  ); /* highlight top border as a spinner arc */
  animation: ringSpin var(--rdur, 6s) linear infinite;
  animation-delay: var(--rd, 0s);
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
  z-index: 10;
}

.photo-universe-filled:hover .floating-btn-container {
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

  .quantum-void {
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

  .universe-title {
    padding: 0;
    font-size: 10px;
  }
}
</style>
