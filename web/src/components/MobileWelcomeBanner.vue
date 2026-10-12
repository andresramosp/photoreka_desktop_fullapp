<template>
  <!-- Blur overlay background -->
  <Transition name="blur-fade">
    <div v-if="showBlurOverlay" class="blur-overlay" />
  </Transition>
</template>

<script setup lang="ts">
import { h, ref, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import {
  useNotification,
  NButton,
  NAvatar,
  type NotificationReactive,
  NIcon,
  NTag,
} from "naive-ui";
import {
  SearchOutline as SearchIcon,
  CloudUploadOutline,
  GridOutline as CollectionsIcon,
  LayersOutline,
  AnalyticsOutline as ReportIcon,
  ListOutline as SeriesIcon,
  MapOutline,
  CubeOutline,
  PhonePortrait as MobileIcon,
  ListOutline,
  CheckmarkCircleOutline,
} from "@vicons/ionicons5";
import { isMobileDevice } from "@/utils/utils.js";

import AppLogo from "./AppLogo.vue";
import { Workspace } from "@vicons/carbon";
import { MonitorFilled } from "@vicons/material";

const route = useRoute();

const notification = useNotification();
let closeNotification = ref<NotificationReactive | null>(null);
const showBlurOverlay = ref(false);

const STORAGE_KEY = "mobile-welcome-dismissed";

// Desactivado: en movil el saludo ya lo da WelcomeBatchModal (ver App.vue), y
// los dos a la vez se pisaban en /dashboard, /workspace e /import-area. El
// componente se deja montado y entero; poner esto en true lo reactiva.
const BANNER_ENABLED = false;

function checkAndShowWelcome() {
  if (!BANNER_ENABLED) {
    return;
  }

  // Usar window.location.pathname que siempre tiene el valor correcto
  const currentPath = window.location.pathname;

  // No mostrar en rutas de configuración de perfil o plan
  const includedPaths = ["/dashboard", "/workspace", "/import-area"];

  if (!includedPaths.includes(currentPath)) {
    return;
  }

  // Solo mostrar si es dispositivo móvil y el usuario no ha hecho clic en "Got it!" antes
  const hasBeenDismissed = localStorage.getItem(STORAGE_KEY);
  if (!hasBeenDismissed && isMobileDevice()) {
    showMobileWelcome();
  }
}

function showMobileWelcome() {
  // Mostrar el overlay con blur
  showBlurOverlay.value = true;

  // Helper to create icon render function
  const renderIcon = (icon: any) => {
    return () =>
      h(
        NIcon,
        { size: 16, style: { marginRight: "8px" } },
        { default: () => h(icon) },
      );
  };

  closeNotification.value = notification.create({
    content: () =>
      h("div", { style: { lineHeight: "1.4" } }, [
        // Logo
        h("div", { style: { marginBottom: "0px", textAlign: "center" } }, [
          h(AppLogo, {
            height: 40,
            layout: "horizontal",
            withClaim: false,
          }),
        ]),

        // Title
        h("div", { style: { textAlign: "center", marginBottom: "8px" } }, [
          h(
            NTag,
            {
              size: "small",
              type: "warning",
              round: true,
              bordered: false,
              style: {
                fontSize: "14px",
                opacity: "0.85",
                marginTop: "15px",
                marginLeft: "0px",
                marginBottom: "8px",
              },
            },
            {
              icon: () =>
                h(NIcon, { size: 13 }, { default: () => h(MobileIcon) }),
              default: () => "Mobile Mode",
            },
          ),
        ]),

        // Subtitle
        h(
          "p",
          {
            style: {
              opacity: "1",
              fontSize: "13px",
              color: "var(--text-primary)",
            },
          },
          "📱 Use mobile mode for photo management:",
        ),

        // Features
        h(
          "ul",
          {
            style: {
              paddingLeft: "0",
              marginTop: "16px",
              listStyle: "none",
            },
          },
          [
            h(
              "li",
              {
                style: {
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  [
                    renderIcon(CloudUploadOutline)(),
                    h("span", "Import new photos"),
                  ],
                ),
                h(
                  NIcon,
                  { size: 18, color: "#52c41a" },
                  { default: () => h(CheckmarkCircleOutline) },
                ),
              ],
            ),

            h(
              "li",
              {
                style: {
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  [
                    renderIcon(SearchIcon)(),
                    h("span", "Search your entire archive"),
                  ],
                ),
                h(
                  NIcon,
                  { size: 18, color: "#52c41a" },
                  { default: () => h(CheckmarkCircleOutline) },
                ),
              ],
            ),

            h(
              "li",
              {
                style: {
                  marginBottom: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  [
                    renderIcon(LayersOutline)(),
                    h("span", "Browse and manage your library"),
                  ],
                ),
                h(
                  NIcon,
                  { size: 18, color: "#52c41a" },
                  { default: () => h(CheckmarkCircleOutline) },
                ),
              ],
            ),
          ],
        ),

        // Footer microcopy
        h(
          "p",
          {
            style: {
              opacity: "1",
              fontSize: "13px",
              marginBottom: "14px",
              color: "var(--text-primary)",
            },
          },
          "⚒️ Advanced tools available on tablet/desktop:",
        ),

        // Features
        h(
          "ul",
          {
            style: {
              paddingLeft: "0",
              marginTop: "16px",
              listStyle: "none",
            },
          },
          [
            h(
              "li",
              {
                style: {
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  [
                    renderIcon(CubeOutline)(),
                    h("span", "3D Atlas exploration"),
                  ],
                ),
                h(
                  NIcon,
                  { size: 18, color: "#409eff" },
                  { default: () => h(MonitorFilled) },
                ),
              ],
            ),

            h(
              "li",
              {
                style: {
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  [renderIcon(Workspace)(), h("span", "Interactive Canvas")],
                ),
                h(
                  NIcon,
                  { size: 18, color: "#409eff" },
                  { default: () => h(MonitorFilled) },
                ),
              ],
            ),

            h(
              "li",
              {
                style: {
                  marginBottom: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  justifyContent: "space-between",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                  [renderIcon(ListOutline)(), h("span", "Series creation")],
                ),
                h(
                  NIcon,
                  { size: 18, color: "#409eff" },
                  { default: () => h(MonitorFilled) },
                ),
              ],
            ),
          ],
        ),

        // CTA
        h("div", { style: { marginTop: "16px", textAlign: "center" } }, [
          h(
            NButton,
            {
              type: "primary",
              size: "small",
              onClick: () => {
                localStorage.setItem(STORAGE_KEY, "true");
                closeNotification.value?.destroy();
                showBlurOverlay.value = false;
              },
            },
            { default: () => "Got it!" },
          ),
        ]),
      ]),
    closable: false,
  });
}

onMounted(() => {
  checkAndShowWelcome();
});

// Watch para detectar cambios de ruta después del login
watch(
  () => route.path,
  () => {
    checkAndShowWelcome();
  },
);
</script>

<style scoped>
/* Blur overlay background */
.blur-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  z-index: 999;
  cursor: pointer;
}

/* Transition animations */
.blur-fade-enter-active,
.blur-fade-leave-active {
  transition: all 0.3s ease;
}

.blur-fade-enter-from,
.blur-fade-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
</style>
