<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-notification-provider>
      <n-message-provider>
        <!-- Landing Page Layout (no sidebar) -->
        <router-view
          v-if="
            route.name === 'landing' ||
            route.name === 'canvas-playground' ||
            route.name === 'free-framer' ||
            route.name === '3d-catalog' ||
            route.name === 'shared-atlas' ||
            route.name === 'shared-series' ||
            route.name === 'terms' ||
            route.name === 'maintenance' ||
            route.name === 'reset-password' ||
            route.name === 'confirm-email'
          "
        />

        <!-- Authentication Layout -->
        <router-view
          v-else-if="!userStore.isAuthenticated && route.name === 'auth'"
        />

        <!-- Profile Setup Layout (authenticated but special case) -->
        <router-view
          v-else-if="
            route.name === 'profile-setup' ||
            route.name === 'storage-plan-setup'
          "
        />

        <!-- Authenticated App Layout -->
        <template v-else>
          <!-- Desktop Layout -->
          <n-layout
            v-if="!isMobile"
            has-sider
            style="height: 100vh"
            class="app-layout"
            :style="{
              '--total-header-offset': showDashboardHeader ? '112px' : '48px',
            }"
          >
            <DashboardSidebar />
            <n-layout class="main-layout">
              <DashboardHeader v-if="showDashboardHeader" />
              <n-layout-content
                class="main-content"
                :style="{
                  height: showDashboardHeader ? 'calc(100vh - 64px)' : '100vh',
                }"
              >
                <router-view v-slot="{ Component, route }">
                  <KeepAlive :include="getKeepAliveComponents()">
                    <component :is="Component" />
                  </KeepAlive>
                </router-view>
              </n-layout-content>
            </n-layout>
          </n-layout>

          <!-- Mobile Layout -->
          <div
            v-else
            class="mobile-layout"
            :style="{
              '--total-header-offset': showDashboardHeader ? '112px' : '48px',
            }"
          >
            <!-- Mobile sidebar overlay - completely separate from layout -->
            <DashboardSidebar
              :mobile-menu-open="mobileMenuOpen"
              @close-mobile-menu="mobileMenuOpen = false"
            />

            <!-- Main mobile content -->
            <div class="mobile-content">
              <DashboardHeader
                v-if="showDashboardHeader"
                @toggle-mobile-menu="toggleMobileMenu"
              />
              <div
                class="main-content mobile-main-content"
                :style="{
                  height: showDashboardHeader ? 'calc(100vh - 64px)' : '100vh',
                }"
              >
                <router-view v-slot="{ Component, route }">
                  <KeepAlive :include="getKeepAliveComponents()">
                    <component :is="Component" />
                  </KeepAlive>
                </router-view>
              </div>
            </div>
          </div>

          <!-- Floating Add Photos Button -->
          <FloatingAddPhotosButton />

          <!-- Welcome Modal for new users -->
          <WelcomeModal
            v-model="showWelcomeModal"
            @get-started="onWelcomeFinish"
          />

          <!-- Onboarding Slider (for later - after processing 100+ photos) -->
          <OnboardingSlider
            v-model="showOnboarding"
            @finish="onOnboardingFinish"
          />

          <!-- Confetti Effect for first process completion -->
          <ConfettiEffect
            :show="showConfetti"
            @hide="hideConfetti"
            :duration="4000"
            :colors="[
              '#8b5cf6',
              '#06b6d4',
              '#10b981',
              '#f59e0b',
              '#ef4444',
              '#f43f5e',
            ]"
            :count="120"
          />
        </template>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, onMounted, onUnmounted, KeepAlive, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "./stores/userStore";
import DashboardSidebar from "./components/DashboardSidebar.vue";
import DashboardHeader from "./components/DashboardHeader.vue";
import FloatingAddPhotosButton from "./components/FloatingAddPhotosButton.vue";
import { usePhotosStore } from "@/stores/photos.js";
import OnboardingSlider from "./components/OnboardingSlider.vue";
import WelcomeModal from "./components/WelcomeModal.vue";
import ConfettiEffect from "./components/ConfettiEffect.vue";
import { useThemeInit } from "@/composables/useTheme.js";

const route = useRoute();
const router = useRouter();

// Inicializar tema centralizado
const { naiveTheme: darkTheme, naiveThemeOverrides: themeOverrides } =
  useThemeInit();

// List of route names where DashboardHeader should be visible
const allowedHeaderViews = [
  "dashboard",
  "collections",
  "collection-detail",
  "photo-hub",
  "series",
  // "search",
  // "project-builder",
  // "profile",
  // "settings",
  // Add more route names as needed
];

const showDashboardHeader = computed(() => {
  if (!route.name) return false;
  return allowedHeaderViews.some(
    (prefix) => typeof route.name === "string" && route.name.startsWith(prefix)
  );
});
const photosStore = usePhotosStore();
const userStore = useUserStore();

// KeepAlive functionality
const getKeepAliveComponents = () => {
  // Lista explícita de componentes que deben mantenerse alive
  // Esto es más confiable que intentar extraer nombres dinámicamente
  const keepAliveComponents = [
    "CanvasView",
    "SearchView",
    "CollectionsView",
    "PhotoHubView",
    "ProjectBuilderView",
    "FramerView",
    "GridMakerView",
    "3DView",
  ];

  // Debug: log components being kept alive
  console.log("KeepAlive components:", keepAliveComponents);
  return keepAliveComponents;
};

const mobileMenuOpen = ref(false);
const isMobile = ref(false);

// Mostrar onboarding después del primer proceso completado
const showOnboarding = ref(false);
const showConfetti = ref(false);

// Welcome modal simple con delay para evitar parpadeos

// Controla si el usuario ya cerró el WelcomeModal
const welcomeDismissed = ref(false);
const showWelcomeModal = computed(() => {
  // return true;
  // Solo mostrar si el usuario está autenticado, no tiene fotos y no lo ha cerrado manualmente
  return (
    userStore.isAuthenticated &&
    photosStore.photos?.length === 0 &&
    !welcomeDismissed.value
  );
});

const onWelcomeFinish = () => {
  welcomeDismissed.value = true;
  console.log("Welcome completed!");
};

// Chequea si el onboarding ya fue mostrado para este usuario
const checkShowOnboarding = () => {
  // El onboarding solo se activa desde triggerFirstProcessOnboarding()
  // Esta función ya no decide cuándo mostrar el onboarding
  showOnboarding.value = false;
};

// Función para mostrar onboarding cuando se completa el primer proceso
const triggerFirstProcessOnboarding = () => {
  const userId = userStore.user?.id;
  if (!userId || !userStore.isAuthenticated) return;

  const onboardingKey = `onboarding_shown_${userId}`;
  const alreadyShown = localStorage.getItem(onboardingKey) === "true";

  if (!alreadyShown) {
    // Cerrar welcome modal si está abierto
    showWelcomeModal.value = false;

    // Primero mostrar el efecto de serpentinas
    showConfetti.value = true;

    // Después de un pequeño delay, mostrar el onboarding
    setTimeout(() => {
      showOnboarding.value = true;
    }, 1000);
  }
};

// Función para ocultar las serpentinas
const hideConfetti = () => {
  showConfetti.value = false;
};

// Hacer la función disponible globalmente para ser llamada desde ProcessingPhotos
window.triggerFirstProcessOnboarding = triggerFirstProcessOnboarding;

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};

const checkIsMobile = () => {
  isMobile.value = window.innerWidth < 768;
  if (!isMobile.value) {
    mobileMenuOpen.value = false;
  }
};

onMounted(() => {
  checkIsMobile();
  window.addEventListener("resize", checkIsMobile);
  // Espera a que el usuario esté autenticado antes de cargar las fotos
  if (userStore.isAuthenticated) {
    photosStore.getOrFetch(true);
    checkShowOnboarding();
  }
});

// Watcher para cargar fotos cuando el usuario se autentica
watch(
  () => userStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      // Si el usuario se autentica pero aún está en la página de auth, redirigir inmediatamente
      if (route.name === "auth") {
        router.replace("/dashboard");
      }
      photosStore.getOrFetch(true);
      checkShowOnboarding();
    } else {
      showOnboarding.value = false;
      showWelcomeModal.value = false;
    }
  }
);

// Watcher para cuando el usuario esté disponible tras login/refresh
watch(
  () => userStore.user?.id,
  (userId) => {
    if (userStore.isAuthenticated && userId) {
      checkShowOnboarding();
    }
  }
);

// Watcher adicional para forzar redirección si el usuario autenticado está en auth
watch(
  [() => userStore.isAuthenticated, () => route.name],
  ([isAuth, routeName]) => {
    if (isAuth && routeName === "auth") {
      router.replace("/dashboard");
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
  // Limpiar función global
  delete window.triggerFirstProcessOnboarding;
});

const onOnboardingFinish = () => {
  showOnboarding.value = false;
  // Guarda en localStorage que el onboarding ya fue mostrado para este usuario
  const userId = userStore.user?.id;
  if (userId) {
    const onboardingKey = `onboarding_shown_${userId}`;
    localStorage.setItem(onboardingKey, "true");
  }
  console.log("Onboarding completed!");
};
</script>

<style scoped>
.app-layout {
  position: relative;
}

.main-layout {
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 100vh;
}

.main-content {
  background-color: #101014;
  overflow: auto;
  transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Mobile layout styles */
.mobile-layout {
  position: relative;
  height: 100vh;
  background-color: #101014;
}

.mobile-content {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.mobile-main-content {
  flex: 1;
  overflow: auto;
  background-color: #101014;
  height: calc(100vh - 64px);
}

/* Responsive styles - padding removed for full canvas expansion */
</style>

<style>
@import url("https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800;900&display=swap");

body {
  margin: 0;
  font-family: "Work Sans", -apple-system, BlinkMacSystemFont, "Segoe UI",
    "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
    "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #101014;
}

#app {
  height: 100vh;
}
</style>
