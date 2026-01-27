<template>
  <!-- Use mobile component on small screens -->
  <FramerViewMobile v-if="isMobileView" :playground-mode="isPlaygroundMode" />

  <!-- Desktop/tablet layout -->
  <div v-else class="framer-container view-container">
    <!-- Main framer interface -->
    <div class="framer-interface">
      <!-- Main content area -->
      <div class="framer-content">
        <!-- Left sidebar with frame options -->
        <div class="frame-sidebar">
          <div class="sidebar-header">
            <!-- Logo for playground mode -->
            <div v-if="isPlaygroundMode" class="logo-container">
              <router-link to="/" class="logo-link" aria-label="Inicio">
                <AppLogo layout="horizontal" :with-claim="true" :height="75" />
              </router-link>
            </div>
            <!-- Title for authenticated mode -->
            <h3 v-else>Frame Styles</h3>
          </div>

          <!-- Frame styles title (smaller, closer to options) -->
          <div v-if="isPlaygroundMode" class="frame-styles-title">
            <h4>Frame Styles</h4>
          </div>

          <div class="frame-options-grid">
            <!-- Aspect ratio options -->
            <div
              v-for="frame in allFrames"
              :key="frame.id"
              class="frame-option"
              :class="{
                active: selectedFrame?.id === frame.id,
                [`frame-${frame.category}`]: true,
              }"
              :style="{
                '--frame-color': frame.color,
                '--frame-color-light': frame.color + '20',
              }"
              @click="selectFrame(frame)"
            >
              <div class="frame-icon">
                <!-- Show social media icon or category icon -->
                <div class="icon-container">
                  <n-icon
                    v-if="frame.icon"
                    :size="16"
                    class="social-icon"
                    :component="getFrameIcon(frame)"
                  />
                  <n-icon
                    v-else
                    :size="14"
                    class="category-icon"
                    :component="getFrameIcon(frame)"
                  />
                </div>
                <!-- Frame shape -->
                <div
                  class="frame-shape"
                  :style="{ aspectRatio: frame.aspectRatio }"
                ></div>
              </div>
              <span class="frame-ratio">{{ frame.ratio }}</span>
            </div>
          </div>

          <!-- Frame controls -->
          <div class="frame-controls">
            <div class="controls-header">
              <h4>Frame Settings</h4>
            </div>

            <div class="control-group">
              <label class="control-label">Margin Size</label>
              <div class="slider-container">
                <n-slider
                  v-model:value="marginValue"
                  :min="0"
                  :max="200"
                  :step="5"
                  class="margin-slider"
                />
                <span class="slider-value">{{ marginValue }}px</span>
              </div>
            </div>

            <div class="control-group">
              <label class="control-label">Frame Color</label>
              <div class="color-options">
                <div
                  v-for="color in frameColors"
                  :key="color.value"
                  class="color-option"
                  :class="{ active: frameColor === color.value }"
                  :style="{ backgroundColor: color.value }"
                  @click="frameColor = color.value"
                  :title="color.name"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Center preview area -->
        <div
          class="preview-area"
          :class="{ 'playground-mode': isPlaygroundMode }"
        >
          <div class="preview-container">
            <div class="preview-header">
              <!-- Logo for playground mode -->

              <!-- Title for authenticated mode -->
              <h3>Preview</h3>
              <div class="preview-controls" v-if="selectedCount > 0">
                <n-button
                  @click="downloadPhotos"
                  type="primary"
                  :loading="isDownloading"
                  :disabled="isDownloading"
                >
                  <template #icon>
                    <n-icon>
                      <DownloadIcon />
                    </n-icon>
                  </template>
                  Download{{
                    selectedCount > 0
                      ? ` (${selectedCount})`
                      : ` All (${selectedPhotos.length})`
                  }}
                </n-button>
              </div>
            </div>

            <div class="photo-preview" :class="{ 'has-photo': !!previewPhoto }">
              <div class="preview-wrapper">
                <template v-if="previewPhoto">
                  <FrameVisualizer
                    ref="frameVisualizerRef"
                    :photo-url="previewPhotoUrl"
                    :photo-alt="
                      previewPhoto?.file_name ||
                      previewPhoto?.name ||
                      'Selected photo'
                    "
                    :aspect-ratio="selectedFrame?.aspectRatio || '1/1'"
                    :frame-color="frameColor"
                    :margin="marginValue"
                    max-width="95%"
                    max-height="95%"
                    @image-load="onImageLoad"
                    @image-error="onImageError"
                  />
                  <!-- Photo count indicator -->
                  <div v-if="selectedCount > 1" class="photo-count-indicator">
                    <span>{{ selectedCount }}</span>
                  </div>
                </template>
                <template v-else>
                  <div class="no-photo-preview">
                    <n-button
                      type="primary"
                      size="large"
                      @click="openPhotoDialog"
                      :loading="isProcessingFiles"
                      :disabled="isProcessingFiles"
                    >
                      <template #icon>
                        <n-icon>
                          <AddIcon />
                        </n-icon>
                      </template>
                      {{
                        isProcessingFiles
                          ? "Processing..."
                          : "Add Photos to Start"
                      }}
                    </n-button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Right sidebar with photo selection (desktop only) -->
        <div class="photo-sidebar desktop-only">
          <div class="sidebar-header">
            <h4>Selected Photos</h4>
            <div class="strip-actions">
              <n-button
                @click="toggleSelectAll"
                quaternary
                type="primary"
                size="tiny"
                :disabled="selectedPhotos.length === 0"
              >
                <template #icon>
                  <n-icon>
                    <CheckIcon
                      v-if="selectedPhotoIds.size === selectedPhotos.length"
                    />
                    <CheckIcon v-else />
                  </n-icon>
                </template>
                {{
                  selectedPhotoIds.size === selectedPhotos.length
                    ? "Unselect All"
                    : "Select All"
                }}
              </n-button>
              <n-button
                @click="clearAllPhotos"
                quaternary
                type="error"
                size="tiny"
              >
                <template #icon>
                  <n-icon>
                    <TrashIcon />
                  </n-icon>
                </template>
                Clear
              </n-button>
            </div>
          </div>
          <div class="photo-grid">
            <!-- Add more photos button -->
            <div
              class="add-photo-card"
              @click="openPhotoDialog"
              :class="{ processing: isProcessingFiles }"
            >
              <div class="add-photo-card-content">
                <n-icon
                  :size="32"
                  color="var(--primary-color)"
                  v-if="!isProcessingFiles"
                >
                  <AddIcon />
                </n-icon>
                <n-spin :size="32" v-else />
                <span class="add-photo-card-text">
                  {{ isProcessingFiles ? "Processing..." : "Add Photos" }}
                </span>
              </div>
            </div>

            <!-- Photo thumbnails -->
            <PhotoCard
              v-for="photo in selectedPhotos"
              :key="photo.id"
              :photo="photo"
              :selected="selectedPhotoIds.has(photo.id)"
              mode="selection"
              :show-stars="false"
              :show-tags="false"
              :show-return-button="false"
              :show-delete-button="true"
              :require-long-press="false"
              @select="selectPhoto"
              @move-to-curation="removePhoto"
              @delete="removePhoto"
            />
          </div>
        </div>
      </div>

      <!-- Bottom photo strip (mobile only) -->
      <div class="photo-strip mobile-only">
        <div class="strip-header">
          <h4>Selected Photos</h4>
          <div class="strip-actions">
            <span class="photo-count">{{ selectedPhotos.length }} photos</span>
            <n-button
              @click="toggleSelectAll"
              quaternary
              type="primary"
              size="small"
              :disabled="selectedPhotos.length === 0"
            >
              <template #icon>
                <n-icon>
                  <CheckIcon />
                </n-icon>
              </template>
              {{
                selectedPhotoIds.size === selectedPhotos.length
                  ? "Unselect All"
                  : "Select All"
              }}
            </n-button>
            <n-button
              @click="clearAllPhotos"
              quaternary
              type="error"
              size="small"
            >
              <template #icon>
                <n-icon>
                  <TrashIcon />
                </n-icon>
              </template>
              Clear All
            </n-button>
          </div>
        </div>
        <div class="photo-thumbnails">
          <!-- Add more photos button -->
          <div
            class="add-photo-card mobile-add"
            @click="openPhotoDialog"
            :class="{ processing: isProcessingFiles }"
          >
            <div class="add-photo-card-content">
              <n-icon
                :size="24"
                color="var(--primary-color)"
                v-if="!isProcessingFiles"
              >
                <AddIcon />
              </n-icon>
              <n-spin :size="24" v-else />
              <span class="add-photo-card-text">
                {{ isProcessingFiles ? "Processing..." : "Add" }}
              </span>
            </div>
          </div>

          <!-- Photo thumbnails -->
          <PhotoCard
            v-for="photo in selectedPhotos"
            :key="photo.id"
            :photo="photo"
            :selected="selectedPhotoIds.has(photo.id)"
            mode="selection"
            :show-stars="false"
            :show-tags="false"
            :show-return-button="false"
            :show-delete-button="true"
            :require-long-press="false"
            @select="selectPhoto"
            @move-to-curation="removePhoto"
            @delete="removePhoto"
          />
        </div>
      </div>
    </div>

    <!-- Hidden file input for playground mode -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/*"
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- Photo selection dialog -->
    <PhotosDialog
      v-if="!isPlaygroundMode"
      v-model="showPhotoDialog"
      title="Select Photos for Framing"
      @add-photos="handlePhotosAdded"
    />

    <!-- Playground photo selection dialog (only shown when explicitly requested) -->
    <!-- This is now only used as fallback, normal flow goes directly to file input -->
    <PlaygroundPhotosDialog
      v-if="isPlaygroundMode && showPhotoDialog"
      v-model="showPhotoDialog"
      @add-photos="handlePlaygroundPhotosAdded"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";

defineOptions({
  name: "FramerView",
});
import { usePhotosStore } from "@/stores/photos.js";
import { useMessage } from "naive-ui";
import PhotoCard from "@/components/photoCards/PhotoCard.vue";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PlaygroundPhotosDialog from "@/components/PlaygroundPhotosDialog.vue";
import FrameVisualizer from "@/components/FrameVisualizer.vue";
import FramerViewMobile from "@/views/FramerViewMobile.vue";
import { useFramedPhotoDownload } from "@/composables/useFramedPhotoDownload.js";
import { useImageProcessing } from "@/composables/useImageProcessing.js";
import { usePhotoQueryParams } from "@/composables/usePhotoQueryParams.js";
import { NButton, NIcon, NSlider, NSpin } from "naive-ui";

// Icons
import {
  SquareOutline,
  ImageOutline as ImageIcon,
  GridOutline as GridIcon,
  SpeedometerOutline as SpeedometerIcon,
  AddOutline as AddIcon,
  DownloadOutline as DownloadIcon,
  TrashOutline as TrashIcon,
  CloseOutline as CloseIcon,
  CheckmarkOutline as CheckIcon,
} from "@vicons/ionicons5";
import {
  LogoInstagram,
  LogoFacebook,
  LogoTwitter,
  LogoLinkedin,
} from "@vicons/ionicons5";
import {
  MoveOutline as MovieIcon,
  Print as PrintIcon,
  Camera as PhotoIcon,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";

const route = useRoute();
const photosStore = usePhotosStore();
const message = useMessage();
const { downloadFramedPhoto, downloadFramedPhotosZip, isDownloading } =
  useFramedPhotoDownload();
const { resizeWithStepDown, loadImage } = useImageProcessing();
const { getPhotoIdsFromQuery } = usePhotoQueryParams();

// Playground mode detection
const isPlaygroundMode = computed(() => route.meta?.playground === true);

// State
const selectedPhotos = ref([]);
const currentPhoto = ref(null);
const selectedPhotoIds = ref(new Set());
const selectedFrame = ref(null);
const marginValue = ref(5);
const frameColor = ref("#ffffff");
const showPhotoDialog = ref(false);
const fileInputRef = ref(null);
const isProcessingFiles = ref(false);
const frameVisualizerRef = ref(null);

// Mobile detection
const windowWidth = ref(window.innerWidth);
const isMobileView = computed(() => windowWidth.value <= 768);

const updateWindowWidth = () => {
  windowWidth.value = window.innerWidth;
};

// All frame options combined for the grid layout
const allFrames = ref([
  // Social Media frames
  {
    id: "instagram-square",
    ratio: "1:1",
    aspectRatio: "1/1",
    color: "#E4405F",
    category: "social",
    icon: "instagram",
  },
  {
    id: "instagram-vertical", // Nuevo estándar en 2025
    ratio: "3:4",
    aspectRatio: "3/4",
    color: "#E4405F",
    category: "social",
    icon: "instagram",
  },
  {
    id: "instagram-portrait", // Aún usable, clásico feed
    ratio: "4:5",
    aspectRatio: "4/5",
    color: "#E4405F",
    category: "social",
    icon: "instagram",
  },
  {
    id: "instagram-story",
    ratio: "9:16",
    aspectRatio: "9/16",
    color: "#E4405F",
    category: "social",
    icon: "instagram",
  },
  {
    id: "facebook-post",
    ratio: "4:3",
    aspectRatio: "4/3",
    color: "#1877F2",
    category: "social",
    icon: "facebook",
  },
  {
    id: "facebook-cover",
    ratio: "820:312",
    aspectRatio: "820/312",
    color: "#1877F2",
    category: "social",
    icon: "facebook",
  },
  {
    id: "twitter-post",
    ratio: "16:9",
    aspectRatio: "16/9",
    color: "#1DA1F2",
    category: "social",
    icon: "twitter",
  },
  {
    id: "twitter-portrait",
    ratio: "4:5",
    aspectRatio: "4/5",
    color: "#1DA1F2",
    category: "social",
    icon: "twitter",
  },
  {
    id: "linkedin-post",
    ratio: "1.91:1",
    aspectRatio: "1.91/1",
    color: "#0A66C2",
    category: "social",
    icon: "linkedin",
  },
  {
    id: "linkedin-square",
    ratio: "1:1",
    aspectRatio: "1/1",
    color: "#0A66C2",
    category: "social",
    icon: "linkedin",
  },

  // General photography & cinema
  {
    id: "golden-3-2",
    ratio: "3:2",
    aspectRatio: "3/2",
    color: "#8B5CF6",
    category: "photo",
  },
  {
    id: "cinema-2-3",
    ratio: "2:3",
    aspectRatio: "2/3",
    color: "#8B5CF6",
    category: "photo",
  },
  {
    id: "portrait-3-4",
    ratio: "3:4",
    aspectRatio: "3/4",
    color: "#8B5CF6",
    category: "photo",
  },
  {
    id: "landscape-4-3",
    ratio: "4:3",
    aspectRatio: "4/3",
    color: "#8B5CF6",
    category: "photo",
  },
  {
    id: "movie",
    ratio: "2.39:1",
    aspectRatio: "2.39/1",
    color: "#F59E0B",
    category: "cinema",
  },
  {
    id: "ultrawide",
    ratio: "21:9",
    aspectRatio: "21/9",
    color: "#F59E0B",
    category: "cinema",
  },

  // Print frames
  {
    id: "print-4x6",
    ratio: '4x6"',
    aspectRatio: "6/4",
    color: "#10B981",
    category: "print",
  },
  {
    id: "print-5x7",
    ratio: '5x7"',
    aspectRatio: "7/5",
    color: "#10B981",
    category: "print",
  },
  {
    id: "print-8x10",
    ratio: '8x10"',
    aspectRatio: "10/8",
    color: "#10B981",
    category: "print",
  },
  {
    id: "print-11x14",
    ratio: '11x14"',
    aspectRatio: "14/11",
    color: "#10B981",
    category: "print",
  },
  {
    id: "print-16x20",
    ratio: '16x20"',
    aspectRatio: "20/16",
    color: "#10B981",
    category: "print",
  },
]);

const frameColors = ref([
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#000000" },
  { name: "Gray", value: "#6b7280" },
  { name: "Warm Gray", value: "#a8a29e" },
  { name: "Cream", value: "#fef7ed" },
  { name: "Beige", value: "#f5f5dc" },
]);

// Computed
const hasSelectedPhotos = computed(() => selectedPhotos.value.length > 0);
const selectedCount = computed(() => selectedPhotoIds.value.size);
const previewPhoto = computed(() => {
  // Only show photo if there are actually selected photos
  if (selectedCount.value === 0) {
    return null;
  }

  // Show the first selected photo from the multi-selection
  const firstSelectedId = Array.from(selectedPhotoIds.value)[0];
  if (firstSelectedId) {
    return selectedPhotos.value.find((p) => p.id === firstSelectedId);
  }

  return null;
});

// Get the correct photo URL based on mode (playground vs authenticated)
const previewPhotoUrl = computed(() => {
  if (!previewPhoto.value) return null;

  // In playground mode, use thumbnailUrl (which is the blob URL from local files)
  if (isPlaygroundMode.value) {
    return previewPhoto.value.thumbnailUrl;
  }

  // In authenticated mode, use originalUrl
  return previewPhoto.value.originalUrl;
});

// Get icon component for frame
const getFrameIcon = (frame) => {
  switch (frame.icon) {
    case "instagram":
      return LogoInstagram;
    case "facebook":
      return LogoFacebook;
    case "twitter":
      return LogoTwitter;
    case "linkedin":
      return LogoLinkedin;
    default:
      switch (frame.category) {
        case "cinema":
          return MovieIcon;
        case "print":
          return PrintIcon;
        case "photo":
          return PhotoIcon;
        default:
          return SquareOutline;
      }
  }
};

// Methods
const openPhotoDialog = () => {
  if (isPlaygroundMode.value) {
    // In playground mode, directly open file selector
    triggerFileSelect();
  } else {
    // In authenticated mode, show photo dialog
    showPhotoDialog.value = true;
  }
};

const triggerFileSelect = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = async (event) => {
  const files = Array.from(event.target.files).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (files.length > 0) {
    await processLocalFiles(files);
  }

  // Reset input to allow selecting the same files again
  event.target.value = "";
};

const processLocalFiles = async (files) => {
  if (files.length === 0) return;

  isProcessingFiles.value = true;

  try {
    const processedPhotos = [];

    for (const file of files) {
      try {
        // Process image - only resize to 1500px for good quality
        const resizedBlob = await resizeWithStepDown(file, 2000);

        // Create preview URL from the good quality image
        const preview = URL.createObjectURL(resizedBlob);

        // Get dimensions from the resized image
        const dimensions = await getImageDimensions(preview);

        const photoObject = {
          id: Date.now() + Math.random(), // Simple ID generation
          thumbnailUrl: preview, // Use good quality image for thumbnail too
          name: file.name,
          file: resizedBlob, // Use resized image
          originalFile: file, // Keep reference to original
          dimensions: dimensions,
          tags: [],
          detectionAreas: [],
        };

        processedPhotos.push(photoObject);
      } catch (error) {
        console.error("Error processing file:", file.name, error);
        message.error(`Failed to process ${file.name}`);
      }
    }

    if (processedPhotos.length > 0) {
      // Add processed photos directly to the selection
      selectedPhotos.value.push(...processedPhotos);

      // Auto-select first photo if none selected
      if (selectedCount.value === 0 && processedPhotos.length > 0) {
        const firstPhoto = processedPhotos[0];
        currentPhoto.value = firstPhoto;
        selectedPhotoIds.value.add(firstPhoto.id);
      }

      // Auto-select first frame if none selected
      if (!selectedFrame.value) {
        selectedFrame.value = allFrames.value[0];
      }
    }
  } catch (error) {
    console.error("Error processing files:", error);
    message.error("Failed to process images");
  } finally {
    isProcessingFiles.value = false;
  }
};

// Get image dimensions function
const getImageDimensions = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
};

const handlePhotosAdded = (photoIds) => {
  // Get the full photo objects from the store using the IDs
  const photoObjects = photoIds
    .map((id) => photosStore.photos.find((photo) => photo.id === id))
    .filter(Boolean); // Remove any undefined values

  // Add the photo objects to our selection
  selectedPhotos.value.push(...photoObjects);

  // Auto-select the first photo if no photos are currently selected
  if (selectedCount.value === 0 && photoObjects.length > 0) {
    const firstPhoto = photoObjects[0];
    currentPhoto.value = firstPhoto;
    selectedPhotoIds.value.add(firstPhoto.id);
  }

  if (!selectedFrame.value) {
    selectedFrame.value = allFrames.value[0]; // Default to 1:1
  }
};

const handlePlaygroundPhotosAdded = (photoObjects) => {
  // For playground mode, we receive photo objects directly from PlaygroundPhotosDialog
  selectedPhotos.value.push(...photoObjects);

  // Auto-select the first photo if no photos are currently selected
  if (selectedCount.value === 0 && photoObjects.length > 0) {
    const firstPhoto = photoObjects[0];
    currentPhoto.value = firstPhoto;
    selectedPhotoIds.value.add(firstPhoto.id);
  }

  if (!selectedFrame.value) {
    selectedFrame.value = allFrames.value[0]; // Default to 1:1
  }
};

const selectPhoto = (photoId) => {
  const photo = selectedPhotos.value.find((p) => p.id === photoId);
  if (photo) {
    currentPhoto.value = photo;

    // Toggle multi-selection
    if (selectedPhotoIds.value.has(photoId)) {
      selectedPhotoIds.value.delete(photoId);
    } else {
      selectedPhotoIds.value.add(photoId);
    }
  }
};

const removePhoto = (photoId) => {
  const index = selectedPhotos.value.findIndex((p) => p.id === photoId);
  if (index > -1) {
    selectedPhotos.value.splice(index, 1);
    selectedPhotoIds.value.delete(photoId);

    // If we removed the current photo, update currentPhoto
    if (currentPhoto.value?.id === photoId) {
      // If there are still selected photos, pick the first one
      if (selectedCount.value > 0) {
        const firstSelectedId = Array.from(selectedPhotoIds.value)[0];
        currentPhoto.value = selectedPhotos.value.find(
          (p) => p.id === firstSelectedId,
        );
      } else {
        // If no photos selected, try the first available photo or null
        currentPhoto.value =
          selectedPhotos.value.length > 0 ? selectedPhotos.value[0] : null;
      }
    }
  }
};

const toggleSelectAll = () => {
  if (selectedPhotoIds.value.size === selectedPhotos.value.length) {
    // If all are selected, unselect all
    selectedPhotoIds.value.clear();
  } else {
    // Otherwise, select all
    selectedPhotoIds.value.clear();
    selectedPhotos.value.forEach((photo) => {
      selectedPhotoIds.value.add(photo.id);
    });
  }
};

const clearAllPhotos = () => {
  selectedPhotos.value = [];
  currentPhoto.value = null;
  selectedFrame.value = null;
  selectedPhotoIds.value.clear();
};

const selectFrame = (frame) => {
  selectedFrame.value = frame;
};

const downloadPhotos = async () => {
  // Determine which photos to download
  const photosToDownload =
    selectedCount.value > 0
      ? selectedPhotos.value.filter((p) => selectedPhotoIds.value.has(p.id))
      : selectedPhotos.value;

  if (photosToDownload.length === 0 || !selectedFrame.value) return;

  const frameConfig = {
    aspectRatio: selectedFrame.value.aspectRatio,
    ratio: selectedFrame.value.ratio,
    frameColor: frameColor.value,
    margin: marginValue.value,
  };

  if (photosToDownload.length === 1) {
    // Download single photo with frame using DOM capture for perfect consistency
    // Add small delay to ensure image is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 200));

    await downloadFramedPhoto(
      photosToDownload[0],
      frameConfig,
      isPlaygroundMode.value,
      frameVisualizerRef.value, // Pass the FrameVisualizer reference for DOM capture
    );
  } else {
    // Download multiple photos as ZIP (now uses improved method with real margins)
    await downloadFramedPhotosZip(
      photosToDownload,
      frameConfig,
      isPlaygroundMode.value,
      frameVisualizerRef.value, // Pass the FrameVisualizer reference to extract real margins
    );
  }
};

// Image handling functions
const onImageLoad = () => {
  // Image loaded successfully
};

const onImageError = () => {
  message.error("Failed to load image");
};

// Function to process photos from sessionStorage
const processPhotosFromSessionStorage = () => {
  const photosToAddData = sessionStorage.getItem("framer_photos_to_add");
  if (photosToAddData) {
    try {
      const photosData = JSON.parse(photosToAddData);
      if (Array.isArray(photosData) && photosData.length > 0) {
        // Convert stored data back to photo objects
        const photoObjects = photosData
          .map((data) => data.photoObject)
          .filter(Boolean);

        if (photoObjects.length > 0) {
          // Add new photos to existing ones (accumulate instead of replace)
          selectedPhotos.value.push(...photoObjects);

          // Auto-select first photo if none selected
          if (selectedCount.value === 0) {
            const firstPhoto = photoObjects[0];
            currentPhoto.value = firstPhoto;
            selectedPhotoIds.value.add(firstPhoto.id);
          }

          // Auto-select first frame if none selected
          if (!selectedFrame.value) {
            selectedFrame.value = allFrames.value[0];
          }

          message.success(
            `Added ${photoObjects.length} photo${
              photoObjects.length > 1 ? "s" : ""
            } to Framer`,
          );
        }
      }

      // Clear the sessionStorage after processing
      sessionStorage.removeItem("framer_photos_to_add");
    } catch (error) {
      console.error("Error processing photos from sessionStorage:", error);
      sessionStorage.removeItem("framer_photos_to_add");
    }
  }
};

// Initialize
onMounted(async () => {
  // Ensure photos are loaded (only in authenticated mode)
  if (!isPlaygroundMode.value && photosStore.photos?.length === 0) {
    await photosStore.getOrFetch(false);
  }

  // Check for photos to add from other views (via sessionStorage)
  processPhotosFromSessionStorage();

  // Load photos from query params if present (e.g., ?source=lightroom&ids=123,456)
  const photoIdsFromQuery = getPhotoIdsFromQuery({
    clearAfterLoad: true,
    onReady: async (photoIds) => {
      if (photoIds.length > 0 && !isPlaygroundMode.value) {
        await handlePhotosAdded(photoIds);
        console.log(
          `✅ Added ${photoIds.length} photos from URL to framer (async)`,
        );
      }
    },
  });

  // Caso sync: si el store ya estaba cargado, añadir las fotos inmediatamente
  if (photoIdsFromQuery.length > 0 && !isPlaygroundMode.value) {
    await handlePhotosAdded(photoIdsFromQuery);
    console.log(
      `✅ Added ${photoIdsFromQuery.length} photos from URL to framer`,
    );
  }

  // Add window resize listener for mobile detection
  window.addEventListener("resize", updateWindowWidth);
});

// Watch for route changes to detect when coming back to framer with new photos
watch(
  () => route.fullPath,
  () => {
    // Check sessionStorage whenever route changes
    processPhotosFromSessionStorage();
  },
);

onUnmounted(() => {
  window.removeEventListener("resize", updateWindowWidth);
});
</script>

<style scoped>
.framer-container {
  padding: var(--spacing-2xl) var(--spacing-2xl) var(--spacing-4xl)
    var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
  min-height: 90vh;
}

/* Empty State Styles */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  text-align: center;
}

.empty-content {
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
}

.empty-icon {
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-md);
}

.empty-title {
  font-size: var(--font-size-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.empty-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.instructions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
  margin: var(--spacing-lg) 0;
}

.instruction-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.instruction-item:hover {
  background-color: var(--bg-tertiary);
  border-color: var(--border-color-hover);
}

.instruction-item n-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.instruction-item span {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.report-actions {
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
}

.generate-button {
  min-width: 150px;
}

/* Main Framer Interface */
.framer-interface {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
}

.framer-content {
  display: flex;
  flex: 1;
  gap: var(--spacing-xl);
  overflow: hidden;
}

/* Frame Sidebar */
.frame-sidebar {
  width: 330px;
  background-color: var(--bg-secondary);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--border-color);
  padding: var(--spacing-lg);
  overflow-y: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-header h3 {
  margin: 0 0 var(--spacing-lg) 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.logo-container {
  display: flex;
  justify-content: center;
}

.app-logo {
  max-height: 50px;
  width: auto;
  object-fit: contain;
}

.frame-styles-title {
  margin-bottom: var(--spacing-md);
}

.frame-styles-title h4 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 500;
  color: var(--text-primary);
}

.frame-options-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-top: 0; /* Reduced margin since title is now above */
  overflow-y: auto;
  padding-right: var(--spacing-xs);
  grid-auto-rows: minmax(min-content, max-content);
  align-items: start;
  justify-items: center;
}

/* Frame Controls */
.frame-controls {
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
}

.controls-header {
  margin-bottom: var(--spacing-md);
}

.controls-header h4 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
}

.frame-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-lg);
  border: 2px solid var(--border-color);
  background-color: var(--bg-body);
  cursor: pointer;
  transition: all 0.2s ease;
  aspect-ratio: 1;
  justify-content: center;
  position: relative;
  overflow: visible;
  width: 100%;
  box-sizing: border-box;
}

.frame-option::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--frame-color, var(--primary-color)),
    var(--frame-color, var(--primary-color))
  );
  opacity: 0;
  transition: all 0.3s ease;
}

.frame-option:hover {
  border-color: var(--frame-color, var(--primary-color));
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  background: linear-gradient(
    135deg,
    var(--bg-body) 0%,
    var(--frame-color-light, var(--primary-color-light)) 100%
  );
}

.frame-option:hover::before {
  opacity: 1;
}

.frame-option.active {
  border-color: var(--frame-color, var(--primary-color));
  background: var(--frame-color, var(--primary-color));
  color: white;
  transform: translateY(-2px);
}

.frame-option.active::before {
  opacity: 1;
  height: 100%;
  background: var(--frame-color, var(--primary-color));
}

.frame-option.active .frame-shape {
  background-color: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.frame-option.active .frame-ratio {
  color: white;
  font-weight: 600;
}

.frame-option.active .social-icon,
.frame-option.active .category-icon {
  color: white;
}

/* Category-specific styling */
.frame-option.frame-social:hover {
  border-color: var(--frame-color);
  box-shadow: 0 4px 20px var(--frame-color-light);
}

.frame-option.frame-photo:hover {
  border-color: var(--frame-color);
  box-shadow: 0 4px 20px var(--frame-color-light);
}

.frame-option.frame-cinema:hover {
  border-color: var(--frame-color);
  box-shadow: 0 4px 20px var(--frame-color-light);
}

.frame-option.frame-print:hover {
  border-color: var(--frame-color);
  box-shadow: 0 4px 20px var(--frame-color-light);
}

.frame-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 48px;
  height: 48px;
  position: relative;
}

.icon-container {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-bottom: -8px;
  z-index: 2;
}

.social-icon {
  color: var(--frame-color, var(--primary-color));
  transition: all 0.2s ease;
  background: var(--bg-body);
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.category-icon {
  color: var(--frame-color, var(--text-tertiary));
  transition: all 0.2s ease;
  background: var(--bg-body);
  border-radius: 50%;
  padding: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.frame-shape {
  border: 2px solid var(--frame-color, var(--border-color));
  background-color: transparent;
  max-width: 32px;
  max-height: 32px;
  min-width: 16px;
  min-height: 16px;
  transition: all 0.2s ease;
  border-radius: 2px;
  z-index: 1;
  margin-top: -4px;
}

.frame-ratio {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  text-align: center;
  line-height: 1.2;
  z-index: 1;
  position: relative;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.control-group:last-child {
  margin-bottom: 0;
}

.control-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
}

.slider-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.margin-slider {
  flex: 1;
}

.slider-value {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  min-width: 50px;
  text-align: right;
  font-weight: 500;
}

.color-options {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.color-option:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.color-option.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-color-light);
  transform: scale(1.05);
}

/* Preview Area */
.preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-secondary);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

/* Solo aplica el max-height si NO es playground */
.preview-area:not(.playground-mode) {
  max-height: 87vh;
}

.preview-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.preview-header h3 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.preview-logo-container {
  display: flex;
  align-items: center;
}

.preview-logo {
  max-height: 32px;
  width: auto;
  object-fit: contain;
}

.preview-controls {
  display: flex;
  gap: var(--spacing-sm);
}

.photo-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* Background with checkered pattern when photo is present */
/* Background with checkered pattern always visible in preview */
.photo-preview .preview-wrapper {
  /* background: linear-gradient(45deg, #f8fafc 25%, transparent 25%),
    linear-gradient(-45deg, #f8fafc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f8fafc 75%),
    linear-gradient(-45deg, transparent 75%, #f8fafc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px; */
  background-color: var(--bg-container);
}

.no-photo-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  /* Eliminar background-color para que se vea el patrón de fondo */
}

.preview-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.photo-count-indicator {
  position: absolute;
  top: 20px;
  right: 20px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 50%;
  width: 45px;
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

/* Photo Sidebar (Desktop) */
.photo-sidebar {
  width: 150px;
  background-color: var(--bg-secondary);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--border-color);
  padding: var(--spacing-lg);
  overflow-y: auto;
  flex-shrink: 0;
  max-height: 84vh;
}

.photo-sidebar .sidebar-header {
  display: flex;
  justify-content: center;
  margin-bottom: 5px;
  flex-wrap: wrap;
}

.photo-sidebar .sidebar-header h4 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.photo-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-sm);
}

.photo-grid .add-photo-container {
  width: 100%;
  height: 100px;
  aspect-ratio: 1;
}

/* Add photo card that matches PhotoCard style */
.add-photo-card {
  background-color: var(--bg-tertiary);
  border: 2px dashed var(--border-color);
  border-radius: var(--border-radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px; /* Match typical PhotoCard height */
}

.add-photo-card:hover {
  border-color: var(--primary-color);
  background-color: var(--primary-color-light);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.add-photo-card.processing {
  pointer-events: none;
  opacity: 0.7;
  border-color: var(--primary-color);
  background-color: var(--primary-color-light);
}

.add-photo-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.add-photo-card-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-align: center;
  font-weight: 500;
}

.add-photo-card.mobile-add {
  min-height: 120px; /* Match PhotoCard height in mobile */
  width: 120px; /* Match PhotoCard width in mobile */
  flex-shrink: 0;
}

/* Responsive visibility classes */
.desktop-only {
  display: block;
}

.mobile-only {
  display: none;
}

/* Photo Strip (Mobile) */
.photo-strip {
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  padding: var(--spacing-lg);
}

.strip-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.strip-actions {
  display: flex;
  align-items: center;
  flex-direction: row;
  align-content: center;
  justify-content: center;
}

.strip-header h4 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--text-primary);
}

.photo-count {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.photo-thumbnails {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  padding-bottom: var(--spacing-xs);
}

.photo-thumbnail-wrapper {
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: var(--border-radius-md);
  transition: all 0.2s ease;
}

.photo-thumbnail-wrapper:hover {
  transform: translateY(-2px);
}

.photo-thumbnail-wrapper.active {
  transform: translateY(-2px);
}

.thumbnail-container {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: var(--border-radius-md);
  overflow: hidden;
  border: 3px solid transparent;
  transition: all 0.2s ease;
}

.photo-thumbnail-wrapper.active .thumbnail-container {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px var(--primary-color-light);
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumbnail-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  background-color: var(--primary-color);
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-button {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: var(--error-color) !important;
  border: 2px solid white;
  z-index: 10;
}

/* Scrollbar styling */
.photo-thumbnails::-webkit-scrollbar {
  height: 6px;
}

.photo-thumbnails::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
}

.photo-thumbnails::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: var(--border-radius-sm);
}

.photo-thumbnails::-webkit-scrollbar-thumb:hover {
  background: var(--border-color-hover);
}

.frame-sidebar::-webkit-scrollbar {
  width: 6px;
}

.frame-sidebar::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
}

.frame-sidebar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: var(--border-radius-sm);
}

.frame-sidebar::-webkit-scrollbar-thumb:hover {
  background: var(--border-color-hover);
}

.photo-sidebar::-webkit-scrollbar {
  width: 6px;
}

.photo-sidebar::-webkit-scrollbar-track {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-sm);
}

.photo-sidebar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: var(--border-radius-sm);
}

.photo-sidebar::-webkit-scrollbar-thumb:hover {
  background: var(--border-color-hover);
}

/* Mobile Responsiveness */
@media (max-width: 1024px) {
  .framer-content {
    flex-direction: column;
  }

  .frame-sidebar {
    width: 100%;
    order: 2;
  }

  .preview-area {
    order: 1;
    min-height: 400px;
  }

  .photo-sidebar {
    order: 3;
    width: 100%;
  }

  /* Switch to mobile layout */
  .desktop-only {
    display: none;
  }

  .mobile-only {
    display: block;
  }
}

@media (max-width: 768px) {
  .framer-container {
    padding: var(--spacing-lg);
  }

  .frame-options-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-sm);
  }

  .preview-controls {
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .photo-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  /* Compact frame controls for mobile */
  .frame-controls {
    padding: var(--spacing-sm);
  }

  .color-options {
    justify-content: center;
  }

  .color-option {
    width: 24px;
    height: 24px;
  }
}

@media (max-width: 480px) {
  .frame-options-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .photo-thumbnails {
    gap: var(--spacing-xs);
  }

  .photo-grid {
    grid-template-columns: 1fr 1fr;
  }

  /* Even more compact controls for small screens */
  .frame-controls {
    padding: var(--spacing-xs);
  }

  .controls-header h4 {
    font-size: var(--font-size-sm);
  }

  .slider-container {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-xs);
  }

  .slider-value {
    text-align: center;
    min-width: auto;
  }
}
</style>
