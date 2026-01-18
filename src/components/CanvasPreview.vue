<template>
  <div class="canvas-preview-wrapper">
    <div v-if="hasCanvas" class="canvas-preview-content">
      <div class="canvas-photo-grid" :class="`grid-${gridPhotos.length}`">
        <div
          v-for="(photo, index) in gridPhotos"
          :key="photo.id || index"
          class="grid-photo"
        >
          <img
            :src="photo.thumbnailUrl || photo.url"
            :alt="photo.title || 'Photo'"
            class="grid-photo-img"
            loading="lazy"
          />
        </div>
      </div>
      <div class="canvas-info">
        <h3 class="canvas-title">Continue your Canvas</h3>
        <p class="canvas-count">
          {{ photoCount }} {{ photoCount === 1 ? "photo" : "photos" }}
        </p>
      </div>
    </div>

    <div v-else class="canvas-empty">
      <div class="empty-icon">
        <n-icon size="32">
          <Workspace />
        </n-icon>
      </div>
      <h3 class="empty-title">Canvas</h3>
      <p class="empty-description">Start a new canvas</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Workspace } from "@vicons/carbon";

interface Props {
  canvasData?: any;
}

const props = defineProps<Props>();

const hasCanvas = computed(() => {
  return (
    props.canvasData &&
    props.canvasData.data &&
    Array.isArray(props.canvasData.data.photos) &&
    props.canvasData.data.photos.length > 0
  );
});

const photoCount = computed(() => {
  return props.canvasData?.data?.photos?.length || 0;
});

const gridPhotos = computed(() => {
  if (!hasCanvas.value) return [];

  const photos = props.canvasData.data.photos;

  // Take first 4 photos for grid
  return photos.slice(0, 4).map((photo: any) => ({
    id: photo.id,
    thumbnailUrl: photo.thumbnailUrl,
    url: photo.src,
    title: photo.title,
  }));
});
</script>

<style scoped>
.canvas-preview-wrapper {
  width: 100%;
  position: relative;
  overflow: hidden;
}
.canvas-preview-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
}

.canvas-photo-grid {
  display: grid;
  gap: 6px;
  width: 100%;
  max-width: 185px;
  height: 120px;
}

/* Grid layouts based on photo count */
.grid-1 {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.grid-2 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr;
}

.grid-3 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.grid-3 .grid-photo:first-child {
  grid-row: 1 / -1;
}

.grid-4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.grid-photo {
  overflow: hidden;
  /* background-color: var(--bg-container); */
  /* border: 1px solid var(--text-secondary); */
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-photo-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  transition: transform 0.2s ease;
}

.canvas-info {
  text-align: center;
  width: 100%;
}

.canvas-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.canvas-count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

.canvas-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.empty-icon {
  color: var(--success-color);
  margin-bottom: var(--spacing-md);
}

.empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.empty-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .canvas-photo-grid {
    max-width: 120px;
  }

  .canvas-title {
    font-size: var(--font-size-base);
  }

  .canvas-count {
    font-size: var(--font-size-xs);
  }
}
</style>
