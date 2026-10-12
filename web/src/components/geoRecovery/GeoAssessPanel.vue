<script setup lang="ts">
import { computed } from "vue";
import { NButton, NIcon, NTag, NTooltip } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseCircleOutline,
  AlertCircleOutline,
  ArrowBackOutline,
} from "@vicons/ionicons5";
import type { AssessmentSummary } from "@/utils/geoRecovery/assess";

const props = defineProps<{
  files: File[];
  previews: string[];
  busy: boolean;
  results: AssessmentSummary | null;
  error: string | null;
}>();

const emit = defineEmits<{ runFree: []; skip: []; back: [] }>();

// ── Derived ───────────────────────────────────────────────────────────────────

const discardedRatio = computed(() => {
  if (!props.results || props.results.total === 0) return 0;
  return props.results.discardedCount / props.results.total;
});

/**
 * 'none'   — all plausible
 * 'mild'   — some discarded but < 50 %
 * 'strong' — ≥ 50 % discarded
 */
const warningLevel = computed<"none" | "mild" | "strong">(() => {
  if (!props.results) return "none";
  if (discardedRatio.value === 0) return "none";
  return discardedRatio.value < 0.5 ? "mild" : "strong";
});

// Run Free is only available when ALL 10 photos are suitable (level 1)
const canRunFree = computed(
  () => !!props.results && !props.busy && warningLevel.value === "none",
);

function verdictFor(index: number): "plausible" | "discarded" | null {
  if (!props.results) return null;
  const r = props.results.results.find((x) => x.id === index + 1);
  return r?.verdict ?? null;
}

function reasonFor(index: number): string {
  if (!props.results) return "";
  const r = props.results.results.find((x) => x.id === index + 1);
  return r?.reason ?? "";
}
</script>

<template>
  <div class="gap-panel">
    <!-- Header -->
    <div class="gap-header">
      <h2 class="gap-title">
        {{ busy ? "Analyzing your photos…" : "Assessment results" }}
      </h2>
    </div>

    <!-- Error state -->
    <div v-if="error" class="gap-error">
      <NIcon :component="AlertCircleOutline" size="15" />
      {{ error }}
    </div>

    <!-- Photo grid -->
    <div class="gap-grid">
      <NTooltip
        v-for="(preview, i) in previews"
        :key="i"
        :disabled="busy || verdictFor(i) !== 'discarded'"
        placement="top"
      >
        <template #trigger>
          <div
            class="gap-cell"
            :class="{
              'gap-cell--skeleton': busy,
              'gap-cell--plausible': !busy && verdictFor(i) === 'plausible',
              'gap-cell--discarded': !busy && verdictFor(i) === 'discarded',
            }"
          >
            <img
              :src="preview"
              :alt="files[i]?.name ?? ''"
              class="gap-cell-img"
            />

            <!-- Verdict overlay (results in) -->
            <div
              v-if="!busy && verdictFor(i) !== null"
              class="gap-cell-overlay"
              :class="
                verdictFor(i) === 'plausible'
                  ? 'gap-cell-overlay--ok'
                  : 'gap-cell-overlay--bad'
              "
            >
              <NIcon
                :component="
                  verdictFor(i) === 'plausible'
                    ? CheckmarkCircleOutline
                    : CloseCircleOutline
                "
                size="22"
              />
            </div>
          </div>
        </template>
        {{ reasonFor(i) }}
      </NTooltip>
    </div>

    <!-- Summary + warnings (only when results are in) -->
    <template v-if="results && !busy">
      <!-- Counts -->
      <div class="gap-counts">
        <NTag type="success" :bordered="false" size="small">
          {{ results.plausibleCount }} suitable
        </NTag>
        <NTag
          v-if="results.discardedCount > 0"
          type="error"
          :bordered="false"
          size="small"
        >
          {{ results.discardedCount }} questionable
        </NTag>
        <NTag :bordered="false" size="small"> {{ results.total }} total </NTag>
      </div>

      <!-- All clear -->
      <div v-if="warningLevel === 'none'" class="gap-notice gap-notice--ok">
        <NIcon
          :component="CheckmarkCircleOutline"
          size="15"
          class="gap-notice-icon"
        />
        <span>
          All photos look suitable for geo-inference. You're good to go!
        </span>
      </div>

      <!-- Mild warning (some discarded, < 50 %) -->
      <div
        v-else-if="warningLevel === 'mild'"
        class="gap-notice gap-notice--warn"
      >
        <NIcon
          :component="AlertCircleOutline"
          size="15"
          class="gap-notice-icon"
        />
        <div>
          <strong>Some of your photos may be difficult to geolocate.</strong>
          Those marked with a red ✕ are studio shots, extreme close-ups, or
          scenes too generic to extract geographic references. To unlock the
          free geo-inference run, go back and replace them with photos showing
          rich outdoor context — landscapes, local streets, monuments, or any
          scene with distinctive cultural or architectural details.
        </div>
      </div>

      <!-- Strong warning (≥ 50 % discarded) -->
      <div v-else class="gap-notice gap-notice--danger">
        <NIcon
          :component="AlertCircleOutline"
          size="15"
          class="gap-notice-icon"
        />
        <div>
          <strong
            >Most of your photos are not suitable for geo-inference.</strong
          >
          Studio shots, extreme close-ups, and images without recognizable
          geographic references cannot be geolocated. Go back and select photos
          with rich visual context: outdoor scenes, markets, monuments,
          landscapes, or any scene with distinctive local details.
        </div>
      </div>

      <!-- Hint to try different photos when run is locked -->
      <p v-if="warningLevel !== 'none'" class="gap-run-hint">
        ← Go back and select more contextually rich photos to unlock the free
        geo-inference run.
      </p>
    </template>

    <!-- Footer -->
    <div class="gap-footer">
      <div class="gap-footer-left">
        <NButton size="medium" @click="emit('back')">
          <template #icon><NIcon :component="ArrowBackOutline" /></template>
          Back
        </NButton>
        <NButton size="medium" @click="emit('skip')">Skip test</NButton>
      </div>
      <NButton
        type="info"
        size="large"
        :disabled="!canRunFree"
        :title="
          canRunFree
            ? 'Run geo-inference on these 10 photos for free'
            : 'All 10 photos must be suitable to unlock the free run'
        "
        @click="emit('runFree')"
      >
        {{ !results || busy ? "Please wait…" : "Run 1 Free Geo-Recovery" }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.gap-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Header ────────────────────────────────────────────────── */

.gap-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gap-title {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.3px;
}

/* ── Error ─────────────────────────────────────────────────── */

.gap-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 80, 80, 0.12);
  border: 1px solid rgba(255, 80, 80, 0.3);
  color: #ff6b6b;
  font-size: 13px;
}

/* ── Photo grid ────────────────────────────────────────────── */

.gap-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: calc((min(740px, 92vw) - 64px) / 5);
  align-content: start;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
  border-radius: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.gap-cell {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background: #1a1a1a;
  transition: outline 0.15s ease;
}

/* Skeleton shimmer while busy */
.gap-cell--skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.09) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: gap-shimmer 1.4s ease-in-out infinite;
}

/* Dim the actual photo while skeleton is animating */
.gap-cell--skeleton .gap-cell-img {
  opacity: 0.18;
}

@keyframes gap-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.gap-cell--plausible::after,
.gap-cell--discarded::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
}

.gap-cell--plausible::after {
  box-shadow: inset 0 0 0 2px var(--success-color, #63e2b7);
}

.gap-cell--discarded::after {
  box-shadow: inset 0 0 0 2px var(--error-color, #e88080);
}

.gap-cell--discarded {
  cursor: pointer;
}

.gap-cell-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* ── Verdict overlay ────────────────────────────────────────── */

.gap-cell-overlay {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.gap-cell-overlay--loading {
  display: none;
}

.gap-cell-overlay--ok {
  background: rgba(0, 0, 0, 0.6);
  color: var(--success-color, #63e2b7);
}

.gap-cell-overlay--bad {
  background: rgba(0, 0, 0, 0.6);
  color: var(--error-color, #e88080);
}

/* ── Counts ────────────────────────────────────────────────── */

.gap-counts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* ── Notices ───────────────────────────────────────────────── */

.gap-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 13px;
  border-radius: 10px;
  border-left: 3px solid;
  font-size: 12.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.8);
}

.gap-notice--ok {
  background: color-mix(in srgb, var(--success-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--success-color) 45%, transparent);
}

.gap-notice--warn {
  background: color-mix(in srgb, var(--warning-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--warning-color) 45%, transparent);
}

.gap-notice--danger {
  background: rgba(200, 50, 50, 0.1);
  border-color: rgba(220, 80, 80, 0.5);
}

.gap-notice strong {
  color: rgba(255, 255, 255, 0.95);
}

.gap-notice-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.gap-notice--ok .gap-notice-icon {
  color: var(--success-color, #63e2b7);
}

.gap-notice--warn .gap-notice-icon {
  color: var(--warning-color, #f0a020);
}

.gap-notice--danger .gap-notice-icon {
  color: #e88080;
}

/* ── Run-free hint ─────────────────────────────────────────── */

.gap-run-hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.45);
  font-style: italic;
}

/* ── Footer ────────────────────────────────────────────────── */

.gap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.gap-footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
