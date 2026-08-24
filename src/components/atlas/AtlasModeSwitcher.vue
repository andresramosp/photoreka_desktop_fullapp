<template>
  <n-radio-group
    :value="modelValue"
    size="small"
    class="atlas-mode-switcher"
    aria-label="Atlas view mode"
    @update:value="handleUpdate"
  >
    <n-radio-button
      v-for="opt in options"
      :key="opt.value"
      :value="opt.value"
      :disabled="opt.disabled"
      :title="opt.disabled ? opt.disabledHint : opt.label"
    >
      {{ opt.label }}
    </n-radio-button>
  </n-radio-group>
</template>

<script setup>
import { computed } from "vue";
import { NRadioGroup, NRadioButton } from "naive-ui";

const props = defineProps({
  modelValue: { type: String, default: "2d" },
  disable3d: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(["request-change"]);

const options = computed(() => [
  {
    value: "2d",
    label: "2D",
    disabled: props.loading,
    disabledHint: props.loading ? "Loading atlas…" : "2D",
  },
  {
    value: "3d",
    label: "3D",
    disabled: props.disable3d || props.loading,
    disabledHint: props.disable3d
      ? "3D is only available on desktop"
      : props.loading
        ? "Loading atlas…"
        : "3D",
  },
]);

function handleUpdate(value) {
  if (value === props.modelValue) return;
  emit("request-change", value);
}
</script>

<style scoped>
/* remove the inset border/glow ring naive-ui draws on each button */
.atlas-mode-switcher :deep(.n-radio-button__state-border) {
  display: none !important;
}

/* remove the real borders and the divider between buttons */
.atlas-mode-switcher :deep(.n-radio-button) {
  border: none !important;
}
.atlas-mode-switcher :deep(.n-radio-group__splitor) {
  display: none !important;
}
</style>
