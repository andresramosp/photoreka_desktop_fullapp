<template>
  <div v-if="hasValidPhotos" class="time-range-filter">
    <div class="filter-header">
      <span class="filter-label">Time Range</span>
      <span v-if="hasActiveFilter" class="date-display">
        {{ formatDate(dateRange[0]) }} - {{ formatDate(dateRange[1]) }}
      </span>
    </div>

    <!-- Histogram visualization -->
    <div class="histogram-container" ref="histogramRef">
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
      v-model:value="dateRange"
      range
      :min="minTimestamp"
      :max="maxTimestamp"
      :step="sliderStep"
      :marks="marks"
      :format-tooltip="formatTooltip"
      @update:value="handleRangeChange"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NSlider, NButton } from "naive-ui";

const props = defineProps({
  photos: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["time-range-change"]);

const internalDateRange = ref(null);
const histogramRef = ref(null);

// Calculate min and max timestamps from photos
const minTimestamp = computed(() => {
  if (!props.photos || !props.photos.length) return 0;

  const dates = props.photos
    .map((p) => new Date(p.descriptions?.EXIF?.dateTaken).getTime())
    .filter((t) => !isNaN(t));

  return dates.length ? Math.min(...dates) : 0;
});

const maxTimestamp = computed(() => {
  if (!props.photos || !props.photos.length) return Date.now();

  const dates = props.photos
    .map((p) => new Date(p.descriptions?.EXIF?.dateTaken).getTime())
    .filter((t) => !isNaN(t));

  return dates.length ? Math.max(...dates) : Date.now();
});

// Date range for the slider - always returns a valid array
const dateRange = computed({
  get() {
    if (internalDateRange.value === null) {
      return [minTimestamp.value, maxTimestamp.value];
    }
    return internalDateRange.value;
  },
  set(value) {
    internalDateRange.value = value;
  },
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
    const timestamp = new Date(photo.descriptions?.EXIF?.dateTaken).getTime();
    if (!isNaN(timestamp)) {
      const binIndex = Math.min(
        Math.floor((timestamp - minTimestamp.value) / binSize),
        numBins - 1
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

// Create marks for the slider (show start, intermediate, middle, intermediate, and end dates)
const marks = computed(() => {
  if (minTimestamp.value === maxTimestamp.value) return {};

  const range = maxTimestamp.value - minTimestamp.value;
  const quarter1 = minTimestamp.value + range * 0.25;
  const mid = minTimestamp.value + range * 0.5;
  const quarter3 = minTimestamp.value + range * 0.75;

  return {
    [minTimestamp.value]: formatDate(minTimestamp.value),
    [quarter1]: formatDate(quarter1),
    [mid]: formatDate(mid),
    [quarter3]: formatDate(quarter3),
    [maxTimestamp.value]: formatDate(maxTimestamp.value),
  };
});

// Format date for display
const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Format tooltip for slider
const formatTooltip = (value) => {
  return formatDate(value);
};

// Handle range change
const handleRangeChange = (value) => {
  // Check if the range is the full range (no filter applied)
  if (value[0] === minTimestamp.value && value[1] === maxTimestamp.value) {
    emit("time-range-change", null);
  } else {
    emit("time-range-change", value);
  }
};

// Clear filter
const clearFilter = () => {
  internalDateRange.value = null;
  emit("time-range-change", null);
};

// Check if filter is active
const hasActiveFilter = computed(() => {
  return internalDateRange.value !== null;
});

// Check if there are valid photos with dates
const hasValidPhotos = computed(() => {
  if (!props.photos || !props.photos.length) return false;

  // Check if at least one photo has a valid date
  const hasValidDates = props.photos.some((photo) => {
    const timestamp = new Date(photo.descriptions?.EXIF?.dateTaken).getTime();
    return !isNaN(timestamp);
  });

  return hasValidDates && minTimestamp.value < maxTimestamp.value;
});

// Initialize date range when photos change
watch(
  () => props.photos?.length || 0,
  () => {
    // Reset the internal filter when photos change
    internalDateRange.value = null;
  },
  { immediate: true }
);
</script>

<style scoped>
.time-range-filter {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-label {
  font-size: 13px;
  font-weight: 500;
  color: #ffffffd1;
}

.date-display {
  font-size: 12px;
  color: #ffffff73;
}

.histogram-container {
  position: relative;
  height: 60px;
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
  transition: opacity 0.3s ease, height 0.3s ease;
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
  padding: 0 8px;
}

:deep(.n-slider-marks) {
  font-size: 11px;
}

:deep(.n-slider-mark) {
  white-space: nowrap;
}

:deep(.n-slider-mark:first-child) {
  transform: translateX(0) !important;
}

:deep(.n-slider-mark:last-child) {
  transform: translateX(-100%) !important;
}
</style>
