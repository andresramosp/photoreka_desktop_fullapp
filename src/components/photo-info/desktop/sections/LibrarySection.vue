<template>
  <!-- Los tres grupos se pintan siempre. Cada uno se explica solo cuando esta
       vacio, en vez de un unico estado vacio para toda la seccion: asi el
       bloque mantiene su altura y ademas dice que le falta a la foto. -->
  <div class="library-section">
    <div v-for="group in groups" :key="group.key" class="library-group">
      <h6 class="block-title">{{ group.label }}</h6>

      <div v-if="group.entries.length > 0" class="tags-list">
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

      <p v-else class="group-empty">{{ group.emptyText }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { NTag } from "naive-ui";

defineOptions({ name: "PhotoInfoLibrarySection" });

const props = defineProps({
  photoLibrary: {
    type: Object,
    default: () => ({ collections: [], series: [], portfolios: [] }),
  },
});

const emit = defineEmits(["navigate-to"]);

const GROUPS = [
  {
    key: "collections",
    label: "Collections",
    route: "collection-detail",
    emptyText: "This photo is not in any collection yet.",
  },
  {
    key: "series",
    label: "Series",
    route: "series-detail",
    emptyText: "This photo is not in any series yet.",
  },
  {
    key: "portfolios",
    label: "Portfolios",
    route: "portfolio-detail",
    emptyText: "This photo is not in any portfolio yet.",
  },
];

const groups = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    entries: props.photoLibrary?.[group.key] ?? [],
  })),
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

.group-empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}
</style>
