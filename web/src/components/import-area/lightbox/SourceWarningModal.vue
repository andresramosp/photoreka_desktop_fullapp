<template>
  <n-modal
    :show="show"
    preset="dialog"
    :title="title"
    :closable="false"
    :style="{ width: '500px' }"
    @update:show="(val) => !val && emit('cancel')"
  >
    <div style="margin-bottom: 24px">
      <span style="color: var(--text-secondary); line-height: 1.6">
        {{ message }}
      </span>
    </div>
    <template #action>
      <div style="display: flex; gap: 12px; justify-content: flex-end">
        <n-button @click="emit('cancel')">Cancel</n-button>
        <n-button type="primary" @click="emit('confirm')">Continue</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { NModal } from "naive-ui";

defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: "" },
  message: { type: String, default: "" },
});

const emit = defineEmits(["cancel", "confirm"]);
</script>
