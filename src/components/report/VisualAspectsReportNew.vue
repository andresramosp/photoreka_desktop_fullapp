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
        Distribution of visual characteristics across your photo collection
      </p>
    </div>

    <div class="visual-aspects-container">
      <div
        v-for="aspect in visualAspectsData"
        :key="aspect.key"
        class="aspect-group"
      >
        <div class="aspect-card">
          <div class="aspect-header">
            <div class="aspect-title-wrapper">
              <h3 class="aspect-title">{{ aspect.label }}</h3>
              <span class="aspect-subtitle"
                >{{ aspect.totalPhotos }} photos with this aspect</span
              >
            </div>
          </div>

          <div class="values-list">
            <div
              v-for="(item, index) in aspect.breakdown"
              :key="item.value"
              class="value-row"
            >
              <div class="value-info">
                <div class="value-label-row">
                  <div
                    class="value-color-dot"
                    :style="{ backgroundColor: getSliceColor(index) }"
                  ></div>
                  <span class="value-label">{{ item.label }}</span>
                </div>
                <span class="value-count">{{ item.count }} photos</span>
              </div>

              <div class="value-bar-section">
                <div class="bar-container">
                  <div
                    class="bar-fill"
                    :style="{
                      width: `${
                        aspect.totalPhotos > 0
                          ? (item.count / aspect.totalPhotos) * 100
                          : 0
                      }%`,

                      backgroundColor: getSliceColor(index),
                    }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="visualAspectsData.length === 0" class="empty-aspects">
      <n-icon size="48" :component="EyeIcon" class="empty-icon" />
      <p class="empty-text">No visual aspects data found in your photos</p>
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

const visualAspectsData = computed(() => {
  if (!props.photos || props.photos.length === 0) {
    return [];
  }

  const data = visualAspectsOptions.map((aspect) => {
    const valueCounts = {};
    let totalPhotosWithAspect = 0;

    // Inicializar contadores
    aspect.children.forEach((child) => {
      valueCounts[child.value] = 0;
    });

    // Contar ocurrencias reales
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

    const breakdown = aspect.children
      .map((child) => ({
        label: child.label,
        value: child.value,
        count: valueCounts[child.value],
      }))
      .sort((a, b) => b.count - a.count);

    // 👉 nº de barritas reales (valores con presencia)
    const activeBarsCount = breakdown.filter((item) => item.count > 0).length;

    return {
      key: aspect.key,
      label: aspect.label,
      totalPhotos: totalPhotosWithAspect,
      breakdown,
      activeBarsCount,
    };
  });

  // 🔥 Ordenar cards: más barritas → menos barritas
  return data.sort((a, b) => b.activeBarsCount - a.activeBarsCount);
});

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
</script>

<style scoped>
/* Common styles inherited from parent */

/* Visual Aspects Container */
.visual-aspects-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-xl);
}

/* Aspect Groups */
.aspect-group {
  /* Grid item for 3 columns layout */
}

.aspect-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
  min-height: 200px;
}

@media (max-width: 768px) {
  .aspect-card {
    min-height: unset;
  }
}

.aspect-card:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-lg);
}

.aspect-header {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 2px solid var(--border-color);
}

.aspect-title-wrapper {
  display: flex;
  flex-direction: column;
}

.aspect-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.aspect-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-normal);
  margin-top: var(--spacing-xs);
}

/* Values List */
.values-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.value-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

.value-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 200px;
  flex-shrink: 0;
}

.value-label-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.value-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.value-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.value-count {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  white-space: nowrap;
  margin-left: var(--spacing-md);
}

/* Bar Section */
.value-bar-section {
  flex: 1;
  display: flex;
  align-items: center;
}

.bar-container {
  width: 100%;
  height: 24px;
  background-color: var(--bg-secondary);
  border-radius: 0;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 0;
  transition: width 0.3s ease;
  min-width: 2px;
}

/* Empty State */
.empty-aspects {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  gap: var(--spacing-md);
}

/* Mobile Responsiveness */
@media (max-width: 1400px) {
  .visual-aspects-container {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1024px) {
  .visual-aspects-container {
    grid-template-columns: 1fr;
  }

  .value-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .value-info {
    width: 100%;
    min-width: unset;
  }

  .value-bar-section {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .aspect-title {
    font-size: var(--font-size-lg);
  }

  .value-label {
    font-size: var(--font-size-sm);
  }

  .bar-container {
    height: 20px;
  }
}
</style>
