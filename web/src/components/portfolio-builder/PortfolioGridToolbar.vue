<template>
  <div class="grid-toolbar">
    <div class="toolbar-left">
      <n-button size="small" type="primary" ghost @click="$emit('add-photos')">
        <template #icon>
          <n-icon><AddOutline /></n-icon>
        </template>
        More Photos
      </n-button>
      <n-button
        v-if="!isManualBuild"
        size="small"
        ghost
        @click="$emit('build-variant')"
      >
        <template #icon>
          <n-icon><GitBranchOutline /></n-icon>
        </template>
        Build Variant
      </n-button>
    </div>

    <div class="toolbar-right">
      <template v-if="removedCount > 0">
        <n-button size="small" quaternary @click="$emit('undo-last')">
          <template #icon>
            <n-icon><ArrowUndoOutline /></n-icon>
          </template>
          Undo
        </n-button>
        <n-button size="small" quaternary @click="$emit('restore-all')">
          Restore all ({{ removedCount }})
        </n-button>
        <span class="toolbar-separator" />
      </template>

      <n-checkbox
        :checked="fillAvailableSpace"
        @update:checked="$emit('update:fill-available-space', $event)"
      >
        Fill space
      </n-checkbox>
      <span class="toolbar-label">Gap</span>
      <n-slider
        :value="gap"
        :min="0"
        :max="60"
        :step="1"
        :tooltip="true"
        :format-tooltip="(v) => `${v}px`"
        style="width: 90px"
        @update:value="$emit('update:gap', $event)"
      />
      <span class="toolbar-separator" />

      <span class="toolbar-label">Grid</span>
      <n-button-group>
        <n-button
          v-for="opt in columnOptions"
          :key="opt"
          :type="columns === opt ? 'primary' : 'default'"
          size="small"
          @click="$emit('update:columns', opt)"
        >
          {{ opt }}
        </n-button>
      </n-button-group>

      <n-button
        size="small"
        :type="allSelected ? 'primary' : 'default'"
        @click="handleSelectAllToggle"
        class="select-all-btn"
      >
        <template #icon>
          <n-icon>
            <SelectAllOn24Regular />
          </n-icon>
        </template>
        <span>{{ allSelected ? "Deselect All" : "Select All" }}</span>
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NButtonGroup, NSlider, NButton, NCheckbox, NIcon } from "naive-ui";
import {
  ArrowUndoOutline,
  AddOutline,
  GitBranchOutline,
} from "@vicons/ionicons5";
import { SelectAllOn24Regular } from "@vicons/fluent";

const props = defineProps({
  columns: { type: Number, required: true },
  gap: { type: Number, default: 3 },
  fillAvailableSpace: { type: Boolean, default: true },
  photoCount: { type: Number, required: true },
  removedCount: { type: Number, default: 0 },
  photos: { type: Array, default: () => [] },
  selectedIds: { type: Array, default: () => [] },
  isManualBuild: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:columns",
  "update:gap",
  "update:fill-available-space",
  "undo-last",
  "restore-all",
  "add-photos",
  "build-variant",
  "select-all",
  "deselect-all",
]);

const columnOptions = computed(() => {
  const opts = [];
  for (let c = 1; c <= 6; c++) {
    opts.push(c);
  }
  return opts;
});

const selectedIdsSet = computed(() => new Set(props.selectedIds));

const allSelected = computed(() => {
  return (
    props.photos.length > 0 &&
    props.photos.every((photo) => selectedIdsSet.value.has(photo.id))
  );
});

const handleSelectAllToggle = () => {
  if (allSelected.value) {
    // Deselect all
    emit("deselect-all");
  } else {
    // Select all
    emit("select-all");
  }
};
</script>

<style scoped>
.grid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  margin-bottom: 8px;
  /* border-bottom: 1px solid var(--border-color); */
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.toolbar-separator {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 4px;
}

.select-all-btn {
  white-space: nowrap;
}

.select-all-btn span {
  font-size: 13px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
