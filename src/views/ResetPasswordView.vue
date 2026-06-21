<template>
  <AuthLayout>
    <div class="reset-password-container">
      <!-- Loading State -->
      <template v-if="pageState === 'loading'">
        <div class="state-container">
          <SpiralGridLoader variant="primary" :size="64" />
          <p class="state-message">Validating reset link...</p>
        </div>
      </template>

      <!-- Invalid/Expired Token State -->
      <template v-else-if="pageState === 'invalid'">
        <div class="state-container">
          <n-icon :component="CloseCircleOutline" size="64" color="#ef4444" />
          <h2 class="state-title">Invalid or Expired Link</h2>
          <p class="state-message">
            This password reset link is invalid or has expired. Please request a
            new one.
          </p>
          <n-button type="primary" size="large" @click="goToAuth">
            Back to Login
          </n-button>
        </div>
      </template>

      <!-- Password Reset Form -->
      <template v-else-if="pageState === 'form'">
        <div class="form-header">
          <n-icon :component="LockClosedOutline" size="48" color="#2563eb" />
          <h2 class="form-title">Set New Password</h2>
          <p class="form-description">
            Enter your new password below. Make sure it's at least 8 characters
            long.
          </p>
        </div>

        <n-form
          ref="formRef"
          :model="formData"
          :rules="rules"
          :show-label="false"
          @submit.prevent="handleSubmit"
        >
          <n-form-item path="newPassword">
            <n-input
              v-model:value="formData.newPassword"
              type="password"
              placeholder="New Password"
              size="large"
              show-password-on="click"
              :input-props="{ autocomplete: 'new-password' }"
            >
              <template #prefix>
                <n-icon :component="LockClosedOutline" />
              </template>
            </n-input>
          </n-form-item>

          <n-form-item path="confirmPassword">
            <n-input
              v-model:value="formData.confirmPassword"
              type="password"
              placeholder="Confirm New Password"
              size="large"
              show-password-on="click"
              :input-props="{ autocomplete: 'new-password' }"
            >
              <template #prefix>
                <n-icon :component="LockClosedOutline" />
              </template>
            </n-input>
          </n-form-item>

          <n-button
            type="primary"
            size="large"
            block
            :loading="loading"
            attr-type="submit"
            class="submit-button"
          >
            Reset Password
          </n-button>
        </n-form>
      </template>

      <!-- Success State -->
      <template v-else-if="pageState === 'success'">
        <div class="state-container">
          <n-icon
            :component="CheckmarkCircleOutline"
            size="64"
            color="#10b981"
          />
          <h2 class="state-title">Password Reset Successfully!</h2>
          <p class="state-message">
            Your password has been changed. You can now log in with your new
            password.
          </p>
          <n-button type="primary" size="large" @click="goToAuth">
            Go to Login
          </n-button>
        </div>
      </template>
    </div>
  </AuthLayout>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import SpiralGridLoader from "../components/SpiralGridLoader.vue";
import type { FormInst, FormRules } from "naive-ui";
import {
  LockClosedOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
} from "@vicons/ionicons5";
import AuthLayout from "../components/AuthLayout.vue";
import { useUserStore } from "../stores/userStore";

defineOptions({
  name: "ResetPasswordView",
});

type PageState = "loading" | "invalid" | "form" | "success";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const message = useMessage();

const pageState = ref<PageState>("loading");
const loading = ref(false);
const formRef = ref<FormInst | null>(null);
const token = ref("");

const formData = reactive({
  newPassword: "",
  confirmPassword: "",
});

const rules: FormRules = {
  newPassword: [
    {
      required: true,
      message: "Password is required",
      trigger: ["input", "blur"],
    },
    {
      min: 8,
      message: "Password must be at least 8 characters",
      trigger: ["input", "blur"],
    },
    {
      max: 100,
      message: "Password must not exceed 100 characters",
      trigger: ["input", "blur"],
    },
  ],
  confirmPassword: [
    {
      required: true,
      message: "Please confirm your password",
      trigger: ["input", "blur"],
    },
    {
      validator: (_rule, value) => {
        return value === formData.newPassword;
      },
      message: "Passwords do not match",
      trigger: ["input", "blur"],
    },
  ],
};

const validateToken = () => {
  const tokenFromQuery = route.query.token as string;

  if (
    !tokenFromQuery ||
    tokenFromQuery.length < 20 ||
    tokenFromQuery.length > 100
  ) {
    pageState.value = "invalid";
    return;
  }

  token.value = tokenFromQuery;
  pageState.value = "form";
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    loading.value = true;

    const result = await userStore.resetPassword(
      token.value,
      formData.newPassword,
    );

    if (result.success) {
      pageState.value = "success";
    } else {
      if (
        result.error?.includes("invalid") ||
        result.error?.includes("expired")
      ) {
        pageState.value = "invalid";
      } else {
        message.error(result.error || "Failed to reset password");
      }
    }
  } catch (error) {
    // Validation failed
  } finally {
    loading.value = false;
  }
};

const goToAuth = () => {
  router.push({ name: "auth", query: { mode: "login" } });
};

onMounted(() => {
  validateToken();
});
</script>

<style scoped>
.reset-password-container {
  width: 100%;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px 0;
}

.state-title {
  margin: 16px 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
}

.state-message {
  margin: 0 0 24px 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  max-width: 280px;
}

.form-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 24px;
}

.form-title {
  margin: 12px 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
}

.form-description {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.submit-button {
  margin-top: 8px;
}
</style>
