<template>
  <div class="workspace-preview-wrapper">
    <div v-if="hasPhotos" class="workspace-preview-content">
      <div class="workspace-photo-grid">
        <div
          v-for="(photo, index) in gridPhotos"
          :key="photo.id || index"
          :class="`grid-photo grid-photo-${index + 1}`"
        >
          <img
            :src="photo.thumbnailUrl || photo.url"
            :alt="photo.title || 'Photo'"
            class="grid-photo-img"
            loading="lazy"
          />
        </div>
      </div>
      <div class="workspace-info">
        <div class="info-content">
          <div class="workspace-icon">
            <n-icon size="45" color="white">
              <LayersOutline />
            </n-icon>
          </div>
          <h3 class="workspace-title">Workspace</h3>
          <!-- <p class="workspace-description">Browse your photo catalog</p> -->
          <p v-if="photoCount > 0" class="workspace-count">
            {{ photoCount }} {{ photoCount === 1 ? "photo" : "photos" }}
          </p>
        </div>
      </div>
    </div>

    <div v-else class="workspace-empty">
      <div class="empty-icon">
        <n-icon size="45" color="var(--primary-color)">
          <LayersOutline />
        </n-icon>
      </div>
      <h3 class="empty-title">Workspace</h3>
      <p class="empty-description">Browse your photo catalog</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { LayersOutline } from "@vicons/ionicons5";
// @ts-ignore - JS module without type definitions
import { useArtisticScores } from "../composables/useArtisticScores.js";

interface Photo {
  id: string;
  thumbnailUrl?: string;
  url?: string;
  title?: string;
  descriptions?: {
    artistic_scores?: any;
  };
  src?: string;
}

interface Props {
  photos?: Photo[];
}

const props = defineProps<Props>();

const { calculateArtisticScore } = useArtisticScores();

// Helper function to randomly select items from an array
const getRandomItems = <T,>(array: T[], count: number): T[] => {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, array.length));
};

const hasPhotos = computed(() => {
  return props.photos && Array.isArray(props.photos) && props.photos.length > 0;
});

const photoCount = computed(() => {
  return props.photos?.length || 0;
});

const gridPhotos = computed(() => {
  if (!hasPhotos.value) return [];

  const photos = props.photos!;

  // Filter photos that have artistic_scores
  const photosWithScores = photos.filter(
    (photo) => photo.descriptions?.artistic_scores,
  );

  // If no photos with scores, fallback to random selection from all photos
  if (photosWithScores.length === 0) {
    return getRandomItems(photos, 8).map((photo: any) => ({
      id: photo.id,
      thumbnailUrl: photo.thumbnailUrl,
      url: photo.src || photo.url,
      title: photo.title,
    }));
  }

  // Calculate artistic score for each photo and sort by score (descending)
  const photosWithCalculatedScores = photosWithScores
    .map((photo) => {
      const scoreResult = calculateArtisticScore(
        photo.descriptions!.artistic_scores,
        "street", // Using default genre preset
      );
      return {
        photo,
        score: scoreResult.average,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Take top 50 photos with best aesthetic scores
  const top50 = photosWithCalculatedScores
    .slice(0, 50)
    .map((item) => item.photo);

  // Randomly select 8 photos from the top 50
  const selectedPhotos = getRandomItems(top50, 8);

  return selectedPhotos.map((photo: any) => ({
    id: photo.id,
    thumbnailUrl: photo.thumbnailUrl,
    url: photo.src || photo.url,
    title: photo.title,
  }));
});
</script>

<style scoped>
.workspace-preview-wrapper {
  width: 100%;
  height: 100%;
  min-height: 190px;
  position: relative;
  overflow: hidden;
  border-radius: var(--border-radius-lg);
}

.workspace-preview-content {
  width: 100%;
  height: 100%;
  min-height: 190px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-photo-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 2px;
  padding: 0;
}

.workspace-photo-grid::after {
  content: "";
  /* margin-top: 7px; */
  position: absolute;
  inset: 0;
  z-index: 1;
  background: radial-gradient(
    ellipse 93% 100% at center,
    rgba(15, 23, 42, 0.9) 0%,
    rgba(15, 23, 42, 0.75) 25%,
    rgba(15, 23, 42, 0.4) 50%,
    rgba(15, 23, 42, 0.1) 75%,
    transparent 100%
  );
  /* backdrop-filter: blur(1px); */
  -webkit-backdrop-filter: blur(12px);
  mask-image: radial-gradient(
    ellipse 130% 55% at center,
    black 0%,
    black 20%,
    rgba(0, 0, 0, 0.7) 45%,
    rgba(0, 0, 0, 0.3) 70%,
    transparent 100%
  );
  -webkit-mask-image: radial-gradient(
    ellipse 130% 97% at center,
    black 0%,
    black 20%,
    rgba(0, 0, 0, 0.7) 45%,
    rgba(0, 0, 0, 0.3) 70%,
    transparent 100%
  );
  pointer-events: none;
}

/* Grid layout positions - uniform 4x2 grid */
.grid-photo {
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background-color: var(--bg-container);
}

.grid-photo-1 {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
}

.grid-photo-2 {
  grid-column: 2 / 3;
  grid-row: 1 / 2;
}

.grid-photo-3 {
  grid-column: 3 / 4;
  grid-row: 1 / 2;
}

.grid-photo-4 {
  grid-column: 4 / 5;
  grid-row: 1 / 2;
}

.grid-photo-5 {
  grid-column: 1 / 2;
  grid-row: 2 / 3;
}

.grid-photo-6 {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
}

.grid-photo-7 {
  grid-column: 3 / 4;
  grid-row: 2 / 3;
}

.grid-photo-8 {
  grid-column: 4 / 5;
  grid-row: 2 / 3;
}

.grid-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.workspace-info {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
}

.info-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
}

.workspace-icon {
  margin-bottom: 0;
}

.workspace-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: white;
  margin: 0;
  line-height: var(--line-height-tight);
}

.workspace-description {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  line-height: var(--line-height-normal);
}

.workspace-count {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.75);
  margin: 0;
  font-weight: var(--font-weight-medium);
}

/* Empty state */
.workspace-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  text-align: center;
  height: 100%;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
}

.empty-icon {
  margin-bottom: var(--spacing-md);
}

.empty-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
  line-height: var(--line-height-tight);
}

.empty-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}
</style>
