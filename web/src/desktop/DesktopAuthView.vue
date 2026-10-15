<template>
  <AuthLayout>
    <div class="desktop-auth">
      <template v-if="state === 'waiting'">
        <n-spin size="medium" />
        <h2 class="title">Continue in your browser</h2>
        <p class="text">
          Create your Photoreka account or sign in in the browser window that just opened. This
          window will continue on its own when you're done.
        </p>
        <div class="actions">
          <n-button secondary @click="openBrowser">Open the browser again</n-button>
          <n-button text @click="cancel">Cancel</n-button>
        </div>
      </template>

      <template v-else>
        <h2 class="title">Welcome to Photoreka</h2>
        <p class="text">
          Create your account or sign in through your browser. You'll come back here when you're
          done.
        </p>
        <p v-if="error" class="error">{{ error }}</p>
        <n-button type="primary" size="large" class="submit" :loading="starting" @click="start">
          Continue in the browser
        </n-button>
      </template>
    </div>
  </AuthLayout>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import { api } from "../utils/axios";
import { useUserStore } from "../stores/userStore";

defineOptions({ name: "DesktopAuthView" });

const POLL_MS = 2000;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const state = ref<"idle" | "waiting">("idle");
const starting = ref(false);
const error = ref("");
let verificationUrl = "";
let sessionId = "";
let timer: ReturnType<typeof setTimeout> | null = null;

function openBrowser() {
  window.open(verificationUrl, "_blank");
}

function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function cancel() {
  stopPolling();
  state.value = "idle";
}

async function start() {
  error.value = "";
  starting.value = true;
  try {
    const { data } = await api.post("/api/desktop/login/start");
    sessionId = data.sessionId;
    verificationUrl = data.verificationUrl;
    state.value = "waiting";
    openBrowser();
    timer = setTimeout(poll, POLL_MS);
  } catch (e: any) {
    error.value = e.response?.data?.message || "Could not reach Photoreka. Check your connection and try again.";
  } finally {
    starting.value = false;
  }
}

async function poll() {
  try {
    const { data } = await api.get("/api/desktop/login/poll", { params: { sessionId } });
    if (data.status === "completed") {
      stopPolling();
      const result = await userStore.processOAuthCallback(data.token);
      if (!result.success) throw new Error(result.error);
      router.replace((route.query.redirect as string) || "/");
      return;
    }
    if (data.status === "expired") {
      stopPolling();
      state.value = "idle";
      error.value = "The sign-in link expired. Please try again.";
      return;
    }
  } catch (e: any) {
    // Un fallo puntual de red no corta la espera; el enlace caduca solo a la hora.
    if (state.value !== "waiting") return;
  }
  if (state.value === "waiting") timer = setTimeout(poll, POLL_MS);
}

onBeforeUnmount(stopPolling);
</script>

<style scoped>
.desktop-auth {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  padding: 8px 0;
}

.title {
  margin: 0;
  color: var(--text-primary, #ffffff);
  font-size: 1.25rem;
  font-weight: 600;
}

.text {
  margin: 0;
  color: var(--text-secondary, rgba(255, 255, 255, 0.7));
  line-height: 1.5;
}

.error {
  margin: 0;
  color: var(--n-error-color, #e88080);
}

.submit {
  width: 100%;
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
