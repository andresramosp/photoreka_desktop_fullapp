<template>
  <n-modal
    :show="show"
    :style="{ width: '520px', maxWidth: '95vw' }"
    @update:show="(val) => !val && emit('cancel')"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="folder-review-card"
    >
      <template #header>
        <div class="folder-review-header">
          <n-icon size="20" color="var(--primary-color)">
            <FolderOutline />
          </n-icon>
          <span>Review folders to import</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('cancel')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="folder-review-body">
        <p class="folder-review-summary">
          <strong>{{ totalCount }}</strong> photo{{
            totalCount !== 1 ? "s" : ""
          }}
          across
          <strong>{{ folderGroups.length }}</strong> folder{{
            folderGroups.length !== 1 ? "s" : ""
          }}
        </p>

        <div class="folder-review-list">
          <div
            v-for="group in folderGroups"
            :key="group.id"
            class="folder-review-item"
          >
            <div class="folder-review-item-info">
              <n-icon size="16" color="var(--primary-color)">
                <FolderOutline />
              </n-icon>
              <span class="folder-review-item-name">{{ group.name }}</span>
              <span class="folder-review-item-count"
                >{{ group.files.length }} photo{{
                  group.files.length !== 1 ? "s" : ""
                }}</span
              >
            </div>
            <n-button
              text
              @click="emit('remove-folder', group.id)"
              aria-label="Remove folder"
            >
              <n-icon size="16" color="var(--text-secondary)">
                <CloseOutline />
              </n-icon>
            </n-button>
          </div>
        </div>

        <n-button
          dashed
          block
          class="folder-review-add"
          @click="emit('add-folder')"
        >
          <template #icon>
            <n-icon><FolderOutline /></n-icon>
          </template>
          Add another folder
        </n-button>

        <div class="folder-review-mirror">
          <n-checkbox
            :checked="mirrorFolderStructure"
            @update:checked="emit('update:mirrorFolderStructure', $event)"
          >
            Mirror folder structure
          </n-checkbox>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                aria-label="About mirror folder structure"
              >
                <n-icon size="14" color="var(--text-secondary)">
                  <InformationCircleOutline />
                </n-icon>
              </button>
            </template>
            Transform your local folders into Photoreka collections
          </n-tooltip>
        </div>
      </div>

      <template #footer>
        <div class="folder-review-footer">
          <n-button tertiary @click="emit('cancel')">Cancel</n-button>
          <n-button
            type="primary"
            :disabled="totalCount === 0"
            @click="emit('import')"
          >
            Import {{ totalCount }} photo{{ totalCount !== 1 ? "s" : "" }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { NModal, NCheckbox, NTooltip } from "naive-ui";
import {
  CloseOutline,
  FolderOutline,
  InformationCircleOutline,
} from "@vicons/ionicons5";

defineProps({
  show: { type: Boolean, default: false },
  folderGroups: { type: Array, default: () => [] }, // [{ id, name, files: File[] }]
  totalCount: { type: Number, default: 0 },
  mirrorFolderStructure: { type: Boolean, default: true },
});

const emit = defineEmits([
  "cancel",
  "add-folder",
  "remove-folder",
  "import",
  "update:mirrorFolderStructure",
]);
</script>

<style scoped>
.folder-review-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.folder-review-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.folder-review-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.folder-review-summary {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.folder-review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.folder-review-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background-color: color-mix(in srgb, var(--primary-color) 6%, transparent);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.folder-review-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.folder-review-item-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-review-item-count {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.folder-review-add {
  margin-top: 4px;
  border: 1px dashed var(--text-secondary);
  border-radius: var(--radius-sm);
  background-color: transparent;
  opacity: 0.75;
  transition:
    border-color 0.15s ease,
    opacity 0.15s ease;
}

.folder-review-add:hover {
  border-color: var(--accent-color);
  opacity: 1;
}

.folder-review-mirror {
  display: flex;
  align-items: center;
}

.folder-review-mirror :deep(.n-checkbox__label) {
  padding-right: 0;
}

.info-icon-btn {
  margin-left: 3px;
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.info-icon-btn:hover {
  background: var(--bg-surface-hover);
}

.folder-review-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
