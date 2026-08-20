<template>
  <n-modal
    :show="true"
    preset="card"
    title="Configure quick search"
    class="qs-config-modal"
    :style="{ maxWidth: '92vw', width: '560px' }"
    @update:show="emit('close')"
  >
    <div class="qs-config-body">
      <!-- Genres -->
      <section class="qs-config-section">
        <div class="qs-config-section-header">
          <div class="qs-config-heading">
            <span class="qs-config-title">Genres</span>
            <span class="qs-config-hint">
              Pick the genres you want one click away.
            </span>
          </div>
          <n-switch v-model:value="draft.showGenres" size="small" />
        </div>

        <div v-if="draft.showGenres" class="qs-config-pills">
          <n-button
            v-for="chip in availableGenres"
            :key="chip.key"
            size="small"
            secondary
            :type="
              draft.genres.includes(chip.value) ? GENRE_PILL_TYPE : 'default'
            "
            class="qs-pill qs-pill--genre"
            :class="{ 'is-active': draft.genres.includes(chip.value) }"
            :focusable="false"
            @click="toggleGenre(chip.value)"
          >
            <template #icon>
              <n-icon :component="chip.icon" />
            </template>
            {{ chip.label }}
            <span v-if="chip.count > 0" class="qs-pill-count">
              {{ chip.count }}
            </span>
          </n-button>
        </div>
      </section>

      <!-- Tags -->
      <section class="qs-config-section">
        <div class="qs-config-section-header">
          <div class="qs-config-heading">
            <span class="qs-config-title">Tags</span>
            <span class="qs-config-hint">
              Pick the tags you want one click away, from the ones you use most.
            </span>
          </div>
          <n-switch v-model:value="draft.showTags" size="small" />
        </div>

        <template v-if="draft.showTags">
          <!-- <n-select
            :value="selectedTagNames"
            v-model:show="tagDropdownShow"
            multiple
            filterable
            clearable
            remote
            size="small"
            placeholder="Search tags..."
            :options="tagOptions"
            :filter="() => true"
            :clear-filter-after-select="true"
            @search="onSearchInputIncluded"
            @update:value="handleSelectChange"
          >
            <template #empty>
              <div class="qs-config-empty">Start typing to search tags...</div>
            </template>
          </n-select> -->

          <!-- Lo elegido primero, y detrás el resto de tus tags más
               frecuentes: elegir los habituales no debería obligar a
               escribirlos uno a uno en el buscador. La lista es larga y
               crece con el catálogo, así que scrollea dentro de su caja en
               lugar de estirar el modal hasta salirse de la pantalla. -->
          <div class="qs-config-pills qs-config-tags scrollbar-minimal">
            <n-button
              v-for="chip in tagPickerChips"
              :key="chip.key"
              size="tiny"
              secondary
              :type="chip.selected ? TAG_PILL_TYPE : 'default'"
              class="qs-pill qs-pill--tag"
              :class="{ 'is-active': chip.selected }"
              :focusable="false"
              @click="toggleTag(chip)"
            >
              <template #icon>
                <n-icon :component="chip.icon" />
              </template>
              {{ chip.label }}
              <span v-if="chip.count" class="qs-pill-count">
                {{ chip.count }}
              </span>
            </n-button>
          </div>
          <span
            v-if="selectedTagNames.length === 0"
            class="qs-config-empty-hint"
          >
            No tags selected — the bar will fall back to your most frequent
            ones.
          </span>
        </template>
      </section>
    </div>

    <template #footer>
      <div class="qs-config-footer">
        <n-button size="small" quaternary @click="handleRestoreDefaults">
          Restore defaults
        </n-button>
        <div class="qs-config-footer-right">
          <n-button size="small" @click="emit('close')">Cancel</n-button>
          <n-button size="small" type="primary" @click="handleApply">
            Apply
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed } from "vue";
import { NButton, NIcon, NModal, NSelect, NSwitch } from "naive-ui";
import { useSearchTags } from "@/composables/useSearchTags.js";
import {
  GENRE_PILL_TYPE,
  TAG_PILL_TYPE,
  formatChipLabel,
  getTagIcon,
} from "@/config/quickSearch.js";

const props = defineProps({
  /** Config vigente (forma de createDefaultQuickSearchConfig) */
  config: { type: Object, required: true },
  /** Chips de género que ofrece el perfil, con su conteo */
  availableGenres: { type: Array, default: () => [] },
  /** Tags más presentes del catálogo, para elegir sin pasar por el buscador */
  availableTags: { type: Array, default: () => [] },
  /** Chips visibles ahora mismo en la barra (incluye el modo automático) */
  currentGenres: { type: Array, default: () => [] },
  currentTags: { type: Array, default: () => [] },
});

const emit = defineEmits(["close", "save", "reset"]);

// El componente se monta al abrir el modal, así que el estado inicial se toma
// aquí una sola vez: sin watchers que dependan del orden en que llegan los
// chips. Se parte de lo que el usuario ve en la barra, de modo que configurar
// a mano continúe desde el automático en lugar de empezar en blanco.
const draft = ref({
  showGenres: props.config.showGenres,
  showTags: props.config.showTags,
  genres: props.currentGenres.map((chip) => chip.value),
});

const selectedTagNames = ref(props.currentTags.map((chip) => chip.value));

/** name → group: decide el icono de cada tag elegido. */
const tagGroupByName = ref(
  new Map(props.currentTags.map((chip) => [chip.value, chip.group ?? null])),
);

// Buscador general del catálogo de tags (mismo composable que el resto de la
// app), para lo que no esté entre los frecuentes de la parrilla.
const { includedTagSuggestions, onSearchInputIncluded } = useSearchTags();

const tagDropdownShow = ref(false);

const rememberGroup = (name, group) => {
  if (tagGroupByName.value.has(name)) return;
  tagGroupByName.value = new Map(tagGroupByName.value).set(name, group ?? null);
};

const toggleGenre = (genre) => {
  draft.value.genres = draft.value.genres.includes(genre)
    ? draft.value.genres.filter((g) => g !== genre)
    : [...draft.value.genres, genre];
};

/**
 * Parrilla de elección rápida: lo ya elegido delante (para poder quitarlo) y
 * detrás los tags más presentes del catálogo que aún no lo están.
 */
const tagPickerChips = computed(() => {
  const chosen = new Set(selectedTagNames.value);
  const countByName = new Map(
    props.availableTags.map((chip) => [chip.value, chip.count]),
  );

  const selected = selectedTagNames.value.map((name) => ({
    key: `tag:${name}`,
    value: name,
    label: formatChipLabel(name),
    icon: getTagIcon(tagGroupByName.value.get(name)),
    count: countByName.get(name) ?? null,
    group: tagGroupByName.value.get(name) ?? null,
    selected: true,
  }));

  const frequent = props.availableTags
    .filter((chip) => !chosen.has(chip.value))
    .map((chip) => ({ ...chip, selected: false }));

  return [...selected, ...frequent];
});

// Las opciones vienen solo de la búsqueda: los frecuentes tienen su parrilla
// justo debajo y sembrarlos aquí solo camuflaría los resultados. Los ya
// elegidos se añaden al final para que n-select sepa etiquetarlos.
const tagOptions = computed(() => {
  const chosen = new Set(selectedTagNames.value);
  const options = includedTagSuggestions.value
    .filter((tag) => !chosen.has(tag.value))
    .map((tag) => ({ label: tag.label, value: tag.value, group: tag.group }));

  for (const name of selectedTagNames.value) {
    options.push({ label: formatChipLabel(name), value: name });
  }
  return options;
});

// `clearable` devuelve null al vaciar el select, no un array.
const handleSelectChange = (value, options) => {
  selectedTagNames.value = Array.isArray(value) ? value : [];
  for (const option of Array.isArray(options) ? options : [options]) {
    if (option?.value) rememberGroup(option.value, option.group);
  }
  tagDropdownShow.value = false;
};

const toggleTag = (chip) => {
  if (chip.selected) {
    selectedTagNames.value = selectedTagNames.value.filter(
      (tag) => tag !== chip.value,
    );
    return;
  }
  rememberGroup(chip.value, chip.group);
  selectedTagNames.value = [...selectedTagNames.value, chip.value];
};

const handleApply = () => {
  emit("save", {
    showGenres: draft.value.showGenres,
    genres: draft.value.genres,
    showTags: draft.value.showTags,
    tags: selectedTagNames.value.map((name) => ({
      name,
      group: tagGroupByName.value.get(name) ?? null,
    })),
  });
  emit("close");
};

const handleRestoreDefaults = () => {
  emit("reset");
  emit("close");
};
</script>

<style src="./quickSearchPills.css"></style>

<style scoped>
.qs-config-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl, 20px);
}

.qs-config-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qs-config-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md, 12px);
}

.qs-config-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.qs-config-title {
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
}

.qs-config-hint {
  font-size: var(--font-size-sm, 12px);
  color: var(--text-tertiary, var(--text-secondary));
  line-height: var(--line-height-normal, 1.4);
}

.qs-config-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qs-config-tags {
  max-height: clamp(180px, 36vh, 280px);
  overflow-y: auto;
  /* Sin esto, flex-wrap reparte el alto sobrante entre las filas y las pills
     quedan flotando separadas cuando hay pocas. */
  align-content: flex-start;
  padding: 8px;
  padding-right: 6px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm, 8px);
}

.qs-config-empty {
  padding: var(--spacing-sm, 8px);
  color: var(--text-tertiary, var(--text-secondary));
  font-size: var(--font-size-sm, 12px);
}

.qs-config-empty-hint {
  font-size: var(--font-size-sm, 12px);
  color: var(--text-tertiary, var(--text-secondary));
}

.qs-config-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md, 12px);
}

.qs-config-footer-right {
  display: flex;
  gap: 8px;
}

@media (max-width: 600px) {
  .qs-config-section-header {
    align-items: center;
  }

  .qs-config-hint {
    display: none;
  }
}
</style>
