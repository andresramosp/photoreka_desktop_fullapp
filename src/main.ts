import { createApp } from "vue";
import { createPinia } from "pinia";
import VueKonva from "vue-konva";
import { registerSW } from "virtual:pwa-register";
import { initGA } from "./utils/analytics";
import {
  create,
  NConfigProvider,
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NIcon,
  NSpace,
  NCard,
  NGrid,
  NGridItem,
  NStatistic,
  NAvatar,
  NDropdown,
  NTag,
  NDataTable,
  NInput,
  NSelect,
  NSkeleton,
  NSpin,
  NButtonGroup,
  NProgress,
  NForm,
  NFormItem,
  NCheckbox,
  NMessageProvider,
  NNotificationProvider,
  NDialogProvider,
  NSlider,
  NTooltip,
} from "naive-ui";

import App from "./App.vue";
import router from "./router";
import { initializeAuth } from "./authInit";

import "./assets/global.scss";

const APP_VERSION = __APP_VERSION__;
const STALE_VERSION_FLAG = "photoreka:stale-version-recovery";

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateServiceWorker(true);
  },
});

async function recoverFromStaleBundle() {
  try {
    const response = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const latestVersion = payload?.version;

    if (!latestVersion || latestVersion === APP_VERSION) {
      sessionStorage.removeItem(STALE_VERSION_FLAG);
      return;
    }

    if (sessionStorage.getItem(STALE_VERSION_FLAG) === latestVersion) {
      return;
    }

    sessionStorage.setItem(STALE_VERSION_FLAG, latestVersion);

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }

    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set("v", latestVersion);
    window.location.replace(reloadUrl.toString());
  } catch (error) {
    console.warn("Failed to verify deployed app version:", error);
  }
}

const naive = create({
  components: [
    NConfigProvider,
    NLayout,
    NLayoutSider,
    NLayoutHeader,
    NLayoutContent,
    NMenu,
    NButton,
    NIcon,
    NSpace,
    NCard,
    NGrid,
    NGridItem,
    NStatistic,
    NAvatar,
    NDropdown,
    NTag,
    NDataTable,
    NInput,
    NSelect,
    NSkeleton,
    NSpin,
    NButtonGroup,
    NProgress,
    NForm,
    NFormItem,
    NCheckbox,
    NMessageProvider,
    NNotificationProvider,
    NDialogProvider,
    NSlider,
    NTooltip,
  ],
});

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// Inicializar Google Analytics
initGA();

// Inicializar autenticación antes de montar la app para que el
// router guard vea isAuthenticated correctamente en la navegación inicial
async function bootstrap() {
  await recoverFromStaleBundle();
  await initializeAuth();
  app.use(router);
  app.use(naive);
  app.use(VueKonva);
  app.mount("#app");
}
bootstrap();
