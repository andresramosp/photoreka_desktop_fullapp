<template>
  <n-message-provider placement="bottom">
    <div class="twod-view" :class="{ 'catalog-mode': isCatalogMode }">
      <!-- 2D Visualization -->
      <Photos2D
        class="photos-2d-component"
        :catalog-user-id="catalogUserId"
        :is-playground="isPlayground"
      />

      <!-- Playground Logo - Top Left -->
      <div v-if="isPlayground" class="playground-logo">
        <div class="logo-container-playground">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <AppLogo layout="icon" :height="50" />
          </a>
        </div>
      </div>
    </div>
  </n-message-provider>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { NMessageProvider } from "naive-ui";
import { usePhotosStore } from "@/stores/photos.js";
import Photos2D from "@/components/2d-atlas/Photos2D.vue";
import AppLogo from "@/components/AppLogo.vue";

const route = useRoute();

// Detect if in catalog mode (similar to isPlayground in CanvasView)
const isCatalogMode = computed(() => route.meta?.playground === true);
const catalogUserId = computed(() => route.params?.userId || null);

// Computed property to detect playground mode
const isPlayground = computed(() => !!catalogUserId.value);

// Store and reactive data (only for authenticated mode)
const photosStore = usePhotosStore();
const error = ref(null);

// Computed properties
const hasPhotos = computed(() => {
  const photos = photosStore.allPhotos.filter(
    (photo) =>
      photo.status === "processed" ||
      photo.status === "preprocessed" ||
      photo.status === "uploaded",
  );
  return photos.length > 0;
});

const loadPhotos = async () => {
  // Only load photos from store in authenticated mode
  if (isCatalogMode.value) {
    return; // In catalog mode, Photos2D handles loading
  }

  try {
    error.value = null;
    await photosStore.getOrFetch(false);
  } catch (err) {
    error.value = err.message || "Unknown error loading photos";
    console.error("Error loading photos for 2D view:", err);
  }
};

// Lifecycle
onMounted(async () => {
  await loadPhotos();
});
</script>

<style scoped>
.twod-view {
  width: 100%;
  height: 100%;
  position: relative;
}

.photos-2d-component {
  width: 100%;
  height: 100%;
}

/* Error state styles */
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
}

.error-content {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.error-content h2 {
  color: #ef4444;
  margin: 0 0 15px 0;
  font-size: 1.5em;
}

.error-content p {
  color: #e5e5e5;
  margin: 0 0 25px 0;
  line-height: 1.5;
}

.retry-btn {
  background: #4ade80;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 1em;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
}

.retry-btn:hover {
  background: #22c55e;
  transform: translateY(-1px);
}

.retry-btn:active {
  transform: translateY(0);
}

/* Empty state styles */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
}

.empty-content {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.empty-content h2 {
  color: #fbbf24;
  margin: 0 0 15px 0;
  font-size: 1.5em;
}

.empty-content p {
  color: #e5e5e5;
  margin: 0 0 25px 0;
  line-height: 1.5;
}

.upload-link {
  display: inline-block;
  background: #4ade80;
  color: white;
  text-decoration: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 1em;
  transition:
    background-color 0.2s,
    transform 0.1s;
}

.upload-link:hover {
  background: #22c55e;
  transform: translateY(-1px);
  text-decoration: none;
}

.upload-link:active {
  transform: translateY(0);
}

/* Playground Logo - Top Left */
.playground-logo {
  position: absolute;
  top: 0px;
  left: 0px;
  z-index: 1000;
}

.logo-container-playground {
  border-radius: 12px;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
