<template>
  <n-message-provider placement="bottom">
    <div class="atlas-view" :class="{ 'catalog-mode': isCatalogMode }">
      <!-- Mode switcher - Top Left (desktop only, 3D unavailable on mobile) -->
      <AtlasModeSwitcher
        v-if="!isMobile"
        class="atlas-switcher"
        :model-value="mode"
        :disable3d="isMobile"
        :loading="atlasLoading"
        @request-change="requestModeChange"
      />

      <!-- Atlas Visualization (full unmount/remount on mode change) -->
      <Photos2D
        v-if="mode === '2d'"
        class="atlas-canvas"
        :catalog-user-id="catalogUserId"
        :is-playground="isPlayground"
        @loading-state-change="onAtlasLoadingChange"
      />
      <Photos3D
        v-else
        class="atlas-canvas"
        :catalog-user-id="catalogUserId"
        :is-playground="isPlayground"
        @loading-state-change="onAtlasLoadingChange"
      />

      <!-- Playground Logo - Top Left -->
      <div v-if="isPlayground" class="playground-logo">
        <div class="logo-container-playground">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <AppLogo layout="icon" :height="50" />
          </a>
        </div>
      </div>

      <!-- Reset warning when switching modes -->
      <n-modal :show="showResetWarning" @update:show="onModalToggle">
        <n-card
          class="atlas-reset-card"
          :bordered="false"
          role="dialog"
          aria-modal="true"
        >
          <div class="atlas-reset-header">
            <n-icon size="22" class="atlas-reset-icon">
              <WarningOutline />
            </n-icon>
            <h3 class="atlas-reset-title">
              Switch to {{ pendingModeLabel }} view?
            </h3>
          </div>
          <p class="atlas-reset-body">
            Changing the view reloads the atlas from scratch. Your current
            filters, layout, zoom and selection will be reset.
          </p>
          <n-checkbox
            v-model:checked="dontShowResetWarning"
            class="atlas-reset-checkbox"
          >
            Don't show this again
          </n-checkbox>
          <div class="atlas-reset-actions">
            <n-button quaternary @click="cancelModeChange">Cancel</n-button>
            <n-button type="primary" @click="confirmModeChange">
              Switch to {{ pendingModeLabel }}
            </n-button>
          </div>
        </n-card>
      </n-modal>
    </div>
  </n-message-provider>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NMessageProvider,
  NModal,
  NCard,
  NButton,
  NIcon,
  NCheckbox,
} from "naive-ui";
import { WarningOutline } from "@vicons/ionicons5";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { usePhotosStore } from "@/stores/photos.js";
import Photos2D from "@/components/2d-atlas/Photos2D.vue";
import Photos3D from "@/components/3d-atlas/Photos3D.vue";
import AtlasModeSwitcher from "@/components/atlas/AtlasModeSwitcher.vue";
import AppLogo from "@/components/AppLogo.vue";

defineOptions({ name: "AtlasView" });

const MODE_STORAGE_KEY = "atlas:lastMode";
const SKIP_RESET_WARNING_KEY = "atlas:skipResetWarning";

const route = useRoute();
const router = useRouter();
const { isMobile } = useIsMobile();
const photosStore = usePhotosStore();

// Catalog/playground parity with the previous standalone views
const isCatalogMode = computed(() => route.meta?.playground === true);
const catalogUserId = computed(() => route.params?.userId || null);
const isPlayground = computed(() => !!catalogUserId.value);

// 3D is desktop-only, so any request for it on mobile falls back to 2D
function normalizeMode(value) {
  const m = String(value || "").toLowerCase();
  return m === "3d" && !isMobile.value ? "3d" : "2d";
}

function readStoredMode() {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function resolveInitialMode() {
  const q = route.query.mode;
  if (q === "2d" || q === "3d") return normalizeMode(q);
  const stored = readStoredMode();
  if (stored === "2d" || stored === "3d") return normalizeMode(stored);
  return "2d";
}

const mode = ref(resolveInitialMode());

// Atlas loading state (emitted by Photos2D/Photos3D) gates the mode switcher
// so users can't swap views mid-load and trigger a broken remount.
const atlasLoading = ref(false);
function onAtlasLoadingChange(isLoading) {
  atlasLoading.value = Boolean(isLoading);
}

function readSkipResetWarning() {
  try {
    return localStorage.getItem(SKIP_RESET_WARNING_KEY) === "1";
  } catch {
    return false;
  }
}

const showResetWarning = ref(false);
const pendingMode = ref(null);
const pendingModeLabel = computed(() =>
  pendingMode.value === "3d" ? "3D" : "2D",
);
const dontShowResetWarning = ref(readSkipResetWarning());

function persistMode(m) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, m);
  } catch {
    /* ignore storage errors */
  }
}

function syncQuery(m) {
  if (route.query.mode === m) return;
  router.replace({ query: { ...route.query, mode: m } });
}

function applyMode(m) {
  const nm = normalizeMode(m);
  mode.value = nm;
  persistMode(nm);
  syncQuery(nm);
}

// Switcher-initiated change: warn before the radical reset (unless dismissed)
function requestModeChange(target) {
  const nm = normalizeMode(target);
  if (nm === mode.value) return;
  if (readSkipResetWarning()) {
    applyMode(nm);
    return;
  }
  pendingMode.value = nm;
  showResetWarning.value = true;
}

function confirmModeChange() {
  try {
    localStorage.setItem(
      SKIP_RESET_WARNING_KEY,
      dontShowResetWarning.value ? "1" : "0",
    );
  } catch {
    /* ignore storage errors */
  }
  if (pendingMode.value) applyMode(pendingMode.value);
  pendingMode.value = null;
  showResetWarning.value = false;
}

function cancelModeChange() {
  pendingMode.value = null;
  showResetWarning.value = false;
}

function onModalToggle(value) {
  if (!value) cancelModeChange();
}

// External query changes (deep links, redirects, menu) switch without warning
watch(
  () => route.query.mode,
  (q) => {
    if (q !== "2d" && q !== "3d") return;
    const nm = normalizeMode(q);
    if (nm !== mode.value) {
      mode.value = nm;
      persistMode(nm);
    }
    if (nm !== q) syncQuery(nm);
  },
);

// Losing desktop width forces 2D
watch(isMobile, (m) => {
  if (m && mode.value === "3d") applyMode("2d");
});

onMounted(() => {
  // Keep the mode query in the URL so 2D/3D are directly linkable
  applyMode(mode.value);

  if (!isCatalogMode.value) {
    photosStore.getOrFetch(false).catch((err) => {
      console.error("Error preloading photos for Atlas view:", err);
    });
  }
});
</script>

<style scoped>
.atlas-view {
  width: 100%;
  height: 100%;
  position: relative;
}

.atlas-canvas {
  width: 100%;
  height: 100%;
}

.atlas-switcher {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 300;
}

/* Playground Logo - Top Left */
.playground-logo {
  position: absolute;
  top: 0px;
  left: 0px;
  z-index: 1000;
}

.logo-container-playground {
  border-radius: 12px;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Reset warning */
.atlas-reset-card {
  width: 440px;
  max-width: calc(100vw - 32px);
  background: var(--bg-card);
  border-radius: 14px;
  border: 1px solid var(--border-color);
}

.atlas-reset-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.atlas-reset-icon {
  color: var(--warning-color, #f0a020);
}

.atlas-reset-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.atlas-reset-body {
  margin: 0 0 20px 0;
  line-height: 1.55;
  color: var(--text-secondary, rgba(255, 255, 255, 0.7));
}

.atlas-reset-checkbox {
  margin-bottom: 20px;
}

.atlas-reset-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
