<template>
  <div
    class="action-card set-card"
    :class="{ 'drag-over': isDragOver }"
    @click="handleClick"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="card-preview set-preview">
      <!-- Folder icon with stacked inner lines to represent a set -->
      <div class="set-folder-icon">
        <svg viewBox="0 0 24 24" class="folder-svg" fill="none">
          <path
            d="M3 7C3 5.9 3.9 5 5 5h4l2 2h8c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V7z"
            fill="currentColor"
            opacity="0.18"
          />
          <path
            d="M3 7C3 5.9 3.9 5 5 5h4l2 2h8c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V7z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
            fill="none"
          />
          <!-- Mini stacked lines inside folder to represent contents -->
          <line
            x1="7"
            y1="12"
            x2="17"
            y2="12"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            opacity="0.7"
          />
          <line
            x1="7"
            y1="15"
            x2="14"
            y2="15"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            opacity="0.5"
          />
        </svg>
        <div v-if="totalCount > 0" class="set-count-badge">
          {{ totalCount }}
        </div>
      </div>
    </div>
    <div class="card-info">
      <h3 class="card-title">{{ item.name }}</h3>
      <p class="card-meta">
        <span v-if="(item.childSetsCount ?? 0) > 0"
          >{{ item.childSetsCount ?? 0 }} set{{
            (item.childSetsCount ?? 0) !== 1 ? "s" : ""
          }}</span
        >
        <span
          v-if="
            (item.childSetsCount ?? 0) > 0 && (item.collectionsCount ?? 0) > 0
          "
        >
          ·
        </span>
        <span v-if="(item.collectionsCount ?? 0) > 0"
          >{{ item.collectionsCount ?? 0 }} collection{{
            (item.collectionsCount ?? 0) !== 1 ? "s" : ""
          }}</span
        >
        <span v-if="totalCount === 0" class="empty-meta">Empty set</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CollectionSetItem {
  id: string | number;
  name: string;
  description?: string | null;
  parentSetId?: number | null;
  collectionsCount?: number;
  childSetsCount?: number;
  updatedAt?: Date | string;
}

interface Props {
  item: CollectionSetItem;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  click: [item: CollectionSetItem];
  dropCollections: [collectionIds: (string | number)[], setId: string | number];
}>();

const handleClick = () => {
  emit("click", props.item);
};

import { ref, computed } from "vue";
const isDragOver = ref(false);

const onDragOver = (e: DragEvent) => {
  if (e.dataTransfer?.types.includes("application/x-collection-id")) {
    isDragOver.value = true;
    e.dataTransfer.dropEffect = "move";
  }
};

const onDragLeave = (e: DragEvent) => {
  // only clear if leaving the card entirely (not a child element)
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    isDragOver.value = false;
  }
};

const onDrop = (e: DragEvent) => {
  isDragOver.value = false;
  // Try multi-id format first
  const multiRaw = e.dataTransfer?.getData("application/x-collection-ids");
  if (multiRaw) {
    try {
      const ids = JSON.parse(multiRaw) as (string | number)[];
      if (Array.isArray(ids) && ids.length > 0) {
        emit("dropCollections", ids, props.item.id);
        return;
      }
    } catch {
      // fall through to single-id
    }
  }
  // Fall back to single id
  const collectionId = e.dataTransfer?.getData("application/x-collection-id");
  if (collectionId) {
    emit("dropCollections", [collectionId], props.item.id);
  }
};

const totalCount = computed(
  () => (props.item.collectionsCount ?? 0) + (props.item.childSetsCount ?? 0),
);
</script>

<style scoped>
.set-card {
  cursor: pointer;
  border-radius: var(--border-radius-lg, 12px);
  background: var(--bg-surface, #fff);
  /* border: 0.1px solid var(--text-primary, #e5e7eb); */
  padding: 16px;
  transition:
    box-shadow 0.2s,
    border-color 0.2s,
    transform 0.15s;
  display: flex;
  flex-direction: column;
}

.set-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color, #6366f1);
  transform: translateY(-2px);
}

.set-card.drag-over {
  box-shadow:
    0 0 0 2px var(--primary-color, #6366f1),
    0 4px 20px rgba(99, 102, 241, 0.25);
  border-color: var(--primary-color, #6366f1);
  transform: translateY(-2px);
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 6%,
    var(--bg-card, #fff)
  );
}

.set-preview {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  border-radius: var(--border-radius-md, 8px);
  background: var(--bg-surface, #f9fafb);
  position: relative;
}

.set-folder-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.folder-svg {
  width: 76px;
  height: 76px;
  color: var(--primary-color, #6366f1);
}

.set-count-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  background: var(--primary-color, #6366f1);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 99px;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.card-info {
  padding: 0;
}

.card-title {
  font-size: var(--font-size-md, 15px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
  margin: 0;
}

.empty-meta {
  color: var(--text-tertiary, #9ca3af);
}
</style>
