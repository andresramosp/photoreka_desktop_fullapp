<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NIcon, useDialog, useMessage } from "naive-ui";
import { DownloadOutline, RefreshOutline } from "@vicons/ionicons5";

import PicksBackdrop from "@/components/picks/PicksBackdrop.vue";
import PicksTopBar from "@/components/picks/PicksTopBar.vue";
import PicksStepWelcome from "@/components/picks/PicksStepWelcome.vue";
import PicksCheckoutModal from "@/components/picks/PicksCheckoutModal.vue";
import PicksStepProcessing from "@/components/picks/PicksStepProcessing.vue";
import PicksResults from "@/components/picks/PicksResults.vue";
import PicksPhotoDetail from "@/components/picks/PicksPhotoDetail.vue";
import PicksNoticeScreen from "@/components/picks/PicksNoticeScreen.vue";
import { usePicksFlow } from "@/composables/picks/usePicksFlow";
import { usePicksOriginals } from "@/composables/picks/usePicksOriginals";
import {
  getPicksCriterion,
  getPicksJury,
  PICKS_FREE_TRIAL_PHOTOS,
  PICKS_MAX_PHOTOS,
} from "@/config/picks";
import { buildRankingCsv, downloadCsv } from "@/utils/picks/exportCsv";
import { formatCount } from "@/utils/picks/format";
import { originalsSupported } from "@/utils/picks/fsAccess";
import { purgeExpiredOriginals } from "@/utils/picks/originalsStore";
import { apiErrorMessage } from "@/utils/picks/api";
import { PICKS_LARGE_IMAGE } from "@/utils/picks/imageSource";
import type { PicksSource } from "@/utils/picks/types";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
const DEMO_DEFAULT_COUNT = 400;

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();

const {
  step,
  files,
  token,
  sessionId,
  transfer,
  judging,
  uploading,
  uploadFinished,
  fatalError,
  trial,
  isTrialOrder,
  mode,
  ranked,
  juryCounts,
  judgedCount,
  recent,
  leaders,
  addFiles,
  clearFiles,
  setTrial,
  startUpload,
  startFreeTrial,
  confirmPayment,
  openOrder,
  loadDemo,
  reset,
} = usePicksFlow();

const originals = usePicksOriginals(sessionId);
const { access: originalsAccess } = originals;

provide(PICKS_LARGE_IMAGE, (photo) => originals.hiRes.get(photo.id) ?? photo.thumbUrl);

const scroller = ref<HTMLElement | null>(null);
const scrolled = ref(false);
const checkoutOpen = ref(false);
const checkoutError = ref<string | null>(null);
const openingOrder = ref(false);
const detailIndex = ref<number | null>(null);

const PODIUM_SIZE = 3;

// The podium and the open photo are shown large, so they get the original from
// disk; the grid tiles are small enough for the 800 px thumbnail.
watch(
  () => [
    originalsAccess.value,
    ...ranked.value.slice(0, PODIUM_SIZE).map((item) => item.photo.id),
    detailIndex.value === null ? null : ranked.value[detailIndex.value]?.photo.id,
  ],
  ([, ...ids]) => void originals.ensureHiRes(ids.filter((id): id is string => Boolean(id))),
);

const modeLabel = computed(() =>
  mode.value.kind === "jury"
    ? `${getPicksJury(mode.value.juryId).label} jury`
    : getPicksCriterion(mode.value.criterion)?.label ?? "Score",
);

function ensureFonts() {
  if (document.querySelector(`link[href="${FONTS_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONTS_HREF;
  document.head.appendChild(link);
}

// Closing the tab mid-upload loses the photos still on their way, so the
// browser asks first. Once uploaded, the job runs server-side on its own.
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!uploading.value) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => {
  ensureFonts();
  window.addEventListener("beforeunload", warnBeforeUnload);
  if (originalsSupported) void purgeExpiredOriginals();
  const demo = route.query.mock;
  if (import.meta.env.DEV && (demo === "results" || demo === "processing")) {
    loadDemo(demo, Number(route.query.count) || DEMO_DEFAULT_COUNT);
  } else if (typeof route.params.token === "string" && route.params.token) {
    void openFromLink(route.params.token);
  } else if (route.query.trial === "1") {
    // "Try it free" links from the landing open straight in trial mode.
    setTrial(true);
  }
});

// A link to an order that was never paid holds nothing: the photos stayed in
// the tab that picked them. The buyer just starts again.
async function openFromLink(orderToken: string) {
  openingOrder.value = true;
  try {
    if ((await openOrder(orderToken)) === "unpaid") await router.replace({ name: "picks" });
  } catch {
    // fatalError already explains it on screen.
  } finally {
    openingOrder.value = false;
  }
}

onBeforeUnmount(() => window.removeEventListener("beforeunload", warnBeforeUnload));

watch(step, (current) => {
  scroller.value?.scrollTo({ top: 0 });
  detailIndex.value = null;
  if (current === "results") void originals.refresh();
});

function onScroll() {
  scrolled.value = (scroller.value?.scrollTop ?? 0) > 8;
}

function onAddFiles(incoming: PicksSource[]) {
  const { rejected, overLimit } = addFiles(incoming);
  if (rejected > 0) {
    message.warning(`${formatCount(rejected)} file(s) skipped: only JPEG, PNG and WebP are supported.`);
  }
  if (overLimit > 0) {
    message.warning(
      trial.value
        ? `The free trial judges ${PICKS_FREE_TRIAL_PHOTOS} photos, so we kept the first ${PICKS_FREE_TRIAL_PHOTOS}.`
        : `Picks judges up to ${formatCount(PICKS_MAX_PHOTOS)} photos per order.`,
    );
  }
}

function onTrialChange(on: boolean) {
  const dropped = setTrial(on);
  if (dropped > 0) {
    message.info(`The free trial judges ${PICKS_FREE_TRIAL_PHOTOS} photos, so we kept the first ${PICKS_FREE_TRIAL_PHOTOS}.`);
  }
}

function onContinue() {
  if (trial.value) void beginFreeTrial();
  else openCheckout();
}

// The daily limit is checked here, before anything is uploaded; the selection
// stays, so the buyer can switch to a paid order in one click.
async function beginFreeTrial() {
  try {
    await startFreeTrial();
    if (token.value) void router.replace({ name: "picks", params: { token: token.value } });
  } catch (error) {
    const limited = (error as any)?.response?.status === 429;
    message.warning(
      limited
        ? `${apiErrorMessage(error, "No free trials left today.")} You can still rank these photos with a paid order.`
        : apiErrorMessage(error, "The free trial could not start. Please try again."),
      { duration: 8000 },
    );
  }
}

// The upload starts as soon as the user shows intent to buy, so most of it is
// done by the time the card form is filled in.
function openCheckout() {
  checkoutOpen.value = true;
  checkoutError.value = null;
  startUpload().catch((error) => {
    checkoutError.value = apiErrorMessage(error, "Your order could not be opened. Please try again.");
  });
}

// The private link goes into the URL right away, so a reload or a bookmark
// lands back on this order.
function onPaid() {
  checkoutOpen.value = false;
  confirmPayment();
  if (token.value) void router.replace({ name: "picks", params: { token: token.value } });
}

function openPhoto(photoId: string) {
  const index = ranked.value.findIndex((item) => item.photo.id === photoId);
  if (index >= 0) detailIndex.value = index;
}

function exportCsv() {
  const slug = modeLabel.value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  downloadCsv(buildRankingCsv(ranked.value, modeLabel.value), `photoreka-picks-${slug}.csv`);
}

async function downloadOriginal(photoId: string) {
  try {
    const result = await originals.downloadOriginal(photoId);
    if (result === "missing") {
      message.warning("This original was moved or deleted since you picked it, so it can no longer be read.");
    }
    if (result === "denied") {
      message.warning("Picks needs permission to read your originals to download them.");
    }
  } catch (error) {
    console.error("[Picks] Downloading the original failed", error);
    message.error("The original could not be downloaded.");
  }
}

function confirmStartOver() {
  dialog.warning({
    title: "Start a new ranking?",
    content: "This clears the current ranking from this tab. Your private link keeps working.",
    positiveText: "Start over",
    negativeText: "Cancel",
    onPositiveClick: startOver,
  });
}

function startOver() {
  reset();
  void router.replace({ name: "picks" });
}
</script>

<template>
  <div
    ref="scroller"
    class="picks-root"
    :class="{ 'is-locked': detailIndex !== null }"
    @scroll.passive="onScroll"
  >
    <PicksBackdrop :calm="step === 'results'" />

    <div class="pk-content">
      <PicksTopBar :solid="scrolled">
        <template v-if="step === 'results'">
          <button class="pk-btn" @click="exportCsv">
            <n-icon :size="16"><DownloadOutline /></n-icon>
            <span class="pk-hide-sm">Download</span> CSV
          </button>
          <button class="pk-btn" @click="confirmStartOver">
            <n-icon :size="16"><RefreshOutline /></n-icon>
            <span class="pk-hide-sm">New ranking</span>
          </button>
        </template>
      </PicksTopBar>

      <Transition name="pk-step" mode="out-in">
        <PicksNoticeScreen
          v-if="fatalError"
          key="error"
          eyebrow="Something went wrong"
          title="We could not open this ranking"
          :text="fatalError"
          action="Start a new ranking"
          @action="startOver"
        />
        <PicksNoticeScreen
          v-else-if="openingOrder"
          key="opening"
          eyebrow="Your private link"
          title="Opening your ranking…"
          loading
        />
        <PicksStepWelcome
          v-else-if="step === 'welcome'"
          :files="files"
          :trial="trial"
          @add="onAddFiles"
          @clear="clearFiles"
          @continue="onContinue"
          @update:trial="onTrialChange"
        />
        <PicksStepProcessing
          v-else-if="step === 'processing' && judging"
          :transfer="transfer"
          :judging="judging"
          :upload-finished="uploadFinished"
          :trial="isTrialOrder"
          :recent="recent"
          :leaders="leaders"
        />
        <PicksResults
          v-else-if="step === 'results'"
          v-model:mode="mode"
          :ranked="ranked"
          :judged-count="judgedCount"
          :jury-counts="juryCounts"
          :scroller="scroller"
          :trial="isTrialOrder"
          @open="openPhoto"
          @upgrade="startOver"
        />
      </Transition>
    </div>

    <PicksCheckoutModal
      :show="checkoutOpen"
      :photo-count="files.length"
      :transfer="transfer"
      :upload-finished="uploadFinished"
      :token="token"
      :open-error="checkoutError"
      @close="checkoutOpen = false"
      @paid="onPaid"
    />

    <Transition name="pk-fade">
      <PicksPhotoDetail
        v-if="detailIndex !== null"
        :items="ranked"
        :index="detailIndex"
        :mode="mode"
        :originals-available="originalsAccess !== 'unavailable'"
        @download-original="downloadOriginal"
        @close="detailIndex = null"
        @navigate="detailIndex = $event"
      />
    </Transition>
  </div>
</template>

<style>
.picks-root {
  --pk-topbar-h: 64px;
  --pk-bg: #07070a;
  --pk-panel: rgba(18, 18, 24, 0.66);
  --pk-line: rgba(255, 255, 255, 0.08);
  --pk-line-strong: rgba(255, 255, 255, 0.16);
  --pk-text: rgba(255, 255, 255, 0.94);
  --pk-text-2: rgba(255, 255, 255, 0.64);
  --pk-text-3: rgba(255, 255, 255, 0.42);
  --pk-gold: #f4b740;
  --pk-gold-2: #ffd98a;
  --pk-gradient: linear-gradient(110deg, #22d3ee 0%, #8b5cf6 48%, #f59e0b 100%);
  --pk-gold-gradient: linear-gradient(135deg, #ffe3a3 0%, #f4b740 45%, #d4861c 100%);
  --pk-serif: "Fraunces", Georgia, "Times New Roman", serif;
  --pk-sans: "Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --pk-ease: cubic-bezier(0.22, 1, 0.36, 1);

  position: fixed;
  inset: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--pk-bg);
  color: var(--pk-text);
  font-family: var(--pk-sans);
  -webkit-font-smoothing: antialiased;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

.picks-root.is-locked {
  overflow: hidden;
}

.picks-root ::selection {
  background: rgba(244, 183, 64, 0.35);
}

.picks-root .pk-content {
  position: relative;
  z-index: 1;
  min-height: 100%;
}

.picks-root .pk-eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--pk-gold-2);
  opacity: 0.85;
}

.picks-root .pk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--pk-line-strong);
  background: rgba(255, 255, 255, 0.04);
  color: var(--pk-text);
  font: 600 13px var(--pk-sans);
  cursor: pointer;
  transition:
    background 0.25s var(--pk-ease),
    border-color 0.25s var(--pk-ease),
    transform 0.25s var(--pk-ease);
}

.picks-root .pk-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.28);
  transform: translateY(-1px);
}

.picks-root .pk-btn--light {
  background: rgba(255, 255, 255, 0.92);
  border-color: transparent;
  color: #0b0b0f;
}

.picks-root .pk-btn--light:hover {
  background: #fff;
}

.picks-root .pk-cta {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 30px;
  border: 0;
  border-radius: 999px;
  background: var(--pk-gold-gradient);
  color: #1a1206;
  font: 700 15px var(--pk-sans);
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow:
    0 14px 40px -12px rgba(244, 183, 64, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transition:
    transform 0.3s var(--pk-ease),
    box-shadow 0.3s var(--pk-ease);
}

.picks-root .pk-cta::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.9s var(--pk-ease);
}

.picks-root .pk-cta:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 50px -12px rgba(244, 183, 64, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.picks-root .pk-cta:hover::after {
  transform: translateX(120%);
}

.picks-root .pk-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  border: 0;
  background: none;
  color: var(--pk-text-2);
  font: 500 13px var(--pk-sans);
  cursor: pointer;
  transition: color 0.2s ease;
}

.picks-root .pk-link:hover {
  color: var(--pk-text);
}

.picks-root .pk-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--pk-text-3);
}

.picks-root .pk-icon-btn {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--pk-line-strong);
  background: rgba(12, 12, 16, 0.6);
  backdrop-filter: blur(10px);
  color: var(--pk-text);
  cursor: pointer;
  transition:
    background 0.25s var(--pk-ease),
    transform 0.25s var(--pk-ease);
}

.picks-root .pk-icon-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.12);
  transform: scale(1.05);
}

.picks-root .pk-reveal {
  animation: pk-reveal 1s var(--pk-ease) both;
  animation-delay: var(--d, 0ms);
}

@keyframes pk-reveal {
  from {
    opacity: 0;
    transform: translateY(18px);
    filter: blur(8px);
  }
}

.picks-root .pk-step-enter-active,
.picks-root .pk-step-leave-active {
  transition:
    opacity 0.55s var(--pk-ease),
    transform 0.55s var(--pk-ease),
    filter 0.55s var(--pk-ease);
}
.picks-root .pk-step-enter-from {
  opacity: 0;
  transform: translateY(24px);
  filter: blur(10px);
}
.picks-root .pk-step-leave-to {
  opacity: 0;
  transform: translateY(-12px);
  filter: blur(10px);
}

.picks-root .pk-fade-enter-active,
.picks-root .pk-fade-leave-active {
  transition: opacity 0.4s var(--pk-ease);
}
.picks-root .pk-fade-enter-from,
.picks-root .pk-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .picks-root .pk-hide-sm {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .picks-root .pk-reveal {
    animation: none;
  }
}
</style>
