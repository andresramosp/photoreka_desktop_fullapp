<template>
  <n-modal
    v-model:show="visibleModel"
    preset="card"
    class="photo-info-modal"
    :class="{ 'photo-info-modal--fullscreen': FULLSCREEN_DIALOG }"
    :content-style="contentStyle"
    :show-icon="false"
    :closable="false"
    :trap-focus="false"
    @close="visibleModel = false"
    @after-enter="infoPanelRef?.syncTabs()"
  >
    <!-- El alto lo reparte el card (ver el bloque de estilos sin scoped): aqui
         solo hay que ocupar lo que sobra para que el panel derecho tenga su
         propio scroll en vez de estirar el modal. -->
    <div class="dialog-content">
      <div class="stage-column">
        <PhotoStage
          :selected-photo="selectedPhoto"
          :photo-credit="photoCredit"
          :all-photos="allPhotos"
          :current-photo-index="currentPhotoIndex"
          :show-add-to-collection="showAddToCollection"
          :show-move-to-tool="showMoveToTool"
          :show-send-to-chat="showSendToChat"
          @image-error="emit('image-error', $event)"
          @download="emit('download')"
          @open-fullscreen="emit('open-fullscreen')"
          @add-to-collection="emit('add-to-collection')"
          @move-to-tool="emit('move-to-tool')"
          @send-to-chat="emit('send-to-chat')"
          @set-flag="emit('set-flag')"
          @photo-navigate="emit('photo-navigate', $event)"
          @close="emit('update:visible', false)"
        />

        <PhotoFilmstrip
          :photos="allPhotos"
          :current-index="currentPhotoIndex"
          @navigate="emit('photo-navigate', $event)"
        />
      </div>

      <InfoPanel
        ref="infoPanelRef"
        :selected-photo="selectedPhoto"
        :grouped-tags="groupedTags"
        :photo-notes="photoNotes"
        :word-count="wordCount"
        :is-saving-notes="isSavingNotes"
        :overall-rating="overallRating"
        :score-scale="scoreScale"
        :selected-genre="selectedGenre"
        :show-custom-weights="showCustomWeights"
        :artistic-score-weights="artisticScoreWeights"
        :ordered-artistic-scores="orderedArtisticScores"
        :available-genre-presets="availableGenrePresets"
        :photo-library="photoLibrary"
        :format-date="formatDate"
        :format-exposure-time="formatExposureTime"
        :format-category-name="formatCategoryName"
        :format-criterion-name="formatCriterionName"
        :get-score-bg-color="getScoreBgColor"
        @apply-genre-preset="emit('apply-genre-preset', $event)"
        @update:artistic-score-weights="
          emit('update:artistic-score-weights', $event)
        "
        @update:photo-notes="emit('update:photo-notes', $event)"
        @update-word-count="emit('update-word-count')"
        @save-notes="emit('save-notes')"
        @navigate-to-route="navigateTo"
        @request-close="emit('update:visible', false)"
        @section-change="handleSectionChange"
        @navigate-to-photo="emit('navigate-to-photo', $event)"
      />
    </div>
  </n-modal>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useActivityLogger } from "@/composables/useActivityLogger";
import { NModal } from "naive-ui";
import PhotoStage from "../desktop/PhotoStage.vue";
import PhotoFilmstrip from "../desktop/PhotoFilmstrip.vue";
import InfoPanel from "../desktop/InfoPanel.vue";

defineOptions({ name: "PhotoInfoDesktopLayout" });

// El dialogo se abre directamente a pantalla completa. A false vuelve al modal
// grande centrado (1600px de ancho); no hay boton en la cabecera a proposito,
// para no confundirlo con el fullscreen de la foto en si.
const FULLSCREEN_DIALOG = true;

const router = useRouter();

const props = defineProps({
  visible: { type: Boolean, default: false },
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
  allPhotoInsights: { type: Array, default: () => [] },
  isGeneratingInsight: { type: Boolean, default: false },
  pendingInsightLabel: { type: String, default: "" },
  customInsightQuestion: { type: String, default: "" },
  customQuestionsRemaining: { type: Number, default: 3 },
  insightTypesAvailable: {
    type: Object,
    default: () => ({ cultural: true, technical: true, artistic: true }),
  },
  canUseInsights: { type: Boolean, default: true },
  photoLibrary: {
    type: Object,
    default: () => ({ collections: [], series: [], portfolios: [] }),
  },
  photoCredit: { type: Object, default: null },
  showDelete: { type: Boolean, default: true },
  showAddToCollection: { type: Boolean, default: true },
  showMoveToTool: { type: Boolean, default: true },
  showSendToChat: { type: Boolean, default: false },
  allPhotos: { type: Array, default: () => [] },
  currentPhotoIndex: { type: Number, default: -1 },
  formatDate: { type: Function, default: (d) => d },
  formatExposureTime: { type: Function, default: (e) => e },
  formatCategoryName: { type: Function, default: (c) => c },
  formatCriterionName: { type: Function, default: (c) => c },
  formatGenreTooltip: { type: Function, default: () => "" },
  getScoreBgColor: { type: Function, default: () => "#ccc" },
  availableGenrePresets: {
    type: Array,
    default: () => [
      { key: "general", label: "General", icon: null },
      { key: "street", label: "Street", icon: null },
      { key: "documentary", label: "Documentary", icon: null },
      { key: "abstract", label: "Artistic", icon: null },
    ],
  },
});

const emit = defineEmits([
  "update:visible",
  "copy-name",
  "image-error",
  "download",
  "open-fullscreen",
  "update:photo-notes",
  "update-word-count",
  "save-notes",
  "apply-genre-preset",
  "update:artistic-score-weights",
  "get-insight",
  "update:custom-insight-question",
  "submit-custom-question",
  "delete-photo",
  "add-to-collection",
  "move-to-tool",
  "send-to-chat",
  "navigate-to-photo",
  "photo-navigate",
  "set-flag",
]);

const visibleModel = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

// Sin cabecera: el contenido recupera tambien el margen superior.
const contentStyle = computed(() => ({
  // padding: "var(--spacing-md) var(--spacing-lg) var(--spacing-lg)",
  padding: "0",
}));

const infoPanelRef = ref(null);

const navigateTo = (routeName, id) => {
  emit("update:visible", false);
  router.push({ name: routeName, params: { id } });
};

const { logActivity } = useActivityLogger();

const handleSectionChange = (tab) => {
  logActivity("ui_action", {
    action: "photo_info_tab_change",
    tab,
    photoId: props.selectedPhoto?.id,
  });
};
</script>

<!-- Sin scoped a proposito: el card del modal se teleporta fuera de este
     componente, asi que los data-v nunca llegan hasta el. El prefijo de clase
     propio mantiene el alcance acotado a este dialogo. -->
<style>
.photo-info-modal.n-card {
  display: flex;
  flex-direction: column;
  width: min(1600px, 95vw);
  max-width: 95vw;
  height: min(920px, 92vh);
}

/* Esta version del dialogo no tiene cabecera: el nombre del fichero y la X
   viven ahora sobre el propio stage. */
.photo-info-modal.n-card > .n-card-header {
  display: none;
}

/* El content del card es quien reparte el alto sobrante. Sin esto el cuerpo
   crece por contenido y el card acaba mas corto que la ventana, que es de
   donde salian las franjas vacias arriba y abajo a pantalla completa. */
.photo-info-modal.n-card > .n-card__content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.photo-info-modal--fullscreen.n-card {
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  max-height: 100vh;
  margin: 0;
  border-radius: 0;
}
</style>

<style scoped>
.dialog-content {
  display: flex;
  /* gap: var(--spacing-md); */
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.stage-column {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* gap: var(--spacing-xs); */
}
</style>
