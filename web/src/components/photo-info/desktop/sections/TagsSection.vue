<template>
  <div v-if="visibleGroups.length > 0" class="tags-section">
    <div v-for="group in visibleGroups" :key="group.key" class="tag-group-item">
      <h6 class="block-title">{{ group.label }}</h6>

      <!-- Los tags de la nota se rehacen enteros en cada guardado, así que
           mientras corre no se enseñan los viejos: describen un texto que ya no
           existe. En su sitio van tantos huecos como tags había, para que la
           sección no salte de alto al volver. -->
      <div v-if="group.pending" class="tags-list">
        <n-skeleton
          v-for="n in group.placeholderCount"
          :key="`pending-${n}`"
          class="tag-skeleton"
          :width="skeletonWidth(n)"
        />
      </div>

      <div v-else class="tags-list">
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
import { computed, ref, watch } from "vue";
import { NIcon, NSkeleton, NTag } from "naive-ui";
import { getTagIcon } from "@/config/quickSearch.js";

defineOptions({ name: "PhotoInfoTagsSection" });

const props = defineProps({
  groupedTags: { type: Object, default: () => ({}) },
  /** El guardado de la nota está derivando sus tags ahora mismo. */
  isGeneratingNoteTags: { type: Boolean, default: false },
});

/** Clave del grupo que alimenta la nota personal (ver tagCategoryNameMap). */
const PERSONAL_KEY = "personal";

/** Cuántos huecos enseñar la primera vez, cuando no hay tags previos que medir. */
const DEFAULT_PLACEHOLDERS = 5;

const GROUP_ORDER = [
  { key: "contextual", label: "Contextual & Narrative" },
  { key: "technical", label: "Technical" },
  // { key: "artistic", label: "Artistic" },
  { key: "miscellaneous", label: "Miscellaneous" },
  // Al final del bloque, que es donde queda pegado a la sección de notas: los
  // tags y el texto del que salen se leen juntos.
  { key: PERSONAL_KEY, label: "Personal Notes" },
];

// Cuántos tags tenía la nota antes de empezar a regenerarlos. Se congela al
// arrancar: durante la espera el padre ya ha vaciado la lista, y leerla
// entonces daría siempre cero huecos.
const lastPersonalCount = ref(0);

watch(
  () => props.isGeneratingNoteTags,
  (generating) => {
    if (generating) return;
    lastPersonalCount.value = props.groupedTags?.[PERSONAL_KEY]?.length ?? 0;
  },
  { immediate: true },
);

const visibleGroups = computed(() =>
  GROUP_ORDER.filter((group) => {
    if (group.key === PERSONAL_KEY && props.isGeneratingNoteTags) return true;
    return props.groupedTags?.[group.key]?.length;
  }).map((group) => {
    const pending = group.key === PERSONAL_KEY && props.isGeneratingNoteTags;
    return {
      ...group,
      pending,
      placeholderCount: pending
        ? lastPersonalCount.value || DEFAULT_PLACEHOLDERS
        : 0,
      tags: props.groupedTags?.[group.key] ?? [],
    };
  }),
);

// Anchos irregulares: una fila de huecos idénticos se lee como una tabla, no
// como los tags de largo desigual que van a aparecer.
const SKELETON_WIDTHS = [86, 122, 64, 104, 78];
const skeletonWidth = (n) => `${SKELETON_WIDTHS[(n - 1) % SKELETON_WIDTHS.length]}px`;
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

.tag-skeleton {
  height: 22px;
  border-radius: var(--radius-sm, 3px);
}

.tags-empty .empty-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}
</style>
