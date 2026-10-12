<script setup lang="ts">
import { computed, useId } from "vue";
import { formatScore } from "@/utils/picks/ranking";

const props = withDefaults(
  defineProps<{ value: number | null; size?: number; stroke?: number }>(),
  { size: 56, stroke: 4 },
);

const gradientId = `pk-ring-${useId()}`;
const radius = computed(() => (props.size - props.stroke) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const offset = computed(() => {
  const ratio = Math.min(1, Math.max(0, (props.value ?? 0) / 10));
  return circumference.value * (1 - ratio);
});
</script>

<template>
  <div class="pk-ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffe3a3" />
          <stop offset="55%" stop-color="#f4b740" />
          <stop offset="100%" stop-color="#d4861c" />
        </linearGradient>
      </defs>
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        :stroke-width="stroke"
      />
      <circle
        class="pk-ring-value"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke="`url(#${gradientId})`"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      />
    </svg>
    <span class="pk-ring-label" :style="{ fontSize: `${size * 0.34}px` }">
      {{ formatScore(value) }}
    </span>
  </div>
</template>

<style scoped>
.pk-ring {
  position: relative;
  flex-shrink: 0;
}

.pk-ring svg {
  display: block;
}

.pk-ring-value {
  transition: stroke-dashoffset 1s var(--pk-ease);
  filter: drop-shadow(0 0 6px rgba(244, 183, 64, 0.45));
}

.pk-ring-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--pk-serif);
  font-variant-numeric: lining-nums tabular-nums;
  letter-spacing: -0.02em;
  color: var(--pk-text);
}
</style>
