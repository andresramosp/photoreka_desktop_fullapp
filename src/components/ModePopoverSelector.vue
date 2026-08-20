<template>
  <n-popover
    v-if="options.length > 0"
    v-model:show="isOpen"
    trigger="click"
    :placement="placement"
    :width="width"
    raw
    class="mode-selector-popover"
  >
    <template #trigger>
      <n-button
        secondary
        size="small"
        :type="resolvedButtonType"
        :circle="singleMode"
        :disabled="disabled"
        class="mode-selector-trigger"
        :class="{ 'mode-selector-trigger--full': fullWidth }"
        :title="triggerTitle"
        :aria-label="ariaLabel"
      >
        <template #icon>
          <n-icon :size="13"><component :is="selectedIcon" /></n-icon>
        </template>
        <span v-if="!singleMode" class="mode-selector-trigger-label">{{
          selectedOption?.label || placeholder
        }}</span>
      </n-button>
    </template>

    <div
      class="mode-selector-panel"
      :style="{ '--chip-color': colorVar }"
      @click.stop
    >
      <div class="mode-selector-panel-header">{{ header }}</div>
      <div
        v-for="option in options"
        :key="option.value"
        class="mode-selector-item"
        :class="{
          active: option.value === currentValue,
          disabled: option.disabled,
        }"
        @click="!option.disabled && selectOption(option.value)"
      >
        <div class="mode-selector-item-header">
          <span class="mode-selector-item-name">{{ option.label }}</span>
          <span v-if="option.costFactor != null" class="mode-selector-item-cost"
            >×{{ option.costFactor }}</span
          >
        </div>
        <div v-if="option.description" class="mode-selector-item-desc">
          {{ option.description }}
        </div>
      </div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import { NButton, NIcon, NPopover } from "naive-ui";
import { SettingsOutline, SparklesOutline } from "@vicons/ionicons5";

interface ModeSelectorOption {
  label: string;
  value: string;
  description?: string;
  costFactor?: number | null;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    options: ModeSelectorOption[];
    header: string;
    icon?: "sparkles" | "settings";
    // Overrides `icon` with an arbitrary icon component, for callers whose
    // trigger doesn't fit either preset (e.g. an export/action icon).
    customIcon?: Component | null;
    ariaLabel?: string;
    placement?: "top-end" | "bottom-end" | "top-start" | "bottom-start";
    width?: number;
    placeholder?: string;
    accent?: boolean;
    singleMode?: boolean;
    disabled?: boolean;
    // Overrides the accent-derived button color (e.g. "primary").
    buttonType?:
      | "default"
      | "primary"
      | "info"
      | "success"
      | "warning"
      | "error"
      | "tertiary"
      | null;
    // Stretches the trigger button to fill its container.
    fullWidth?: boolean;
  }>(),
  {
    icon: "sparkles",
    customIcon: null,
    ariaLabel: "Change mode",
    placement: "bottom-end",
    width: 260,
    placeholder: "Mode",
    accent: true,
    singleMode: false,
    disabled: false,
    buttonType: null,
    fullWidth: false,
  },
);

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

const isOpen = ref(false);

const selectedIcon = computed(
  () =>
    props.customIcon ||
    (props.icon === "settings" ? SettingsOutline : SparklesOutline),
);

const colorVar = computed(() =>
  props.accent ? "var(--accent-color)" : "var(--text-secondary)",
);

const resolvedButtonType = computed(
  () => props.buttonType ?? (props.accent ? "info" : "default"),
);

const currentValue = computed(
  () => props.modelValue ?? props.options[0]?.value ?? null,
);

const selectedOption = computed(
  () =>
    props.options.find((option) => option.value === currentValue.value) || null,
);

const triggerTitle = computed(
  () =>
    selectedOption.value?.description ||
    selectedOption.value?.label ||
    props.ariaLabel,
);

const selectOption = (value: string) => {
  emit("update:modelValue", value);
  isOpen.value = false;
};
</script>

<style scoped>
.mode-selector-trigger {
  min-width: 0;
}

.mode-selector-trigger--full {
  width: 100%;
  justify-content: center;
}

.mode-selector-trigger-label {
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.mode-selector-panel {
  padding: var(--spacing-xs) 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.mode-selector-panel-header {
  padding: var(--spacing-xs) var(--spacing-md) var(--spacing-sm);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.mode-selector-item {
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background 0.12s;
}

.mode-selector-item:hover {
  background: color-mix(
    in srgb,
    var(--chip-color, var(--accent-color)) 6%,
    var(--bg-surface)
  );
}

.mode-selector-item.active {
  background: color-mix(
    in srgb,
    var(--chip-color, var(--accent-color)) 10%,
    var(--bg-surface)
  );
}

.mode-selector-item.active .mode-selector-item-name {
  color: var(--chip-color, var(--accent-color));
  font-weight: var(--font-weight-semibold);
}

.mode-selector-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.mode-selector-item-name {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: var(--line-height-tight);
}

.mode-selector-item-cost {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: var(--font-weight-semibold);
  opacity: 0.7;
  flex-shrink: 0;
}

.mode-selector-item-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.35;
  margin-top: 2px;
}

.mode-selector-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: auto;
}

.mode-selector-item.disabled:hover {
  background: transparent;
}
</style>
