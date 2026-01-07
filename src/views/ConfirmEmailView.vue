<template>
  <AuthLayout>
    <div class="confirm-email-container">
      <!-- Loading State -->
      <template v-if="pageState === 'loading'">
        <div class="state-container">
          <n-spin size="large" />
          <p class="state-message">Confirming your email...</p>
        </div>
      </template>

      <!-- Success State -->
      <template v-else-if="pageState === 'success'">
        <div class="state-container">
          <n-icon
            :component="CheckmarkCircleOutline"
            size="64"
            color="#10b981"
          />
          <h2 class="state-title">Email Confirmed!</h2>
          <p class="state-message">
            Your email has been verified successfully. You can now access all
            features of your account.
          </p>
          <n-button type="primary" size="large" @click="goToApp">
            {{ userStore.isAuthenticated ? "Go to Dashboard" : "Go to Login" }}
          </n-button>
        </div>
      </template>

      <!-- Error State -->
      <template v-else-if="pageState === 'error'">
        <div class="state-container">
          <n-icon :component="CloseCircleOutline" size="64" color="#ef4444" />
          <h2 class="state-title">Confirmation Failed</h2>
          <p class="state-message">
            {{ errorMessage }}
          </p>

          <div class="action-buttons">
            <n-button
              v-if="showResendOption"
              type="primary"
              size="large"
              :loading="resendLoading"
              @click="showResendForm = true"
            >
              Resend Confirmation Email
            </n-button>
            <n-button size="large" @click="goToAuth"> Back to Login </n-button>
          </div>
        </div>

        <!-- Resend Confirmation Form -->
        <n-modal
          v-model:show="showResendForm"
          preset="card"
          :style="{ width: '400px' }"
          title="Resend Confirmation Email"
          :bordered="false"
        >
          <template v-if="!resendSuccess">
            <p class="resend-description">
              Enter your email address and we'll send you a new confirmation
              link.
            </p>

            <n-form
              ref="resendFormRef"
              :model="resendFormData"
              :rules="resendRules"
              :show-label="false"
              @submit.prevent="handleResend"
            >
              <n-form-item path="email">
                <n-input
                  v-model:value="resendFormData.email"
                  type="email"
                  placeholder="Enter your email"
                  size="large"
                  :input-props="{ autocomplete: 'email' }"
                >
                  <template #prefix>
                    <n-icon :component="MailOutline" />
                  </template>
                </n-input>
              </n-form-item>

              <n-button
                type="primary"
                size="large"
                block
                :loading="resendLoading"
                attr-type="submit"
              >
                Send Confirmation Email
              </n-button>
            </n-form>
          </template>

          <template v-else>
            <div class="resend-success">
              <n-icon
                :component="CheckmarkCircleOutline"
                size="48"
                color="#10b981"
              />
              <p class="resend-success-message">
                A new confirmation email has been sent to
                <strong>{{ resendFormData.email }}</strong
                >.
              </p>
              <n-button
                type="primary"
                size="large"
                block
                @click="showResendForm = false"
              >
                Got it
              </n-button>
            </div>
          </template>
        </n-modal>
      </template>

      <!-- Already Confirmed State -->
      <template v-else-if="pageState === 'already-confirmed'">
        <div class="state-container">
          <n-icon
            :component="InformationCircleOutline"
            size="64"
            color="#2563eb"
          />
          <h2 class="state-title">Already Verified</h2>
          <p class="state-message">
            This email has already been confirmed. You can log in to your
            account.
          </p>
          <n-button type="primary" size="large" @click="goToApp">
            {{ userStore.isAuthenticated ? "Go to Dashboard" : "Go to Login" }}
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
import type { FormInst, FormRules } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseCircleOutline,
  InformationCircleOutline,
  MailOutline,
} from "@vicons/ionicons5";
import AuthLayout from "../components/AuthLayout.vue";
import { useUserStore } from "../stores/userStore";

defineOptions({
  name: "ConfirmEmailView",
});

type PageState = "loading" | "success" | "error" | "already-confirmed";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const message = useMessage();

const pageState = ref<PageState>("loading");
const errorMessage = ref("This confirmation link is invalid or has expired.");
const showResendOption = ref(true);
const showResendForm = ref(false);
const resendLoading = ref(false);
const resendSuccess = ref(false);
const resendFormRef = ref<FormInst | null>(null);

const resendFormData = reactive({
  email: "",
});

const resendRules: FormRules = {
  email: [
    {
      required: true,
      message: "Email is required",
      trigger: ["input", "blur"],
    },
    {
      type: "email",
      message: "Please enter a valid email address",
      trigger: ["input", "blur"],
    },
  ],
};

const confirmEmail = async () => {
  const token = route.query.token as string;

  if (!token || token.length < 20 || token.length > 100) {
    pageState.value = "error";
    errorMessage.value = "This confirmation link is invalid.";
    return;
  }

  try {
    const result = await userStore.confirmEmail(token);

    if (result.success) {
      pageState.value = "success";
    } else {
      if (result.error?.includes("already")) {
        pageState.value = "already-confirmed";
      } else {
        pageState.value = "error";
        errorMessage.value =
          result.error || "This confirmation link is invalid or has expired.";
      }
    }
  } catch (error) {
    pageState.value = "error";
    errorMessage.value = "An unexpected error occurred. Please try again.";
  }
};

const handleResend = async () => {
  if (!resendFormRef.value) return;

  try {
    await resendFormRef.value.validate();
    resendLoading.value = true;

    const result = await userStore.resendConfirmation(resendFormData.email);

    if (result.success) {
      resendSuccess.value = true;
    } else {
      message.error(result.error || "Failed to send confirmation email");
    }
  } catch (error) {
    // Validation failed
  } finally {
    resendLoading.value = false;
  }
};

const goToApp = () => {
  if (userStore.isAuthenticated) {
    router.push({ name: "dashboard" });
  } else {
    router.push({ name: "auth", query: { mode: "login" } });
  }
};

const goToAuth = () => {
  router.push({ name: "auth", query: { mode: "login" } });
};

onMounted(() => {
  confirmEmail();
});
</script>

<style scoped>
.confirm-email-container {
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
  color: #ffffff99;
  font-size: 14px;
  line-height: 1.6;
  max-width: 280px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 280px;
}

.resend-description {
  margin: 0 0 20px 0;
  color: #ffffff99;
  font-size: 14px;
  line-height: 1.6;
}

.resend-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px 0;
}

.resend-success-message {
  margin: 16px 0 24px 0;
  color: #ffffff99;
  font-size: 14px;
  line-height: 1.6;
}

.resend-success-message strong {
  color: #ffffff;
}
</style>
