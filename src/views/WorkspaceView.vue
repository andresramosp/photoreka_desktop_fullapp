<template>
  <div class="workspace-view view-container">
    <!-- Header Section -->
    <div
      class="workspace-header scroll-header"
      :class="{ 'header-hidden': headerHidden, entering: headerEntering }"
    >
      <div class="header-content">
        <h1 class="page-title">Your Workspace</h1>
        <p class="page-subtitle">
          Here's your catalog with all the photos processed and ready to be used
          in all the tools.
        </p>
      </div>
      <!-- Mobile Badge with Photo Count -->
      <div
        v-if="isMobile && processedPhotos.length > 0"
        class="mobile-photo-badge"
      >
        <n-badge :value="processedPhotos.length + ' photos'" type="info">
        </n-badge>
      </div>
    </div>

    <!-- Content Section -->
    <div
      v-if="processedPhotos.length == 0"
      class="workspace-content content-container"
    >
      <!-- Empty State (when no photos) -->
      <div v-if="processedPhotos.length == 0" class="empty-state">
        <div class="empty-content">
          <n-icon size="64" color="#6b7280" class="empty-icon">
            <LayersOutline />
          </n-icon>
          <h2 class="empty-title">Your workspace is empty</h2>
          <p class="empty-description">
            Start by uploading and processing your photos.
          </p>
          <div class="instructions-list">
            <div class="instruction-item">
              <n-icon><CloudUploadOutline /></n-icon>
              <span
                >Go to
                <button class="tab-link" @click="navigateToSyncArea">
                  Import Area
                </button>
                and upload or sync your photos from any platform</span
              >
            </div>
            <div class="instruction-item">
              <n-icon><FlashOutline /></n-icon>
              <span
                >Click <strong>Analyze Photos</strong> and follow the process in
                the Analyses tab</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Catalog with Photos -->
      <div v-else class="catalog-section">
        <div class="catalog-photos">
          <!-- Photos Grid Component -->
          <PhotosGrid
            :key="gridQueryKey"
            :photos="processedPhotos"
            context="workspace"
            :scrollable="true"
            :initial-filters="initialGridFilters"
            @scroll-direction="onScrollDirection"
          />
        </div>
      </div>
    </div>

    <div v-else class="catalog-section">
      <div class="catalog-photos">
        <!-- Photos Grid Component -->
        <PhotosGrid
          :key="gridQueryKey"
          :photos="processedPhotos"
          context="workspace"
          :scrollable="true"
          :initial-filters="initialGridFilters"
          @scroll-direction="onScrollDirection"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos.js";
import { parseGridFiltersFromQuery } from "@/utils/photosGridQuery.js";
import { NIcon, NBadge } from "naive-ui";
import {
  LayersOutline,
  CloudUploadOutline,
  FlashOutline,
} from "@vicons/ionicons5";
import PhotosGrid from "@/components/PhotosGrid.vue";
import UsageIndicators from "@/components/UsageIndicators.vue";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useHeaderHideOnScroll } from "@/composables/useHeaderHideOnScroll.js";

defineOptions({
  name: "WorkspaceView",
});

const router = useRouter();
const route = useRoute();
const photosStore = usePhotosStore();
const { isMobile } = useIsMobile();

// Deep-link filters/sorting (e.g. from a ChatLab "open workspace" action).
// Reactive to the query: PhotosGrid/Controls hydrate on mount, and the grid is
// re-keyed on query change so arriving via a deep link re-seeds even when this
// view is kept-alive (no natural remount).
const initialGridFilters = computed(() => parseGridFiltersFromQuery(route.query));
const gridQueryKey = computed(() => JSON.stringify(initialGridFilters.value || {}));

const { headerHidden, headerEntering, onScrollDirection } =
  useHeaderHideOnScroll();

// Processed photos from store
const processedPhotos = computed(() => photosStore.processedPhotos);

// Navigation function for empty state
const navigateToSyncArea = () => {
  router.push({ name: "import-area", hash: "#upload" });
};
</script>

<style scoped>
.workspace-view {
  /* padding: var(--spacing-2xl); */
  margin: 0 auto;
  background-color: var(--bg-body);
  position: relative;
}

@media (min-width: 769px) {
  .workspace-view {
    overflow-y: hidden;
  }
}

/* Header Section */
.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-2xl);
  gap: var(--spacing-2xl);
  position: relative;
  max-height: 110px;
}

.header-content {
  flex: 1;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
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

.mobile-photo-badge {
  position: absolute;
  top: 5px;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Content Section - local overrides only */
.workspace-content {
  /* Inherits from .content-container global class */
}

/* Empty State */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl) 0;
}

.empty-content {
  text-align: center;
  max-width: 640px;
}

.empty-icon {
  margin-bottom: var(--spacing-lg);
}

.empty-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: 0 0 0 0;
}

.empty-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin-top: 10px;
  margin-bottom: 5px;
  line-height: var(--line-height-relaxed);
}

.instructions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-lg);
  align-content: center;
  justify-content: center;
  align-items: center;
}

.instruction-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 14px;
  color: var(--text-secondary);
}

/* Catalog Section */
.catalog-section {
  min-height: 300px;
}

.catalog-photos {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xl);
}

/* Responsive */
@media (max-width: 768px) {
  .workspace-view {
    padding: 16px;
  }

  .workspace-header {
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

  .workspace-content {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .workspace-view {
    padding: 12px;
  }

  .workspace-header {
    margin-bottom: var(--spacing-lg);
  }
}
</style>
