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
} from "@vicons/ionicons5";

import AppLogo from "./AppLogo.vue";

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
            height: 65,
            layout: "horizontal",
            withClaim: true,
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
                marginTop: "10px",
                marginLeft: "0px",
              },
            },
            {
              icon: () =>
                h(NIcon, { size: 13 }, { default: () => h(MobileIcon) }),
              default: () => "Mobile Edition",
            },
          ),
        ]),

        // Subtitle
        // h(
        //   "p",
        //   {
        //     style: {
        //       textAlign: "center",
        //       opacity: "0.75",
        //       fontSize: "13px",
        //       marginBottom: "14px",
        //     },
        //   },
        //   "Your photo archive, always with you.",
        // ),

        // Features
        h(
          "ul",
          {
            style: {
              paddingLeft: "0",
              marginTop: "6px",
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
              marginTop: "12px",
              fontSize: "12px",
              textAlign: "center",
            },
          },
          h("i", "Advanced tools are available on desktop."),
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
  // Solo mostrar si el usuario no ha hecho clic en "Got it!" antes
  const hasBeenDismissed = localStorage.getItem(STORAGE_KEY);
  if (!hasBeenDismissed) {
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
