<template>
  <div class="auth-providers">
    <div class="providers-grid">
      <n-button
        class="provider-button provider-google"
        :loading="isLoading && activeProvider === 'google'"
        @click="handleProviderLogin('google')"
        :disabled="true"
      >
        <template #icon>
          <GoogleIcon />
        </template>
        Google
      </n-button>

      <n-button
        class="provider-button provider-facebook"
        :loading="isLoading && activeProvider === 'facebook'"
        @click="handleProviderLogin('facebook')"
        :disabled="true"
      >
        <template #icon>
          <FacebookIcon />
        </template>
        Facebook
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useMessage } from "naive-ui";

// Icon components for social providers
const GoogleIcon = () =>
  h(
    "svg",
    {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "currentColor",
    },
    [
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
    ]
  );

const FacebookIcon = () =>
  h(
    "svg",
    {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "#1877F2",
    },
    [
      h("path", {
        d: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
      }),
    ]
  );

interface Props {
  mode?: "login" | "register";
}

const props = withDefaults(defineProps<Props>(), {
  mode: "login",
});

const router = useRouter();
const userStore = useUserStore();
const message = useMessage();

const isLoading = ref(false);
const activeProvider = ref<"google" | "facebook" | null>(null);

const handleProviderLogin = async (provider: "google" | "facebook") => {
  isLoading.value = true;
  activeProvider.value = provider;

  try {
    const result = await userStore.loginWithProvider(provider);

    if (result.success) {
      if (props.mode === "register") {
        message.success(
          `Welcome! You've signed up with ${
            provider === "google" ? "Google" : "Facebook"
          }.`
        );
        router.push("/profile-setup");
      } else {
        message.success(
          `Welcome back! You've logged in with ${
            provider === "google" ? "Google" : "Facebook"
          }.`
        );
        router.push("/dashboard");
      }
    } else {
      message.error(result.error || "Error logging in");
    }
  } catch (error) {
    message.error("Unexpected error logging in");
  } finally {
    isLoading.value = false;
    activeProvider.value = null;
  }
};
</script>

<script lang="ts">
import { h } from "vue";

export default {
  name: "AuthProviders",
};
</script>

<style scoped>
.auth-providers {
  margin-top: 0;
}

.providers-divider::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background-color: #2c2c32;
}

.divider-text {
  background-color: #1a1a1f;
  padding: 0 16px;
  font-size: 14px;
  color: #ffffff73;
  position: relative;
  z-index: 1;
}

.providers-grid {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
  width: 100% !important;
}

.provider-button {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  font-weight: 500;
  font-size: 13px;
  border: 1px solid #2c2c32;
  background-color: #2c2c32 !important;
  color: var(--text-secondary) !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.provider-button:hover {
  border-color: #3c3c42;
  background-color: #3c3c42 !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.provider-button:active {
  transform: translateY(0);
}

.provider-google:hover {
  border-color: #4285f4;
  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.2);
}

.provider-facebook:hover {
  border-color: #1877f2;
  box-shadow: 0 4px 12px rgba(24, 119, 242, 0.2);
}

/* Loading state adjustments */
.provider-button.n-button--loading {
  background-color: #2c2c32 !important;
}

/* Force horizontal layout with deep selectors */
.auth-providers :deep(.n-button-group) {
  display: flex !important;
  flex-direction: row !important;
}

.auth-providers :deep(.n-space) {
  flex-direction: row !important;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .providers-grid {
    gap: 6px !important;
    grid-template-columns: 1fr 1fr !important;
  }

  .provider-button {
    height: 32px !important;
    font-size: 12px !important;
  }
}
</style>
