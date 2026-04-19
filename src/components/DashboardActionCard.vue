<template>
  <div
    class="dashboard-action-card"
    :class="[additionalClasses, { disabled: disabled }]"
    @click="handleClick"
  >
    <!-- Patrón decorativo de fondo -->
    <!-- <div class="card-background-pattern"></div> -->

    <!-- Contenido principal -->
    <div class="card-content">
      <div class="card-icon-small">
        <n-icon :size="iconSize" :color="iconColor">
          <component :is="icon" />
        </n-icon>
      </div>
      <h3 class="card-title">{{ title }}</h3>
      <p class="card-description">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: "DashboardActionCard",
});

interface Props {
  icon: any;
  title: string;
  description?: string;
  disabled?: boolean;
  additionalClasses?: string;
  iconSize?: number;
  iconColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  description: "",
  disabled: false,
  additionalClasses: "",
  iconSize: 45,
  iconColor: "var(--text-primary)",
});

const emit = defineEmits<{
  (e: "click"): void;
}>();

const handleClick = () => {
  if (!props.disabled) {
    emit("click");
  }
};
</script>

<style scoped>
.dashboard-action-card {
  position: relative;
  background: linear-gradient(
    135deg,
    var(--bg-card) 0%,
    var(--primary-02) 100%
  );
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: border-color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  min-height: 190px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.dashboard-action-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, transparent 0%, var(--primary-05) 100%);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.dashboard-action-card:hover::before {
  opacity: 1;
}

.dashboard-action-card:hover {
  border-color: var(--primary-50);
}

.dashboard-action-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.dashboard-action-card.disabled:hover {
  border-color: var(--border-color);
}

/* Patrón decorativo de fondo - ahora está en global.scss */

/* Contenido principal */
.card-content {
  position: relative;
  z-index: 1;
  text-align: center;
  width: 100%;
}

.card-icon-small {
  margin-bottom: var(--spacing-md);
  color: var(--text-primary);
  display: inline-flex;
  padding: 12px;
  background: var(--primary-08);
  border-radius: 12px;
}

.card-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.card-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-normal);
  max-width: 90%;
  margin: 0 auto;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .dashboard-action-card {
    padding: 16px;
    min-height: 190px;
  }
}

@media (max-width: 480px) {
  .dashboard-action-card {
    padding: 16px;
    min-height: 190px;
  }
}
</style>
