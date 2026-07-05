<template>
  <Transition :name="embedded ? '' : 'floating-bar'">
    <div
      v-if="embedded || selectedCount > 0"
      :class="[
        'floating-action-bar',
        { 'floating-action-bar--embedded': embedded },
      ]"
      :style="{
        top:
          embedded || isMobile
            ? 'auto'
            : typeof topPosition === 'number'
              ? topPosition + 'px'
              : topPosition,
      }"
    >
      <div class="floating-action-content">
        <template v-if="!embedded">
          <div class="selected-count">
            <span>{{ selectedCount }} selected</span>
          </div>
        </template>

        <div class="floating-action-buttons">
          <template v-if="!embedded">
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
          </template>

          <!-- Group 1: Download + Copy Names -->
          <n-tooltip placement="bottom" trigger="hover">
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

          <n-tooltip v-if="showCopyNames" placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                type="info"
                size="medium"
                @click="handleCopyNames"
                :disabled="selectedCount === 0"
              >
                <template #icon>
                  <n-icon>
                    <CopyOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span>Copy photo names to clipboard</span>
          </n-tooltip>

          <!-- Divider: only shown when group 2 has at least one button -->
          <div
            v-if="
              !embedded &&
              (showMoveToTool ||
                showAddToCollection ||
                showSendToChat ||
                showAttachToChat)
            "
            class="action-separator"
          ></div>

          <!-- Group 2: Take to Tool / Collection / Chat -->
          <n-tooltip v-if="showMoveToTool" placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                type="primary"
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

          <n-tooltip
            v-if="showAddToCollection"
            placement="bottom"
            trigger="hover"
          >
            <template #trigger>
              <n-button
                type="primary"
                size="medium"
                @click="$emit('add-to-collection')"
                :disabled="selectedCount === 0"
              >
                <template #icon>
                  <n-icon>
                    <LibraryOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span>Add selected photos to a collection</span>
          </n-tooltip>

          <n-tooltip v-if="showSendToChat" placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                type="primary"
                size="medium"
                @click="$emit('send-to-chat')"
                :disabled="
                  selectedCount === 0 || selectedCount > MAX_PHOTOS_TO_CHAT
                "
              >
                <template #icon>
                  <n-icon>
                    <RobotOutlined />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span v-if="selectedCount > MAX_PHOTOS_TO_CHAT"
              >Maximum {{ MAX_PHOTOS_TO_CHAT }} photos can be sent to
              ChatLab</span
            >
            <span v-else>Send selected photos to ChatLab</span>
          </n-tooltip>

          <n-tooltip v-if="showAttachToChat" placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                type="primary"
                size="medium"
                @click="$emit('attach-to-chat')"
                :disabled="
                  selectedCount === 0 || selectedCount > MAX_PHOTOS_TO_CHAT
                "
              >
                <template #icon>
                  <n-icon>
                    <AttachOutline />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span v-if="selectedCount > MAX_PHOTOS_TO_CHAT"
              >Maximum {{ MAX_PHOTOS_TO_CHAT }} photos can be attached</span
            >
            <span v-else>Attach selected photos to your message</span>
          </n-tooltip>

          <!-- Divider before delete -->
          <div v-if="showDelete && !embedded" class="action-separator"></div>

          <!-- Group 3: Delete -->
          <template v-if="showDelete">
            <!-- Dropdown mode (in collection context) -->
            <n-dropdown
              v-if="showDeleteOptions"
              trigger="click"
              placement="bottom"
              :options="deleteDropdownOptions"
              :disabled="selectedCount === 0"
              @select="handleDeleteDropdownSelect"
            >
              <n-button
                type="error"
                size="medium"
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
            </n-dropdown>

            <!-- Simple mode (workspace context) -->
            <n-tooltip v-else placement="bottom" trigger="hover">
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
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { NButton, NIcon, NTooltip, NDropdown, useMessage } from "naive-ui";
import {
  CloudDownloadOutline,
  AttachOutline,
  CopyOutline,
  LibraryOutline,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";
import { MagicWand } from "@vicons/carbon";
import { computed } from "vue";
import { usePhotosStore } from "@/stores/photos";
import { useMobilePhotoSelection } from "@/composables/useMobilePhotoSelection";
import { useIsMobile } from "@/composables/useIsMobile";
import { MAX_PHOTOS_TO_CHAT } from "@/composables/usePhotoToolSelection";

// Get mobile selection composable to reset mode
const { exitSelectionMode } = useMobilePhotoSelection();
const { isMobile } = useIsMobile();

const photosStore = usePhotosStore();
const message = useMessage();

const props = defineProps({
  selectedIds: {
    type: Array,
    default: () => [],
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
  showSendToChat: {
    type: Boolean,
    default: false,
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
  showCopyNames: {
    type: Boolean,
    default: true,
  },
  showDeleteOptions: {
    type: Boolean,
    default: false,
  },
  embedded: {
    type: Boolean,
    default: false,
  },
  topPosition: {
    type: [String, Number],
    default: 75,
  },
});

const emit = defineEmits([
  "clear-selection",
  "delete",
  "remove-from-collection",
  "download",
  "add-to-collection",
  "move-to-tool",
  "send-to-chat",
  "attach-to-chat",
]);

const deleteDropdownOptions = [
  { label: "Remove from collection", key: "remove-from-collection" },
  { label: "Delete photo", key: "delete", props: { style: "color: #e5534b" } },
];

const handleDeleteDropdownSelect = (key) => {
  emit(key);
};

const selectedCount = computed(() => props.selectedIds.length);

const handleCopyNames = () => {
  const idSet = new Set(props.selectedIds.map(String));
  const names = (photosStore.photos || [])
    .filter((p) => idSet.has(String(p.id)))
    .map((p) => (p.originalFileName || p.name || "").replace(/\.[^/.]+$/, ""))
    .join(", ");
  navigator.clipboard.writeText(names);
  const count = idSet.size;
  message.success(
    `${count} filename${count !== 1 ? "s" : ""} copied to clipboard`,
  );
};

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

/* Embedded (inline in header) compact mode */
.floating-action-bar--embedded {
  background: transparent;
  backdrop-filter: none;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

.floating-action-bar--embedded .floating-action-buttons {
  gap: 4px;
}

.floating-action-bar--embedded .floating-action-buttons :deep(.n-button) {
  --n-width: 32x !important;
  --n-height: 32x !important;
  width: 32px;
  height: 32px;
  min-width: unset;
  padding: 0;
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

/* Embedded mode styles */
.floating-action-bar--embedded {
  position: static;
  transform: none;
  background: transparent;
  backdrop-filter: none;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  width: auto;
}

.floating-action-bar--embedded .floating-action-content {
  gap: 4px;
}

.floating-action-bar--embedded .floating-action-buttons {
  gap: 8px;
  /* transform: scale(0.85); */
  transform-origin: center center;
}

@media (max-width: 768px) {
  .floating-action-bar--embedded .floating-action-buttons {
    transform: scale(0.85);
  }

  .floating-action-bar--embedded .floating-action-buttons :deep(.n-button) {
    width: 28px;
    height: 28px;
  }
}
</style>
