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
              :max="3"
              :step="1"
              :marks="{
                0: '1k',
                1: '5k',
                2: '10k',
                3: '20k',
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
              :marks="{ 0: '1', 1: '5', 2: '10', 3: '20' }"
              class="tag-slider"
              @click.stop
            />
          </div>
          <!-- Tag finder -->
          <div class="control-item-full">
            <n-select
              :value="tagFinderValue"
              filterable
              clearable
              placeholder="Search a tag…"
              :options="tagFinderOptions"
              :filter="() => true"
              @search="onTagFinderSearch"
              @update:value="onTagFinderSelect"
              size="small"
              class="tag-finder-select"
              @click.stop
            >
              <template #empty>
                <div style="padding: 8px; color: #888; font-size: 12px">
                  No tags found
                </div>
              </template>
            </n-select>
          </div>
          <!-- Group filter -->
          <div v-if="availableGroups.length > 0" class="control-item-full">
            <div
              class="section-toggle group-filter-toggle"
              @click.stop="groupFilterExpanded = !groupFilterExpanded"
            >
              <div class="control-item-label">
                <span>Filter by group</span>
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon
                      size="12"
                      color="var(--text-secondary)"
                      class="info-icon"
                      @click.stop
                    >
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Show only tags from the selected groups. Leave all unselected
                  to show every group.
                </n-tooltip>
              </div>
              <div style="display: flex; align-items: center; gap: 6px">
                <span
                  v-if="localSelectedGroups.length > 0"
                  class="group-filter-clear-inline"
                  @click.stop="clearGroupFilter"
                  >Clear</span
                >
                <span
                  v-if="localSelectedGroups.length > 0 && !groupFilterExpanded"
                  class="active-indicator"
                  >{{ localSelectedGroups.length }}</span
                >
                <n-icon
                  size="12"
                  class="toggle-icon"
                  :class="{ rotated: groupFilterExpanded }"
                >
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
                    />
                  </svg>
                </n-icon>
              </div>
            </div>
            <div
              class="expandable-content"
              :class="{ expanded: groupFilterExpanded }"
            >
              <div class="group-filter-list">
                <div
                  v-for="group in availableGroups"
                  :key="group.key"
                  class="group-filter-option"
                  :class="{ active: localSelectedGroups.includes(group.key) }"
                  @click.stop="toggleGroup(group.key)"
                >
                  <span
                    class="group-color-dot"
                    :style="{ background: hexToCSS(group.color) }"
                  ></span>
                  <span class="group-option-label">{{ group.label }}</span>
                  <span class="group-option-count">{{ group.count }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="control-item-row">
            <div class="control-item-label">
              <span>Dynamic search</span>
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
                Search photos using all tag labels currently visible in the
                viewport
              </n-tooltip>
            </div>
            <n-switch
              :value="dynamicSearch"
              @update:value="(v) => emit('update:dynamicSearch', v)"
              size="small"
              @click.stop
            />
          </div>

          <!-- 
          <div
            v-if="false"
            class="control-item-full"
            @pointerup="emitMaxSearchTags"
          >
            <div class="slider-header">
              <div class="control-item-label">
                <span>Max search tags</span>
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
                  Limit how many visible tags are used for dynamic search. When
                  there are more, the most prominent tags are kept first.
                </n-tooltip>
              </div>
              <span class="slider-value">{{ localMaxSearchTags }}</span>
            </div>
            <n-slider
              :value="getMaxSearchTagsSliderIndex(localMaxSearchTags)"
              @update:value="onMaxSearchTagsChange"
              :min="0"
              :max="4"
              :step="1"
              :marks="{ 0: '5', 1: '10', 2: '20', 3: '35', 4: '50' }"
              class="tag-slider"
              @click.stop
            />
          </div> -->
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

            <!-- Balloon expansion slider -->
            <div class="control-item-full">
              <div class="slider-header">
                <div class="control-item-label">
                  <span>Balloon expansion</span>
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
                    Inflates the layout around its center
                  </n-tooltip>
                </div>
                <span class="slider-value">
                  {{ Math.round(balloonExpansion * 100) }}%
                </span>
              </div>
              <n-slider
                :value="balloonExpansion"
                @update:value="(v) => emit('update:balloonExpansion', v)"
                :min="0"
                :max="0.5"
                :step="0.02"
                @click.stop
                class="tag-slider"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Controls Section -->
      <div class="control-section">
        <div class="section-toggle" @click="toggleNavigationControls">
          <div style="display: flex; align-items: center; gap: 6px">
            <n-icon size="16" color="var(--text-on-primary)">
              <CompassOutlined />
            </n-icon>
            <span class="section-toggle-label">Navigation Controls</span>
          </div>
          <n-icon
            size="12"
            class="toggle-icon"
            :class="{ rotated: showNavigationControls }"
          >
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
              />
            </svg>
          </n-icon>
        </div>

        <div v-if="showNavigationControls" class="controls-info">
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">Wheel</div>
              </div>
              <span class="control-text">Mouse wheel to zoom in/out</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">Drag</div>
              </div>
              <span class="control-text">Click &amp; drag to pan the view</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">W</div>
                <div class="keyboard-key">A</div>
                <div class="keyboard-key">S</div>
                <div class="keyboard-key">D</div>
              </div>
              <span class="control-text">Pan the view</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">↑</div>
                <div class="keyboard-key">↓</div>
                <div class="keyboard-key">←</div>
                <div class="keyboard-key">→</div>
              </div>
              <span class="control-text">Pan with arrow keys</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">Click</div>
              </div>
              <span class="control-text">Click on a tag to search photos</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">Ctrl</div>
                <div class="keyboard-key">Select</div>
              </div>
              <span class="control-text">To choose multiple tags</span>
            </div>
          </div>
          <div class="control-tip">
            <div class="control-icon-group">
              <div class="keyboard-keys-group">
                <div class="keyboard-key">Pinch</div>
              </div>
              <span class="control-text"
                >Two-finger pinch to zoom (tablet)</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { NIcon, NSwitch, NSlider, NTooltip, NSelect } from "naive-ui";
import {
  SettingOutlined,
  CloseOutlined,
  InfoCircleFilled,
  FilterOutlined,
  EyeOutlined,
  CompassOutlined,
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
    default: 10000,
  },
  showDots: {
    type: Boolean,
    default: true,
  },
  dynamicSearch: {
    type: Boolean,
    default: false,
  },
  maxSearchTags: {
    type: Number,
    default: 10,
  },
  balloonExpansion: {
    type: Number,
    default: 0.2,
  },
  selectedGroups: {
    type: Array,
    default: () => [],
  },
  availableGroups: {
    type: Array, // [{ key, label, color (number), count }]
    default: () => [],
  },
  availableTags: {
    type: Array, // [{ id, name, group, photoCount, ... }] — tags currently rendered in PIXI
    default: () => [],
  },
});

const emit = defineEmits([
  "update:minPhotoCount",
  "update:limit",
  "update:showDots",
  "update:dynamicSearch",
  "update:maxSearchTags",
  "update:balloonExpansion",
  "update:selectedGroups",
  "reset-view",
  "filters-changed",
  "fly-to-tag",
]);

const isExpanded = ref(true);
const expandedSection = ref(null);
const showNavigationControls = ref(false);
const groupFilterExpanded = ref(false);

const toggleDisplay = () => {
  expandedSection.value =
    expandedSection.value === "display" ? null : "display";
};

const toggleNavigationControls = () => {
  showNavigationControls.value = !showNavigationControls.value;
};

const LIMIT_VALUES = [1000, 5000, 10000, 20000];
const MIN_PHOTO_COUNT_VALUES = [1, 5, 10, 50];
const MAX_SEARCH_TAG_VALUES = [5, 10, 20, 35, 50];
const TAG_LIMIT_STORAGE_KEY = "photoreka:tagCloud:limit";

const isValidTagLimit = (value) => LIMIT_VALUES.includes(value);

const readStoredTagLimit = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TAG_LIMIT_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return isValidTagLimit(parsed) ? parsed : null;
};

const writeStoredTagLimit = (value) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TAG_LIMIT_STORAGE_KEY, String(value));
};

const localMinPhotoCount = ref(props.minPhotoCount);
const localLimit = ref(readStoredTagLimit() ?? props.limit);
const localMaxSearchTags = ref(props.maxSearchTags);

onMounted(() => {
  const persisted = readStoredTagLimit();
  if (persisted !== null && persisted !== props.limit) {
    localLimit.value = persisted;
    emit("update:limit", persisted);
    emit("filters-changed");
  }
});

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
watch(
  () => props.maxSearchTags,
  (v) => {
    localMaxSearchTags.value = v;
  },
);

const getSliderIndex = (value) => {
  return LIMIT_VALUES.indexOf(value);
};

const getMinPhotoCountSliderIndex = (value) => {
  return MIN_PHOTO_COUNT_VALUES.indexOf(value);
};

const getMaxSearchTagsSliderIndex = (value) => {
  return MAX_SEARCH_TAG_VALUES.indexOf(value);
};

const onMinPhotoCountChange = (index) => {
  localMinPhotoCount.value = MIN_PHOTO_COUNT_VALUES[index];
};

const onLimitChange = (index) => {
  localLimit.value = LIMIT_VALUES[index];
  writeStoredTagLimit(localLimit.value);
};

const onMaxSearchTagsChange = (index) => {
  localMaxSearchTags.value = MAX_SEARCH_TAG_VALUES[index];
};

const emitMinPhotoCount = () => {
  emit("update:minPhotoCount", localMinPhotoCount.value);
  emit("filters-changed");
};

const emitLimit = () => {
  emit("update:limit", localLimit.value);
  emit("filters-changed");
};

const emitMaxSearchTags = () => {
  emit("update:maxSearchTags", localMaxSearchTags.value);
};

// ---------------------------------------------------------------------------
// Group filter
// ---------------------------------------------------------------------------
const localSelectedGroups = ref([...props.selectedGroups]);

watch(
  () => props.selectedGroups,
  (v) => {
    localSelectedGroups.value = [...v];
  },
  { deep: true },
);

// ---------------------------------------------------------------------------
// Tag finder
// ---------------------------------------------------------------------------
const tagFinderQuery = ref("");
const tagFinderValue = ref(null);

const tagFinderOptions = computed(() => {
  const q = tagFinderQuery.value.trim().toLowerCase();
  if (!q) return [];
  return props.availableTags
    .filter((t) => t.name?.toLowerCase().includes(q))
    .slice(0, 100)
    .map((t) => ({
      label: t.name,
      value: t.id,
    }));
});

const onTagFinderSearch = (q) => {
  tagFinderQuery.value = q;
};

const onTagFinderSelect = (id) => {
  if (id == null) return;
  emit("fly-to-tag", id);
  // Reset so the same tag can be re-selected
  tagFinderValue.value = null;
  tagFinderQuery.value = "";
};

const hexToCSS = (hex) => "#" + hex.toString(16).padStart(6, "0");

const toggleGroup = (key) => {
  const idx = localSelectedGroups.value.indexOf(key);
  if (idx >= 0) {
    localSelectedGroups.value.splice(idx, 1);
  } else {
    localSelectedGroups.value.push(key);
  }
  emit("update:selectedGroups", [...localSelectedGroups.value]);
};

const clearGroupFilter = () => {
  localSelectedGroups.value = [];
  emit("update:selectedGroups", []);
};
</script>

<style scoped>
.collapsed-panel {
  --collapsed-panel-top: calc(var(--total-header-offset, 48px) - 17px);
  --collapsed-panel-right: 15px;
  --collapsed-panel-z-index: 5;
  --collapsed-panel-background: var(--bg-card, rgba(20, 20, 28, 0.78));
  --collapsed-panel-backdrop: blur(8px);
  --collapsed-panel-background-hover: rgba(255, 255, 255, 0.08);
  --collapsed-panel-hover-transform: none;
  --collapsed-panel-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  --collapsed-panel-shadow-hover: 0 4px 20px rgba(0, 0, 0, 0.5);
  --collapsed-panel-icon-color: #e5e5e5;
  /* --collapsed-panel-icon-size: 18px; */
}

.control-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 300px;
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

.controls-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  padding: 12px;
  margin-top: 12px;
  animation: slideDown 0.3s ease-out;
}

.control-tip {
  margin: 8px 0;
  color: var(--text-secondary, #a0aec0);
  font-size: 12px;
  line-height: 1.4;
}

.control-tip:last-child {
  margin-bottom: 0;
}

.control-icon-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-text {
  color: var(--text-secondary, #a0aec0);
  font-size: 12px;
  line-height: 1.3;
}

.keyboard-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 2px 5px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.12),
    rgba(255, 255, 255, 0.04)
  );
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  color: var(--text-primary, #ffffff);
  font-size: 10px;
  font-weight: 600;
  font-family: "Segoe UI", system-ui, sans-serif;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.15),
    inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
  text-shadow: 0 0.5px 0.5px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.keyboard-keys-group {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}

/* Group filter */
.group-filter-toggle {
  margin-bottom: 0;
  padding: 4px 0;
}

.group-filter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
  padding-top: 2px;
}

.group-filter-list::-webkit-scrollbar {
  width: 4px;
}

.group-filter-list::-webkit-scrollbar-track {
  background: transparent;
}

.group-filter-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.group-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s;
  user-select: none;
}

.group-filter-option:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.group-filter-option.active {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.group-filter-option.active:hover {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 50%, transparent);
}

.group-color-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group-option-label {
  flex: 1;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-option-count {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 22px;
  text-align: right;
  flex-shrink: 0;
}

.tag-finder-select {
  --n-color: rgba(255, 255, 255, 0.04);
  --n-color-active: rgba(255, 255, 255, 0.08);
  --n-border: 1px solid rgba(255, 255, 255, 0.12);
  --n-border-active: 1px solid rgba(255, 255, 255, 0.25);
  --n-border-focus: 1px solid var(--primary-color, #3b82f6);
  --n-text-color: #e5e7eb;
  --n-placeholder-color: #6b7280;
  font-size: 12px;
}

.group-filter-clear-inline {
  font-size: 11px;
  color: var(--primary-color, #3b82f6);
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s;
}

.group-filter-clear-inline:hover {
  opacity: 1;
}

.active-indicator {
  background: var(--primary-color, #3b82f6);
  color: var(--text-on-primary, #fff);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
