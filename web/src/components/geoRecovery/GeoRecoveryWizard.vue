<script setup lang="ts">
import { NIcon } from "naive-ui";
import { RefreshOutline } from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import type { UploadProgress } from "@/utils/geoRecovery/upload";
import type { ZipProgress } from "@/utils/geoRecovery/zip";
import type {
  GeoRecoveryJobState,
  PreviewPhoto,
} from "@/utils/geoRecovery/types";
import GeoWizardStepWelcome from "./GeoWizardStepWelcome.vue";
import GeoWizardStepUpload from "./GeoWizardStepUpload.vue";
import GeoWizardStepPay from "./GeoWizardStepPay.vue";
import GeoWizardStepProcessing from "./GeoWizardStepProcessing.vue";
import GeoWizardStepResults from "./GeoWizardStepResults.vue";

const props = defineProps<{
  stepIndex: number;
  hasSession: boolean;
  previewPhotos: PreviewPhoto[];
  photoCount: number;
  maxPhotos: number;
  uploading: boolean;
  uploadProgress: UploadProgress | null;
  token: string | null;
  job: GeoRecoveryJobState | null;
  jobStageLabel: string;
  zipBusy: boolean;
  zipProgress: ZipProgress | null;
  hasResults: boolean;
  includeUnlocated: boolean;
}>();

const emit = defineEmits<{
  accepted: [];
  runFree: [files: File[]];
  fileChange: [files: File[]];
  continue: [];
  back: [];
  paid: [];
  download: [];
  startOver: [];
  removePhoto: [id: string];
  "update:includeUnlocated": [value: boolean];
}>();
</script>

<template>
  <!-- Top-left brand chip — always visible -->
  <div class="geo-brand">
    <AppLogo
      layout="horizontal"
      size="tiny"
      :click-to-home="true"
      theme="dark"
    />
    <span class="geo-brand-divider" />
    <div class="geo-brand-text">
      <span class="geo-brand-title">Geo Recovery</span>
      <span class="geo-brand-subtitle">Add GPS to your photos</span>
    </div>
  </div>

  <!-- Wizard backdrop dim (steps 0–2 only) -->
  <div v-if="stepIndex <= 2" class="geo-backdrop" />

  <!-- Steps 0–2: centered modal wrapper -->
  <div v-if="stepIndex <= 2" class="geo-modal">
    <div class="geo-modal-card">
      <GeoWizardStepWelcome
        v-if="stepIndex === 0"
        @start="emit('accepted')"
        @run-free="emit('runFree', $event)"
      />
      <GeoWizardStepUpload
        v-else-if="stepIndex === 1"
        :max-photos="maxPhotos"
        :preview-photos="previewPhotos"
        @file-change="emit('fileChange', $event)"
        @continue="emit('continue')"
        @remove-photo="emit('removePhoto', $event)"
        @back="emit('back')"
      />
      <GeoWizardStepPay
        v-else-if="stepIndex === 2 && token"
        :token="token"
        :photo-count="photoCount"
        @back="emit('back')"
        @paid="emit('paid')"
      />
    </div>
  </div>

  <!-- Step 3: Processing — floating top-right card -->
  <GeoWizardStepProcessing
    v-else-if="stepIndex === 3"
    :job="job"
    :photo-count="photoCount"
    :stage-label="jobStageLabel"
    :uploading="uploading"
    :upload-progress="uploadProgress"
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
    <NIcon :component="RefreshOutline" size="18" />
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
.geo-brand :deep(.photoreka-logo) {
  cursor: pointer;
}
.geo-brand-divider {
  display: inline-block;
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
}
.geo-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.geo-brand-title {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.geo-brand-subtitle {
  font-size: 10px;
  opacity: 0.6;
  white-space: nowrap;
}

/* ── Start-over button (bottom-left) ─────────────────────────────────────── */

.geo-startover {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(8px);
  /* transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease; */
}
.geo-startover:hover {
  /* color: #fff;
  background: rgba(50, 40, 40, 0.96);
  transform: scale(1.05); */
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
  width: min(850px, 92vw);
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

/* ── Mobile full-screen adjustments ──────────────────────────────────────── */

@media (max-width: 768px) {
  /* Remove margins from floating elements */
  .geo-brand {
    display: none;
  }

  .geo-brand-title {
    font-size: 11px;
  }

  .geo-brand-subtitle {
    font-size: 9px;
  }

  .geo-startover {
    bottom: 8px;
    left: 8px;
    padding: 8px 14px;
    font-size: 13px;
  }

  /* Full-screen modal for steps 0-2 */
  .geo-modal-card {
    width: 100vw;
    max-height: 100vh;
    padding: 16px;
    border-radius: 0;
    border: none;
  }

  .geo-modal {
    align-items: stretch;
  }
}
</style>
