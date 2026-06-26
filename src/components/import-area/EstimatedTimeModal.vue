<template>
  <transition name="backdrop-fade">
    <div v-if="show" class="ete-backdrop" @click="emit('update:show', false)" />
  </transition>
  <transition name="ete-pop">
    <div v-if="show" class="ete-dialog">
      <div class="ete-header">
        <div class="ete-title-row">
          <n-icon :size="20" class="ete-icon">
            <TimeOutline />
          </n-icon>
          <span class="ete-title">Estimated Processing Time</span>
        </div>
        <n-button quaternary size="small" @click="emit('update:show', false)">
          <template #icon>
            <n-icon :size="14"><CloseOutline /></n-icon>
          </template>
        </n-button>
      </div>
      <div class="ete-body">
        <p>
          Processing time depends on the number of photos and current server
          load. These are estimates — actual times may vary during periods of
          high demand.
        </p>
        <div class="ete-table">
          <div class="ete-table-header">
            <span>Batch size</span>
            <span>Estimated time</span>
          </div>
          <div class="ete-table-row">
            <span>Less than 30 photos</span>
            <span class="ete-value">5 – 20 minutes</span>
          </div>
          <div class="ete-table-row">
            <span>Up to 100 photos</span>
            <span class="ete-value">1 – 3 hours</span>
          </div>
          <div class="ete-table-row">
            <span>Up to 500 photos</span>
            <span class="ete-value">2 – 6 hours</span>
          </div>
          <div class="ete-table-row">
            <span>Up to 1,000 photos</span>
            <span class="ete-value">3 – 8 hours</span>
          </div>
          <div class="ete-table-row">
            <span>Up to 5,000 photos</span>
            <span class="ete-value">4 – 12 hours</span>
          </div>
        </div>
        <div class="ete-info-banner">
          <n-icon :size="16" class="ete-info-icon"><MailOutline /></n-icon>
          <span
            >You'll receive an email when the analysis is complete — you can
            safely close this app in the meantime.</span
          >
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { CloseOutline, TimeOutline, MailOutline } from "@vicons/ionicons5";

defineProps({ show: Boolean });
const emit = defineEmits(["update:show"]);
</script>

<style scoped>
.ete-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.ete-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 201;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  width: 400px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.backdrop-fade-enter-active {
  transition: opacity 0.18s ease;
}
.backdrop-fade-leave-active {
  transition: opacity 0.15s ease;
}
.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

.ete-pop-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ete-pop-leave-active {
  transition: all 0.15s ease;
}
.ete-pop-enter-from {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.95);
}
.ete-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.97);
}

.ete-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ete-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.ete-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.ete-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.ete-body {
  padding: var(--spacing-lg) var(--spacing-xl);
  overflow-y: auto;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.ete-body p {
  margin: 0 0 var(--spacing-md) 0;
}

.ete-table {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: var(--font-size-sm);
}

.ete-table-header {
  display: flex;
  justify-content: space-between;
  padding: 8px var(--spacing-md);
  background-color: var(--bg-elevated);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ete-table-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px var(--spacing-md);
  border-top: 1px solid var(--border-color);
  color: var(--text-primary);
}

.ete-value {
  color: var(--info-color);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.ete-info-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: color-mix(in srgb, var(--info-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 35%, transparent);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--info-color);
  line-height: var(--line-height-relaxed);
}

.ete-info-icon {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>
