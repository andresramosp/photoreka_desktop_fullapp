<template>
  <div
    class="warning-badge"
    :class="extraClass"
    v-if="visible"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <span class="warning-icon">
      <slot name="icon">
        <n-icon :color="iconColor" size="18">
          <WarningIcon />
        </n-icon>
      </slot>
    </span>
    <span class="warning-text">{{ message }}</span>
    <span v-if="tooltip" class="info-icon">
      <n-tooltip trigger="hover" placement="top">
        <template #trigger>
          <n-icon size="14">
            <InfoCircleFilled />
          </n-icon>
        </template>
        {{ tooltip }}
      </n-tooltip>
    </span>
    <button
      v-if="closable"
      class="close-btn"
      @click="handleClose"
      aria-label="Close warning"
    >
      <n-icon size="16">
        <CloseCircle />
      </n-icon>
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { NIcon, NTooltip } from "naive-ui";
import { Warning20Filled as WarningIcon } from "@vicons/fluent";
import { Info20Filled as InfoIcon } from "@vicons/fluent";
import { CloseCircle } from "@vicons/ionicons5";
import { InfoCircleFilled } from "@vicons/antd";

const props = defineProps({
  message: { type: String, required: true },
  tooltip: { type: String, default: "" },
  closable: { type: Boolean, default: false },
  iconColor: { type: String, default: "var(--warning-color)" },
  extraClass: { type: String, default: "" },
});

const emit = defineEmits(["close"]);
const visible = ref(true);
const showTooltip = ref(false);

function handleClose() {
  visible.value = false;
  emit("close");
}
</script>

<style scoped>
.warning-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 193, 7, 0.12);
  border: 1px solid var(--warning-color, #ffc107);
  color: var(--warning-color, #ffc107);
  border-radius: 20px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  position: relative;
  max-width: 100%;
}
.warning-icon {
  display: flex;
  align-items: center;
}
.warning-text {
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: pre-line;
}
.info-icon {
  margin-left: 4px;
  display: flex;
  align-items: center;
}
.close-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  margin-left: 8px;
  display: flex;
  align-items: center;
  padding: 0;
}
</style>
