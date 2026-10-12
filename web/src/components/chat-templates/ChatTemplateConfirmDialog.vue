<template>
  <n-modal
    :show="show"
    :style="{ width: '440px', maxWidth: '95vw' }"
    @update:show="(value) => !value && emit('cancel')"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="tpl-confirm-card"
    >
      <template #header>
        <div class="tpl-confirm-header">
          <n-icon v-if="icon" size="20" color="var(--primary-color)">
            <component :is="icon" />
          </n-icon>
          <span>{{ title }}</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('cancel')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="tpl-confirm-body">
        <p class="tpl-confirm-description">{{ message }}</p>
        <n-checkbox v-if="dismissable" v-model:checked="dontShowAgain">
          Don't show this again
        </n-checkbox>
      </div>

      <template #footer>
        <div class="tpl-confirm-footer">
          <n-button tertiary @click="emit('cancel')">{{ cancelLabel }}</n-button>
          <n-button
            :type="confirmType"
            :loading="loading"
            @click="emit('confirm', dontShowAgain)"
          >
            {{ confirmLabel }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { ref, watch } from "vue";
import { NButton, NCard, NCheckbox, NIcon, NModal } from "naive-ui";
import { CloseOutline } from "@vicons/ionicons5";

defineOptions({ name: "ChatTemplateConfirmDialog" });

const props = defineProps({
  show: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: "" },
  message: { type: String, default: "" },
  confirmLabel: { type: String, default: "Confirm" },
  cancelLabel: { type: String, default: "Cancel" },
  confirmType: { type: String, default: "primary" },
  loading: { type: Boolean, default: false },
  /** Adds the "Don't show this again" checkbox; its value rides along on `confirm`. */
  dismissable: { type: Boolean, default: false },
});

const emit = defineEmits(["cancel", "confirm"]);

const dontShowAgain = ref(false);

// Fresh every time the dialog reopens — a stale checked box from a previous
// confirmation shouldn't silently carry over to this one.
watch(
  () => props.show,
  (open) => {
    if (open) dontShowAgain.value = false;
  },
);
</script>

<style scoped>
.tpl-confirm-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.tpl-confirm-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.tpl-confirm-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.tpl-confirm-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.tpl-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
