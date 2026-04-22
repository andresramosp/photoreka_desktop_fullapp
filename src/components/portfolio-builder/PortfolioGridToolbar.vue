<template>
  <div class="grid-toolbar">
    <div class="toolbar-left">
      <n-button size="small" type="primary" ghost @click="$emit('add-photos')">
        <template #icon>
          <n-icon><AddOutline /></n-icon>
        </template>
        More Photos
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

      <span class="toolbar-separator" />

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
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NButtonGroup, NSlider, NButton, NIcon } from "naive-ui";
import { ArrowUndoOutline, AddOutline } from "@vicons/ionicons5";

const props = defineProps({
  columns: { type: Number, required: true },
  gap: { type: Number, default: 3 },
  photoCount: { type: Number, required: true },
  removedCount: { type: Number, default: 0 },
});

defineEmits([
  "update:columns",
  "update:gap",
  "undo-last",
  "restore-all",
  "add-photos",
]);

const columnOptions = computed(() => {
  const opts = [];
  for (let c = 2; c <= 6; c++) {
    opts.push(c);
  }
  return opts;
});
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
