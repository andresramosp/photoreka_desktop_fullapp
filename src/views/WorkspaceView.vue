<template>
  <div class="workspace-view view-container">
    <!-- Header Section -->
    <div class="workspace-header">
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
      <!-- <div v-if="!isMobile" class="header-actions">
        <UsageIndicators :large="false" />
      </div> -->
    </div>

    <!-- Content Section -->
    <div
      v-if="processedPhotos.length == 0"
      class="workspace-content content-container"
    >
      <!-- Empty State (when no photos) -->
      <div v-if="processedPhotos.length == 0" class="empty-state-section">
        <div class="empty-state-container">
          <div class="empty-state-content">
            <div class="empty-state-icon">
              <n-icon size="48" color="var(--primary-color)">
                <LayersOutline />
              </n-icon>
            </div>
            <h3 class="empty-state-title">Your workspace is empty</h3>
            <p class="empty-state-subtitle">
              Start by uploading and processing your photos.
            </p>
            <div class="empty-state-steps">
              <div class="step-item">
                1. Go to
                <button class="tab-link" @click="navigateToSyncArea">
                  Import Area
                </button>
              </div>
              <div class="step-item">
                2. Upload or sync your photos from any platform
              </div>
              <div class="step-item">
                3. Click Analyze Photos and follow the process evolution in the
                Analyses tab
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Catalog with Photos -->
      <div v-else class="catalog-section">
        <div class="catalog-photos">
          <!-- Photos Grid Component -->
          <PhotosGrid :photos="processedPhotos" context="workspace" />
        </div>
      </div>
    </div>

    <div v-else class="catalog-section">
      <div class="catalog-photos">
        <!-- Photos Grid Component -->
        <PhotosGrid :photos="processedPhotos" context="workspace" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos.js";
import { NIcon, NBadge } from "naive-ui";
import { LayersOutline } from "@vicons/ionicons5";
import PhotosGrid from "@/components/PhotosGrid.vue";
import UsageIndicators from "@/components/UsageIndicators.vue";
import { useIsMobile } from "@/composables/useIsMobile.js";

defineOptions({
  name: "WorkspaceView",
});

const router = useRouter();
const photosStore = usePhotosStore();
const { isMobile } = useIsMobile();

// Processed photos from store
const processedPhotos = computed(() => photosStore.processedPhotos);

// Navigation function for empty state
const navigateToSyncArea = () => {
  router.push({ name: "import-area", hash: "#upload" });
};
</script>

<style scoped>
.workspace-view {
  padding: var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
  position: relative;
}

/* Header Section */
.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-2xl);
  gap: var(--spacing-2xl);
  position: relative;
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

/* Empty State - extends global .empty-state-subtitle */
.empty-state-subtitle {
  margin-bottom: 32px;
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
