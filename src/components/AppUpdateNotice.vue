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
      title: "Nueva versión disponible",
      content:
        "Hay una actualización de Photoreka lista. Recarga cuando te venga bien para aplicarla.",
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
          { default: () => "Actualizar" },
        ),
    });
  },
  { immediate: true },
);
</script>
