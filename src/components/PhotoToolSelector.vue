<template>
  <n-modal
    :show="show"
    preset="dialog"
    :title="showCanvasSelector ? 'Select a Canvas' : 'Take Photos To...'"
    :style="{ width: '420px' }"
    :closable="true"
    @mask-click="$emit('close')"
    @close="$emit('close')"
  >
    <!-- Canvas selector sub-panel -->
    <div v-if="showCanvasSelector" class="tool-selector-content">
      <p class="selection-info">
        Add <strong>{{ photoCount }}</strong>
        {{ photoCount === 1 ? "photo" : "photos" }} to which canvas?
      </p>

      <div v-if="isLoadingCanvases" class="canvas-loading">
        <SpiralGridLoader variant="primary" :size="40" />
      </div>

      <div v-else class="tools-grid">
        <!-- Existing canvases -->
        <div
          v-for="canvas in canvasList"
          :key="canvas.id"
          class="tool-option"
          @click="handleCanvasSelect(canvas.id)"
        >
          <div class="tool-icon">
            <n-icon :size="32">
              <component :is="getIconComponent('Workspace')" />
            </n-icon>
          </div>
          <div class="tool-info">
            <h4 class="tool-name">{{ canvas.name }}</h4>
            <p class="tool-description">
              {{ canvas.photoCount ?? 0 }} photo{{
                (canvas.photoCount ?? 0) === 1 ? "" : "s"
              }}
            </p>
          </div>
        </div>

        <!-- New canvas option -->
        <div
          class="tool-option tool-option--new"
          @click="handleCanvasSelect('new')"
        >
          <div class="tool-icon tool-icon--new">
            <n-icon :size="32">
              <component :is="getIconComponent('CloudUploadOutline')" />
            </n-icon>
          </div>
          <div class="tool-info">
            <h4 class="tool-name">New Canvas</h4>
            <p class="tool-description">
              Create a new canvas with these photos
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Default tool list -->
    <div v-else class="tool-selector-content">
      <p class="selection-info">
        Select a tool to take <strong>{{ photoCount }}</strong>
        {{ photoCount === 1 ? "photo" : "photos" }} to:
      </p>

      <div class="tools-grid">
        <div
          v-for="tool in availableTools"
          :key="tool.id"
          class="tool-option"
          :class="{
            processing: isProcessing && selectedTool === tool.id,
            disabled: isToolDisabled(tool),
          }"
          @click="handleToolSelect(tool)"
        >
          <div class="tool-icon">
            <n-icon :size="32">
              <component :is="getIconComponent(tool.icon)" />
            </n-icon>
          </div>
          <div class="tool-info">
            <h4 class="tool-name">{{ tool.name }}</h4>
            <p class="tool-description">
              {{ tool.description }}
              <span
                v-if="tool.singlePhotoOnly && photoCount > 1"
                class="single-photo-warning"
              >
                (Select only 1 photo)
              </span>
            </p>
          </div>
          <div
            v-if="isProcessing && selectedTool === tool.id"
            class="processing-indicator"
          >
            <SpiralGridLoader variant="primary" :size="24" />
          </div>
        </div>
      </div>
    </div>

    <template #action>
      <div class="actions">
        <n-button
          v-if="showCanvasSelector"
          @click="showCanvasSelector = false"
          :disabled="isProcessing"
        >
          Back
        </n-button>
        <n-button v-else @click="$emit('close')" :disabled="isProcessing">
          Cancel
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { NModal, NButton, NIcon } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import { useToolsAvailability } from "@/composables/useToolsAvailability.js";
import { getIconComponent } from "@/config/toolsConfig";
import { useUserStore } from "@/stores/userStore";
import { api } from "@/utils/axios";

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
    default: null, // Optional - if not provided, uses device-aware tools
  },
  currentTool: {
    type: String,
    default: null, // Current tool context - will be excluded from list (except 'canvas', handled via activeCanvasId)
  },
  activeCanvasId: {
    type: Number,
    default: null, // ID of the currently active canvas - excluded from canvas sub-selector
  },
  isProcessing: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close", "tool-selected"]);

const selectedTool = ref(null);
const showCanvasSelector = ref(false);
const canvasList = ref([]);
const isLoadingCanvases = ref(false);

const userStore = useUserStore();

// Reset canvas selector when modal closes
watch(
  () => props.show,
  (val) => {
    if (!val) {
      showCanvasSelector.value = false;
      canvasList.value = [];
    }
  },
);

// Get device-aware tools automatically
const { photoSelectorTools } = useToolsAvailability();

// Use provided tools or fall back to device-filtered tools, excluding current tool
const availableTools = computed(() => {
  let tools = [];

  // If tools prop is explicitly provided, use those
  if (props.tools && props.tools.length > 0) {
    tools = props.tools;
  } else {
    // Otherwise use device-aware tools from config
    tools = photoSelectorTools.value.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      icon: tool.icon,
      singlePhotoOnly: tool.singlePhotoOnly || false,
    }));
  }

  // Exclude current tool if specified, but never exclude 'canvas' — it's handled
  // via activeCanvasId filtering in the sub-selector so the user can pick a different canvas
  if (props.currentTool && props.currentTool !== "canvas") {
    tools = tools.filter((tool) => tool.id !== props.currentTool);
  }

  return tools;
});

const isToolDisabled = (tool) => {
  return tool.singlePhotoOnly && props.photoCount > 1;
};

const handleToolSelect = async (tool) => {
  if (props.isProcessing) return;
  if (isToolDisabled(tool)) return;

  // For canvas, show canvas sub-selector instead of emitting directly
  if (tool.id === "canvas" && userStore.isAuthenticated) {
    isLoadingCanvases.value = true;
    showCanvasSelector.value = true;
    try {
      const res = await api.get("/api/canvas");
      canvasList.value = (res.data || []).filter(
        (c) => c.id !== props.activeCanvasId,
      );
    } catch (e) {
      canvasList.value = [];
    } finally {
      isLoadingCanvases.value = false;
    }
    return;
  }

  selectedTool.value = tool.id;
  emit("tool-selected", tool.id);
};

const handleCanvasSelect = (canvasId) => {
  if (props.isProcessing) return;
  emit("tool-selected", "canvas", canvasId === "new" ? "new" : canvasId);
};
</script>

<style scoped>
.canvas-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 32px 0;
}

.tool-option--new {
  border-style: dashed;
}

.tool-icon--new {
  color: var(--text-color-3);
}

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
  background: var(--bg-card);
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
  background: var(--bg-card);
}

.tool-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-option.disabled:hover {
  border-color: var(--border-color);
  background: var(--bg-card);
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
