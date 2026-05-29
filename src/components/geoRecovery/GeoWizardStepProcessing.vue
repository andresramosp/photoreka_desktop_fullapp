<script setup lang="ts">
import { NProgress, NSpace, NSpin, NStatistic } from "naive-ui";
import type { GeoRecoveryJobState } from "@/utils/geoRecovery/types";

const props = defineProps<{
  job: GeoRecoveryJobState | null;
  photoCount: number;
  stageLabel: string;
}>();
</script>

<template>
  <div class="geo-processing-card">
    <div class="geo-processing-head">
      <NSpin size="small" />
      <h3>Analyzing your photos</h3>
    </div>
    <p class="muted small">{{ stageLabel }}</p>
    <NProgress
      type="line"
      :percentage="job?.progressPercent ?? 0"
      :status="job?.status === 'failed' ? 'error' : 'default'"
      style="margin: 8px 0"
    />
    <NSpace :size="16" class="processing-stats">
      <NStatistic label="Processed" :value="job?.processed ?? 0">
        <template #suffix>/ {{ job?.total ?? photoCount }}</template>
      </NStatistic>
      <NStatistic label="Located" :value="job?.located ?? 0" />
      <NStatistic label="Unknown" :value="job?.unknown ?? 0" />
    </NSpace>
  </div>
</template>

<style scoped>
.geo-processing-card {
  position: absolute;
  top: 70px;
  right: 16px;
  z-index: 900;
  width: min(360px, 92vw);
  padding: 14px 16px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}
.geo-processing-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.geo-processing-head h3 {
  margin: 0;
  font-size: 15px;
}
.processing-stats {
  margin-top: 4px;
}
.muted {
  color: rgba(255, 255, 255, 0.6);
}
.small {
  font-size: 12px;
}
</style>
