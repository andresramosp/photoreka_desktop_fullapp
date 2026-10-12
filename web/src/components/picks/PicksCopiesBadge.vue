<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { CopyOutline } from "@vicons/ionicons5";

const props = defineProps<{ copies: string[] | undefined; large?: boolean }>();

// The judged photo plus its exact copies.
const total = computed(() => (props.copies?.length ?? 0) + 1);
</script>

<template>
  <span
    v-if="total > 1"
    class="pk-copies"
    :class="{ 'is-large': large }"
    :title="`${total} identical copies in your upload, judged once`"
  >
    <n-icon :size="large ? 14 : 12"><CopyOutline /></n-icon>
    ×{{ total }}
  </span>
</template>

<style scoped>
.pk-copies {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font: 700 11px var(--pk-sans);
  font-variant-numeric: tabular-nums;
  color: var(--pk-text);
  background: rgba(8, 8, 12, 0.66);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.pk-copies.is-large {
  top: 18px;
  right: 18px;
  padding: 5px 11px;
  font-size: 13px;
}
</style>
