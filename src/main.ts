import { createApp } from "vue";
import { createPinia } from "pinia";
import VueKonva from "vue-konva";
import { registerAppUpdates, checkDeployedVersion } from "./utils/appUpdate";
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
  NPopover,
  NTabs,
  NTabPane,
} from "naive-ui";

import App from "./App.vue";
import router from "./router";
import { initializeAuth } from "./authInit";

import "./assets/global.scss";
import "./assets/surfaces.scss";

registerAppUpdates();

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
    NPopover,
    NTabs,
    NTabPane,
  ],
});

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// Debug helper to verify real component teardown when tabs are closed.
// Keep this list focused on route views to avoid noisy logs from child components.
const UNMOUNT_DEBUG_COMPONENTS = new Set([
  "WorkspaceView",
  "DashboardView",
  "CanvasView",
  "SearchView",
  "CollectionsView",
  "CollectionDetailView",
  "ImportAreaView",
  "FramerView",
  "AtlasView",
  "ChatView",
  "WorldMapView",
  "TagCloudView",
  "SeriesView",
  "PortfolioDetailView",
]);

app.mixin({
  unmounted() {
    const vm = this as { $options?: { name?: string } };
    const name = vm.$options?.name;
    if (!name || !UNMOUNT_DEBUG_COMPONENTS.has(name)) {
      return;
    }

    const timestamp = new Date().toISOString();
    console.info(`[UNMOUNT] ${name} at ${timestamp}`);
  },
});

// Inicializar Google Analytics
initGA();

// Inicializar autenticación antes de montar la app para que el
// router guard vea isAuthenticated correctamente en la navegación inicial
async function bootstrap() {
  await checkDeployedVersion();
  await initializeAuth();
  app.use(router);
  app.use(naive);
  app.use(VueKonva);
  app.mount("#app");
}
bootstrap();
