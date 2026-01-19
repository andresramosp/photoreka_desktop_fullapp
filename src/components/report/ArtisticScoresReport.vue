<template>
  <div class="report-section">
    <div class="report-section-header">
      <h2 class="section-title">
        <n-icon class="section-icon">
          <StarIcon />
        </n-icon>
        Artistic Scores Analysis
      </h2>
      <p class="section-description">
        Average scores and consistency analysis of artistic criteria across your
        portfolio
      </p>
    </div>

    <!-- Fundamentals Section -->
    <div v-if="fundamentalsStats.length > 0" class="criteria-group">
      <div class="group-header">
        <div class="group-title-wrapper">
          <h3
            class="group-title"
            :style="{ color: artisticScores.fundamentals.color }"
          >
            {{ artisticScores.fundamentals.label }}
          </h3>
          <span class="group-subtitle">Core evaluation criteria</span>
        </div>
      </div>
      <div class="artistic-scores-grid">
        <div
          v-for="{ criterion, stats } in fundamentalsStats"
          :key="criterion"
          class="score-card"
        >
          <div class="score-header">
            <div class="score-title-row">
              <n-icon
                :component="getCriterionIcon(criterion)"
                :color="artisticScores.fundamentals.color"
                size="20"
                class="score-icon"
              />
              <h3
                class="score-title"
                :style="{ color: artisticScores.fundamentals.color }"
              >
                {{ formatCriterionName(criterion) }}
              </h3>
            </div>
            <span class="score-count"
              >{{ stats.count }}/{{ stats.total }} photos</span
            >
          </div>

          <!-- Average Score -->
          <div class="score-metric">
            <div class="metric-label">Average Score</div>
            <div class="metric-content">
              <div class="score-value-large">{{ stats.mean }}</div>
              <div
                class="score-rating"
                :style="{ color: getScoreBgColor(stats.mean) }"
              >
                {{ stats.rating }}
              </div>
            </div>
            <div class="score-bar-container">
              <div
                class="score-bar-fill"
                :style="{
                  width: `${(stats.mean / 10) * 100}%`,
                  backgroundColor: getScoreBgColor(stats.mean),
                }"
              ></div>
            </div>
          </div>

          <!-- Consistency -->
          <div class="consistency-metric">
            <div class="metric-label">Consistency</div>

            <div class="consistency-content">
              <!-- Visual Bar -->
              <div v-if="showConsistencyBar" class="consistency-bar-container">
                <div
                  class="consistency-bar-fill"
                  :style="{
                    width: getConsistencyWidth(stats.stdDev) + '%',
                    backgroundColor: stats.consistency.color,
                  }"
                ></div>
              </div>

              <!-- Text Information -->
              <div
                class="consistency-badge"
                :style="{
                  backgroundColor: stats.consistency.color + '20',
                  color: stats.consistency.color,
                }"
              >
                {{ stats.consistency.label }}
              </div>
              <div class="consistency-description">
                {{ stats.consistency.description }}
              </div>
              <div class="consistency-detail">σ = {{ stats.stdDev }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bonus Section -->
    <div v-if="bonusStats.length > 0" class="criteria-group">
      <div class="group-header">
        <div class="group-title-wrapper">
          <h3
            class="group-title"
            :style="{ color: artisticScores.bonus.color }"
          >
            {{ artisticScores.bonus.label }}
          </h3>
          <span class="group-subtitle">Additional evaluation aspects</span>
        </div>
      </div>
      <div class="artistic-scores-grid">
        <div
          v-for="{ criterion, stats } in bonusStats"
          :key="criterion"
          class="score-card"
        >
          <div class="score-header">
            <div class="score-title-row">
              <n-icon
                :component="getCriterionIcon(criterion)"
                :color="artisticScores.bonus.color"
                size="20"
                class="score-icon"
              />
              <h3
                class="score-title"
                :style="{ color: artisticScores.bonus.color }"
              >
                {{ formatCriterionName(criterion) }}
              </h3>
            </div>
            <span class="score-count"
              >{{ stats.count }}/{{ stats.total }} photos</span
            >
          </div>

          <!-- Average Score -->
          <div class="score-metric">
            <div class="metric-label">Average Score</div>
            <div class="metric-content">
              <div class="score-value-large">{{ stats.mean }}</div>
              <div
                class="score-rating"
                :style="{ color: getScoreBgColor(stats.mean) }"
              >
                {{ stats.rating }}
              </div>
            </div>
            <div class="score-bar-container">
              <div
                class="score-bar-fill"
                :style="{
                  width: `${(stats.mean / 10) * 100}%`,
                  backgroundColor: getScoreBgColor(stats.mean),
                }"
              ></div>
            </div>
          </div>

          <!-- Consistency -->
          <div class="consistency-metric">
            <div class="metric-label">Consistency</div>

            <div class="consistency-content">
              <!-- Visual Bar -->
              <div v-if="showConsistencyBar" class="consistency-bar-container">
                <div
                  class="consistency-bar-fill"
                  :style="{
                    width: getConsistencyWidth(stats.stdDev) + '%',
                    backgroundColor: stats.consistency.color,
                  }"
                ></div>
              </div>

              <!-- Text Information -->
              <div
                class="consistency-badge"
                :style="{
                  backgroundColor: stats.consistency.color + '20',
                  color: stats.consistency.color,
                }"
              >
                {{ stats.consistency.label }}
              </div>
              <div class="consistency-description">
                {{ stats.consistency.description }}
              </div>
              <div class="consistency-detail">σ = {{ stats.stdDev }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="fundamentalsStats.length === 0 && bonusStats.length === 0"
      class="empty-scores"
    >
      <n-icon size="48" :component="StarIcon" class="empty-icon" />
      <p class="empty-text">No artistic scores found in your photos</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { StarOutline as StarIcon } from "@vicons/ionicons5";

const props = defineProps({
  photos: {
    type: Array,
    required: true,
  },
  showConsistencyBar: {
    type: Boolean,
    default: true,
  },
});

const {
  calculateGlobalArtisticScores,
  formatCriterionName,
  getScoreBgColor,
  getCriterionIcon,
  artisticScores,
  consistencyScale,
} = useArtisticScores();

// Helper function to calculate consistency bar width based on level
const getConsistencyWidth = (stdDev) => {
  // Map stdDev to a percentage (0-100)
  // INVERTED: Lower stdDev = Higher consistency = Longer bar
  // Very Consistent (0-0.5) = 100%, Mostly Consistent (0.5-1.0) = 75%,
  // Variable (1.0-1.5) = 50%, Highly Variable (>1.5) = 25%
  if (stdDev <= 0.5) return 100;
  if (stdDev <= 1.0) return 75;
  if (stdDev <= 1.5) return 50;
  return 25;
};

// Calculate statistics for all scores
const scoresStats = computed(() => {
  return calculateGlobalArtisticScores(props.photos);
});

// Separate fundamentals and bonus stats
const fundamentalsStats = computed(() => {
  const stats = [];
  if (artisticScores.fundamentals) {
    artisticScores.fundamentals.criteria.forEach((criterionObj) => {
      const criterionStats = scoresStats.value[criterionObj.value];
      if (criterionStats) {
        stats.push({
          criterion: criterionObj.value,
          stats: criterionStats,
        });
      }
    });
  }
  return stats;
});

const bonusStats = computed(() => {
  const stats = [];
  if (artisticScores.bonus) {
    artisticScores.bonus.criteria.forEach((criterionObj) => {
      const criterionStats = scoresStats.value[criterionObj.value];
      if (criterionStats) {
        stats.push({
          criterion: criterionObj.value,
          stats: criterionStats,
        });
      }
    });
  }
  return stats;
});
</script>

<style scoped>
.report-section {
  margin-bottom: var(--spacing-4xl);
}

.report-section-header {
  margin-bottom: var(--spacing-2xl);
  margin-top: var(--spacing-xl);
}

.section-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.section-icon {
  color: var(--primary-color);
}

.section-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

/* Criteria Groups */
.criteria-group {
  margin-bottom: var(--spacing-3xl);
}

.criteria-group:last-of-type {
  margin-bottom: 0;
}

.group-header {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 2px solid var(--border-color);
}

.group-title-wrapper {
  display: flex;
  flex-direction: column;
}

.group-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.group-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-normal);
}

/* Artistic Scores Grid */
.artistic-scores-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-xl);
}

.score-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.score-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.score-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-lg);
  gap: var(--spacing-sm);
}

.score-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
}

.score-icon {
  flex-shrink: 0;
}

.score-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  flex: 1;
}

.score-count {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}

/* Score Metric */
.score-metric {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.metric-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--spacing-sm);
}

.metric-content {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.score-value-large {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  line-height: 1;
}

.score-rating {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.score-bar-container {
  width: 100%;
  height: 8px;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.score-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: var(--transition-normal);
}

/* Consistency Metric */
.consistency-metric {
  /* Empty for now, structure defined by children */
}

.consistency-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.consistency-bar-container {
  width: 100%;
  height: 8px;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-xs);
}

.consistency-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: var(--transition-normal);
}

.consistency-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  align-self: flex-start;
}

.consistency-description {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.consistency-detail {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-family: monospace;
}

/* Empty State */
.empty-scores {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  gap: var(--spacing-md);
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-text {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

/* Mobile Responsiveness */
@media (max-width: 1400px) {
  .artistic-scores-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1024px) {
  .artistic-scores-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .artistic-scores-grid {
    grid-template-columns: 1fr;
  }

  .score-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .metric-content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }

  .group-title {
    font-size: var(--font-size-lg);
  }
}
</style>
