<template>
  <div v-if="shouldShow" class="floating-process-container">
    <!-- Disabled state with progress bar -->
    <div
      v-if="buttonState === 'disabled'"
      class="floating-process-button disabled-with-progress"
    >
      <div class="progress-background">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <div class="button-content">
        <n-icon size="18" class="button-icon">
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            />
          </svg>
        </n-icon>
        <div class="button-text">
          <div class="main-text">Upload {{ MIN_PHOTOS_THRESHOLD }} Photos</div>
          <div class="progress-text">
            {{ Math.floor(progress) }}% Complete ({{
              Math.floor((progress * MIN_PHOTOS_THRESHOLD) / 100)
            }}/{{ MIN_PHOTOS_THRESHOLD }})
          </div>
        </div>
      </div>
    </div>

    <!-- Processing state - normal disabled button with spinner + tooltip -->
    <n-tooltip
      v-else-if="buttonState === 'processing'"
      placement="top"
      trigger="hover"
    >
      <template #trigger>
        <n-button
          type="info"
          size="large"
          class="floating-process-button enabled"
          disabled
        >
          <template #icon>
            <n-icon size="18" class="button-icon spinning">
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"
                />
              </svg>
            </n-icon>
          </template>
          Analyze Photos
        </n-button>
      </template>
      <span>Please wait until the current analysis finishes</span>
    </n-tooltip>

    <!-- Enabled state - normal button -->
    <n-button
      v-else
      type="info"
      size="large"
      class="floating-process-button enabled"
      :disabled="disabled"
      @click="handleClick"
    >
      <template #icon>
        <n-icon size="18" class="button-icon">
          <RocketLaunchOutlined />
        </n-icon>
      </template>
      Analyze Photos
      <span v-if="selectedCount > 0" style="margin-left: 6px; font-weight: 500"
        >({{ selectedCount }})</span
      >
    </n-button>
  </div>
</template>

<script setup>
import { MIN_PHOTOS_THRESHOLD, ONBOARDING_SOFT } from "@/stores/photos";
import { InProgress } from "@vicons/carbon";
import { Rocket } from "@vicons/ionicons5";
import { RocketLaunchOutlined } from "@vicons/material";

const props = defineProps({
  shouldShow: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  selectedCount: {
    type: Number,
    default: 0,
  },
  progress: {
    type: Number,
    default: 0,
  },
  buttonState: {
    type: String,
    default: "disabled", // 'disabled' | 'enabled' | 'processing'
  },
});

const emit = defineEmits(["click"]);

const handleClick = () => {
  emit("click");
};
</script>

<style scoped>
.floating-process-container {
  position: fixed;
  bottom: 35px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

.floating-process-button {
  min-width: 160px;
  height: 48px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  font-weight: 600;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-process-button.enabled:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.floating-process-button.enabled:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Disabled state with progress */
.disabled-with-progress {
  position: relative;
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  cursor: not-allowed;
  overflow: hidden;
  min-width: 200px;
  height: 56px;
}

.progress-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--modal-color);
  border-radius: 22px;
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    var(--info-color),
    var(--info-color-pressed)
  );
  border-radius: 22px;
  transition: width 0.3s ease;
}

.button-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
}

.button-icon {
  flex-shrink: 0;
}

.button-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.button-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.main-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.progress-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  line-height: 1;
}

/* Transiciones */
.fab-enter-active,
.fab-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fab-enter-from {
  opacity: 0;
  transform: translateX(-50%) scale(0.8) translateY(20px);
}

.fab-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.8) translateY(20px);
}

/* Responsive */
@media (max-width: 768px) {
  .floating-process-container {
    bottom: 16px;
  }

  .floating-process-button.enabled {
    min-width: 140px;
    height: 44px;
    font-size: 14px;
  }

  .disabled-with-progress {
    min-width: 180px;
    height: 52px;
  }

  .main-text {
    font-size: 13px;
  }

  .progress-text {
    font-size: 11px;
  }
}
</style>
