<template>
  <div
    class="pie-progress"
    :style="{ width: size + 'px', height: size + 'px' }"
  >
    <svg :width="size" :height="size" class="pie-svg">
      <!-- Background circle (only show if not 100%) -->
      <circle
        v-if="percentage < 100"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :fill="backgroundColor"
        :stroke="strokeColor"
        :stroke-width="strokeWidth"
      />
      <!-- Full circle when 100% -->
      <circle
        v-if="percentage >= 100"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        :fill="progressColor"
        :stroke="strokeColor"
        :stroke-width="strokeWidth"
      />
      <!-- Progress pie slice (only show if less than 100%) -->
      <path
        v-if="percentage > 0 && percentage < 100"
        :d="pathData"
        :fill="progressColor"
        :stroke="strokeColor"
        :stroke-width="strokeWidth"
      />
    </svg>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  percentage: {
    type: Number,
    default: 0,
    validator: (value) => value >= 0 && value <= 100,
  },
  size: {
    type: Number,
    default: 24,
  },
  progressColor: {
    type: String,
    default: "#18a058",
  },
  backgroundColor: {
    type: String,
    default: "#f0f0f0",
  },
  strokeColor: {
    type: String,
    default: "#ffffff",
  },
  strokeWidth: {
    type: Number,
    default: 1,
  },
});

const radius = computed(() => (props.size - props.strokeWidth * 2) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const pathData = computed(() => {
  if (props.percentage <= 0 || props.percentage >= 100) return "";

  const angle = Math.min(359.99, (props.percentage / 100) * 360); // Prevent 360 degree issues
  const radians = (angle - 90) * (Math.PI / 180); // Start from top (-90 degrees)

  const cx = props.size / 2;
  const cy = props.size / 2;
  const r = radius.value;

  const startX = cx;
  const startY = cy - r;

  const endX = cx + r * Math.cos(radians);
  const endY = cy + r * Math.sin(radians);

  const largeArcFlag = angle > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
});
</script>

<style scoped>
.pie-progress {
  display: inline-block;
  position: relative;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.pie-svg {
  transform: rotate(0deg);
  overflow: visible;
}
</style>
