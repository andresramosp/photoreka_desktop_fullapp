<template>
  <div class="sos-wrapper">
    <div class="sos-header">
      <span class="sos-label">{{ label }}</span>
      <button
        v-if="currentValue > 1"
        class="sos-clear-btn"
        @click.stop="onSliderChange(1)"
        title="Clear"
      >
        ✕
      </button>
    </div>
    <div class="sos-operator-selector">
      <button
        :class="['sos-btn', { active: localOperator === '>=' }]"
        @click="setOperator('>=')"
        @click.stop
        title="Mayor o igual que"
      >
        ≥
      </button>
      <button
        :class="['sos-btn', { active: localOperator === '<=' }]"
        @click="setOperator('<=')"
        @click.stop
        title="Menor o igual que"
      >
        ≤
      </button>
    </div>
    <n-slider
      :value="currentValue"
      @update:value="onSliderChange"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      @click.stop
      @pointerdown.stop
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NSlider } from "naive-ui";

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: [Object, Number], default: null },
  disabled: { type: Boolean, default: false },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 10 },
  step: { type: Number, default: 0.5 },
});

const emit = defineEmits(["update:modelValue"]);

const localOperator = ref(">=");

watch(
  () => props.modelValue,
  (val) => {
    if (val && typeof val === "object" && val.operator) {
      localOperator.value = val.operator;
    }
  },
  { immediate: true },
);

const currentValue = computed(() => {
  if (!props.modelValue) return 1;
  return typeof props.modelValue === "object"
    ? props.modelValue.value
    : props.modelValue;
});

const setOperator = (op) => {
  localOperator.value = op;
  if (currentValue.value > 1) {
    emit("update:modelValue", { value: currentValue.value, operator: op });
  }
};

const onSliderChange = (val) => {
  if (val <= 1) {
    emit("update:modelValue", null);
  } else {
    emit("update:modelValue", { value: val, operator: localOperator.value });
  }
};
</script>

<style scoped>
.sos-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sos-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.sos-value {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.sos-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  font-size: 9px;
  line-height: 1;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.sos-clear-btn:hover {
  opacity: 1;
  color: var(--error-color, #e88080);
}

.sos-operator-selector {
  display: flex;
  gap: 3px;
}

.sos-btn {
  flex: 1;
  padding: 1px 0;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 3px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
  opacity: 0.6;
}

.sos-btn:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.sos-btn.active {
  opacity: 1;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  color: var(--primary-color);
}

:deep(.n-slider) {
  --n-fill-color: var(--primary-color);
  --n-fill-color-hover: var(--primary-color-hover, var(--primary-color));
}
</style>
