<template>
  <main class="panel panel-center">
    <div v-if="isQuantumVoid" class="quantum-void">
      <div class="void-rings-layer">
        <div class="void-ring" style="--rs: 90px; --rd: 0s; --rdur: 6.5s" />
        <div class="void-ring" style="--rs: 190px; --rd: 1.6s; --rdur: 7.8s" />
        <div class="void-ring" style="--rs: 320px; --rd: 0.7s; --rdur: 9s" />
        <div class="void-ring" style="--rs: 470px; --rd: 2.3s; --rdur: 10.5s" />
        <div class="void-ring" style="--rs: 640px; --rd: 1.1s; --rdur: 12s" />
      </div>

      <div class="void-core" />

      <div class="void-caption">
        <p class="void-caption-main">· · · QUANTUM VOID · · ·</p>
        <p class="void-caption-sub">Awaiting materialization</p>
      </div>
    </div>

    <div v-else class="photo-universe-filled">
      <Photos2DPreview />
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Photos2DPreview from "@/components/Photos2DPreview.vue";

const props = defineProps<{
  photoCount: number;
}>();

const isQuantumVoid = computed(() => props.photoCount === 0);
// const isQuantumVoid = computed(() => true);
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background-color: var(--bg-deep-surface);
}

.panel-center {
  background-color: #06060e;
  border-left: 1px solid rgba(80, 60, 160, 0.15);
  border-right: 1px solid rgba(80, 60, 160, 0.15);
}

.quantum-void {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 48%,
    #0c0c22 0%,
    #07071a 35%,
    #030310 70%,
    #010108 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.quantum-void::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 0, 0, 0.04) 3px,
    rgba(0, 0, 0, 0.04) 4px
  );
  pointer-events: none;
  z-index: 2;
}

.void-rings-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.void-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--rs, 200px);
  height: var(--rs, 200px);
  border-radius: 50%;
  border: 1px solid rgba(110, 90, 220, 0.22);
  transform: translate(-50%, -50%) scale(0.96);
  animation: ringPulse var(--rdur, 8s) ease-in-out infinite;
  animation-delay: var(--rd, 0s);
}

@keyframes ringPulse {
  0% {
    transform: translate(-50%, -50%) scale(0.94);
    opacity: 0.03;
  }
  45% {
    opacity: 0.2;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.04);
    opacity: 0.2;
  }
  100% {
    transform: translate(-50%, -50%) scale(0.94);
    opacity: 0.03;
  }
}

.void-core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 240px;
  height: 180px;
  border-radius: 50%;
  background:
    radial-gradient(
      ellipse at 42% 48%,
      rgba(100, 78, 210, 0.3) 0%,
      transparent 58%
    ),
    radial-gradient(
      ellipse at 58% 52%,
      rgba(60, 40, 160, 0.18) 0%,
      transparent 52%
    );
  filter: blur(22px);
  transform: translate(-50%, -50%);
  animation: corePulse 5.5s ease-in-out infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes corePulse {
  0%,
  100% {
    opacity: 0.45;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.85;
    transform: translate(-50%, -50%) scale(1.18);
  }
}

.void-caption {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  z-index: 3;
  animation: captionBreathe 6s ease-in-out infinite;
}

.void-caption-main {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: rgba(155, 135, 255, 0.5);
  margin: 0 0 4px;
}

.void-caption-sub {
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(110, 90, 210, 0.3);
  margin: 0;
}

@keyframes captionBreathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

.photo-universe-filled {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  background: radial-gradient(
    ellipse at 50% 45%,
    rgba(20, 20, 50, 0.75) 0%,
    rgba(6, 6, 18, 0.96) 72%
  );
  overflow: hidden;
}

.photo-universe-filled-label {
  margin: 0;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(184, 168, 255, 0.72);
  border: 1px solid rgba(130, 112, 220, 0.28);
  border-radius: 999px;
  background: rgba(16, 14, 36, 0.6);
}

@media (max-width: 680px) {
  .panel-center {
    min-height: 300px;
  }

  .quantum-void {
    min-height: 300px;
  }
}
</style>
