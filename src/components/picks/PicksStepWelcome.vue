<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { NIcon } from "naive-ui";
import {
  AddOutline,
  CheckmarkOutline,
  CloudUploadOutline,
  FolderOpenOutline,
  ImagesOutline,
  SparklesOutline,
} from "@vicons/ionicons5";
import {
  PICKS_CRITERIA,
  PICKS_FREE_TRIAL_PHOTOS,
  PICKS_JURIES,
  PICKS_MAX_PHOTOS,
  PICKS_PRICE_PER_PHOTO_EUR,
  PICKS_RETENTION_DAYS,
  computePicksPriceEur,
} from "@/config/picks";
import {
  collectDroppedSources,
  originalsSupported,
  pickPhotoFiles,
  pickPhotoFolder,
  sourcesFromFiles,
} from "@/utils/picks/fsAccess";
import { formatCount, formatEur } from "@/utils/picks/format";
import type { PicksSource } from "@/utils/picks/types";

const props = defineProps<{ files: PicksSource[]; trial: boolean }>();
const emit = defineEmits<{
  add: [sources: PicksSource[]];
  clear: [];
  continue: [];
  "update:trial": [on: boolean];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const collecting = ref(false);
let dragDepth = 0;

const hasFiles = computed(() => props.files.length > 0);
const canAddMore = computed(() => !props.trial || props.files.length < PICKS_FREE_TRIAL_PHOTOS);
const price = computed(() => computePicksPriceEur(props.files.length));

const trialIncludes = [
  `Scores on ${PICKS_CRITERIA.length} artistic criteria`,
  "A short critique for every photo",
  `${PICKS_JURIES.length} juries to rank them`,
  "No card, no account",
];

const includes = [
  `Scores on ${PICKS_CRITERIA.length} artistic criteria`,
  "A short critique for every photo",
  `${PICKS_JURIES.length} juries to rank them`,
  `Private link for ${PICKS_RETENTION_DAYS} days + CSV export`,
  ...(originalsSupported ? ["Your originals, one click away from the ranking"] : []),
];

const PRINT_COUNT = 5;
const printUrls = ref<string[]>([]);

watch(
  () => props.files.slice(0, PRINT_COUNT),
  (sample) => {
    printUrls.value.forEach((url) => URL.revokeObjectURL(url));
    printUrls.value = sample.map(({ file }) => URL.createObjectURL(file));
  },
  { immediate: true },
);

onBeforeUnmount(() => printUrls.value.forEach((url) => URL.revokeObjectURL(url)));

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) emit("add", sourcesFromFiles(Array.from(input.files)));
  input.value = "";
}

async function collect(read: () => Promise<PicksSource[] | null>) {
  collecting.value = true;
  try {
    const sources = await read();
    if (sources) emit("add", sources);
  } catch (error) {
    console.warn("[Picks] Could not read the selection", error);
  } finally {
    collecting.value = false;
  }
}

function chooseFiles() {
  if (originalsSupported) collect(pickPhotoFiles);
  else fileInput.value?.click();
}

function chooseFolder() {
  if (originalsSupported) collect(pickPhotoFolder);
  else folderInput.value?.click();
}

function onDragEnter() {
  dragDepth++;
  dragging.value = true;
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragging.value = false;
}

async function onDrop(event: DragEvent) {
  dragDepth = 0;
  dragging.value = false;
  if (!event.dataTransfer) return;
  const dataTransfer = event.dataTransfer;
  collect(() => collectDroppedSources(dataTransfer));
}

const printStyle = (i: number) => {
  const spread = Math.min(printUrls.value.length, PRINT_COUNT);
  const offset = i - (spread - 1) / 2;
  return {
    "--rot": `${offset * 7}deg`,
    "--tx": `${offset * 46}px`,
    "--ty": `${Math.abs(offset) * 10}px`,
    "--delay": `${i * 70}ms`,
    zIndex: String(10 - Math.abs(Math.round(offset))),
  };
};
</script>

<template>
  <section
    class="pk-welcome"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="pk-hero">
      <p class="pk-eyebrow pk-reveal">AI photo ranking · No account needed</p>
      <h1 class="pk-hero-title pk-reveal" style="--d: 80ms">
        Find your <em>best shots.</em>
      </h1>
      <p class="pk-hero-sub pk-reveal" style="--d: 160ms">
        Drop up to {{ formatCount(PICKS_MAX_PHOTOS) }} photos. An AI jury scores
        each one, writes a short critique and ranks them through the eyes of
        street, landscape or award juries.
      </p>
    </div>

    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp"
      hidden
      @change="onInputChange"
    />
    <input
      ref="folderInput"
      type="file"
      multiple
      webkitdirectory
      hidden
      @change="onInputChange"
    />

    <Transition name="pk-swap" mode="out-in">
      <div
        v-if="!hasFiles"
        key="drop"
        class="pk-drop pk-reveal"
        style="--d: 240ms"
        :class="{ 'is-dragging': dragging, 'is-busy': collecting }"
        @click="chooseFiles"
      >
        <div class="pk-drop-inner">
          <div class="pk-drop-icon">
            <n-icon :size="30"><CloudUploadOutline /></n-icon>
          </div>
          <div class="pk-drop-title">
            {{
              collecting
                ? "Reading your photos…"
                : trial
                  ? `Pick ${PICKS_FREE_TRIAL_PHOTOS} photos for your free trial`
                  : "Drop photos or a whole folder"
            }}
          </div>
          <div class="pk-drop-hint">
            {{
              trial
                ? "Free · no card · your verdict in about a minute"
                : "JPEG, PNG or WebP · originals never leave your device"
            }}
          </div>
          <div class="pk-drop-buttons" @click.stop>
            <button class="pk-btn pk-btn--light" @click="chooseFiles">
              <n-icon :size="16"><ImagesOutline /></n-icon>
              Choose photos
            </button>
            <button class="pk-btn" @click="chooseFolder">
              <n-icon :size="16"><FolderOpenOutline /></n-icon>
              Choose a folder
            </button>
          </div>
          <button v-if="!trial" class="pk-trial-pill" @click.stop="emit('update:trial', true)">
            <n-icon :size="15"><SparklesOutline /></n-icon>
            <span>Not sure yet? <strong>Try it free</strong> with {{ PICKS_FREE_TRIAL_PHOTOS }} photos</span>
          </button>
          <button v-else class="pk-link pk-trial-link" @click.stop="emit('update:trial', false)">
            Back to ranking your whole collection
          </button>
        </div>
      </div>

      <div v-else key="order" class="pk-order" :class="{ 'is-dragging': dragging }">
        <div class="pk-prints">
          <div
            v-for="(url, i) in printUrls"
            :key="url"
            class="pk-print"
            :style="printStyle(i)"
          >
            <img :src="url" alt="" />
          </div>
        </div>

        <div class="pk-order-card">
          <div class="pk-order-count">
            <span class="pk-order-num">{{ formatCount(files.length) }}</span>
            <span class="pk-order-label">
              {{
                trial
                  ? `of ${PICKS_FREE_TRIAL_PHOTOS} photos for your free trial`
                  : `photo${files.length === 1 ? "" : "s"} ready to be judged`
              }}
            </span>
          </div>

          <ul class="pk-order-includes">
            <li v-for="item in trial ? trialIncludes : includes" :key="item">
              <n-icon :size="15"><CheckmarkOutline /></n-icon>
              {{ item }}
            </li>
          </ul>

          <div class="pk-order-total">
            <span class="pk-order-price">{{ trial ? "Free" : formatEur(price) }}</span>
            <span class="pk-order-unit">
              {{ trial ? "one trial per day" : `${formatEur(PICKS_PRICE_PER_PHOTO_EUR)} per photo` }}
            </span>
          </div>

          <button class="pk-cta" @click="emit('continue')">
            {{ trial ? "Judge my photos free" : "Rank my photos" }}
          </button>

          <div class="pk-order-secondary">
            <template v-if="canAddMore">
              <button class="pk-link" @click="chooseFiles">
                <n-icon :size="14"><AddOutline /></n-icon>
                Add more
              </button>
              <span class="pk-dot" />
            </template>
            <template v-if="trial">
              <button class="pk-link" @click="emit('update:trial', false)">Rank all my photos instead</button>
              <span class="pk-dot" />
            </template>
            <button class="pk-link" @click="emit('clear')">Clear selection</button>
          </div>
        </div>
      </div>
    </Transition>

    <ol class="pk-steps pk-reveal" style="--d: 320ms">
      <li>
        <span class="pk-step-num">1</span>
        <span>Drop your photos</span>
      </li>
      <li>
        <span class="pk-step-num">2</span>
        <span>Pay only for what you upload</span>
      </li>
      <li>
        <span class="pk-step-num">3</span>
        <span>Explore your ranking</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.pk-welcome {
  position: relative;
  max-width: 1040px;
  margin: 0 auto;
  padding: clamp(32px, 9vh, 96px) clamp(16px, 4vw, 48px) 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.pk-hero {
  max-width: 780px;
}

.pk-hero-title {
  margin: 18px 0 0;
  font-family: var(--pk-serif);
  font-weight: 400;
  font-size: clamp(44px, 7.4vw, 92px);
  line-height: 0.98;
  letter-spacing: -0.035em;
  color: var(--pk-text);
  font-variation-settings: "opsz" 144;
}

.pk-hero-title em {
  font-style: italic;
  font-weight: 300;
  background: var(--pk-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  padding-right: 0.06em;
}

.pk-hero-sub {
  margin: 26px auto 0;
  max-width: 600px;
  font-size: clamp(15px, 1.6vw, 18px);
  line-height: 1.6;
  color: var(--pk-text-2);
  text-wrap: balance;
}

/* ── Drop zone ─────────────────────────────────────────────────────────── */

.pk-drop {
  --border-angle: 0deg;
  position: relative;
  width: 100%;
  max-width: 720px;
  margin-top: 48px;
  padding: 1.5px;
  border-radius: 28px;
  cursor: pointer;
  background: conic-gradient(
    from var(--border-angle),
    rgba(255, 255, 255, 0.08) 0deg,
    #22d3ee 60deg,
    #8b5cf6 140deg,
    #f59e0b 220deg,
    rgba(255, 255, 255, 0.08) 300deg
  );
  animation: pk-spin-border 7s linear infinite;
  transition: box-shadow 0.5s var(--pk-ease);
  box-shadow: 0 30px 80px -30px rgba(139, 92, 246, 0.35);
}

.pk-drop:hover,
.pk-drop.is-dragging {
  box-shadow: 0 40px 100px -30px rgba(245, 158, 11, 0.4);
}

.pk-drop.is-dragging {
  animation-duration: 1.6s;
}

.pk-drop-inner {
  border-radius: 27px;
  padding: clamp(36px, 6vw, 56px) 24px;
  background:
    radial-gradient(120% 140% at 50% 0%, rgba(139, 92, 246, 0.12), transparent 60%),
    rgba(10, 10, 14, 0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.pk-drop-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  color: var(--pk-gold-2);
  background: rgba(244, 183, 64, 0.1);
  border: 1px solid rgba(244, 183, 64, 0.25);
  margin-bottom: 8px;
}

.pk-drop-title {
  font-family: var(--pk-serif);
  font-size: clamp(22px, 2.6vw, 28px);
  letter-spacing: -0.01em;
}

.pk-drop-hint {
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-drop-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}

@property --border-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes pk-spin-border {
  to {
    --border-angle: 360deg;
  }
}

/* ── Order (files selected) ────────────────────────────────────────────── */

.pk-order {
  width: 100%;
  margin-top: 40px;
  display: grid;
  grid-template-columns: 1fr minmax(300px, 400px);
  align-items: center;
  gap: clamp(24px, 5vw, 64px);
  text-align: left;
  transition: transform 0.4s var(--pk-ease);
}

.pk-order.is-dragging {
  transform: scale(0.98);
}

.pk-prints {
  position: relative;
  height: clamp(240px, 32vw, 340px);
}

.pk-print {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(150px, 18vw, 210px);
  aspect-ratio: 4 / 5;
  padding: 8px 8px 30px;
  background: #f4f1ea;
  border-radius: 4px;
  box-shadow:
    0 24px 50px -12px rgba(0, 0, 0, 0.7),
    0 2px 6px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) rotate(var(--rot));
  /* backwards, not both: a filled-forwards animation would keep overriding the
     hover transition and the cards would jump instead of fanning out. */
  animation: pk-deal 0.8s var(--pk-ease) backwards;
  animation-delay: var(--delay);
  transition: transform 0.5s var(--pk-ease);
}

.pk-prints:hover .pk-print {
  transform: translate(-50%, -50%) translate(calc(var(--tx) * 1.5), calc(var(--ty) - 6px))
    rotate(calc(var(--rot) * 1.3));
}

.pk-print img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 2px;
}

@keyframes pk-deal {
  from {
    opacity: 0;
    transform: translate(-50%, -30%) rotate(0deg) scale(0.9);
  }
}

.pk-order-card {
  padding: 28px;
  border-radius: 24px;
  background: var(--pk-panel);
  border: 1px solid var(--pk-line);
  backdrop-filter: blur(20px);
  box-shadow: 0 30px 80px -40px rgba(0, 0, 0, 0.8);
}

.pk-order-count {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pk-order-num {
  font-family: var(--pk-serif);
  font-size: 56px;
  line-height: 1;
  letter-spacing: -0.03em;
  font-variant-numeric: lining-nums tabular-nums;
}

.pk-order-label {
  color: var(--pk-text-2);
  font-size: 14px;
}

.pk-order-includes {
  list-style: none;
  padding: 0;
  margin: 22px 0;
  display: grid;
  gap: 9px;
  font-size: 14px;
  color: var(--pk-text-2);
}

.pk-order-includes li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pk-order-includes .n-icon {
  color: var(--pk-gold);
}

.pk-order-total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 0;
  margin-bottom: 18px;
  border-top: 1px solid var(--pk-line);
  border-bottom: 1px solid var(--pk-line);
}

.pk-order-price {
  font-family: var(--pk-serif);
  font-size: 30px;
  letter-spacing: -0.02em;
}

.pk-order-unit {
  font-size: 12px;
  color: var(--pk-text-3);
}

.pk-order-card .pk-cta {
  width: 100%;
}

.pk-trial-link {
  margin-top: 14px;
  color: var(--pk-gold-2);
}

.pk-trial-link:hover {
  color: var(--pk-gold);
}

.pk-trial-pill {
  margin-top: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(244, 183, 64, 0.28);
  background: rgba(244, 183, 64, 0.07);
  color: var(--pk-text-2);
  font: 500 13px var(--pk-sans);
  cursor: pointer;
  transition:
    background 0.3s var(--pk-ease),
    border-color 0.3s var(--pk-ease),
    box-shadow 0.3s var(--pk-ease),
    color 0.3s var(--pk-ease);
}

.pk-trial-pill .n-icon {
  color: var(--pk-gold-2);
}

.pk-trial-pill strong {
  font-weight: 600;
  background: var(--pk-gold-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.pk-trial-pill:hover {
  color: var(--pk-text);
  border-color: rgba(244, 183, 64, 0.55);
  background: rgba(244, 183, 64, 0.12);
  box-shadow: 0 10px 30px -12px rgba(244, 183, 64, 0.5);
}

.pk-order-secondary {
  flex-wrap: wrap;
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

/* ── Steps ─────────────────────────────────────────────────────────────── */

.pk-steps {
  list-style: none;
  padding: 0;
  margin: 56px 0 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px 36px;
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-steps li {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pk-step-num {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--pk-line-strong);
  font-family: var(--pk-serif);
  font-size: 13px;
  color: var(--pk-text-2);
}

.pk-swap-enter-active,
.pk-swap-leave-active {
  transition:
    opacity 0.45s var(--pk-ease),
    transform 0.45s var(--pk-ease),
    filter 0.45s var(--pk-ease);
}
.pk-swap-enter-from,
.pk-swap-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
  filter: blur(6px);
}

@media (max-width: 760px) {
  .pk-order {
    grid-template-columns: 1fr;
  }
  .pk-prints {
    height: 230px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-drop {
    animation: none;
  }
}
</style>
