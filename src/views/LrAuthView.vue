<template>
  <AuthLayout>
    <div class="lr-auth-container">
      <!-- Loading -->
      <template v-if="state === 'loading'">
        <div class="state-container">
          <n-spin size="large" />
          <p class="state-message">Connecting to Lightroom session...</p>
        </div>
      </template>

      <!-- Ready: show login/Google button -->
      <template v-else-if="state === 'ready'">
        <div class="state-container">
          <div class="lr-header">
            <n-icon :component="PlugConnectedIcon" size="40" color="#6366f1" />
            <h2 class="state-title">Sign in for Lightroom</h2>
            <p class="state-message">
              Sign in to link your Photoreka account with the Lightroom plugin.
              Once complete, return to Lightroom.
            </p>
          </div>

          <!-- Already authenticated: just complete the session -->
          <template v-if="userStore.isAuthenticated">
            <n-button
              type="primary"
              size="large"
              :loading="completing"
              @click="completeSession"
            >
              Connect as {{ userStore.user?.name || userStore.user?.email }}
            </n-button>
            <n-button
              text
              size="small"
              class="switch-account-btn"
              @click="handleSwitchAccount"
            >
              Use a different account
            </n-button>
          </template>

          <!-- Not authenticated: show login/Google -->
          <template v-else>
            <n-button
              size="large"
              class="google-btn"
              :loading="googleLoading"
              @click="handleGoogleLogin"
            >
              <template #icon><GoogleIcon /></template>
              Sign in with Google
            </n-button>
            <n-divider>or</n-divider>
            <n-button
              size="large"
              class="email-login-btn"
              @click="showLoginForm = true"
            >
              Sign in with email
            </n-button>
          </template>
        </div>

        <!-- Inline email login form -->
        <n-modal
          v-model:show="showLoginForm"
          preset="card"
          :style="{ width: '380px' }"
          title="Sign in with email"
          :bordered="false"
        >
          <n-form
            :model="form"
            :rules="rules"
            ref="formRef"
            @submit.prevent="handleEmailLogin"
          >
            <n-form-item path="email" label="Email">
              <n-input
                v-model:value="form.email"
                type="email"
                placeholder="you@example.com"
                size="large"
              />
            </n-form-item>
            <n-form-item path="password" label="Password">
              <n-input
                v-model:value="form.password"
                type="password"
                placeholder="Password"
                size="large"
                show-password-on="click"
              />
            </n-form-item>
            <n-button
              type="primary"
              size="large"
              block
              :loading="completing"
              attr-type="submit"
            >
              Sign in & connect
            </n-button>
          </n-form>
        </n-modal>
      </template>

      <!-- Success -->
      <template v-else-if="state === 'success'">
        <div class="state-container">
          <n-icon
            :component="CheckmarkCircleOutline"
            size="64"
            color="#10b981"
          />
          <h2 class="state-title">Connected!</h2>
          <p class="state-message">
            You can now close this tab and return to Lightroom.
          </p>
        </div>
      </template>

      <!-- Error -->
      <template v-else-if="state === 'error'">
        <div class="state-container">
          <n-icon :component="CloseCircleOutline" size="64" color="#ef4444" />
          <h2 class="state-title">Something went wrong</h2>
          <p class="state-message">{{ errorMessage }}</p>
          <n-button @click="router.push('/auth')">Go to login</n-button>
        </div>
      </template>
    </div>
  </AuthLayout>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useMessage } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseCircleOutline,
  LinkOutline,
} from "@vicons/ionicons5";
import AuthLayout from "../components/AuthLayout.vue";
import { api } from "../utils/axios";

const LR_SESSION_KEY = "lr_pending_session";

const GoogleIcon = () =>
  h("svg", { width: "18", height: "18", viewBox: "0 0 24 24" }, [
    h("path", {
      d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z",
      fill: "#4285F4",
    }),
    h("path", {
      d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z",
      fill: "#34A853",
    }),
    h("path", {
      d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z",
      fill: "#FBBC05",
    }),
    h("path", {
      d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z",
      fill: "#EA4335",
    }),
  ]);

const PlugConnectedIcon = LinkOutline;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const message = useMessage();

type State = "loading" | "ready" | "success" | "error";
const state = ref<State>("loading");
const errorMessage = ref("");
const completing = ref(false);
const showLoginForm = ref(false);

const form = ref({ email: "", password: "" });
const formRef = ref();
const rules = {
  email: [{ required: true, message: "Email is required", trigger: "blur" }],
  password: [
    { required: true, message: "Password is required", trigger: "blur" },
  ],
};

const sessionId = route.query.session as string;
const googleLoading = ref(false);

function handleGoogleLogin() {
  if (!sessionId) return;
  googleLoading.value = true;
  // Save session so AuthCallback can redirect back here after OAuth
  sessionStorage.setItem(LR_SESSION_KEY, sessionId);
  userStore.loginWithProvider("google", "login");
}

onMounted(async () => {
  if (!sessionId) {
    errorMessage.value = "Missing session ID. Please try again from Lightroom.";
    state.value = "error";
    return;
  }

  // Verify the session exists on the backend before showing the UI
  try {
    const { data } = await api.get(
      `/api/auth_lr/poll-device-session?sessionId=${sessionId}`,
    );
    if (data.status === "expired") {
      errorMessage.value =
        "This session has expired. Please try logging in again from Lightroom.";
      state.value = "error";
      return;
    }
    if (data.status === "completed") {
      // Already completed (shouldn't happen normally)
      state.value = "success";
      return;
    }
    state.value = "ready";
  } catch {
    errorMessage.value = "Could not reach the Photoreka server.";
    state.value = "error";
  }
});

async function completeSession() {
  completing.value = true;
  try {
    await api.post("/api/auth_lr/complete-device-session", { sessionId });
    state.value = "success";
    showLoginForm.value = false;
  } catch (e: any) {
    message.error(e?.response?.data?.message || "Failed to complete session");
  } finally {
    completing.value = false;
  }
}

async function handleEmailLogin() {
  completing.value = true;
  try {
    const result = await userStore.login(form.value.email, form.value.password);
    if (!result.success) {
      message.error(result.error || "Invalid credentials");
      return;
    }
    await completeSession();
  } finally {
    completing.value = false;
  }
}

function handleSwitchAccount() {
  userStore.logout();
}
</script>

<style scoped>
.lr-auth-container {
  width: 100%;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.lr-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.state-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.state-message {
  color: var(--text-secondary);
  font-size: 14px;
  max-width: 320px;
  margin: 0;
}

.switch-account-btn {
  margin-top: -8px;
  color: var(--text-secondary) !important;
}

.google-btn {
  width: 100%;
}

.email-login-btn {
  width: 100%;
}
</style>
