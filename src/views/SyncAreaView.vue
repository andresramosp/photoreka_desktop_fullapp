<template>
  <div class="sync-area-container view-container">
    <!-- Header Section -->
    <div class="hub-header">
      <div class="header-content">
        <h1 class="page-title">Sync Area</h1>
        <p class="page-subtitle">Synchronize and process your photos here.</p>
      </div>
    </div>

    <!-- Tabs Section -->
    <div class="tabs-container">
      <div class="tab-navigation">
        <button
          class="tab-button"
          :class="{ active: activeTab === 'upload' }"
          @click="setActiveTab('upload')"
        >
          <div class="tab-title">
            <n-icon size="18" :color="'var(--primary-color)'">
              <CloudUploadOutline />
            </n-icon>
            Lightbox
          </div>
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'processing' }"
          @click="setActiveTab('processing')"
        >
          <div class="tab-title">
            <n-icon>
              <InProgress color="var(--primary-color)" />
            </n-icon>
            Analyses
          </div>
        </button>
      </div>
      <div class="tab-content-container">
        <KeepAlive>
          <LightboxPhotos
            ref="lightboxRef"
            v-show="activeTab === 'upload'"
            key="lightbox-photos"
            @on-analyze="analyze"
            @selection-change="handleLightboxSelectionChange"
          />
        </KeepAlive>
        <KeepAlive>
          <ProcessingPhotos
            v-show="activeTab === 'processing'"
            key="processing-photos"
            @navigate-to-tab="setActiveTab"
          />
        </KeepAlive>
      </div>
    </div>

    <!-- Floating Process Photos Button -->
    <FloatingProcessPhotosButton
      :should-show="shouldShowProcessButton"
      :disabled="isProcessButtonDisabled"
      :progress="processButtonProgress"
      :button-state="processButtonState"
      :selected-count="lightboxSelectedCount"
      @click="handleProcessButtonClick"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed, KeepAlive } from "vue";

defineOptions({
  name: "SyncAreaView",
});
import LightboxPhotos from "@/components/sync-area/LightboxPhotos.vue";
import ProcessingPhotos from "@/components/sync-area/ProcessingPhotos.vue";
import FloatingProcessPhotosButton from "@/components/FloatingProcessPhotosButton.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useUserStore } from "@/stores/userStore.ts";
import { api, api_analyzer } from "@/utils/axios";
import { useMessage, useNotification } from "naive-ui";
import { CloudUploadOutline } from "@vicons/ionicons5";
import { InProgress } from "@vicons/carbon";

const photosStore = usePhotosStore();
const userStore = useUserStore();
const notification = useNotification();
const message = useMessage();

// Control para el mensaje de confirmación de email
const emailConfirmationMessageId = ref(null);

// Reactive state
const activeTab = ref("upload");
const lightboxRef = ref(null);
const lightboxSelectedCount = ref(0);

// Handle selection changes from LightboxPhotos
const handleLightboxSelectionChange = (selectionData) => {
  lightboxSelectedCount.value = selectionData.selectedCount;
};

// Computed for floating button - solo mostrar en tab upload
const shouldShowProcessButton = computed(() => {
  return activeTab.value === "upload" && photosStore.lightboxPhotos?.length > 0;
});

const isProcessButtonDisabled = computed(() => {
  return (
    photosStore.processButtonState === "disabled" ||
    photosStore.processButtonState === "processing"
  );
});

const processButtonProgress = computed(() => {
  return photosStore.processButtonProgress;
});

const processButtonState = computed(() => {
  return photosStore.processButtonState;
});

// Debug watchers (temporal)
watch(
  () => photosStore.preprocessedPhotos?.length,
  (newCount, oldCount) => {
    console.log(`Preprocessed photos changed: ${oldCount} → ${newCount}`);
    console.log(`Progress: ${photosStore.processButtonProgress}%`);
    console.log(`Button state: ${photosStore.processButtonState}`);
  }
);

// Debug the computed values too
watch(
  () => processButtonProgress.value,
  (newVal) => {
    console.log(`processButtonProgress computed changed: ${newVal}`);
  }
);

watch(
  () => processButtonState.value,
  (newVal) => {
    console.log(`processButtonState computed changed: ${newVal}`);
  }
);

const handleProcessButtonClick = () => {
  if (lightboxRef.value && lightboxRef.value.openAnalyzeDialog) {
    lightboxRef.value.openAnalyzeDialog();
  }
};

const setActiveTab = (tab) => {
  activeTab.value = tab;
  // Actualiza el hash de la URL sin recargar la página ni disparar navegación
  if (window.location.hash.replace("#", "") !== tab) {
    window.history.replaceState(null, "", `#${tab}`);
  }
};

const updateTabFromHash = () => {
  const hash = window.location.hash.replace("#", "");
  if (["upload", "processing"].includes(hash) && activeTab.value !== hash) {
    activeTab.value = hash;
  }
};

async function analyze(ev) {
  // Usar los IDs seleccionados del evento o todos los de lightbox si no hay selección
  const lightboxAreaIds = photosStore.lightboxPhotos.map((p) => p.id);
  const toProcess =
    ev.selectedIds && ev.selectedIds.length > 0
      ? ev.selectedIds
      : lightboxAreaIds;

  if (toProcess.length === 0) return;

  try {
    setActiveTab("processing");
    message.success(
      `The analysis of your photos has begun! You can close this window in the meantime.`,
      { duration: 5000 }
    );
    await api_analyzer.post(`/api/analyzer`, {
      packageId: "process",
      mode: "adding",
      fastMode: ev.fastMode,
      photoIds: toProcess,
    });
    photosStore.clearAllSelections();
    photosStore.getOrFetch(true);

    // Update usage after starting analysis
    await userStore.fetchUsage();
  } catch (error) {
    console.error("❌ Error iniciando análisis:", error);
  }
}

onMounted(() => {
  updateTabFromHash();

  window.addEventListener("hashchange", updateTabFromHash);

  // Watcher para mostrar/ocultar mensaje de confirmación de email
  watch(
    () => userStore.user?.isEmailConfirmed,
    (isEmailConfirmed) => {
      if (userStore.isAuthenticated && isEmailConfirmed === false) {
        // Solo mostrar si no hay un mensaje activo
        if (!emailConfirmationMessageId.value) {
          emailConfirmationMessageId.value = notification.warning({
            title: "Confirm your email",
            content:
              "Please confirm your email before importing photos. Check your inbox for the confirmation email.",
            duration: 0,
            closable: true,
            onClose: () => {
              emailConfirmationMessageId.value = null;
            },
          });
        }
      } else if (emailConfirmationMessageId.value) {
        emailConfirmationMessageId.value = null;
      }
    },
    { immediate: true }
  );
});
</script>

<style scoped>
.sync-area-container {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
  position: relative;
}

/* Header Section */
.hub-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-2xl);
  gap: var(--spacing-2xl);
}

/* Tabs Section */
.tabs-container {
  background-color: var(--bg-container);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  margin-bottom: var(--spacing-2xl);
}

/* Custom Tab Navigation */
.tab-navigation {
  display: flex;
  background-color: var(--bg-container);
  padding: var(--spacing-sm);
  gap: var(--spacing-xs);
}

.tab-title {
  display: flex;
  justify-content: center;
  gap: 5px;
  align-items: center;
}

.tab-button {
  flex: 1;
  padding: var(--spacing-md) var(--spacing-2xl);
  background-color: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: var(--transition-fast);
  text-align: center;
}

.tab-button:hover {
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

.tab-button.active {
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

/* Tab Content Container */
.tab-content-container {
  background-color: var(--bg-container);
}

.tab-content {
  padding: var(--spacing-3xl);
  background-color: var(--bg-container);
}

.header-content {
  flex: 1;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.page-subtitle {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

/* Duplicate Notification */
.duplicate-notification {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 1000;
}

/* Photos Section */
.photos-section,
.uploaded-photos-section,
.upload-queue {
  margin-top: 24px;
}

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

.header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.analyze-btn {
  height: 36px;
}

.photo-count {
  font-size: 14px;
  color: var(--text-primary);
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.photo-card {
  background-color: var(--bg-body);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
  border: 1px solid #2c2c32;
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.photo-card.duplicate {
  border-color: #f59e0b;
}

.skeleton-card {
  opacity: 0.8;
}

/* Note: Photo skeleton styles moved to global.scss */

.photo-thumbnail {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
}

.photo-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.duplicate-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(245, 158, 11, 0.9);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.photo-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.photo-thumbnail:hover .photo-overlay {
  opacity: 1;
}

.overlay-btn {
  background-color: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
}

.photo-info {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-primary);
}

.photo-status {
  padding: 0 16px 16px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.duplicate-tag {
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.upload-progress-indicator {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.upload-text {
  font-size: 12px;
  color: var(--text-primary);
}

/* Empty States */

.empty-state-content {
  text-align: center;
  max-width: 400px;
}

.empty-state-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 16px 0 8px 0;
}

.empty-state-description {
  font-size: 16px;
  color: var(--text-primary);
  margin: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .sync-area-container {
    padding: 16px;
  }

  .hub-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .page-title {
    font-size: var(--font-size-2xl);
  }

  .page-subtitle {
    font-size: var(--font-size-sm);
  }

  .header-actions {
    justify-content: stretch;
  }

  .action-btn {
    flex: 1;
  }

  /* Tabs responsive - scrollable on mobile */
  .tab-navigation {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
    padding-bottom: 2px; /* Prevent cut-off from scroll */
  }

  .tab-navigation::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }

  .tab-button {
    flex: 0 0 auto;
    padding: var(--spacing-sm) var(--spacing-lg);
    font-size: var(--font-size-base);
    white-space: nowrap;
    min-width: fit-content;
  }

  .tab-title {
    gap: 6px;
  }

  .tab-title .n-icon {
    font-size: 16px !important;
  }

  .upload-dropzone {
    padding: 48px 24px;
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-controls {
    width: 100%;
    justify-content: space-between;
  }

  .duplicate-notification {
    top: 16px;
    right: 16px;
    left: 16px;
  }
}

@media (max-width: 480px) {
  .sync-area-container {
    padding: 12px;
  }

  .hub-header {
    margin-bottom: var(--spacing-lg);
  }

  .tab-button {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-base); /* 14px - legible on small screens */
  }

  .tab-title {
    gap: 5px;
  }

  .tab-title .n-icon {
    font-size: 16px !important;
  }
}
</style>
