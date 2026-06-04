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
const UPDATE_AVAILABLE_FLAG = "photoreka:update-available";

function flagUpdateAvailable(version: string, source: "version-check" | "sw") {
  const key = `${source}:${version}`;
  if (sessionStorage.getItem(UPDATE_AVAILABLE_FLAG) === key) {
    return;
  }
  sessionStorage.setItem(UPDATE_AVAILABLE_FLAG, key);
  window.dispatchEvent(
    new CustomEvent("photoreka:update-available", {
      detail: { version, source },
    }),
  );
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    flagUpdateAvailable(String(APP_VERSION ?? "unknown"), "sw");
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
    flagUpdateAvailable(latestVersion, "version-check");
    return;
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
