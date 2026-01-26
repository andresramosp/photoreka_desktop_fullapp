<template>
  <!-- Blur overlay background -->
  <Transition name="blur-fade">
    <div v-if="showBlurOverlay" class="blur-overlay" />
  </Transition>
</template>

<script setup lang="ts">
import { h, ref, onMounted } from "vue";
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
} from "@vicons/ionicons5";
import { isMobileDevice } from "@/utils/utils.js";

import AppLogo from "./AppLogo.vue";
import { Workspace } from "@vicons/carbon";

const notification = useNotification();
let closeNotification = ref<NotificationReactive | null>(null);
const showBlurOverlay = ref(false);

const STORAGE_KEY = "mobile-welcome-dismissed";

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
                fontSize: "11px",
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
                },
              },
              [
                renderIcon(CloudUploadOutline)(),
                h("span", "Import new photos"),
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
                },
              },
              [
                renderIcon(SearchIcon)(),
                h("span", "Search your entire archive"),
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
                },
              },
              [
                renderIcon(LayersOutline)(),
                h("span", "Browse and manage your library"),
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
          "🖥️ More advanced tools available on desktop:",
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
                },
              },
              [renderIcon(CubeOutline)(), h("span", "3D Atlas exploration")],
            ),

            h(
              "li",
              {
                style: {
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                },
              },
              [renderIcon(Workspace)(), h("span", "Interactive Canvas")],
            ),

            h(
              "li",
              {
                style: {
                  marginBottom: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                },
              },
              [renderIcon(ListOutline)(), h("span", "Series creation")],
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
  // Usar window.location.pathname que siempre tiene el valor correcto
  const currentPath = window.location.pathname;

  // No mostrar en rutas de configuración de perfil o plan
  const includedPaths = ["/dashboard", "/workspace", "/sync-area"];
  debugger;
  if (!includedPaths.includes(currentPath)) {
    return;
  }

  // Solo mostrar si es dispositivo móvil y el usuario no ha hecho clic en "Got it!" antes
  const hasBeenDismissed = localStorage.getItem(STORAGE_KEY);
  if (!hasBeenDismissed && isMobileDevice()) {
    showMobileWelcome();
  }
});
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
