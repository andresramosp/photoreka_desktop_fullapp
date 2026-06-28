<template>
  <!-- Admin Backoffice (completely separate, light theme) -->
  <n-config-provider
    v-if="isAdminRoute"
    key="admin"
    :theme="null"
    :theme-overrides="{}"
  >
    <n-notification-provider :max-width="480">
      <n-dialog-provider>
        <n-message-provider>
          <router-view />
        </n-message-provider>
      </n-dialog-provider>
    </n-notification-provider>
  </n-config-provider>

  <!-- Main App (dark theme) -->
  <n-config-provider
    v-else-if="routerReady"
    key="app"
    :theme="darkTheme"
    :theme-overrides="themeOverrides"
  >
    <n-notification-provider :max-width="480">
      <n-dialog-provider>
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
              route.name === 'maintenance' ||
              route.name === 'reset-password' ||
              route.name === 'confirm-email' ||
              route.name === 'auth-callback' ||
              route.name === 'auth-error' ||
              route.name === 'lr-auth' ||
              route.name === 'geo-recovery'
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
              :class="{ 'has-dashboard-header': showDashboardHeader }"
              :style="{
                '--total-header-offset': showDashboardHeader ? '85px' : '48px',
              }"
            >
              <DashboardSidebar />
              <n-layout class="main-layout">
                <DashboardHeader v-if="showDashboardHeader" />
                <n-layout-content
                  class="main-content"
                  :style="{
                    height: showDashboardHeader
                      ? 'calc(100vh - 64px)'
                      : '100vh',
                  }"
                >
                  <!-- Mostrar loader mientras la app se inicializa (solo en vistas autenticadas) -->
                  <!-- routerReady evita que el loader aparezca brevemente en rutas admin -->
                  <AppInitLoader v-if="!isAppReady && routerReady" />
                  <router-view
                    v-else-if="isAppReady"
                    v-slot="{ Component, route }"
                  >
                    <KeepAlive :include="getKeepAliveComponents()">
                      <component
                        :is="Component"
                        :key="getRouteViewKey(route)"
                      />
                    </KeepAlive>
                  </router-view>
                </n-layout-content>
              </n-layout>
            </n-layout>

            <!-- Mobile Layout -->
            <div
              v-else
              class="mobile-layout"
              :class="{ 'has-dashboard-header': showDashboardHeader }"
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
                    height: showDashboardHeader
                      ? 'calc(100vh - 64px)'
                      : '100vh',
                  }"
                >
                  <!-- Mostrar loader mientras la app se inicializa (solo en vistas autenticadas) -->
                  <!-- routerReady evita que el loader aparezca brevemente en rutas admin -->
                  <AppInitLoader v-if="!isAppReady && routerReady" />
                  <router-view
                    v-else-if="isAppReady"
                    v-slot="{ Component, route }"
                  >
                    <KeepAlive :include="getKeepAliveComponents()">
                      <component
                        :is="Component"
                        :key="getRouteViewKey(route)"
                      />
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

            <!-- Welcome Batch Modal (no processed photos yet) -->
            <WelcomeBatchModal
              :show="showWelcomeBatchModal"
              @close="welcomeBatchDismissed = true"
            />

            <!-- Assistant Chat Widget (route-driven visibility, hidden for demo users) -->
            <AssistantChatWidget v-if="!isDemoUser" />

            <!-- LR Plugin Update Modal -->
            <LightroomModal
              v-if="showLrUpdateModal"
              v-model="showLrUpdateModal"
              :update-mode="true"
              :update-version="LR_PLUGIN_VERSION"
            />
          </template>
        </n-message-provider>
      </n-dialog-provider>
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
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";
import { useTagCloudStore } from "@/stores/tagCloudStore.js";
import ConfettiEffect from "./components/ConfettiEffect.vue";
import AppInitLoader from "./components/AppInitLoader.vue";
import { useThemeInit } from "@/composables/useTheme.js";
import MobileWelcomeBanner from "./components/MobileWelcomeBanner.vue";
import WelcomeBatchModal from "./components/WelcomeBatchModal.vue";
import AssistantChatWidget from "./components/AssistantChatWidget.vue";
import LightroomModal from "./components/LightroomModal.vue";
import { useAssistantChatStore } from "@/stores/assistantChat.js";
import { useWarmUp } from "@/composables/useWarmUp";
import { useProactiveCacheSync } from "@/composables/useProactiveCacheSync.js";
import { matchRouteToTab } from "@/config/routeTabs";

const { ensureWarmUp } = useWarmUp();

// Pre-populate the IndexedDB image cache in the background.
// Runs during browser idle time so it never competes with UI work.
// useProactiveCacheSync();

// LR Plugin update notification
const LR_PLUGIN_VERSION = import.meta.env.VITE_LR_PLUGIN_VERSION ?? null;
const showLrUpdateModal = ref(false);

const route = useRoute();
const router = useRouter();

const assistantChatStore = useAssistantChatStore();

// Keep the assistant widget in sync with the active route
watch(
  () => route.name,
  (name, oldName) => {
    if (oldName !== undefined) {
      // Explicit close on every navigation, regardless of store logic
      assistantChatStore.close();
    }
    assistantChatStore.setActiveRoute(name);
  },
  { immediate: true },
);

// Check if current route is an admin route
const isAdminRoute = computed(() => {
  return route.matched.some((r) => r.meta.isAdmin || r.meta.requiresAdmin);
});

// Inicializar tema centralizado
const {
  naiveTheme: darkTheme,
  naiveThemeOverrides: themeOverrides,
  initTheme,
} = useThemeInit();

// Re-aplicar tema cuando cambia la ruta (para temas forzados por landing/app)
// Skip admin routes — AdminLayout handles its own light theme
watch(
  () => route.path,
  () => {
    if (!isAdminRoute.value) {
      initTheme();
    }
  },
  { immediate: false },
);

// List of route names where DashboardHeader should be visible
const allowedHeaderViews = [
  "dashboard",
  "collections",
  "collection-detail",
  "collection-set",
  "photo-hub",
  "series",
  "search",
  "portfolios",
  "portfolio-detail",
  "portfolio-set",
  "framer",
  "workspace",
  "import-area",
  "settings",
  "help",
  "report",
  "chat-lab",
  "canvas",
  "world-map",
  "2d-atlas",
  "tagcloud",
  "3d-atlas",
  // "settings",
  // Add more route names as needed
];

const showDashboardHeader = computed(() => {
  if (!route.name) return false;

  if (
    typeof route.name === "string" &&
    route.name.startsWith("world-map") &&
    isMobile.value
  ) {
    return true;
  }

  return allowedHeaderViews.some(
    (prefix) => typeof route.name === "string" && route.name.startsWith(prefix),
  );
});

const isDemoUser = computed(() => {
  return userStore.user?.email === "demo@photorekatest.com";
});
const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const seriesStore = useSeriesStore();
const portfolioBuildsStore = usePortfolioBuildsStore();
const tagCloudStore = useTagCloudStore();
const userStore = useUserStore();

// Punto único de decisión de destino post-autenticación
const resolvePostAuthTarget = () => {
  if (!userStore.user?.profiles) return "/profile-setup";
  if (photosStore.appAccessMode === "blocked") return "/import-area#upload";
  return "/dashboard";
  // return isMobile.value ? "/workspace" : "/dashboard";
};

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
    "DashboardView",
    "CanvasView",
    "SearchView",
    "CollectionsView",
    "ImportAreaView",
    "FramerView",
    "3DView",
    "2DView",
    "ChatView",
    "WorldMapView",
    "TagCloudView",
    "SeriesView",
    "PortfolioDetailView",
  ];

  // Debug: log components being kept alive
  console.log("KeepAlive components:", keepAliveComponents);
  return keepAliveComponents;
};

const getRouteViewKey = (currentRoute) => {
  const tabMatch = matchRouteToTab(currentRoute);
  if (
    tabMatch &&
    ["series-detail", "portfolio-detail"].includes(String(currentRoute.name))
  ) {
    return tabMatch.key;
  }

  return String(currentRoute.name || currentRoute.fullPath);
};

const mobileMenuOpen = ref(false);
const isMobile = ref(false);
const showConfetti = ref(false);

// Welcome Batch Modal — shown when user has 0 processed photos
const welcomeBatchDismissed = ref(
  localStorage.getItem("welcome-batch-modal-dismissed") === "true",
);
const showWelcomeBatchModal = computed(() => {
  return (
    isAppReady.value &&
    userStore.isAuthenticated &&
    photosStore.processedPhotos.length === 0 &&
    !welcomeBatchDismissed.value
  );
});

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

// Flag para saber si el router ya resolvió la navegación inicial.
// Evita que el safety watcher redirija a /auth antes de que route.path
// refleje la URL real (ej. /auth/callback durante OAuth).
const routerReady = ref(false);
router.isReady().then(() => {
  routerReady.value = true;
});

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
      portfolioBuildsStore.resetStore();

      // Esperar a cargar el catálogo y decidir a dónde ir
      photosStore.getOrFetch(true).then(() => {
        // Solo redirigir si el router ya está listo para evitar race conditions
        if (!routerReady.value) return;

        if (
          route.path === "/" ||
          route.path === "/dashboard" ||
          route.path === "/auth" ||
          route.path === "/auth/callback"
        ) {
          router.replace(resolvePostAuthTarget());
        }
      });
      collectionsStore.getOrFetch(true);
      collectionsStore.getOrFetchSets(true);
      seriesStore.getOrFetch(true);
      seriesStore.getOrFetchSets(true);
      portfolioBuildsStore.getOrFetch(true);
      portfolioBuildsStore.getOrFetchSets(true);
      tagCloudStore.prefetch();
      userStore.processPatterns();
    } else {
      // Usuario se desautenticó - resetear stores
      if (wasAuth !== undefined) {
        // Solo si no es la primera ejecución (wasAuth es undefined en immediate)
        photosStore.resetStore();
        collectionsStore.resetStore();
        seriesStore.resetStore();
        portfolioBuildsStore.resetStore();
        tagCloudStore.resetStore();
      }
      // Si no está autenticado, marcar photosStore como inicializado para no bloquear la app
      photosStore.isInitialized = true;
    }
  },
  { immediate: true }, // Ejecutar inmediatamente para capturar estado inicial
);

watch(
  [() => route.fullPath, () => userStore.isAuthenticated, routerReady],
  ([, isAuth, isRouterReady]) => {
    if (!isRouterReady || !isAuth) return;
    void ensureWarmUp("railway_cpu");
  },
  { immediate: true },
);

// Safety: si un usuario acaba en "/" (por cualquier flujo), redirigir al destino correcto
watch(
  [
    () => route.path,
    () => photosStore.isInitialized,
    () => userStore.isAuthenticated,
    () => userStore.isInitialized,
    routerReady,
  ],
  ([path, photosReady, isAuth, userReady, isRouterReady]) => {
    // No actuar hasta que el router haya resuelto la navegación inicial.
    // Sin esto, route.path es "/" (START_LOCATION) y el watcher redirige
    // a /auth antes de que el flujo OAuth en /auth/callback pueda ejecutarse.
    if (!isRouterReady) return;

    if (path === "/" && userReady) {
      if (isAuth && photosReady) {
        router.replace(resolvePostAuthTarget());
      } else if (!isAuth) {
        router.replace("/auth");
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  window.removeEventListener("resize", checkIsMobile);
});

// Show LR plugin update modal when a new version is configured
watch(isAppReady, (ready) => {
  if (!ready || !LR_PLUGIN_VERSION) return;
  if (userStore.user?.preferredSource !== "lightroom") return;
  const dismissed = localStorage.getItem("lr_plugin_dismissed_version");
  if (dismissed === String(LR_PLUGIN_VERSION)) return;
  showLrUpdateModal.value = true;
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
