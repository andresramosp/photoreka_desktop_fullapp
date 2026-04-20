<template>
  <div class="grid-toolbar">
    <div class="toolbar-left">
      <span class="toolbar-label">Grid</span>
      <n-select
        :value="columns"
        :options="columnOptions"
        size="small"
        style="width: 110px"
        @update:value="$emit('update:columns', $event)"
      />

      <span class="toolbar-separator" />

      <span class="toolbar-label">Gap</span>
      <n-slider
        :value="gap"
        :min="0"
        :max="40"
        :step="1"
        :tooltip="true"
        :format-tooltip="(v) => `${v}px`"
        style="width: 90px"
        @update:value="$emit('update:gap', $event)"
      />
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
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NSelect, NSlider, NButton, NIcon } from "naive-ui";
import { ArrowUndoOutline } from "@vicons/ionicons5";

const props = defineProps({
  columns: { type: Number, required: true },
  gap: { type: Number, default: 3 },
  photoCount: { type: Number, required: true },
  removedCount: { type: Number, default: 0 },
});

defineEmits(["update:columns", "update:gap", "undo-last", "restore-all"]);

const columnOptions = computed(() => {
  const opts = [];
  for (let c = 3; c <= 7; c++) {
    const rows = Math.ceil(props.photoCount / c);
    opts.push({
      label: `${c} columns · ${rows} rows`,
      value: c,
    });
  }
  return opts;
});
</script>

<style scoped>
.grid-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
