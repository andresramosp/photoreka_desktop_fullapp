<template>
  <div v-if="show" class="confetti-container" @click="hide">
    <div
      v-for="(confetti, index) in confettiPieces"
      :key="index"
      class="confetti"
      :style="confetti.style"
    ></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  duration: {
    type: Number,
    default: 4000,
  },
  colors: {
    type: Array,
    default: () => [
      "#f43f5e",
      "var(--accent-color)",
      "#06b6d4",
      "#10b981",
      "#f59e0b",
      "#ef4444",
    ],
  },
  count: {
    type: Number,
    default: 100,
  },
});

const emit = defineEmits(["hide"]);

const confettiPieces = ref([]);
let animationTimeout = null;

const generateConfetti = () => {
  const pieces = [];
  for (let i = 0; i < props.count; i++) {
    const color = props.colors[Math.floor(Math.random() * props.colors.length)];
    const left = Math.random() * 100;
    const animationDelay = Math.random() * 3000;
    const animationDuration = 3000 + Math.random() * 2000;
    const size = 4 + Math.random() * 8;
    const rotation = Math.random() * 360;
    const rotationSpeed = 1 + Math.random() * 3;

    // Diferentes formas de serpentinas
    const shapes = ["rectangle", "circle", "triangle"];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];

    pieces.push({
      style: {
        left: `${left}%`,
        backgroundColor: color,
        width: shape === "circle" ? `${size}px` : `${size * 2}px`,
        height: `${size}px`,
        animationDelay: `${animationDelay}ms`,
        animationDuration: `${animationDuration}ms`,
        transform: `rotate(${rotation}deg)`,
        "--rotation-speed": `${rotationSpeed}s`,
        borderRadius:
          shape === "circle" ? "50%" : shape === "triangle" ? "0" : "2px",
        clipPath:
          shape === "triangle" ? "polygon(50% 0%, 0% 100%, 100% 100%)" : "none",
      },
    });
  }
  confettiPieces.value = pieces;
};

const hide = () => {
  emit("hide");
};

onMounted(() => {
  if (props.show) {
    generateConfetti();
    // Auto-hide después de la duración especificada
    animationTimeout = setTimeout(() => {
      hide();
    }, props.duration);
  }
});

onUnmounted(() => {
  if (animationTimeout) {
    clearTimeout(animationTimeout);
  }
});

// Regenerar serpentinas cuando show cambie a true
watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      generateConfetti();
      animationTimeout = setTimeout(() => {
        hide();
      }, props.duration);
    } else {
      if (animationTimeout) {
        clearTimeout(animationTimeout);
      }
    }
  },
);
</script>

<style scoped>
.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: auto;
  z-index: 9999;
  overflow: hidden;
  cursor: pointer;
}

.confetti {
  position: absolute;
  top: -20px;
  animation:
    confetti-fall linear forwards,
    confetti-spin var(--rotation-speed) linear infinite;
  pointer-events: none;
}

@keyframes confetti-fall {
  0% {
    top: -20px;
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    top: calc(100vh + 20px);
    opacity: 0;
  }
}

@keyframes confetti-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Variaciones de movimiento para hacer más realista */
.confetti:nth-child(3n) {
  animation:
    confetti-fall linear forwards,
    confetti-spin var(--rotation-speed) linear infinite,
    confetti-sway 2s ease-in-out infinite;
}

.confetti:nth-child(5n) {
  animation:
    confetti-fall linear forwards,
    confetti-spin var(--rotation-speed) linear infinite,
    confetti-sway 1.5s ease-in-out infinite reverse;
}

@keyframes confetti-sway {
  0%,
  100% {
    transform: translateX(0px) rotate(0deg);
  }
  25% {
    transform: translateX(10px) rotate(90deg);
  }
  50% {
    transform: translateX(-5px) rotate(180deg);
  }
  75% {
    transform: translateX(8px) rotate(270deg);
  }
}
</style>
