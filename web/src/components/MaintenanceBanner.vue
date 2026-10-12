<template>
  <div class="maintenance-banner" v-if="showBanner">
    <div class="banner-content">
      <div class="banner-icon">
        <n-icon size="20" color="var(--warning-color)">
          <WarningOutline />
        </n-icon>
      </div>
      <div class="banner-text">
        <span class="banner-title">Mantenimiento programado</span>
        <span class="banner-description">
          Algunas funcionalidades pueden estar limitadas temporalmente
        </span>
      </div>
      <n-button text size="small" @click="closeBanner" class="banner-close">
        <template #icon>
          <n-icon><CloseOutline /></n-icon>
        </template>
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { NIcon, NButton } from "naive-ui";
import { WarningOutline, CloseOutline } from "@vicons/ionicons5";
import { useMaintenanceMode } from "@/composables/useMaintenanceMode";

const { isMaintenanceMode } = useMaintenanceMode();
const isManuallyDismissed = ref(false);

const showBanner = computed(() => {
  return isMaintenanceMode.value && !isManuallyDismissed.value;
});

const closeBanner = () => {
  isManuallyDismissed.value = true;
};
</script>

<style scoped>
.maintenance-banner {
  background: linear-gradient(
    90deg,
    rgba(245, 158, 11, 0.1) 0%,
    rgba(245, 158, 11, 0.05) 100%
  );
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  padding: var(--spacing-md) 0;
  position: sticky;
  top: 0;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.banner-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-2xl);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.banner-icon {
  flex-shrink: 0;
}

.banner-text {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.banner-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--warning-color);
}

.banner-description {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.banner-close {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.banner-close:hover {
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .banner-content {
    padding: 0 var(--spacing-lg);
  }

  .banner-text {
    gap: 0;
  }

  .banner-description {
    display: none;
  }
}
</style>
