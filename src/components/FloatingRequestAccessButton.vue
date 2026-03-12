<template>
  <n-button
    v-if="shouldShow"
    size="large"
    type="info"
    class="floating-request-button"
    @click="handleClick"
  >
    <template #icon>
      <n-icon size="20">
        <RocketOutline />
      </n-icon>
    </template>
    Get Full Access
  </n-button>

  <RequestAccessDialog v-model:show="showDialog" />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useUserStore } from "@/stores/userStore";
import { RocketOutline } from "@vicons/ionicons5";
import RequestAccessDialog from "./RequestAccessDialog.vue";

const route = useRoute();
const userStore = useUserStore();
const showDialog = ref(false);
const isMobile = ref(false);

// Define las rutas donde NO debe aparecer el botón
const hiddenRoutes = [
  "canvas",
  "grid-maker",
  "sync-area",
  "settings",
  "help",
  "plan",
  "3d-view",
  "atlas",
  "2d-view",
];

// Verificar si el usuario está en modo demo
const isDemoUser = computed(() => {
  return userStore.user?.email === "demo@photorekatest.com";
});

// Detectar si es mobile
const checkIsMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

// Calcular si el botón debe mostrarse
const shouldShow = computed(() => {
  if (!isDemoUser.value) return false;

  // En mobile, solo mostrar en workspace
  if (isMobile.value) {
    return route.name === "workspace";
  }

  // En desktop, mostrar en todas partes excepto las rutas ocultas
  return !hiddenRoutes.includes(route.name);
});

// Manejar click del botón
const handleClick = () => {
  showDialog.value = true;
};

onMounted(() => {
  checkIsMobile();
  window.addEventListener("resize", checkIsMobile);
});

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
});
</script>

<style scoped>
.floating-request-button {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  height: 48px;
  padding: 0 24px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 24px;
  /* background: var(--accent-color);
  color: white;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.3),
    0 0 0 1px var(--accent-color);
  backdrop-filter: blur(12px);
  border: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: pulse-glow 2s ease-in-out infinite; */
}

/* .floating-request-button:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.4),
    0 0 0 2px var(--accent-color);
  background: var(--accent-color);
  filter: brightness(1.1);
}

.floating-request-button:active {
  transform: translateY(0) scale(1.02);
}

/* Animación de pulso sutil */
/* @keyframes pulse-glow {
  0%,
  100% {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.3),
      0 0 0 1px var(--accent-color);
  }
  50% {
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.4),
      0 0 12px var(--accent-color),
      0 0 0 1px var(--accent-color);
  }
} */

/* Transiciones de entrada/salida */
/* .fab-enter-active,
.fab-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fab-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(20px);
}

.fab-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(20px);
} */

/* Responsive */
@media (max-width: 768px) {
  .floating-request-button {
    bottom: 20px;
    right: 50%;
    transform: translateX(50%);
    left: auto;
    height: 44px;
    padding: 0 20px;
    font-size: 14px;
  }
}
</style>
