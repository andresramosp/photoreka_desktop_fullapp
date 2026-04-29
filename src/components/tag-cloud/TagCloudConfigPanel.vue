<template>
  <div>
    <!-- Collapsed Panel (Small Corner Button) -->
    <div
      v-if="!isExpanded"
      class="collapsed-panel"
      @click="isExpanded = true"
      @click.stop
    >
      <n-icon class="settings-icon">
        <SettingOutlined />
      </n-icon>
    </div>

    <!-- Expanded Panel Content -->
    <div v-if="isExpanded" class="control-panel" @click.stop @wheel.stop>
      <!-- Close Button (Top Right Corner) -->
      <button class="close-panel-btn-corner" @click="isExpanded = false">
        <n-icon>
          <CloseOutlined />
        </n-icon>
      </button>

      <!-- Stats Section -->
      <!-- <div class="control-section">
        <div class="stats-row">
          <strong>{{ tagCount }}</strong> tags
          <span
            v-if="totalCandidates && totalCandidates > tagCount"
            class="stats-sub"
          >
            / top of {{ totalCandidates }}
          </span>
        </div>
      </div> -->

      <!-- Filters Section -->
      <div class="control-section">
        <div class="section-toggle" style="cursor: default; margin-bottom: 7px">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-on-primary)">
              <FilterOutlined />
            </n-icon>
            <span class="section-toggle-label">Filters</span>
          </div>
        </div>
        <div class="section-content">
          <div class="control-item-full" @pointerup="emitLimit">
            <div class="slider-header">
              <div class="control-item-label">
                <span>Max tags</span>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon
                      size="12"
                      color="var(--text-secondary)"
                      class="info-icon"
                    >
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Maximum number of tags to display in the cloud
                </n-tooltip>
              </div>
              <span class="slider-value">{{
                localLimit.toLocaleString()
              }}</span>
            </div>
            <n-slider
              :value="getSliderIndex(localLimit)"
              @update:value="onLimitChange"
              :min="0"
              :max="4"
              :step="1"
              :marks="{
                0: '1k',
                1: '5k',
                2: '10k',
                3: '20k',
                4: '30k',
              }"
              class="tag-slider"
              @click.stop
            />
          </div>
          <div class="control-item-full" @pointerup="emitMinPhotoCount">
            <div class="slider-header">
              <div class="control-item-label">
                <span>Min. photos per tag</span>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon
                      size="12"
                      color="var(--text-secondary)"
                      class="info-icon"
                    >
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Only show tags that appear in at least this many photos
                </n-tooltip>
              </div>
              <span class="slider-value">{{ localMinPhotoCount }}</span>
            </div>
            <n-slider
              :value="getMinPhotoCountSliderIndex(localMinPhotoCount)"
              @update:value="onMinPhotoCountChange"
              :min="0"
              :max="3"
              :step="1"
              :marks="{ 0: '1', 1: '10', 2: '25', 3: '50+' }"
              class="tag-slider"
              @click.stop
            />
          </div>
        </div>
      </div>

      <!-- Display Section -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleDisplay">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-on-primary)">
              <EyeOutlined />
            </n-icon>
            <span class="section-toggle-label">Display</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: expandedSection === 'display' }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>
        <div
          class="expandable-content"
          :class="{ expanded: expandedSection === 'display' }"
        >
          <div class="section-content">
            <div class="control-item-row">
              <div class="control-item-label">
                <span>Show dots</span>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon
                      size="12"
                      color="var(--text-secondary)"
                      class="info-icon"
                    >
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Show a dot for each tag position in the cloud
                </n-tooltip>
              </div>
              <n-switch
                :value="showDots"
                @update:value="(v) => emit('update:showDots', v)"
                size="small"
                @click.stop
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Reset View -->
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { NIcon, NSwitch, NSlider, NTooltip } from "naive-ui";
import {
  SettingOutlined,
  CloseOutlined,
  InfoCircleFilled,
  FilterOutlined,
  EyeOutlined,
} from "@vicons/antd";

const props = defineProps({
  tagCount: {
    type: Number,
    default: 0,
  },
  totalCandidates: {
    type: Number,
    default: null,
  },
  minPhotoCount: {
    type: Number,
    default: 1,
  },
  limit: {
    type: Number,
    default: 8000,
  },
  showDots: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits([
  "update:minPhotoCount",
  "update:limit",
  "update:showDots",
  "reset-view",
  "filters-changed",
]);

const isExpanded = ref(true);
const expandedSection = ref(null);

const toggleDisplay = () => {
  expandedSection.value =
    expandedSection.value === "display" ? null : "display";
};

const LIMIT_VALUES = [1000, 5000, 10000, 20000, 30000];
const MIN_PHOTO_COUNT_VALUES = [1, 10, 25, 50];

const localMinPhotoCount = ref(props.minPhotoCount);
const localLimit = ref(props.limit);

watch(
  () => props.minPhotoCount,
  (v) => {
    localMinPhotoCount.value = v;
  },
);
watch(
  () => props.limit,
  (v) => {
    localLimit.value = v;
  },
);

const getSliderIndex = (value) => {
  return LIMIT_VALUES.indexOf(value);
};

const getMinPhotoCountSliderIndex = (value) => {
  return MIN_PHOTO_COUNT_VALUES.indexOf(value);
};

const onMinPhotoCountChange = (index) => {
  localMinPhotoCount.value = MIN_PHOTO_COUNT_VALUES[index];
};

const onLimitChange = (index) => {
  localLimit.value = LIMIT_VALUES[index];
};

const emitMinPhotoCount = () => {
  emit("update:minPhotoCount", localMinPhotoCount.value);
  emit("filters-changed");
};

const emitLimit = () => {
  emit("update:limit", localLimit.value);
  emit("filters-changed");
};
</script>

<style scoped>
.collapsed-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 5;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card, rgba(20, 20, 28, 0.78));
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  touch-action: manipulation;
}

.collapsed-panel:hover {
  background: rgba(255, 255, 255, 0.08);
}

.settings-icon {
  color: #e5e5e5;
  font-size: 18px;
}

.control-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 240px;
  max-height: calc(100vh - 32px);
  background: var(--bg-card, rgba(20, 20, 28, 0.78));
  border-radius: 12px;
  padding: 16px;
  z-index: 5;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.close-panel-btn-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-panel-btn-corner:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e5e5;
}

.control-section {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.control-section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.stats-row {
  font-size: 13px;
  color: #e5e7eb;
  text-align: right;
  padding-right: 24px;
}

.stats-sub {
  color: #9ca3af;
  margin-left: 4px;
}

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 4px 0;
  transition: opacity 0.2s;
  margin-bottom: 7px;
}

.section-toggle:hover {
  opacity: 0.8;
}

.section-toggle-label {
  color: #e5e5e5;
  font-size: 13px;
  font-weight: 600;
}

.toggle-icon {
  color: #888;
  transition: transform 0.2s;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.expandable-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
  opacity: 0;
}

.expandable-content.expanded {
  max-height: 1000px;
  opacity: 1;
  transition:
    max-height 0.3s ease-out,
    opacity 0.3s ease-out;
}

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
  color: var(--text-secondary, #9ca3af);
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
  color: var(--text-secondary, #9ca3af);
}

.tag-slider {
  --n-rail-color: rgba(255, 255, 255, 0.12);
  --n-rail-color-hover: rgba(255, 255, 255, 0.2);
  --n-fill-color: var(--primary-color, #3b82f6);
  --n-fill-color-hover: var(--primary-color-hover, #2563eb);
  --n-handle-color: var(--primary-color, #3b82f6);
  --n-dot-color: rgba(255, 255, 255, 0.25);
  --n-mark-font-size: 10px;
  --n-mark-color: #6b7280;
}

.reset-btn {
  width: 100%;
  color: white;
  background: var(--primary-color, #3b82f6);
  border: none;
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
}

.reset-btn:hover {
  background: var(--primary-color-hover, #2563eb);
  transform: translateY(-1px);
}

/* Scrollbar styling */
.control-panel::-webkit-scrollbar {
  width: 6px;
}

.control-panel::-webkit-scrollbar-track {
  background: transparent;
}

.control-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.control-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
