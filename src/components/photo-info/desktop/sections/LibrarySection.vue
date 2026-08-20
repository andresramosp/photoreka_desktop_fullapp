<template>
  <div v-if="visibleGroups.length > 0" class="library-section">
    <div v-for="group in visibleGroups" :key="group.key" class="library-group">
      <h6 class="block-title">{{ group.label }}</h6>
      <div class="tags-list">
        <n-tag
          v-for="entry in group.entries"
          :key="group.key + '-' + entry.id"
          type="info"
          :bordered="false"
          class="photo-tag library-tag"
          @click="emit('navigate-to', group.route, entry.id)"
        >
          {{ entry.name }}
        </n-tag>
      </div>
    </div>
  </div>

  <div v-else class="library-empty-state">
    <n-icon size="40" color="var(--text-tertiary)">
      <LibraryIcon />
    </n-icon>
    <p class="empty-text">
      This photo is not in any collection, series or portfolio yet.
    </p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NIcon, NTag } from "naive-ui";
import { LibraryOutline as LibraryIcon } from "@vicons/ionicons5";

defineOptions({ name: "PhotoInfoLibrarySection" });

const props = defineProps({
  photoLibrary: {
    type: Object,
    default: () => ({ collections: [], series: [], portfolios: [] }),
  },
});

const emit = defineEmits(["navigate-to"]);

const GROUP_ORDER = [
  { key: "collections", label: "Collections", route: "collection-detail" },
  { key: "series", label: "Series", route: "series-detail" },
  { key: "portfolios", label: "Portfolios", route: "portfolio-detail" },
];

const visibleGroups = computed(() =>
  GROUP_ORDER.filter((group) => props.photoLibrary?.[group.key]?.length).map(
    (group) => ({ ...group, entries: props.photoLibrary[group.key] }),
  ),
);
</script>

<style scoped>
.library-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.library-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.block-title {
  margin: 0;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.photo-tag {
  margin: 0;
  font-size: 13px;
}

.library-tag {
  cursor: pointer;
}

.library-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg) var(--spacing-md);
  text-align: center;
}

.library-empty-state .empty-text {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
  margin: 0;
  max-width: 280px;
}
</style>
