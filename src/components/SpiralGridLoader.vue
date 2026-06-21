<template>
  <div
    class="spiral-grid-loader"
    :class="`variant-${variant}`"
    :style="rootStyle"
    role="status"
    aria-label="Loading"
  >
    <div class="spiral-grid">
      <span
        v-for="(cell, index) in cells"
        :key="index"
        class="spiral-cell"
        :style="{ animationDelay: cell.delay }"
      />
    </div>
    <p v-if="text" class="spiral-grid-text">{{ text }}</p>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  /** Color theme of the squares: 'primary' (theme blue) or 'white' */
  variant: {
    type: String,
    default: "primary",
    validator: (v) => ["primary", "white"].includes(v),
  },
  /** Total size of the 3x3 grid in pixels */
  size: {
    type: [Number, String],
    default: 64,
  },
  /** Full duration of one spiral cycle in milliseconds */
  duration: {
    type: Number,
    default: 1500,
  },
  /** Optional caption rendered under the grid */
  text: {
    type: String,
    default: "",
  },
});

// Spiral step assigned to each cell (DOM order 0..8 in a 3x3 grid).
// Clockwise outer spiral that finishes in the center cell.
// Layout:  0 1 2
//          3 4 5
//          6 7 8
// Path:    0 -> 1 -> 2 -> 5 -> 8 -> 7 -> 6 -> 3 -> 4
const SPIRAL_STEPS = [0, 1, 2, 7, 8, 3, 6, 5, 4];

const cells = computed(() =>
  SPIRAL_STEPS.map((step) => ({
    delay: `${(step / SPIRAL_STEPS.length) * props.duration}ms`,
  })),
);

const rootStyle = computed(() => {
  const size = typeof props.size === "number" ? `${props.size}px` : props.size;
  return {
    "--sg-size": size,
    "--sg-duration": `${props.duration}ms`,
  };
});
</script>

<style scoped>
.spiral-grid-loader {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spiral-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: calc(var(--sg-size) * 0.12);
  width: var(--sg-size);
  height: var(--sg-size);
}

.spiral-cell {
  width: 100%;
  height: 100%;
  border-radius: calc(var(--sg-size) * 0.06);
  background: var(--sg-base);
  transform: scale(0.82);
  opacity: 0.18;
  will-change: transform, opacity, box-shadow;
  animation: spiral-pulse var(--sg-duration) cubic-bezier(0.4, 0, 0.2, 1)
    infinite;
}

/* Primary (theme blue) variant */
.variant-primary {
  --sg-base: var(--primary-color, #2563eb);
  --sg-glow: var(--primary-color, #2563eb);
  --sg-bright: var(--primary-color-hover, #3b82f6);
}

/* White variant */
.variant-white {
  --sg-base: #ffffff;
  --sg-glow: rgba(255, 255, 255, 0.85);
  --sg-bright: #ffffff;
}

@keyframes spiral-pulse {
  0%,
  70%,
  100% {
    transform: scale(0.82);
    opacity: 0.18;
    background: var(--sg-base);
    box-shadow: none;
  }
  20% {
    transform: scale(1);
    opacity: 1;
    background: var(--sg-bright);
    box-shadow:
      0 0 calc(var(--sg-size) * 0.18) var(--sg-glow),
      0 0 calc(var(--sg-size) * 0.06) var(--sg-glow);
  }
}

.spiral-grid-text {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.2px;
  color: var(--text-secondary, #a8a8a8);
}

@media (prefers-reduced-motion: reduce) {
  .spiral-cell {
    animation-duration: calc(var(--sg-duration) * 2);
  }
}
</style>
