<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { NIcon } from "naive-ui";
import {
  ChevronBackOutline,
  ChevronForwardOutline,
  CloseOutline,
  DownloadOutline,
} from "@vicons/ionicons5";
import PicksScoreRing from "./PicksScoreRing.vue";
import { useLargeImage } from "@/utils/picks/imageSource";
import PicksScoreBars from "./PicksScoreBars.vue";
import PicksGenreTip from "./PicksGenreTip.vue";
import PicksTooltip from "./PicksTooltip.vue";
import {
  getPicksCriterion,
  getPicksGenreLabel,
  getPicksJury,
} from "@/config/picks";
import { formatCount } from "@/utils/picks/format";
import { originalsSupported } from "@/utils/picks/fsAccess";
import type { PicksRankingMode, RankedPhoto } from "@/utils/picks/types";

const props = defineProps<{
  items: RankedPhoto[];
  index: number;
  mode: PicksRankingMode;
  originalsAvailable: boolean;
}>();
const emit = defineEmits<{
  close: [];
  navigate: [index: number];
  "download-original": [photoId: string];
}>();

const current = computed(() => props.items[props.index]);
const largeImage = useLargeImage();
const jury = computed(() =>
  props.mode.kind === "jury" ? getPicksJury(props.mode.juryId) : null,
);
const contextLabel = computed(() =>
  props.mode.kind === "jury"
    ? `${jury.value?.label} jury`
    : `Ranked by ${getPicksCriterion(props.mode.criterion)?.label.toLowerCase()}`,
);

function go(delta: number) {
  const next = props.index + delta;
  if (next >= 0 && next < props.items.length) emit("navigate", next);
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
  else if (event.key === "ArrowRight") go(1);
  else if (event.key === "ArrowLeft") go(-1);
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="current" class="pk-detail">
    <Transition name="pk-ambient">
      <img
        :key="current.photo.id"
        class="pk-detail-ambient"
        :src="current.photo.thumbUrl"
        alt=""
      />
    </Transition>
    <div class="pk-detail-veil" @click="emit('close')" />

    <button class="pk-icon-btn pk-detail-close" @click="emit('close')">
      <n-icon :size="20"><CloseOutline /></n-icon>
    </button>

    <div class="pk-detail-layout">
      <div class="pk-detail-stage" @click.self="emit('close')">
        <button
          class="pk-icon-btn pk-detail-nav is-prev"
          :disabled="index === 0"
          @click="go(-1)"
        >
          <n-icon :size="22"><ChevronBackOutline /></n-icon>
        </button>
        <Transition name="pk-photo" mode="out-in">
          <img
            :key="current.photo.id"
            class="pk-detail-photo"
            :src="largeImage(current.photo)"
            :alt="current.photo.name"
          />
        </Transition>
        <button
          class="pk-icon-btn pk-detail-nav is-next"
          :disabled="index === items.length - 1"
          @click="go(1)"
        >
          <n-icon :size="22"><ChevronForwardOutline /></n-icon>
        </button>
      </div>

      <aside class="pk-detail-panel">
        <p class="pk-eyebrow">{{ contextLabel }}</p>

        <div class="pk-detail-rankrow">
          <div class="pk-detail-head">
            <div class="pk-detail-rank">
              <span class="pk-detail-no">No.</span>
              <span class="pk-detail-num">{{ current.rank }}</span>
              <span class="pk-detail-of">of {{ formatCount(items.length) }}</span>
            </div>
            <div v-if="current.photo.genres?.length" class="pk-detail-genres">
              <PicksTooltip v-for="genre in current.photo.genres" :key="genre">
                <template #trigger>
                  <span class="pk-detail-genre">{{ getPicksGenreLabel(genre) }}</span>
                </template>
                <PicksGenreTip :genre="genre" />
              </PicksTooltip>
            </div>
          </div>
          <PicksScoreRing :value="current.score" :size="84" :stroke="5" />
        </div>

        <blockquote
          v-if="current.photo.critique"
          :key="current.photo.id"
          class="pk-detail-critique"
        >
          {{ current.photo.critique }}
        </blockquote>

        <div class="pk-detail-section">Scores</div>
        <PicksScoreBars
          :key="current.photo.id"
          :scores="current.photo.scores"
          :weights="jury?.weights"
          :focus="mode.kind === 'criterion' ? mode.criterion : undefined"
        />

        <div v-if="current.photo.duplicates?.length" class="pk-detail-copies">
          <span class="pk-detail-copies-title">
            {{ current.photo.duplicates.length + 1 }} identical copies in your
            upload, judged once
          </span>
          <span class="pk-detail-copies-names">{{
            current.photo.duplicates.join(" · ")
          }}</span>
        </div>

        <div class="pk-detail-filerow">
          <p class="pk-detail-file">{{ current.photo.name }}</p>
          <button
            v-if="originalsAvailable"
            class="pk-btn pk-detail-original"
            @click="emit('download-original', current.photo.id)"
          >
            <n-icon :size="15"><DownloadOutline /></n-icon>
            Original
          </button>
        </div>
        <!-- Another browser, a private window or another device: the references stayed behind. -->
        <p
          v-if="!originalsAvailable && originalsSupported"
          class="pk-detail-originals-hint"
        >
          Originals can be downloaded from the browser you uploaded them from.
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.pk-detail {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  background: #050507;
}

.pk-detail-ambient {
  position: absolute;
  inset: -10%;
  width: 120%;
  height: 120%;
  object-fit: cover;
  filter: blur(70px) saturate(1.7) brightness(0.55);
  transform: scale(1.1);
}

.pk-detail-veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 40% 50%,
    transparent 0%,
    rgba(5, 5, 7, 0.65) 80%
  );
}

.pk-detail-close {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 3;
}

.pk-detail-layout {
  position: relative;
  z-index: 2;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  pointer-events: none;
}

.pk-detail-stage,
.pk-detail-panel {
  pointer-events: auto;
}

.pk-detail-stage {
  position: relative;
  display: grid;
  place-items: center;
  padding: clamp(20px, 4vw, 56px);
  min-height: 0;
}

.pk-detail-photo {
  max-width: 100%;
  max-height: calc(100vh - 2 * clamp(20px, 4vw, 56px));
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.95);
}

.pk-detail-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}
.pk-detail-nav.is-prev {
  left: 16px;
}
.pk-detail-nav.is-next {
  right: 16px;
}
.pk-detail-nav:disabled {
  opacity: 0.25;
  cursor: default;
}

.pk-detail-panel {
  overflow-y: auto;
  padding: 31px 32px 32px;
  background: rgba(10, 10, 14, 0.72);
  backdrop-filter: blur(24px) saturate(1.2);
  border-left: 1px solid var(--pk-line);
}

/* Shares the top band with the fixed close button. */
.pk-detail-panel > .pk-eyebrow {
  padding-right: 48px;
}

.pk-detail-rankrow {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.pk-detail-head {
  min-width: 0;
}

.pk-detail-rank {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.pk-detail-no {
  font-family: var(--pk-serif);
  font-style: italic;
  font-size: 22px;
  color: var(--pk-text-3);
}

.pk-detail-num {
  font-family: var(--pk-serif);
  font-weight: 300;
  font-size: 76px;
  line-height: 0.9;
  letter-spacing: -0.04em;
  background: var(--pk-gold-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-variant-numeric: lining-nums;
}

.pk-detail-of {
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-detail-genres {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pk-detail-genre {
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--pk-line-strong);
  font-size: 12px;
  color: var(--pk-text-2);
  cursor: help;
}

.pk-detail-critique {
  position: relative;
  margin: 24px 0 0;
  padding: 0 0 0 22px;
  font-family: var(--pk-serif);
  font-style: italic;
  font-weight: 300;
  font-size: 18px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.9);
  text-wrap: pretty;
  animation: pk-quote-in 0.7s var(--pk-ease) both;
}

.pk-detail-critique::before {
  content: "“";
  position: absolute;
  left: -4px;
  top: -14px;
  font-size: 56px;
  line-height: 1;
  color: var(--pk-gold);
  opacity: 0.8;
}

@keyframes pk-quote-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.pk-detail-section {
  margin: 32px 0 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pk-text-3);
}

.pk-detail-copies {
  margin-top: 24px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--pk-line);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pk-detail-copies-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--pk-text);
}

.pk-detail-copies-names {
  font-size: 12px;
  color: var(--pk-text-3);
  word-break: break-all;
}

.pk-detail-filerow {
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid var(--pk-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pk-detail-file {
  margin: 0;
  min-width: 0;
  font-size: 12px;
  color: var(--pk-text-3);
  word-break: break-all;
}

.pk-detail-originals-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pk-text-3);
}

.pk-detail-original {
  flex-shrink: 0;
  padding: 8px 14px;
}

.pk-ambient-enter-active,
.pk-ambient-leave-active {
  transition: opacity 0.8s var(--pk-ease);
}
.pk-ambient-leave-active {
  position: absolute;
}
.pk-ambient-enter-from,
.pk-ambient-leave-to {
  opacity: 0;
}

.pk-photo-enter-active,
.pk-photo-leave-active {
  transition:
    opacity 0.3s var(--pk-ease),
    transform 0.4s var(--pk-ease);
}
.pk-photo-enter-from {
  opacity: 0;
  transform: scale(0.97);
}
.pk-photo-leave-to {
  opacity: 0;
  transform: scale(1.02);
}

@media (max-width: 900px) {
  .pk-detail {
    overflow-y: auto;
  }
  .pk-detail-layout {
    grid-template-columns: 1fr;
    height: auto;
  }
  .pk-detail-stage {
    min-height: 60vh;
  }
  .pk-detail-photo {
    max-height: 60vh;
  }
  .pk-detail-panel {
    border-left: 0;
    border-top: 1px solid var(--pk-line);
    padding-top: 28px;
  }
}
</style>
