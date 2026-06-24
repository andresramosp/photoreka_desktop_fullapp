<template>
  <div class="metadata-filters-panel">
    <!-- Filename search -->
    <div class="filter-wrapper">
      <label class="filter-label">File name</label>
      <n-input
        :value="filenameSearch"
        placeholder="Filename..."
        clearable
        size="small"
        class="filename-input"
        @update:value="$emit('update:filenameSearch', $event)"
      >
        <template #prefix>
          <n-icon size="14">
            <Search20Regular />
          </n-icon>
        </template>
      </n-input>
    </div>

    <!-- File Type -->
    <div class="filter-wrapper">
      <label class="filter-label">File type</label>
      <n-select
        :value="modelValue.fileType"
        multiple
        placeholder="All types..."
        :options="options.fileType"
        :disabled="options.fileType.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="2"
        class="compact-select"
        @update:value="update('fileType', $event)"
      />
    </div>

    <!-- Camera -->
    <div class="filter-wrapper">
      <label class="filter-label">Camera</label>
      <n-select
        :value="modelValue.camera"
        multiple
        placeholder="All cameras..."
        :options="options.camera"
        :disabled="options.camera.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="1"
        class="compact-select"
        @update:value="update('camera', $event)"
      />
    </div>

    <!-- ISO -->
    <div class="filter-wrapper">
      <label class="filter-label">ISO</label>
      <n-select
        :value="modelValue.iso"
        multiple
        placeholder="All ISO..."
        :options="options.iso"
        :disabled="options.iso.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="2"
        class="compact-select"
        @update:value="update('iso', $event)"
      />
    </div>

    <!-- Aperture -->
    <div class="filter-wrapper">
      <label class="filter-label">Aperture</label>
      <n-select
        :value="modelValue.aperture"
        multiple
        placeholder="All f-stops..."
        :options="options.aperture"
        :disabled="options.aperture.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="2"
        class="compact-select"
        @update:value="update('aperture', $event)"
      />
    </div>

    <!-- Focal length -->
    <div class="filter-wrapper">
      <label class="filter-label">Focal length</label>
      <n-select
        :value="modelValue.focalLength"
        multiple
        placeholder="All focal..."
        :options="options.focalLength"
        :disabled="options.focalLength.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="2"
        class="compact-select"
        @update:value="update('focalLength', $event)"
      />
    </div>

    <!-- Exposure time -->
    <div class="filter-wrapper">
      <label class="filter-label">Exposure</label>
      <n-select
        :value="modelValue.exposureTime"
        multiple
        placeholder="All speeds..."
        :options="options.exposureTime"
        :disabled="options.exposureTime.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="2"
        class="compact-select"
        @update:value="update('exposureTime', $event)"
      />
    </div>

    <!-- Flash -->
    <div class="filter-wrapper">
      <label class="filter-label">Flash</label>
      <n-select
        :value="modelValue.flash"
        multiple
        placeholder="All states..."
        :options="options.flash"
        :disabled="options.flash.length === 0"
        size="small"
        clearable
        class="compact-select"
        @update:value="update('flash', $event)"
      />
    </div>

    <!-- White balance -->
    <!-- <div class="filter-wrapper">
      <label class="filter-label">White balance</label>
      <n-select
        :value="modelValue.whiteBalance"
        multiple
        placeholder="All WB..."
        :options="options.whiteBalance"
        :disabled="options.whiteBalance.length === 0"
        size="small"
        clearable
        filterable
        :max-tag-count="2"
        class="compact-select"
        @update:value="update('whiteBalance', $event)"
      />
    </div> -->
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NInput, NSelect, NIcon } from "naive-ui";
import { Search20Regular } from "@vicons/fluent";
import { buildMetadataOptions } from "@/utils/metadataFilters.js";

const props = defineProps({
  photos: {
    type: Array,
    default: () => [],
  },
  // Selected metadata filters (object of arrays keyed by category).
  modelValue: {
    type: Object,
    required: true,
  },
  filenameSearch: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "update:filenameSearch"]);

// Build dynamic options from the photos actually present.
const options = computed(() => buildMetadataOptions(props.photos));

const update = (key, value) => {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
};
</script>

<style scoped>
.metadata-filters-panel {
  display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  align-items: end;
}

.filter-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.compact-select,
.filename-input {
  width: 100%;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

@media (max-width: 767px) {
  .metadata-filters-panel {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
