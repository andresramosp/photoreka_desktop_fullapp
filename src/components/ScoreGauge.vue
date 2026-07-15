<template>
  <!--
    viewBox "0 0 200 110":
      arc centre (100, 95), radius 70  →  top at y=25, sides at x=30/170
      with stroke-width 12 → ±6px bleed → viewBox has 30px left margin, 25px top margin
  -->
  <div
    class="score-gauge"
    :class="{ 'score-gauge--clickable': clickable }"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="handleActivate"
    @keydown.enter.prevent="handleActivate"
    @keydown.space.prevent="handleActivate"
  >
    <svg viewBox="0 0 200 110" class="score-gauge__svg">
      <defs>
        <linearGradient :id="`g-${uid}`" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop
            offset="0%"
            :stop-color="color || '#6366f1'"
            :stop-opacity="color ? 0.6 : 0.7"
          />
          <stop offset="100%" :stop-color="color || '#06b6d4'" />
        </linearGradient>
      </defs>
      <!-- Track -->
      <path
        d="M 30 95 A 70 70 0 0 1 170 95"
        fill="none"
        class="score-gauge__track"
        stroke-width="12"
        stroke-linecap="round"
      />
      <!-- Filled arc -->
      <path
        v-if="value != null && value > 0"
        :d="arcPath"
        fill="none"
        :stroke="`url(#g-${uid})`"
        stroke-width="12"
        stroke-linecap="round"
      />
      <!-- Score -->
      <text
        x="100"
        y="82"
        text-anchor="middle"
        font-size="38"
        font-weight="700"
        class="score-gauge__value"
        font-family="system-ui,sans-serif"
      >
        {{ value != null ? Number(value).toFixed(1) : "·" }}
      </text>
      <!-- /10 -->
      <text
        x="100"
        y="100"
        text-anchor="middle"
        font-size="11"
        class="score-gauge__max"
        font-family="system-ui,sans-serif"
      >
        / 10
      </text>
    </svg>
    <span class="score-gauge__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label: string;
  value: number | null;
  max?: number;
  color?: string;
  clickable?: boolean;
}>();

const emit = defineEmits<{
  (event: "click"): void;
}>();

const uid = Math.random().toString(36).slice(2, 7);

const handleActivate = () => {
  if (!props.clickable) return;
  emit("click");
};

const arcPath = computed((): string => {
  const max = props.max ?? 10;
  if (props.value == null) return "";
  // arc: centre (100,95), r=70, from 180° (left) sweeping clockwise to end angle
  const r = 70,
    cx = 100,
    cy = 95;
  const frac = Math.max(0, Math.min(1, Number(props.value) / max));
  if (frac <= 0.005) return "";
  // Start = left side (180°), sweep clockwise by frac*180°
  const sweepDeg = frac * 180;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const endAngle = 180 - sweepDeg; // in standard math angle from positive-x axis
  const endX = cx + r * Math.cos(toRad(endAngle));
  const endY = cy - r * Math.sin(toRad(endAngle));
  return `M 30 ${cy} A ${r} ${r} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
});
</script>

<style scoped>
.score-gauge {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 7px 10px 7px;
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.score-gauge--clickable {
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.score-gauge--clickable:hover,
.score-gauge--clickable:focus-visible {
  border-color: var(--primary-color);
  box-shadow: 0 2px 12px
    color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.score-gauge--clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  outline-offset: 2px;
}

.score-gauge__svg {
  width: 100%;
  max-width: 200px;
  height: auto;
  display: block;
}

.score-gauge__track {
  stroke: var(--border-color);
}

.score-gauge__value {
  fill: var(--text-primary);
}

.score-gauge__max {
  fill: var(--text-tertiary);
}

.score-gauge__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
