<template>
  <div v-if="showModal" class="mobile-notice-fullscreen">
    <div class="notice-container">
      <div class="modal-header">
        <AppLogo size="large" />
      </div>

      <div class="mobile-notice-content">
        <!-- <div class="notice-icon">
          <n-icon size="48" color="#2563eb">
            <DesktopOutline />
          </n-icon>
        </div> -->

        <p class="notice-description">
          🖥️ Photoreka is designed to provide the most complete experience on
          desktop computers and tablets.
        </p>

        <div class="notice-features">
          <div class="feature-item">
            <n-icon size="20" color="#22c55e">
              <CheckmarkCircleOutline />
            </n-icon>
            <span>Full interactive canvas</span>
          </div>
          <div class="feature-item">
            <n-icon size="20" color="#22c55e">
              <CheckmarkCircleOutline />
            </n-icon>
            <span>Advanced photo exploration</span>
          </div>
          <div class="feature-item">
            <n-icon size="20" color="#22c55e">
              <CheckmarkCircleOutline />
            </n-icon>
            <span>Professional curation tools</span>
          </div>
        </div>

        <div class="notice-recommendation">
          <n-icon size="24" color="#f59e0b">
            <BulbOutline />
          </n-icon>
          <span>
            We recommend using a desktop computer or tablet to enjoy all visual
            curation and photo exploration features.
          </span>
        </div>

        <div class="notice-actions">
          <n-button type="primary" size="large" block @click="handleGoHome">
            Back to Home
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { NButton, NIcon } from "naive-ui";
import {
  DesktopOutline,
  CheckmarkCircleOutline,
  BulbOutline,
} from "@vicons/ionicons5";
import AppLogo from "./AppLogo.vue";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:show", "goHome"]);

const showModal = computed({
  get: () => props.show,
  set: (value) => emit("update:show", value),
});

const handleGoHome = () => {
  emit("goHome");
  showModal.value = false;
};
</script>

<style scoped>
.mobile-notice-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-body);
  z-index: 9999;
  overflow-y: auto;
}

.notice-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 40px 24px;
  box-sizing: border-box;
}

.modal-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 10px;
}

.mobile-notice-content {
  text-align: center;
  max-width: 400px;
  width: 100%;
}

.notice-icon {
  margin-bottom: 24px;
  display: flex;
  justify-content: center;
}

.notice-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 20px 0;
  line-height: 1.3;
}

.notice-description {
  font-size: 18px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0 0 32px 0;
}

.notice-features {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
  text-align: left;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  color: var(--text-secondary);
}

.notice-recommendation {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 40px;
  text-align: left;
}

.notice-recommendation span {
  font-size: 16px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.notice-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .notice-container {
    padding: 32px 20px;
  }

  .notice-title {
    font-size: 24px;
  }

  .notice-description {
    font-size: 16px;
  }

  .feature-item {
    font-size: 15px;
  }

  .notice-recommendation span {
    font-size: 15px;
  }
}

@media (max-width: 360px) {
  .notice-container {
    padding: 24px 16px;
  }

  .notice-title {
    font-size: 22px;
  }

  .notice-description {
    font-size: 15px;
  }
}
</style>
