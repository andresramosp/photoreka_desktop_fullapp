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
            route.name === 'confirm-email' ||
            route.name === 'auth-callback' ||
            route.name === 'auth-error'
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
                <!-- Mostrar loader mientras la app se inicializa (solo en vistas autenticadas) -->
                <AppInitLoader v-if="!isAppReady" />
                <router-view v-else v-slot="{ Component, route }">
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
                <!-- Mostrar loader mientras la app se inicializa (solo en vistas autenticadas) -->
                <AppInitLoader v-if="!isAppReady" />
                <router-view v-else v-slot="{ Component, route }">
                  <KeepAlive :include="getKeepAliveComponents()">
                    <component :is="Component" />
                  </KeepAlive>
                </router-view>
              </div>
            </div>
          </div>

          <!-- Floating Request Access Button (solo en modo demo) -->
          <FloatingRequestAccessButton />

          <!-- Confetti Effect for first process completion -->
          <ConfettiEffect
            :show="showConfetti"
            @hide="hideConfetti"
            :duration="4000"
            :colors="[
              'var(--accent-color)',
              '#06b6d4',
              '#10b981',
              '#f59e0b',
              '#ef4444',
              '#f43f5e',
            ]"
            :count="120"
          />

          <!-- Mobile Welcome Banner -->
          <MobileWelcomeBanner />
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
import FloatingRequestAccessButton from "./components/FloatingRequestAccessButton.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import ConfettiEffect from "./components/ConfettiEffect.vue";
import AppInitLoader from "./components/AppInitLoader.vue";
import { useThemeInit } from "@/composables/useTheme.js";
import MobileWelcomeBanner from "./components/MobileWelcomeBanner.vue";

const route = useRoute();
const router = useRouter();

// Inicializar tema centralizado
const {
  naiveTheme: darkTheme,
  naiveThemeOverrides: themeOverrides,
  initTheme,
} = useThemeInit();

// Re-aplicar tema cuando cambia la ruta (para temas forzados por landing/app)
watch(
  () => route.path,
  () => {
    initTheme();
  },
  { immediate: false },
);

// List of route names where DashboardHeader should be visible
const allowedHeaderViews = [
  "dashboard",
  "collections",
  "collection-detail",
  "photo-hub",
  "series",
  "search",
  "project-builder",
  "framer",
  "workspace",
  "sync-area",
  "settings",
  "help",
  "report",
  "chat-lab",
  // "settings",
  // Add more route names as needed
];

const showDashboardHeader = computed(() => {
  if (!route.name) return false;
  return allowedHeaderViews.some(
    (prefix) => typeof route.name === "string" && route.name.startsWith(prefix),
  );
});
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const userStore = useUserStore();

// La app está lista cuando:
// 1. userStore.isInitialized es true (se completó initAuth y fetchUsage)
// 2. Si el usuario está autenticado, photosStore.isInitialized también debe ser true
const isAppReady = computed(() => {
  // Primero debe completarse la inicialización del usuario
  if (!userStore.isInitialized) {
    return false;
  }

  // Si el usuario está autenticado, esperar a que el catálogo también esté inicializado
  if (userStore.isAuthenticated && !photosStore.isInitialized) {
    return false;
  }

  return true;
});

// KeepAlive functionality
const getKeepAliveComponents = () => {
  // Lista explícita de componentes que deben mantenerse alive
  // Esto es más confiable que intentar extraer nombres dinámicamente
  const keepAliveComponents = [
    "CanvasView",
    "SearchView",
    "CollectionsView",
    "SyncAreaView",
    "ProjectBuilderView",
    "FramerView",
    "GridMakerView",
    "3DView",
    "2DView",
    "ChatView",
  ];

  // Debug: log components being kept alive
  console.log("KeepAlive components:", keepAliveComponents);
  return keepAliveComponents;
};

const mobileMenuOpen = ref(false);
const isMobile = ref(false);
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

// Función para ocultar las serpentinas
const hideConfetti = () => {
  showConfetti.value = false;
};

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
  // La carga inicial ya se maneja en el watcher de isAuthenticated
});

// Watcher para cargar fotos cuando el usuario se autentica
watch(
  () => userStore.isAuthenticated,
  (isAuth, wasAuth) => {
    if (isAuth) {
      // Resetear todos los stores antes de cargar datos nuevos (limpia datos de sesiones previas)
      photosStore.resetStore();
      collectionsStore.resetStore();
      seriesStore.resetStore();

      // Esperar a cargar el catálogo y decidir a dónde ir
      photosStore.getOrFetch(true).then(() => {
        console.log(route.path);
        if (
          route.path === "/" ||
          route.path === "/dashboard" ||
          route.path === "/auth" ||
          route.path === "/auth/callback"
        ) {
          // Si el usuario no tiene perfil configurado, ir a profile-setup primero
          if (!userStore.user?.profiles) {
            router.replace("/profile-setup");
            return;
          }
          const target =
            photosStore.appAccessMode === "blocked"
              ? "/sync-area#upload"
              : isMobile.value
                ? "/workspace"
                : "/dashboard";
          router.replace(target);
        }
      });
      collectionsStore.getOrFetch(true);
      seriesStore.getOrFetch(true);
      userStore.processPatterns();
    } else {
      // Usuario se desautenticó - resetear stores
      if (wasAuth !== undefined) {
        // Solo si no es la primera ejecución (wasAuth es undefined en immediate)
        photosStore.resetStore();
        collectionsStore.resetStore();
        seriesStore.resetStore();
      }
      showWelcomeModal.value = false;
      // Si no está autenticado, marcar photosStore como inicializado para no bloquear la app
      photosStore.isInitialized = true;
    }
  },
  { immediate: true }, // Ejecutar inmediatamente para capturar estado inicial
);

// Safety: si un usuario autenticado acaba en "/" (por cualquier flujo), redirigir al destino correcto
watch(
  [
    () => route.path,
    () => photosStore.isInitialized,
    () => userStore.isAuthenticated,
  ],
  ([path, photosReady, isAuth]) => {
    if (path === "/" && photosReady && isAuth) {
      // Si el usuario no tiene perfil configurado, ir a profile-setup primero
      if (!userStore.user?.profiles) {
        router.replace("/profile-setup");
        return;
      }
      const target =
        photosStore.appAccessMode === "blocked"
          ? "/sync-area#upload"
          : isMobile.value
            ? "/workspace"
            : "/dashboard";
      router.replace(target);
    }
  },
);

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
});
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
  /* background-color: #101014; */
  overflow: auto;
  transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Mobile layout styles */
.mobile-layout {
  position: relative;
  height: 100vh;
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
  /* background-color: #101014; */
  height: calc(100vh - 64px);
}

/* Responsive styles - padding removed for full canvas expansion */
</style>

<style>
@import url("https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700;800;900&display=swap");

body {
  margin: 0;
  font-family:
    "Work Sans",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "Roboto",
    "Oxygen",
    "Ubuntu",
    "Cantarell",
    "Fira Sans",
    "Droid Sans",
    "Helvetica Neue",
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--bg-body);
}

#app {
  height: 100vh;
}
</style>
