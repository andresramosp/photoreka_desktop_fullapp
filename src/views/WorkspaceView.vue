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
      <div class="header-actions">
        <!-- Usage Indicators -->
        <UsageIndicators />
      </div>
    </div>

    <!-- Content Section -->
    <div class="workspace-content">
      <!-- Empty State (when no photos) -->
      <div v-if="processedPhotos.length == 0" class="empty-state-section">
        <div class="empty-state-container">
          <div class="empty-state-content">
            <div class="empty-state-icon">
              <n-icon size="48">
                <BookInformation20Regular />
              </n-icon>
            </div>
            <h3 class="empty-state-title">Your workspace is empty</h3>
            <div class="empty-state-steps">
              <div class="step-item">
                1. Go to
                <button class="tab-link" @click="navigateToSyncArea">
                  Sync Area
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
          <PhotosGrid :photos="processedPhotos" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos.js";
import { NIcon } from "naive-ui";
import { BookInformation20Regular } from "@vicons/fluent";
import PhotosGrid from "@/components/PhotosGrid.vue";
import UsageIndicators from "@/components/UsageIndicators.vue";

defineOptions({
  name: "WorkspaceView",
});

const router = useRouter();
const photosStore = usePhotosStore();

// Processed photos from store
const processedPhotos = computed(() => photosStore.processedPhotos);

// Navigation function for empty state
const navigateToSyncArea = () => {
  router.push({ name: "sync-area", hash: "#upload" });
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

/* Content Section */
.workspace-content {
  background-color: var(--bg-container);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  padding: var(--spacing-3xl);
}

/* Empty State Styles */
.empty-state-section {
  display: flex;
  min-height: 500px;
  flex-direction: column;
}

.empty-state-container {
  border: 2px dashed #2c2c32;
  border-radius: 16px;
  padding: 64px 32px;
  text-align: center;
  background-color: var(--bg-body);
  transition: all 0.3s ease;
}

.empty-state-content {
  max-width: 550px;
  margin: 0 auto;
}

.empty-state-icon {
  margin-bottom: 24px;
}

.empty-state-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.empty-state-steps {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.step-item {
  text-align: center;
  color: var(--text-primary);
}

.tab-link {
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  text-decoration: underline;
  font-size: inherit;
  padding: 0;
  margin: 0;
}

.tab-link:hover {
  color: #a78bfa;
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

  .empty-state-container {
    padding: 48px 24px;
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
