<template>
  <!-- Keeps the docked bar from covering the end of the step. -->
  <div
    v-if="isMobile"
    class="wizard-actions-spacer"
    :class="{ 'wizard-actions-spacer--tall': $slots.note }"
  />

  <!-- On mobile the bar is docked to the bottom of the screen, so the next
       step is always one tap away. It is teleported because the wizard's
       entrance animations transform its ancestors, which would pin a fixed
       bar to them instead of the screen. -->
  <Teleport to="body" :disabled="!isMobile">
    <div class="wizard-actions" :class="{ 'wizard-actions--docked': isMobile }">
      <n-button
        v-if="showBack"
        size="large"
        class="wizard-back"
        quaternary
        aria-label="Back"
        @click="emit('back')"
      >
        <template #icon>
          <n-icon><ArrowBackOutline /></n-icon>
        </template>
        <template v-if="!isMobile">Back</template>
      </n-button>

      <!-- The primary button, with an optional small note right under it. -->
      <div class="wizard-primary">
        <slot />
        <p v-if="$slots.note" class="wizard-note">
          <slot name="note" />
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ArrowBackOutline } from "@vicons/ionicons5";
import { useIsMobile } from "@/composables/useIsMobile.js";

withDefaults(defineProps<{ showBack?: boolean }>(), { showBack: true });
const emit = defineEmits<{ (e: "back"): void }>();

const { isMobile } = useIsMobile();
</script>

<style scoped>
.wizard-actions {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.wizard-back {
  height: 42px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  padding: 0 20px;
}

.wizard-primary {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-width: 200px;
}

.wizard-primary :slotted(.n-button) {
  height: 42px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
}

.wizard-note {
  margin: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-tertiary);
}

.wizard-note :slotted(strong) {
  font-weight: 600;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Docked (mobile) ── */
.wizard-actions-spacer {
  height: 68px;
}

.wizard-actions-spacer--tall {
  height: 84px;
}

.wizard-actions.wizard-actions--docked {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  gap: 8px;
  margin: 0;
  padding: 8px 16px calc(6px + env(safe-area-inset-bottom));
  background-color: var(--bg-container);
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);
}

.wizard-actions--docked .wizard-back {
  padding: 0 12px;
}

.wizard-actions--docked .wizard-primary {
  flex: 1;
  min-width: 0;
  gap: 3px;
}
</style>
