<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ percent: number; variant?: "main" | "upload" }>(),
  { variant: "main" },
);
const clamped = computed(() => Math.min(100, Math.max(0, props.percent)));
// The gradient is sized to the whole track, so the fill uncovers it from cyan
// towards amber instead of squeezing every colour into the filled part.
const fillStyle = computed(() => ({
  width: `${clamped.value}%`,
  ...(props.variant === "main" && {
    backgroundSize: `${10000 / Math.max(clamped.value, 1)}% 100%`,
  }),
}));
</script>

<template>
  <div
    class="pk-progress"
    :class="`is-${variant}`"
    role="progressbar"
    :aria-valuenow="Math.round(clamped)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="pk-progress-track">
      <div class="pk-progress-fill" :style="fillStyle">
        <span class="pk-progress-sheen" />
        <span
          v-if="variant === 'main' && clamped > 0 && clamped < 100"
          class="pk-progress-head"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pk-progress {
  width: 100%;
  padding: 10px 0;
}

.pk-progress-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}

.pk-progress-fill {
  position: relative;
  height: 100%;
  min-width: 10px;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee 0%, #8b5cf6 50%, #f59e0b 100%) 0 0 no-repeat;
  box-shadow:
    0 0 18px rgba(139, 92, 246, 0.55),
    0 0 42px rgba(245, 158, 11, 0.25);
  transition:
    width 0.8s var(--pk-ease),
    background-size 0.8s var(--pk-ease);
  overflow: visible;
}

.pk-progress-sheen {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
}

.pk-progress-sheen::after {
  content: "";
  position: absolute;
  inset: 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.55),
    transparent
  );
  animation: pk-sheen 2.2s var(--pk-ease) infinite;
}

.pk-progress-head {
  position: absolute;
  right: -7px;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: #fff7e0;
  box-shadow:
    0 0 12px 4px rgba(255, 217, 138, 0.9),
    0 0 36px 10px rgba(245, 158, 11, 0.55);
  animation: pk-pulse 1.4s ease-in-out infinite;
}

.pk-progress.is-upload {
  padding: 6px 0;
}

.is-upload .pk-progress-track {
  height: 4px;
}

.is-upload .pk-progress-fill {
  min-width: 4px;
  background: linear-gradient(90deg, #0ea5e9, #22d3ee) 0 0 / 100% 100% no-repeat;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.45);
}

@keyframes pk-sheen {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(320%);
  }
}

@keyframes pk-pulse {
  50% {
    transform: translateY(-50%) scale(1.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-progress-sheen::after,
  .pk-progress-head {
    animation: none;
  }
}
</style>
