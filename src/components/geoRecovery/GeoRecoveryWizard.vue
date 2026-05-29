<script setup lang="ts">
import { NIcon, NTag } from "naive-ui";
import { TrashOutline } from "@vicons/ionicons5";
import type { UploadProgress } from "@/utils/geoRecovery/upload";
import type { ZipProgress } from "@/utils/geoRecovery/zip";
import type {
  GeoRecoveryJobState,
  LocalPhotoRecord,
} from "@/utils/geoRecovery/types";
import GeoWizardStepWelcome from "./GeoWizardStepWelcome.vue";
import GeoWizardStepUpload from "./GeoWizardStepUpload.vue";
import GeoWizardStepPay from "./GeoWizardStepPay.vue";
import GeoWizardStepProcessing from "./GeoWizardStepProcessing.vue";
import GeoWizardStepResults from "./GeoWizardStepResults.vue";

const props = defineProps<{
  stepIndex: number;
  hasSession: boolean;
  photos: LocalPhotoRecord[];
  pendingFiles: File[];
  photoCount: number;
  locatedCount: number;
  unknownCount: number;
  maxPhotos: number;
  pendingCount: number;
  uploading: boolean;
  uploadProgress: UploadProgress | null;
  payBusy: boolean;
  job: GeoRecoveryJobState | null;
  jobStageLabel: string;
  zipBusy: boolean;
  zipProgress: ZipProgress | null;
  hasResults: boolean;
  includeUnlocated: boolean;
}>();

const emit = defineEmits<{
  accepted: [];
  fileChange: [files: File[]];
  upload: [];
  continue: [];
  back: [];
  pay: [];
  download: [];
  startOver: [];
  "update:includeUnlocated": [value: boolean];
}>();
</script>

<template>
  <!-- Top-left brand chip — always visible -->
  <div class="geo-brand">
    <NIcon size="22" class="geo-brand-icon">
      <svg viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        />
      </svg>
    </NIcon>
    <div class="geo-brand-text">
      <span class="geo-brand-title">Geo Recovery</span>
      <span class="geo-brand-subtitle">Add GPS to your photos</span>
    </div>
  </div>

  <!-- Stats badge (visible from step 3) -->
  <div v-if="stepIndex >= 3 && photoCount > 0" class="geo-stats-pill">
    <NTag :bordered="false" size="small" type="success">
      {{ locatedCount }} located
    </NTag>
    <NTag :bordered="false" size="small"> {{ unknownCount }} unknown </NTag>
    <NTag :bordered="false" size="small" type="info">
      {{ photoCount }} total
    </NTag>
  </div>

  <!-- Wizard backdrop dim (steps 0–2 only) -->
  <div v-if="stepIndex <= 2" class="geo-backdrop" />

  <!-- Steps 0–2: centered modal wrapper -->
  <div v-if="stepIndex <= 2" class="geo-modal">
    <div class="geo-modal-card">
      <GeoWizardStepWelcome v-if="stepIndex === 0" @start="emit('accepted')" />
      <GeoWizardStepUpload
        v-else-if="stepIndex === 1"
        :max-photos="maxPhotos"
        :photos="photos"
        :pending-files="pendingFiles"
        :photo-count="photoCount"
        :pending-count="pendingCount"
        :uploading="uploading"
        :upload-progress="uploadProgress"
        @file-change="emit('fileChange', $event)"
        @upload="emit('upload')"
        @continue="emit('continue')"
      />
      <GeoWizardStepPay
        v-else-if="stepIndex === 2"
        :photo-count="photoCount"
        :pay-busy="payBusy"
        @back="emit('back')"
        @pay="emit('pay')"
      />
    </div>
  </div>

  <!-- Step 3: Processing — floating top-right card -->
  <GeoWizardStepProcessing
    v-else-if="stepIndex === 3"
    :job="job"
    :photo-count="photoCount"
    :stage-label="jobStageLabel"
  />

  <!-- Step 4: Results — floating bottom action bar -->
  <GeoWizardStepResults
    v-else-if="stepIndex === 4"
    :zip-busy="zipBusy"
    :zip-progress="zipProgress"
    :has-results="hasResults"
    :include-unlocated="includeUnlocated"
    @update:include-unlocated="emit('update:includeUnlocated', $event)"
    @download="emit('download')"
  />

  <!-- Start-over (always visible if a session exists) -->
  <button
    v-if="hasSession"
    class="geo-startover"
    title="Start a new session"
    @click="emit('startOver')"
  >
    <NIcon :component="TrashOutline" size="14" />
    <span>Start new</span>
  </button>
</template>

<style scoped>
/* ── Brand chip (top-left) ───────────────────────────────────────────────── */

.geo-brand {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  color: #fff;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
}
.geo-brand-icon {
  color: var(--accent-color);
}
.geo-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.geo-brand-title {
  font-weight: 700;
  font-size: 14px;
}
.geo-brand-subtitle {
  font-size: 11px;
  opacity: 0.7;
}

/* ── Stats pill (top-right) ──────────────────────────────────────────────── */

.geo-stats-pill {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
}

/* ── Start-over button (bottom-left) ─────────────────────────────────────── */

.geo-startover {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition:
    color 0.18s ease,
    background 0.18s ease;
}
.geo-startover:hover {
  color: #ff6b6b;
  background: rgba(40, 30, 30, 0.96);
}

/* ── Wizard backdrop + centered modal (steps 0–2) ────────────────────────── */

.geo-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  z-index: 500;
}
.geo-modal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 600;
  pointer-events: none;
}
.geo-modal-card {
  pointer-events: auto;
  width: min(580px, 92vw);
  max-height: 86vh;
  overflow-y: auto;
  padding: 22px 24px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 14px;
  color: #fff;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
}
.geo-modal-card :deep(h2) {
  margin: 0 0 12px;
  font-size: 20px;
}
</style>
