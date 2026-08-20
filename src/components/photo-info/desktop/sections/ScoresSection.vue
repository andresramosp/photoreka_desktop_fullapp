<template>
  <div v-if="hasScores" class="scores-section">
    <!-- Genre preset selector -->
    <div class="scores-toolbar">
      <span class="toolbar-label">Genre preset</span>
      <n-select
        class="genre-select"
        size="small"
        :value="selectedGenre"
        :options="genrePresetOptions"
        :render-label="renderGenreOptionLabel"
        :fallback-option="false"
        @update:value="(value) => emit('apply-genre-preset', value)"
      />
    </div>

    <!-- Weights Configuration -->
    <div class="weights-configuration-container" v-if="showCustomWeights">
      <div class="weights-header">
        <h6 class="weights-title">Score Weights Configuration</h6>
      </div>
      <CustomArtisticWeights
        :modelValue="artisticScoreWeights"
        @update:modelValue="emit('update:artistic-score-weights', $event)"
        :format-criterion-name="formatCriterionName"
      />
    </div>

    <div class="artistic-scores-columns">
      <div
        v-for="column in scoreColumns"
        :key="column.group"
        class="scores-column"
      >
        <h6 class="scores-column-title">{{ column.title }}</h6>
        <div class="artistic-scores-grid">
          <div
            v-for="scoreData in column.scores"
            :key="scoreData.criterion"
            class="score-item"
            :class="{
              'bonus-item': column.group === 'bonus',
              'no-weight': !artisticScoreWeights[scoreData.criterion],
            }"
            :style="{
              '--weight-scale': artisticScoreWeights[scoreData.criterion],
              '--weight-opacity': artisticScoreWeights[scoreData.criterion],
            }"
          >
            <span
              class="score-label"
              :title="
                'Score: ' +
                scoreData.score +
                '/' +
                scoreScale.max +
                ' | Weight: ' +
                artisticScoreWeights[scoreData.criterion].toFixed(1) +
                ' | Impact: ' +
                (
                  scoreData.score * artisticScoreWeights[scoreData.criterion]
                ).toFixed(1)
              "
            >
              <n-icon v-if="scoreData.icon" class="score-label-icon" size="16">
                <component :is="scoreData.icon" />
              </n-icon>
              <span class="score-label-text">{{ scoreData.label }}</span>
            </span>
            <div class="score-bar-container">
              <div class="score-bar">
                <div
                  class="score-fill"
                  :style="{
                    width: (scoreData.score / 9) * 100 + '%',
                    opacity: artisticScoreWeights[scoreData.criterion]
                      ? 0.8
                      : 0.45,
                    background: artisticScoreWeights[scoreData.criterion]
                      ? getScoreBgColor(scoreData.score)
                      : 'var(--text-tertiary)',
                  }"
                ></div>
              </div>
              <span class="score-value">
                <span class="score-number">{{ scoreData.score }}</span>
                <span class="max-score">/{{ scoreScale.max }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="scores-empty">
    <p class="empty-text">This photo has no artistic scores yet.</p>
  </div>
</template>

<script setup>
import { computed, h } from "vue";
import { NIcon, NSelect } from "naive-ui";
import CustomArtisticWeights from "../../../CustomArtisticWeights.vue";

defineOptions({ name: "PhotoInfoScoresSection" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  scoreScale: { type: Object, default: () => ({ max: 9 }) },
  selectedGenre: { type: String, default: "general" },
  showCustomWeights: { type: Boolean, default: false },
  artisticScoreWeights: { type: Object, default: () => ({}) },
  orderedArtisticScores: { type: Array, default: () => [] },
  availableGenrePresets: { type: Array, default: () => [] },
  formatCriterionName: { type: Function, default: (c) => c },
  getScoreBgColor: { type: Function, default: () => "#ccc" },
});

const emit = defineEmits([
  "apply-genre-preset",
  "update:artistic-score-weights",
]);

const hasScores = computed(
  () =>
    Boolean(props.selectedPhoto?.descriptions?.artistic_scores) &&
    props.orderedArtisticScores.length > 0,
);

const scoreColumns = computed(() => [
  {
    group: "fundamentals",
    title: "Fundamentals",
    scores: props.orderedArtisticScores.filter((s) => s.group !== "bonus"),
  },
  {
    group: "bonus",
    title: "Bonus",
    scores: props.orderedArtisticScores.filter((s) => s.group === "bonus"),
  },
]);

const genrePresetOptions = computed(() =>
  props.availableGenrePresets.map((preset) => ({
    label: preset.label,
    value: preset.key,
    icon: preset.icon,
  })),
);

const renderGenreOptionLabel = (option) =>
  h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: "8px" } },
    [
      option.icon ? h(NIcon, { size: 16 }, { default: () => h(option.icon) }) : null,
      h("span", option.label),
    ],
  );
</script>

<style scoped>
.scores-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.scores-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.toolbar-label {
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.genre-select {
  width: 170px;
}

/* Weights configuration */
.weights-configuration-container {
  padding: var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.weights-header {
  margin-bottom: var(--spacing-md);
  text-align: center;
}

.weights-title {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

/* Artistic scores grid */
.artistic-scores-columns {
  /* Ancho reservado para la etiqueta (icono + texto); el resto lo ocupa la barra. */
  --score-label-width: 104px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
}

.scores-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.scores-column-title {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.artistic-scores-grid {
  display: grid;
  grid-template-columns: 1fr;
  grid-auto-rows: minmax(32px, auto);
  align-content: start;
  gap: 10px;
}

.score-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 2px 4px;
  transition: all 0.3s ease;
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.score-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: calc(
    var(--weight-scale, 0) *
      (var(--score-label-width, 96px) + var(--spacing-sm))
  );
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--primary-color) 0%,
    rgba(59, 130, 246, 0.4) 80%,
    rgba(59, 130, 246, 0.1) 100%
  );
  border-radius: var(--radius-sm);
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.25;
  z-index: 0;
}

.score-item.bonus-item::before {
  background: linear-gradient(
    90deg,
    #f59e0b 0%,
    rgba(245, 158, 11, 0.4) 80%,
    rgba(245, 158, 11, 0.1) 100%
  );
}

.score-item:hover::before {
  opacity: 0.4;
}

.score-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  width: var(--score-label-width, 96px);
  flex-shrink: 0;
  padding: var(--spacing-xs) var(--spacing-xs);
  position: relative;
  z-index: 1;
  border-radius: var(--radius-sm);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.score-label-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.score-item.bonus-item .score-label-icon {
  color: #f59e0b;
}

/* Criteria with no weight applied are visually de-emphasized */
.score-item.no-weight .score-label,
.score-item.no-weight .score-label-icon,
.score-item.no-weight .score-number {
  color: var(--text-secondary);
}

.score-label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-bar-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
}

.score-bar {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  min-width: 0;
}

.score-fill {
  height: 100%;
  border-radius: 4px;
  transition:
    width 0.3s ease,
    opacity 0.3s ease;
  position: relative;
  z-index: 1;
}

.score-value {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  min-width: 38px;
  text-align: right;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1px;
}

.score-number {
  color: var(--text-primary);
  font-weight: var(--font-weight-bold);
}

.max-score {
  color: var(--text-secondary);
}

.scores-empty {
  padding: var(--spacing-lg) 0;
}

.scores-empty .empty-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}
</style>
