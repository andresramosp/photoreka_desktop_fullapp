<script setup lang="ts">
import { NIcon } from "naive-ui";
import { InformationCircleOutline } from "@vicons/ionicons5";
import { PICKS_AWARD_DISCLAIMER } from "@/config/picks";
import PicksTipCard from "./PicksTipCard.vue";
import PicksTooltip from "./PicksTooltip.vue";

withDefaults(defineProps<{ size?: number }>(), { size: 16 });
</script>

<template>
  <!-- Own root: attrs passed to PicksTooltip would land on the tooltip body. -->
  <span class="pk-disclaimer">
    <PicksTooltip>
      <template #trigger>
        <span class="pk-disclaimer-icon" tabindex="0" :aria-label="PICKS_AWARD_DISCLAIMER.title">
          <n-icon :size="size"><InformationCircleOutline /></n-icon>
        </span>
      </template>
      <PicksTipCard :title="PICKS_AWARD_DISCLAIMER.title" :text="PICKS_AWARD_DISCLAIMER.text" />
    </PicksTooltip>
  </span>
</template>

<style scoped>
.pk-disclaimer {
  display: inline-flex;
  color: var(--pk-text-3);
}

.pk-disclaimer-icon {
  display: inline-flex;
  cursor: help;
  outline: none;
}

.pk-disclaimer:hover,
.pk-disclaimer:focus-within {
  color: var(--pk-text);
}
</style>
