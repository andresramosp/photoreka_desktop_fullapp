<template>
  <button
    class="progress-button"
    :class="[
      `progress-button--${size}`,
      {
        'progress-button--block': block,
        'progress-button--complete': isComplete,
        'progress-button--busy': loading,
      },
    ]"
    :style="{ '--pb-progress': `${percent}%` }"
    :disabled="isDisabled"
    :title="title || undefined"
    :aria-disabled="isDisabled"
    type="button"
    @click="handleClick"
  >
    <!-- The filled portion. A full-size copy of the button clipped from the
         right, so the label crossing the fill boundary switches colour with it
         instead of sitting on top at a single contrast. -->
    <span
      class="progress-button__fill"
      :class="{ 'progress-button__fill--instant': !animated }"
      aria-hidden="true"
    >
      <span class="progress-button__content progress-button__content--on-fill">
        <n-icon v-if="icon" :size="iconSize" class="progress-button__icon">
          <component :is="icon" />
        </n-icon>
        <span class="progress-button__label"><slot /></span>
      </span>
    </span>

    <span class="progress-button__content">
      <n-spin v-if="loading" :size="iconSize" class="progress-button__icon" />
      <n-icon v-else-if="icon" :size="iconSize" class="progress-button__icon">
        <component :is="icon" />
      </n-icon>
      <span class="progress-button__label"><slot /></span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { NIcon, NSpin } from "naive-ui";

defineOptions({ name: "ProgressButton" });

/**
 * A call to action that doubles as its own progress bar: the button fills with
 * the enabled colour as `value` climbs towards `max`, and only becomes
 * clickable once it's full. No numbers — the fill *is* the message, so the
 * "3 more to go" caption underneath can go away.
 */
const props = withDefaults(
  defineProps<{
    /** Progress so far, in the same unit as `max`. */
    value: number;
    /** Value at which the button fills completely and turns enabled. */
    max: number;
    /** Optional leading icon component (e.g. a `@vicons` icon). */
    icon?: Component | null;
    /** Keeps the button disabled even at 100% (a separate precondition). */
    disabled?: boolean;
    loading?: boolean;
    size?: "small" | "medium" | "large";
    block?: boolean;
    /** Native tooltip — a good home for the "N more to go" detail. */
    title?: string;
    /** Off skips the fill transition (e.g. when restoring saved progress). */
    animated?: boolean;
  }>(),
  {
    icon: null,
    disabled: false,
    loading: false,
    size: "medium",
    block: true,
    title: "",
    animated: true,
  },
);

const emit = defineEmits<{ (e: "click", event: MouseEvent): void }>();

/** Clamped: a `max` of 0 means "nothing to wait for", so it reads as full. */
const ratio = computed(() => {
  if (!Number.isFinite(props.max) || props.max <= 0) return 1;
  return Math.min(1, Math.max(0, props.value / props.max));
});

const percent = computed(() => Math.round(ratio.value * 1000) / 10);
const isComplete = computed(() => ratio.value >= 1);
const isDisabled = computed(
  () => props.disabled || props.loading || !isComplete.value,
);

const iconSize = computed(
  () => ({ small: 14, medium: 16, large: 18 })[props.size],
);

const handleClick = (event: MouseEvent) => {
  if (isDisabled.value) return;
  emit("click", event);
};
</script>

<style scoped>
.progress-button {
  --pb-radius: 3px;
  --pb-fill: var(--primary-color);
  --pb-fill-text: #fff;
  --pb-track: color-mix(in srgb, var(--primary-color) 10%, transparent);
  --pb-track-border: color-mix(in srgb, var(--primary-color) 26%, transparent);
  --pb-track-text: var(--text-tertiary);

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 0 14px;
  border: 1px solid var(--pb-track-border);
  border-radius: var(--pb-radius);
  background: var(--pb-track);
  color: var(--pb-track-text);
  font-family: inherit;
  font-size: var(--font-size-sm, 14px);
  font-weight: var(--font-weight-medium, 500);
  line-height: 1;
  cursor: not-allowed;
  transition:
    color 0.25s ease,
    border-color 0.35s ease,
    background 0.35s ease;
}

.progress-button--small {
  height: 28px;
  font-size: var(--font-size-xs, 12px);
  padding: 0 10px;
}
.progress-button--medium {
  height: 34px;
}
.progress-button--large {
  height: 40px;
  padding: 0 18px;
}

.progress-button--block {
  display: flex;
  width: 100%;
}

/* Both layers stack in the same box so the clipped copy lines up glyph for
   glyph with the one underneath. */
.progress-button__content {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
}

.progress-button__fill {
  position: absolute;
  inset: 0;
  background: var(--pb-fill);
  color: var(--pb-fill-text);
  clip-path: inset(0 calc(100% - var(--pb-progress, 0%)) 0 0);
  transition: clip-path 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-button__fill--instant {
  transition: none;
}

.progress-button__content--on-fill {
  position: absolute;
  inset: 0;
}

.progress-button__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-button__icon {
  flex-shrink: 0;
  display: inline-flex;
}

/* Full: an ordinary primary button, borrowing the theme's hover/pressed steps
   so it sits alongside the naive-ui buttons without looking hand-rolled. */
.progress-button--complete {
  border-color: var(--pb-fill);
  color: var(--pb-fill-text);
  cursor: pointer;
}

.progress-button--complete:hover:not(:disabled) {
  --pb-fill: var(--primary-color-hover, var(--primary-color));
}

.progress-button--complete:active:not(:disabled) {
  --pb-fill: var(--primary-color-pressed, var(--primary-color));
}

.progress-button--busy {
  cursor: progress;
}

.progress-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .progress-button,
  .progress-button__fill {
    transition: none;
  }
}
</style>
