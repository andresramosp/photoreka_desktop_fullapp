<template>
  <div class="tab-content tab-content-container">
    <div class="processing-section">
      <!-- Processing Jobs Table -->

      <div class="sync-area-header">
        <n-icon size="18" color="var(--primary-color)">
          <BookInformation20Regular />
        </n-icon>
        <h3 class="sync-area-title">
          <span class="desktop-only"
            >Here you can monitor the analysis process for your photos. They
            will appear in your Workspace once the process is complete (up to
            two hours).</span
          >
          <span class="mobile-only">Monitor your photo analysis here.</span>
        </h3>
      </div>
      <div v-if="processingJobs.length > 0" class="processing-table-container">
        <div class="processing-table">
          <div
            v-for="job in processingJobs"
            :key="job.id"
            class="processing-row"
            :class="{
              expanded: job.expanded,
              finished: job.status === 'finished',
            }"
            @click="toggleJobExpansion(job.id)"
          >
            <!-- Main Row -->
            <div class="row-main">
              <div class="row-cell date-cell">
                <span class="cell-label">Started</span>
                <span class="cell-value">{{ formatDate(job.startDate) }}</span>
              </div>

              <div class="row-cell photos-cell">
                <span class="cell-label">Photos</span>
                <span class="cell-value">{{ job.photoCount }}</span>
              </div>
              <!-- <div class="row-cell type-cell progress-cell">
                <span class="cell-label">Progress</span>
                <n-tooltip placement="top">
                  <template #trigger>
                    <PieProgress
                      :percentage="job.progressPercent"
                      :size="24"
                      :progress-color="
                        job.status === 'finished' ? '#10b981' : '#f59e0b'
                      "
                      background-color="#2c2c32"
                      stroke-color="var(--bg-body)"
                      :stroke-width="1"
                      class="progress-compact"
                    />
                  </template>
                  <span>{{ job.currentStageLabel }}</span>
                </n-tooltip>
              </div> -->

              <div class="row-cell status-cell">
                <span class="cell-label">Status</span>
                <n-tag
                  size="small"
                  class="status-tag element-with-spinner"
                  :class="{
                    'status-processing': job.status === 'processing',
                    'status-finished': job.status === 'finished',
                  }"
                >
                  <template v-if="job.status === 'processing'">
                    <n-spin
                      size="12"
                      class="spinner-status-badge spinner-small spinner-centered"
                    />
                  </template>
                  {{ job.status === "processing" ? "Processing" : "Finished" }}
                </n-tag>
              </div>
              <div class="row-cell actions-cell">
                <div class="row-actions">
                  <n-button
                    v-if="job.status === 'finished'"
                    type="info"
                    size="small"
                    @click.stop="openCollectionModal(job)"
                    class="add-to-collection-btn"
                  >
                    <template #icon>
                      <n-icon>
                        <svg viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M17 14H19V17H22V19H19V22H17V19H14V17H17V14M12 18H6V16H12V18M12 14H6V12H12V14M16 10H6V8H16V10M20 6H4C2.9 6 2 6.9 2 8V20C2 21.1 2.9 22 4 22H13.35C13.13 21.37 13 20.7 13 20C13 16.69 15.69 14 19 14C19.34 14 19.67 14.03 20 14.08V8C20 6.9 19.1 6 18 6H20Z"
                          />
                        </svg>
                      </n-icon>
                    </template>
                    Add to Collection
                  </n-button>
                </div>
              </div>
              <div class="row-cell actions-cell">
                <div class="row-actions">
                  <n-icon size="16" class="expand-icon">
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
                      />
                    </svg>
                  </n-icon>
                </div>
              </div>
            </div>

            <!-- Expanded Row Content -->
            <div v-if="job.expanded" class="row-expanded">
              <div class="expanded-content">
                <div class="photos-grid-mini">
                  <PhotoCardHub
                    v-for="photo in job.photos"
                    :key="photo.id"
                    :photo="photo"
                    :show-delete="false"
                    :show-name="false"
                    :show-footer="false"
                    :showDuplicate="false"
                    :show-info-button="false"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty Processing State -->
      <div v-if="processingJobs.length === 0" class="empty-state-section">
        <div class="empty-state-container">
          <div class="empty-state-content">
            <div class="empty-state-icon">
              <n-icon size="48" color="var(--primary-color)">
                <InProgress />
              </n-icon>
            </div>
            <h3 class="empty-state-title">No photos being processed</h3>
            <p class="empty-state-subtitle">
              Upload photos in the
              <button class="tab-link" @click="navigateToTab('upload')">
                Lightbox
              </button>
              to see them here during processing
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Collection Selection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="selectedJob?.photoCount || 0"
      :photo-ids="selectedJob?.photos?.map((photo) => photo.id) || []"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="cancelCollectionModal"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, h, computed } from "vue";
import { api } from "@/utils/axios";
import { BookInformation20Regular } from "@vicons/fluent";
import { InProgress } from "@vicons/carbon";
import PhotoCardHub from "../photoCards/PhotoCardHub.vue";
import PieProgress from "../PieProgress.vue";
import CollectionModal from "../CollectionModal.vue";
import {
  NTooltip,
  NSpin,
  NButton,
  useMessage,
  useNotification,
} from "naive-ui";
import { usePhotosStore } from "@/stores/photos"; // o donde tengas el store
import { useCollectionsStore } from "@/stores/collections.js";
import { useRoute } from "vue-router";

const photosStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const message = useMessage();
const notification = useNotification();
const route = useRoute();

const emit = defineEmits(["navigate-to-tab", "on-add-to-collection"]);

// Estado del modal de colecciones
const showCollectionModal = ref(false);
const selectedJob = ref(null);

// Utilidades
const API_URL = "/api/analyzer-process";

// Estado de procesos
const processingJobs = ref([]);
const intervalId = ref(null); // Usar ref para evitar problemas de ciclo de vida
const isPolling = ref(false); // Flag para evitar múltiples intervalos
const isMounted = ref(false); // Flag para evitar código después del unmount
const componentId = Math.random().toString(36).substring(2, 9); // ID único para debug
// Helpers para el polling seguro
function clearPollingInterval() {
  if (intervalId.value) {
    console.log(
      `[ProcessingPhotos-${componentId}] Limpio intervalId`,
      intervalId.value,
    );
    clearInterval(intervalId.value);
    intervalId.value = null;
  } else {
    console.log(
      `[ProcessingPhotos-${componentId}] clearPollingInterval: No hay interval activo`,
    );
  }
  isPolling.value = false;
}

function startPolling() {
  console.log(
    `[ProcessingPhotos-${componentId}] startPolling llamado, isPolling:`,
    isPolling.value,
    "isMounted:",
    isMounted.value,
  );

  if (!isMounted.value) {
    console.log(
      `[ProcessingPhotos-${componentId}] Componente desmontado, no inicio polling`,
    );
    return;
  }

  if (isPolling.value) {
    console.log(
      `[ProcessingPhotos-${componentId}] Ya hay polling activo, ignorando`,
    );
    return;
  }

  clearPollingInterval();
  isPolling.value = true;

  const newIntervalId = setInterval(() => {
    if (!isMounted.value) {
      console.log(
        `[ProcessingPhotos-${componentId}] Componente desmontado, limpiando interval`,
      );
      clearInterval(newIntervalId);
      return;
    }
    // Solo ejecutar loadProcesses si el hash es #processing
    const hash = window.location.hash.replace("#", "");
    if (hash === "processing") {
      console.log(
        `[ProcessingPhotos-${componentId}] setInterval tick (loadProcesses ejecutado)`,
        newIntervalId,
        new Date().toISOString(),
      );
      loadProcesses();
    } else {
      console.log(
        `[ProcessingPhotos-${componentId}] setInterval tick (NO ejecuta loadProcesses, hash actual: #${hash})`,
        newIntervalId,
        new Date().toISOString(),
      );
    }
  }, 5000);

  intervalId.value = newIntervalId;
  console.log(
    `[ProcessingPhotos-${componentId}] Creo intervalId`,
    intervalId.value,
  );
}

// Orden de las stages del pipeline
const STAGES = [
  { key: "init", label: "Initializing" },
  { key: "visual_color_embedding_task", label: "Color Embedding" },
  { key: "clip_embeddings", label: "Vectorizing Images" },
  { key: "metadata_extraction", label: "Extracting Metadata" },
  { key: "vision_artistic", label: "Artistic Analysis" },
  { key: "vision_visual_aspects", label: "Visual Aspects" },
  { key: "tags_visual_aspects", label: "Tagging Visual Aspects" },
  { key: "tags_artistic_aspects", label: "Tagging Visual Scores" },
  { key: "vision_context_story_accents", label: "Narrative and Context" },
  { key: "tags_context_story", label: "Tagging Context/Story" },
  { key: "tags_visual_accents", label: "Tagging Visual Accents" },
  {
    key: "chunks_context_story_visual_accents",
    label: "Generating Chunks",
  },
  { key: "topological_tags", label: "Topological Tags" },
  { key: "finished", label: "Finished" },
];

// Devuelve el índice de la etapa actual
function getCurrentStageIndex(stage) {
  return STAGES.findIndex((s) => s.key === stage);
}

// Mapear proceso
const mapProcess = (proc, idx = 0, previousJob = null) => {
  // Si está en modo retry_process, ignorar stages y mostrar 'finalizing' hasta que termine
  const isRetry = proc.mode === "retry_process";
  const isFinished = proc.currentStage === "finished";
  let progressPercent, currentStageLabel;
  if (isRetry && !isFinished) {
    progressPercent = 90; // Puedes ajustar el porcentaje que representa 'finalizing'
    currentStageLabel = "Finalizing";
  } else {
    const currentStageIdx = getCurrentStageIndex(proc.currentStage || "init");
    const totalStages = STAGES.length - 1; // 'finished' no cuenta para el progreso
    progressPercent = isFinished
      ? 100
      : Math.max(0, Math.round((currentStageIdx / totalStages) * 100));
    currentStageLabel = STAGES[currentStageIdx]?.label || "Starting...";
  }

  // Aplicar "high watermark": nunca permitir que el progreso retroceda
  // Esto maneja el caso de fases ejecutándose en paralelo
  if (previousJob && previousJob.progressPercent && !isFinished) {
    progressPercent = Math.max(progressPercent, previousJob.progressPercent);
  }

  return {
    id: proc.id,
    expanded: idx === 0, // El primer tab siempre abierto
    startDate: proc.createdAt,
    photoCount: proc.photos?.length ?? 0,
    status: isFinished ? "finished" : "processing",
    progressPercent,
    currentStageLabel,
    photos: proc.photos,
  };
};

// --- Notificación de procesos finalizados ---
const FIRST_PROCESS_ONBOARDING_KEY = "firstProcessOnboardingTriggered";

function getFirstProcessOnboardingTriggered() {
  try {
    return JSON.parse(localStorage.getItem(FIRST_PROCESS_ONBOARDING_KEY)) || [];
  } catch {
    return [];
  }
}
function setFirstProcessOnboardingTriggered(ids) {
  localStorage.setItem(FIRST_PROCESS_ONBOARDING_KEY, JSON.stringify(ids));
}

function notifyFinished(job) {
  notification.create({
    title: "Process Finished",
    content: `The analysis for ${
      job.photoCount
    } photo(s) started on ${formatDate(job.startDate)} is complete.`,
    meta: new Date().toLocaleString(),
    closable: true,
    type: "success",
  });
}

async function loadProcesses() {
  if (!isMounted.value) {
    console.log(
      `[ProcessingPhotos-${componentId}] Componente desmontado, no cargo procesos`,
    );
    return;
  }

  try {
    const response = await api.get(API_URL);

    // Verificar nuevamente después del await
    if (!isMounted.value) {
      console.log(
        `[ProcessingPhotos-${componentId}] Componente desmontado después del API call`,
      );
      return;
    }

    const previousJobs = [...processingJobs.value]; // Clonar los anteriores

    const filtered = response.data.filter((proc) => !proc.isPreprocess);
    const updated = filtered.map((proc, idx) => {
      const current = processingJobs.value.find((j) => j.id === proc.id);
      // El primer tab (idx 0) siempre abierto, los demás mantienen su estado
      const mapped = mapProcess(proc, idx, current); // Pasar el job anterior para comparar progreso
      if (current && idx !== 0) mapped.expanded = current.expanded;
      return mapped;
    });

    processingJobs.value = updated.sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );

    // --- Notificación de procesos finalizados y onboarding del primer proceso ---
    let onboardingTriggeredIds = getFirstProcessOnboardingTriggered();
    let newOnboardingTriggered = false;

    // Detectar si alguno ha pasado de "processing" a "finished"
    for (const updatedJob of processingJobs.value) {
      const previousJob = previousJobs.find((j) => j.id == updatedJob.id);
      if (
        previousJob &&
        previousJob.status === "processing" &&
        updatedJob.status === "finished"
      ) {
        // Verificar si este era el primer proceso antes de actualizar el store
        const wasFirstProcess = photosStore.processedPhotos.length === 0;

        await photosStore.getOrFetch(true);

        // Solo mostrar notificación si el proceso acaba de terminar (usuario está en la app)
        notifyFinished(updatedJob);

        // Si era el primer proceso y no se ha activado el onboarding para este proceso
        if (
          wasFirstProcess &&
          !onboardingTriggeredIds.includes(updatedJob.id) &&
          typeof window.triggerFirstProcessOnboarding === "function"
        ) {
          setTimeout(() => {
            window.triggerFirstProcessOnboarding();
          }, 1500); // Pequeño delay para que la notificación se muestre primero

          onboardingTriggeredIds.push(updatedJob.id);
          newOnboardingTriggered = true;
        }
        break; // solo una vez
      }
    }

    // Activar onboarding para el primer proceso si no se ha hecho (solo al cargar inicialmente)
    if (
      photosStore.processedPhotos.length > 0 && // Hay fotos procesadas
      onboardingTriggeredIds.length === 0 && // No se ha activado onboarding para ningún proceso
      typeof window.triggerFirstProcessOnboarding === "function"
    ) {
      // Buscar el proceso más antiguo terminado para marcarlo como el que activó el onboarding
      const oldestFinishedJob = processingJobs.value
        .filter((job) => job.status === "finished")
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        )[0];

      if (oldestFinishedJob) {
        setTimeout(() => {
          window.triggerFirstProcessOnboarding();
        }, 500);

        onboardingTriggeredIds.push(oldestFinishedJob.id);
        newOnboardingTriggered = true;
      }
    }

    if (newOnboardingTriggered)
      setFirstProcessOnboardingTriggered(onboardingTriggeredIds);
  } catch (error) {
    console.error(
      `[ProcessingPhotos-${componentId}] Error loading processes:`,
      error,
    );
  }
}

// Inicia carga y auto-refresh
onMounted(async () => {
  console.log(`[ProcessingPhotos-${componentId}] onMounted`);
  isMounted.value = true;
  await loadProcesses();

  // Verificar si el componente sigue montado después del await
  if (isMounted.value) {
    startPolling();
  } else {
    console.log(
      `[ProcessingPhotos-${componentId}] Componente desmontado durante onMounted, no inicio polling`,
    );
  }
});
onBeforeUnmount(() => {
  console.log(`[ProcessingPhotos-${componentId}] onBeforeUnmount`);
  isMounted.value = false;
  clearPollingInterval();
});

// --- Funciones del modal de colecciones ---
const openCollectionModal = (job) => {
  selectedJob.value = job;
  showCollectionModal.value = true;
};

const cancelCollectionModal = () => {
  showCollectionModal.value = false;
  selectedJob.value = null;
};

const handleCollectionAdded = (data) => {
  // Opcional: emitir evento si el componente padre necesita saberlo
  emit("on-add-to-collection", data);
  showCollectionModal.value = false;
  selectedJob.value = null;
};

// Utilidades de UI
const formatDate = (date) => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};
const toggleJobExpansion = (jobId) => {
  const job = processingJobs.value.find((j) => j.id === jobId);
  if (job) job.expanded = !job.expanded;
};

const navigateToTab = (tabName) => {
  emit("navigate-to-tab", tabName);
};

// Solo mostrar el botón en el último proceso terminado
function isLastFinishedJob(job) {
  const finishedJobs = processingJobs.value.filter(
    (j) => j.status === "finished",
  );
  if (finishedJobs.length === 0) return false;
  // Ordenar por fecha de inicio descendente (más reciente primero)
  finishedJobs.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  return finishedJobs[0].id === job.id;
}
</script>

<style scoped>
/* Tab content - local overrides only */
.tab-content {
  /* Inherits from .tab-content-container global class */
}
/* Responsive text for .sync-area-title */
.mobile-only {
  display: none;
}
.desktop-only {
  display: inline;
}
@media (max-width: 768px) {
  .mobile-only {
    display: inline;
  }
  .desktop-only {
    display: none;
  }
}

/* Processing Section */
.processing-section {
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* Section Header */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.photo-count {
  font-size: 14px;
  color: var(--text-primary);
}

/* Processing Table */
.processing-table-container {
  margin-bottom: 32px;
}

.processing-table {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.processing-row {
  background-color: var(--bg-card);
  border: 1px solid #2c2c32;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.processing-row:last-child {
  border-bottom: 1px solid #2c2c32;
}

.processing-row:hover {
  /* background-color: var(--bg-surface); */
}

.processing-row.finished {
  opacity: 0.7;
}

.processing-row.expanded {
  background-color: var(--bg-container);
}

.row-main {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  padding: 16px 20px;
  align-items: center;
}

.row-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cell-value {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.photos-cell .cell-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-color);
}

.status-cell {
  align-items: flex-start;
}

.expand-cell {
  justify-content: center;
  align-items: center;
}

.actions-cell {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.add-to-collection-btn {
  flex-shrink: 0;
}

.expand-icon {
  color: var(--text-primary);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.processing-row.expanded .expand-icon {
  transform: rotate(180deg);
}

/* Expanded Row Content */
.row-expanded {
  border-top: 1px solid var(--border-color);

  animation: expandRow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes expandRow {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}

.expanded-content {
  padding: 20px;
}

.expanded-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.expanded-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.job-progress {
  width: 120px;
}

.progress-text {
  font-size: 12px;
  color: var(--text-primary);
  min-width: 80px;
}

/* Mini Photos Grid */
.photos-grid-mini {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.mini-photo {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.mini-photo:hover {
  transform: scale(1.05);
  border-color: var(--accent-color);
}

.mini-photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Custom Status Badge Colors */
.status-processing {
  background-color: var(--warning-color) !important;
  color: #ffffff !important;
  border-color: var(--warning-color) !important;
}

.status-finished {
  background-color: #10b981 !important;
  color: #ffffff !important;
  border-color: #10b981 !important;
}

/* Responsive */
@media (max-width: 768px) {
  /* Processing Table Responsive - Compact Card Style */

  .processing-row {
    background-color: var(--bg-card);
    border-radius: 12px;
    border: 1px solid var(--border-color);
    margin-bottom: 12px;
  }

  .processing-row:last-child {
    margin-bottom: 0;
  }

  .row-main {
    display: block;
    padding: 14px;
    position: relative;
  }

  .row-cell {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    padding: 0;
    border-bottom: none;
    gap: 8px;
    margin-bottom: 10px;
  }

  .row-cell:last-of-type {
    margin-bottom: 0;
  }

  .cell-label {
    font-size: 11px;
    color: var(--text-tertiary);
    min-width: 70px;
    flex-shrink: 0;
  }

  .cell-value {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* Date cell - header */
  .date-cell {
    margin-bottom: 12px;
    padding-right: 32px;
  }

  .date-cell .cell-value {
    font-size: 13px;
    font-weight: 500;
  }

  /* Photos count */
  .photos-cell .cell-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-color);
  }

  /* Progress cell */
  .progress-cell {
    flex-direction: row;
    align-items: center;
    width: auto;
    min-width: auto;
  }

  /* Status cell */
  .status-cell {
    align-items: center;
  }

  /* Expand icon - absolute positioned top right */
  .actions-cell:has(.expand-icon) {
    position: absolute;
    top: 14px;
    right: 14px;
    margin-bottom: 0;
  }

  .expand-icon {
    color: var(--text-secondary);
  }

  /* Action button - full width at bottom */
  .actions-cell:has(.add-to-collection-btn) {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #2c2c32;
  }

  .row-actions {
    width: 100%;
  }

  .add-to-collection-btn {
    font-size: 13px;
    width: 100%;
    justify-content: center;
  }

  /* Expanded content */
  .row-expanded {
    border-top: 1px solid #2c2c32;
  }

  .expanded-content {
    padding: 12px 14px;
  }

  .photos-grid-mini {
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
  }

  .expanded-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .progress-info {
    width: 100%;
  }

  .job-progress {
    width: 100%;
  }
}

/* Desktop Progress Cell */
@media (min-width: 769px) {
  .progress-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    width: 56px;
  }

  .progress-compact {
    display: block;
    margin: 0 auto;
  }
}
</style>
