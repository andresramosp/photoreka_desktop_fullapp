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
      v-model:value="localValue"
      @update:value="handleSliderChange"
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
import { useDebounceFn } from "@vueuse/core";

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
const localValue = ref(1);

watch(
  () => props.modelValue,
  (val) => {
    if (val && typeof val === "object") {
      if (val.operator) localOperator.value = val.operator;
      localValue.value = val.value ?? 1;
    } else {
      localValue.value = 1;
    }
  },
  { immediate: true },
);

const currentValue = computed(() => localValue.value);

const setOperator = (op) => {
  localOperator.value = op;
  if (localValue.value > 1) {
    emit("update:modelValue", { value: localValue.value, operator: op });
  }
};

const emitValue = (val) => {
  if (val <= 1) {
    emit("update:modelValue", null);
  } else {
    emit("update:modelValue", { value: val, operator: localOperator.value });
  }
};

// v-model updates localValue immediately (smooth drag); this debounces the emit
const handleSliderChange = useDebounceFn((val) => {
  emitValue(val);
}, 300);

// Clear button — emit immediately
const onSliderChange = (val) => {
  localValue.value = val;
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
  border: 1px solid transparent;
  border-radius: 3px;
  background: var(--bg-control);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
  opacity: 0.6;
}

.sos-btn:hover {
  opacity: 1;
  background: var(--bg-control-hover);
}

.sos-btn.active {
  opacity: 1;
  background: var(--bg-subtle-active);
  color: var(--primary-color);
}

:deep(.n-slider) {
  --n-fill-color: var(--primary-color);
  --n-fill-color-hover: var(--primary-color-hover, var(--primary-color));
}
</style>
