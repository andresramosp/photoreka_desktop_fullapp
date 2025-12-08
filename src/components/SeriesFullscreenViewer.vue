<template>
  <n-modal
    v-model:show="visible"
    :mask-closable="true"
    :show-icon="false"
    :closable="false"
    :style="{ padding: '0' }"
    transform-origin="center"
  >
    <div class="fullscreen-container" @click="closeFullscreen">
      <div class="fullscreen-content">
        <!-- Navigation Arrow Left -->
        <n-button
          v-if="hasPreviousPhoto || showingEndScreen"
          class="nav-arrow nav-arrow-left"
          size="large"
          circle
          type="primary"
          @click.stop="goToPreviousPhoto"
          :disabled="isTransitioning"
          title="Previous photo (←)"
        >
          <template #icon>
            <n-icon size="24">
              <ChevronBackOutline />
            </n-icon>
          </template>
        </n-button>

        <!-- End Screen with Logo (for public view) -->
        <div v-if="showingEndScreen" class="end-screen" @click.stop>
          <div class="logo-wrapper">
            <AppLogo size="large" :height="logoHeight" />
          </div>
          <p class="end-screen-text">Thanks for watching!</p>
        </div>

        <!-- Photo with transition -->
        <transition
          v-else
          :name="slideDirection === 'next' ? 'slide-left' : 'slide-right'"
          mode="out-in"
        >
          <img
            :key="currentPhoto?.id"
            :src="
              currentPhoto?.originalUrl ||
              currentPhoto?.url ||
              currentPhoto?.thumbnailUrl
            "
            :alt="currentPhoto?.filename || currentPhoto?.name || 'Photo'"
            class="fullscreen-photo"
            @error="handleImageError"
            @click.stop
          />
        </transition>

        <!-- Navigation Arrow Right -->
        <n-button
          v-if="hasNextPhoto || (isPublicView && !showingEndScreen)"
          class="nav-arrow nav-arrow-right"
          size="large"
          circle
          type="primary"
          @click.stop="goToNextPhoto"
          :disabled="isTransitioning"
          title="Next photo (→)"
        >
          <template #icon>
            <n-icon size="24">
              <ChevronForwardOutline />
            </n-icon>
          </template>
        </n-button>

        <!-- Photo Counter -->
        <div
          v-if="photos.length > 0 && !showingEndScreen && showCounter"
          class="photo-counter"
        >
          {{ currentIndex + 1 }} / {{ photos.length }}
        </div>

        <!-- Close Button -->
        <n-button
          class="close-fullscreen-btn"
          size="large"
          circle
          type="primary"
          @click.stop="closeFullscreen"
          title="Close fullscreen (Esc)"
        >
          <template #icon>
            <n-icon size="20">
              <CloseOutline />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { NModal, NIcon, NButton } from "naive-ui";
import {
  CloseOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";

const router = useRouter();

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  photos: {
    type: Array,
    default: () => [],
  },
  startIndex: {
    type: Number,
    default: 0,
  },
  isPublicView: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

// Reactive state
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const currentIndex = ref(0);
const isTransitioning = ref(false);
const slideDirection = ref("next");
const showingEndScreen = ref(false);
const showCounter = ref(true);
const logoHeight = ref(120);
let counterHideTimeout = null;

// Computed properties
const currentPhoto = computed(() => {
  return props.photos?.[currentIndex.value] || null;
});

const hasPreviousPhoto = computed(() => {
  return props.photos?.length > 0 && currentIndex.value > 0;
});

const hasNextPhoto = computed(() => {
  return (
    props.photos?.length > 0 && currentIndex.value < props.photos.length - 1
  );
});

// Methods
const closeFullscreen = () => {
  visible.value = false;
};

const goToPreviousPhoto = () => {
  if (isTransitioning.value) return;

  // If showing end screen, go back to last photo
  if (showingEndScreen.value) {
    isTransitioning.value = true;
    slideDirection.value = "prev";
    showingEndScreen.value = false;
    setTimeout(() => {
      isTransitioning.value = false;
    }, 400);
    return;
  }

  if (!hasPreviousPhoto.value) return;
  isTransitioning.value = true;
  slideDirection.value = "prev";
  currentIndex.value -= 1;
  setTimeout(() => {
    isTransitioning.value = false;
  }, 400);
};

const goToNextPhoto = () => {
  if (isTransitioning.value) return;

  // Show counter when navigating
  showCounter.value = true;
  if (counterHideTimeout) {
    clearTimeout(counterHideTimeout);
  }
  counterHideTimeout = setTimeout(() => {
    showCounter.value = false;
  }, 3000);

  // If showing end screen in public view, redirect to home
  if (showingEndScreen.value && props.isPublicView) {
    router.push({ name: "landing" });
    return;
  }

  // If at last photo and in public view, show end screen
  if (!hasNextPhoto.value && props.isPublicView && !showingEndScreen.value) {
    isTransitioning.value = true;
    slideDirection.value = "next";
    showingEndScreen.value = true;
    setTimeout(() => {
      isTransitioning.value = false;
    }, 400);
    return;
  }

  if (!hasNextPhoto.value) return;
  isTransitioning.value = true;
  slideDirection.value = "next";
  currentIndex.value += 1;
  setTimeout(() => {
    isTransitioning.value = false;
  }, 400);
};

const handleImageError = (e) => {
  console.error("Image failed to load:", e);
};

// Keyboard navigation
const handleKeyDown = (e) => {
  if (!visible.value) return;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    goToPreviousPhoto();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    goToNextPhoto();
  } else if (e.key === "Escape") {
    closeFullscreen();
  }
};

// Mouse movement handling for counter visibility
const handleMouseMove = () => {
  showCounter.value = true;

  // Clear existing timeout
  if (counterHideTimeout) {
    clearTimeout(counterHideTimeout);
  }

  // Set new timeout to hide counter after 3 seconds
  counterHideTimeout = setTimeout(() => {
    showCounter.value = false;
  }, 3000);
};

// Preload next/previous images for smooth transitions
const preloadImage = (photoIndex) => {
  if (!props.photos?.[photoIndex]) return;
  const photo = props.photos[photoIndex];
  const img = new Image();
  img.src = photo.originalUrl || photo.url || photo.thumbnailUrl;
};

// Watch for visibility changes
watch(visible, (isVisible) => {
  if (isVisible) {
    // Reset to start index when opening
    currentIndex.value = props.startIndex;
    showingEndScreen.value = false;
    // Set logo height based on viewport
    updateLogoHeight();
    // Preload adjacent images
    if (hasNextPhoto.value) {
      preloadImage(currentIndex.value + 1);
    }
    if (hasPreviousPhoto.value) {
      preloadImage(currentIndex.value - 1);
    }
  }
});

// Update logo height based on viewport width
const updateLogoHeight = () => {
  if (window.innerWidth < 768) {
    logoHeight.value = 100;
  } else if (window.innerWidth < 1024) {
    logoHeight.value = 120;
  } else {
    logoHeight.value = 140;
  }
};

// Listen for resize events
const handleWindowResize = () => {
  updateLogoHeight();
};

// Watch for index changes to preload adjacent images
watch(currentIndex, (newIndex) => {
  if (visible.value && newIndex >= 0) {
    if (newIndex < props.photos.length - 1) {
      preloadImage(newIndex + 1);
    }
    if (newIndex > 0) {
      preloadImage(newIndex - 1);
    }
  }
});

// Lifecycle hooks for keyboard listeners
onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("resize", handleWindowResize);
  updateLogoHeight();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("resize", handleWindowResize);
  if (counterHideTimeout) {
    clearTimeout(counterHideTimeout);
  }
});
</script>

<style scoped>
/* Fullscreen Container */
.fullscreen-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  /* Use dvh for dynamic viewport, with vh fallback for older browsers */
  height: 100vh;
  height: 100dvh;
  /* Alternative: use svh (small viewport height) which always accounts for browser UI */
  /* height: 100svh; */
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
  padding: 40px;
  box-sizing: border-box;
  /* Prevent overscroll/bounce on iOS */
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}

.fullscreen-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.fullscreen-photo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  cursor: default;
}

/* Close Button */
.close-fullscreen-btn {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: white !important;
  transition: all 0.3s ease;
  z-index: 10001;
  width: 44px;
  height: 44px;
}

.close-fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
  transform: scale(1.1);
}

/* Navigation Arrows */
.nav-arrow {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10001;
  background: rgba(0, 0, 0, 0.6) !important;
  backdrop-filter: blur(8px);
  border: 2px solid rgba(255, 255, 255, 0.2) !important;
  width: 56px;
  height: 56px;
  transition: all 0.3s ease;
  opacity: 0.7;
  color: white !important;
}

.nav-arrow:hover:not(:disabled) {
  opacity: 1;
  background: rgba(0, 0, 0, 0.8) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
  /* transform: translateY(-50%) scale(1.1); */
}

.nav-arrow:active:not(:disabled) {
  /* transform: translateY(-50%) scale(0.95); */
}

.nav-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-arrow-left {
  left: 24px;
}

.nav-arrow-right {
  right: 24px;
}

/* Mobile vertical layout */
@media (max-width: 768px) and (orientation: portrait) {
  .nav-arrow {
    position: fixed;
    top: auto;
    bottom: 80px;
    transform: none;
  }

  .nav-arrow-left {
    left: calc(50% - 50px);
  }

  .nav-arrow-right {
    right: calc(50% - 50px);
  }
}

/* Photo Counter */
.photo-counter {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  color: white;
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 10001;
  user-select: none;
  -webkit-user-select: none;
  letter-spacing: 0.5px;
  transition: opacity 0.3s ease;
}

/* End Screen Styles */
.end-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  animation: fadeIn 0.4s ease;
}

.logo-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.end-screen-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 18px;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.5px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Slide Animations */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .fullscreen-container {
    padding: 16px;
  }

  .close-fullscreen-btn {
    top: 8px;
    right: 8px;
    width: 35px;
    height: 35px;
  }

  .nav-arrow {
    width: 35px;
    height: 35px;
  }

  .nav-arrow-left {
    left: 8px;
  }

  .nav-arrow-right {
    right: 8px;
  }

  .photo-counter {
    bottom: 20px;
    font-size: 12px;
    padding: 8px 16px;
  }

  .end-screen {
    gap: 16px;
  }

  .end-screen-text {
    font-size: 16px;
  }
}

@media (max-height: 600px) {
  .fullscreen-container {
    padding: 16px;
  }

  .nav-arrow {
    width: 35px;
    height: 35px;
  }

  .nav-arrow-left {
    left: 8px;
  }

  .nav-arrow-right {
    right: 8px;
  }

  .photo-counter {
    bottom: 16px;
  }
}

/* Override modal styles for fullscreen */
:deep(.n-modal-mask) {
  background-color: transparent !important;
}

:deep(.n-modal-container) {
  background: transparent !important;
}
</style>
