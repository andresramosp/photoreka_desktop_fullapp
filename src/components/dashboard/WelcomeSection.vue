<template>
  <div class="panel-section">
    <div class="welcome-block">
      <!-- <h2 class="welcome-name">WELCOME BACK,&nbsp;{{ displayName }}!👋</h2>
      <p class="welcome-tagline">
        <template v-if="avgAestheticScore != null">
          Ready to organize your photos with Photoreka smart tools.
        </template>
        <template v-else>Ready to explore your photo universe.</template>
      </p> -->
    </div>

    <div class="photo-stats-block surface-flat">
      <!-- <div class="stats-block-header">
        <span class="stats-block-title">Your Workspace</span>
      </div> -->

      <div class="photos-primary-stat" ref="statBlockRef">
        <!-- Stats group: Col 1 + Col 2 -->
        <div class="stat-group">
          <!-- Col 1: Total photos -->
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <div
                class="stat-col stat-col--clickable_"
                role="button"
                tabindex="0"
                aria-label="Go to workspace"
                @click="emit('go-workspace')"
                @keydown.enter.prevent="emit('go-workspace')"
                @keydown.space.prevent="emit('go-workspace')"
              >
                <div class="stat-text">
                  <span class="stat-value">{{ photosCountFormatted }}</span>
                  <span class="stat-label">Total photos</span>
                </div>
              </div>
            </template>
            {{ analysisRemainingTooltip }}
          </n-tooltip>

          <div class="stat-divider" />

          <!--
          Col 2 (old): Analyses remaining
          <div
            class="stat-col stat-col--clickable stat-col--analysis-clickable"
            role="button"
            tabindex="0"
            aria-label="Go to settings"
            @click="goSettings"
            @keydown.enter.prevent="goSettings"
            @keydown.space.prevent="goSettings"
          >
            <n-icon size="24" class="stat-icon stat-icon--analysis">
              <InProgress />
            </n-icon>
            <div class="stat-text">
              <span class="stat-value stat-value--analysis">{{
                analysisRemaining
              }}</span>
              <span class="stat-label">Analyses left</span>
            </div>
          </div>
          -->
          <div class="stat-col stat-col--workspace-button">
            <n-button
              secondary
              type="primary"
              strong
              size="medium"
              aria-label="Go to workspace"
              @click="emit('go-workspace')"
            >
              <template #icon>
                <n-icon size="20" class="stat-icon stat-icon--photos">
                  <LayersOutline />
                </n-icon>
              </template>
              <span class="workspace-button-label">Workspace</span>
            </n-button>
          </div>
        </div>

        <!-- Action section: Col 3 -->
        <div class="stat-action-section" v-show="showUploadAction">
          <n-button
            secondary
            type="primary"
            strong
            size="medium"
            @click="runPrimaryAction"
            :aria-label="primaryActionLabel"
          >
            <template #icon>
              <n-icon size="20">
                <component :is="primaryActionIcon" />
              </n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import {
  ArrowForwardOutline,
  LayersOutline,
  ShareOutline,
} from "@vicons/ionicons5";
import { ImageOutlined } from "@vicons/material";

const props = defineProps<{
  userShortName?: string | null;
  avgAestheticScore: number | null;
  photosCount: number;
  analyzedPhotosRemaining?: number | null;
}>();

const emit = defineEmits<{
  (event: "go-workspace"): void;
  (event: "go-upload"): void;
}>();

const statBlockRef = ref<HTMLElement | null>(null);
const statBlockWidth = ref(9999);
let resizeObserver: ResizeObserver | null = null;

// The "Workspace" button always keeps its label — it is allowed to truncate
// with an ellipsis (see .workspace-button-label) but must never collapse to an
// icon-only state. The only thing that folds when the row gets tight is the
// secondary upload shortcut, which drops out entirely rather than crowding the
// label. --welcome-row-min in DashboardView.vue keeps the panel wide enough
// that the full label fits in the normal desktop/tablet range.
const UPLOAD_ACTION_MIN_WIDTH = 250;

const showUploadAction = computed(
  () => statBlockWidth.value >= UPLOAD_ACTION_MIN_WIDTH,
);

onMounted(() => {
  if (statBlockRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      statBlockWidth.value = entries[0].contentRect.width;
    });
    resizeObserver.observe(statBlockRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

const displayName = computed(() =>
  (props.userShortName || "photographer").toUpperCase(),
);

const primaryActionLabel = "Import Area";
const primaryActionIcon = ShareOutline;

const countFormatter = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

const formatCount = (value: number | string | null | undefined) => {
  if (value == null) return "—";

  const numericValue =
    typeof value === "string"
      ? Number(value.replace(/[^\d-]/g, ""))
      : Number(value);

  if (!Number.isFinite(numericValue)) return "—";

  return countFormatter.format(Math.trunc(numericValue));
};

const photosCountFormatted = computed(() => formatCount(props.photosCount));

const analysisRemainingTooltip = computed(() =>
  props.analyzedPhotosRemaining == null
    ? "Analyses remaining unavailable"
    : `${formatCount(props.analyzedPhotosRemaining)} analyses remaining`,
);

const runPrimaryAction = () => emit("go-upload");
</script>

<style scoped>
.welcome-block {
  margin: 0;
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

/* ── Workspace stats block ── */
.photo-stats-block {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.stats-block-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px 5px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
}

.stats-block-header-icon {
  color: var(--primary-color);
  flex-shrink: 0;
  opacity: 0.85;
}

.stats-block-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary-color);
  opacity: 0.9;
}

/* ── Row wrapper ── */
.photos-primary-stat {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

/* ── Stats group (col1 + col2) ── */
.stat-group {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-width: 0;
}

/* ── Action section (col3) ── */
.stat-action-section {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 10px 14px;
  border-left: 1px solid var(--border-color);
}

.stat-action-section :deep(.n-button) {
  justify-content: center;
}

.stat-divider {
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
  margin: 8px 0;
}

/* ── Individual column ── */
.stat-col {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 10px 14px;
  min-width: 0;
  flex-shrink: 0;
  transition: background 0.18s ease;
}

.stat-col--workspace-button {
  flex: 1 1 auto;
  min-width: 0;
}

.stat-col--workspace-button :deep(.n-button) {
  width: 100%;
  justify-content: center;
  min-width: 0;
}

.stat-col--workspace-button :deep(.n-button__content) {
  min-width: 0;
  overflow: hidden;
}

.workspace-button-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.stat-col--clickable {
  cursor: pointer;
  position: relative;
}

.stat-col--clickable::before {
  content: "";
  position: absolute;
  inset: 2px 3px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-color) 10%, transparent);
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
  pointer-events: none;
}

.stat-col--analysis-clickable::before {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.stat-col--clickable:hover::before {
  opacity: 1;
}

.stat-col--clickable:hover .stat-value {
  filter: brightness(1.12);
}

.stat-col--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 50%, transparent);
  outline-offset: -2px;
}

.stat-icon--photos {
  flex-shrink: 0;
  opacity: 0.9;
}

.stat-icon--analysis {
  color: var(--primary-color);
  flex-shrink: 0;
  opacity: 0.85;
}

.stat-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.stat-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat-value--analysis {
  color: var(--primary-color);
}

.stat-label {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

@media (max-width: 680px) {
  .stat-col {
    flex: 1 1 0;
  }

  .stat-group .stat-col:not(.stat-col--workspace-button) {
    flex: 0 1 40%;
  }

  .stat-col--workspace-button {
    flex: 1 1 60%;
  }
}
</style>
