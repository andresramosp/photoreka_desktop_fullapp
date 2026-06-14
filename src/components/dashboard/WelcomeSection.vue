<template>
  <div class="panel-section">
    <div class="welcome-block">
      <h2 class="welcome-name">WELCOME BACK,&nbsp;{{ displayName }}!👋</h2>
      <p class="welcome-tagline">
        <template v-if="avgAestheticScore != null">
          Ready to organize your photos with Photoreka smart tools.
        </template>
        <template v-else>Ready to explore your photo universe.</template>
      </p>
    </div>

    <div class="photo-stats-block">
      <!-- <div class="stats-block-header">
        <span class="stats-block-title">Your Workspace</span>
      </div> -->

      <div class="photos-primary-stat" ref="statBlockRef">
        <!-- Stats group: Col 1 + Col 2 -->
        <div class="stat-group">
          <!-- Col 1: Total photos -->
          <div
            class="stat-col stat-col--clickable"
            role="button"
            tabindex="0"
            aria-label="Go to workspace"
            @click="emit('go-workspace')"
            @keydown.enter.prevent="emit('go-workspace')"
            @keydown.space.prevent="emit('go-workspace')"
          >
            <n-icon size="24" class="stat-icon stat-icon--photos">
              <LayersOutline />
            </n-icon>
            <div class="stat-text">
              <span class="stat-value">{{ photosCountFormatted }}</span>
              <span class="stat-label">Total photos</span>
            </div>
          </div>

          <div class="stat-divider" />

          <!-- Col 2: Analyses remaining -->
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
        </div>

        <!-- Action section: Col 3 -->
        <div class="stat-action-section">
          <n-button
            type="info"
            @click="runPrimaryAction"
            :aria-label="primaryActionLabel"
          >
            <template #icon>
              <n-icon size="22">
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
import { useRouter } from "vue-router";
import { LayersOutline, ShareOutline } from "@vicons/ionicons5";
import { InProgress } from "@vicons/carbon";

const router = useRouter();
const goSettings = () => router.push("/settings");

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

const displayName = computed(() =>
  (props.userShortName || "photographer").toUpperCase(),
);

const primaryActionLabel = "Import Area";
const primaryActionIcon = ShareOutline;

const countFormatter = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: "always",
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

const analysisRemaining = computed(() =>
  formatCount(props.analyzedPhotosRemaining),
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
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-color);
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
  align-items: stretch;
  justify-content: stretch;
  flex-shrink: 0;
  /* border-left: 2px solid var(--border-color); */
}

.stat-action-section :deep(.n-button) {
  height: 100%;
  width: 100%;
  min-width: 52px;
  border-radius: 0;
  padding: 0 18px;
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
  flex: 1;
  transition: background 0.18s ease;
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
  color: var(--accent-color);
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
  font-size: 20px;
  font-weight: 800;
  color: var(--accent-color);
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
</style>
