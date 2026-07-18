<template>
  <div
    class="action-card set-card"
    :class="{ 'drag-over': isDragOver, 'is-list': layout === 'list' }"
    :style="
      layout === 'list' ? { paddingLeft: 12 + depth * 20 + 'px' } : undefined
    "
    @click="handleClick"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- List (details) row -->
    <template v-if="layout === 'list'">
      <button
        v-if="hasChildren"
        class="tree-toggle"
        :class="{ 'is-expanded': expanded }"
        :title="expanded ? 'Collapse' : 'Expand'"
        @click.stop="emit('toggleExpand', item.id)"
      >
        <svg viewBox="0 0 24 24" class="chevron">
          <path
            d="M9 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div v-else class="list-select-space"></div>
      <div class="list-icon">
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
        </svg>
      </div>
      <div class="list-name" :title="item.name">{{ item.name }}</div>
      <div class="list-col list-col-items">
        <span v-if="(item.childSetsCount ?? 0) > 0"
          >{{ item.childSetsCount ?? 0 }} set{{
            (item.childSetsCount ?? 0) !== 1 ? "s" : ""
          }}</span
        >
        <span v-if="(item.childSetsCount ?? 0) > 0 && contentCount > 0">
          ·
        </span>
        <span v-if="contentCount > 0"
          >{{ contentCount }} {{ contentLabel
          }}{{ contentCount !== 1 ? "s" : "" }}</span
        >
        <span v-if="photoCount > 0" class="list-photos"
          >&nbsp;·&nbsp;{{ photoCount }} photo{{ photoCount !== 1 ? "s" : "" }}</span
        >
        <span v-if="totalCount === 0" class="empty-meta">Empty set</span>
      </div>
      <div class="list-col list-col-updated">
        {{ item.updatedAt ? formatDate(item.updatedAt) : "—" }}
      </div>
    </template>

    <div v-else class="card-preview set-preview">
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
    <div v-if="layout !== 'list'" class="card-info">
      <h3 class="card-title">{{ item.name }}</h3>
      <p class="card-meta">
        <span v-if="(item.childSetsCount ?? 0) > 0"
          >{{ item.childSetsCount ?? 0 }} set{{
            (item.childSetsCount ?? 0) !== 1 ? "s" : ""
          }}</span
        >
        <span v-if="(item.childSetsCount ?? 0) > 0 && contentCount > 0">
          ·
        </span>
        <span v-if="contentCount > 0"
          >{{ contentCount }} {{ contentLabel
          }}{{ contentCount !== 1 ? "s" : "" }}</span
        >
        <span v-if="photoCount > 0"
          >&nbsp;·&nbsp;{{ photoCount }} photo{{
            photoCount !== 1 ? "s" : ""
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
  seriesCount?: number;
  portfolioBuildsCount?: number;
  childSetsCount?: number;
  updatedAt?: Date | string;
}

interface Props {
  item: CollectionSetItem;
  itemType?: string;
  contentLabel?: string;
  layout?: "grid" | "list";
  photoCount?: number;
  depth?: number;
  hasChildren?: boolean;
  expanded?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  itemType: "collection",
  contentLabel: "collection",
  layout: "grid",
  photoCount: 0,
  depth: 0,
  hasChildren: false,
  expanded: false,
});

const emit = defineEmits<{
  click: [item: CollectionSetItem];
  dropCollections: [collectionIds: (string | number)[], setId: string | number];
  dropItems: [itemIds: (string | number)[], setId: string | number];
  toggleExpand: [setId: string | number];
}>();

const handleClick = () => {
  emit("click", props.item);
};

import { ref, computed } from "vue";
const isDragOver = ref(false);

const onDragOver = (e: DragEvent) => {
  const singleMime = `application/x-${props.itemType}-id`;
  const multiMime = `application/x-${props.itemType}-ids`;
  if (
    e.dataTransfer?.types.includes(singleMime) ||
    e.dataTransfer?.types.includes(multiMime)
  ) {
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
  const singleMime = `application/x-${props.itemType}-id`;
  const multiMime = `application/x-${props.itemType}-ids`;
  // Try multi-id format first
  const multiRaw = e.dataTransfer?.getData(multiMime);
  if (multiRaw) {
    try {
      const ids = JSON.parse(multiRaw) as (string | number)[];
      if (Array.isArray(ids) && ids.length > 0) {
        emit("dropItems", ids, props.item.id);
        emit("dropCollections", ids, props.item.id);
        return;
      }
    } catch {
      // fall through to single-id
    }
  }
  // Fall back to single id
  const itemId = e.dataTransfer?.getData(singleMime);
  if (itemId) {
    emit("dropItems", [itemId], props.item.id);
    emit("dropCollections", [itemId], props.item.id);
  }
};

const contentCount = computed(
  () =>
    props.item.collectionsCount ??
    props.item.seriesCount ??
    props.item.portfolioBuildsCount ??
    0,
);

const totalCount = computed(
  () => contentCount.value + (props.item.childSetsCount ?? 0),
);

const formatDate = (date: Date | string) => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - dateObj.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  return `${Math.floor(diffDays / 30)} months ago`;
};
</script>

<style scoped>
.set-card {
  cursor: pointer;
  border-radius: var(--border-radius-lg, 12px);
  background: var(--bg-surface, #fff);
  /* border: 0.1px solid var(--text-primary, #e5e7eb); */
  padding: 16px;

  display: flex;
  flex-direction: column;
}

.set-card:hover {
  border-color: var(--primary-color, #6366f1);
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

/* ── List (details) row ────────────────────────────────────── */
.set-card.is-list {
  display: grid;
  grid-template-columns: var(--list-cols, 24px 28px minmax(0, 1fr) 250px 120px);
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  min-height: 40px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
}

.set-card.is-list:hover {
  background: color-mix(
    in srgb,
    var(--primary-color, #6366f1) 7%,
    transparent
  );
}

.set-card.is-list.drag-over {
  transform: none;
  box-shadow: none;
  background: color-mix(in srgb, var(--primary-color, #6366f1) 14%, transparent);
  border-color: var(--primary-color, #6366f1);
}

.set-card.is-list .tree-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  color: var(--text-tertiary);
  justify-self: center;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.set-card.is-list .tree-toggle:hover {
  background: color-mix(in srgb, var(--primary-color, #6366f1) 18%, transparent);
  color: var(--primary-color);
}

.set-card.is-list .tree-toggle .chevron {
  width: 16px;
  height: 16px;
  transition: transform 0.15s ease;
}

.set-card.is-list .tree-toggle.is-expanded .chevron {
  transform: rotate(90deg);
}

.set-card.is-list .list-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.set-card.is-list .list-icon .folder-svg {
  width: 26px;
  height: 26px;
  color: var(--primary-color, #6366f1);
}

.set-card.is-list .list-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-card.is-list .list-col {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.set-card.is-list .empty-meta {
  color: var(--text-tertiary, #9ca3af);
}

@media (max-width: 768px) {
  .set-card.is-list {
    grid-template-columns: 24px 28px minmax(0, 1fr) auto;
  }
  .set-card.is-list .list-col-updated {
    display: none;
  }
}
</style>
