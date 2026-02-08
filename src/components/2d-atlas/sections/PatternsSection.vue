<template>
  <div class="section-content">
    <!-- Display mode: list or select -->
    <div v-if="displayMode === 'list'" class="patterns-list-container">
      <div
        v-if="sortedPatternsForCurrentChunk.length === 0"
        class="no-patterns-message"
      >
        No patterns found for this clustering type
      </div>
      <div v-else class="patterns-list">
        <div
          v-for="pattern in sortedPatternsForCurrentChunk"
          :key="pattern.patternId ?? pattern.title"
          :class="[
            'pattern-item',
            {
              selected:
                selectedPatternId === (pattern.patternId ?? pattern.title),
            },
          ]"
          @click="handlePatternClick(pattern)"
        >
          <div class="pattern-info">
            <div style="display: flex; align-items: center; gap: 8px">
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <n-icon
                    :size="14"
                    :component="getStrengthIcon(pattern.strength)"
                    class="pattern-strength-icon"
                    :class="pattern.strength"
                  />
                </template>
                {{ getStrengthLabel(pattern.strength) }} pattern
              </n-tooltip>
              <span class="pattern-title">{{
                pattern.title || "Pattern"
              }}</span>
            </div>
            <div class="pattern-meta">
              <n-tooltip
                v-if="pattern.description"
                trigger="hover"
                placement="left"
                :show-arrow="false"
              >
                <template #trigger>
                  <n-icon size="14" class="pattern-info-icon" @click.stop>
                    <InfoCircleFilled />
                  </n-icon>
                </template>
                <div class="pattern-tooltip-content">
                  {{ pattern.description }}
                </div>
              </n-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Select mode for mobile -->
    <div v-else-if="displayMode === 'select'" class="patterns-select-container">
      <n-select
        :value="selectedPatternId"
        @update:value="handlePatternSelectChange"
        :options="patternSelectOptions"
        :render-label="renderPatternLabel"
        size="small"
        class="pattern-select"
        placeholder="Select a pattern"
        clearable
        :filterable="false"
        @click.stop
        :menu-props="{
          style: {
            'max-height': '200px',
            padding: '0',
            overflow: 'hidden',
            padding: '0',
            overflowY: 'auto',
          },
        }"
      >
        <template #empty>
          <div style="padding: 8px; color: #888; font-size: 12px">
            No patterns available
          </div>
        </template>
      </n-select>
    </div>
  </div>
</template>

<script setup>
import { computed, h } from "vue";
import { NIcon, NTooltip, NSelect } from "naive-ui";
import { InfoCircleFilled } from "@vicons/antd";
import {
  Star,
  EllipseOutline,
  TrendingUpOutline,
  Star as StarIcon,
  EllipseOutline as EllipseIcon,
  TrendingUpOutline as TrendingUpIcon,
} from "@vicons/ionicons5";

const props = defineProps({
  patternsForCurrentChunk: {
    type: Array,
    default: () => [],
  },
  selectedPatternId: {
    type: [String, Number],
    default: null,
  },
  displayMode: {
    type: String,
    default: "list", // 'list' or 'select'
    validator: (value) => ["list", "select"].includes(value),
  },
});

const emit = defineEmits(["select-pattern"]);

// Sort patterns by strength first, then by number of photos
const sortedPatternsForCurrentChunk = computed(() => {
  const strengthOrder = { strong: 0, moderate: 1, weak: 2 };
  const patterns = [...props.patternsForCurrentChunk];
  return patterns.sort((a, b) => {
    const aStrengthIndex = strengthOrder[a.strength] ?? 999;
    const bStrengthIndex = strengthOrder[b.strength] ?? 999;
    if (aStrengthIndex !== bStrengthIndex) {
      return aStrengthIndex - bStrengthIndex;
    }
    const aCount = (a.clusterPhotos || []).length;
    const bCount = (b.clusterPhotos || []).length;
    return bCount - aCount;
  });
});

// Options for n-select in mobile mode
const patternSelectOptions = computed(() => {
  return sortedPatternsForCurrentChunk.value.map((pattern) => ({
    label: pattern.title || "Pattern",
    value: pattern.patternId ?? pattern.title,
    strength: pattern.strength,
  }));
});

const renderPatternLabel = (option) => {
  const getIconComponent = (strength) => {
    const icons = {
      strong: Star,
      moderate: EllipseOutline,
      weak: TrendingUpOutline,
    };
    return icons[strength];
  };

  const getIconColor = (strength) => {
    const colors = {
      strong: "var(--accent-color, #4ade80)",
      moderate: "var(--primary-color, #3b82f6)",
      weak: "var(--warning-color, #f59e0b)",
    };
    return colors[strength] || "var(--text-primary)";
  };

  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 0 6px 8px",
        color: "var(--text-primary)",
      },
    },
    [
      h(
        NIcon,
        {
          size: 14,
          style: {
            flexShrink: "0",
            color: getIconColor(option.strength),
          },
        },
        {
          default: () => h(getIconComponent(option.strength)),
        },
      ),
      h(
        "span",
        {
          style: {
            fontSize: "12px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
        option.label,
      ),
    ],
  );
};

const getIconColor = (strength) => {
  const colors = {
    strong: "var(--accent-color, #4ade80)",
    moderate: "var(--primary-color, #3b82f6)",
    weak: "var(--warning-color, #f59e0b)",
  };
  return colors[strength] || "var(--text-primary)";
};

const handlePatternClick = (pattern) => {
  emit("select-pattern", pattern);
};

const handlePatternSelectChange = (value) => {
  console.log("[PatternsSection] Select change - value:", value);
  console.log(
    "[PatternsSection] Available patterns:",
    props.patternsForCurrentChunk,
  );

  if (value === null) {
    // Cleared
    console.log("[PatternsSection] Cleared selection");
    emit("select-pattern", null);
  } else {
    const pattern = props.patternsForCurrentChunk.find(
      (p) => (p.patternId ?? p.title) === value,
    );
    console.log("[PatternsSection] Found pattern:", pattern);
    if (pattern) {
      // Solo emitir select-pattern, dejar que Photos2D maneje el estado
      emit("select-pattern", pattern);
    } else {
      console.warn("[PatternsSection] Pattern not found for value:", value);
    }
  }
};

const getStrengthLabel = (strength) => {
  const labels = {
    strong: "Strong",
    moderate: "Moderate",
    weak: "Emerging",
  };
  return labels[strength] || strength;
};

const getStrengthIcon = (strength) => {
  const icons = {
    strong: StarIcon,
    moderate: EllipseIcon,
    weak: TrendingUpIcon,
  };
  return icons[strength] || null;
};
</script>

<style scoped>
.section-content {
  display: flex;
  flex-direction: column;
}

.patterns-list-container {
  display: flex;
  flex-direction: column;
}

.no-patterns-message {
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
  padding: 16px 8px;
}

.patterns-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}

.patterns-list::-webkit-scrollbar {
  width: 4px;
}

.patterns-list::-webkit-scrollbar-track {
  background: transparent;
}

.patterns-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.pattern-item {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.pattern-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.pattern-item.selected {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.pattern-item.selected:hover {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 50%, transparent);
}

.pattern-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pattern-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pattern-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pattern-strength-icon {
  cursor: help;
  transition: color 0.2s;
  flex-shrink: 0;
}

.pattern-strength-icon.strong {
  color: var(--accent-color, #4ade80);
}

.pattern-strength-icon.moderate {
  color: var(--primary-color, #3b82f6);
}

.pattern-strength-icon.weak {
  color: var(--warning-color, #f59e0b);
}

.pattern-info-icon {
  color: var(--text-secondary);
  cursor: help;
  transition: color 0.2s;
  flex-shrink: 0;
}

.pattern-info-icon:hover {
  color: var(--text-primary);
}

.pattern-tooltip-content {
  max-width: 270px;
  font-size: 12px;
  line-height: 16px;
  word-wrap: break-word;
}

.patterns-select-container {
  width: 100%;
}

.pattern-select {
  width: 100%;
}
</style>
