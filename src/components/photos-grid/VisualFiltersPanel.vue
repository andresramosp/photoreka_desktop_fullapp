<template>
  <div class="visual-filters-panel">
    <!-- Visual Aspects sub-section -->
    <div v-if="showSectionLabels" class="filter-subsection-label">
      Visual aspects
    </div>
    <div class="visual-aspects-row">
      <div
        v-for="aspectGroup in visualAspectsOptions"
        :key="aspectGroup.key"
        class="visual-aspect-item"
      >
        <n-select
          v-model:value="localVisualFilters[aspectGroup.key]"
          v-model:show="dropdownShow[aspectGroup.key]"
          multiple
          :placeholder="`${
            aspectGroup.label.charAt(0).toUpperCase() +
            aspectGroup.label.slice(1)
          }`"
          :options="aspectGroup.children"
          :max-tag-count="1"
          clearable
          :filterable="false"
          :disabled="disabled"
          class="visual-aspect-select"
          size="small"
          @update:value="() => onVisualAspectChange(aspectGroup.key)"
        />
      </div>
    </div>

    <!-- Visual Scores sub-section -->
    <div
      class="score-filters-section"
      :class="{ 'with-section-labels': showSectionLabels }"
    >
      <div class="score-filters-header">
        <div style="display: flex; align-items: center; gap: 6px">
          <div
            v-if="showSectionLabels"
            class="filter-subsection-label"
            style="margin-bottom: 0"
          >
            Visual scores
          </div>
        </div>
        <!-- <n-button
          v-if="hasActiveScoreFilters && showSectionLabels"
          size="tiny"
          quaternary
          @click="clearScores"
          style="font-size: 11px; color: var(--text-secondary)"
          >Clear</n-button
        > -->
      </div>
      <div class="score-filters-grid">
        <div
          v-for="(group, groupKey) in artisticScores"
          :key="groupKey"
          class="score-group-col"
        >
          <div class="score-group-col-header">{{ group.label }}</div>
          <div
            v-for="criterion in group.criteria"
            :key="criterion.value"
            class="score-slider-item"
          >
            <ScoreOperatorSlider
              :label="formatCriterionName(criterion.value)"
              :model-value="localScoreFilters[criterion.value] ?? null"
              :disabled="disabled"
              @update:model-value="(v) => onScoreChange(criterion.value, v)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from "vue";
import { NSelect, NButton, NIcon, NTooltip } from "naive-ui";
import { Info16Regular } from "@vicons/fluent";
import { useSearchStore } from "@/stores/searchStore.js";
import { useUserStore } from "@/stores/userStore";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import ScoreOperatorSlider from "@/components/controls/ScoreOperatorSlider.vue";

const props = defineProps({
  /** Visual aspects filters: { [groupKey]: string[] } */
  visualAspects: { type: Object, default: () => ({}) },
  /** Artistic score filters: { [criterionKey]: { value: number, operator: string } | null } */
  scoreFilters: { type: Object, default: () => ({}) },
  /** Disable all controls (e.g. while searching) */
  disabled: { type: Boolean, default: false },
  /** Show section labels (Visual Aspects, Visual Scores) */
  showSectionLabels: { type: Boolean, default: true },
});

const emit = defineEmits(["update:visualAspects", "update:scoreFilters"]);

const userStore = useUserStore();
const searchStore = useSearchStore();
const visualAspectsOptions = computed(
  () => searchStore.visualAspectsOptionsForProfile,
);

const { artisticScores, formatCriterionName } = useArtisticScores({
  profile: () => userStore.user?.profiles,
});

// Local state for visual aspects (keyed by group)
const localVisualFilters = ref({});
const dropdownShow = reactive({});

// Local state for score filters
const localScoreFilters = ref({});

// Initialize local state from props
function initVisualFilters() {
  const filters = {};
  visualAspectsOptions.value.forEach((group) => {
    filters[group.key] = props.visualAspects[group.key]
      ? [...props.visualAspects[group.key]]
      : [];
  });
  localVisualFilters.value = filters;
}

function initScoreFilters() {
  localScoreFilters.value = { ...props.scoreFilters };
}

initVisualFilters();
initScoreFilters();

// Sync from parent when props change externally
watch(
  () => props.visualAspects,
  (newVal) => {
    // Only sync if different from local
    const flat = Object.values(newVal).flat().sort().join(",");
    const localFlat = Object.values(localVisualFilters.value)
      .flat()
      .sort()
      .join(",");
    if (flat !== localFlat) initVisualFilters();
  },
  { deep: true },
);

watch(
  () => props.scoreFilters,
  (newVal) => {
    const newKeys = Object.keys(newVal).sort().join(",");
    const localKeys = Object.keys(localScoreFilters.value).sort().join(",");
    if (newKeys !== localKeys) {
      initScoreFilters();
    }
  },
  { deep: true },
);

const hasActiveScoreFilters = computed(
  () => Object.keys(localScoreFilters.value).length > 0,
);

function onVisualAspectChange(key) {
  // Close dropdown on mobile-like behavior
  dropdownShow[key] = false;
  emit("update:visualAspects", { ...localVisualFilters.value });
}

function onScoreChange(criterionKey, filterVal) {
  if (!filterVal) {
    const updated = { ...localScoreFilters.value };
    delete updated[criterionKey];
    localScoreFilters.value = updated;
  } else {
    localScoreFilters.value = {
      ...localScoreFilters.value,
      [criterionKey]: filterVal,
    };
  }
  emit("update:scoreFilters", { ...localScoreFilters.value });
}

function clearScores() {
  localScoreFilters.value = {};
  emit("update:scoreFilters", {});
}
</script>

<style scoped>
.visual-filters-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.filter-subsection-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  opacity: 0.6;
  margin-bottom: 2px;
}

.visual-aspects-row {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 6px;
}

.visual-aspect-item {
  min-width: 0;
}

/* Tablet: wrap into two balanced rows (5 + 4) */
@media (min-width: 768px) and (max-width: 1100px) {
  .visual-aspects-row {
    grid-template-columns: repeat(5, 1fr);
  }
}

/* Mobile: restore original flex wrapping */
@media (max-width: 767px) {
  .visual-aspects-row {
    display: flex;
    flex-wrap: wrap;
  }
  .visual-aspect-item {
    flex: 1 1 120px;
    min-width: 100px;
  }
}

.visual-aspect-select {
  width: 100%;
}

/* Score filters */
.score-filters-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-color);
}

.score-filters-section.with-section-labels {
  padding-top: 8px;
}

.score-filters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Desktop: all 8 sliders in a single inline row */
.score-filters-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px 12px;
  align-items: start;
}

.score-group-col {
  display: contents; /* flatten children into the grid */
}

.score-group-col-header {
  display: none; /* hidden on desktop */
}

/* Mobile: 2 columns by group */
@media (max-width: 767px) {
  .score-filters-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;
  }

  .score-group-col {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .score-group-col-header {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    opacity: 0.7;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-color);
  }
}

.score-slider-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
