<template>
  <div class="info-panel">
    <!-- Las pestañas ya no ocultan contenido: son atajos al bloque
         correspondiente del scroll de abajo, y se resaltan solas al hacer
         scroll a mano. -->
    <div class="panel-tabs">
      <n-tabs
        type="line"
        size="small"
        :value="activeKey"
        @update:value="scrollToSection"
      >
        <n-tab
          v-for="section in sections"
          :key="section.key"
          :name="section.key"
        >
          <div class="tab-content">
            <n-icon size="16"><component :is="section.icon" /></n-icon>
            <span>{{ section.label }}</span>
          </div>
        </n-tab>
      </n-tabs>
    </div>

    <div ref="scrollEl" class="panel-scroll" @scroll.passive="onScroll">
      <section :ref="(el) => setSectionEl('scores', el)" class="panel-section">
        <h5 class="section-heading">Scores</h5>
        <ScoresSection
          :selected-photo="selectedPhoto"
          :score-scale="scoreScale"
          :selected-genre="selectedGenre"
          :show-custom-weights="showCustomWeights"
          :artistic-score-weights="artisticScoreWeights"
          :ordered-artistic-scores="orderedArtisticScores"
          :available-genre-presets="availableGenrePresets"
          :format-criterion-name="formatCriterionName"
          :get-score-bg-color="getScoreBgColor"
          @apply-genre-preset="emit('apply-genre-preset', $event)"
          @update:artistic-score-weights="
            emit('update:artistic-score-weights', $event)
          "
        />
      </section>
      <section :ref="(el) => setSectionEl('info', el)" class="panel-section">
        <h5 class="section-heading">Info</h5>
        <InfoSection
          :selected-photo="selectedPhoto"
          :format-date="formatDate"
          :format-exposure-time="formatExposureTime"
          :format-category-name="formatCategoryName"
        />
      </section>

      <section :ref="(el) => setSectionEl('tags', el)" class="panel-section">
        <h5 class="section-heading">Tags</h5>
        <TagsSection :grouped-tags="groupedTags" />
      </section>

      <section :ref="(el) => setSectionEl('map', el)" class="panel-section">
        <h5 class="section-heading">Location</h5>
        <PhotoGeoTab
          :photo="selectedPhoto"
          @request-close="emit('request-close')"
        />
      </section>

      <section :ref="(el) => setSectionEl('notes', el)" class="panel-section">
        <h5 class="section-heading">Description / Notes</h5>
        <NotesSection
          :selected-photo="selectedPhoto"
          :photo-notes="photoNotes"
          :word-count="wordCount"
          :is-saving-notes="isSavingNotes"
          @update:photo-notes="emit('update:photo-notes', $event)"
          @update-word-count="emit('update-word-count')"
          @save-notes="emit('save-notes')"
        />
      </section>

      <section
        :ref="(el) => setSectionEl('library', el)"
        class="panel-section is-last"
      >
        <h5 class="section-heading">Library</h5>
        <LibrarySection
          :photo-library="photoLibrary"
          @navigate-to="(route, id) => emit('navigate-to-route', route, id)"
        />
      </section>
    </div>

    <!-- La nota global se queda siempre a la vista, sin depender del scroll. -->
    <div v-if="hasScores" class="panel-footer">
      <span class="overall-value">
        {{ overallRating.average }}/{{ scoreScale.max }}
      </span>
      <span class="overall-rating-text" :class="ratingClass">
        {{ overallRating.rating }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { NIcon, NTab, NTabs } from "naive-ui";
import {
  InformationCircleOutline as InfoIcon,
  PricetagOutline as TagIcon,
  GlobeOutline as MapIcon,
  CreateOutline as EditIcon,
  LibraryOutline as LibraryIcon,
} from "@vicons/ionicons5";
import { Trophy20Regular as ScoresIcon } from "@vicons/fluent";
import InfoSection from "./sections/InfoSection.vue";
import ScoresSection from "./sections/ScoresSection.vue";
import TagsSection from "./sections/TagsSection.vue";
import NotesSection from "./sections/NotesSection.vue";
import LibrarySection from "./sections/LibrarySection.vue";
import PhotoGeoTab from "../PhotoGeoTab.vue";

defineOptions({ name: "PhotoInfoPanel" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  groupedTags: { type: Object, default: () => ({}) },
  photoNotes: { type: String, default: "" },
  wordCount: { type: Number, default: 0 },
  isSavingNotes: { type: Boolean, default: false },
  overallRating: {
    type: Object,
    default: () => ({ average: 0, rating: "N/A" }),
  },
  scoreScale: { type: Object, default: () => ({ max: 9 }) },
  selectedGenre: { type: String, default: "general" },
  showCustomWeights: { type: Boolean, default: false },
  artisticScoreWeights: { type: Object, default: () => ({}) },
  orderedArtisticScores: { type: Array, default: () => [] },
  availableGenrePresets: { type: Array, default: () => [] },
  photoLibrary: {
    type: Object,
    default: () => ({ collections: [], series: [], portfolios: [] }),
  },
  formatDate: { type: Function, default: (d) => d },
  formatExposureTime: { type: Function, default: (e) => e },
  formatCategoryName: { type: Function, default: (c) => c },
  formatCriterionName: { type: Function, default: (c) => c },
  getScoreBgColor: { type: Function, default: () => "#ccc" },
});

const emit = defineEmits([
  "apply-genre-preset",
  "update:artistic-score-weights",
  "update:photo-notes",
  "update-word-count",
  "save-notes",
  "navigate-to-route",
  "request-close",
  "section-change",
]);

const sections = [
  { key: "info", label: "Info", icon: InfoIcon },
  { key: "scores", label: "Scores", icon: ScoresIcon },
  { key: "tags", label: "Tags", icon: TagIcon },
  { key: "map", label: "Map", icon: MapIcon },
  { key: "notes", label: "Notes", icon: EditIcon },
  { key: "library", label: "Library", icon: LibraryIcon },
];

const scrollEl = ref(null);
const activeKey = ref(sections[0].key);
const sectionEls = new Map();

const setSectionEl = (key, el) => {
  if (el) sectionEls.set(key, el);
  else sectionEls.delete(key);
};

const hasScores = computed(() =>
  Boolean(props.selectedPhoto?.descriptions?.artistic_scores),
);

const ratingClass = computed(
  () =>
    "rating-" +
    String(props.overallRating.rating || "")
      .toLowerCase()
      .replace(" ", "-")
      .replace("/", ""),
);

// Distancia por encima del borde superior a la que una seccion se considera
// "la actual". Sin este margen el tab salta una seccion antes de tiempo.
const ACTIVE_OFFSET = 24;

// Ventana en la que se ignora el scroll por venir de un salto de pestaña, y
// tope duro por si el scroll suave se queda a medias.
let programmaticUntil = 0;
let programmaticDeadline = 0;
let rafId = null;

const setActive = (key) => {
  activeKey.value = key;
};

const computeActive = () => {
  rafId = null;
  const el = scrollEl.value;
  if (!el) return;

  // Al final del scroll gana siempre la ultima seccion: si no, una seccion
  // corta al fondo nunca llegaria a marcarse. Solo aplica si hay recorrido:
  // con el panel entero a la vista, el tab correcto es el primero.
  const overflow = el.scrollHeight - el.clientHeight;
  if (overflow > 8 && el.scrollTop >= overflow - 4) {
    setActive(sections[sections.length - 1].key);
    return;
  }

  let current = sections[0].key;
  for (const section of sections) {
    const node = sectionEls.get(section.key);
    if (!node) continue;
    if (node.offsetTop - ACTIVE_OFFSET <= el.scrollTop) current = section.key;
    else break;
  }
  setActive(current);
};

const onScroll = () => {
  // Durante un salto programatico el scroll atraviesa secciones intermedias;
  // ignorarlas evita que la pestaña activa parpadee por el camino. La ventana
  // se va aplazando mientras el scroll suave siga llegando (su duracion
  // depende de la distancia), con un tope duro para no quedarse colgada.
  const now = performance.now();
  if (now < programmaticUntil) {
    programmaticUntil = Math.min(now + 150, programmaticDeadline);
    return;
  }
  if (rafId !== null) return;
  rafId = requestAnimationFrame(computeActive);
};

const scrollToSection = (key) => {
  const el = scrollEl.value;
  const node = sectionEls.get(key);
  if (!el || !node) return;

  const now = performance.now();
  programmaticUntil = now + 250;
  programmaticDeadline = now + 1500;
  setActive(key);
  el.scrollTo({ top: Math.max(0, node.offsetTop - 8), behavior: "smooth" });
  // Solo se registra el salto deliberado por pestaña; marcar la seccion al
  // hacer scroll a mano llenaria el log de eventos por cada rueda de raton.
  emit("section-change", key);
};

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});

defineExpose({ scrollToSection });
</script>

<style scoped>
.info-panel {
  flex: 0 0 var(--panel-width, 520px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.panel-tabs {
  flex: 0 0 auto;
  padding: 0 var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
}

.tab-content {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

/* position: relative es lo que hace que offsetTop de cada seccion se mida
   contra este contenedor, que es de lo que vive el scrollspy. */
.panel-scroll {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 var(--spacing-md);
}

.panel-section {
  padding: var(--spacing-lg) 0;
  border-bottom: 1px solid var(--border-color);
}

.panel-section.is-last {
  border-bottom: none;
}

.section-heading {
  margin: 0 0 var(--spacing-md) 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.panel-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--border-color);
  background: var(--bg-container);
}

.overall-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.overall-rating-text {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Rating color classes */
.rating-disastrous {
  background: #7f1d1d;
  color: white;
}
.rating-very-poor {
  background: #b91c1c;
  color: white;
}
.rating-poor {
  background: #ef4444;
  color: white;
}
.rating-needs-improvement {
  background: #f87171;
  color: white;
}
.rating-acceptable {
  background: #f59e0b;
  color: white;
}
.rating-good {
  background: #10b981;
  color: white;
}
.rating-very-good {
  background: #22d3ee;
  color: white;
}
.rating-remarkable {
  background: #3b82f6;
  color: white;
}
.rating-excellent {
  background: #6366f1;
  color: white;
}
.rating-outstanding {
  background: #7c3aed;
  color: white;
}
</style>
