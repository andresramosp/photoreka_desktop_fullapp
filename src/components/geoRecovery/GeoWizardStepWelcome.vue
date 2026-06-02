<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { NAlert, NButton, NCheckbox, NIcon, NTag } from "naive-ui";
import {
  GlobeOutline,
  InformationCircleOutline,
  CreateOutline,
  FlaskOutline,
  ImagesOutline,
  AddOutline,
  ArrowBackOutline,
  CloseOutline,
  LaptopOutline,
  CloudUploadOutline,
  LocationOutline,
  DownloadOutline,
  WarningOutline,
} from "@vicons/ionicons5";
import { useImageProcessing } from "@/composables/useImageProcessing.js";
import {
  assessPhotos,
  type AssessmentSummary,
} from "@/utils/geoRecovery/assess";
import { convertHeicToJpeg } from "@/utils/geoRecovery/exif";
import GeoAssessPanel from "./GeoAssessPanel.vue";

const ASSESS_MAX_PHOTOS = 10;

const emit = defineEmits<{ start: []; runFree: [files: File[]] }>();

// ── Start consent (replaces the old static privacy checkbox) ───────────────
// - No checkbox shown initially.
// - If the user clicks Start without having run the test → checkbox appears
//   (lazy nudge: they must acknowledge they haven't validated suitability).
// - If the test returned a "strong" worst-case result (≥ 50 % discarded)
//   → checkbox also appears, worded more strongly.
const acceptedWarning = ref(false);
const startAttempted = ref(false); // true once user clicks Start w/o prior test

const assessDone = computed(() => assessResults.value !== null);
const assessIsWorstCase = computed(() => {
  if (!assessResults.value || assessResults.value.total === 0) return false;
  return assessResults.value.discardedCount / assessResults.value.total >= 0.5;
});

// Checkbox is required when the user hasn't tested OR worst-case results came back.
const showConsent = computed(
  () => startAttempted.value || assessIsWorstCase.value,
);
const canStart = computed(() => !showConsent.value || acceptedWarning.value);

function handleStart() {
  // First click without a test: surface the consent checkbox instead of starting.
  if (!assessDone.value && !startAttempted.value) {
    startAttempted.value = true;
    acceptedWarning.value = false;
    return;
  }
  if (!canStart.value) return;
  emit("start");
}

// ── Assess state ────────────────────────────────────────────────────
const assessMode = ref(false); // true → show GeoAssessPanel (results)
const assessStaging = ref(false); // true → show incremental photo grid
const assessFileInput = ref<HTMLInputElement | null>(null);
const assessFiles = ref<File[]>([]);
const assessPreviews = ref<string[]>([]);
const assessBusy = ref(false);
const assessResults = ref<AssessmentSummary | null>(null);
const assessError = ref<string | null>(null);
const assessCountError = ref<string | null>(null);

// ── Daily usage limit ───────────────────────────────────────────────
const ASSESS_DAILY_LIMIT = 5;
const ASSESS_STORAGE_KEY = "photoreka_assess_daily";

interface AssessDailyRecord {
  date: string; // YYYY-MM-DD
  count: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readAssessRecord(): AssessDailyRecord {
  try {
    const raw = localStorage.getItem(ASSESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AssessDailyRecord;
      if (parsed.date === todayIso()) return parsed;
    }
  } catch {}
  return { date: todayIso(), count: 0 };
}

function incrementAssessRecord(): void {
  const rec = readAssessRecord();
  rec.count += 1;
  rec.date = todayIso();
  localStorage.setItem(ASSESS_STORAGE_KEY, JSON.stringify(rec));
  assessUsedToday.value = rec.count;
}

const assessUsedToday = ref(readAssessRecord().count);
const assessLimitReached = computed(
  () => assessUsedToday.value >= ASSESS_DAILY_LIMIT,
);
const assessRemaining = computed(() =>
  Math.max(0, ASSESS_DAILY_LIMIT - assessUsedToday.value),
);

const assessHasHeic = computed(() =>
  assessFiles.value.some((f) => /\.(heic|heif)$/i.test(f.name)),
);

function openAssessFilePicker() {
  if (assessLimitReached.value) return;
  assessStaging.value = true; // navigate to the incremental photo staging grid
}

// Incremental file selection inside the staging grid
async function onStagingFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const ACCEPTED_ASSESS_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    // "image/heic",  // ⚠️ HEIC DISABLED: Uncomment to re-enable HEIC support
    // "image/heif",  // ⚠️ HEIC DISABLED: Uncomment to re-enable HEIC support
  ];
  const ACCEPTED_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    // ".heic",  // ⚠️ HEIC DISABLED: Uncomment to re-enable HEIC support
    // ".heif",  // ⚠️ HEIC DISABLED: Uncomment to re-enable HEIC support
  ];

  const isAcceptedImage = (f: File) => {
    if (ACCEPTED_ASSESS_TYPES.includes(f.type)) return true;
    const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext ? ACCEPTED_EXTENSIONS.includes(ext) : false;
  };

  const rawFiles = Array.from(input.files ?? []).filter(isAcceptedImage);
  input.value = "";
  if (rawFiles.length === 0) return;

  // Never exceed the 10-photo cap
  const remaining = ASSESS_MAX_PHOTOS - assessFiles.value.length;
  if (rawFiles.length > remaining) {
    assessCountError.value = `Only ${remaining} slot${
      remaining === 1 ? "" : "s"
    } left — extra photos were not added.`;
  } else {
    assessCountError.value = null;
  }
  const toAdd = rawFiles.slice(0, remaining);
  for (const file of toAdd) {
    // ⚠️ HEIC DISABLED: Uncomment the block below to re-enable HEIC → JPEG conversion
    // Convert HEIC/HEIF to JPEG so canvas-based resize and preview work in all browsers
    // let processedFile: File = file;
    // const isHeic =
    //   file.type === "image/heic" ||
    //   file.type === "image/heif" ||
    //   /\.(heic|heif)$/i.test(file.name);
    // if (isHeic) {
    //   try {
    //     const jpegBlob = await convertHeicToJpeg(file);
    //     const jpegName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    //     processedFile = new File([jpegBlob], jpegName, { type: "image/jpeg" });
    //   } catch {
    //     // Fallback to original on conversion error
    //     processedFile = file;
    //   }
    // }
    const processedFile = file; // Direct assignment when HEIC is disabled
    assessFiles.value.push(processedFile);
    assessPreviews.value.push(URL.createObjectURL(processedFile));
  }

  // Auto-trigger assessment when the grid is full
  if (assessFiles.value.length === ASSESS_MAX_PHOTOS) {
    assessMode.value = true;
    assessResults.value = null;
    assessError.value = null;
    await runAssessment([...assessFiles.value]);
  }
}

function removeAssessFileAt(index: number) {
  URL.revokeObjectURL(assessPreviews.value[index]);
  assessFiles.value.splice(index, 1);
  assessPreviews.value.splice(index, 1);
  assessCountError.value = null;
}

function closeStagingMode() {
  revokeAssessPreviews();
  assessFiles.value = [];
  assessPreviews.value = [];
  assessCountError.value = null;
  assessStaging.value = false;
}

// Called when GeoAssessPanel emits 'back' — return to staging grid
function onAssessBack() {
  assessMode.value = false;
  // keep assessFiles/assessPreviews so the user sees their photos again
}

// Called when GeoAssessPanel emits 'runFree'
function onRunFree() {
  const files = [...assessFiles.value];
  revokeAssessPreviews();
  assessMode.value = false;
  assessStaging.value = false;
  assessFiles.value = [];
  assessPreviews.value = [];
  assessResults.value = null;
  startAttempted.value = false;
  acceptedWarning.value = false;
  emit("runFree", files);
}

// Called when GeoAssessPanel emits 'skip' — go straight to the normal paid flow
function onSkip() {
  closeAssessPanel();
  assessStaging.value = false;
  emit("start");
}

async function runAssessment(files: File[]) {
  if (assessLimitReached.value) {
    assessError.value = "Daily free-run limit reached. Try again tomorrow.";
    return;
  }
  incrementAssessRecord();
  assessBusy.value = true;
  try {
    const { resizeImage } = useImageProcessing();
    const images = await Promise.all(
      files.map(async (file) => {
        const thumb = await resizeImage(file, 512, 100_000);
        const base64 = await blobToBase64(thumb);
        return { data: base64, mimeType: thumb.type || "image/jpeg" };
      }),
    );
    assessResults.value = await assessPhotos(images);
  } catch (error: any) {
    assessError.value = "Assessment failed. Please try again.";
    console.error("[Assess]", error);
  } finally {
    assessBusy.value = false;
  }
}

function closeAssessPanel() {
  revokeAssessPreviews();
  assessMode.value = false;
  assessFiles.value = [];
  assessPreviews.value = [];
  assessCountError.value = null;
  // Keep assessResults so the welcome screen can reflect worst-case consent.
  // Reset the manual startAttempted flag; the worst-case computed takes over if needed.
  startAttempted.value = false;
  acceptedWarning.value = false;
}

function revokeAssessPreviews() {
  assessPreviews.value.forEach((url) => URL.revokeObjectURL(url));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

onUnmounted(() => revokeAssessPreviews());
</script>

<template>
  <!-- Assess panel — shows results after the 10-photo analysis -->
  <GeoAssessPanel
    v-if="assessMode"
    :files="assessFiles"
    :previews="assessPreviews"
    :busy="assessBusy"
    :results="assessResults"
    :error="assessError"
    @run-free="onRunFree"
    @skip="onSkip"
    @back="onAssessBack"
  />

  <!-- Staging grid — incremental photo selection (up to 10) -->
  <div v-else-if="assessStaging" class="grw-staging">
    <input
      ref="assessFileInput"
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp"
      style="display: none"
      @change="onStagingFilesSelected"
    />

    <div class="grw-staging-header">
      <h3 class="grw-staging-title">Geo-Inference Test — select 10 photos</h3>
    </div>

    <p class="grw-staging-sub">
      Choose the most representative photos of your collection. Once you have
      10, we will forecast the geo-inference results.
    </p>

    <!-- HEIC conversion warning -->
    <NAlert
      v-if="assessHasHeic"
      type="warning"
      :bordered="false"
      class="grw-heic-alert"
    >
      <template #icon>
        <NIcon :component="WarningOutline" />
      </template>
      <span class="grw-heic-text">
        <strong>HEIC files detected:</strong> These will be converted to JPEG.
        Original EXIF data will be replaced with GPS coordinates only.
      </span>
    </NAlert>

    <!-- 5×2 grid with filled + empty placeholder slots -->
    <div class="grw-staging-grid">
      <div
        v-for="(preview, i) in assessPreviews"
        :key="i"
        class="grw-staging-cell"
      >
        <img
          :src="preview"
          :alt="assessFiles[i]?.name"
          class="grw-staging-img"
        />
        <button class="grw-staging-remove" @click="removeAssessFileAt(i)">
          <NIcon :component="CloseOutline" size="10" />
        </button>
      </div>
      <!-- Empty placeholder slots -->
      <div
        v-for="n in ASSESS_MAX_PHOTOS - assessFiles.length"
        :key="`empty-${n}`"
        class="grw-staging-cell grw-staging-cell--empty"
      />
    </div>

    <!-- Footer: back + error + add button -->
    <div class="grw-staging-footer">
      <NButton size="small" @click="closeStagingMode">
        <template #icon>
          <NIcon :component="ArrowBackOutline" />
        </template>
        Back
      </NButton>
      <span v-if="assessCountError" class="grw-staging-count--error">
        {{ assessCountError }}
      </span>
      <NButton
        v-if="assessFiles.length < ASSESS_MAX_PHOTOS"
        type="info"
        size="small"
        @click="assessFileInput?.click()"
      >
        <template #icon>
          <NIcon :component="AddOutline" />
        </template>
        {{
          ASSESS_MAX_PHOTOS - assessFiles.length === 1
            ? "Add 1 more photo"
            : `Add ${ASSESS_MAX_PHOTOS - assessFiles.length} more photos`
        }}
      </NButton>
    </div>
  </div>

  <div v-else class="grw-body">
    <!-- ── Hero card: single-column, correct reading order ── -->
    <div class="grw-hero-card">
      <svg
        class="grw-hero-globe"
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
      <div class="grw-hero-content">
        <NTag
          type="primary"
          size="small"
          round
          :bordered="false"
          class="grw-badge"
        >
          <template #icon><NIcon :component="GlobeOutline" /></template>
          Geo Recovery
        </NTag>
        <!-- <h2 class="grw-hero-headline">
          Your photos know where they were taken
        </h2> -->
        <p class="grw-hero-sub">
          Our AI engine infers GPS coordinates from visual context, placing only
          reliable locations on the map. After you review it, you can download
          your original files with the updated EXIF data. No queueing required —
          process up to 5,000 in minutes.
        </p>
      </div>
    </div>

    <!-- ── 3 key facts (scannable at a glance) ────────────── -->
    <div class="grw-facts">
      <div class="grw-fact">
        <div class="grw-fact-content">
          <h3 class="grw-fact-title">
            <NIcon
              :component="InformationCircleOutline"
              class="grw-fact-title-icon"
            />
            As precise as reasonable
          </h3>
          <p class="grw-fact-desc">
            We push accuracy as far as possible, reaching street level in many
            cases, while only committing when confidence is high.
          </p>
        </div>
      </div>
      <div class="grw-fact">
        <div class="grw-fact-content">
          <h3 class="grw-fact-title">
            <NIcon :component="CreateOutline" class="grw-fact-title-icon" />
            Fine-tune before you download
          </h3>
          <p class="grw-fact-desc">
            An interactive map lets you review and nudge any placement with a
            smart auto-complete, so your final files are exactly right.
          </p>
        </div>
      </div>
      <div class="grw-fact">
        <div class="grw-fact-content">
          <h3 class="grw-fact-title">
            <NIcon :component="ImagesOutline" class="grw-fact-title-icon" />
            Your photos stay in the browser
          </h3>
          <p class="grw-fact-desc">
            Originals stay local and survive browser reloads. We don't store
            your files. No account or registration required.
          </p>
        </div>
      </div>
    </div>

    <!-- ── How it works: 4-step horizontal flow ───────────── -->
    <div class="grw-steps-wrapper">
      <div class="grw-steps-label">How it works</div>
      <div class="grw-steps">
        <div class="grw-step">
          <span class="grw-step-num">
            <NIcon :component="LaptopOutline" size="18" />
          </span>
          <span class="grw-step-text">Select your originals</span>
        </div>
        <div class="grw-step-sep" aria-hidden="true">
          <svg
            width="32"
            height="14"
            viewBox="0 0 32 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 7h28M24 3l4 4-4 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="grw-step">
          <span class="grw-step-num">
            <NIcon :component="CloudUploadOutline" size="18" />
          </span>
          <span class="grw-step-text">Thumbnails sent to AI</span>
        </div>
        <div class="grw-step-sep" aria-hidden="true">
          <svg
            width="32"
            height="14"
            viewBox="0 0 32 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 7h28M24 3l4 4-4 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="grw-step">
          <span class="grw-step-num">
            <NIcon :component="LocationOutline" size="18" />
          </span>
          <span class="grw-step-text">AI proposes a location</span>
        </div>
        <div class="grw-step-sep" aria-hidden="true">
          <svg
            width="32"
            height="14"
            viewBox="0 0 32 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M0 7h28M24 3l4 4-4 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="grw-step">
          <span class="grw-step-num">
            <NIcon :component="DownloadOutline" size="18" />
          </span>
          <span class="grw-step-text">Download with EXIF GPS</span>
        </div>
      </div>
    </div>

    <!-- ── Free run test: secondary action, clearly separated ─ -->
    <div class="grw-test-strip">
      <div class="grw-test-strip-text">
        <p
          class="grw-test-strip-label"
          :class="{ 'grw-test-strip-label--limit': assessLimitReached }"
        >
          <template v-if="assessLimitReached"
            >Daily free-run limit reached — try again tomorrow.</template
          >
          <template v-else
            >Not sure if your photos are suitable? Test up to 10 for free
            first.</template
          >
        </p>
        <span
          v-if="!assessLimitReached && assessUsedToday > 0"
          class="grw-test-remaining"
        >
          {{ assessRemaining }}
          {{ assessRemaining === 1 ? "test" : "tests" }} remaining today
        </span>
      </div>
      <NButton
        type="warning"
        size="medium"
        :disabled="assessLimitReached"
        @click="openAssessFilePicker"
        class="grw-test-btn"
      >
        <template #icon><NIcon :component="FlaskOutline" /></template>
        Free Run Test
      </NButton>
    </div>

    <!-- ── Footer: conditional consent + primary CTA ─────── -->
    <div class="grw-footer">
      <NCheckbox
        v-if="showConsent"
        v-model:checked="acceptedWarning"
        class="grw-consent"
      >
        <!-- <span v-if="assessIsWorstCase" class="grw-consent-label">
          I understand that most of my photos are unlikely to be geolocated and
          that the fee applies regardless of results.
        </span> -->
        <span class="grw-consent-label">
          I took the <strong>Free Run Test</strong> and confirmed that my photos
          are suitable for georeferencing.
        </span>
      </NCheckbox>
      <NButton
        type="primary"
        size="large"
        block
        :disabled="!canStart"
        @click="handleStart"
      >
        Start Geo-Recovery Now
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.grw-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Hero card ────────────────────────────────────────────── */

.grw-hero-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 22px 20px 20px;
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--primary-color) 22%, #0c0e14) 0%,
    #0c0e14 65%
  );
}

.grw-hero-globe {
  position: absolute;
  right: -40px;
  bottom: -40px;
  width: 240px;
  height: 240px;
  opacity: 0.13;
  color: var(--primary-color);
  pointer-events: none;
}

.grw-hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 76%;
}

.grw-badge {
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 11px !important;
}

.grw-hero-headline {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.6px;
  color: #fff;
}

.grw-hero-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

/* ── Key facts ────────────────────────────────────────────── */

.grw-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

@media (max-width: 768px) {
  .grw-facts {
    grid-template-columns: 1fr;
  }

  .grw-steps-wrapper {
    display: none;
  }
}

.grw-fact {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px;
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.01) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  transition: all 0.25s ease;
}

.grw-fact:hover {
  /* border-color: color-mix(in srgb, var(--primary-color) 35%, transparent);
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25); */
}

.grw-fact-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.grw-fact-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: #fff;
  letter-spacing: -0.2px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.grw-fact-title-icon {
  font-size: 20px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.grw-fact-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.55);
}

/* ── How it works: horizontal stepper ────────────────────── */

.grw-steps-wrapper {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.grw-steps-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 10px;
  text-align: center;
}

.grw-steps {
  display: flex;
  align-items: center;
  gap: 6px;
}

.grw-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.grw-step-num {
  width: 42px;
  height: 42px;

  border-radius: 50%;
  background: color-mix(in srgb, var(--primary-color) 25%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.grw-step-text {
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.55);
}

.grw-step-sep {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  margin-bottom: 20px;
}

/* ── Free-run test strip ──────────────────────────────────── */

.grw-test-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 14px;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.13);
  background: rgba(255, 255, 255, 0.02);
}

.grw-test-strip-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.grw-test-strip-label {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  /* color: rgba(255, 255, 255, 0.5); */
}

.grw-test-strip-label--limit {
  color: rgba(255, 100, 100, 0.65);
}

.grw-test-remaining {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.28);
}

.grw-test-btn {
  font-weight: 600;
  letter-spacing: 0.2px;
  flex-shrink: 0;
}

/* ── Footer ───────────────────────────────────────────────── */

.grw-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.grw-consent {
  display: flex;
  align-items: flex-start;
}

.grw-consent-label {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
}

/* ── Staging grid ─────────────────────────────────────────────── */

.grw-staging {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grw-staging-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.grw-staging-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.grw-staging-sub {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.55);
}

.grw-heic-alert {
  background: rgba(250, 173, 20, 0.12) !important;
  border-radius: 6px;
}

.grw-heic-text {
  font-size: 13px;
  line-height: 1.5;
}

.grw-heic-text strong {
  font-weight: 600;
}

.grw-staging-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: calc((min(740px, 92vw) - 64px) / 5);
  gap: 4px;
  border-radius: 8px;
  overflow: hidden;
}

.grw-staging-cell {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background: #1a1a1a;
}

.grw-staging-cell--empty {
  /* border: 1px dashed rgba(255, 255, 255, 0.12); */
  background: rgba(255, 255, 255, 0.025);
  display: flex;
  align-items: center;
  justify-content: center;
}

.grw-staging-cell--empty::after {
  content: "";
  display: block;
  width: 36px;
  height: 36px;
  opacity: 0.15;
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V5h18v14zm-8.5-5.5-2.5 3.01L8 13l-3 4h14l-4.5-5.5z'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.grw-staging-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.grw-staging-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.15s;
  padding: 0;
}
.grw-staging-cell:hover .grw-staging-remove {
  opacity: 1;
}
.grw-staging-remove:hover {
  background: rgba(220, 50, 50, 0.85);
}

.grw-staging-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.grw-staging-count--error {
  color: rgba(255, 100, 100, 0.9);
  font-weight: 500;
}
</style>
