<template>
  <div v-if="visibleGroups.length > 0" class="tags-section">
    <div v-for="group in visibleGroups" :key="group.key" class="tag-group-item">
      <h6 class="block-title">{{ group.label }}</h6>
      <div class="tags-list">
        <n-tag
          v-for="tag in group.tags"
          :key="tag.id || tag.name || tag"
          type="info"
          :bordered="false"
          class="photo-tag"
        >
          <template #icon>
            <n-icon :component="getTagIcon(tag.group)" />
          </template>
          {{ tag.name || tag }}
        </n-tag>
      </div>
    </div>
  </div>

  <div v-else class="tags-empty">
    <p class="empty-text">No tags for this photo yet.</p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NIcon, NTag } from "naive-ui";
import { getTagIcon } from "@/config/quickSearch.js";

defineOptions({ name: "PhotoInfoTagsSection" });

const props = defineProps({
  groupedTags: { type: Object, default: () => ({}) },
});

const GROUP_ORDER = [
  { key: "contextual", label: "Contextual & Narrative" },
  { key: "technical", label: "Technical" },
  // { key: "artistic", label: "Artistic" },
  { key: "miscellaneous", label: "Miscellaneous" },
];

const visibleGroups = computed(() =>
  GROUP_ORDER.filter((group) => props.groupedTags?.[group.key]?.length).map(
    (group) => ({ ...group, tags: props.groupedTags[group.key] }),
  ),
);
</script>

<style scoped>
.tags-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.tag-group-item {
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
  font-size: 11px;
}

/* El icono del grupo hereda el tamaño del tag, y a igual em el glifo pesa más
   que el texto: un punto por debajo lo deja ópticamente a la par. */
.photo-tag :deep(.n-tag__icon) {
  font-size: 11px;
}

.tags-empty .empty-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}
</style>
