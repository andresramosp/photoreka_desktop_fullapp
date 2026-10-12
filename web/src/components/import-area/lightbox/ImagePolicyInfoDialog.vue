<template>
  <transition name="backdrop-fade">
    <div
      v-if="show"
      class="image-policy-info-backdrop surface-backdrop"
      @click="emit('update:show', false)"
    />
  </transition>
  <transition name="image-policy-info-pop">
    <div v-if="show" class="image-policy-info-dialog surface-elevated">
      <div class="image-policy-info-header">
        <div class="image-policy-info-title-row">
          <n-icon :size="20" class="image-policy-info-icon">
            <InformationCircleOutline />
          </n-icon>
          <span class="image-policy-info-title">How we handle your photos</span>
        </div>
        <n-button quaternary size="small" @click="emit('update:show', false)">
          <template #icon>
            <n-icon :size="14"><CloseOutline /></n-icon>
          </template>
        </n-button>
      </div>
      <div class="image-policy-info-body">
        <h4 class="image-policy-info-h4">
          <n-icon
            :size="14"
            class="image-policy-h4-icon image-policy-h4-icon--store"
          >
            <LayersOutline />
          </n-icon>
          We never store your originals
        </h4>
        <p>
          Photoreka doesn't keep your original files. We only generate a small
          <strong>thumbnail</strong> to display your library and a
          <strong>lightweight copy</strong> used for analysis and for
          downloading to share on social media.
        </p>

        <h4 class="image-policy-info-h4">
          <n-icon
            :size="14"
            class="image-policy-h4-icon image-policy-h4-icon--private"
          >
            <ShieldCheckmarkOutline />
          </n-icon>
          Private by default
        </h4>
        <p>
          Your photos are never shared with anyone and are never used to train
          AI models.
        </p>

        <h4 class="image-policy-info-h4">
          <n-icon
            :size="14"
            class="image-policy-h4-icon image-policy-h4-icon--delete"
          >
            <TrashOutline />
          </n-icon>
          Deleted when you delete them
        </h4>
        <p>
          Your images are removed as soon as you delete them or delete your
          account.
        </p>

        <p class="image-policy-info-closing">
          Photoreka is an intelligence layer over your existing archive — it
          doesn't replace it. We only keep what's needed to give you easy access
          across your devices and on-demand analysis.
        </p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import {
  CloseOutline,
  InformationCircleOutline,
  LayersOutline,
  ShieldCheckmarkOutline,
  TrashOutline,
} from "@vicons/ionicons5";

defineProps({
  show: { type: Boolean, default: false },
});

const emit = defineEmits(["update:show"]);
</script>

<style scoped>
.image-policy-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.image-policy-info-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 201;
  border-radius: var(--radius-xl);
  width: 520px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 0.2s ease;
}
.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

.image-policy-info-pop-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.image-policy-info-pop-leave-active {
  transition: all 0.15s ease;
}
.image-policy-info-pop-enter-from {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.95);
}
.image-policy-info-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.97);
}

.image-policy-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.image-policy-info-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.image-policy-info-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.image-policy-info-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.image-policy-info-body {
  padding: var(--spacing-lg) var(--spacing-xl);
  overflow-y: auto;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.image-policy-info-body p {
  margin: 0 0 var(--spacing-md) 0;
}

.image-policy-info-h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: var(--spacing-lg) 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.image-policy-info-h4:first-child {
  margin-top: 0;
}

.image-policy-h4-icon {
  flex-shrink: 0;
}
.image-policy-h4-icon--store {
  color: var(--accent-color);
}
.image-policy-h4-icon--private {
  color: var(--success-color, #52c41a);
}
.image-policy-h4-icon--delete {
  color: var(--error-color);
}

.image-policy-info-body strong {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.image-policy-info-closing {
  font-style: italic;
  opacity: 0.75;
  margin-top: var(--spacing-md);
}
</style>
