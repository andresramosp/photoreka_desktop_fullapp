<template>
  <n-modal
    v-model:show="visible"
    :mask-closable="true"
    :show-icon="false"
    :closable="false"
    :style="{ padding: '0' }"
    transform-origin="center"
  >
    <div class="fullscreen-container" @click.self="closeFullscreen">
      <div class="fullscreen-content">
        <!-- Navigation Arrow Left -->
        <n-button
          v-if="hasPreviousPhoto"
          class="nav-arrow nav-arrow-left"
          :class="{ 'hidden-controls': !showControls }"
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

        <!-- Photo with transition -->
        <transition
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
          v-if="hasNextPhoto"
          class="nav-arrow nav-arrow-right"
          :class="{ 'hidden-controls': !showControls }"
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

        <!-- Fullscreen Toggle Button (mobile only, hidden on iOS) -->
        <n-button
          v-if="!isIOS"
          class="fullscreen-toggle-btn"
          :class="{ 'hidden-controls': !showControls }"
          size="medium"
          circle
          type="primary"
          @click.stop="toggleFullscreen"
          :title="isInFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
        >
          <template #icon>
            <n-icon size="20">
              <ExpandOutline v-if="!isInFullscreen" />
              <ContractOutline v-else />
            </n-icon>
          </template>
        </n-button>

        <!-- Photo Counter -->
        <div
          v-if="photos.length > 0 && showControls"
          class="photo-counter"
          :class="{ 'hidden-controls': !showControls }"
        >
          {{ currentIndex + 1 }} / {{ photos.length }}
        </div>

        <!-- Close Button -->
        <n-button
          class="close-fullscreen-btn"
          :class="{ 'hidden-controls': !showControls }"
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
import { NModal, NIcon, NButton } from "naive-ui";
import {
  CloseOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  ExpandOutline,
  ContractOutline,
} from "@vicons/ionicons5";

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
const showControls = ref(true);
const isInFullscreen = ref(false);
const isIOS = ref(false);
let controlsHideTimeout = null;

// Touch swipe handling
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
const swipeThreshold = 50; // Minimum distance in pixels to trigger swipe

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

  // Show controls when navigating
  showControls.value = true;
  if (controlsHideTimeout) {
    clearTimeout(controlsHideTimeout);
  }
  controlsHideTimeout = setTimeout(() => {
    showControls.value = false;
  }, 3000);

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

// Mouse movement handling for controls visibility
const handleMouseMove = () => {
  showControls.value = true;

  // Clear existing timeout
  if (controlsHideTimeout) {
    clearTimeout(controlsHideTimeout);
  }

  // Set new timeout to hide controls after 3 seconds
  controlsHideTimeout = setTimeout(() => {
    showControls.value = false;
  }, 3000);
};

// Preload next/previous images for smooth transitions
const preloadImage = (photoIndex) => {
  if (!props.photos?.[photoIndex]) return;
  const photo = props.photos[photoIndex];
  const img = new Image();
  img.src = photo.originalUrl || photo.url || photo.thumbnailUrl;
};

// Request native fullscreen mode (hides browser UI completely)
const requestNativeFullscreen = async () => {
  const element = document.documentElement;

  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      // Safari/iOS
      await element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      // IE11
      await element.msRequestFullscreen();
    }
    isInFullscreen.value = true;
  } catch (error) {
    // Fullscreen request failed (user denied or not supported)
    console.log("Fullscreen API not available or denied:", error);
  }
};

// Exit native fullscreen mode
const exitNativeFullscreen = async () => {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
      isInFullscreen.value = false;
    }
  } catch (error) {
    console.log("Error exiting fullscreen:", error);
  }
};

// Toggle fullscreen on user interaction
const toggleFullscreen = async () => {
  if (isInFullscreen.value) {
    await exitNativeFullscreen();
  } else {
    await requestNativeFullscreen();
  }
};

// Check if device is mobile and show fullscreen button

// Hide mobile browser address bar
const hideMobileAddressBar = () => {
  // Lock body scroll to prevent any scrolling while fullscreen is open
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  document.body.style.height = "100%";
  document.body.style.top = `-${window.scrollY}px`;
  document.documentElement.style.overflow = "hidden";
};

// Touch swipe handlers
const handleTouchStart = (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
};

const handleTouchEnd = (e) => {
  if (!visible.value || isTransitioning.value) return;

  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;

  const diffX = touchStartX - touchEndX;
  const diffY = touchStartY - touchEndY;

  // Only process swipe if horizontal movement is significant
  // and greater than vertical movement (to avoid interfering with vertical scrolling)
  if (Math.abs(diffX) > swipeThreshold && Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 0) {
      // Swipe left - go to next photo
      goToNextPhoto();
    } else {
      // Swipe right - go to previous photo
      goToPreviousPhoto();
    }
  }
};

// Restore scroll when closing fullscreen
const restoreScroll = () => {
  const scrollY = document.body.style.top;
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";
  document.body.style.height = "";
  document.body.style.top = "";
  document.documentElement.style.overflow = "";
  window.scrollTo(0, parseInt(scrollY || "0") * -1);

  // Exit native fullscreen if active
  exitNativeFullscreen();
};

// Watch for visibility changes
watch(visible, (isVisible) => {
  if (isVisible) {
    // Reset to start index when opening
    currentIndex.value = props.startIndex;
    // Try to hide mobile browser address bar
    hideMobileAddressBar();
    // Preload adjacent images
    if (hasNextPhoto.value) {
      preloadImage(currentIndex.value + 1);
    }
    if (hasPreviousPhoto.value) {
      preloadImage(currentIndex.value - 1);
    }
  } else {
    // Restore scroll when closing
    restoreScroll();
  }
});

// Detect if device is iOS
const detectiOS = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  isIOS.value =
    /iphone|ipad|ipod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

// Listen for fullscreen changes
const handleFullscreenChange = () => {
  const isCurrentlyFullscreen = !!(
    document.fullscreenElement || document.webkitFullscreenElement
  );
  isInFullscreen.value = isCurrentlyFullscreen;
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
  detectiOS();
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("touchstart", handleTouchStart, false);
  window.addEventListener("touchend", handleTouchEnd, false);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("touchstart", handleTouchStart, false);
  window.removeEventListener("touchend", handleTouchEnd, false);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  document.removeEventListener(
    "webkitfullscreenchange",
    handleFullscreenChange
  );
  if (controlsHideTimeout) {
    clearTimeout(controlsHideTimeout);
  }
  // Make sure to restore scroll if component unmounts while visible
  restoreScroll();
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
  opacity: 1;
}

.close-fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
  transform: scale(1.1);
}

/* Fullscreen Toggle Button */
.fullscreen-toggle-btn {
  position: fixed;
  top: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: white !important;
  transition: all 0.3s ease;
  z-index: 10001;
  width: 40px;
  height: 40px;
  opacity: 1;
}

.fullscreen-toggle-btn:hover {
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
  opacity: 1;
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

  .fullscreen-toggle-btn {
    top: 8px;
    left: 8px;
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

/* Controls visibility toggle */
.hidden-controls {
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity 0.3s ease;
}

/* Override modal styles for fullscreen */
:deep(.n-modal-mask) {
  background-color: transparent !important;
}

:deep(.n-modal-container) {
  background: transparent !important;
}
</style>
