<template>
  <Teleport to="body">
    <Transition name="ai-location-fade">
      <div
        v-if="show"
        class="ai-location-backdrop"
        @mousedown.self="backdropPressed = true"
        @click.self="onBackdropClick"
      >
        <n-card
          class="ai-location-card"
          :bordered="false"
          size="medium"
          role="dialog"
          aria-modal="true"
          style="
            background-color: var(--bg-body);
            border: 1px solid var(--border-color);
          "
        >
          <template #header>
            <div class="ai-location-modal-header">
              <n-icon :component="headerIcon" />
              <span>{{ dialogTitle }}</span>
            </div>
          </template>

          <template #header-extra>
            <n-button
              quaternary
              circle
              size="small"
              @click="emit('update:show', false)"
            >
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                    />
                  </svg>
                </n-icon>
              </template>
            </n-button>
          </template>

          <div class="ai-location-body">
            <!-- ── Running ──────────────────────────────────────────── -->
            <template v-if="phase === 'running'">
              <div class="ail-progress-row">
                <span class="ail-analyzing-label">
                  <SpiralGridLoader
                    v-if="displayProgress === 0"
                    variant="primary"
                    :size="20"
                  />
                  {{ runningStatusLabel }}
                </span>
                <span class="ail-progress-meta">
                  <strong>{{ displayProgress }}%</strong>
                </span>
              </div>

              <div v-if="displayProgress === 0" class="ail-indeterminate-track">
                <div class="ail-indeterminate-bar" />
              </div>
              <n-progress
                v-else
                type="line"
                :percentage="displayProgress"
                :show-indicator="false"
                color="var(--accent-color)"
                rail-color="var(--border-color)"
              />

              <p class="ail-copy">{{ statusMessage }}</p>
            </template>

            <!-- ── Completed ───────────────────────────────────────── -->
            <template v-else-if="phase === 'completed'">
              <div class="ail-success-banner">
                <n-icon
                  :component="CheckmarkCircleOutline"
                  size="44"
                  :color="'var(--success-color)'"
                  class="ail-success-icon"
                />
                <div class="ail-success-text">
                  <div class="ail-success-headline">
                    {{ status?.located || 0 }}
                    photo{{ status?.located === 1 ? "" : "s" }} placed on the
                    map
                  </div>
                  <div class="ail-success-sub">
                    out of {{ status?.total || 0 }} analysed
                  </div>
                </div>
              </div>

              <div class="ail-cards">
                <div class="ail-card ail-card--located">
                  <n-icon
                    :component="CheckmarkCircleOutline"
                    size="13"
                    :color="'var(--success-color)'"
                    class="ail-card-check"
                  />
                  <strong>{{ status?.located || 0 }}</strong>
                  <span>confidently located</span>
                </div>
                <div class="ail-card">
                  <n-icon
                    :component="CloseCircleOutline"
                    size="13"
                    :color="'var(--error-color)'"
                    class="ail-card-check"
                  />
                  <strong>{{ notPlaced }}</strong>
                  <span>unknown location</span>
                </div>
              </div>

              <div class="ail-credits-row">
                <span>Credits charged</span>
                <strong>{{ status?.creditsCharged || 0 }}</strong>
              </div>
            </template>

            <!-- ── Failed ─────────────────────────────────────────── -->
            <template v-else-if="phase === 'failed'">
              <div class="ail-error-banner">
                <n-icon
                  :component="CloseCircleOutline"
                  size="44"
                  :color="'var(--error-color)'"
                  class="ail-error-icon"
                />
                <div class="ail-error-text">
                  <div class="ail-error-headline">Analysis failed</div>
                  <div class="ail-error-sub">
                    {{
                      status?.error ||
                      "An unexpected error occurred. Please try again."
                    }}
                  </div>
                </div>
              </div>
            </template>

            <!-- ── Idle ───────────────────────────────────────────── -->
            <template v-else>
              <div class="ail-hero">
                <svg
                  class="ail-hero-globe"
                  viewBox="0 0 200 200"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <circle
                    cx="100"
                    cy="100"
                    r="90"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                  <ellipse
                    cx="100"
                    cy="100"
                    rx="90"
                    ry="28"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.2"
                  />
                  <ellipse
                    cx="100"
                    cy="72"
                    rx="76"
                    ry="19"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1"
                  />
                  <ellipse
                    cx="100"
                    cy="128"
                    rx="76"
                    ry="19"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1"
                  />
                  <ellipse
                    cx="100"
                    cy="100"
                    rx="46"
                    ry="90"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1"
                  />
                  <ellipse
                    cx="100"
                    cy="100"
                    rx="46"
                    ry="90"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1"
                    transform="rotate(60 100 100)"
                  />
                  <ellipse
                    cx="100"
                    cy="100"
                    rx="46"
                    ry="90"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1"
                    transform="rotate(-60 100 100)"
                  />
                  <line
                    x1="100"
                    y1="10"
                    x2="100"
                    y2="190"
                    stroke="currentColor"
                    stroke-width="1.2"
                  />
                </svg>
                <n-tag
                  type="primary"
                  size="small"
                  round
                  :bordered="false"
                  class="ail-badge"
                >
                  <template #icon>
                    <n-icon :component="GlobeOutline" />
                  </template>
                  Track your journey
                </n-tag>
                <p class="ail-hero-text">
                  Our AI engine will inspect eligible photos without GPS
                  metadata, infer a place, city or country from visual context
                  and place reliable matches on the map.
                </p>
              </div>

              <div v-if="photosToProcess === 0" class="ail-all-located-banner">
                <n-icon
                  :component="CheckmarkCircleOutline"
                  size="20"
                  :color="'var(--success-color)'"
                  class="ail-all-located-icon"
                />
                <div class="ail-all-located-text">
                  <span class="ail-all-located-headline"
                    >No photos to process</span
                  >
                  <span class="ail-all-located-sub">
                    It looks like you don't have any photos to geotag. They may
                    have already been analyzed in a previous run, or your
                    remaining photos may not meet the acceptance criteria. You
                    can upload more photos and try again.
                  </span>
                </div>
              </div>

              <!-- ── Forecast panel ─────────────────────────────────── -->
              <template
                v-if="
                  candidatePhotoTotal > 0 &&
                  photosToProcess > 0 &&
                  (forecastReady || !timerElapsed)
                "
              >
                <!-- Loader while the fake calculation runs -->
                <template v-if="!forecastReady">
                  <div class="ail-forecast-loader">
                    <SpiralGridLoader variant="primary" :size="24" />
                    <span class="ail-forecast-loader-text"
                      >Analysing your photos…</span
                    >
                  </div>
                </template>
              </template>
              <template
                v-if="
                  candidatePhotoTotal > 0 &&
                  photosToProcess > 0 &&
                  forecastReady &&
                  forecast
                "
              >
                <div class="ail-forecast-header">
                  <n-icon
                    :component="TrendingUpOutline"
                    size="14"
                    :color="'var(--text-secondary)'"
                  />
                  <span class="ail-forecast-title">
                    <span class="ail-forecast-title-count"
                      >{{ candidatePhotoTotal }} PHOTOS</span
                    >
                    WITHOUT GPS DATA
                  </span>
                </div>

                <!-- <p class="ail-forecast-subtitle">
                  Estimated from each photo's genre, lighting, framing and
                  palette. Outdoor, well-lit, wide-frame shots score highest.
                </p> -->

                <div class="ail-forecast-grid">
                  <!-- Plausible -->
                  <div class="ail-forecast-cell ail-forecast-cell--good">
                    <div class="ail-forecast-cell-top">
                      <n-icon
                        :component="CheckmarkCircleOutline"
                        size="15"
                        :color="'var(--success-color)'"
                      />
                      <span class="ail-forecast-pct">{{
                        forecast.plausible.count
                      }}</span>
                    </div>
                    <span class="ail-forecast-label">Good chances</span>
                    <span class="ail-forecast-hint"
                      >Passed acceptance rules (outdoor, well-lit,
                      documentary)</span
                    >
                  </div>

                  <!-- Discarded -->
                  <div class="ail-forecast-cell ail-forecast-cell--poor">
                    <div class="ail-forecast-cell-top">
                      <n-icon
                        :component="RemoveCircleOutline"
                        size="15"
                        :color="'var(--error-color)'"
                      />
                      <span class="ail-forecast-pct">{{
                        forecast.discarded.count
                      }}</span>
                    </div>
                    <span class="ail-forecast-label">Skipped</span>
                    <span class="ail-forecast-hint"
                      >Matched exclusion rules (studio, indoor, abstract,
                      low-quality, etc.)</span
                    >
                  </div>
                </div>

                <!-- Low-success warning -->
                <div
                  v-if="
                    forecast.lowSuccessWarning && forecast.plausible.count > 0
                  "
                  class="ail-notice ail-notice--warning ail-notice--warning-confirm"
                >
                  <n-icon
                    :component="WarningOutline"
                    size="15"
                    :color="'var(--warning-color)'"
                    class="ail-notice-icon"
                  />
                  <div class="ail-warning-confirm">
                    <span>
                      Some of your photos don't seem suitable for geolocation.
                      This may be due to their content (e.g. mostly indoor,
                      studio, abstract shots), or to their technical quality.
                    </span>
                  </div>
                </div>
              </template>

              <!-- ── Photo limit slider ──────────────────────────────── -->
              <div
                v-if="photosToProcess > 1 && forecastReady"
                class="ail-limit-row"
              >
                <div class="ail-limit-header">
                  <span class="ail-limit-label">Limit photos</span>
                </div>
                <n-slider
                  v-model:value="selectedPhotoLimit"
                  :min="sliderMin"
                  :max="photosToProcess"
                  :step="1"
                />
                <div class="ail-limit-footer">
                  <span
                    >{{ selectedPhotoLimit }}
                    {{ selectedPhotoLimit === 1 ? "photo" : "photos" }}</span
                  >
                  <span
                    v-if="selectedPhotoLimit < photosToProcess"
                    class="ail-limit-sub"
                    >Best-scored {{ selectedPhotoLimit }} of
                    {{ photosToProcess }}</span
                  >
                </div>
              </div>

              <div
                v-if="photosToProcess > 0 && forecastReady"
                class="ail-cards"
              >
                <div class="ail-card">
                  <span>Photos to process</span>
                  <strong>{{ selectedPhotoLimit }}</strong>
                </div>
                <div class="ail-card">
                  <span>Estimated cost interval</span>
                  <strong
                    >{{ adjustedCredits.min.toFixed(1) }} –
                    {{ adjustedCredits.max.toFixed(1) }} credits</strong
                  >
                </div>
              </div>

              <div
                v-if="
                  candidatePhotoTotal > 0 &&
                  photosToProcess > 0 &&
                  forecastReady
                "
                class="ail-notices"
              >
                <div class="ail-notice ail-notice--info ail-notice--multi">
                  <div class="ail-notice-item">
                    <n-icon
                      :component="InformationCircleOutline"
                      size="15"
                      :color="'var(--info-color)'"
                      class="ail-notice-icon"
                    />
                    <span>
                      <strong>Results are approximate</strong> — usually
                      <strong>city or district level</strong>, rarely street
                      level. Several photos may cluster at the same point when
                      finer data isn't available.
                    </span>
                  </div>
                  <div class="ail-notice-item">
                    <n-icon
                      :component="CreateOutline"
                      size="15"
                      :color="'var(--info-color)'"
                      class="ail-notice-icon"
                    />
                    <span>
                      A <strong>small percentage</strong> of placements may be
                      <strong>imprecise or wrong</strong>; you can always
                      <strong>correct them manually</strong> through
                      <strong>the edit button in the marker</strong>.
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <template #action>
            <div
              class="ai-location-actions"
              :class="{
                'ai-location-actions--centered': phase === 'completed',
              }"
            >
              <n-button
                v-if="phase !== 'completed'"
                @click="emit('update:show', false)"
                >Close</n-button
              >
              <n-button
                v-else
                type="primary"
                secondary
                @click="emit('update:show', false)"
              >
                See your photos
              </n-button>

              <!-- Idle: start analysis -->
              <n-button
                v-if="phase === 'idle'"
                type="info"
                :disabled="photosToProcess === 0"
                :loading="isStarting"
                @click="emit('start', selectedPhotoLimit)"
              >
                <template #icon>
                  <n-icon size="20"><RocketLaunchOutlined /></n-icon>
                </template>
                Start Inference
              </n-button>

              <!-- Completed / Failed: run again -->
              <!-- <n-button
                v-else-if="phase === 'completed' || phase === 'failed'"
                type="primary"
                :disabled="photosToProcess === 0"
                :loading="isStarting"
                @click="emit('start')"
              >
                <template #icon>
                  <n-icon size="20"><RocketLaunchOutlined /></n-icon>
                </template>
                Run again
              </n-button> -->
            </div>
          </template>
        </n-card>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { RocketLaunchOutlined } from "@vicons/material";
import {
  SparklesOutline,
  InformationCircleOutline,
  WarningOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  GlobeOutline,
  TrendingUpOutline,
  RemoveCircleOutline,
  CreateOutline,
} from "@vicons/ionicons5";

export interface AiLocationJobStatus {
  jobId: string;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  located: number;
  unknown: number;
  uncertain?: number;
  geocodeMiss?: number;
  failed: number;
  creditsCharged: number;
  costEur: number;
  llmInferred?: number;
  progressPercent?: number;
  progressStage?:
    | "preparing"
    | "matching"
    | "inferring"
    | "placing"
    | "completed"
    | "failed";
  error?: string;
}

export interface GeolocatabilityAssessment {
  total: number;
  plausible: { count: number; percentage: number };
  discarded: { count: number; percentage: number };
  lowSuccessWarning: boolean;
}

const props = defineProps<{
  show: boolean;
  photosToProcess: number;
  discardedPhotos: number;
  estimatedCredits: { min: number; max: number };
  status: AiLocationJobStatus | null;
  isStarting: boolean;
  forecast: GeolocatabilityAssessment | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  start: [limit: number];
}>();

const backdropPressed = ref(false);
function onBackdropClick() {
  if (backdropPressed.value) emit("update:show", false);
  backdropPressed.value = false;
}

// ── Photo limit slider ────────────────────────────────────────────────
const sliderMin = computed(() => (props.photosToProcess < 50 ? 1 : 10));
const selectedPhotoLimit = ref(props.photosToProcess);

watch(
  () => props.photosToProcess,
  (val) => {
    selectedPhotoLimit.value = val;
  },
);

watch(sliderMin, (min) => {
  if (selectedPhotoLimit.value < min) selectedPhotoLimit.value = min;
});

// Scale the backend estimate proportionally when the slider is adjusted
const adjustedCredits = computed(() => {
  const base = props.estimatedCredits;
  if (selectedPhotoLimit.value >= props.photosToProcess) return base;
  const ratio = selectedPhotoLimit.value / props.photosToProcess;
  return {
    min: Math.max(1, Math.round(base.min * ratio)),
    max: Math.max(1, Math.round(base.max * ratio)),
  };
});
// ─────────────────────────────────────────────────────────────────────

// ── Fake forecast loader ──────────────────────────────────────────────
const timerElapsed = ref(false);
let forecastTimer: ReturnType<typeof setTimeout> | null = null;

const candidatePhotoTotal = computed(
  () => props.forecast?.total ?? props.photosToProcess + props.discardedPhotos,
);

watch(
  () => [props.show, candidatePhotoTotal.value] as const,
  ([val, total]) => {
    if (forecastTimer) clearTimeout(forecastTimer);
    if (val && total > 0) {
      timerElapsed.value = false;
      forecastTimer = setTimeout(
        () => {
          timerElapsed.value = true;
        },
        2000 + Math.random() * 1000, // 2.0 – 3.0 s
      );
    } else {
      timerElapsed.value = false;
    }
  },
);

const forecastReady = computed(
  () => timerElapsed.value && props.forecast !== null,
);
// ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "running" | "completed" | "failed";

const phase = computed<Phase>(() => {
  if (props.status?.status === "running") return "running";
  if (props.status?.status === "completed") return "completed";
  if (props.status?.status === "failed") return "failed";
  return "idle";
});

const finalizedCount = computed(() => {
  const s = props.status;
  if (!s?.total) return 0;
  return Math.min(s.total, Math.max(0, s.processed || 0));
});

const inferredCount = computed(() => {
  const s = props.status;
  if (!s?.total) return 0;
  return Math.min(s.total, Math.max(0, s.llmInferred || 0));
});

const fallbackProgressPercent = computed(() => {
  const s = props.status;
  if (!s?.total) return 0;
  if (s.status === "completed") return 100;

  const inferredAhead = Math.min(
    Math.max(0, inferredCount.value - finalizedCount.value),
    Math.max(0, s.total - finalizedCount.value),
  );
  const weightedUnits = finalizedCount.value + inferredAhead * 0.35;
  return Math.min(99, Math.round((weightedUnits / s.total) * 100));
});

const displayProgress = computed(() => {
  const backendProgress = props.status?.progressPercent;
  if (typeof backendProgress === "number" && Number.isFinite(backendProgress)) {
    return Math.min(100, Math.max(0, Math.round(backendProgress)));
  }
  return fallbackProgressPercent.value;
});

const runningStatusLabel = computed(() => {
  switch (props.status?.progressStage) {
    case "matching":
      return "Matching nearby photos…";
    case "placing":
      return "Placing confirmed locations…";
    case "inferring":
      return "Inferring locations with AI…";
    default:
      return "Preparing location inference…";
  }
});

const runningProgressDetail = computed(() => {
  const s = props.status;
  if (!s?.total) return "Starting";
  if (finalizedCount.value > 0) {
    return `${finalizedCount.value} / ${s.total} finalized`;
  }
  if (inferredCount.value > 0) {
    return `${inferredCount.value} / ${s.total} inferred`;
  }
  return `${s.total} queued`;
});

const notPlaced = computed(() => {
  const s = props.status;
  if (!s) return 0;

  const knownBreakdown =
    (s.unknown || 0) +
    (s.uncertain || 0) +
    (s.geocodeMiss || 0) +
    (s.failed || 0);

  return (
    knownBreakdown ||
    Math.max(0, (s.processed || s.total || 0) - (s.located || 0))
  );
});

const statusMessage = computed(() => {
  const s = props.status;

  if (phase.value === "completed") {
    return `${s?.located || 0} photo${s?.located === 1 ? "" : "s"} placed on the map out of ${s?.total || 0} analysed.`;
  }

  if (phase.value === "failed") {
    return s?.error || "An unexpected error occurred. Please try again.";
  }

  return "You can close this dialog. We will email you when the map update is ready.";
});

const dialogTitle = computed(() => {
  if (phase.value === "running") return "Inferring locations…";
  if (phase.value === "completed") return "Analysis complete";
  if (phase.value === "failed") return "Analysis failed";
  return "AI Location Inference";
});

const headerIcon = computed(() => {
  if (phase.value === "completed") return CheckmarkCircleOutline;
  if (phase.value === "failed") return CloseCircleOutline;
  return SparklesOutline;
});
</script>

<style scoped>
.ai-location-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ai-location-card {
  width: min(600px, 100%);
}

@media (max-width: 639px) {
  .ai-location-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .ai-location-card {
    width: 100%;
    height: 100%;
    border-radius: 0 !important;
    overflow-y: auto;
  }
}

.ai-location-fade-enter-active,
.ai-location-fade-leave-active {
  transition: opacity 0.2s ease;
}

.ai-location-fade-enter-from,
.ai-location-fade-leave-to {
  opacity: 0;
}

.ai-location-modal-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
}

.ai-location-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Hero ─────────────────────────────────────────────────── */

.ail-hero {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 14px 16px;
  /* background:
    radial-gradient(
      600px 200px at 10% 0%,
      color-mix(in srgb, var(--primary-color) 14%, transparent),
      transparent 60%
    ),
    radial-gradient(
      600px 200px at 90% 0%,
      color-mix(in srgb, var(--accent-color) 14%, transparent),
      transparent 60%
    ),
    var(--bg-surface); */
  border: 1px solid var(--border-color);
}

.ail-hero-globe {
  position: absolute;
  right: -24px;
  top: 50%;
  transform: translateY(-50%);
  width: 140px;
  height: 140px;
  opacity: 0.3;
  color: var(--primary-color);
  pointer-events: none;
}

.ail-badge {
  margin-bottom: 8px !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 11px !important;
}

.ail-hero-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-primary);
}

/* ── Cards ────────────────────────────────────────────────── */

.ail-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ail-cards--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.ail-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.ail-card span {
  color: var(--text-secondary);
  font-size: 12px;
}

.ail-card strong {
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1.2;
}

/* ── All located banner ───────────────────────────────────── */

.ail-all-located-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--success-color) 7%, var(--bg-surface));
  border: 1px solid color-mix(in srgb, var(--success-color) 28%, transparent);
  border-radius: 12px;
}

.ail-all-located-icon {
  flex-shrink: 0;
}

.ail-all-located-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ail-all-located-headline {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.ail-all-located-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── Credits row ──────────────────────────────────────────── */

.ail-credits-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 13px;
}

.ail-credits-row span {
  color: var(--text-secondary);
}

.ail-credits-row strong {
  color: var(--text-primary);
}

/* ── Notices ──────────────────────────────────────────────── */

.ail-notices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ail-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 12px;
  border-left: 3px solid;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ail-notice--info {
  background: color-mix(in srgb, var(--info-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--info-color) 45%, transparent);
}

.ail-notice--warning {
  background: color-mix(in srgb, var(--error-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--error-color) 45%, transparent);
}

.ail-warning-confirm {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ail-warning-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  user-select: none;
}

.ail-notice-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.ail-notice--multi {
  flex-direction: column;
  gap: 8px;
}

.ail-notice-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

/* ── Progress ─────────────────────────────────────────────── */

.ail-progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.ail-analyzing-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text-secondary);
}

.ail-analyzing-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.ail-progress-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.ail-progress-meta strong {
  color: var(--text-primary);
}

/* Indeterminate progress bar (LLM phase) */
.ail-indeterminate-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  overflow: hidden;
}

.ail-indeterminate-bar {
  height: 100%;
  width: 40%;
  border-radius: 2px;
  background: var(--accent-color);
  animation: ail-slide 1.6s ease-in-out infinite;
}

@keyframes ail-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}

.ail-copy {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* ── Success banner ─────────────────────────────────────────── */

.ail-success-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: color-mix(in srgb, var(--success-color) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--success-color) 30%, transparent);
  border-radius: 12px;
}

.ail-success-icon {
  flex-shrink: 0;
}

.ail-success-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ail-success-headline {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.ail-success-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.ail-card--located {
  background: color-mix(in srgb, var(--success-color) 6%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--success-color) 25%, transparent);
}

.ail-card-check {
  margin-bottom: 2px;
}

/* ── Error banner ────────────────────────────────────────────── */

.ail-error-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: color-mix(in srgb, var(--error-color) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--error-color) 30%, transparent);
  border-radius: 12px;
}

.ail-error-icon {
  flex-shrink: 0;
}

.ail-error-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ail-error-headline {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.ail-error-sub {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── Forecast panel ───────────────────────────────────────── */

.ail-forecast-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ail-forecast-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ail-forecast-title-count {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
  margin-right: 4px;
}

.ail-forecast-subtitle {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ail-forecast-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ail-forecast-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.ail-forecast-cell--good {
  background: color-mix(in srgb, var(--success-color) 5%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--success-color) 22%, transparent);
}

.ail-forecast-cell--medium {
  background: color-mix(in srgb, var(--warning-color) 5%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--warning-color) 22%, transparent);
}

.ail-forecast-cell--poor {
  background: color-mix(in srgb, var(--error-color) 5%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--error-color) 22%, transparent);
}

.ail-forecast-cell--skeleton {
  background: transparent;
  border-color: var(--border-color);
  opacity: 0.6;
}

/* Loader while calculating */
.ail-forecast-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 0 6px;
}

.ail-forecast-loader-text {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Fade-in when real forecast appears */
.ail-forecast-grid:not(:has(.ail-forecast-cell--skeleton)) {
  animation: ail-forecast-fadein 0.4s ease both;
}

@keyframes ail-forecast-fadein {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ail-forecast-cell-top {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 2px;
}

.ail-forecast-pct {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.ail-forecast-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.ail-forecast-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.ail-forecast-hint {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
  opacity: 0.75;
}

/* ── Limit slider ─────────────────────────────────────────── */

.ail-limit-row {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.ail-limit-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ail-limit-info {
  display: inline-flex;
  align-items: center;
  cursor: help;
  flex-shrink: 0;
}

.ail-limit-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ail-limit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
}

.ail-limit-sub {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 400;
}

/* ── Footer actions ───────────────────────────────────────── */

.ai-location-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ai-location-actions--centered {
  justify-content: center;
}
</style>
