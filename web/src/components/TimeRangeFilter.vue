<template>
  <div v-if="hasValidPhotos" class="time-range-filter" ref="containerRef">
    <div class="filter-header">
      <span v-if="showTitle" class="filter-label">Time Range</span>
      <div class="filter-header-right">
        <span v-if="hasActiveFilter" class="date-display">
          {{ formatDate(dateRange[0]) }} - {{ formatDate(dateRange[1]) }}
        </span>
        <span
          v-if="hasActiveFilter"
          class="clear-filter-btn"
          @click="clearFilter"
          >✕</span
        >
      </div>
    </div>

    <!-- Histogram visualization -->
    <div
      class="histogram-container"
      ref="histogramRef"
      :style="{ height: histogramHeight }"
    >
      <div
        v-for="(bar, index) in histogramBars"
        :key="index"
        class="histogram-bar"
        :style="{
          height: `${bar.height}%`,
          left: `${bar.position}%`,
          width: `${bar.width}%`,
          opacity: isInRange(bar.timestamp) ? 1 : 0.3,
        }"
        :title="`${bar.count} photos - ${formatDate(bar.timestamp)}`"
      />
    </div>

    <!-- Slider -->
    <n-slider
      :value="dateRange"
      range
      :min="minTimestamp"
      :max="maxTimestamp"
      :step="sliderStep"
      :marks="marks"
      :format-tooltip="formatTooltip"
      @update:value="onSliderUpdate"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { NSlider, NButton } from "naive-ui";

const props = defineProps({
  photos: {
    type: Array,
    default: () => [],
  },
  showTitle: {
    type: Boolean,
    default: true,
  },
  histogramHeight: {
    type: String,
    default: "60px",
  },
  currentTimeRange: {
    type: [Array, Object],
    default: null,
  },
  marksCount: {
    type: Number,
    default: 3,
  },
});

const emit = defineEmits(["time-range-change"]);

const internalDateRange = ref(null);
const histogramRef = ref(null);
const containerRef = ref(null);
const isSmallScreen = ref(false);

// Valid timestamps: only photos with a truthy dateTaken that parses correctly
const validTimestamps = computed(() => {
  if (!props.photos || !props.photos.length) return [];
  return props.photos
    .map((p) => (p.captureMs == null ? NaN : p.captureMs))
    .filter((t) => !isNaN(t) && t > 0);
});

// Calculate min and max timestamps from photos
const minTimestamp = computed(() => {
  return validTimestamps.value.length ? Math.min(...validTimestamps.value) : 0;
});

const maxTimestamp = computed(() => {
  return validTimestamps.value.length
    ? Math.max(...validTimestamps.value)
    : Date.now();
});

// Date range for the slider - always returns a valid array
const dateRange = computed(() => {
  if (internalDateRange.value === null) {
    return [minTimestamp.value, maxTimestamp.value];
  }
  return internalDateRange.value;
});

// Calculate step based on time range (1 day in milliseconds)
const sliderStep = computed(() => {
  const range = maxTimestamp.value - minTimestamp.value;
  // If range is less than 30 days, use 1 hour steps, otherwise use 1 day steps
  return range < 30 * 24 * 60 * 60 * 1000
    ? 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
});

// Create histogram data
const histogramBars = computed(() => {
  if (
    !props.photos ||
    !props.photos.length ||
    minTimestamp.value === maxTimestamp.value
  )
    return [];

  // Create bins for the histogram (50 bins)
  const numBins = 50;
  const binSize = (maxTimestamp.value - minTimestamp.value) / numBins;
  const bins = Array(numBins)
    .fill(0)
    .map((_, i) => ({
      start: minTimestamp.value + i * binSize,
      end: minTimestamp.value + (i + 1) * binSize,
      count: 0,
      timestamp: minTimestamp.value + i * binSize + binSize / 2,
    }));

  // Count photos in each bin
  props.photos.forEach((photo) => {
    const timestamp = photo.captureMs;
    if (timestamp != null && timestamp > 0) {
      const binIndex = Math.min(
        Math.floor((timestamp - minTimestamp.value) / binSize),
        numBins - 1,
      );
      if (binIndex >= 0) {
        bins[binIndex].count++;
      }
    }
  });

  // Find max count for normalization
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  // Create bars with positions and heights
  return bins.map((bin, index) => ({
    count: bin.count,
    timestamp: bin.timestamp,
    height: (bin.count / maxCount) * 100,
    position: (index / numBins) * 100,
    width: (1 / numBins) * 100,
  }));
});

// Check if a timestamp is within the selected range
const isInRange = (timestamp) => {
  if (internalDateRange.value === null) return true;
  return timestamp >= dateRange.value[0] && timestamp <= dateRange.value[1];
};

// Create marks for the slider - adaptive based on screen size
const marks = computed(() => {
  if (minTimestamp.value === maxTimestamp.value) return {};

  const range = maxTimestamp.value - minTimestamp.value;
  const marksToShow = isSmallScreen.value
    ? Math.min(props.marksCount, 3)
    : props.marksCount;
  const marksObject = {};

  // Always include start and end
  marksObject[minTimestamp.value] = formatDateCompact(minTimestamp.value);

  // Add evenly spaced intermediate marks
  const intermediateCount = marksToShow - 2;
  for (let i = 1; i <= intermediateCount; i++) {
    const t = minTimestamp.value + range * (i / (intermediateCount + 1));
    marksObject[t] = formatDateCompact(t);
  }

  marksObject[maxTimestamp.value] = formatDateCompact(maxTimestamp.value);

  return marksObject;
});

// Los timestamps ya vienen en el marco reloj-de-pared-UTC (parseCaptureMs), asi que se
// formatean en UTC: el eje, las marcas y el rango muestran el mismo dia que el back agrupa
// y que el dialogo de la foto, sin que la zona del navegador los desplace.

// Format date for display (full format)
const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Format date for slider marks (compact format)
const formatDateCompact = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const isSameYear = date.getUTCFullYear() === now.getUTCFullYear();

  if (isSameYear) {
    // If same year, omit year for compactness
    return date.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
  });
};

// Format tooltip for slider
const formatTooltip = (value) => {
  return formatDate(value);
};

// Handle range change with debounce (300ms)
const emitRangeChange = (value) => {
  // Check if the range is the full range (no filter applied)
  if (value[0] === minTimestamp.value && value[1] === maxTimestamp.value) {
    emit("time-range-change", null);
  } else {
    emit("time-range-change", value);
  }
};

const handleRangeChange = useDebounceFn((value) => {
  emitRangeChange(value);
}, 300);

// Minimum distance kept between both handles so they never overlap exactly
// (overlapping handles become impossible to separate again)
const minGap = computed(() =>
  Math.min(sliderStep.value, maxTimestamp.value - minTimestamp.value),
);

// naive-ui emits the raw pair without sorting it, so dragging one handle past
// the other yields an inverted range. Stop the dragged handle at the other one
// instead of letting them cross.
const clampNoCross = ([low, high]) => {
  if (high - low >= minGap.value) return [low, high];

  const [prevLow] = dateRange.value;
  // The handle that changed is the one being dragged; the other one stays put
  if (low !== prevLow) {
    return [Math.max(minTimestamp.value, high - minGap.value), high];
  }
  return [low, Math.min(maxTimestamp.value, low + minGap.value)];
};

const onSliderUpdate = (value) => {
  const clamped = clampNoCross(value);
  internalDateRange.value = clamped;
  handleRangeChange(clamped);
};

// Clear filter
const clearFilter = () => {
  internalDateRange.value = null;
  emit("time-range-change", null);
};

defineExpose({ clearFilter });

// Check if filter is active
const hasActiveFilter = computed(() => {
  return internalDateRange.value !== null;
});

// Check if there are valid photos with dates
const hasValidPhotos = computed(() => {
  if (!props.photos || !props.photos.length) return false;

  // Check if at least one photo has a valid date
  const hasValidDates = validTimestamps.value.length > 0;

  return hasValidDates && minTimestamp.value < maxTimestamp.value;
});

// Initialize date range when photos change
watch(
  () => props.photos?.length || 0,
  () => {
    // Reset the internal filter when photos change
    internalDateRange.value = null;
  },
  { immediate: true },
);

// Reset internal state when external filter is cleared
watch(
  () => props.currentTimeRange,
  (newVal) => {
    if (newVal === null) {
      internalDateRange.value = null;
    }
  },
);

// Detect container size for responsive marks
const checkScreenSize = () => {
  if (containerRef.value) {
    const width = containerRef.value.offsetWidth;
    // Ignore zero/tiny widths (container hidden or mid-animation)
    if (width > 50) {
      isSmallScreen.value = width < 250;
    }
  }
};

onMounted(() => {
  checkScreenSize();
  window.addEventListener("resize", checkScreenSize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", checkScreenSize);
});
</script>

<style scoped>
.time-range-filter {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-filter-btn {
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.7;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
  transition:
    opacity 0.2s,
    color 0.2s;
}

.clear-filter-btn:hover {
  opacity: 1;
  color: var(--text-primary);
}

.filter-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.date-display {
  font-size: 12px;
  color: var(--text-primary);
}

.histogram-container {
  position: relative;
  height: 30px;
  width: 100%;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  padding: 4px;
}

.histogram-bar {
  position: absolute;
  bottom: 4px;
  background: var(--primary-color);
  transition:
    opacity 0.3s ease,
    height 0.3s ease;
  border-radius: 2px;
  cursor: pointer;
}

.histogram-bar:hover {
  opacity: 1 !important;
  filter: brightness(1.2);
}

.clear-btn {
  align-self: flex-start;
  margin-top: 4px;
}

:deep(.n-slider) {
  margin-top: 8px;
  margin-bottom: 8px;
  padding: 0;
}

:deep(.n-slider-rail) {
  margin-left: 0;
  margin-right: 0;
}

:deep(.n-slider-marks) {
  font-size: 10px;
  padding: 0;
}

:deep(.n-slider-mark) {
  white-space: nowrap;
  font-size: 10px;
  color: var(--text-secondary);
}

:deep(.n-slider-mark:first-child) {
  transform: translateX(0) !important;
  text-align: left;
}

:deep(.n-slider-mark:last-child) {
  transform: translateX(-100%) !important;
  text-align: right;
}
</style>
