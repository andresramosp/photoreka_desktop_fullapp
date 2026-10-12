<template>
  <!-- Headless: sólo dispara la notificación de naive-ui -->
</template>

<script setup>
import { h, watch } from "vue";
import { useNotification, NButton } from "naive-ui";
import { pendingUpdate, applyUpdateNow } from "@/utils/appUpdate";

const notification = useNotification();

let notificationRef = null;

watch(
  pendingUpdate,
  (update) => {
    if (!update || notificationRef) return;

    notificationRef = notification.info({
      title: "New version available",
      content:
        "A new version of Photoreka is ready. Reload whenever it suits you to apply it.",
      duration: undefined, // persistente: se queda hasta que el usuario actúe
      closable: true,
      onClose: () => {
        notificationRef = null;
        return true;
      },
      action: () =>
        h(
          NButton,
          {
            type: "primary",
            size: "small",
            onClick: () => {
              void applyUpdateNow();
            },
          },
          { default: () => "Update" },
        ),
    });
  },
  { immediate: true },
);
</script>
