<script setup lang="ts">
import { NButton, NCheckbox, NIcon } from "naive-ui";
import { DownloadOutline } from "@vicons/ionicons5";
import type { ZipProgress } from "@/utils/geoRecovery/zip";

const props = defineProps<{
  zipBusy: boolean;
  zipProgress: ZipProgress | null;
  hasResults: boolean;
  includeUnlocated: boolean;
}>();

const emit = defineEmits<{
  "update:includeUnlocated": [value: boolean];
  download: [];
}>();
</script>

<template>
  <div class="geo-actions-bar">
    <!-- <NCheckbox
      :checked="includeUnlocated"
      @update:checked="emit('update:includeUnlocated', $event)"
    >
      Include photos without a guessed location
    </NCheckbox> -->
    <NButton
      type="info"
      :loading="zipBusy"
      :disabled="!hasResults && !includeUnlocated"
      @click="emit('download')"
    >
      <template #icon>
        <NIcon :component="DownloadOutline" />
      </template>
      Download Geo-Tagged Photos
    </NButton>
    <span
      class="muted small progress-text"
      :class="{ 'is-hidden': !zipProgress }"
    >
      {{
        zipProgress ? `Packing ${zipProgress.done} / ${zipProgress.total}…` : ""
      }}
    </span>
  </div>
</template>

<style scoped>
.geo-actions-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 14px;
  /* padding: 10px 16px;
  background: var(--geo-card-bg); */
  /* border: 1px solid var(--geo-card-border);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px); */
}
.muted {
  color: rgba(255, 255, 255, 0.6);
}
.small {
  font-size: 12px;
}
.progress-text {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  margin-left: 14px;
}
.progress-text.is-hidden {
  visibility: hidden;
}

@media (max-width: 768px) {
  .geo-actions-bar {
    bottom: 80px;
  }
}
</style>
