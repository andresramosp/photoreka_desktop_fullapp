<template>
  <div class="ranking-tab">
    <div class="ranking-content">
      <div class="ranking-header">
        <div class="header-inline">
          <span class="header-text">Distribute 100 points across aspects</span>
          <div class="points-indicator">
            <span class="points-text">Remaining:</span>
            <span
              class="points-value"
              :class="{
                warning: remainingPoints < 0,
                success: remainingPoints === 0,
              }"
            >
              {{ remainingPoints }}
            </span>
          </div>
        </div>
      </div>

      <div class="sliders-container">
        <div class="sliders-grid">
          <div
            v-for="aspect in aestheticAspects"
            :key="aspect.key"
            class="slider-item"
          >
            <div class="slider-header">
              <label class="slider-label">{{ aspect.label }}</label>
              <span class="slider-value">{{ values[aspect.key] }}</span>
            </div>
            <n-slider
              v-model:value="values[aspect.key]"
              :min="0"
              :max="100"
              :step="1"
              :tooltip="false"
              @update:value="handleSliderChange"
              class="aesthetic-slider"
            />
          </div>
        </div>
      </div>

      <div class="ranking-actions">
        <n-button
          type="primary"
          :disabled="!isValidDistribution"
          @click="handleSearch"
          class="search-button"
        >
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                />
              </svg>
            </n-icon>
          </template>
          Search by Ranking
        </n-button>

        <n-button
          secondary
          @click="handleClear"
          :disabled="totalPoints === 0"
          class="clear-button"
        >
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41z"
                />
              </svg>
            </n-icon>
          </template>
          Clear All
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NSlider, NButton, NIcon } from "naive-ui";
import { computed, reactive } from "vue";

const emit = defineEmits(["search", "clear"]);

// Aesthetic aspects for ranking
const aestheticAspects = [
  {
    key: "reflections",
    label: "Reflections",
    description: "Mirror-like surfaces, water reflections, glass reflections",
  },
  {
    key: "lighting",
    label: "Lighting",
    description: "Dramatic lighting, golden hour, natural vs artificial light",
  },
  {
    key: "yuxtapositions",
    label: "Juxtapositions",
    description: "Contrasting elements, old vs new, nature vs urban",
  },
  {
    key: "symmetry",
    label: "Symmetry",
    description: "Balanced compositions, geometric patterns, mirror symmetry",
  },
  {
    key: "depth",
    label: "Depth of Field",
    description: "Bokeh effects, shallow focus, background blur",
  },
  {
    key: "colors",
    label: "Color Harmony",
    description:
      "Complementary colors, monochromatic schemes, vibrant palettes",
  },
  {
    key: "textures",
    label: "Textures",
    description: "Surface details, material contrasts, tactile qualities",
  },
  {
    key: "minimalism",
    label: "Minimalism",
    description: "Clean compositions, negative space, simple elements",
  },
  {
    key: "motion",
    label: "Motion",
    description: "Movement blur, dynamic poses, action capture",
  },
  {
    key: "atmosphere",
    label: "Atmosphere",
    description: "Mood, ambiance, emotional tone, weather effects",
  },
  {
    key: "contrast",
    label: "Contrast",
    description: "Light vs dark, high contrast, dramatic shadows",
  },
  {
    key: "patterns",
    label: "Patterns",
    description: "Repetitive elements, geometric patterns, natural rhythms",
  },
  {
    key: "scale",
    label: "Scale & Proportion",
    description: "Size relationships, macro details, vast landscapes",
  },
  {
    key: "geometry",
    label: "Geometric Forms",
    description: "Architectural lines, geometric shapes, structural elements",
  },
  {
    key: "organic",
    label: "Organic Shapes",
    description: "Natural curves, flowing forms, irregular patterns",
  },
  {
    key: "isolation",
    label: "Isolation",
    description: "Single subjects, empty spaces, focal isolation",
  },
  {
    key: "layers",
    label: "Layering",
    description: "Multiple planes, depth layers, foreground-background",
  },
  {
    key: "framing",
    label: "Natural Framing",
    description: "Environmental frames, doorways, windows, branches",
  },
  {
    key: "transparency",
    label: "Transparency",
    description: "See-through materials, glass, water, overlays",
  },
  {
    key: "saturation",
    label: "Color Saturation",
    description: "Vibrant colors, muted tones, desaturated aesthetics",
  },
];

// Values for each aesthetic aspect (0-100 points)
const values = reactive({});

// Initialize all values to 0
aestheticAspects.forEach((aspect) => {
  values[aspect.key] = 0;
});

// Computed values
const totalPoints = computed(() => {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
});

const remainingPoints = computed(() => {
  return 100 - totalPoints.value;
});

const isValidDistribution = computed(() => {
  return totalPoints.value === 100;
});

// Handle slider changes with zero-sum constraint
const handleSliderChange = () => {
  // If total exceeds 100, proportionally reduce other values
  if (totalPoints.value > 100) {
    const excess = totalPoints.value - 100;
    redistributeExcess(excess);
  }
};

const redistributeExcess = (excess) => {
  // Find the slider that was just changed (has the highest value or most recent change)
  // For simplicity, we'll just cap all values proportionally
  const total = totalPoints.value;
  if (total > 100) {
    const factor = 100 / total;
    Object.keys(values).forEach((key) => {
      values[key] = Math.round(values[key] * factor);
    });
  }
};

const handleSearch = () => {
  if (!isValidDistribution.value) return;

  // Create search parameters with only non-zero values
  const searchParams = {
    type: "ranking",
    criteria: Object.fromEntries(
      Object.entries(values).filter(([_, value]) => value > 0),
    ),
  };

  emit("search", searchParams);
};

const handleClear = () => {
  Object.keys(values).forEach((key) => {
    values[key] = 0;
  });
  emit("clear");
};

// Auto-distribute function for even distribution
const autoDistribute = () => {
  const nonZeroCount = Object.values(values).filter((v) => v > 0).length;
  if (nonZeroCount === 0) {
    // Distribute evenly among all
    const evenValue = Math.floor(100 / aestheticAspects.length);
    const remainder = 100 % aestheticAspects.length;

    aestheticAspects.forEach((aspect, index) => {
      values[aspect.key] = evenValue + (index < remainder ? 1 : 0);
    });
  } else {
    // Distribute evenly among non-zero values
    const evenValue = Math.floor(100 / nonZeroCount);
    const remainder = 100 % nonZeroCount;

    let distributedCount = 0;
    Object.keys(values).forEach((key) => {
      if (values[key] > 0) {
        values[key] = evenValue + (distributedCount < remainder ? 1 : 0);
        distributedCount++;
      }
    });
  }
};

// Provide auto-distribute function to parent if needed
defineExpose({
  autoDistribute,
});
</script>

<style scoped>
.ranking-tab {
  padding: 0;
}

.ranking-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ranking-header {
  margin-bottom: 12px;
}

.header-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.header-text {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.points-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.points-text {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.points-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 20px;
  text-align: center;
}

.points-value.warning {
  color: #f59e0b;
}

.points-value.success {
  color: #10b981;
}

.sliders-container {
  margin: 4px 0;
}

.sliders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.slider-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.slider-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.slider-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  min-width: 20px;
  text-align: right;
}

.aesthetic-slider {
  width: 100%;
  height: 16px;
  margin: 1px 0;
}

:deep(.n-slider) {
  height: 16px;
}

:deep(.n-slider-rail) {
  height: 4px;
  background-color: var(--border-color);
}

:deep(.n-slider-fill) {
  height: 4px;
  background-color: var(--primary-color);
}

:deep(.n-slider-handle) {
  width: 12px;
  height: 12px;
  border: 2px solid var(--primary-color);
  background-color: #ffffff;
}

.ranking-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 8px;
}

.search-button {
  min-width: 160px;
  height: 40px;
  font-weight: 500;
}

.clear-button {
  min-width: 120px;
  height: 40px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .sliders-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }

  .ranking-actions {
    flex-direction: column;
    gap: 8px;
  }

  .search-button,
  .clear-button {
    width: 100%;
    max-width: 300px;
  }
}

@media (max-width: 480px) {
  .ranking-header {
    margin-bottom: 16px;
  }

  .ranking-title {
    font-size: 16px;
  }

  .ranking-subtitle {
    font-size: 13px;
  }

  .points-indicator {
    max-width: 180px;
    padding: 6px 12px;
  }

  .points-text {
    font-size: 12px;
  }

  .points-value {
    font-size: 13px;
  }

  .sliders-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .slider-label {
    font-size: 12px;
  }

  .slider-value {
    font-size: 11px;
  }
}
</style>
