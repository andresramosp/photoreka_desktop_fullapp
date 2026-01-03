<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :style="{ maxWidth: '92vw', width: '650px', maxHeight: '90vh' }"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :auto-focus="false"
    class="welcome-modal"
  >
    <template #header>
      <div class="welcome-header">
        <div class="logo-container">
          <!-- <AppLogo :height="60" inline /> -->
        </div>
        <h4 class="welcome-title">Welcome to Photoreka</h4>
        <!-- <p class="welcome-subtitle">
          Your journey with intelligent photo management starts here
        </p> -->
      </div>
    </template>

    <div class="welcome-content">
      <div class="welcome-message">
        <div class="message-text">
          <!-- Precise Mode Message -->
          <template v-if="!ONBOARDING_SOFT">
            <p class="main-message">
              Photoreka is designed to work with large photo collections and
              bodies of work. To ensure consistent performance, we require a
              minimum of
              <strong style="color: #f59e0b"
                >{{ MIN_PHOTOS_THRESHOLD }} photos</strong
              >
              to unlock the full potential of the platform.
            </p>

            <p class="secondary-message">Here's how to get started:</p>

            <ul class="steps-list no-bullets">
              <li>Upload your photos to the <strong>Lightbox</strong></li>
              <li>
                Watch your progress as you approach
                {{ MIN_PHOTOS_THRESHOLD }} photos
              </li>
              <li>
                Analyze your first batch of {{ MIN_PHOTOS_THRESHOLD }}+ photos
              </li>
              <li>
                Enjoy unrestricted access with no minimum limits thereafter
              </li>
            </ul>

            <p class="final-message">
              Once you've processed your first
              {{ MIN_PHOTOS_THRESHOLD }} photos, you can add and process any
              number of photos without restrictions!
            </p>
          </template>

          <!-- Soft Mode Message -->
          <template v-else>
            <p class="main-message">
              Photoreka is designed to work with large photo collections. For
              the best experience,
              <strong>we recommend</strong> starting with at least
              <strong style="color: #8b5cf6"
                >{{ MIN_PHOTOS_THRESHOLD }} photos</strong
              >
            </p>

            <p class="secondary-message">Here's how to get started:</p>

            <ul class="steps-list">
              <li>
                <n-icon
                  size="20"
                  color="#2563eb"
                  style="vertical-align: middle; margin-right: 8px"
                >
                  <PhotoOutlined />
                </n-icon>
                Import your photos to the Lightbox
              </li>
              <li>
                <n-icon
                  size="20"
                  color="#10b981"
                  style="vertical-align: middle; margin-right: 8px"
                >
                  <SearchOutline />
                </n-icon>
                Click on Analyze to start processing your photos
              </li>
              <li>
                <n-icon
                  size="20"
                  color="#f59e42"
                  style="vertical-align: middle; margin-right: 8px"
                >
                  <SparklesOutline />
                </n-icon>
                Once processing is complete, start playing with features right
                away
              </li>
            </ul>

            <p style="margin-top: 25px; margin-bottom: 0px">
              You can start with any number of photos, but larger collections
              provide richer insights and better results!
            </p>
          </template>
        </div>
      </div>

      <div class="welcome-actions">
        <n-button
          type="primary"
          size="large"
          @click="getStarted"
          class="get-started-button"
        >
          Get Started
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { computed } from "vue";
import { NModal, NButton, NIcon } from "naive-ui";
import { MIN_PHOTOS_THRESHOLD, ONBOARDING_SOFT } from "@/stores/photos";
import { SearchOutline, SparklesOutline } from "@vicons/ionicons5";
import { PhotoOutlined } from "@vicons/material";
import AppLogo from "./AppLogo.vue";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "get-started"]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const getStarted = () => {
  emit("get-started");
  visible.value = false;
};
</script>

<style scoped>
.welcome-modal {
  backdrop-filter: blur(8px);
}

.welcome-header {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}

.logo-container {
  display: flex;
  justify-content: center;
  margin-bottom: var(--spacing-lg);
}

.welcome-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  background: linear-gradient(
    135deg,
    var(--primary-color),
    var(--secondary-color)
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

.welcome-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
}

.welcome-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-xl);
}

.welcome-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-round);
  background: linear-gradient(
    135deg,
    rgba(37, 99, 235, 0.1),
    rgba(59, 130, 246, 0.1)
  );
  border: 2px solid rgba(37, 99, 235, 0.2);
}

.message-text {
  max-width: 500px;
}

.main-message {
  font-size: 16px;
  color: var(--text-primary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.secondary-message {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0 0 23px 23px;
  font-weight: var(--font-weight-medium);
}

.steps-list {
  text-align: left;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
  list-style: none;
  padding-left: 0;
}

.no-bullets {
  list-style: none;
  padding-left: 0;
}

.steps-list li {
  margin-bottom: var(--spacing-xs);
}

.steps-list strong {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.final-message {
  font-size: 14px;
  color: var(--text-tertiary);
  line-height: var(--line-height-relaxed);
  margin: 0;
  font-style: italic;
}

.welcome-actions {
  display: flex;
  justify-content: center;
  padding-top: var(--spacing-lg);
}

.get-started-button {
  min-width: 160px;
  height: 44px;
  font-size: 16px;
  font-weight: var(--font-weight-semibold);
}

/* Responsive Design */
@media (max-width: 768px) {
  .welcome-title {
    font-size: var(--font-size-2xl);
  }

  .welcome-icon {
    width: 64px;
    height: 64px;
  }

  .welcome-icon :deep(.n-icon) {
    font-size: 48px;
  }

  .main-message {
    font-size: 15px;
  }

  .secondary-message {
    font-size: 14px;
  }

  .steps-list {
    font-size: 13px;
  }

  .final-message {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .welcome-modal :deep(.n-card) {
    margin: var(--spacing-md);
  }

  .get-started-button {
    width: 100%;
  }
}
</style>
