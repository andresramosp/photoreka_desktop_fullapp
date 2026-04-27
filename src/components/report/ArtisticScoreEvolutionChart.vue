<template>
  <div class="evolution-chart-section">
    <div class="chart-container">
      <div class="chart-controls">
        <div class="control-group">
          <label class="control-label">Scores to Compare</label>
          <n-select
            v-model:value="selectedCriteria"
            :options="criterionOptions"
            placeholder="Select criteria to compare"
            size="small"
            multiple
            :max-tag-count="2"
            :consistent-menu-width="false"
          />
        </div>
      </div>
      <template v-if="hasChartData">
        <div class="chart-header">
          <h4 class="chart-title">Score Evolution Over Time</h4>
          <div class="chart-stats">
            <span class="stat-item">
              <span class="stat-label">Criteria:</span>
              <span class="stat-value">{{ selectedCriteria.length }}</span>
            </span>
            <span class="stat-item">
              <span class="stat-label">Time Span:</span>
              <span class="stat-value">{{ timeSpanText }}</span>
            </span>
          </div>
        </div>

        <svg class="line-chart" viewBox="20 -10 780 190">
          <!-- Chart background -->
          <rect
            x="60"
            y="10"
            width="720"
            height="130"
            fill="var(--bg-surface)"
            rx="1"
          />

          <!-- Grid lines (horizontal) -->
          <line
            v-for="i in 5"
            :key="`grid-${i}`"
            x1="60"
            :y1="10 + (i - 1) * 32.5"
            x2="780"
            :y2="10 + (i - 1) * 32.5"
            stroke="var(--border-color)"
            stroke-width="0.5"
            opacity="0.2"
          />

          <!-- Axes -->
          <line
            x1="60"
            y1="140"
            x2="60"
            y2="10"
            stroke="var(--text-secondary)"
            stroke-width="1"
          />
          <line
            x1="60"
            y1="140"
            x2="780"
            y2="140"
            stroke="var(--text-secondary)"
            stroke-width="1"
          />

          <!-- Y-axis labels (scores 0-10) -->
          <text
            v-for="(label, i) in yAxisLabels"
            :key="`y-${i}`"
            x="50"
            :y="143 - i * 32.5"
            fill="var(--text-secondary)"
            font-size="8"
            text-anchor="end"
          >
            {{ label }}
          </text>

          <!-- X-axis labels (dates) -->
          <g v-for="(point, index) in allDatePoints" :key="`x-label-${index}`">
            <text
              v-if="shouldShowDateLabel(index)"
              :x="getDateX(index)"
              y="155"
              fill="var(--text-secondary)"
              font-size="7"
              text-anchor="middle"
            >
              {{ formatDateLabel(point) }}
            </text>
          </g>

          <!-- Data areas (filled) for each criterion -->
          <g v-for="criterion in selectedCriteria" :key="`area-${criterion}`">
            <path
              :d="generateAreaPath(criterion)"
              :fill="`url(#gradient-${criterion})`"
              opacity="0.15"
            />
          </g>

          <!-- Data lines for each criterion -->
          <g v-for="criterion in selectedCriteria" :key="`line-${criterion}`">
            <polyline
              :points="generateChartLine(criterion)"
              fill="none"
              :stroke="getCriterionColor(criterion)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>

          <!-- Data points for each criterion -->
          <g v-for="criterion in selectedCriteria" :key="`points-${criterion}`">
            <g
              v-for="(point, index) in getCriterionChartData(criterion)"
              :key="`point-${criterion}-${index}`"
            >
              <circle
                :cx="getDateX(index)"
                :cy="getY(point.average)"
                r="2"
                :fill="getCriterionColor(criterion)"
                stroke="white"
                stroke-width="1"
                class="chart-point"
              >
                <title>
                  {{ formatCriterionName(criterion) }}
                  {{ formatDateLabel(point.date) }}
                  Avg: {{ point.average }} Photos: {{ point.count }}
                </title>
              </circle>
            </g>
          </g>

          <!-- Gradient definitions for each criterion -->
          <defs>
            <linearGradient
              v-for="criterion in selectedCriteria"
              :key="`gradient-${criterion}`"
              :id="`gradient-${criterion}`"
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop
                offset="0%"
                :style="`stop-color:${getCriterionColor(criterion)};stop-opacity:0.4`"
              />
              <stop
                offset="100%"
                :style="`stop-color:${getCriterionColor(criterion)};stop-opacity:0`"
              />
            </linearGradient>
          </defs>
        </svg>

        <!-- Legend -->
        <div class="chart-legend">
          <div
            v-for="criterion in selectedCriteria"
            :key="`legend-${criterion}`"
            class="legend-item"
          >
            <div
              class="legend-color"
              :style="{ backgroundColor: getCriterionColor(criterion) }"
            ></div>
            <span class="legend-label">
              {{ formatCriterionName(criterion) }}
            </span>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="empty-chart">
          <n-icon size="48" :component="TrendingUpIcon" class="empty-icon" />
          <p class="empty-text">
            {{
              selectedCriteria.length > 0
                ? "No photos found with selected criteria"
                : "Select one or more criteria to view evolution"
            }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { NSelect, NIcon } from "naive-ui";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useUserStore } from "@/stores/userStore";
import { TrendingUp as TrendingUpIcon } from "@vicons/ionicons5";
import theme from "@/config/theme.js";

const { colors } = theme;

const props = defineProps({
  photos: {
    type: Array,
    required: true,
  },
});

const { formatCriterionName, getScoreBgColor, artisticScores } =
  useArtisticScores({ profile: () => useUserStore().user?.profiles });

const selectedCriteria = ref([]);

/* ---------- OPTIONS ---------- */

const criterionOptions = computed(() => {
  const options = [];

  if (artisticScores.fundamentals) {
    options.push({
      type: "group",
      label: artisticScores.fundamentals.label,
      key: "fundamentals",
      children: artisticScores.fundamentals.criteria.map((c) => ({
        label: formatCriterionName(c.value),
        value: c.value,
      })),
    });
  }

  if (artisticScores.bonus) {
    options.push({
      type: "group",
      label: artisticScores.bonus.label,
      key: "bonus",
      children: artisticScores.bonus.criteria.map((c) => ({
        label: formatCriterionName(c.value),
        value: c.value,
      })),
    });
  }

  return options;
});

if (criterionOptions.value.length > 0 && selectedCriteria.value.length === 0) {
  const firstGroup = criterionOptions.value[0];
  if (firstGroup.children && firstGroup.children.length > 0) {
    selectedCriteria.value = [firstGroup.children[0].value];
  }
}

/* ---------- COLORS ---------- */

const getSliceColor = (index) => {
  const chartColors = [
    colors.blue[600], // #2563eb - Azul principal
    colors.blue[400], // #60a5fa - Azul claro
    colors.cyan[600], // #0891b2 - Teal/Cyan
    colors.purple[500], // #a855f7 - Púrpura
    colors.pink[500], // #ec4899 - Rosa/Magenta
    colors.blue[500], // #3b82f6 - Azul medio
    colors.purple[400], // #c084fc - Púrpura claro
    colors.cyan[500], // #06b6d4 - Cyan
    colors.blue[300], // #93c5fd - Azul muy claro
    colors.purple[600], // #9333ea - Púrpura oscuro
  ];
  return chartColors[index % chartColors.length];
};

const getCriterionColor = (criterion) => {
  const index = selectedCriteria.value.indexOf(criterion);
  return getSliceColor(index);
};

/* ---------- DATA ---------- */

const allDatePoints = computed(() => {
  if (selectedCriteria.value.length === 0) return [];

  const datesSet = new Set();

  selectedCriteria.value.forEach((criterion) => {
    const data = getCriterionChartData(criterion);
    data.forEach((point) => {
      datesSet.add(point.date.getTime());
    });
  });

  return Array.from(datesSet)
    .sort((a, b) => a - b)
    .map((timestamp) => new Date(timestamp));
});

const getCriterionChartData = (criterion) => {
  const photosWithCriterion = props.photos.filter((photo) => {
    const scores = photo.descriptions?.artistic_scores;
    return scores && scores[criterion] !== undefined;
  });

  if (photosWithCriterion.length === 0) return [];

  return calculateChartData(photosWithCriterion, criterion);
};

const calculateChartData = (photos, criterion) => {
  const photosWithDates = photos
    .map((photo) => ({
      photo,
      timestamp: new Date(photo.descriptions?.EXIF?.dateTaken).getTime(),
      score: photo.descriptions.artistic_scores[criterion],
    }))
    .filter((item) => !isNaN(item.timestamp) && item.score !== undefined)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (photosWithDates.length === 0) return [];

  const minDate = photosWithDates[0].timestamp;
  const maxDate = photosWithDates[photosWithDates.length - 1].timestamp;
  const range = maxDate - minDate;

  let binSize;
  let numBins;

  if (range < 7 * 24 * 60 * 60 * 1000) {
    binSize = 24 * 60 * 60 * 1000;
    numBins = Math.ceil(range / binSize) || 1;
  } else if (range < 60 * 24 * 60 * 60 * 1000) {
    binSize = 7 * 24 * 60 * 60 * 1000;
    numBins = Math.ceil(range / binSize) || 1;
  } else if (range < 365 * 24 * 60 * 60 * 1000) {
    binSize = 30 * 24 * 60 * 60 * 1000;
    numBins = Math.ceil(range / binSize) || 1;
  } else {
    binSize = 90 * 24 * 60 * 60 * 1000;
    numBins = Math.ceil(range / binSize) || 1;
  }

  numBins = Math.min(numBins, 30);
  binSize = range / numBins;

  const bins = Array(numBins)
    .fill(0)
    .map((_, i) => ({
      start: minDate + i * binSize,
      end: minDate + (i + 1) * binSize,
      scores: [],
      date: new Date(minDate + i * binSize + binSize / 2),
    }));

  photosWithDates.forEach((item) => {
    const binIndex = Math.min(
      Math.floor((item.timestamp - minDate) / binSize),
      numBins - 1,
    );
    if (binIndex >= 0 && binIndex < bins.length) {
      bins[binIndex].scores.push(item.score);
    }
  });

  return bins
    .filter((bin) => bin.scores.length > 0)
    .map((bin) => ({
      date: bin.date,
      average: parseFloat(
        (bin.scores.reduce((sum, s) => sum + s, 0) / bin.scores.length).toFixed(
          2,
        ),
      ),
      count: bin.scores.length,
      min: Math.min(...bin.scores),
      max: Math.max(...bin.scores),
    }));
};

/* ---------- META ---------- */

const hasChartData = computed(() => {
  return selectedCriteria.value.some(
    (criterion) => getCriterionChartData(criterion).length > 0,
  );
});

const timeSpanText = computed(() => {
  if (allDatePoints.value.length === 0) return "N/A";

  const firstDate = allDatePoints.value[0];
  const lastDate = allDatePoints.value[allDatePoints.value.length - 1];

  return `${formatDateLabel(firstDate)} - ${formatDateLabel(lastDate)}`;
});

const yAxisLabels = [0, 2.5, 5, 7.5, 10];

/* ---------- CHART GEOMETRY ---------- */

const chartWidth = 720;
const chartHeight = 130;
const chartLeft = 60;
const chartTop = 10;

/* 👉 padding real interno del área del gráfico */
const chartPaddingX = 12;

/* X */
const getDateX = (index) => {
  const usableWidth = chartWidth - chartPaddingX * 2;
  const step = usableWidth / Math.max(allDatePoints.value.length - 1, 1);
  return chartLeft + chartPaddingX + index * step;
};

/* Y */
const getY = (score) => {
  const normalizedScore = score / 10;
  return chartTop + chartHeight - normalizedScore * chartHeight;
};

const generateChartLine = (criterion) => {
  const data = getCriterionChartData(criterion);
  return data
    .map((point, index) => `${getDateX(index)},${getY(point.average)}`)
    .join(" ");
};

const generateAreaPath = (criterion) => {
  const data = getCriterionChartData(criterion);
  if (data.length === 0) return "";

  const points = data.map((point, index) => ({
    x: getDateX(index),
    y: getY(point.average),
  }));

  let path = `M ${points[0].x} ${chartTop + chartHeight}`;
  path += ` L ${points[0].x} ${points[0].y}`;

  points.forEach((point) => {
    path += ` L ${point.x} ${point.y}`;
  });

  const lastPoint = points[points.length - 1];
  path += ` L ${lastPoint.x} ${chartTop + chartHeight}`;
  path += ` Z`;

  return path;
};

const formatDateLabel = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const shouldShowDateLabel = (index) => {
  const totalPoints = allDatePoints.value.length;

  if (totalPoints <= 12) return true;
  if (totalPoints <= 24) return index % 2 === 0;
  if (totalPoints <= 40) return index % 3 === 0;
  return index % 4 === 0;
};
</script>

<style scoped>
.evolution-chart-section {
  margin-top: var(--spacing-4xl);
  padding-top: var(--spacing-3xl);
  border-top: 2px solid var(--border-color);
}

.chart-controls {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--spacing-lg);
  gap: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.control-group {
  flex: 0 0 auto;
  width: 350px;
}

.control-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chart-container {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-2xl);
  gap: var(--spacing-xl);
  flex-wrap: wrap;
}

.chart-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.chart-stats {
  display: flex;
  gap: var(--spacing-xl);
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-xs);
}

.stat-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}

.stat-value {
  font-size: var(--font-size-base);
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.line-chart {
  width: 100%;
  height: auto;
  margin-bottom: var(--spacing-sm);
}

.chart-point {
  cursor: pointer;
  transition: r 0.2s ease;
}

.chart-point:hover {
  r: 4;
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.legend-color {
  width: 16px;
  height: 3px;
  border-radius: var(--radius-sm);
}

.legend-line {
  width: 20px;
  height: 2px;
  background: linear-gradient(
    to right,
    var(--primary-color) 0%,
    var(--primary-color) 40%,
    transparent 40%,
    transparent 60%,
    var(--primary-color) 60%,
    var(--primary-color) 100%
  );
}

.legend-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* Empty State */
.empty-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  gap: var(--spacing-md);
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.empty-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-text {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  text-align: center;
}

/* Responsive */
@media (max-width: 768px) {
  .chart-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .chart-stats {
    width: 100%;
    justify-content: space-between;
  }

  .control-group {
    max-width: 100%;
  }

  .chart-legend {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
