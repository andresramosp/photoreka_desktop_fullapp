<template>
  <transition name="tpl-hint">
    <div v-if="show" class="tpl-hint" role="status">
      <div class="tpl-hint-header">
        <n-icon :size="16" class="tpl-hint-icon"><BulbOutline /></n-icon>
        <span class="tpl-hint-title">{{ title }}</span>
        <n-button
          quaternary
          size="tiny"
          class="tpl-hint-close"
          title="Got it"
          @click="emit('dismiss')"
        >
          <template #icon>
            <n-icon :size="13"><CloseOutline /></n-icon>
          </template>
        </n-button>
      </div>
      <p class="tpl-hint-body">{{ body }}</p>
      <n-button size="tiny" type="primary" secondary block @click="emit('dismiss')">
        Got it
      </n-button>
    </div>
  </transition>
</template>

<script setup>
import { NButton, NIcon } from "naive-ui";
import { BulbOutline, CloseOutline } from "@vicons/ionicons5";

defineOptions({ name: "ChatTemplateHint" });

defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: "" },
  body: { type: String, default: "" },
});

const emit = defineEmits(["dismiss"]);
</script>

<style scoped>
/* Bottom-right on purpose: it sits against the inner edge of the transcript,
   next to the selection space it talks about, where a photo group's last column
   is the emptiest part of a bubble. The composer owns the bottom strip, and
   `--tpl-hint-offset-right` (set by the host) keeps it clear of the pinned
   selection panel rather than on top of it. */
.tpl-hint {
  position: absolute;
  right: calc(var(--tpl-hint-offset-right, 0px) + var(--spacing-lg));
  bottom: 112px;
  z-index: 120;
  width: 320px;
  max-width: calc(100% - 2 * var(--spacing-lg));
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, var(--border-color));
  background: var(--bg-card, var(--bg-surface));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}

.tpl-hint-header {
  display: flex;
  align-items: center;
  gap: 7px;
}

.tpl-hint-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.tpl-hint-title {
  flex: 1;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.tpl-hint-close {
  flex-shrink: 0;
  color: var(--text-tertiary) !important;
}

.tpl-hint-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.tpl-hint-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.tpl-hint-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.tpl-hint-enter-from,
.tpl-hint-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
