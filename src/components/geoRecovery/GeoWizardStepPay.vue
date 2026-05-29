<script setup lang="ts">
import { NAlert, NButton, NIcon, NSpace } from "naive-ui";
import { LockClosedOutline } from "@vicons/ionicons5";

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
  <h2>One-time payment</h2>
  <p class="muted">
    Your {{ photoCount }} photo(s) are ready to be analyzed. Pay once, analyze
    once.
  </p>
  <NAlert type="warning" :show-icon="true" style="margin-bottom: 14px">
    Payment is currently mocked. A real Stripe checkout will live here before
    launch.
  </NAlert>
  <NSpace>
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
  </NSpace>
</template>

<style scoped>
.muted {
  color: rgba(255, 255, 255, 0.6);
}
</style>
