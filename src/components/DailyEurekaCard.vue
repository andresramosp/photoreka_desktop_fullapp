<template>
  <div
    class="action-card did-you-know"
    :class="{
      disabled:
        appAccessMode === 'blocked' || (!photoInsight && !isLoadingInsight),
      loading: isLoadingInsight,
      'has-photo': photoInsight && photoInsight.photo && !isLoadingInsight,
      hovering: isHoveringInsight,
    }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Photo container -->
    <div
      v-if="photoInsight && photoInsight.photo && !isLoadingInsight"
      class="photo-container"
    >
      <img
        :src="photoInsight.photo.thumbnailUrl"
        :alt="photoInsight.photo.originalFileName"
        class="insight-photo"
      />
      <div class="photo-overlay"></div>
    </div>

    <!-- Info button - OUTSIDE everything -->
    <div
      v-if="
        isHoveringInsight &&
        photoInsight &&
        photoInsight.photo &&
        !isLoadingInsight
      "
      class="info-button-container"
    >
      <n-button class="action-button info-button" @click.stop="showPhotoInfo">
        <template #icon>
          <n-icon>
            <InfoIcon />
          </n-icon>
        </template>
      </n-button>
    </div>

    <div class="insight-content">
      <div v-if="isLoadingInsight" class="insight-loader">
        <n-spin size="large" />
      </div>
    </div>
    <div
      v-show="!isHoveringInsight && !isLoadingInsight"
      class="insight-overlay"
    >
      <h3 class="action-title">Daily Eureka!</h3>
      <p class="action-description">Discover insights in your images</p>
    </div>

    <!-- Carousel overlay -->
    <div
      v-show="
        isHoveringInsight &&
        photoInsight &&
        photoInsight.insights &&
        photoInsight.insights.length > 0
      "
      class="insight-carousel-overlay"
    >
      <div class="carousel-content">
        <button
          v-if="photoInsight && photoInsight.insights.length > 1"
          class="carousel-arrow carousel-arrow-left"
          @click.stop="prevInsight"
        >
          <n-icon size="20">
            <ArrowLeftIcon />
          </n-icon>
        </button>

        <div class="insight-text-container">
          <transition name="insight-slide" mode="out-in">
            <div :key="currentInsightIndex" class="insight-text-slide">
              <p>
                {{
                  photoInsight ? photoInsight.insights[currentInsightIndex] : ""
                }}
              </p>
            </div>
          </transition>
        </div>

        <button
          v-if="photoInsight && photoInsight.insights.length > 1"
          class="carousel-arrow carousel-arrow-right"
          @click.stop="nextInsight"
        >
          <n-icon size="20">
            <ArrowRightIcon />
          </n-icon>
        </button>
      </div>

      <!-- Dots indicator -->
      <div
        v-if="photoInsight && photoInsight.insights.length > 1"
        class="carousel-dots"
      >
        <div
          v-for="(_, index) in photoInsight.insights"
          :key="index"
          class="carousel-dot"
          :class="{ active: index === currentInsightIndex }"
          @click.stop="currentInsightIndex = index"
        ></div>
      </div>
    </div>
  </div>

  <!-- Photo Info Dialog -->
  <PhotoInfoDialog
    v-model="showPhotoInfoDialog"
    :selected-photo="selectedDialogPhoto"
  />
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { api } from "@/utils/axios.js";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import {
  ChevronBackOutline as ArrowLeftIcon,
  ChevronForwardOutline as ArrowRightIcon,
  InformationCircleOutline as InfoIcon,
} from "@vicons/ionicons5";

const photosStore = usePhotosStore();

interface PhotoInsight {
  photo: {
    id: string;
    originalFileName: string;
    thumbnailUrl: string;
    originalUrl: string;
  };
  insights: string[];
}

const photoInsight = ref<PhotoInsight | null>(null);
const isLoadingInsight = ref(false);
const isHoveringInsight = ref(false);
const currentInsightIndex = ref(0);
const insightFetchLimit = 1;
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref();

const appAccessMode = computed(() => photosStore.appAccessMode);

const fetchPhotoInsight = async () => {
  try {
    if (!Array.isArray(photosStore.photos) || photosStore.photos.length === 0) {
      return;
    }

    const today = new Date().toDateString();
    const lastFetchDate = localStorage.getItem("photoInsightLastFetch");
    let fetchCount = Number(
      localStorage.getItem("photoInsightFetchCount") || 0,
    );

    if (lastFetchDate !== today) {
      fetchCount = 0;
    }

    const cachedInsight = localStorage.getItem("photoInsightData");
    if (cachedInsight && fetchCount >= insightFetchLimit) {
      photoInsight.value = JSON.parse(cachedInsight);
      return;
    }

    const randomIndex = Math.floor(Math.random() * photosStore.photos.length);
    const randomPhoto = photosStore.photos[randomIndex];

    if (!randomPhoto || !randomPhoto.id) {
      return;
    }

    isLoadingInsight.value = true;
    const { data } = await api.get(
      `/api/catalog/photoInsight/${randomPhoto.id}`,
    );

    if (
      data &&
      typeof data === "object" &&
      (data.cultural || data.technical || data.evaluation)
    ) {
      const insights = [];
      if (data.cultural) insights.push(data.cultural);
      if (data.technical) insights.push(data.technical);
      if (data.evaluation) insights.push(data.evaluation);

      photoInsight.value = {
        photo: randomPhoto,
        insights: insights,
      };
    } else {
      photoInsight.value = data;
    }

    localStorage.setItem(
      "photoInsightData",
      JSON.stringify(photoInsight.value),
    );
    localStorage.setItem("photoInsightLastFetch", today);
    localStorage.setItem("photoInsightFetchCount", String(fetchCount + 1));
    localStorage.setItem("photoInsightPhotoId", String(randomPhoto.id));
  } catch (error) {
    console.error("Error fetching photo insight:", error);
  } finally {
    isLoadingInsight.value = false;
  }
};

watch(
  appAccessMode,
  async (newValue) => {
    if (
      newValue !== "blocked" &&
      Array.isArray(photosStore.photos) &&
      photosStore.photos.length > 0
    ) {
      fetchPhotoInsight();
    }
  },
  { immediate: true },
);

const nextInsight = () => {
  if (photoInsight.value && photoInsight.value.insights) {
    currentInsightIndex.value =
      (currentInsightIndex.value + 1) % photoInsight.value.insights.length;
  }
};

const prevInsight = () => {
  if (photoInsight.value && photoInsight.value.insights) {
    currentInsightIndex.value =
      currentInsightIndex.value === 0
        ? photoInsight.value.insights.length - 1
        : currentInsightIndex.value - 1;
  }
};

const handleMouseEnter = () => {
  isHoveringInsight.value = true;
};

const handleMouseLeave = () => {
  isHoveringInsight.value = false;
};

const showPhotoInfo = async () => {
  if (!photoInsight.value || !photoInsight.value.photo) return;

  try {
    const fullPhoto = await photosStore.fetchPhoto(photoInsight.value.photo.id);
    selectedDialogPhoto.value = fullPhoto;
    showPhotoInfoDialog.value = true;
  } catch (error) {
    console.error("Error fetching photo details:", error);
  }
};
</script>

<style scoped>
/* Did you know card styles */
.did-you-know {
  position: relative;
  overflow: hidden;
  background-color: var(--bg-card);
  transform: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

.did-you-know:hover,
.did-you-know.hovering {
  transform: none !important;
  box-shadow: none !important;
  border: none !important;
}

.did-you-know.has-photo {
  background-color: var(--bg-container);
}

/* Photo container styles */
.photo-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 5px;
  bottom: 0;
  overflow: hidden;
  z-index: 1;
  /* background-color: rgba(6, 182, 212, 0.7); */
  background-color: var(--text-primary);
  border-radius: 5px;
}

.insight-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.photo-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* background: linear-gradient(
    135deg,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.3) 50%,
    rgba(0, 0, 0, 0.6) 100%
  ); */
  border-radius: 0;
  z-index: 2;
}

/* Info button container */
.info-button-container {
  position: absolute;
  top: 15px;
  right: 15px;
  z-index: 10;
  pointer-events: auto;
}

.action-button {
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
  border: none !important;
  width: 34px;
  height: 34px;
  opacity: 0.9;
  transition: opacity 0.2s ease !important;
}

.action-button:hover {
  opacity: 1 !important;
}

.info-button {
  background-color: var(--info-color) !important;
  color: white !important;
}

/* Carousel overlay styles */
.insight-carousel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 4;
  border-radius: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.did-you-know.hovering .insight-carousel-overlay {
  opacity: 1;
  visibility: visible;
}

.carousel-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: var(--spacing-lg);
  position: relative;
  pointer-events: auto;
}

.carousel-arrow {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  cursor: pointer;
  backdrop-filter: blur(10px);
  flex-shrink: 0;
  pointer-events: auto;
}

.carousel-arrow:hover {
  background: rgba(255, 255, 255, 0.3);
}

.carousel-arrow-left {
  margin-right: var(--spacing-md);
  margin-left: 10px;
}

.carousel-arrow-right {
  margin-left: var(--spacing-md);
  margin-right: 10px;
}

.insight-text-container {
  flex: 1;
  padding: 0 var(--spacing-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  height: 100%;
}

.insight-text-slide {
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* Transición para el slider de insights */
.insight-slide-enter-active,
.insight-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.insight-slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.insight-slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.insight-text-slide p {
  color: var(--text-primary);
  font-size: 13px;
  line-height: var(--line-height-relaxed);
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  font-weight: 500;
}

.carousel-dots {
  position: absolute;
  bottom: var(--spacing-md);
  left: 50%;
  display: flex;
  gap: var(--spacing-xs);
  z-index: 5;
  pointer-events: auto;
}

.carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  cursor: pointer;
}

.carousel-dot.active {
  background: white;
}

.carousel-dot:hover {
  background: rgba(255, 255, 255, 0.7);
}

.insight-content {
  position: relative;
  z-index: 3;
  margin-bottom: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.insight-overlay {
  position: relative;
  z-index: 3;
  text-align: center;
  width: 103%;
  /* background: rgba(6, 182, 212, 0.3); */
  background: rgba(37, 99, 235, 0.3);

  padding: var(--spacing-lg) var(--spacing-md);
  opacity: 1;
}

.did-you-know.hovering .insight-overlay {
  opacity: 0;
  pointer-events: none;
}

.did-you-know.has-photo .insight-overlay .action-title {
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.did-you-know.has-photo .insight-overlay .action-description {
  color: rgba(255, 255, 255, 1);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  margin: 0;
  line-height: var(--line-height-normal);
}

.did-you-know:not(.has-photo) .insight-overlay .action-title {
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.did-you-know:not(.has-photo) .insight-overlay .action-description {
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-normal);
}

.insight-question-btn {
  background-color: var(--primary-color);
  color: white;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-normal);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 3;
  margin-bottom: var(--spacing-lg);
}

.did-you-know:hover .insight-question-btn {
  background-color: var(--primary-color-hover);
}

.insight-loader {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  position: relative;
  z-index: 3;
  margin-bottom: var(--spacing-lg);
}

.loader-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(var(--text-primary), 0.3);
  border-top: 2px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.did-you-know.has-photo .loader-spinner {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid var(--primary-color);
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.did-you-know .action-icon {
  color: var(--info-color);
}

.action-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.action-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-normal);
}

/* Mobile adjustments for did-you-know card */
@media (max-width: 480px) {
  .insight-question-btn {
    width: 32px;
    height: 32px;
  }

  .insight-loader {
    width: 32px;
    height: 32px;
  }

  .loader-spinner {
    width: 20px;
    height: 20px;
  }

  .carousel-content {
    padding: var(--spacing-md);
  }

  .carousel-arrow {
    width: 28px;
    height: 28px;
  }

  .carousel-arrow-left {
    margin-right: var(--spacing-sm);
  }

  .carousel-arrow-right {
    margin-left: var(--spacing-sm);
  }

  .insight-text-slide p {
    font-size: var(--font-size-sm);
  }

  .carousel-dots {
    bottom: var(--spacing-sm);
  }

  .carousel-dot {
    width: 6px;
    height: 6px;
  }
}
</style>
