<script setup lang="ts">
import { NTooltip, type PopoverPlacement } from "naive-ui";

withDefaults(
  defineProps<{
    placement?: PopoverPlacement;
    delay?: number;
    /** Stretches the trigger wrapper to the full row width. */
    block?: boolean;
  }>(),
  { placement: "bottom", delay: 200, block: false },
);

// The tooltip is teleported to <body>, outside .picks-root, so the --pk-*
// tokens don't reach it: the Picks palette is spelled out here.
const THEME = {
  color: "rgba(22, 22, 30, 0.97)",
  textColor: "rgba(255, 255, 255, 0.94)",
  borderRadius: "12px",
  padding: "10px 12px",
  boxShadow: "0 18px 48px -12px rgba(0, 0, 0, 0.85)",
};
const BODY_STYLE = {
  maxWidth: "280px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  font: '400 12px/1.5 "Plus Jakarta Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
};
</script>

<template>
  <n-tooltip
    :placement="placement"
    :delay="delay"
    :show-arrow="false"
    :theme-overrides="THEME"
    :style="BODY_STYLE"
  >
    <template #trigger>
      <!-- Disabled buttons fire no mouse events, so the wrapper is the trigger. -->
      <span class="pk-tip-anchor" :class="{ 'is-block': block }">
        <slot name="trigger" />
      </span>
    </template>
    <slot />
  </n-tooltip>
</template>

<style scoped>
.pk-tip-anchor {
  display: inline-flex;
  flex-shrink: 0;
}

.pk-tip-anchor.is-block {
  display: flex;
  width: 100%;
}
</style>
