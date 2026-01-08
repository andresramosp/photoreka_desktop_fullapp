import { createApp } from "vue";
import { createPinia } from "pinia";
import VueKonva from "vue-konva";
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
} from "naive-ui";

import App from "./App.vue";
import router from "./router";
import { initializeAuth } from "./authInit";

import "./assets/global.scss";

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
  ],
});

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// Inicializar Google Analytics
initGA();

// Inicializar autenticación después de registrar Pinia
initializeAuth();

app.use(router);
app.use(naive);
app.use(VueKonva);
app.mount("#app");
