<template>
  <n-modal
    :show="show"
    :style="{ width: '500px', maxWidth: '95vw' }"
    @update:show="(val) => !val && emit('cancel')"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="analyze-confirm-card"
    >
      <template #header>
        <div class="analyze-confirm-header">
          <n-icon size="20" color="var(--primary-color)">
            <RocketLaunchOutlined />
          </n-icon>
          <span>Confirm Analysis</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('cancel')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="analyze-confirm-body">
        <p class="analyze-confirm-description">
          You are about to process
          <strong
            >{{ selectedCount }} photo{{
              selectedCount !== 1 ? "s" : ""
            }}</strong
          >. Once started, it cannot be reversed. Do you want to continue?
        </p>

        <div class="analyze-confirm-info-box">
          <div class="analyze-confirm-info-header">
            <n-icon size="15" color="var(--info-color)">
              <InformationCircleOutline />
            </n-icon>
            <span class="analyze-confirm-info-title"
              >Estimated processing time</span
            >
          </div>
          <p class="analyze-confirm-info-text">
            Approximately <strong>{{ estimatedTime }}</strong> for
            {{ selectedCount }} photo{{ selectedCount !== 1 ? "s" : "" }}. This
            is an estimate — actual times may vary during periods of high
            demand.
          </p>
        </div>
      </div>

      <template #footer>
        <div class="analyze-confirm-footer">
          <n-button tertiary @click="emit('cancel')">Cancel</n-button>
          <n-button type="info" :loading="isAnalyzing" @click="emit('confirm')"
            >Start Analysis</n-button
          >
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { NModal } from "naive-ui";
import { CloseOutline, InformationCircleOutline } from "@vicons/ionicons5";
import { RocketLaunchOutlined } from "@vicons/material";

defineProps({
  show: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
  estimatedTime: { type: String, default: "" },
  isAnalyzing: { type: Boolean, default: false },
});

const emit = defineEmits(["cancel", "confirm"]);
</script>

<style scoped>
.analyze-confirm-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.analyze-confirm-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.analyze-confirm-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.analyze-confirm-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.analyze-confirm-info-box {
  background-color: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 25%, transparent);
  border-left: 3px solid var(--info-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.analyze-confirm-info-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.analyze-confirm-info-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--info-color);
}

.analyze-confirm-info-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.analyze-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
