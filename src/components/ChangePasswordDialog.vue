<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    :style="{ width: '400px' }"
    title="Change Password"
    :bordered="false"
    :segmented="{ content: true }"
    :closable="true"
    :mask-closable="true"
    @update:show="handleClose"
  >
    <template v-if="!passwordChanged">
      <p class="description">
        Enter your current password and choose a new one.
      </p>

      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        :show-label="false"
        @submit.prevent="handleSubmit"
      >
        <n-form-item path="currentPassword">
          <n-input
            v-model:value="formData.currentPassword"
            type="password"
            placeholder="Current Password"
            size="large"
            show-password-on="click"
            :input-props="{ autocomplete: 'current-password' }"
          >
            <template #prefix>
              <n-icon :component="LockClosedOutline" />
            </template>
          </n-input>
        </n-form-item>

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
        >
          Change Password
        </n-button>
      </n-form>
    </template>

    <template v-else>
      <div class="success-state">
        <n-icon :component="CheckmarkCircleOutline" size="64" color="#10b981" />
        <h3 class="success-title">Password Changed!</h3>
        <p class="success-message">
          Your password has been updated successfully.
        </p>
        <n-button type="primary" size="large" block @click="handleClose">
          Done
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { useMessage } from "naive-ui";
import type { FormInst, FormRules } from "naive-ui";
import { LockClosedOutline, CheckmarkCircleOutline } from "@vicons/ionicons5";
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
const passwordChanged = ref(false);

const showModal = ref(props.show);

watch(
  () => props.show,
  (newValue) => {
    showModal.value = newValue;
    if (newValue) {
      // Reset state when dialog opens
      passwordChanged.value = false;
      formData.currentPassword = "";
      formData.newPassword = "";
      formData.confirmPassword = "";
    }
  }
);

watch(showModal, (newValue) => {
  emit("update:show", newValue);
});

const formData = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

const rules: FormRules = {
  currentPassword: [
    {
      required: true,
      message: "Current password is required",
      trigger: ["input", "blur"],
    },
  ],
  newPassword: [
    {
      required: true,
      message: "New password is required",
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
      message: "Please confirm your new password",
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

const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    loading.value = true;

    const result = await userStore.changePassword(
      formData.currentPassword,
      formData.newPassword
    );

    if (result.success) {
      passwordChanged.value = true;
    } else {
      message.error(result.error || "Failed to change password");
    }
  } catch (error) {
    // Validation failed
  } finally {
    loading.value = false;
  }
};

const handleClose = () => {
  showModal.value = false;
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
  margin: 0 0 24px 0;
  color: #ffffff99;
  font-size: 14px;
  line-height: 1.6;
}
</style>
