<template>
  <Transition name="floating-bar">
    <div v-if="selectedCount > 0" class="floating-action-bar">
      <div class="floating-action-content">
        <div class="selected-count">
          <span>{{ selectedCount }} selected</span>
        </div>

        <div class="floating-action-buttons">
          <!-- Clear Selection Button -->
          <n-button
            text
            size="small"
            @click="handleClearSelection"
            class="clear-selection-btn"
            title="Clear selection"
          >
            <template #icon>
              <n-icon size="18">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41z"
                  />
                </svg>
              </n-icon>
            </template>
          </n-button>

          <div class="action-separator"></div>

          <!-- Delete Button -->
          <n-tooltip v-if="showDelete" placement="top" trigger="hover">
            <template #trigger>
              <n-button
                type="error"
                size="medium"
                @click="$emit('delete')"
                :disabled="selectedCount === 0"
                :loading="isDeleting"
              >
                <template #icon v-if="!isDeleting">
                  <n-icon>
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9M7 6h10v13H7V6Z"
                      />
                    </svg>
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span>Delete selected photos</span>
          </n-tooltip>

          <!-- Download Button -->
          <n-tooltip placement="top" trigger="hover">
            <template #trigger>
              <n-button
                type="info"
                size="medium"
                @click="$emit('download')"
                :disabled="selectedCount === 0 || isDownloading"
                :loading="isDownloading"
              >
                <template #icon>
                  <n-icon>
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
                size="medium"
                @click="$emit('add-to-collection')"
                :disabled="selectedCount === 0"
              >
                <template #icon>
                  <n-icon>
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
                size="medium"
                @click="$emit('move-to-tool')"
                :disabled="selectedCount === 0"
              >
                <template #icon>
                  <n-icon>
                    <MagicWand />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span>Take selected photos to a tool</span>
          </n-tooltip>

          <!-- Attach to Chat Button -->
          <n-tooltip v-if="showAttachToChat" placement="top" trigger="hover">
            <template #trigger>
              <n-button
                type="primary"
                size="medium"
                @click="$emit('attach-to-chat')"
                :disabled="selectedCount === 0"
              >
                <template #icon>
                  <n-icon>
                    <AttachOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span>Attach selected photos to your message</span>
          </n-tooltip>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { NButton, NIcon, NTooltip } from "naive-ui";
import {
  AlbumsOutline,
  CloudDownloadOutline,
  AttachOutline,
} from "@vicons/ionicons5";
import { MagicWand } from "@vicons/carbon";
import { useMobilePhotoSelection } from "@/composables/useMobilePhotoSelection";

// Get mobile selection composable to reset mode
const { exitSelectionMode } = useMobilePhotoSelection();

defineProps({
  selectedCount: {
    type: Number,
    required: true,
  },
  showDelete: {
    type: Boolean,
    default: true,
  },
  showAddToCollection: {
    type: Boolean,
    default: true,
  },
  showMoveToTool: {
    type: Boolean,
    default: true,
  },
  showAttachToChat: {
    type: Boolean,
    default: false,
  },
  isDeleting: {
    type: Boolean,
    default: false,
  },
  isDownloading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "clear-selection",
  "delete",
  "download",
  "add-to-collection",
  "move-to-tool",
  "attach-to-chat",
]);

// Handler for clear selection that also exits mobile selection mode
const handleClearSelection = () => {
  exitSelectionMode();
  emit("clear-selection");
};
</script>

<style scoped>
/* Floating Action Bar */
.floating-action-bar {
  position: fixed;
  top: 75px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: var(--bg-container);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 12px 24px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.1);
}

@media (max-width: 768px) {
  .floating-action-bar {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    transform: none;
    width: 100%;
    border-radius: 16px 16px 0 0;
    padding: 12px 16px;
    margin: 0;
    box-shadow:
      0 -8px 32px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1);
  }
}

.floating-action-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.selected-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color);
  padding: 0 8px;
  white-space: nowrap;
}

.floating-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clear-selection-btn {
  color: var(--text-primary);
  transition: all 0.2s ease;
  padding: 4px;
}

.clear-selection-btn:hover {
  color: #ef4444;
  transform: scale(1.1);
}

.action-separator {
  width: 1px;
  height: 24px;
  background-color: rgba(255, 255, 255, 0.15);
  margin: 0 4px;
}

/* Transition animations */
.floating-bar-enter-active,
.floating-bar-leave-active {
  transition: all 0.3s ease;
}

.floating-bar-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.floating-bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

@media (max-width: 768px) {
  .floating-bar-enter-from {
    opacity: 0;
    transform: translateY(20px);
  }

  .floating-bar-leave-to {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* Responsive adjustments for floating bar */
@media (max-width: 768px) {
  .floating-action-content {
    gap: 12px;
  }

  .selected-count {
    font-size: 13px;
    padding: 0 4px;
  }

  .floating-action-buttons {
    gap: 6px;
  }

  .floating-action-buttons :deep(.n-button) {
    padding: 0 8px;
    min-width: unset;
  }
}

@media (max-width: 480px) {
  .floating-action-bar {
    padding: 8px 12px;
  }

  .floating-action-content {
    gap: 8px;
  }

  .selected-count {
    font-size: 12px;
    padding: 0 2px;
  }

  .floating-action-buttons {
    gap: 4px;
  }

  .action-separator {
    height: 20px;
    margin: 0 2px;
  }
}
</style>
