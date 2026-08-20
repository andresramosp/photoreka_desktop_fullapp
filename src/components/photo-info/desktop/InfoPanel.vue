<template>
  <div class="info-panel">
    <!-- Las pestañas ya no ocultan contenido: son atajos al bloque
         correspondiente del scroll de abajo, y se resaltan solas al hacer
         scroll a mano.
         justify-content reparte las seis a lo ancho del panel. Ademas quita el
         espaciador .n-tabs-scroll-padding que naive mete delante de la primera
         pestaña: ese hueco desplazaba las pestañas pero no la barra azul, que
         se posiciona con el offsetLeft crudo de la pestaña activa. -->
    <div class="panel-tabs">
      <n-tabs
        ref="tabsRef"
        type="line"
        size="small"
        justify-content="space-evenly"
        :value="activeKey"
        @update:value="scrollToSection"
      >
        <n-tab v-for="section in sections" :key="section.key" :name="section.key">
          <div class="tab-content">
            <n-icon size="15"><component :is="section.icon" /></n-icon>
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
          :overall-rating="overallRating"
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

      <section
        :ref="(el) => setSectionEl('notes', el)"
        class="panel-section"
      >
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
        class="panel-section"
      >
        <h5 class="section-heading">Library</h5>
        <LibrarySection
          :photo-library="photoLibrary"
          @navigate-to="(route, id) => emit('navigate-to-route', route, id)"
        />
      </section>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from "vue";
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

defineProps({
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

// El orden manda dos veces: es el de las pestañas y el del scroll, y el
// scrollspy da por hecho que coinciden. Mover una seccion es moverla aqui y en
// el bloque de arriba a la vez.
const sections = [
  { key: "scores", label: "Scores", icon: ScoresIcon },
  { key: "info", label: "Info", icon: InfoIcon },
  { key: "tags", label: "Tags", icon: TagIcon },
  { key: "map", label: "Map", icon: MapIcon },
  { key: "notes", label: "Notes", icon: EditIcon },
  { key: "library", label: "Library", icon: LibraryIcon },
];

const scrollEl = ref(null);
const tabsRef = ref(null);
const activeKey = ref(sections[0].key);
const sectionEls = new Map();

const setSectionEl = (key, el) => {
  if (el) sectionEls.set(key, el);
  else sectionEls.delete(key);
};

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

// El modal entra con una animacion de escala y ancho propio: si la barra azul
// se midio antes de que el panel tuviera su ancho final, esto la recoloca.
const syncTabs = () => tabsRef.value?.syncBarPosition();

defineExpose({ scrollToSection, syncTabs });
</script>


<style scoped>
.info-panel {
  flex: 0 0 var(--panel-width, 520px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--bg-surface));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* Tintada con el color de texto y no con un token de fondo: --bg-card y
   --bg-surface son el mismo blanco en tema claro, asi que un token dejaria la
   barra indistinguible del panel. */
.panel-tabs {
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  border-bottom: 1px solid var(--border-color);
}

/* Sin la linea propia de n-tabs: la separacion ya la da el borde de la barra,
   y dos lineas seguidas se veian como un escalon. */
.panel-tabs :deep(.n-tabs-nav) {
  padding: 0 var(--spacing-xs);
}

.panel-tabs :deep(.n-tabs-nav-scroll-content) {
  border-bottom: none !important;
}

.panel-tabs :deep(.n-tabs-tab) {
  padding: 9px 2px !important;
}

.tab-content {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
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
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  scrollbar-gutter: stable;
}

/* Una tarjeta por seccion, mismo tratamiento que las del formulario de
   plantillas de chat: sin superficie propia las secciones se leian como una
   lista continua sin principio ni final. */
.panel-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  /* El contenedor es flex column con alto definido, asi que por defecto sus
     hijos encogen: las secciones se comprimian y lo que no encoge (el boton de
     guardar notas) se salia de la tarjeta en vez de generar scroll. */
  flex: 0 0 auto;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

/* Un punto por encima de los rotulos de bloque de dentro (10px, terciarios):
   con los dos al mismo peso no se distinguia el titulo de seccion de los
   subtitulos que cuelgan de el. */
.section-heading {
  margin: 0;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.panel-scroll::-webkit-scrollbar {
  width: 6px;
}

.panel-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.panel-scroll::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.panel-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>
