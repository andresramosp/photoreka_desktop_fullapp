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
        justify-content="space-evenly"
        :value="activeKey"
        @update:value="scrollToSection"
      >
        <n-tab
          v-for="section in sections"
          :key="section.key"
          :name="section.key"
        >
          <div class="tab-content">
            <n-icon size="15"><component :is="section.icon" /></n-icon>
            <span>{{ section.label }}</span>
          </div>
        </n-tab>
      </n-tabs>
    </div>

    <div ref="scrollEl" class="panel-scroll" @scroll.passive="onScroll">
      <section
        :ref="(el) => setSectionEl('scores', el)"
        class="panel-section"
        :class="{ 'is-active': activeKey === 'scores' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><ScoresIcon /></n-icon>
          <span>Scores</span>
        </h5>
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
      <section
        :ref="(el) => setSectionEl('info', el)"
        class="panel-section"
        :class="{ 'is-active': activeKey === 'info' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><InfoIcon /></n-icon>
          <span>Info</span>
        </h5>
        <InfoSection
          :selected-photo="selectedPhoto"
          :format-date="formatDate"
          :format-exposure-time="formatExposureTime"
          :format-category-name="formatCategoryName"
        />
      </section>

      <section
        :ref="(el) => setSectionEl('tags', el)"
        class="panel-section"
        :class="{ 'is-active': activeKey === 'tags' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><TagIcon /></n-icon>
          <span>Tags</span>
        </h5>
        <TagsSection :grouped-tags="groupedTags" />
      </section>

      <section
        :ref="(el) => setSectionEl('map', el)"
        class="panel-section"
        :class="{ 'is-active': activeKey === 'map' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><MapIcon /></n-icon>
          <span>Location</span>
        </h5>
        <PhotoGeoTab
          :photo="selectedPhoto"
          @request-close="emit('request-close')"
        />
      </section>

      <section
        :ref="(el) => setSectionEl('notes', el)"
        class="panel-section"
        :class="{ 'is-active': activeKey === 'notes' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><EditIcon /></n-icon>
          <span>Description / Notes</span>
        </h5>
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
        :class="{ 'is-active': activeKey === 'library' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><LibraryIcon /></n-icon>
          <span>Library</span>
        </h5>
        <LibrarySection
          :photo-library="photoLibrary"
          @navigate-to="(route, id) => emit('navigate-to-route', route, id)"
        />
      </section>

      <!-- La unica seccion que pide datos al backend, asi que se queda cerrada
           hasta que el usuario llega a ella (ver enableSimilar). -->
      <section
        :ref="(el) => setSectionEl('similar', el)"
        class="panel-section"
        :class="{ 'is-active': activeKey === 'similar' }"
      >
        <h5 class="section-heading">
          <n-icon size="14"><SimilarIcon /></n-icon>
          <span>Similar Photos</span>
        </h5>
        <SimilarPhotosSection
          :selected-photo="selectedPhoto"
          :enabled="similarEnabled"
          @navigate-to-photo="emit('navigate-to-photo', $event)"
          @request-close="emit('request-close')"
        />
      </section>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { NIcon, NTab, NTabs } from "naive-ui";
import {
  InformationCircleOutline as InfoIcon,
  PricetagOutline as TagIcon,
  GlobeOutline as MapIcon,
  CreateOutline as EditIcon,
  LibraryOutline as LibraryIcon,
  GitCompareOutline as SimilarIcon,
} from "@vicons/ionicons5";
import { Trophy20Regular as ScoresIcon } from "@vicons/fluent";
import InfoSection from "./sections/InfoSection.vue";
import ScoresSection from "./sections/ScoresSection.vue";
import TagsSection from "./sections/TagsSection.vue";
import NotesSection from "./sections/NotesSection.vue";
import LibrarySection from "./sections/LibrarySection.vue";
import PhotoGeoTab from "../PhotoGeoTab.vue";
import SimilarPhotosSection from "../SimilarPhotosSection.vue";

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
  "navigate-to-photo",
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
  { key: "similar", label: "Similar", icon: SimilarIcon },
];

// Fotos similares: se pide al backend, asi que la seccion no se carga sola al
// abrir el dialogo. El observer la abre un poco antes de que asome por abajo
// para que los resultados lleguen ya puestos, y es de un solo uso: una vez
// abierta se queda abierta mientras viva el panel.
const similarEnabled = ref(false);
let similarObserver = null;

const stopObservingSimilar = () => {
  similarObserver?.disconnect();
  similarObserver = null;
};

const enableSimilar = () => {
  if (similarEnabled.value) return;
  similarEnabled.value = true;
  stopObservingSimilar();
};

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
  // Red de seguridad del observer: llegar a la seccion scrolleando o saltando
  // por pestaña tambien la abre, aunque el observer no se haya podido montar.
  if (key === "similar") enableSimilar();
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

// En onMounted y no en setSectionEl porque los refs de los hijos se asignan
// antes que el del contenedor: alli scrollEl todavia seria null.
onMounted(() => {
  const root = scrollEl.value;
  const node = sectionEls.get("similar");
  if (!root || !node || typeof IntersectionObserver === "undefined") return;

  similarObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) enableSimilar();
    },
    { root, rootMargin: "200px 0px" },
  );
  similarObserver.observe(node);
});

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  stopObservingSimilar();
});

// El modal entra con una animacion de escala y ancho propio: si la barra azul
// se midio antes de que el panel tuviera su ancho final, esto la recoloca.
const syncTabs = () => tabsRef.value?.syncBarPosition();

defineExpose({ scrollToSection, syncTabs });
</script>

<style scoped>
.info-panel {
  flex: 0 0 var(--panel-width, 560px);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--bg-surface));
  border: 1px solid var(--border-color);
  /* border-radius: var(--radius-md); */
  overflow: hidden;
}

/* Tintada con el color de texto y no con un token de fondo: --bg-card y
   --bg-surface son el mismo blanco en tema claro, asi que un token dejaria la
   barra indistinguible del panel. */
.panel-tabs {
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
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
  padding: 11px 5px !important;
}

.tab-content {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
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
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

/* La seccion a la que apunta la pestaña activa: sin esto, las secciones
   cortas del final no se distinguen al saltar a ellas, porque el scroll ya no
   puede subirlas hasta arriba del todo. El primario va rebajado y repartido
   entre borde, fondo y un halo muy suave: a pleno color el recuadro pesaba mas
   que el contenido de la tarjeta. */
.panel-section.is-active {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 35%,
    var(--border-color)
  );
  /* background: color-mix(in srgb, var(--primary-color) 5%, transparent); */
  /* box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color) 7%, transparent); */
}

/* El rotulo tambien en primario: es lo que ata la tarjeta marcada con la
   pestaña activa, que se pinta con ese mismo color. */
.panel-section.is-active .section-heading {
  color: var(--text-primary);
}

/* SimilarPhotosSection trae scroll propio porque en movil vive dentro de un
   tab-pane de alto fijo. Aqui el panel entero ya scrollea, asi que ese segundo
   scroll sobraria: la seccion se deja crecer y fluye con el resto. */
.panel-section :deep(.similar-photos-section) {
  height: auto;
}

.panel-section :deep(.similar-grid-wrapper) {
  flex: 0 0 auto;
  overflow: visible;
  padding-right: 0;
}

/* Un punto por encima de los rotulos de bloque de dentro (10px, terciarios):
   con los dos al mismo peso no se distinguia el titulo de seccion de los
   subtitulos que cuelgan de el. */
.section-heading {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  transition: color 0.18s ease;
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
