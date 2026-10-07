<script setup lang="ts">
import {
  PICKS_CRITERIA,
  type PicksCriterionKey,
  type PicksWeights,
} from "@/config/picks";
import { formatScore } from "@/utils/picks/ranking";
import type { PicksScores } from "@/utils/picks/types";

const props = defineProps<{
  scores: PicksScores | null;
  weights?: PicksWeights;
  focus?: PicksCriterionKey;
}>();

function isDimmed(key: PicksCriterionKey): boolean {
  if (props.focus) return props.focus !== key;
  if (props.weights) return !props.weights[key];
  return false;
}
</script>

<template>
  <ul class="pk-bars">
    <li
      v-for="(criterion, i) in PICKS_CRITERIA"
      :key="criterion.key"
      class="pk-bar"
      :class="{ 'is-dimmed': isDimmed(criterion.key) }"
      :title="criterion.description"
    >
      <span class="pk-bar-label">{{ criterion.label }}</span>
      <span class="pk-bar-value">{{ formatScore(scores?.[criterion.key]) }}</span>
      <span class="pk-bar-track">
        <span
          class="pk-bar-fill"
          :style="{
            width: `${(scores?.[criterion.key] ?? 0) * 10}%`,
            animationDelay: `${i * 60}ms`,
          }"
        />
      </span>
    </li>
  </ul>
</template>

<style scoped>
.pk-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.pk-bar {
  display: grid;
  grid-template-columns: 1fr auto;
  row-gap: 6px;
  transition: opacity 0.3s var(--pk-ease);
}

.pk-bar.is-dimmed {
  opacity: 0.35;
}

.pk-bar-label {
  font-size: 13px;
  color: var(--pk-text-2);
}

.pk-bar-value {
  font-family: var(--pk-serif);
  font-size: 14px;
  font-variant-numeric: lining-nums tabular-nums;
}

.pk-bar-track {
  grid-column: 1 / -1;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.pk-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #8b5cf6, #f4b740);
  transform-origin: left;
  animation: pk-bar-grow 0.9s var(--pk-ease) both;
}

.pk-bar:not(.is-dimmed) .pk-bar-fill {
  box-shadow: 0 0 10px rgba(244, 183, 64, 0.35);
}

@keyframes pk-bar-grow {
  from {
    transform: scaleX(0);
  }
}
</style>
