<template>
  <div v-if="hasTimelinePhotos" class="timeline-filter">
    <div class="timeline-header">
      <span class="timeline-date">{{ formatDate(activeTimestamp) }}</span>
      <span class="timeline-count">{{ activeDayCount }} this day</span>
    </div>

    <div class="timeline-histogram" :style="{ height: histogramHeight }">
      <div
        v-for="(bar, index) in histogramBars"
        :key="index"
        class="timeline-histogram-bar"
        :style="{
          height: `${bar.height}%`,
          left: `${bar.position}%`,
          width: `${bar.width}%`,
          opacity: isInActiveDay(bar.timestamp) ? 1 : 0.28,
        }"
        :title="`${bar.count} photos - ${formatDate(bar.timestamp)}`"
      />
    </div>

    <n-slider
      v-model:value="sliderIndex"
      :min="0"
      :max="maxIndex"
      :step="1"
      :marks="marks"
      :format-tooltip="formatTooltip"
      @update:value="handleSliderChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NSlider } from "naive-ui";

const props = withDefaults(
  defineProps<{
    photos: any[];
    modelValue: number | null;
    histogramHeight?: string;
    marksCount?: number;
  }>(),
  {
    histogramHeight: "40px",
    marksCount: 3,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number | null];
}>();

const sliderIndex = ref(0);

function getPhotoTimestamp(photo: any): number | null {
  const dateTaken = photo.descriptions?.EXIF?.dateTaken ?? photo.dateTaken;
  if (!dateTaken) return null;

  const timestamp = new Date(dateTaken).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

const timestampCounts = computed(() => {
  const counts = new Map<number, number>();
  props.photos.forEach((photo) => {
    const timestamp = getPhotoTimestamp(photo);
    if (timestamp === null) return;
    counts.set(timestamp, (counts.get(timestamp) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([timestamp, count]) => ({ timestamp, count }))
    .sort((a, b) => a.timestamp - b.timestamp);
});

const timelineTimestamps = computed(() =>
  timestampCounts.value.map((entry) => entry.timestamp),
);

const hasTimelinePhotos = computed(() => timelineTimestamps.value.length > 1);
const maxIndex = computed(() =>
  Math.max(0, timelineTimestamps.value.length - 1),
);
const activeTimestamp = computed(
  () =>
    timelineTimestamps.value[sliderIndex.value] ??
    timelineTimestamps.value[0] ??
    0,
);
const totalCount = computed(() =>
  timestampCounts.value.reduce((total, entry) => total + entry.count, 0),
);
const activeDayRange = computed(() =>
  getDayTimestampRange(activeTimestamp.value),
);
const activeDayCount = computed(() =>
  timestampCounts.value.reduce(
    (total, entry) =>
      total + (isInActiveDay(entry.timestamp) ? entry.count : 0),
    0,
  ),
);

const histogramBars = computed(() => {
  if (timestampCounts.value.length < 2) return [];

  const numBins = Math.min(40, timestampCounts.value.length);
  const minTimestamp = timelineTimestamps.value[0];
  const maxTimestamp =
    timelineTimestamps.value[timelineTimestamps.value.length - 1];
  const binSize = Math.max(1, (maxTimestamp - minTimestamp) / numBins);
  const bins = Array.from({ length: numBins }, (_, index) => ({
    count: 0,
    timestamp: minTimestamp + index * binSize + binSize / 2,
  }));

  timestampCounts.value.forEach((entry) => {
    const binIndex = Math.min(
      Math.floor((entry.timestamp - minTimestamp) / binSize),
      numBins - 1,
    );
    bins[binIndex].count += entry.count;
  });

  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  return bins.map((bin, index) => ({
    ...bin,
    height: (bin.count / maxCount) * 100,
    position: (index / numBins) * 100,
    width: (1 / numBins) * 100,
  }));
});

const marks = computed<Record<number, string>>(() => {
  if (!hasTimelinePhotos.value) return {};

  const indexes = new Set<number>([0, maxIndex.value]);
  const intermediateCount = Math.max(0, props.marksCount - 2);
  for (let i = 1; i <= intermediateCount; i++) {
    indexes.add(Math.round(maxIndex.value * (i / (intermediateCount + 1))));
  }

  return Array.from(indexes)
    .sort((a, b) => a - b)
    .reduce<Record<number, string>>((result, index) => {
      result[index] = formatDateCompact(timelineTimestamps.value[index]);
      return result;
    }, {});
});

function getNearestTimestampIndex(timestamp: number | null): number {
  if (timestamp === null || timelineTimestamps.value.length === 0) {
    return maxIndex.value;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  timelineTimestamps.value.forEach((entryTimestamp, index) => {
    const distance = Math.abs(entryTimestamp - timestamp);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function handleSliderChange(value: number) {
  const timestamp = timelineTimestamps.value[value] ?? null;
  emit("update:modelValue", timestamp);
}

function getDayTimestampRange(timestamp: number): [number, number] {
  const date = new Date(timestamp);
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  return [start, start + 24 * 60 * 60 * 1000 - 1];
}

function isInActiveDay(timestamp: number) {
  const [start, end] = activeDayRange.value;
  return timestamp >= start && timestamp <= end;
}

function formatTooltip(index: number) {
  return formatDate(timelineTimestamps.value[index] ?? activeTimestamp.value);
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateCompact(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

watch(
  [() => props.modelValue, timelineTimestamps],
  () => {
    sliderIndex.value = getNearestTimestampIndex(props.modelValue);

    if (props.modelValue === null || timelineTimestamps.value.length === 0) {
      return;
    }

    const firstTimestamp = timelineTimestamps.value[0];
    if (props.modelValue < firstTimestamp) {
      emit("update:modelValue", firstTimestamp);
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.timeline-filter {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 10px;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.timeline-date {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.timeline-count {
  color: var(--text-secondary);
  font-size: 11px;
}

.timeline-histogram {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
}

.timeline-histogram-bar {
  position: absolute;
  bottom: 0;
  border-radius: 2px 2px 0 0;
  background: var(--primary-color);
  transition:
    height 0.2s ease,
    opacity 0.2s ease;
}

:deep(.n-slider) {
  margin-top: 4px;
  margin-bottom: 8px;
  padding: 0;
}

:deep(.n-slider-mark) {
  color: var(--text-secondary);
  font-size: 10px;
  white-space: nowrap;
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
