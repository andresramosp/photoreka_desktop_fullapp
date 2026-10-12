<template>
  <n-modal
    :show="show"
    :style="{ width: '550px', maxWidth: '95vw' }"
    @update:show="(val) => !val && emit('cancel')"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="analyze-quota-warning-card"
    >
      <template #header>
        <div class="analyze-quota-warning-header">
          <n-icon size="20" color="var(--warning-color)">
            <InformationCircleOutline />
          </n-icon>
          <span>Analysis Quota Notice</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('cancel')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="analyze-quota-warning-body">
        <p class="analyze-quota-warning-description">
          After this import, you'll have
          <strong>{{ context.projectedPendingCount }} images in Lightbox</strong
          >, but your current analysis quota only covers
          <strong
            >{{ context.remaining }} image{{
              context.remaining !== 1 ? "s" : ""
            }}</strong
          >.
        </p>
        <p class="analyze-quota-warning-description">
          You can continue with the import to
          <strong>check duplicates</strong> and prepare future batches, or you
          can go to Settings to <strong>upgrade your plan</strong> and increase
          your analysis quota.
        </p>

        <div class="analyze-quota-warning-dismiss">
          <n-checkbox
            :checked="dontShowAgain"
            @update:checked="emit('update:dontShowAgain', $event)"
          >
            Don't show this again
          </n-checkbox>
        </div>
      </div>

      <template #footer>
        <div class="analyze-quota-warning-footer">
          <n-button tertiary @click="emit('go-to-settings')"
            >Go to Settings</n-button
          >
          <div class="analyze-quota-warning-footer-actions">
            <n-button @click="emit('cancel')">Cancel</n-button>
            <n-button type="primary" @click="emit('confirm')"
              >Import anyway</n-button
            >
          </div>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { NModal, NCheckbox } from "naive-ui";
import { CloseOutline, InformationCircleOutline } from "@vicons/ionicons5";

defineProps({
  show: { type: Boolean, default: false },
  context: {
    type: Object,
    default: () => ({
      attemptedCount: 0,
      projectedPendingCount: 0,
      overQuotaCount: 0,
      remaining: 0,
    }),
  },
  dontShowAgain: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:dontShowAgain",
  "cancel",
  "confirm",
  "go-to-settings",
]);
</script>

<style scoped>
.analyze-quota-warning-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.analyze-quota-warning-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.analyze-quota-warning-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.analyze-quota-warning-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.analyze-quota-warning-dismiss {
  padding-top: 4px;
}

.analyze-quota-warning-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.analyze-quota-warning-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
