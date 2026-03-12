<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    title="Join the Waiting List"
    :mask-closable="true"
    :closable="true"
    :auto-focus="false"
    :icon="undefined"
    style="width: 740px; max-width: 90vw"
  >
    <template #icon>
      <n-icon size="24" color="#2563eb">
        <KeyOutline />
      </n-icon>
    </template>

    <template #header>
      <div class="dialog-header">
        <span class="dialog-title">Join the Waiting List</span>
      </div>
    </template>

    <div class="dialog-content">
      <p class="intro-text">
        Photoreka is currently rolling out access in small batches. New users
        are invited progressively in groups of 20, so we can closely monitor
        quality and performance.
      </p>

      <p class="intro-text">
        Leave your email below to join the waiting list. We will notify you as
        soon as your batch is ready.
      </p>

      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        size="medium"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="Email Address" path="email" required>
          <n-input
            v-model:value="formData.email"
            type="email"
            placeholder="your.email@example.com"
            :disabled="loading"
          />
        </n-form-item>

        <n-form-item label="Portfolio / Social link" path="portfolioLink">
          <n-input
            v-model:value="formData.portfolioLink"
            placeholder="https://your-portfolio.com or Instagram"
            :disabled="loading"
          />
          <template #feedback>
            <span class="optional-text">
              Optional. Helps us prioritize photographers with active work.
            </span>
          </template>
        </n-form-item>

        <n-form-item path="hasLargeCollection" class="switch-form-item">
          <div class="switch-container">
            <span class="switch-label">
              I manage a photo collection larger than 500 images
            </span>
            <n-switch
              v-model:value="formData.hasLargeCollection"
              :disabled="loading"
              size="medium"
            />
          </div>
          <template #feedback v-if="!formData.hasLargeCollection">
            <span class="info-message">
              Photoreka is optimized for large libraries, but smaller
              collections are still welcome on the waiting list.
            </span>
          </template>
        </n-form-item>
      </n-form>
    </div>

    <template #action>
      <div class="dialog-actions">
        <n-button @click="handleCancel" :disabled="loading">Cancel</n-button>
        <n-button
          type="primary"
          @click="handleSubmit"
          :loading="loading"
          :disabled="!isFormValid"
        >
          <template #icon>
            <n-icon><SendOutline /></n-icon>
          </template>
          Join Waiting List
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NButton,
  NIcon,
  NSwitch,
  useMessage,
} from "naive-ui";
import { KeyOutline, RocketOutline, SendOutline } from "@vicons/ionicons5";
import { api } from "@/utils/axios.js";
import { trackEvent, trackUserAction } from "@/utils/analytics";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:show", "success"]);

const message = useMessage();
const formRef = ref(null);
const loading = ref(false);

const visible = computed({
  get: () => props.show,
  set: (value) => emit("update:show", value),
});

const formData = reactive({
  email: "",
  reason: "",
  portfolioLink: "",
  hasLargeCollection: true,
  noAIConcerns: true,
});

const reasonOptions = [
  {
    label: "Professional photographer looking for better organization tools",
    value: "professional",
  },
  {
    label: "Creative photographer interested in AI-powered search",
    value: "creative",
  },
  {
    label: "Photography educator exploring new workflow tools",
    value: "educator",
  },
  {
    label: "Photography enthusiast with large photo collections",
    value: "enthusiast",
  },
];

const rules = {
  email: [
    { required: true, message: "Email is required" },
    { type: "email", message: "Please enter a valid email address" },
  ],
  reason: [{ required: false, message: "Please select a reason for testing" }],
};

const isFormValid = computed(() => {
  return (
    formData.email && formData.email.includes("@") && formData.noAIConcerns
  );
});

const handleCancel = () => {
  trackUserAction("cancel", "request_access_dialog");
  visible.value = false;
};

const handleSubmit = async () => {
  try {
    await formRef.value?.validate();

    loading.value = true;

    // Track form submission attempt
    trackEvent("form_submit_attempt", {
      form_type: "request_access",
      has_portfolio: !!formData.portfolioLink,
      has_large_collection: formData.hasLargeCollection,
      agrees_to_ai: formData.noAIConcerns,
    });

    const response = await api.post("/api/landing/waiting-list", {
      email: formData.email,
      reason: formData.reason,
      portfolioLink: formData.portfolioLink || null,
      hasLargeCollection: formData.hasLargeCollection,
      noAIConcerns: formData.noAIConcerns,
    });

    // Track successful submission
    trackEvent("form_submit_success", {
      form_type: "request_access",
    });

    message.success(
      "Access request submitted successfully! We'll be in touch soon.",
    );

    // Reset form
    formData.email = "";
    formData.reason = "";
    formData.portfolioLink = "";
    formData.hasLargeCollection = true;
    formData.noAIConcerns = false;

    visible.value = false;
    emit("success");
  } catch (error) {
    console.error("Error submitting request:", error);

    // Track form submission error
    trackEvent("form_submit_error", {
      form_type: "request_access",
      error_status: error.response?.status || "unknown",
    });

    if (error.response?.status === 409) {
      message.warning(
        "You have already submitted a request with this email address.",
      );
    } else if (error.response?.status === 400) {
      message.error("Please check your information and try again.");
    }
  } finally {
    loading.value = false;
  }
};

// Reset form when dialog closes
watch(visible, (newValue) => {
  if (!newValue) {
    // Reset form data when dialog closes
    setTimeout(() => {
      formData.email = "";
      formData.reason = "";
      formData.portfolioLink = "";
      formData.hasLargeCollection = true;
      formData.noAIConcerns = false;
    }, 300); // Delay to avoid visual glitch
  }
});
</script>

<style>
/* Hide the default dialog icon (exclamation mark) */
:deep(.n-dialog__icon) {
  display: none !important;
}
</style>

<style scoped>
.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-content {
  padding: 0;
}

.intro-text {
  color: var(--text-secondary);
  line-height: 1.6;
  font-size: 14px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.optional-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}

.info-message {
  font-size: 12px;
  color: var(--warning-color);
  font-style: italic;
  display: block;
  margin-top: -4px;
  margin-bottom: -8px;
}

.switch-form-item :deep(.n-form-item-label) {
  display: none;
}

.switch-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

/* Reduce spacing between consecutive switch form items */
:deep(.switch-form-item + .switch-form-item) {
  margin-top: -26px;
}

/* Reduce spacing within switch form items */
:deep(.switch-form-item .n-form-item__feedback) {
  margin-top: -8px;
  margin-bottom: -8px;
}

.switch-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
}

:deep(.n-form-item-label) {
  font-weight: 500;
  color: var(--text-primary);
}

:deep(.n-dialog__content) {
  padding: 20px 24px !important;
}

:deep(.n-dialog__action) {
  padding: 20px 24px !important;
  border-top: 1px solid var(--border-color);
}

:deep(.n-dialog__header) {
  padding: 20px 24px 0 24px !important;
}

/* Mobile responsive */
@media (max-width: 600px) {
  .dialog-actions {
    flex-direction: column-reverse;
  }

  .intro-text {
    font-size: 13px;
  }
}
</style>
