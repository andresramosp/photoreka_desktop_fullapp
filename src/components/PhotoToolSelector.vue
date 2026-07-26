<template>
  <n-modal
    :show="show"
    preset="dialog"
    :title="showCanvasSelector ? 'Select a Canvas' : 'Take Photos To...'"
    :style="{ width: '420px' }"
    :show-icon="false"
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

      <n-input
        v-model:value="canvasSearch"
        placeholder="Search canvases by name..."
        clearable
        class="search-input"
      />

      <div v-if="isLoadingCanvases" class="canvas-loading">
        <SpiralGridLoader variant="primary" :size="40" />
      </div>

      <div v-else class="canvas-list">
        <!-- New canvas option -->
        <div
          class="canvas-item canvas-item--new"
          @click="handleCanvasSelect('new')"
        >
          <div class="canvas-item-content">
            <n-icon size="24" color="var(--accent-color)">
              <AddOutline />
            </n-icon>
            <div>
              <h4 class="canvas-name">New Canvas</h4>
              <p class="canvas-description">
                Create a new canvas with these photos
              </p>
            </div>
          </div>
        </div>

        <!-- Empty state message -->
        <div v-if="canvasList.length === 0" class="empty-list-message">
          <p>No canvases yet. Create your first one above.</p>
        </div>

        <div
          v-else-if="filteredCanvasList.length === 0"
          class="empty-list-message"
        >
          <p>No canvases found with that name.</p>
        </div>

        <!-- Existing canvases -->
        <div
          v-for="canvas in filteredCanvasList"
          :key="canvas.id"
          class="canvas-item"
          @click="handleCanvasSelect(canvas.id)"
        >
          <h4 class="canvas-name">{{ canvas.name }}</h4>
          <p class="canvas-description">
            {{ canvas.photoCount ?? 0 }} photo{{
              (canvas.photoCount ?? 0) === 1 ? "" : "s"
            }}
          </p>
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
import { NModal, NButton, NIcon, NInput } from "naive-ui";
import SpiralGridLoader from "./SpiralGridLoader.vue";
import { useToolsAvailability } from "@/composables/useToolsAvailability.js";
import { getIconComponent } from "@/config/toolsConfig";
import { AddOutline } from "@vicons/ionicons5";
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
const canvasSearch = ref("");

const filteredCanvasList = computed(() => {
  const term = canvasSearch.value.trim().toLowerCase();
  if (!term) {
    return canvasList.value;
  }

  return canvasList.value.filter((canvas) =>
    (canvas.name || "").toLowerCase().includes(term),
  );
});

const userStore = useUserStore();

// Reset canvas selector when modal closes
watch(
  () => props.show,
  (val) => {
    if (!val) {
      showCanvasSelector.value = false;
      canvasList.value = [];
      canvasSearch.value = "";
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
    canvasSearch.value = "";
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

.search-input {
  margin-bottom: 12px;
}

.canvas-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-body);
}

.canvas-item {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.canvas-item:last-child {
  border-bottom: none;
}

.canvas-item:hover {
  background-color: rgba(139, 92, 246, 0.1);
}

.canvas-item.canvas-item--new {
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(139, 92, 246, 0.05);
}

.canvas-item.canvas-item--new:hover {
  background-color: rgba(139, 92, 246, 0.1);
}

.canvas-item-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.canvas-item-content .canvas-name {
  color: var(--accent-color);
  font-weight: 600;
}

.canvas-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 4px 0;
}

.canvas-description {
  font-size: 12px;
  color: var(--text-primary);
  margin: 0;
}

.empty-list-message {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-primary);
  font-size: 14px;
}

.empty-list-message p {
  margin: 0;
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
