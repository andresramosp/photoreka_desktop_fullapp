<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :style="{ width: '550px', maxWidth: '95vw' }"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="ssv-card">
      <template #header>
        <div class="ssv-header">
          <n-icon size="20" color="var(--error-color, #ef4444)">
            <ShieldCheckmarkOutline />
          </n-icon>
          <span>Content Policy Violation</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="$emit('update:show', false)" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="ssv-body">
        <p class="ssv-description">
          One or more photos in this batch appear to contain content that
          violates our policies&nbsp;— including nudity, explicit material, or
          violent imagery. The upload has been cancelled.
        </p>

        <div class="ssv-info-box">
          <p class="ssv-info-text">
            If you believe this is a mistake, please review our
            <a
              href="https://www.photoreka.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              class="ssv-link"
              >Terms &amp; Image Policy</a
            >
            or contact us at
            <a href="mailto:hello@photoreka.com" class="ssv-link"
              >hello@photoreka.com</a
            >.
          </p>
        </div>
      </div>

      <template #footer>
        <div class="ssv-footer">
          <n-button type="primary" @click="$emit('update:show', false)">
            Got it
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { NModal, NCard, NButton, NIcon } from "naive-ui";
import { ShieldCheckmarkOutline, CloseOutline } from "@vicons/ionicons5";

defineProps({ show: Boolean });
defineEmits(["update:show"]);
</script>

<style scoped>
.ssv-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.ssv-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.ssv-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.ssv-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.ssv-info-box {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
}

.ssv-info-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.ssv-link {
  color: var(--primary-color);
  text-decoration: none;
}

.ssv-link:hover {
  text-decoration: underline;
}

.ssv-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
