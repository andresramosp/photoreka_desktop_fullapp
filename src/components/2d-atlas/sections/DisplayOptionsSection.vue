<template>
  <div class="section-content">
    <!-- Unstack photos -->
    <div class="control-item-row">
      <div class="control-item-label">
        <span>Unstack photos</span>
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-icon size="12" color="var(--text-secondary)" class="info-icon">
              <InfoCircleFilled />
            </n-icon>
          </template>
          Separates overlapping photos locally causing a minimum distortion
        </n-tooltip>
      </div>
      <n-switch
        :disabled="showDiscreteLoader"
        :value="gridRelaxationEnabled"
        @update:value="handleGridRelaxationChange"
        size="small"
        @click.stop
      />
    </div>

    <!-- Snap to grid -->
    <div class="control-item-row">
      <div class="control-item-label">
        <span>Snap to grid</span>
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <n-icon size="12" color="var(--text-secondary)" class="info-icon">
              <InfoCircleFilled />
            </n-icon>
          </template>
          Applies a distortion to align photos to a grid layout
        </n-tooltip>
      </div>
      <n-switch
        :disabled="showDiscreteLoader"
        :value="gridSnapToGrid"
        @update:value="handleGridSnapToGridChange"
        size="small"
        @click.stop
      />
    </div>

    <!-- Balloon expansion slider -->
    <div class="control-item-full">
      <div class="slider-header">
        <div class="control-item-label">
          <span>Balloon expansion</span>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon size="12" color="var(--text-secondary)" class="info-icon">
                <InfoCircleFilled />
              </n-icon>
            </template>
            Inflates the layout around its center
          </n-tooltip>
        </div>
        <span class="slider-value">
          {{ Math.round(gridRelaxationExpandStrength * 100) }}%
        </span>
      </div>
      <n-slider
        :disabled="showDiscreteLoader"
        :value="gridRelaxationExpandStrength"
        @update:value="handleGridRelaxationExpandStrengthChange"
        :min="0"
        :max="0.5"
        :step="0.02"
        @click.stop
        class="score-slider"
      />
    </div>

    <!-- Background -->
    <div class="control-item-row">
      <span class="control-item-text">Background</span>
      <div class="color-picker-pills">
        <button
          v-for="option in atlasBackgroundOptions"
          :key="option.id"
          :class="['color-pill', { active: atlasBackground === option.id }]"
          :style="{ backgroundColor: option.color }"
          :title="option.label"
          :disabled="showDiscreteLoader"
          @click.stop="handleAtlasBackgroundChange(option.id)"
        ></button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NSwitch, NSlider, NTooltip, NIcon } from "naive-ui";
import { InfoCircleFilled } from "@vicons/antd";
import { useTheme } from "@/composables/useTheme.js";

const props = defineProps({
  gridRelaxationEnabled: {
    type: Boolean,
    default: true,
  },
  gridRelaxationExpandStrength: {
    type: Number,
    default: 0,
  },
  gridSnapToGrid: {
    type: Boolean,
    default: true,
  },
  atlasBackground: {
    type: String,
    default: null,
  },
  showDiscreteLoader: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "update:gridRelaxationEnabled",
  "update:gridRelaxationExpandStrength",
  "update:gridSnapToGrid",
  "update:atlasBackground",
]);

const { isDarkMode } = useTheme();

const atlasBackgroundOptions = computed(() => {
  const allOptions = [
    { id: "default", color: "#000000", label: "Dark" },
    { id: "white", color: "#f5f5f5", label: "Light" },
    { id: "navy", color: "#1e3a5f", label: "Navy" },
    { id: "forest", color: "#2d4a3e", label: "Forest" },
  ];

  if (isDarkMode.value) {
    return allOptions.filter((opt) => opt.id !== "white");
  }
  return allOptions.filter((opt) => opt.id !== "default");
});

const handleGridRelaxationChange = (value) => {
  emit("update:gridRelaxationEnabled", value);
};

const handleGridSnapToGridChange = (value) => {
  emit("update:gridSnapToGrid", value);
};

const handleGridRelaxationExpandStrengthChange = (value) => {
  emit("update:gridRelaxationExpandStrength", value);
};

const handleAtlasBackgroundChange = (value) => {
  emit("update:atlasBackground", value);
};
</script>

<style scoped>
.section-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.control-item-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.control-item-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.info-icon {
  cursor: help;
}

.control-item-full {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.slider-value {
  font-size: 12px;
  color: var(--text-secondary);
}

.color-picker-pills {
  display: flex;
  gap: 8px;
}

.color-pill {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.color-pill:hover {
  transform: scale(1.1);
}

.color-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.color-pill.active {
  border-color: var(--primary-color, #007bff);
  box-shadow: 0 0 0 2px var(--primary-color, #007bff);
}

:deep(.n-slider) {
  --n-fill-color: #4ade80;
  --n-fill-color-hover: #22c55e;
}

:deep(.n-slider-handle) {
  background: #4ade80;
  border-color: #4ade80;
}
</style>
