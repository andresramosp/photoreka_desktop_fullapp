<script setup lang="ts">
import { NButton, NIcon } from "naive-ui";
import { LockClosedOutline, WarningOutline } from "@vicons/ionicons5";

const props = defineProps<{
  photoCount: number;
  payBusy: boolean;
}>();

const emit = defineEmits<{
  back: [];
  pay: [];
}>();
</script>

<template>
  <div class="gwp-body">
    <!-- Header -->
    <div>
      <h2 class="gwp-title">One-time payment</h2>
      <p class="gwp-sub">
        Your {{ photoCount }} photo{{ photoCount !== 1 ? "s" : "" }} are ready
        to be analyzed. Pay once, analyze once.
      </p>
    </div>

    <!-- Mock warning notice -->
    <div class="gwp-notice gwp-notice--warning">
      <NIcon
        :component="WarningOutline"
        size="15"
        :color="'var(--warning-color)'"
        class="gwp-notice-icon"
      />
      <span>
        Payment is currently mocked. A real Stripe checkout will live here
        before launch.
      </span>
    </div>

    <!-- Actions -->
    <div class="gwp-actions">
      <NButton :disabled="payBusy" @click="emit('back')">Back</NButton>
      <NButton
        type="primary"
        size="large"
        :loading="payBusy"
        @click="emit('pay')"
      >
        <template #icon>
          <NIcon :component="LockClosedOutline" />
        </template>
        Pay &amp; analyze
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.gwp-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gwp-title {
  margin: 0 0 6px;
  font-size: 19px;
  font-weight: 700;
}

.gwp-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.65);
}

.gwp-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 12px;
  border-left: 3px solid;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.65);
}

.gwp-notice--warning {
  background: color-mix(in srgb, var(--warning-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--warning-color) 45%, transparent);
}

.gwp-notice-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.gwp-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
