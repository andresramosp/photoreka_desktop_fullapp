<template>
  <Teleport to="body">
    <Transition name="ai-location-fade">
      <div
        v-if="show"
        class="ai-location-backdrop"
        @click.self="emit('update:show', false)"
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
                <span
                  >{{ status?.processed || 0 }} / {{ status?.total || 0 }}</span
                >
                <strong>{{ progress }}%</strong>
              </div>
              <n-progress
                type="line"
                :percentage="progress"
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
                  Our AI engine will inspect photos without GPS metadata, infer
                  a city or region from visual context (environment, signs,
                  landmarks, etc.), and place only reliable matches on your map.
                </p>
              </div>

              <div
                v-if="photosWithoutLocation === 0"
                class="ail-all-located-banner"
              >
                <n-icon
                  :component="CheckmarkCircleOutline"
                  size="20"
                  :color="'var(--success-color)'"
                  class="ail-all-located-icon"
                />
                <div class="ail-all-located-text">
                  <span class="ail-all-located-headline"
                    >No photos found to infer location</span
                  >
                  <span class="ail-all-located-sub"
                    >It seems all your photos already have a location, or we
                    couldn't infer their location in a previous analysis. Upload
                    new photos to the app and run the analysis on them.</span
                  >
                </div>
              </div>

              <div v-else class="ail-cards">
                <div class="ail-card">
                  <span>Photos without location</span>
                  <strong>{{ photosWithoutLocation }}</strong>
                </div>
                <div class="ail-card">
                  <span>Estimated cost</span>
                  <strong>{{ estimatedCredits }} credits</strong>
                </div>
              </div>

              <!-- ── Forecast panel ─────────────────────────────────── -->
              <template
                v-if="
                  photosWithoutLocation > 0 && (forecastReady || !timerElapsed)
                "
              >
                <!-- Loader while the fake calculation runs -->
                <template v-if="!forecastReady">
                  <div class="ail-forecast-loader">
                    <n-spin size="small" :stroke-width="16" />
                    <span class="ail-forecast-loader-text"
                      >Analysing your photos…</span
                    >
                  </div>
                </template>
              </template>
              <template
                v-if="photosWithoutLocation > 0 && forecastReady && forecast"
              >
                <div class="ail-forecast-header">
                  <n-icon
                    :component="TrendingUpOutline"
                    size="14"
                    :color="'var(--text-secondary)'"
                  />
                  <span class="ail-forecast-title">Geolocation forecast</span>
                </div>

                <!-- <p class="ail-forecast-subtitle">
                  Estimated from each photo's genre, lighting, focus, framing
                  and palette. Outdoor, well-lit, wide-frame shots score
                  highest.
                </p> -->

                <div class="ail-forecast-grid">
                  <!-- Good -->
                  <div class="ail-forecast-cell ail-forecast-cell--good">
                    <div class="ail-forecast-cell-top">
                      <n-icon
                        :component="CheckmarkCircleOutline"
                        size="15"
                        :color="'var(--success-color)'"
                      />
                      <span class="ail-forecast-pct">{{
                        forecast.good.count
                      }}</span>
                    </div>
                    <span class="ail-forecast-label">Good chances</span>
                    <span class="ail-forecast-hint"
                      >Outdoor, natural light, sharp, wide frame</span
                    >
                  </div>

                  <!-- Medium -->
                  <div class="ail-forecast-cell ail-forecast-cell--medium">
                    <div class="ail-forecast-cell-top">
                      <n-icon
                        :component="HelpCircleOutline"
                        size="15"
                        :color="'var(--warning-color)'"
                      />
                      <span class="ail-forecast-pct">{{
                        forecast.medium.count
                      }}</span>
                    </div>
                    <span class="ail-forecast-label">Possible</span>
                    <span class="ail-forecast-hint"
                      >Mixed cues, result uncertain</span
                    >
                  </div>

                  <!-- Poor -->
                  <div class="ail-forecast-cell ail-forecast-cell--poor">
                    <div class="ail-forecast-cell-top">
                      <n-icon
                        :component="RemoveCircleOutline"
                        size="15"
                        :color="'var(--error-color)'"
                      />
                      <span class="ail-forecast-pct">{{
                        forecast.poor.count
                      }}</span>
                    </div>
                    <span class="ail-forecast-label">Unlikely</span>
                    <span class="ail-forecast-hint"
                      >Studio, indoor, abstract, blurry</span
                    >
                  </div>
                </div>

                <!-- Low-success warning -->
                <div
                  v-if="forecast.lowSuccessWarning"
                  class="ail-notice ail-notice--warning"
                >
                  <n-icon
                    :component="WarningOutline"
                    size="15"
                    :color="'var(--warning-color)'"
                    class="ail-notice-icon"
                  />
                  <span>
                    Most of your photos have low geolocation potential.
                    <strong>Credits will still be charged</strong> even when the
                    AI cannot infer a location. We recommend proceeding only if
                    you understand this.
                  </span>
                </div>
              </template>

              <div
                v-if="photosWithoutLocation > 0 && forecastReady"
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
                      <strong>imprecise</strong>; you can always
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
                :disabled="photosWithoutLocation === 0"
                :loading="isStarting"
                @click="emit('start')"
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
                :disabled="photosWithoutLocation === 0"
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
  HelpCircleOutline,
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
  error?: string;
}

export interface GeolocatabilityForecast {
  total: number;
  good: { count: number; percentage: number };
  medium: { count: number; percentage: number };
  poor: { count: number; percentage: number };
  lowSuccessWarning: boolean;
}

const props = defineProps<{
  show: boolean;
  photosWithoutLocation: number;
  estimatedCredits: number;
  status: AiLocationJobStatus | null;
  isStarting: boolean;
  forecast: GeolocatabilityForecast | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  start: [];
}>();

// ── Fake forecast loader ──────────────────────────────────────────────
const timerElapsed = ref(false);
let forecastTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.show,
  (val) => {
    if (forecastTimer) clearTimeout(forecastTimer);
    if (val && props.photosWithoutLocation > 0) {
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

const progress = computed(() => {
  const s = props.status;
  if (!s?.total) return 0;
  return Math.min(100, Math.round((s.processed / s.total) * 100));
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

  return "You can close this dialog. Photoreka will keep working in the background and email you when the map update is ready.";
});

const dialogTitle = computed(() => {
  if (phase.value === "running") return "Inferring locations…";
  if (phase.value === "completed") return "Analysis complete";
  if (phase.value === "failed") return "Analysis failed";
  return "AI location inference";
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
  width: min(500px, 100%);
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
  padding: 12px;
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

.ail-forecast-subtitle {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ail-forecast-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
