<template>
  <div class="admin-login-page">
    <!-- Left panel (branding) -->
    <div class="login-branding">
      <div class="branding-content">
        <AppLogo layout="vertical" :height="80" />
        <p class="branding-tagline">Administration Panel</p>
      </div>
      <span class="branding-footer"
        >Photoreka &copy; {{ new Date().getFullYear() }}</span
      >
    </div>

    <!-- Right panel (form) -->
    <div class="login-form-panel">
      <div class="login-form-wrapper">
        <!-- Mobile logo -->
        <div class="mobile-logo">
          <AppLogo layout="horizontal" :height="32" />
        </div>

        <h1 class="form-title">Welcome back</h1>
        <p class="form-subtitle">Sign in to access the admin dashboard</p>

        <n-form
          ref="formRef"
          :model="form"
          :rules="rules"
          @submit.prevent="handleLogin"
        >
          <n-form-item label="Email" path="email">
            <n-input
              v-model:value="form.email"
              placeholder="your@email.com"
              size="large"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <n-icon :component="MailIcon" style="color: #94a3b8" />
              </template>
            </n-input>
          </n-form-item>

          <n-form-item label="Password" path="password">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              placeholder="Enter your password"
              size="large"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <n-icon :component="LockIcon" style="color: #94a3b8" />
              </template>
            </n-input>
          </n-form-item>

          <n-button
            type="primary"
            block
            size="large"
            :loading="adminStore.isLoading"
            @click="handleLogin"
            style="margin-top: 4px; height: 44px; font-weight: 600"
          >
            Sign In
          </n-button>
        </n-form>

        <n-alert
          v-if="errorMessage"
          type="error"
          style="margin-top: 16px"
          :bordered="false"
        >
          {{ errorMessage }}
        </n-alert>

        <div class="form-footer">
          <router-link to="/auth" class="back-link">
            <n-icon :component="ArrowBackIcon" size="14" />
            Back to app
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { useAdminStore } from "@/stores/adminStore";
import AppLogo from "@/components/AppLogo.vue";
import {
  MailOutline as MailIcon,
  LockClosedOutline as LockIcon,
  ArrowBackOutline as ArrowBackIcon,
} from "@vicons/ionicons5";

const router = useRouter();
const adminStore = useAdminStore();
const formRef = ref();
const errorMessage = ref("");

const form = reactive({
  email: "",
  password: "",
});

const rules = {
  email: { required: true, message: "Email is required", trigger: "blur" },
  password: {
    required: true,
    message: "Password is required",
    trigger: "blur",
  },
};

async function handleLogin() {
  errorMessage.value = "";
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  const result = await adminStore.login(form.email, form.password);
  if (result.success) {
    router.replace("/admin");
  } else {
    errorMessage.value = result.error || "Invalid credentials";
  }
}
</script>

<style scoped>
.admin-login-page {
  display: flex;
  min-height: 100vh;
  font-family:
    "Work Sans",
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

/* Left branding */
.login-branding {
  flex: 0 0 420px;
  background: linear-gradient(145deg, #1e1b4b, #312e81, #4338ca);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  position: relative;
  overflow: hidden;
}
.login-branding::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      circle at 30% 80%,
      rgba(99, 102, 241, 0.3) 0%,
      transparent 60%
    ),
    radial-gradient(
      circle at 80% 20%,
      rgba(139, 92, 246, 0.2) 0%,
      transparent 50%
    );
}
.branding-content {
  position: relative;
  text-align: center;
}
.branding-tagline {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin-top: 16px;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-weight: 500;
}
.branding-footer {
  position: absolute;
  bottom: 24px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
}

/* Right form */
.login-form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  background: #fff;
}
.login-form-wrapper {
  width: 100%;
  max-width: 380px;
}
.mobile-logo {
  display: none;
  margin-bottom: 32px;
  text-align: center;
}
.form-title {
  margin: 0 0 4px;
  font-size: 26px;
  font-weight: 700;
  color: #1e293b;
}
.form-subtitle {
  margin: 0 0 28px;
  color: #94a3b8;
  font-size: 14px;
}
.form-footer {
  text-align: center;
  margin-top: 28px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #94a3b8;
  font-size: 13px;
  text-decoration: none;
  transition: color 0.15s;
}
.back-link:hover {
  color: #6366f1;
}

@media (max-width: 860px) {
  .login-branding {
    display: none;
  }
  .mobile-logo {
    display: block;
  }
}
</style>
