<template>
  <n-modal
    :show="show"
    preset="dialog"
    title="Take Photos To..."
    :style="{ width: '420px' }"
    :closable="true"
    @mask-click="$emit('close')"
    @close="$emit('close')"
  >
    <div class="tool-selector-content">
      <p class="selection-info">
        Select a tool to take <strong>{{ photoCount }}</strong>
        {{ photoCount === 1 ? "photo" : "photos" }} to:
      </p>

      <div class="tools-grid">
        <div
          v-for="tool in tools"
          :key="tool.id"
          class="tool-option"
          :class="{ 
            processing: isProcessing && selectedTool === tool.id,
            disabled: isToolDisabled(tool)
          }"
          @click="handleToolSelect(tool)"
        >
          <div class="tool-icon">
            <n-icon :size="32">
              <Workspace v-if="tool.icon === 'Workspace'" />
              <SquareOutline v-else-if="tool.icon === 'ImageFrame'" />
              <GlobeOutline v-else-if="tool.icon === 'Globe'" />
            </n-icon>
          </div>
          <div class="tool-info">
            <h4 class="tool-name">{{ tool.name }}</h4>
            <p class="tool-description">
              {{ tool.description }}
              <span v-if="tool.singlePhotoOnly && photoCount > 1" class="single-photo-warning">
                (Select only 1 photo)
              </span>
            </p>
          </div>
          <div
            v-if="isProcessing && selectedTool === tool.id"
            class="processing-indicator"
          >
            <n-spin size="small" />
          </div>
        </div>
      </div>
    </div>

    <template #action>
      <div class="actions">
        <n-button @click="$emit('close')" :disabled="isProcessing">
          Cancel
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref } from "vue";
import { NModal, NButton, NIcon, NSpin } from "naive-ui";
import { Workspace } from "@vicons/carbon";
import { SquareOutline, GlobeOutline } from "@vicons/ionicons5";

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  photoCount: {
    type: Number,
    default: 0,
  },
  tools: {
    type: Array,
    default: () => [],
  },
  isProcessing: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "tool-selected"]);

const selectedTool = ref(null);

const isToolDisabled = (tool) => {
  return tool.singlePhotoOnly && props.photoCount > 1;
};

const handleToolSelect = (tool) => {
  if (props.isProcessing) return;
  if (isToolDisabled(tool)) return;

  selectedTool.value = tool.id;
  emit("tool-selected", tool.id);
};
</script>

<style scoped>
.tool-selector-content {
  padding: 16px 0;
}

.selection-info {
  margin-bottom: 24px;
  color: var(--text-color-2);
  font-size: 14px;
  text-align: center;
}

.tools-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-option {
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--card-color);
  position: relative;
}

.tool-option:hover {
  border-color: var(--primary-color);
  background: var(--hover-color);
}

.tool-option.processing {
  opacity: 0.7;
  cursor: not-allowed;
}

.tool-option.processing:hover {
  border-color: var(--border-color);
  background: var(--card-color);
}

.tool-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-option.disabled:hover {
  border-color: var(--border-color);
  background: var(--card-color);
}

.single-photo-warning {
  color: var(--warning-color);
  font-size: 12px;
  font-style: italic;
}

.tool-icon {
  margin-right: 16px;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--border-radius);
}

.tool-info {
  flex: 1;
}

.tool-name {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-1);
}

.tool-description {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-2);
  line-height: 1.4;
}

.processing-indicator {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Dark theme adjustments */
.dark .tool-option {
  border-color: var(--border-color);
}

.dark .tool-option:hover {
  background: var(--hover-color);
  border-color: var(--primary-color);
}
</style>
