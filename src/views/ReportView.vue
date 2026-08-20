<template>
  <div class="report-container view-container">
    <!-- Report Content -->
    <div v-if="!isGenerating" class="report-content">
      <!-- Report Header -->
      <!-- <div class="report-header">
        <div class="header-content">
          <div class="header-left">
            <h1 class="report-title">Analytics Report</h1>
            <p class="report-subtitle">
              Comprehensive analysis of {{ totalPhotos }} photos in your catalog
            </p>
          </div>
        </div>
      </div> -->

      <!-- Tabs Section -->
      <n-tabs
        :value="activeSection"
        type="line"
        class="report-tabs tabs-fill"
        @update:value="setActiveSection"
      >
        <n-tab-pane name="patterns" display-directive="show:lazy">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <BookIcon />
              </n-icon>
              <span class="tab-label-desktop">Usage Patterns</span>
              <span class="tab-label-mobile">Patterns</span>
            </span>
          </template>
          <div class="patterns-section">
            <PatternsAnalysisReport />
          </div>
        </n-tab-pane>

        <n-tab-pane name="visual" display-directive="show:lazy">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <ApertureIcon />
              </n-icon>
              <span class="tab-label-desktop">Technical</span>
              <span class="tab-label-mobile">Technical</span>
            </span>
          </template>

          <VisualAspectsReportNew :photos="photosStore.photos" />
          <CameraDataReport :photos="photosStore.photos" />
        </n-tab-pane>

        <n-tab-pane name="tags" display-directive="show:lazy">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <PricetagsOutline />
              </n-icon>
              <span class="tab-label-desktop">Tags Distribution</span>
              <span class="tab-label-mobile">Tags</span>
            </span>
          </template>
          <TagsTreemapReport />
        </n-tab-pane>

        <n-tab-pane name="artistic" display-directive="show:lazy">
          <template #tab>
            <span class="tab-title">
              <n-icon size="18" :color="'var(--primary-color)'">
                <StarIcon />
              </n-icon>
              <span class="tab-label-desktop">Artistic Scores</span>
              <span class="tab-label-mobile">Artistic</span>
            </span>
          </template>
          <ArtisticScoresReport :photos="photosStore.photos" />
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, nextTick, watch } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore";
import { useRoute } from "vue-router";

defineOptions({
  name: "ReportView",
});
// import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useMessage } from "naive-ui";
// import VisualAspectsReport from "@/components/report/VisualAspectsReport.vue";
// import NarrativeAnalysisReport from "@/components/report/NarrativeAnalysisReport.vue";
import PatternsAnalysisReport from "@/components/report/PatternsAnalysisReport.vue";
import ArtisticScoresReport from "@/components/report/ArtisticScoresReport.vue";
import TagsTreemapReport from "@/components/report/TagsTreemapReport.vue";
import CameraDataReport from "@/components/report/CameraDataReport.vue";

// Icons
import {
  AnalyticsOutline as AnalyticsIcon,
  BarChartOutline as ChartBarIcon,
  BookOutline as BookIcon,
  EarthOutline as GlobeIcon,
  StarOutline as StarIcon,
  BulbOutline as BulbIcon,
  EyeOutline as EyeIcon,
  ApertureOutline as ApertureIcon,
  RefreshOutline as RefreshIcon,
  ArrowBackOutline as ArrowBackIcon,
  CameraOutline as CameraIcon,
  ColorPaletteOutline as PaletteIcon,
  FlashOutline as LightningIcon,
  GridOutline as GridIcon,
  ImageOutline as ImageIcon,
  SpeedometerOutline as SpeedometerIcon,
  TrendingUpOutline as TrendingUpIcon,
  WarningOutline as WarningIcon,
  PricetagsOutline,
} from "@vicons/ionicons5";
import VisualAspectsReportNew from "@/components/report/VisualAspectsReportNew.vue";

const photosStore = usePhotosStore();
const userStore = useUserStore();
const route = useRoute();
const message = useMessage();

// Active section tracking
const VALID_SECTION_IDS = ["patterns", "visual", "tags", "artistic"];
const VALID_PATTERN_TYPE_IDS = ["general", "story", "context"];

const normalizeSectionId = (value) => {
  if (Array.isArray(value)) {
    return normalizeSectionId(value[0]);
  }

  return VALID_SECTION_IDS.includes(value) ? value : null;
};

const normalizePatternType = (value) => {
  if (Array.isArray(value)) {
    return normalizePatternType(value[0]);
  }

  return VALID_PATTERN_TYPE_IDS.includes(value) ? value : null;
};

// La sección activa vive en el hash (#patterns, #visual…), igual que en
// /import-area. Se acepta además el viejo ?section= para no romper enlaces
// antiguos que aún apunten al report con query params.
const activeSection = ref(
  normalizeSectionId(route.hash.replace("#", "")) ||
    normalizeSectionId(route.query.section) ||
    "patterns",
);

// Los patrones tienen subgrupos dentro de su pestaña, así que un deep link
// puede pedir "#patterns" + patternType para bajar hasta el grupo concreto.
const scrollToPatternGroup = async (patternType, options = {}) => {
  const { behavior = "smooth" } = options;

  if (!patternType) {
    return;
  }

  let target = document.getElementById(`patterns-group-${patternType}`);
  if (!target) {
    await nextTick();
    target = document.getElementById(`patterns-group-${patternType}`);
  }

  if (target) {
    target.scrollIntoView({ behavior, block: "start" });
  }
};

const setActiveSection = (sectionId) => {
  const normalized = normalizeSectionId(sectionId);
  if (!normalized) {
    return;
  }

  activeSection.value = normalized;
  // Actualiza el hash sin recargar la página ni disparar navegación
  if (window.location.hash.replace("#", "") !== normalized) {
    window.history.replaceState(null, "", `#${normalized}`);
  }
};

const applyRequestedSection = async (options = {}) => {
  const { behavior = "smooth" } = options;
  const requestedSection =
    normalizeSectionId(route.hash.replace("#", "")) ||
    normalizeSectionId(route.query.section);

  if (!requestedSection) {
    return;
  }

  setActiveSection(requestedSection);

  if (requestedSection !== "patterns") {
    return;
  }

  const requestedPatternType = normalizePatternType(route.query.patternType);
  if (!requestedPatternType) {
    return;
  }

  // El pane se monta al activarse (show:lazy), así que esperamos a que exista
  // el grupo antes de intentar hacer scroll hasta él.
  await nextTick();
  window.setTimeout(() => {
    scrollToPatternGroup(requestedPatternType, { behavior });
  }, 80);
};

// State
const isGenerating = ref(false);

// Mock data - In a real app, this would come from API calls
const totalPhotos = computed(() => photosStore.photos?.length || 0);

// Los patrones del catálogo se generan en background en el backend y viven en el
// objeto user, que solo se carga al iniciar sesión. Como esta vista queda
// cacheada por <KeepAlive> y muchos usuarios no recargan nunca la página, se
// refresca el perfil en cada entrada para traer los patrones más recientes.
const refreshPatterns = () => {
  void userStore.refreshProfile();
};

// Initialize
onMounted(async () => {
  refreshPatterns();

  await applyRequestedSection({ behavior: "auto" });

  // Ensure photos are loaded
  if (photosStore.photos.length === 0) {
    await photosStore.fetchPhotos();
  }
});

onActivated(() => {
  refreshPatterns();
  // Al volver a la vista cacheada el hash puede haber cambiado (deep link desde
  // el dashboard), así que se resincroniza la pestaña activa.
  void applyRequestedSection({ behavior: "auto" });
});

watch(
  [() => route.hash, () => route.query.section, () => route.query.patternType],
  async () => {
    await nextTick();
    applyRequestedSection({ behavior: "smooth" });
  },
);
</script>

<style scoped>
.report-container {
  /* Sin padding arriba: la barra de pestañas se pega al borde del contenedor */
  padding: 0 var(--spacing-2xl) var(--spacing-4xl) var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
  position: relative;
}

/* Tabs Section — mismos overrides de n-tabs que /import-area */
.report-tabs {
  background-color: transparent;
}

.tab-title {
  display: flex;
  justify-content: center;
  gap: 5px;
  align-items: center;
}

/* .view-container es el único scroll de la vista, así que la barra se queda
   pegada a su borde superior en vez de flotar sobre el contenido. */
:deep(.n-tabs-nav) {
  position: sticky;
  top: 0;
  z-index: 20;
  background-color: var(--bg-body);
}

:deep(.n-tabs-tab) {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  padding: var(--spacing-md) var(--spacing-xl);
  transition: var(--transition-fast);
}

:deep(.n-tabs-tab:hover) {
  color: var(--text-primary);
}

:deep(.n-tabs-tab--active) {
  color: var(--text-primary) !important;
}

:deep(.n-tabs-bar) {
  background-color: var(--primary-color) !important;
}

:deep(.n-tab-pane) {
  padding: var(--spacing-xl) 0 !important;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: var(--spacing-4xl) var(--spacing-2xl);
}

.empty-content {
  text-align: center;
  max-width: 600px;
}

.empty-icon {
  margin-bottom: var(--spacing-2xl);
  opacity: 0.7;
}

.empty-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: var(--line-height-tight);
}

.empty-description {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-3xl) 0;
}

.instructions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-3xl);
  text-align: left;
}

.instruction-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: var(--transition-normal);
}

.instruction-item:hover {
  border-color: var(--primary-color);
  transform: translateY(-1px);
}

.instruction-item n-icon {
  color: var(--primary-color);
  margin-top: 2px;
  flex-shrink: 0;
}

.instruction-item span {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.report-actions {
  margin-top: var(--spacing-2xl);
}

.generate-button {
  font-size: var(--font-size-lg);
  padding: var(--spacing-lg) var(--spacing-2xl);
  height: auto;
}

/* Report Content Styles */
.report-content {
  margin: 0 auto;
}

.report-header {
  padding-top: var(--spacing-2xl);
  padding-bottom: var(--spacing-md);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-2xl);
}

.header-left {
  flex: 1;
}

.report-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.report-subtitle {
  font-size: var(--font-size-xl);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-sm) 0;
}

.report-date {
  font-size: var(--font-size-base);
  color: var(--text-tertiary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

/* Section Styles */
.report-section {
  margin-bottom: var(--spacing-4xl);
}

.report-section.last-section {
  margin-bottom: var(--spacing-6xl);
}

.section-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.section-icon {
  color: var(--primary-color);
}

.section-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

/* Patterns Section */
.patterns-section {
  width: 100%;
}

.patterns-section .section-header {
  margin-bottom: 0;
}

/* Narrative Grid */
.narrative-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.narrative-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.narrative-card:hover {
  border-color: var(--success-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.narrative-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.narrative-percentage {
  background: linear-gradient(
    135deg,
    var(--success-color),
    var(--success-color-light)
  );
  color: white;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  min-width: 60px;
  text-align: center;
}

.narrative-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.narrative-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.narrative-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
}

.photo-count {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.narrative-strength {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
}

.narrative-strength.strong {
  background-color: var(--success-color-light);
  color: var(--success-color);
}

.narrative-strength.moderate {
  background-color: var(--warning-color-light);
  color: var(--warning-color);
}

.narrative-strength.weak {
  background-color: var(--error-color-light);
  color: var(--error-color);
}

/* Cultural Grid */
.cultural-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.cultural-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.cultural-card:hover {
  border-color: var(--info-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.cultural-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.cultural-percentage {
  background: linear-gradient(
    135deg,
    var(--info-color),
    var(--info-color-light)
  );
  color: white;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  min-width: 60px;
  text-align: center;
}

.cultural-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.cultural-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.cultural-meta {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.cultural-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.cultural-tag {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

/* Aesthetic Grid */
.aesthetic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.aesthetic-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  display: flex;
  gap: var(--spacing-lg);
  transition: var(--transition-normal);
}

.aesthetic-card:hover {
  border-color: var(--success-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.quality-icon {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: var(--spacing-xs);
}

.quality-content {
  flex: 1;
}

.quality-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.quality-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.quality-score {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.score-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.score-bar {
  flex: 1;
  height: 8px;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.score-fill.positive {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--success-color),
    var(--success-color-light)
  );
  border-radius: var(--radius-full);
  transition: var(--transition-normal);
}

.score-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--success-color);
  flex-shrink: 0;
}

/* Improvement Grid */
.improvement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  gap: var(--spacing-xl);
}

.improvement-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  display: flex;
  gap: var(--spacing-lg);
  transition: var(--transition-normal);
}

.improvement-card:hover {
  border-color: var(--warning-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.improvement-icon {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: var(--spacing-xs);
}

.improvement-content {
  flex: 1;
}

.improvement-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.improvement-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-md) 0;
}

.improvement-priority {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.priority-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.priority-value {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.improvement-priority.high .priority-value {
  background-color: var(--error-color-light);
  color: var(--error-color);
}

.improvement-priority.medium .priority-value {
  background-color: var(--warning-color-light);
  color: var(--warning-color);
}

.improvement-priority.low .priority-value {
  background-color: var(--success-color-light);
  color: var(--success-color);
}

.improvement-suggestions h4 {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.improvement-suggestions ul {
  margin: 0;
  padding-left: var(--spacing-lg);
}

.improvement-suggestions li {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin-bottom: var(--spacing-xs);
}

/* Shared Report Section Styles */
:deep(.report-section) {
  margin-bottom: var(--spacing-4xl);
}

:deep(.report-section-header) {
  margin-bottom: var(--spacing-2xl);
  margin-top: var(--spacing-xs);
}

:deep(.section-title) {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

:deep(.section-icon) {
  color: var(--primary-color);
}

:deep(.section-description) {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

:deep(.subsection-header) {
  margin-bottom: var(--spacing-xl);
  margin-top: var(--spacing-3xl);
}

:deep(.subsection-title) {
  font-size: var(--font-size-xl) !important;
  font-weight: var(--font-weight-medium) !important;
}

:deep(.group-header) {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 2px solid var(--border-color);
}

:deep(.group-title-wrapper) {
  display: flex;
  flex-direction: column;
}

:deep(.criteria-group) {
  margin-top: var(--spacing-3xl);
  margin-bottom: var(--spacing-3xl);
}

:deep(.criteria-group:first-of-type) {
  margin-top: 0;
}

:deep(.criteria-group:last-of-type) {
  margin-bottom: 0;
}

:deep(.group-title) {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

:deep(.group-subtitle) {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-normal);
}

:deep(.empty-icon) {
  color: var(--text-tertiary);
  opacity: 0.5;
}

:deep(.empty-text) {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .report-container {
    padding: 0 var(--spacing-lg) var(--spacing-3xl) var(--spacing-lg);
  }

  .report-header {
    padding-top: var(--spacing-lg);
  }

  .header-content {
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .narrative-grid,
  .cultural-grid,
  .aesthetic-grid,
  .improvement-grid {
    grid-template-columns: 1fr;
  }

  .narrative-meta,
  .cultural-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .quality-score {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .score-bar {
    width: 100%;
  }

  /* Tabs responsive — scrollables en mobile, como en /import-area */
  :deep(.n-tabs-nav) {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  :deep(.n-tabs-nav)::-webkit-scrollbar {
    display: none;
  }

  :deep(.n-tabs-tab) {
    white-space: nowrap;
    min-width: 0;
    padding: var(--spacing-sm) var(--spacing-lg);
  }

  :deep(.n-tab-pane) {
    padding: var(--spacing-lg) 0 !important;
  }

  .tab-title {
    gap: 6px;
  }

  .tab-title .n-icon {
    font-size: 16px !important;
  }
}

@media (max-width: 480px) {
  .empty-title {
    font-size: var(--font-size-2xl);
  }

  .report-title {
    font-size: var(--font-size-3xl);
  }

  .section-title {
    font-size: var(--font-size-xl);
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .aesthetic-card,
  .improvement-card {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .quality-score,
  .improvement-priority {
    flex-direction: row;
  }

  :deep(.n-tabs-tab) {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-base);
  }

  :deep(.n-tab-pane) {
    padding: var(--spacing-md) 0 !important;
  }

  .tab-title {
    gap: 5px;
  }
}

/* Mostrar solo el label largo en desktop, el corto en mobile */
.tab-label-desktop {
  display: inline;
}
.tab-label-mobile {
  display: none;
}
@media (max-width: 768px) {
  .tab-label-desktop {
    display: none;
  }
  .tab-label-mobile {
    display: inline;
  }
}
</style>
