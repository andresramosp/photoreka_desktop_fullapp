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
      <ColorPickerPills
        :model-value="atlasBackground"
        :disabled="showDiscreteLoader"
        @update:model-value="handleAtlasBackgroundChange"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NSwitch, NSlider, NTooltip, NIcon } from "naive-ui";
import { InfoCircleFilled } from "@vicons/antd";
import { useTheme } from "@/composables/useTheme.js";
import ColorPickerPills from "@/components/ColorPickerPills.vue";

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
  padding: 5px;
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

:deep(.n-slider) {
  --n-fill-color: #4ade80;
  --n-fill-color-hover: #22c55e;
}

:deep(.n-slider-handle) {
  background: #4ade80;
  border-color: #4ade80;
}
</style>
