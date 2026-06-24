<template>
  <div class="register-form">
    <div class="form-header">Join the Photoreka community</div>

    <AuthProviders mode="register" />

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
      <n-form-item path="name" class="form-item">
        <n-input
          v-model:value="formData.name"
          placeholder="Full name"
          :input-props="{ autocomplete: 'name' }"
          class="form-input"
        >
          <template #prefix>
            <n-icon :component="UserIcon" />
          </template>
        </n-input>
      </n-form-item>

      <n-form-item path="email" class="form-item">
        <n-input
          v-model:value="formData.email"
          type="email"
          placeholder="Email"
          :input-props="{ autocomplete: 'email' }"
          class="form-input"
        >
          <template #prefix>
            <n-icon :component="EmailIcon" />
          </template>
        </n-input>
      </n-form-item>

      <n-form-item path="password" class="form-item">
        <n-input
          v-model:value="formData.password"
          type="password"
          placeholder="Password"
          :input-props="{ autocomplete: 'new-password' }"
          class="form-input"
          show-password-on="click"
        >
          <template #prefix>
            <n-icon :component="LockIcon" />
          </template>
        </n-input>
      </n-form-item>

      <div v-if="formData.password" class="password-strength">
        <div class="strength-header">
          <span>Password strength</span>
          <n-tag
            :type="
              passwordStrength.level === 'weak'
                ? 'error'
                : passwordStrength.level === 'medium'
                  ? 'warning'
                  : 'success'
            "
            size="small"
            round
            :bordered="false"
          >
            {{ passwordStrength.label }}
          </n-tag>
        </div>
        <div class="strength-bars" aria-hidden="true">
          <span
            v-for="bar in 3"
            :key="bar"
            :class="[
              'strength-bar',
              { active: bar <= passwordStrength.bars },
              `strength-${passwordStrength.level}`,
            ]"
          />
        </div>
        <div class="strength-hint">
          Use at least 8 characters and 1 special character.
        </div>
      </div>

      <div class="form-terms">
        <n-checkbox v-model:checked="acceptTerms" class="terms-checkbox">
          <span class="terms-text">
            I agree to the
            <a
              href="https://www.photoreka.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              class="terms-link"
              >terms and conditions</a
            >
            and
            <a
              href="https://www.photoreka.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              class="terms-link"
              >privacy policy</a
            >
          </span>
        </n-checkbox>
      </div>

      <n-button
        type="primary"
        size="large"
        :loading="userStore.isLoading"
        :disabled="!acceptTerms"
        class="submit-button"
        attr-type="submit"
      >
        Create Account
      </n-button>
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useMessage } from "naive-ui";
import type { FormInst, FormRules } from "naive-ui";
import AuthProviders from "./AuthProviders.vue";
import { h } from "vue";

// Icons
const UserIcon = () =>
  h(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
    },
    [
      h("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
      h("circle", { cx: "12", cy: "7", r: "4" }),
    ],
  );

const EmailIcon = () =>
  h(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
    },
    [
      h("path", {
        d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z",
      }),
      h("polyline", { points: "22,6 12,13 2,6" }),
    ],
  );

const LockIcon = () =>
  h(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
    },
    [
      h("rect", {
        x: "3",
        y: "11",
        width: "18",
        height: "11",
        rx: "2",
        ry: "2",
      }),
      h("circle", { cx: "12", cy: "16", r: "1" }),
      h("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }),
    ],
  );

const emit = defineEmits(["switch-mode"]);

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const message = useMessage();

const formRef = ref<FormInst | null>(null);
const acceptTerms = ref(false);

const formData = reactive({
  name: "",
  email: "",
  password: "",
});

const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>\[\]\\/_\-+=~`]/;

const passwordStrength = computed(() => {
  const password = formData.password || "";
  const checks = [
    password.length >= 8,
    /[a-zA-Z]/.test(password),
    /\d/.test(password),
    SPECIAL_CHAR_REGEX.test(password),
  ];

  const score = checks.filter(Boolean).length;

  if (score <= 1) {
    return { label: "Weak", level: "weak", bars: password.length ? 1 : 0 };
  }

  if (score <= 3) {
    return { label: "Medium", level: "medium", bars: 2 };
  }

  return { label: "Strong", level: "strong", bars: 3 };
});

const rules: FormRules = {
  name: [
    {
      required: true,
      message: "Name is required",
      trigger: ["input", "blur"],
    },
    {
      min: 2,
      message: "Name must be at least 2 characters",
      trigger: ["input", "blur"],
    },
  ],
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
      min: 8,
      message: "Password must be at least 8 characters",
      trigger: ["input", "blur"],
    },
    {
      validator: (_rule, value: string) => SPECIAL_CHAR_REGEX.test(value),
      message: "Password must include at least 1 special character",
      trigger: ["input", "blur"],
    },
  ],
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  if (!acceptTerms.value) {
    message.warning("You must accept the terms and conditions");
    return;
  }

  try {
    await formRef.value.validate();

    // Obtener inviteCode de la query string si existe
    const inviteCode = route.query.inviteCode as string | undefined;

    const result = await userStore.register(
      formData.email,
      formData.password,
      formData.name,
      inviteCode,
    );

    if (result.success) {
      // message.success(
      //   "Account created successfully! Let's set up your profile.",
      // );
      router.push("/profile-setup");
    } else {
      message.error(result.error || "Error creating account");
    }
  } catch (error) {
    // Validation failed, errors will be shown in form
  }
};
</script>

<style scoped>
.register-form {
  width: 100%;
}

.form-header {
  text-align: center;
  margin-bottom: 12px;
  font-size: 16px;
  color: var(--text-primary);
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

.form-terms {
  margin-bottom: 12px;
}

.password-strength {
  margin-top: -2px;
  margin-bottom: 12px;
}

.strength-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.strength-bars {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 6px;
}

.strength-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--border-color);
  transition: background-color 0.2s ease;
}

.strength-bar.active.strength-weak {
  background-color: #ef4444;
}

.strength-bar.active.strength-medium {
  background-color: #f59e0b;
}

.strength-bar.active.strength-strong {
  background-color: #22c55e;
}

.strength-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.terms-checkbox :deep(.n-checkbox__label) {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.terms-text {
  display: inline;
}

.terms-link {
  font-size: 14px;
  padding: 0;
  height: auto;
  display: inline;
  vertical-align: baseline;
  color: var(--primary-color, #2563eb);
  text-decoration: none;
  cursor: pointer;
}

.terms-link:hover {
  text-decoration: underline;
}

.submit-button {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 0;
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  color: var(--text-primary);
  position: relative;
  z-index: 1;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .form-header {
    /* margin-bottom: 24px; */
  }

  .form-title {
    /* font-size: 24px; */
  }

  .form-description {
    font-size: 14px;
  }

  .form-input,
  .submit-button {
    height: 44px;
  }

  .form-terms {
    margin-bottom: 20px;
  }

  .strength-header,
  .strength-hint {
    font-size: 11px;
  }

  .terms-checkbox :deep(.n-checkbox__label) {
    font-size: 13px;
  }

  .terms-link {
    font-size: 13px;
  }

  .form-footer {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
