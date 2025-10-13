<template>
  <div class="fixed-action-bar">
    <div class="action-buttons">
      <!-- Download Button -->
      <n-tooltip placement="top" trigger="hover">
        <template #trigger>
          <n-button
            type="info"
            size="small"
            @click="$emit('download')"
            :disabled="selectedCount === 0 || isDownloading"
            :loading="isDownloading"
          >
            <template #icon>
              <n-icon size="16">
                <CloudDownloadOutline />
              </n-icon>
            </template>
          </n-button>
        </template>
        <span>Download selected photos</span>
      </n-tooltip>

      <!-- Add to Collection Button -->
      <n-tooltip v-if="showAddToCollection" placement="top" trigger="hover">
        <template #trigger>
          <n-button
            type="info"
            size="small"
            @click="$emit('add-to-collection')"
            :disabled="selectedCount === 0"
          >
            <template #icon>
              <n-icon size="16">
                <AlbumsOutline />
              </n-icon>
            </template>
          </n-button>
        </template>
        <span>Add selected photos to a collection</span>
      </n-tooltip>

      <!-- Move to Tool Button -->
      <n-tooltip v-if="showMoveToTool" placement="top" trigger="hover">
        <template #trigger>
          <n-button
            type="info"
            size="small"
            @click="$emit('move-to-tool')"
            :disabled="selectedCount === 0"
          >
            <template #icon>
              <n-icon size="16">
                <MagicWand />
              </n-icon>
            </template>
          </n-button>
        </template>
        <span>Take selected photos to a tool</span>
      </n-tooltip>
    </div>
  </div>
</template>

<script setup>
import { NButton, NIcon, NTooltip } from "naive-ui";
import { AlbumsOutline, CloudDownloadOutline } from "@vicons/ionicons5";
import { MagicWand } from "@vicons/carbon";

defineProps({
  selectedCount: {
    type: Number,
    required: true,
  },
  showAddToCollection: {
    type: Boolean,
    default: true,
  },
  showMoveToTool: {
    type: Boolean,
    default: true,
  },
  isDownloading: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["download", "add-to-collection", "move-to-tool"]);
</script>

<style scoped>
.fixed-action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Button hover effects */
.action-buttons :deep(.n-button) {
  transition: all 0.2s ease;
}

.action-buttons :deep(.n-button:hover) {
  transform: scale(1.05);
}

.action-buttons :deep(.n-button:active) {
  transform: scale(0.98);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .fixed-action-bar {
    gap: 6px;
    margin-left: 6px;
  }

  .action-buttons {
    gap: 4px;
  }
}
</style>
