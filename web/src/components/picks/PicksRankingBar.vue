<script setup lang="ts">
import { computed, ref } from "vue";
import { NIcon } from "naive-ui";
import {
  PICKS_CRITERIA,
  PICKS_JURIES,
  type PicksCriterionKey,
} from "@/config/picks";
import { formatCount } from "@/utils/picks/format";
import PicksAwardPicker from "./PicksAwardPicker.vue";
import PicksJuryTip from "./PicksJuryTip.vue";
import PicksTipCard from "./PicksTipCard.vue";
import PicksTooltip from "./PicksTooltip.vue";
import type { PicksRankingMode } from "@/utils/picks/types";

defineProps<{ juryCounts: Record<string, number> }>();
const mode = defineModel<PicksRankingMode>({ required: true });

const tab = ref<PicksRankingMode["kind"]>(mode.value.kind);
let lastJury =
  mode.value.kind === "jury" ? mode.value.juryId : PICKS_JURIES[0].id;
let lastCriterion: PicksCriterionKey =
  mode.value.kind === "criterion"
    ? mode.value.criterion
    : PICKS_CRITERIA[0].key;

function selectJury(juryId: string) {
  lastJury = juryId;
  mode.value = { kind: "jury", juryId };
}

function selectCriterion(criterion: PicksCriterionKey) {
  lastCriterion = criterion;
  mode.value = { kind: "criterion", criterion };
}

function switchTab(next: PicksRankingMode["kind"]) {
  if (tab.value === next) return;
  tab.value = next;
  if (next === "jury") selectJury(lastJury);
  else selectCriterion(lastCriterion);
}

const activeJuryId = computed(() =>
  mode.value.kind === "jury" ? mode.value.juryId : null,
);

const isJuryActive = (id: string) =>
  mode.value.kind === "jury" && mode.value.juryId === id;
const isCriterionActive = (key: PicksCriterionKey) =>
  mode.value.kind === "criterion" && mode.value.criterion === key;
</script>

<template>
  <div class="pk-rankbar">
    <div class="pk-tabs" role="tablist">
      <button
        role="tab"
        class="pk-tab"
        :class="{ 'is-active': tab === 'jury' }"
        @click="switchTab('jury')"
      >
        Juries
      </button>
      <button
        role="tab"
        class="pk-tab"
        :class="{ 'is-active': tab === 'criterion' }"
        @click="switchTab('criterion')"
      >
        Criteria
      </button>
      <span class="pk-tab-glider" :class="`is-${tab}`" />
    </div>

    <Transition name="pk-pills" mode="out-in">
      <div v-if="tab === 'jury'" key="jury" class="pk-pills">
        <template v-for="jury in PICKS_JURIES" :key="jury.id">
          <PicksAwardPicker
            v-if="jury.id === 'award'"
            :jury-counts="juryCounts"
            :active-jury-id="activeJuryId"
            @select="selectJury"
          />
          <PicksTooltip v-else>
            <template #trigger>
              <button
                class="pk-pill"
                :class="{ 'is-active': isJuryActive(jury.id) }"
                :disabled="!juryCounts[jury.id]"
                @click="selectJury(jury.id)"
              >
                <n-icon :size="15"><component :is="jury.icon" /></n-icon>
                {{ jury.label }}
                <span v-if="jury.genres" class="pk-pill-count">
                  {{ formatCount(juryCounts[jury.id] ?? 0) }}
                </span>
              </button>
            </template>
            <PicksJuryTip
              :jury="jury"
              :note="
                juryCounts[jury.id]
                  ? undefined
                  : `No ${jury.label.toLowerCase()} photos in this set.`
              "
            />
          </PicksTooltip>
        </template>
      </div>
      <div v-else key="criterion" class="pk-pills">
        <PicksTooltip v-for="criterion in PICKS_CRITERIA" :key="criterion.key">
          <template #trigger>
            <button
              class="pk-pill"
              :class="{ 'is-active': isCriterionActive(criterion.key) }"
              @click="selectCriterion(criterion.key)"
            >
              {{ criterion.label }}
            </button>
          </template>
          <PicksTipCard
            :title="criterion.label"
            :text="`${criterion.description} Ranks every photo by this score alone.`"
          />
        </PicksTooltip>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pk-rankbar {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.pk-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--pk-line);
  flex-shrink: 0;
}

.pk-tab {
  position: relative;
  z-index: 1;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  color: var(--pk-text-3);
  font: 600 13px var(--pk-sans);
  cursor: pointer;
  transition: color 0.3s var(--pk-ease);
}

.pk-tab.is-active {
  color: #1a1206;
}

.pk-tab-glider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  border-radius: 999px;
  background: var(--pk-gold-gradient);
  box-shadow: 0 6px 18px -6px rgba(244, 183, 64, 0.6);
  transition: transform 0.45s var(--pk-ease);
}

.pk-tab-glider.is-criterion {
  transform: translateX(100%);
}

.pk-pills {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 2px;
  min-width: 0;
  mask-image: linear-gradient(90deg, #000 92%, transparent);
}

.pk-pills::-webkit-scrollbar {
  display: none;
}

.pk-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--pk-line);
  background: rgba(255, 255, 255, 0.03);
  color: var(--pk-text-2);
  font: 500 13px var(--pk-sans);
  cursor: pointer;
  transition:
    color 0.25s var(--pk-ease),
    background 0.25s var(--pk-ease),
    border-color 0.25s var(--pk-ease),
    transform 0.25s var(--pk-ease);
}

.pk-pill:not(:disabled):hover {
  color: var(--pk-text);
  border-color: var(--pk-line-strong);
  transform: translateY(-1px);
}

.pk-pill:disabled {
  opacity: 0.35;
  cursor: default;
}

.pk-pill-count {
  margin-left: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--pk-text-3);
  background: rgba(255, 255, 255, 0.06);
  transition:
    color 0.25s var(--pk-ease),
    background 0.25s var(--pk-ease);
}

.pk-pill.is-active .pk-pill-count {
  color: #1a1206;
  background: var(--pk-gold-gradient);
}

.pk-pill.is-active {
  color: var(--pk-gold-2);
  border-color: rgba(244, 183, 64, 0.55);
  background: rgba(244, 183, 64, 0.1);
  box-shadow:
    inset 0 0 0 1px rgba(244, 183, 64, 0.15),
    0 8px 24px -10px rgba(244, 183, 64, 0.5);
}

.pk-pills-enter-active,
.pk-pills-leave-active {
  transition:
    opacity 0.25s var(--pk-ease),
    transform 0.25s var(--pk-ease);
}
.pk-pills-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.pk-pills-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

@media (max-width: 640px) {
  .pk-rankbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .pk-tabs {
    align-self: flex-start;
  }
}
</style>
