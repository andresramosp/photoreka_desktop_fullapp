<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { NIcon } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloudUploadOutline,
  MailOutline,
  WarningOutline,
} from "@vicons/ionicons5";
import PicksProgressBar from "./PicksProgressBar.vue";
import PicksScoreRing from "./PicksScoreRing.vue";
import { formatCount, formatDuration, formatEta } from "@/utils/picks/format";
import { formatScore } from "@/utils/picks/ranking";
import type {
  PicksJudgingState,
  PicksPhoto,
  PicksTransferState,
  RankedPhoto,
} from "@/utils/picks/types";

const props = defineProps<{
  transfer: PicksTransferState;
  judging: PicksJudgingState;
  uploadFinished: boolean;
  /** Free trials send no email, so the tab is where the verdict shows up. */
  trial?: boolean;
  recent: { photo: PicksPhoto; score: number | null }[];
  leaders: RankedPhoto[];
}>();

// The wall keeps a fixed set of slots: one per photo when there are few, or a
// whole number of full rows. Verdicts fill the slots instead of reshaping it.
const WALL_ROWS = 4;
const TILE_MIN = 92;
const TILE_MAX = 160;
const TILE_GAP = 8;

const wall = ref<HTMLElement | null>(null);
const wallWidth = ref(0);
let wallObserver: ResizeObserver | null = null;
onMounted(() => {
  if (!wall.value) return;
  wallObserver = new ResizeObserver(([entry]) => (wallWidth.value = entry.contentRect.width));
  wallObserver.observe(wall.value);
});
onBeforeUnmount(() => wallObserver?.disconnect());

const maxColumns = computed(() =>
  Math.max(1, Math.floor((wallWidth.value + TILE_GAP) / (TILE_MIN + TILE_GAP))),
);
const slots = computed(() => {
  const capacity = maxColumns.value * WALL_ROWS;
  return props.transfer.total > 0 ? Math.min(props.transfer.total, capacity) : capacity;
});
// Few photos: rows of equal length (10 photos → 2 × 5) rather than 8 + 2.
const columns = computed(() =>
  Math.ceil(slots.value / Math.ceil(slots.value / maxColumns.value)),
);
const wallStyle = computed(() => ({
  gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))`,
  maxWidth: `${columns.value * TILE_MAX + (columns.value - 1) * TILE_GAP}px`,
}));
const shown = computed(() => props.recent.slice(0, slots.value));
const skeletons = computed(() => Math.max(0, slots.value - shown.value.length));
const MIN_SAMPLES_FOR_ETA = 8;

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 500)));
onBeforeUnmount(() => clock && clearInterval(clock));

const total = computed(() => props.transfer.total);
const percent = computed(() =>
  props.judging.done || total.value === 0
    ? 100
    : (props.judging.judged / total.value) * 100,
);
const uploadPercent = computed(() =>
  total.value
    ? ((props.transfer.uploaded + props.transfer.failed) / total.value) * 100
    : 0,
);

const stageLabel = computed(() => {
  if (props.judging.done) return "Verdict ready";
  if (!props.uploadFinished) return "Uploading and judging";
  return "The jury is deliberating";
});

const startedAt = computed(() => props.transfer.startedAt ?? props.judging.startedAt);
const elapsed = computed(() => formatDuration(now.value - startedAt.value));

function remainingMs(done: number, since: number | null): number | null {
  if (!since || done < MIN_SAMPLES_FOR_ETA) return null;
  const rate = done / Math.max(1, now.value - since);
  return (total.value - done) / rate;
}

const uploadEta = computed(() =>
  props.uploadFinished
    ? 0
    : remainingMs(props.transfer.uploaded + props.transfer.failed, props.transfer.startedAt),
);

// Judging can never finish before the upload does.
const eta = computed(() => {
  const judging = remainingMs(props.judging.judged, props.judging.startedAt);
  if (judging === null || uploadEta.value === null) return null;
  return Math.max(judging, uploadEta.value);
});

const isStandout = (score: number | null) => (score ?? 0) >= 7.5;
</script>

<template>
  <section class="pk-processing">
    <header class="pk-proc-head">
      <p class="pk-eyebrow pk-stage-label">
        <span class="pk-live-dot" />
        {{ stageLabel }}
      </p>
      <h1 class="pk-proc-title">Developing your <em>picks</em></h1>
    </header>

    <div class="pk-proc-progress">
      <div class="pk-proc-counter">
        <span class="pk-proc-num">{{ formatCount(judging.judged) }}</span>
        <span class="pk-proc-of">of {{ formatCount(total) }} photos judged</span>
        <span class="pk-proc-percent">{{ Math.floor(percent) }}%</span>
      </div>
      <PicksProgressBar :percent="percent" />
      <div class="pk-proc-meta">
        <span>Elapsed <strong>{{ elapsed }}</strong></span>
        <span>Time left <strong>{{ formatEta(eta) }}</strong></span>
      </div>

      <div class="pk-upload-track" :class="{ 'is-done': uploadFinished }">
        <div class="pk-upload-head">
          <n-icon :size="15">
            <CheckmarkCircleOutline v-if="uploadFinished" />
            <CloudUploadOutline v-else />
          </n-icon>
          <span v-if="uploadFinished">
            All {{ formatCount(transfer.uploaded) }} photos uploaded
          </span>
          <span v-else>
            Uploading <strong>{{ formatCount(transfer.uploaded) }}</strong>
            of {{ formatCount(total) }}
          </span>
          <span v-if="transfer.failed" class="pk-upload-failed">
            {{ formatCount(transfer.failed) }} could not be read
          </span>
        </div>
        <PicksProgressBar :percent="uploadPercent" variant="upload" />
      </div>

      <Transition name="pk-notice" mode="out-in">
        <div v-if="!uploadFinished" key="keep" class="pk-notice is-warning">
          <n-icon :size="18"><WarningOutline /></n-icon>
          <span>
            Keep this tab open while your photos upload
            <template v-if="uploadEta">({{ formatEta(uploadEta) }})</template>.
            <template v-if="!trial">After that you can close it.</template>
          </span>
        </div>
        <div v-else-if="trial" key="trial" class="pk-notice">
          <n-icon :size="18"><MailOutline /></n-icon>
          <span>Your free verdict appears right here in a moment.</span>
        </div>
        <div v-else key="free" class="pk-notice">
          <n-icon :size="18"><MailOutline /></n-icon>
          <span>
            You can close this tab now: we will email you a private link when
            the ranking is ready.
          </span>
        </div>
      </Transition>
    </div>

    <div class="pk-proc-body">
      <div ref="wall" class="pk-wall-wrap">
        <div class="pk-panel-label">Freshly judged</div>
        <TransitionGroup v-if="wallWidth > 0" tag="div" name="pk-dev" class="pk-wall" :style="wallStyle">
          <div
            v-for="item in shown"
            :key="item.photo.id"
            class="pk-wall-tile"
            :class="{ 'is-standout': isStandout(item.score) }"
          >
            <img :src="item.photo.thumbUrl" alt="" loading="lazy" />
            <span class="pk-wall-score">{{ formatScore(item.score) }}</span>
          </div>
          <div
            v-for="i in skeletons"
            :key="`skeleton-${i}`"
            class="pk-wall-tile is-skeleton"
            :style="{ animationDelay: `${(i % columns) * 120}ms` }"
          />
        </TransitionGroup>
      </div>

      <aside class="pk-leaders">
        <div class="pk-panel-label">Leading so far</div>
        <TransitionGroup v-if="leaders.length" tag="ol" name="pk-lead" class="pk-leaders-list">
          <li v-for="item in leaders" :key="item.photo.id" class="pk-leader">
            <span class="pk-leader-rank">{{ item.rank }}</span>
            <img class="pk-leader-thumb" :src="item.photo.thumbUrl" alt="" />
            <span class="pk-leader-name">{{ item.photo.name }}</span>
            <PicksScoreRing :value="item.score" :size="38" :stroke="3" />
          </li>
        </TransitionGroup>
        <p v-else class="pk-leaders-empty">
          The first verdicts will appear here in a moment.
        </p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.pk-processing {
  max-width: 1160px;
  margin: 0 auto;
  padding: clamp(24px, 6vh, 64px) clamp(16px, 4vw, 48px) 64px;
}

.pk-proc-head {
  text-align: center;
}

.pk-stage-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.pk-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pk-gold);
  box-shadow: 0 0 0 0 rgba(244, 183, 64, 0.6);
  animation: pk-live 1.6s ease-out infinite;
}

@keyframes pk-live {
  to {
    box-shadow: 0 0 0 10px rgba(244, 183, 64, 0);
  }
}

.pk-proc-title {
  margin: 14px 0 0;
  font-family: var(--pk-serif);
  font-weight: 400;
  font-size: clamp(38px, 5.6vw, 68px);
  letter-spacing: -0.03em;
  line-height: 1;
}

.pk-proc-title em {
  font-style: italic;
  font-weight: 300;
  background: var(--pk-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  padding-right: 0.06em;
}

.pk-proc-progress {
  max-width: 760px;
  margin: 44px auto 0;
}

.pk-proc-counter {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.pk-proc-num {
  font-family: var(--pk-serif);
  font-size: 44px;
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: lining-nums tabular-nums;
}

.pk-proc-of {
  color: var(--pk-text-2);
  font-size: 14px;
}

.pk-proc-percent {
  margin-left: auto;
  font-family: var(--pk-serif);
  font-style: italic;
  font-size: 26px;
  color: var(--pk-gold-2);
  font-variant-numeric: lining-nums tabular-nums;
}

.pk-proc-meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-proc-meta strong {
  color: var(--pk-text-2);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.pk-proc-body {
  margin-top: 40px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
}

.pk-panel-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pk-text-3);
  margin-bottom: 14px;
}

.pk-wall-wrap,
.pk-leaders {
  padding: 20px;
  border-radius: 22px;
  background: var(--pk-panel);
  border: 1px solid var(--pk-line);
  backdrop-filter: blur(16px);
}

.pk-wall {
  display: grid;
  gap: 8px;
  margin: 0 auto;
}

.pk-wall-tile {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.pk-wall-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  animation: pk-develop 1.8s var(--pk-ease) both;
}

.pk-wall-tile.is-standout {
  box-shadow:
    0 0 0 1.5px rgba(244, 183, 64, 0.9),
    0 0 24px rgba(244, 183, 64, 0.35);
}

.pk-wall-score {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  font-family: var(--pk-serif);
  font-size: 12px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  animation: pk-fade-up 0.6s 0.9s var(--pk-ease) both;
}

.is-standout .pk-wall-score {
  color: #1a1206;
  background: var(--pk-gold-gradient);
}

.pk-wall-tile.is-skeleton {
  animation: pk-skeleton 1.6s ease-in-out infinite;
}

@keyframes pk-develop {
  from {
    filter: grayscale(1) blur(8px) brightness(0.4) contrast(1.4);
    transform: scale(1.08);
  }
  55% {
    filter: grayscale(0.5) blur(2px) brightness(0.8) contrast(1.15);
  }
  to {
    filter: none;
    transform: scale(1);
  }
}

@keyframes pk-fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}

@keyframes pk-skeleton {
  50% {
    background: rgba(255, 255, 255, 0.09);
  }
}

.pk-dev-enter-from {
  opacity: 0;
  transform: scale(0.85);
}
.pk-dev-enter-active {
  transition:
    opacity 0.5s var(--pk-ease),
    transform 0.5s var(--pk-ease);
}
.pk-dev-move {
  transition: transform 0.6s var(--pk-ease);
}
.pk-dev-leave-active {
  display: none;
}

.pk-leaders-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  position: relative;
}

.pk-leader {
  display: grid;
  grid-template-columns: 22px 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}

.pk-leader:first-child {
  background: linear-gradient(90deg, rgba(244, 183, 64, 0.14), rgba(244, 183, 64, 0.02));
}

.pk-leader-rank {
  font-family: var(--pk-serif);
  font-style: italic;
  font-size: 20px;
  text-align: center;
  color: var(--pk-gold-2);
}

.pk-leader-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 9px;
  display: block;
}

.pk-leader-name {
  font-size: 12px;
  color: var(--pk-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pk-lead-move,
.pk-lead-enter-active,
.pk-lead-leave-active {
  transition:
    transform 0.6s var(--pk-ease),
    opacity 0.4s var(--pk-ease);
}
.pk-lead-enter-from,
.pk-lead-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
.pk-lead-leave-active {
  position: absolute;
  width: 100%;
}

.pk-leaders-empty {
  margin: 0;
  font-size: 13px;
  color: var(--pk-text-3);
  line-height: 1.6;
}

.pk-upload-track {
  margin-top: 18px;
}

.pk-upload-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-upload-head strong {
  color: var(--pk-text-2);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.pk-upload-head .n-icon {
  color: #22d3ee;
}

.pk-upload-track.is-done .n-icon {
  color: #4ade80;
}

.pk-upload-failed {
  margin-left: auto;
  color: rgba(251, 146, 60, 0.85);
}

.pk-notice {
  margin-top: 18px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pk-text-2);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--pk-line);
}

.pk-notice .n-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--pk-text-3);
}

.pk-notice.is-warning {
  color: rgba(255, 228, 170, 0.92);
  background: rgba(244, 183, 64, 0.08);
  border-color: rgba(244, 183, 64, 0.3);
}

.pk-notice.is-warning .n-icon {
  color: var(--pk-gold);
}

.pk-notice-enter-active,
.pk-notice-leave-active {
  transition:
    opacity 0.4s var(--pk-ease),
    transform 0.4s var(--pk-ease);
}
.pk-notice-enter-from,
.pk-notice-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (max-width: 860px) {
  .pk-proc-body {
    grid-template-columns: 1fr;
  }
}
</style>
