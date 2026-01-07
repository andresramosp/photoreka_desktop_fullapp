<template>
  <n-modal
    v-if="show"
    :show="show"
    preset="card"
    :style="{ width: '400px' }"
    title="Reset Password"
    :bordered="false"
    :segmented="{ content: true }"
    :closable="true"
    :mask-closable="true"
    @update:show="(val) => emit('update:show', val)"
  >
    <template v-if="!emailSent">
      <p class="description">
        Enter your email address and we'll send you a link to reset your
        password.
      </p>

      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        :show-label="false"
        @submit.prevent="handleSubmit"
      >
        <n-form-item path="email">
          <n-input
            v-model:value="formData.email"
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
          :loading="loading"
          attr-type="submit"
        >
          Send Reset Link
        </n-button>
      </n-form>
    </template>

    <template v-else>
      <div class="success-state">
        <n-icon :component="CheckmarkCircleOutline" size="64" color="#10b981" />
        <h3 class="success-title">Email Sent!</h3>
        <p class="success-message">
          We've sent a password reset link to
          <strong>{{ formData.email }}</strong
          >. Please check your inbox and follow the instructions.
        </p>
        <p class="success-note">
          If you don't see the email, check your spam folder.
        </p>
        <n-button type="primary" size="large" block @click="handleClose">
          Got it
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { useMessage } from "naive-ui";
import type { FormInst, FormRules } from "naive-ui";
import { MailOutline, CheckmarkCircleOutline } from "@vicons/ionicons5";
import { useUserStore } from "../stores/userStore";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
}>();

const userStore = useUserStore();
const message = useMessage();
const formRef = ref<FormInst | null>(null);
const loading = ref(false);
const emailSent = ref(false);

watch(
  () => props.show,
  (newValue) => {
    if (newValue) {
      // Reset state when dialog opens
      emailSent.value = false;
      formData.email = "";
    }
  }
);

const formData = reactive({
  email: "",
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
      message: "Please enter a valid email address",
      trigger: ["input", "blur"],
    },
  ],
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    loading.value = true;

    const result = await userStore.forgotPassword(formData.email);

    if (result.success) {
      emailSent.value = true;
    } else {
      message.error(result.error || "Failed to send reset link");
    }
  } catch (error) {
    // Validation failed
  } finally {
    loading.value = false;
  }
};

const handleClose = () => {
  emit("update:show", false);
};
</script>

<style scoped>
.description {
  margin: 0 0 20px 0;
  color: #ffffff99;
  font-size: 14px;
  line-height: 1.6;
}

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px 0;
}

.success-title {
  margin: 16px 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffff;
}

.success-message {
  margin: 0 0 8px 0;
  color: #ffffff99;
  font-size: 14px;
  line-height: 1.6;
}

.success-message strong {
  color: #ffffff;
}

.success-note {
  margin: 0 0 24px 0;
  color: #ffffff66;
  font-size: 13px;
}
</style>
