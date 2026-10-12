<script setup lang="ts">
defineProps<{ calm?: boolean }>();
</script>

<template>
  <div class="pk-backdrop" :class="{ 'is-calm': calm }" aria-hidden="true">
    <div class="pk-blob pk-blob--cyan" />
    <div class="pk-blob pk-blob--violet" />
    <div class="pk-blob pk-blob--amber" />
    <div class="pk-grain" />
    <div class="pk-vignette" />
  </div>
</template>

<style scoped>
.pk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  transition: opacity 1.2s var(--pk-ease);
}

.pk-blob {
  position: absolute;
  width: 62vmax;
  height: 62vmax;
  border-radius: 50%;
  filter: blur(110px);
  opacity: 0.26;
  transition: opacity 1.2s var(--pk-ease);
  will-change: transform;
}

.pk-blob--cyan {
  top: -28vmax;
  left: -18vmax;
  background: radial-gradient(circle, #22d3ee 0%, transparent 65%);
  animation: pk-drift-a 34s ease-in-out infinite alternate;
}

.pk-blob--violet {
  top: 8vmax;
  right: -26vmax;
  background: radial-gradient(circle, #8b5cf6 0%, transparent 65%);
  animation: pk-drift-b 40s ease-in-out infinite alternate;
}

.pk-blob--amber {
  bottom: -34vmax;
  left: 18vmax;
  background: radial-gradient(circle, #f59e0b 0%, transparent 62%);
  opacity: 0.2;
  animation: pk-drift-c 46s ease-in-out infinite alternate;
}

.is-calm .pk-blob {
  opacity: 0.1;
}

.pk-grain {
  position: absolute;
  inset: -50%;
  opacity: 0.07;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: pk-grain 1.2s steps(4) infinite;
}

.pk-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 35%,
    transparent 0%,
    rgba(4, 4, 7, 0.55) 70%,
    rgba(4, 4, 7, 0.9) 100%
  );
}

@keyframes pk-drift-a {
  to {
    transform: translate(14vmax, 10vmax) scale(1.12);
  }
}
@keyframes pk-drift-b {
  to {
    transform: translate(-12vmax, 14vmax) scale(0.9);
  }
}
@keyframes pk-drift-c {
  to {
    transform: translate(10vmax, -12vmax) scale(1.15);
  }
}
@keyframes pk-grain {
  0% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(-3%, 2%);
  }
  50% {
    transform: translate(2%, -3%);
  }
  75% {
    transform: translate(-2%, -1%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-blob,
  .pk-grain {
    animation: none;
  }
}
</style>
