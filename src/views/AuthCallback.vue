<template>
  <div class="auth-callback-view">
    <div class="auth-callback-container">
      <SpiralGridLoader variant="primary" :size="72" />
      <p class="callback-message">{{ displayMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useMessage } from "naive-ui";
import SpiralGridLoader from "../components/SpiralGridLoader.vue";

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const message = useMessage();
const displayMessage = ref("Processing authentication...");

onMounted(async () => {
  const token = route.query.token as string;
  const error = route.query.message as string;
  const isNewUser = route.query.isNewUser === "true";

  if (error) {
    // Redirigir a AuthError.vue para mostrar el error apropiadamente
    router.replace(`/auth/error?message=${encodeURIComponent(error)}`);
    return;
  }

  if (!token) {
    displayMessage.value = "Invalid authentication response";
    message.error("No authentication token received");
    setTimeout(() => router.push("/"), 2000);
    return;
  }

  // Procesar el token
  const result = await userStore.processOAuthCallback(token);

  if (result.success) {
    displayMessage.value = "Success! Redirecting...";
    message.success("Welcome to Photoreka!");

    // If this OAuth was triggered from the Lightroom plugin, go back to lr-auth
    const lrSession = sessionStorage.getItem("lr_pending_session");
    if (lrSession) {
      sessionStorage.removeItem("lr_pending_session");
      router.replace(`/lr-auth?session=${lrSession}`);
      return;
    }
    // No navegar aquí — el watcher de isAuthenticated en App.vue
    // se encarga de redirigir al destino correcto para todos los flujos
  } else {
    displayMessage.value = "Authentication failed";
    message.error(result.error || "Failed to process authentication");
    setTimeout(() => router.push("/"), 2000);
  }
});
</script>

<style scoped>
.auth-callback-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-body);
  padding: 20px;
}

.auth-callback-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 40px;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
  max-width: 400px;
  width: 100%;
}

.callback-message {
  font-size: 16px;
  color: var(--text-secondary);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .auth-callback-view {
    background: #0f172a;
  }

  .auth-callback-container {
    background: #1e293b;
  }
}
</style>
