<template>
  <div class="login-form">
    <div class="form-header">Access your Photoreka account</div>

    <AuthProviders mode="login" />

    <div class="email-divider">
      <span class="divider-text">Or with email</span>
    </div>

    <n-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      size="large"
      :show-label="false"
      :show-feedback="false"
      @submit.prevent="handleSubmit"
    >
      <n-form-item path="email" class="form-item">
        <n-input
          v-model:value="formData.email"
          type="email"
          placeholder="Email"
          :input-props="{ autocomplete: 'email' }"
          class="form-input"
        >
          <template #prefix>
            <n-icon :component="MailOutlined" />
          </template>
        </n-input>
      </n-form-item>

      <n-form-item path="password" class="form-item">
        <n-input
          v-model:value="formData.password"
          type="password"
          placeholder="Password"
          :input-props="{ autocomplete: 'current-password' }"
          class="form-input"
          show-password-on="click"
        >
          <template #prefix>
            <n-icon :component="LockClosedOutline" />
          </template>
        </n-input>
      </n-form-item>

      <div class="form-options">
        <n-checkbox v-model:checked="rememberMe" class="remember-checkbox">
          Remember me
        </n-checkbox>
        <n-button
          text
          type="primary"
          class="forgot-password"
          @click="showForgotPassword = true"
        >
          Forgot password?
        </n-button>
      </div>

      <n-button
        type="primary"
        size="large"
        :loading="userStore.isLoading"
        class="submit-button"
        attr-type="submit"
      >
        Log In
      </n-button>
    </n-form>

    <!-- Forgot Password Dialog -->
    <ForgotPasswordDialog v-model:show="showForgotPassword" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useUserStore } from "../stores/userStore";
import { useMessage } from "naive-ui";
import type { FormInst, FormRules } from "naive-ui";
import AuthProviders from "./AuthProviders.vue";
import ForgotPasswordDialog from "./ForgotPasswordDialog.vue";
import { MailOutline, LockClosedOutline } from "@vicons/ionicons5";
import { MailOutlined } from "@vicons/material";

const emit = defineEmits(["switch-mode"]);

const userStore = useUserStore();
const message = useMessage();

const formRef = ref<FormInst | null>(null);
const rememberMe = ref(false);
const showForgotPassword = ref(false);

const formData = reactive({
  email: "",
  password: "",
});

const rules: FormRules = {
  email: [
    {
      required: true,
      message: "Email is required",
      trigger: ["input", "blur"],
    },
    {
      type: "email",
      message: "Invalid email format",
      trigger: ["input", "blur"],
    },
  ],
  password: [
    {
      required: true,
      message: "Password is required",
      trigger: ["input", "blur"],
    },
    {
      min: 6,
      message: "Password must be at least 6 characters",
      trigger: ["input", "blur"],
    },
  ],
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();

    const result = await userStore.login(formData.email, formData.password);

    if (result.success) {
      // No navegar aquí - el watcher de isAuthenticated en App.vue se encarga
      // de redirigir al destino correcto tras cargar el catálogo
    } else {
      message.error(result.error || "Error logging in", { duration: 10000 });
    }
  } catch (error) {
    // Validation failed, errors will be shown in form
  }
};
</script>

<script lang="ts">
export default {
  name: "LoginForm",
};
</script>

<style scoped>
.login-form {
  width: 100%;
}

.form-header {
  text-align: center;
  margin-bottom: 12px;
  font-size: 16px;
  color: var(--text-secondary);
  font-weight: 400;
  line-height: 1.6;
}

.form-item {
  margin-bottom: 12px;
}

.form-item :deep(.n-form-item-feedback-wrapper) {
  display: none !important;
}

.form-item :deep([data-feedback]) {
  display: none !important;
}

.form-input {
  height: 36px;
  border-radius: 6px;
}

.form-input :deep(.n-input__input-el) {
  font-size: 14px;
}

.form-input :deep(.n-input__border),
.form-input :deep(.n-input__state-border) {
  border-color: var(--border-color);
}

.form-input :deep(.n-input--focus .n-input__border),
.form-input :deep(.n-input--focus .n-input__state-border) {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.remember-checkbox :deep(.n-checkbox__label) {
  font-size: 14px;
  color: var(--text-secondary);
}

.forgot-password {
  font-size: 14px;
  padding: 0;
  height: auto;
}

.submit-button {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 0;
}

.email-divider {
  position: relative;
  text-align: center;
  margin: 8px 0;
}

.email-divider::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background-color: var(--border-color);
}

.divider-text {
  background-color: var(--bg-body);
  padding: 0 16px;
  font-size: 13px;
  color: var(--text-secondary);
  position: relative;
  z-index: 1;
}

.form-footer {
  text-align: center;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.footer-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.switch-button {
  font-size: 14px;
  padding: 0;
  height: auto;
  font-weight: 500;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .form-header {
    /* margin-bottom: 24px; */
  }

  .form-input,
  .submit-button {
    height: 44px;
  }

  .form-options {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 20px;
  }

  .form-footer {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
