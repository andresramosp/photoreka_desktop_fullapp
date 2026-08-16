<template>
  <div class="quick-search-bar">
    <!-- Emblema de la barra, simétrico al trofeo de la de ranking -->
    <n-icon size="18" class="qs-icon" :component="Flash20Regular" />

    <!-- Zona scrollable: géneros + tags predominantes -->
    <n-button
      v-if="isOverflowing && fadeStart"
      text
      class="qs-arrow"
      :focusable="false"
      aria-label="Scroll left"
      @click="scrollPills(-1)"
    >
      <n-icon :component="ChevronBackOutline" />
    </n-button>

    <div
      ref="pillsRef"
      class="qs-pills"
      :class="{ 'qs-fade-start': fadeStart, 'qs-fade-end': fadeEnd }"
      @scroll.passive="updateOverflow"
      @wheel="onWheel"
    >
      <!-- Genres -->
      <div v-if="genrePills.length > 0" class="qs-group">
        <n-tooltip
          v-for="chip in genrePills"
          :key="chip.key"
          trigger="hover"
          placement="bottom"
          :delay="400"
        >
          <template #trigger>
            <n-button
              :size="pillSize"
              secondary
              :type="chip.type"
              class="qs-pill qs-pill--genre"
              :class="{ 'is-active': chip.active }"
              :focusable="false"
              @click="toggleGenre(chip.value)"
            >
              <template #icon>
                <n-icon :size="15" :component="chip.icon" />
              </template>
              {{ chip.label }}
            </n-button>
          </template>
          {{ chip.count }} {{ chip.count === 1 ? "photo" : "photos" }}
        </n-tooltip>
      </div>

      <div
        v-if="genreChips.length > 0 && showTagsBlock"
        class="qs-divider"
        aria-hidden="true"
      />

      <!-- Tags -->
      <div v-if="isLoadingTags" class="qs-group">
        <n-skeleton
          v-for="n in 4"
          :key="`qs-skeleton-${n}`"
          class="qs-skeleton"
        />
      </div>
      <div v-else-if="tagPills.length > 0" class="qs-group">
        <n-tooltip
          v-for="chip in tagPills"
          :key="chip.key"
          trigger="hover"
          placement="bottom"
          :delay="400"
        >
          <template #trigger>
            <n-button
              :size="pillSize"
              secondary
              :type="chip.type"
              class="qs-pill qs-pill--tag"
              :class="{ 'is-active': chip.active }"
              :focusable="false"
              @click="toggleTag(chip.value)"
            >
              <template #icon>
                <n-icon :size="15" :component="chip.icon" />
              </template>
              {{ chip.label }}
            </n-button>
          </template>
          {{
            chip.count
              ? `${chip.count} ${chip.count === 1 ? "photo" : "photos"}`
              : chip.group || "tag"
          }}
        </n-tooltip>
      </div>

      <span v-if="isEmpty" class="qs-empty">
        Quick search is off — configure it to bring your genres and tags here.
      </span>
    </div>

    <n-button
      v-if="isOverflowing && fadeEnd"
      text
      class="qs-arrow"
      :focusable="false"
      aria-label="Scroll right"
      @click="scrollPills(1)"
    >
      <n-icon :component="ChevronForwardOutline" />
    </n-button>

    <!-- Buscador de tags: fuera del scroll. En móvil no cabe sin robarle una
         línea entera a la grilla, así que allí solo quedan los pills. -->
    <div v-if="!isMobile" class="qs-search">
      <n-select
        :value="selectedTags"
        v-model:show="tagDropdownShow"
        multiple
        filterable
        clearable
        remote
        size="small"
        placeholder="Search any tags..."
        :options="tagSuggestions"
        :filter="() => true"
        :clear-filter-after-select="true"
        :max-tag-count="1"
        :ignore-composition="false"
        @search="onSearchInputIncluded"
        @update:value="handleTagSelectChange"
      >
        <template #empty>
          <div class="qs-select-empty">Start typing to search tags...</div>
        </template>
      </n-select>
    </div>

    <div class="qs-actions">
      <n-button
        v-if="hasSelection"
        text
        size="small"
        class="qs-clear"
        :focusable="false"
        @click="clearAll"
      >
        Clear
      </n-button>
      <n-tooltip trigger="hover" placement="bottom">
        <template #trigger>
          <n-button
            quaternary
            :size="pillSize"
            class="qs-config-btn"
            :focusable="false"
            @click="showConfig = true"
          >
            <template #icon>
              <n-icon :component="OptionsOutline" />
            </template>
          </n-button>
        </template>
        Configure quick search
      </n-tooltip>
    </div>

    <!-- Se monta al abrir: así toma su estado inicial de unos chips que ya
         están cargados, sin depender de cuándo llegan los top tags. -->
    <QuickSearchConfigModal
      v-if="showConfig"
      :config="config"
      :available-genres="availableGenres"
      :available-tags="availableTags"
      :current-genres="genreChips"
      :current-tags="tagChips"
      @save="save"
      @reset="reset"
      @close="showConfig = false"
    />
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { NButton, NIcon, NSelect, NSkeleton, NTooltip } from "naive-ui";
import {
  ChevronBackOutline,
  ChevronForwardOutline,
  OptionsOutline,
} from "@vicons/ionicons5";
// Fluent, como el trofeo de ScoresToolbar: los dos emblemas comparten trazo.
import { Flash20Regular } from "@vicons/fluent";
import { GENRE_PILL_TYPE, TAG_PILL_TYPE } from "@/config/quickSearch.js";
import { useUserStore } from "@/stores/userStore";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useSearchTags } from "@/composables/useSearchTags.js";
import { useQuickSearchConfig } from "@/composables/quick-search/useQuickSearchConfig.js";
import { useQuickSearchGenres } from "@/composables/quick-search/useQuickSearchGenres.js";
import { useQuickSearchTags } from "@/composables/quick-search/useQuickSearchTags.js";
import { useQuickSearchFilter } from "@/composables/quick-search/useQuickSearchFilter.js";
import QuickSearchConfigModal from "./QuickSearchConfigModal.vue";

const props = defineProps({
  /** Catálogo procesado: de aquí sale el ranking de géneros */
  photos: { type: Array, default: () => [] },
});

const emit = defineEmits(["update:tagResults", "update:searching"]);

/**
 * Géneros activos. Es un v-model porque la grilla los comparte con su panel de
 * filtros: marcar un chip enciende el filtro del panel y viceversa.
 */
const selectedGenres = defineModel("genres", {
  type: Array,
  default: () => [],
});

const userStore = useUserStore();
const { isMobile } = useIsMobile();

const { config, save, reset } = useQuickSearchConfig(() => userStore.user?.id);

const { genreChips, availableGenres } = useQuickSearchGenres({
  photos: () => props.photos,
  profile: () => userStore.user?.profiles,
  config,
});

const {
  tagChips,
  availableTags,
  isLoading: isLoadingTopTags,
  hasLoaded,
  load: loadTopTags,
} = useQuickSearchTags({ config });

// Un único conjunto de tags activos para los pills y el buscador: el select
// muestra siempre todo lo que está filtrando, venga del chip o de la búsqueda.
const { selectedTags, tagResults, isSearchingTags, toggleTag, clearTags } =
  useQuickSearchFilter();

const { includedTagSuggestions, onSearchInputIncluded } = useSearchTags();

const showConfig = ref(false);
const tagDropdownShow = ref(false);
const pillSize = computed(() => (isMobile.value ? "tiny" : "small"));

const isLoadingTags = computed(
  () => isLoadingTopTags.value && !hasLoaded.value && config.value.showTags,
);
const showTagsBlock = computed(
  () => tagChips.value.length > 0 || isLoadingTags.value,
);
const isEmpty = computed(
  () =>
    genreChips.value.length === 0 &&
    tagChips.value.length === 0 &&
    !isLoadingTags.value,
);

const hasSelection = computed(
  () => selectedGenres.value.length > 0 || selectedTags.value.length > 0,
);

// El estado activo viaja dentro del propio chip, no como condición suelta en el
// template. Cada pill vive en el slot #trigger de un n-tooltip, que lo ejecuta
// en SU render: si la selección solo se leyera ahí dentro, repintar la pill
// dependería de que se invalide el render del tooltip y no el de esta barra.
// Metiéndola en el computed que recorre el v-for, quien se invalida es la barra.
const genrePills = computed(() =>
  genreChips.value.map((chip) => {
    const active = selectedGenres.value.includes(chip.value);
    return { ...chip, active, type: active ? GENRE_PILL_TYPE : "default" };
  }),
);

const tagPills = computed(() =>
  tagChips.value.map((chip) => {
    const active = selectedTags.value.includes(chip.value);
    return { ...chip, active, type: active ? TAG_PILL_TYPE : "default" };
  }),
);

// Las opciones ya elegidas se retiran del desplegable: n-select las pinta
// igualmente como tags del input y verlas dos veces confunde.
const tagSuggestions = computed(() => {
  const chosen = new Set(selectedTags.value);
  return includedTagSuggestions.value.filter((tag) => !chosen.has(tag.value));
});

// `clearable` devuelve null al vaciar el select, no un array.
const handleTagSelectChange = (value) => {
  selectedTags.value = Array.isArray(value) ? value : [];
  tagDropdownShow.value = false;
};

const isGenreActive = (genre) => selectedGenres.value.includes(genre);

const toggleGenre = (genre) => {
  selectedGenres.value = isGenreActive(genre)
    ? selectedGenres.value.filter((value) => value !== genre)
    : [...selectedGenres.value, genre];
};

const clearAll = () => {
  selectedGenres.value = [];
  clearTags();
};

// La grilla es la dueña del filtro de tags; la barra solo le pasa el resultado.
watch(tagResults, (results) => emit("update:tagResults", results));

// El filtro por tags va contra el back: la vista tapa la grilla mientras dure,
// igual que en la carga inicial. Los géneros no lo necesitan (son de cliente).
watch(isSearchingTags, (searching) => emit("update:searching", searching), {
  immediate: true,
});

// ── Desbordamiento horizontal ────────────────────────────────
// Los pills scrollan en lugar de envolverse: la barra nunca crece en alto, que
// es altura que la grilla pierde. Flechas + degradados avisan de que hay más.
const pillsRef = ref(null);
const isOverflowing = ref(false);
const fadeStart = ref(false);
const fadeEnd = ref(false);
let resizeObserver = null;

const updateOverflow = () => {
  const el = pillsRef.value;
  if (!el) return;
  const maxScroll = el.scrollWidth - el.clientWidth;
  isOverflowing.value = maxScroll > 2 && !isMobile.value;
  fadeStart.value = el.scrollLeft > 2;
  fadeEnd.value = maxScroll > 2 && el.scrollLeft < maxScroll - 2;
};

const scrollPills = (direction) => {
  const el = pillsRef.value;
  if (!el) return;
  el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
};

// Rueda de ratón normal solo manda deltaY: la convertimos a scroll horizontal.
// El swipe horizontal de trackpad ya manda deltaX y lo maneja el navegador solo,
// así que lo dejamos pasar tal cual. Ojo: behavior "auto" NO es instantáneo, la
// spec dice que "auto" cae de vuelta al scroll-behavior del CSS (smooth, porque
// lo usan las flechas), así que cada tick de la rueda seguía animando y en
// Windows —donde la rueda dispara muchos eventos seguidos— se encolaban y el
// scroll se enfangaba. "instant" sí ignora el CSS y salta directo.
const onWheel = (event) => {
  const el = pillsRef.value;
  if (!el || !isOverflowing.value) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  el.scrollTo({ left: el.scrollLeft + event.deltaY, behavior: "instant" });
  event.preventDefault();
};

watch([genreChips, tagChips, isMobile], () => nextTick(updateOverflow));

onMounted(() => {
  loadTopTags();
  updateOverflow();
  if (typeof ResizeObserver !== "undefined" && pillsRef.value) {
    resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(pillsRef.value);
  }
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style src="./quickSearchPills.css"></style>

<style scoped>
.quick-search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs, 8px);
  padding: 8px 10px;
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  min-width: 0;
}

.qs-icon {
  flex-shrink: 0;
  color: var(--primary-color);
}

.qs-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

.qs-pills::-webkit-scrollbar {
  display: none;
}

/* Degradados solo por el lado que realmente tiene contenido oculto */
.qs-pills.qs-fade-end {
  mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
}

.qs-pills.qs-fade-start {
  mask-image: linear-gradient(to left, #000 calc(100% - 28px), transparent);
}

.qs-pills.qs-fade-start.qs-fade-end {
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 28px,
    #000 calc(100% - 28px),
    transparent
  );
}

.qs-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.qs-arrow {
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--text-secondary);
}

.qs-arrow:hover:not(.n-button--disabled) {
  color: var(--primary-color);
}

.qs-divider {
  flex-shrink: 0;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: var(--border-color);
}

.qs-skeleton {
  flex-shrink: 0;
  width: 84px;
  height: 28px;
  border-radius: var(--radius-sm, 4px);
}

.qs-empty {
  font-size: var(--font-size-xs, 11px);
  color: var(--text-tertiary, var(--text-secondary));
  white-space: nowrap;
}

/* Buscador de tags: es el elemento elástico de la fila. Se queda el espacio que
   sobre cuando los pills no llenan la barra —así no queda un hueco muerto y hay
   más sitio para los tags elegidos— pero nunca encoge por debajo de su base:
   cuando los pills desbordan, el que scrollea es su carril, no este buscador. */
.qs-search {
  flex: 1 0 270px;
  min-width: 0;
  max-width: 420px;
}

.qs-select-empty {
  padding: 8px;
  color: var(--text-tertiary, var(--text-secondary));
  font-size: var(--font-size-xs, 11px);
}

.qs-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-left: 6px;
  border-left: 1px solid var(--border-color);
}

.qs-clear {
  font-size: 11px;
  color: var(--text-secondary);
}

.qs-clear:hover {
  color: var(--warning-color);
}

@media (max-width: 1100px) {
  .qs-search {
    flex-basis: 170px;
  }
}

/* Móvil: sin buscador, solo pills, que se scrollan con el dedo; las flechas
   sobran (updateOverflow ya las apaga). */
@media (max-width: 767px) {
  .quick-search-bar {
    padding: 6px 8px;
  }

  .qs-icon {
    display: none;
  }

  .qs-divider {
    display: none;
  }

  .qs-empty {
    white-space: normal;
  }
}
</style>
