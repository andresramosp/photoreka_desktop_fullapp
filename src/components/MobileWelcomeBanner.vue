<template>
  <Transition name="slide-down">
    <div v-if="show" class="mobile-welcome-banner">
      <div class="banner-content">
        <div class="banner-icon">
          <n-icon size="20" color="#3b82f6">
            <PhonePortraitOutline />
          </n-icon>
        </div>
        <div class="banner-text">
          <p class="banner-title">📱 Photoreka Mobile</p>
          <p class="banner-description">
            Explore, search and understand your archive from anywhere. Advanced
            canvas and analysis tools are available on desktop.
          </p>
        </div>
        <button class="banner-close" @click="handleClose" aria-label="Close">
          <n-icon size="18">
            <CloseOutline />
          </n-icon>
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { NIcon } from "naive-ui";
import { PhonePortraitOutline, CloseOutline } from "@vicons/ionicons5";

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const handleClose = () => {
  emit("close");
};
</script>

<style scoped>
.mobile-welcome-banner {
  position: fixed;
  top: 64px; /* Below header */
  left: 0;
  right: 0;
  z-index: 999;
  padding: 0 16px;
}

.banner-content {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.15) 0%,
    rgba(99, 102, 241, 0.1) 100%
  );
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
  padding: 14px 16px;
  backdrop-filter: blur(10px);
}

.banner-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 8px;
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

.banner-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
}

.banner-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.banner-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

/* Transition animations */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Light theme adjustments */
[data-theme="light"] .banner-content {
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.1) 0%,
    rgba(99, 102, 241, 0.08) 100%
  );
  border-color: rgba(59, 130, 246, 0.25);
}

[data-theme="light"] .banner-close:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Responsive */
@media (max-width: 480px) {
  .mobile-welcome-banner {
    padding: 0 12px;
    top: 56px;
  }

  .banner-content {
    padding: 12px;
    gap: 10px;
  }

  .banner-icon {
    width: 28px;
    height: 28px;
  }

  .banner-title {
    font-size: 13px;
  }

  .banner-description {
    font-size: 12px;
  }
}
</style>
