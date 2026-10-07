<script setup lang="ts">
import { NIcon } from "naive-ui";
import { InformationCircleOutline } from "@vicons/ionicons5";
import { PICKS_AWARD_DISCLAIMER } from "@/config/picks";
import PicksTipCard from "./PicksTipCard.vue";
import PicksTooltip from "./PicksTooltip.vue";

withDefaults(defineProps<{ size?: number }>(), { size: 16 });
</script>

<template>
  <PicksTooltip>
    <template #trigger>
      <span class="pk-disclaimer" tabindex="0" :aria-label="PICKS_AWARD_DISCLAIMER.title">
        <n-icon :size="size"><InformationCircleOutline /></n-icon>
      </span>
    </template>
    <PicksTipCard :title="PICKS_AWARD_DISCLAIMER.title" :text="PICKS_AWARD_DISCLAIMER.text" />
  </PicksTooltip>
</template>

<style scoped>
.pk-disclaimer {
  display: inline-flex;
  color: var(--pk-text-3);
  cursor: help;
  transition: color 0.2s var(--pk-ease);
}

.pk-disclaimer:hover,
.pk-disclaimer:focus-visible {
  color: var(--pk-text);
  outline: none;
}
</style>
