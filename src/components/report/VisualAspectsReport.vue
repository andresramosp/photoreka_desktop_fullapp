<template>
  <div class="report-section">
    <div class="report-section-header">
      <h2 class="section-title">
        <n-icon class="section-icon">
          <EyeIcon />
        </n-icon>
        Visual Aspects Analysis
      </h2>
      <p class="section-description">
        Statistical breakdown of visual characteristics across your photo
        collection
      </p>
    </div>

    <div class="visual-aspects-charts-grid">
      <div
        v-for="aspect in visualAspectsData"
        :key="aspect.key"
        class="aspect-chart-card"
      >
        <div class="chart-header">
          <h3 class="chart-title">{{ aspect.label }}</h3>
          <span class="chart-total">{{ aspect.totalPhotos }} photos</span>
        </div>

        <div class="chart-container">
          <div class="pie-chart" :id="`chart-${aspect.key}`">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <g transform="translate(100,100)">
                <path
                  v-for="(item, index) in aspect.breakdown"
                  :key="item.value"
                  :d="
                    generatePieSlice(item.percentage, index, aspect.breakdown)
                  "
                  :fill="getSliceColor(index)"
                  :stroke="'var(--border-color)'"
                  :stroke-width="1"
                  class="pie-slice"
                >
                  <title>
                    {{ item.label }}: {{ item.percentage.toFixed(1) }}%
                  </title>
                </path>
              </g>
            </svg>
          </div>

          <div class="chart-legend">
            <div
              v-for="(item, index) in aspect.breakdown"
              :key="item.value"
              class="legend-item"
            >
              <div
                class="legend-color"
                :style="{ backgroundColor: getSliceColor(index) }"
              ></div>
              <span class="legend-label">{{ item.label }}</span>
              <span class="legend-value"
                >{{ item.percentage.toFixed(1) }}%</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { EyeOutline as EyeIcon } from "@vicons/ionicons5";
import theme from "@/config/theme.js";
const { colors } = theme;

const props = defineProps({
  photos: {
    type: Array,
    required: true,
  },
});

// Calculate real data from photos
const visualAspectsData = computed(() => {
  if (!props.photos || props.photos.length === 0) {
    return [];
  }

  return visualAspectsOptions
    .map((aspect) => {
      // Count occurrences of each child value
      const valueCounts = {};
      let totalPhotosWithAspect = 0;

      // Initialize counts for all possible values
      aspect.children.forEach((child) => {
        valueCounts[child.value] = 0;
      });

      // Count actual occurrences in photos
      props.photos.forEach((photo) => {
        const visualAspects = photo.descriptions?.visual_aspects;
        if (visualAspects && visualAspects[aspect.key]) {
          const aspectValues = visualAspects[aspect.key];
          if (Array.isArray(aspectValues) && aspectValues.length > 0) {
            totalPhotosWithAspect++;
            aspectValues.forEach((value) => {
              if (valueCounts.hasOwnProperty(value)) {
                valueCounts[value]++;
              }
            });
          }
        }
      });

      // Skip aspects with no data
      if (totalPhotosWithAspect === 0) {
        return null;
      }

      // Create breakdown with percentages
      const breakdown = aspect.children
        .map((child) => {
          const count = valueCounts[child.value];
          const percentage =
            totalPhotosWithAspect > 0
              ? (count / totalPhotosWithAspect) * 100
              : 0;

          return {
            label: child.label,
            value: child.value,
            count,
            percentage,
          };
        })
        .sort((a, b) => b.percentage - a.percentage); // Sort by percentage descending

      // Only return aspect if it has data
      if (breakdown.length === 0) {
        return null;
      }

      return {
        key: aspect.key,
        label: aspect.label,
        totalPhotos: totalPhotosWithAspect,
        breakdown,
      };
    })
    .filter(Boolean); // Remove null entries
});

// Pie chart functions
const generatePieSlice = (percentage, index, allItems) => {
  const total = allItems.reduce((sum, item) => sum + item.percentage, 0);
  const radius = 80;

  // Calculate start and end angles
  let startAngle = 0;
  for (let i = 0; i < index; i++) {
    startAngle += (allItems[i].percentage / total) * 2 * Math.PI;
  }
  const endAngle = startAngle + (percentage / total) * 2 * Math.PI;

  // Calculate coordinates
  const x1 = Math.cos(startAngle - Math.PI / 2) * radius;
  const y1 = Math.sin(startAngle - Math.PI / 2) * radius;
  const x2 = Math.cos(endAngle - Math.PI / 2) * radius;
  const y2 = Math.sin(endAngle - Math.PI / 2) * radius;

  // Large arc flag
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  // Handle full circle case (single slice at 100%)
  if (Math.abs(endAngle - startAngle - 2 * Math.PI) < 0.01) {
    // Draw a full circle using two semicircles
    return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${-x1} ${-y1} A ${radius} ${radius} 0 1 1 ${x1} ${y1} Z`;
  }

  // Build path for partial slices
  return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
};

const getSliceColor = (index) => {
  // Colores basados en el tema, siguiendo la paleta de la imagen
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

/* Visual Aspects Charts Grid */
.visual-aspects-charts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-xl);
}

.aspect-chart-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.aspect-chart-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.chart-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.chart-total {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.chart-container {
  display: flex;
  gap: var(--spacing-lg);
  align-items: flex-start;
}

.pie-chart {
  flex-shrink: 0;
}

.pie-chart svg {
  width: 200px;
  height: 200px;
  max-width: 100%;
}

.pie-slice {
  transition: var(--transition-normal);
  cursor: pointer;
}

.pie-slice:hover {
  filter: brightness(1.1);
  transform-origin: center;
}

.chart-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  min-width: 150px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-label {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.legend-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  flex-shrink: 0;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .visual-aspects-charts-grid {
    grid-template-columns: 1fr;
  }

  .chart-container {
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-lg);
  }

  .pie-chart svg {
    width: 180px;
    height: 180px;
  }

  .chart-legend {
    min-width: unset;
    width: 100%;
  }
}
</style>
