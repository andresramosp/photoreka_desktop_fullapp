<script setup lang="ts">
import { computed } from "vue";
import { getJuryFocus, getJuryScope, type PicksJury } from "@/config/picks";
import PicksTipCard from "./PicksTipCard.vue";

const props = defineProps<{
  jury: PicksJury;
  /** Overrides the jury label, e.g. for the generic award jury. */
  title?: string;
  note?: string;
}>();

const focus = computed(() => getJuryFocus(props.jury).join(" · "));
const scope = computed(() => getJuryScope(props.jury));
</script>

<template>
  <PicksTipCard :title="title ?? jury.label" :text="jury.tagline" :note="note">
    <dl class="pk-tip-facts">
      <div>
        <dt>Values most</dt>
        <dd>{{ focus }}</dd>
      </div>
      <div>
        <dt>Judges</dt>
        <dd>{{ scope }}</dd>
      </div>
    </dl>
  </PicksTipCard>
</template>

<style scoped>
.pk-tip-facts {
  margin: 6px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pk-tip-facts div {
  display: flex;
  gap: 8px;
}

.pk-tip-facts dt {
  flex-shrink: 0;
  width: 76px;
  color: rgba(255, 255, 255, 0.42);
}

.pk-tip-facts dd {
  margin: 0;
}
</style>
