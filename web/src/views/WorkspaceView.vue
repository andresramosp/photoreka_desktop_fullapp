<template>
  <div
    class="workspace-view view-container"
    :class="{ 'is-empty': processedPhotos.length == 0 }"
  >
    <!-- Quick Search Bar -->
    <div
      v-if="processedPhotos.length > 0"
      class="workspace-header scroll-header"
      :class="{
        'header-hidden': HIDE_ON_SCROLL && headerHidden,
        entering: HIDE_ON_SCROLL && headerEntering,
      }"
    >
      <QuickSearchBar
        class="workspace-quick-search"
        :photos="processedPhotos"
        v-model:genres="quickSearchGenres"
        @update:tag-results="quickSearchTagResults = $event"
        @update:searching="isSearchingTags = $event"
      />
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
            :key="gridSeedKey"
            :photos="processedPhotos"
            context="workspace"
            :scrollable="true"
            :initial-filters="initialGridFilters"
            :scores-toolbar="true"
            @scroll-direction="onScrollDirection"
          />
        </div>
      </div>
    </div>

    <div v-else class="catalog-section">
      <div class="catalog-photos">
        <!-- Photos Grid Component -->
        <PhotosGrid
          :key="gridSeedKey"
          :photos="processedPhotos"
          context="workspace"
          :scrollable="true"
          :initial-filters="initialGridFilters"
          :scores-toolbar="true"
          v-model:genre-filter="quickSearchGenres"
          :tag-results="quickSearchTagResults"
          :loading="isSearchingTags"
          @scroll-direction="onScrollDirection"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { usePhotosStore } from "@/stores/photos.js";
import { usePhotosGridDeepLink } from "@/composables/usePhotosGridDeepLink.js";
import { NIcon } from "naive-ui";
import {
  LayersOutline,
  CloudUploadOutline,
  FlashOutline,
} from "@vicons/ionicons5";
import PhotosGrid from "@/components/PhotosGrid.vue";
import QuickSearchBar from "@/components/workspace/QuickSearchBar.vue";
import UsageIndicators from "@/components/UsageIndicators.vue";
import { useHeaderHideOnScroll } from "@/composables/useHeaderHideOnScroll.js";

defineOptions({
  name: "WorkspaceView",
});

const router = useRouter();
const photosStore = usePhotosStore();

// Deep-link filters/sorting (e.g. from a ChatLab "open workspace" action).
const { initialGridFilters, gridSeedKey } = usePhotosGridDeepLink(
  (r) => r.name === "workspace",
);

// La barra de quick search es un control, no una cabecera decorativa: se queda
// visible al scrollear. El mecanismo de ocultación sigue cableado para poder
// recuperarlo con solo poner esta constante a true.
const HIDE_ON_SCROLL = true;

const { headerHidden, headerEntering, onScrollDirection } =
  useHeaderHideOnScroll();

// Estado que la barra comparte con la grilla: los géneros van en doble sentido
// (el chip y el select de aspectos son el mismo filtro), y los resultados de la
// búsqueda por tags viajan ya resueltos a ids de foto.
const quickSearchGenres = ref([]);
const quickSearchTagResults = ref(null);
// Solo los tags consultan al back; los géneros se resuelven en cliente.
const isSearchingTags = ref(false);

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

/* Header Section — ahora la barra de quick search */
.workspace-header {
  display: flex;
  align-items: center;
  margin-bottom: var(--spacing-sm);
  gap: var(--spacing-md);
  position: relative;
  min-width: 0;
  /* Punto de partida de la animación de .scroll-header.header-hidden, que
     colapsa max-height a 0. Sin un valor explícito el colapso sería seco.
     Holgado a propósito: en móvil la barra envuelve el buscador a una
     segunda fila y no debe recortarse. Ver HIDE_ON_SCROLL en el script. */
  max-height: 120px;
}

.workspace-quick-search {
  flex: 1;
  min-width: 0;
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

/* Content Section - local overrides only */
/* border-box: the global .view-container is content-box, so height: 100% plus
   its padding overflows the shell and clips the box's bottom border. */
.workspace-view.is-empty {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  /* Tight bottom gap so the border runs below the floating help button. */
  padding-bottom: var(--spacing-xs);
}

/* Fills the remaining height instead of the global 70vh minimum, but never
   shrinks below its content on short screens. */
.workspace-content {
  flex: 1 0 auto;
  min-height: 0;
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
    align-items: stretch;
    gap: 8px;
    margin-bottom: var(--spacing-sm);
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
    margin-bottom: var(--spacing-sm);
  }
}
</style>
