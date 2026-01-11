<template>
  <div class="curation-container view-container">
    <!-- Search Input Section -->
    <div class="search-section">
      <div class="search-input-row">
        <n-input
          v-model:value="searchQuery"
          type="textarea"
          placeholder="Describe the concept or theme to search for photos"
          :autosize="{ minRows: 1, maxRows: 2 }"
          class="search-input"
          @input="onSearchChange"
        />

        <div class="search-actions">
          <n-button
            type="primary"
            :loading="isSearching"
            :disabled="!hasSearchQuery"
            @click="performSearch"
            class="search-button"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14z"
                  />
                </svg>
              </n-icon>
            </template>
            Search Photos
          </n-button>
          <n-button
            secondary
            @click="clearSearch"
            :disabled="!hasSearchQuery && candidatePhotos.length === 0"
            class="clear-button"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41z"
                  />
                </svg>
              </n-icon>
            </template>
            Clear
          </n-button>
        </div>
        <!-- Usage Limit Warning Badge -->
        <!-- <div
          v-if="userStore.usageLimits.curation.exceeded"
          class="usage-limit-warning"
        >
          <WarningBadge
            message="Free usage ended"
            tooltip="This is a premium feature, purchase credits to continue using it."
          />
        </div> -->
      </div>
    </div>

    <!-- Main Curation Area -->
    <div
      class="curation-main"
      v-if="
        candidatePhotos.length > 0 || curatedPhotos.length > 0 || isSearching
      "
    >
      <!-- Left Side: Curation Area -->
      <div class="curation-area">
        <div class="area-header">
          <h3 class="area-title">Curation Area</h3>
          <div class="filters-row">
            <div class="star-filter">
              <span class="filter-label">Min. Rating:</span>
              <div class="star-buttons">
                <n-rate
                  v-model:value="minMatchScore"
                  :readonly="isSearching || isLoadingMore || isThinking"
                  :count="3"
                  size="small"
                  clearable
                  @update:value="onRatingChange"
                  class="star-rating"
                  :allow-half="false"
                />
              </div>
            </div>
            <div class="results-filter">
              <span class="filter-label"
                >Min. Results
                <n-tooltip trigger="hover" placement="top">
                  <template #trigger>
                    <n-icon size="12">
                      <InfoCircleFilled />
                    </n-icon>
                  </template>
                  Mininum number or photos shown per iteration with the selected
                  score
                </n-tooltip></span
              >

              <n-select
                v-model:value="minResults"
                :options="resultsOptions"
                :disabled="isSearching || isLoadingMore || isThinking"
                size="small"
                class="results-select"
                @update:value="onResultsChange"
              />
            </div>
          </div>
        </div>

        <div
          class="photos-grid"
          v-if="
            filteredCandidatePhotos.length > 0 ||
            isSearching ||
            !maxPageAttempts
          "
        >
          <!-- Show skeletons when loading more photos -->
          <template v-if="isLoadingMore">
            <div
              v-for="n in 6"
              :key="`loading-skeleton-${n}`"
              class="photo-skeleton"
            >
              <n-skeleton height="100%" />
            </div>
          </template>
          <!-- Show skeletons while searching (only when no photos yet) -->
          <template v-if="isSearching && filteredCandidatePhotos.length === 0">
            <div v-for="n in 6" :key="`skeleton-${n}`" class="photo-skeleton">
              <n-skeleton height="100%" />
            </div>
          </template>
          <!-- Show actual photos -->
          <template v-if="filteredCandidatePhotos.length > 0">
            <PhotoCard
              v-for="photo in filteredCandidatePhotos"
              :key="photo.id"
              :photo="photo"
              :mode="'curation'"
              :selected="false"
              :isThinking="isThinking"
              :isNew="newlyArrivedPhotos.has(photo.id)"
              @select="togglePhotoSelection"
              @info="showPhotoInfo"
              @move-to-selection="moveToSelection"
              :show-info-button="false"
            />
          </template>
        </div>

        <div class="empty-area" v-else>
          <n-icon size="48" color="#6b7280">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              />
            </svg>
          </n-icon>

          <p class="empty-text">No photos to review</p>
        </div>

        <div class="area-actions">
          <n-button
            secondary
            :loading="isSearching || isLoadingMore || isThinking"
            @click="searchMorePhotos"
            class="search-more-button"
            size="large"
            :disabled="
              !hasMoreResults || isSearching || isLoadingMore || isThinking
            "
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                  />
                </svg>
              </n-icon>
            </template>
            Search More
          </n-button>
        </div>
      </div>

      <!-- Right Side: Selection Area -->
      <div class="selection-area">
        <div class="area-header">
          <h3 class="area-title">Selection Area</h3>
          <div class="area-stats">
            <span class="stats-text">{{ curatedPhotos.length }} curated</span>
            <n-button
              v-if="curatedPhotos.length > 0"
              size="small"
              @click="clearSelection"
              class="clear-selection-button"
            >
              Clear All
            </n-button>
          </div>
        </div>

        <div class="photos-grid" v-if="curatedPhotos.length > 0">
          <PhotoCard
            v-for="photo in curatedPhotos"
            :key="photo.id"
            :photo="photo"
            :mode="'selection'"
            :isThinking="isThinking"
            :showReturnButton="showReturnButton"
            @select="togglePhotoSelection"
            @info="showPhotoInfo"
            @move-to-curation="moveToCuration"
            :show-info-button="false"
          />
        </div>

        <div class="empty-area" v-else>
          <n-icon size="48" color="#6b7280">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
              />
            </svg>
          </n-icon>
          <p class="empty-text">Curated photos will appear here</p>
          <p class="empty-subtitle">
            Move photos from the left to start curating
          </p>
        </div>

        <div class="area-actions">
          <n-button
            @click="moveToCanvas"
            size="large"
            secondary
            :disabled="curatedPhotos.length == 0"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                  />
                </svg>
              </n-icon>
            </template>
            View in Canvas
          </n-button>
          <n-button
            @click="handleAddToCollection"
            size="large"
            secondary
            :disabled="curatedPhotos.length == 0"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                  />
                </svg>
              </n-icon>
            </template>
            Add to Collection
          </n-button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="empty-content">
        <n-icon
          size="64"
          color="#6b7280"
          class="empty-icon"
          :component="ImagesOutline"
        />

        <h2 class="empty-title">Start Building Projects</h2>
        <p class="empty-description">
          Project Builder is a tool designed to help you compile photos under a
          concept, theme, or style. Enter what you're looking for in rich,
          natural language.
        </p>
        <div class="instructions-list">
          <div class="instruction-item">
            <n-icon>
              <Language />
            </n-icon>

            <span>
              Your search will be automatically enriched with nuances and
              associations.</span
            >
          </div>
          <div class="instruction-item">
            <n-icon>
              <StarHalf />
            </n-icon>

            <span>
              Each proposed photo will be accompanied by a comment and a
              score.</span
            >
          </div>
          <div class="instruction-item">
            <n-icon>
              <LogOutOutline />
            </n-icon>
            <span
              >Select the ones you consider valid by moving them to the right
              side of the screen.</span
            >
          </div>
        </div>
        <div class="examples-carousel">
          <span>Try something like...</span>
          <div class="carousel-container">
            <div class="carousel-item" :class="{ sliding: isSliding }">
              <button class="example-card" @click="handleExampleClick">
                <p class="example-text">«{{ currentExampleText }}»</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Collection Selection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="curatedPhotos.length"
      :photo-ids="curatedPhotos.map((photo) => photo.id)"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="cancelCollectionModal"
    />
  </div>
</template>

<script setup>
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  defineOptions,
  h,
} from "vue";

// Define component name for KeepAlive
defineOptions({
  name: "ProjectBuilderView",
});

import PhotoCard from "../components/photoCards/PhotoCard.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import { useUserStore } from "@/stores/userStore";
import { useQueryExamples } from "@/composables/useQueryExamples";
import {
  NRate,
  NSelect,
  useNotification,
  NTooltip,
  useMessage,
} from "naive-ui";
import {
  FolderOpenOutline,
  ImagesOutline,
  Language,
  LogOutOutline,
  StarHalf,
} from "@vicons/ionicons5";
import { usePhotosStore } from "@/stores/photos";
import { useCanvasStore } from "@/stores/canvas.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useRouter } from "vue-router";

import { api } from "@/utils/axios";
import { io } from "socket.io-client";
import { InfoCircleFilled } from "@vicons/antd";
import { useWarmUp } from "@/composables/useWarmUp";

const canvasStore = useCanvasStore();
const photoStore = usePhotosStore();
const collectionsStore = useCollectionsStore();
const router = useRouter();
const notification = useNotification();
const message = useMessage();

// Estado del modal de colecciones
const showCollectionModal = ref(false);

// Llevar las fotos seleccionadas a Canvas
async function moveToCanvas() {
  // Buscar los datos completos de las fotos por id (si no están ya en el store)
  await Promise.all(
    curatedPhotos.value.map((photo) => photoStore.fetchPhoto(photo.id))
  );
  // Obtener los objetos completos de las fotos
  const photosToAdd = curatedPhotos.value
    .map((photo) => photoStore.photos.find((p) => p.id == photo.id) || photo)
    .filter(Boolean);

  // Agregar al canvas
  canvasStore.addPhotos(photosToAdd, false, true);

  // Navegar al canvas
  router.push("/canvas");
}

// Socket connection for real-time results
const socket = io(import.meta.env.VITE_API_WS_URL);

// Stores
const userStore = useUserStore();

// Warm up composable
const { warmedUp, ensureWarmUp } = useWarmUp();

// State
const searchQuery = ref("");
const isSearching = ref(false);
const isLoadingMore = ref(false);
const isThinking = ref(false); // Esperando insights
const hasMoreResults = ref(true);
const candidatePhotos = ref([]);
const curatedPhotos = ref([]);
const minMatchScore = ref(2);
const minResults = ref(1);
const iterationFinished = ref(false);

// Options for the min results select
const resultsOptions = Array.from({ length: 6 }, (_, i) => ({
  label: (i + 1).toString(),
  value: i + 1,
}));

// Real-time results state
const iterationsRecord = ref({});
const currentIteration = ref(1);
const maxPageAttempts = ref(false);
const newlyArrivedPhotos = ref(new Set());
const lastCursor = ref(null); // ID of last photo for cursor-based pagination

// Computed properties
const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0);

// Calculate if return button should be shown (not during loading states)
const showReturnButton = computed(() => {
  return !isThinking.value && !isSearching.value && !isLoadingMore.value;
});

// Filter candidate photos based on minimum match score
const filteredCandidatePhotos = computed(() => {
  if (!iterationFinished.value) {
    return candidatePhotos.value.filter((photo) => {
      return photo.reasoning == "Reviewing...";
    });
  }

  if (!minMatchScore.value) {
    return candidatePhotos.value;
  }

  const minScore = minMatchScore.value;
  return candidatePhotos.value.filter((photo) => {
    // Only filter photos that have been scored (matchScore > 0)
    // Photos with matchScore = 0 are still being analyzed
    return photo.matchScore === 0 || photo.matchScore >= minScore;
  });
});

// Socket event handlers
let socketListenersRegistered = false;

const registerSocketListeners = () => {
  if (socketListenersRegistered || !userStore.user?.id) return;

  const userId = userStore.user.id;
  socket.emit("join", { userId: userStore.user.id });

  // Socket for initial photo matches (fast response)
  socket.on("curation-matches", (data) => {
    isThinking.value = true; // Esperar insights después de matches

    console.log("🎯 Matches received:", data);

    // Update iterations record with new photo results
    Object.entries(data.results).forEach(([iter, items]) => {
      const iterNum = parseInt(iter);
      if (!iterationsRecord.value[iterNum]) {
        iterationsRecord.value[iterNum] = { photos: [] };
      }

      const newPhotos = items.map((item, index) => ({
        id: item.photo.id,
        url: item.photo.thumbnailUrl || item.photo.url,
        thumbnailUrl: item.photo.thumbnailUrl || item.photo.url,
        title: item.photo.title || `Photo ${item.photo.id}`,
        rating: item.photo.rating || Math.floor(Math.random() * 3) + 3,
        reasoning: "Reviewing...", // Temporary until insights arrive
        matchScore: 0, // Will be set when insights arrive
        matchingTags: item.photo.matchingTags || [],
        width: item.photo.width,
        height: item.photo.height,
        isUploading: false,
        file: null,
        needProcess: false,
        isDuplicate: false,
        originalIndex: undefined, // Will be set in updateCandidatePhotos
        isNew: true, // Mark as new photo
      }));

      // Don't add to newlyArrivedPhotos yet - wait for insights

      iterationsRecord.value[iterNum].photos.push(...newPhotos);
    });

    // Update cursor with the ID of the last photo received
    if (data.results) {
      const allIterations = Object.values(data.results);
      const lastIteration = allIterations[allIterations.length - 1];
      if (lastIteration && lastIteration.length > 0) {
        const lastPhoto = lastIteration[lastIteration.length - 1];
        if (lastPhoto && lastPhoto.photo && lastPhoto.photo.id) {
          lastCursor.value = lastPhoto.photo.id;
        }
      }
    }

    // Update candidate photos with all results up to current iteration
    updateCandidatePhotos();

    hasMoreResults.value = data.hasMore;
    currentIteration.value = data.iteration + 1;
    isSearching.value = false;
    isLoadingMore.value = false;
  });

  // Socket for insights/reasoning (enriches existing photos)
  socket.on("insights", (data) => {
    isThinking.value = false;
    console.log("📊 Insights received:", data);

    // Enrich existing photos with reasoning and match scores
    Object.entries(data.results).forEach(([iter, richPhotos]) => {
      const iterNum = parseInt(iter);
      if (!iterationsRecord.value[iterNum]) return;

      iterationsRecord.value[iterNum].photos = iterationsRecord.value[
        iterNum
      ].photos.map((existing) => {
        const updated = richPhotos.find(
          (item) => item.photo.id === existing.id
        );
        if (updated) {
          // Add to newly arrived photos when insights arrive (photo is now complete)
          newlyArrivedPhotos.value.add(existing.id);

          return {
            ...existing,
            reasoning: updated.reasoning || "No reasoning provided",
            matchScore: updated.matchScore || updated.photo?.matchScore || 0,
          };
        }
        return existing;
      });
    });

    // Update candidate photos to reflect the new reasoning
    updateCandidatePhotos();
    iterationFinished.value = data.finished;
    console.log("✨ Photos enriched with insights");

    // Remove isNew flag after 3 seconds for photos that meet the rating criteria
    setTimeout(() => {
      removeNewFlagFromQualifyingPhotos();
    }, 3000);
  });

  socket.on("maxPageAttempts", () => {
    console.log("⚠️ Max page attempts reached");
    maxPageAttempts.value = true;
    isSearching.value = false;

    isLoadingMore.value = false;

    // Show notification asking if user wants to continue searching
    showMaxPageAttemptsNotification();
  });

  socketListenersRegistered = true;
};

const updateCandidatePhotos = () => {
  const keys = Object.keys(iterationsRecord.value)
    .map(Number)
    .sort((a, b) => a - b);

  let allPhotos = [];
  for (let i = 0; i < currentIteration.value; i++) {
    const k = keys[i];
    if (k !== undefined && iterationsRecord.value[k]?.photos) {
      // Insert new photos at the beginning so newest are on top
      allPhotos.unshift(...iterationsRecord.value[k].photos);
    }
  }

  // Filtrar las fotos que ya están en curatedPhotos
  const curatedIds = new Set(curatedPhotos.value.map((p) => p.id));
  const filteredPhotos = allPhotos.filter((photo) => !curatedIds.has(photo.id));

  // Assign original indices to maintain position when photos are moved back
  filteredPhotos.forEach((photo, index) => {
    if (photo.originalIndex === undefined) {
      photo.originalIndex = index;
    }
  });

  candidatePhotos.value = filteredPhotos;
};

const removeNewFlagFromQualifyingPhotos = () => {
  // Remove photos from newly arrived set after timeout
  const photosToRemove = Array.from(newlyArrivedPhotos.value);
  photosToRemove.forEach((photoId) => {
    newlyArrivedPhotos.value.delete(photoId);
  });
};

// Methods
const onSearchChange = (value) => {
  // Trigger warm up cuando el usuario empieza a escribir en input vacío
  if (value && value.length === 1 && !userStore.usageLimits.search?.exceeded) {
    ensureWarmUp("logic_gpu");
  }
  console.log("Search query changed:", searchQuery.value);
};

const showMaxPageAttemptsNotification = () => {
  // Calcular cuántas fotos válidas tenemos actualmente
  const currentValidPhotos = candidatePhotos.value.filter(
    (photo) => photo.matchScore >= minMatchScore.value
  ).length;

  notification.warning({
    title: "Search Limit Reached",
    content: `After several iterations, no more photos were found. We suggest lowering the minimum score.`,
    action: () => {
      return h("div", { style: "display: flex; gap: 8px; margin-top: 8px;" }, [
        h(
          "button",
          {
            style:
              "padding: 4px 12px; background: #18a058; color: white; border: none; border-radius: 4px; cursor: pointer;",
            onClick: () => {
              searchPhotosApi(false);
              notification.destroyAll();
            },
          },
          "Continue"
        ),
        h(
          "button",
          {
            style:
              "padding: 4px 12px; background: #d03050; color: white; border: none; border-radius: 4px; cursor: pointer;",
            onClick: () => {
              minMatchScore.value = Math.max(1, minMatchScore.value - 1);
              searchPhotosApi(false);
              notification.destroyAll();
            },
          },
          "Reduce score"
        ),
      ]);
    },
    duration: 0, // Keep notification until user responds
    closable: true,
  });
};

// Shared API call for searching photos
const searchPhotosApi = async (isInitial = false) => {
  if (!hasSearchQuery.value) return;

  maxPageAttempts.value = false;
  iterationFinished.value = false;
  if (isInitial) {
    isSearching.value = true;
    candidatePhotos.value = [];
    iterationsRecord.value = {};
    currentIteration.value = 1;
    hasMoreResults.value = true;
    newlyArrivedPhotos.value.clear(); // Clear newly arrived photos set
    lastCursor.value = null; // Reset cursor for new search
    console.log("Performing curation search:", searchQuery.value);
  } else {
    isLoadingMore.value = true;
  }

  try {
    const payload = {
      description: searchQuery.value,
      options: {
        iteration: currentIteration.value,
        pageSize: 6,
        searchMode: "curation",
        minMatchScore: minMatchScore.value,
        minResults: minResults.value,
        cursor: lastCursor.value, // Add cursor for pagination
      },
    };
    await api.post("/api/search/semantic/stream", payload);
  } catch (error) {
    if (isInitial) {
      console.error("❌ Error performing curation search:", error);
      isSearching.value = false;
    } else {
      console.error("❌ Error loading more photos:", error);
      isLoadingMore.value = false;
    }
  }
};

const performSearch = async () => {
  await searchPhotosApi(true);
};

const searchMorePhotos = async () => {
  if (isLoadingMore.value || !hasMoreResults.value || !hasSearchQuery.value)
    return;
  await searchPhotosApi(false);
};

const clearSearch = () => {
  searchQuery.value = "";
  candidatePhotos.value = [];
  curatedPhotos.value = [];
  iterationsRecord.value = {};
  currentIteration.value = 1;
  hasMoreResults.value = true;
  iterationFinished.value = false;
  newlyArrivedPhotos.value.clear(); // Clear newly arrived photos set
  lastCursor.value = null; // Reset cursor for new search

  maxPageAttempts.value = false;
  minResults.value = 1; // Reset to default
};
const clearSelection = () => {
  // Move all curated photos back to candidates, restoring original positions
  const photosToRestore = [...curatedPhotos.value];
  curatedPhotos.value = [];

  // Remove any returned photos from newly arrived set
  photosToRestore.forEach((photo) => {
    newlyArrivedPhotos.value.delete(photo.id);
  });

  // Sort by original index to restore proper order
  photosToRestore.sort((a, b) => {
    const indexA = a.originalIndex ?? Infinity;
    const indexB = b.originalIndex ?? Infinity;
    return indexA - indexB;
  });

  // Insert each photo at its original position
  photosToRestore.forEach((photo) => {
    if (typeof photo.originalIndex === "number" && photo.originalIndex >= 0) {
      const targetIndex = Math.min(
        photo.originalIndex,
        candidatePhotos.value.length
      );
      candidatePhotos.value.splice(targetIndex, 0, {
        ...photo,
        isNew: false, // Remove new flag when returning photos
      });
    } else {
      candidatePhotos.value.unshift({
        ...photo,
        isNew: false, // Remove new flag when returning photos
      });
    }
  });
};

const moveToSelection = (photoId) => {
  const photoIndex = candidatePhotos.value.findIndex((p) => p.id === photoId);
  if (photoIndex === -1) return;

  const photo = candidatePhotos.value[photoIndex];

  // Store the original index to restore position later
  photo.originalIndex = photoIndex;

  candidatePhotos.value.splice(photoIndex, 1);

  // Remove from newly arrived photos set when moving to selection
  newlyArrivedPhotos.value.delete(photoId);

  // Add to curated at the beginning (most recent first)
  curatedPhotos.value.unshift({
    ...photo,
    isNew: false, // Remove new flag when moving to selection
  });
};

const moveToCuration = (photoId) => {
  const photoIndex = curatedPhotos.value.findIndex((p) => p.id === photoId);
  if (photoIndex === -1) return;

  const photo = curatedPhotos.value[photoIndex];
  curatedPhotos.value.splice(photoIndex, 1);

  // Don't add back to newly arrived photos set when returning from selection

  // Restore to original position if available, otherwise add to beginning
  if (typeof photo.originalIndex === "number" && photo.originalIndex >= 0) {
    const targetIndex = Math.min(
      photo.originalIndex,
      candidatePhotos.value.length
    );
    candidatePhotos.value.splice(targetIndex, 0, {
      ...photo,
      isNew: false, // Remove new flag when returning to curation
    });
  } else {
    candidatePhotos.value.unshift({
      ...photo,
      isNew: false, // Remove new flag when returning to curation
    });
  }
};

const togglePhotoSelection = (photoId) => {
  console.log("Photo selection toggled:", photoId);
};

const showPhotoInfo = (photo) => {
  console.log("Show photo info:", photo);
};

const onRatingChange = (rating) => {
  // Reset cursor when filter changes to avoid pagination issues
  if (minMatchScore.value !== rating && candidatePhotos.value.length > 0) {
    lastCursor.value = null;
  }

  minMatchScore.value = rating;
  console.log("Min rating filter set to:", minMatchScore.value);

  // If we have candidate photos, show how many are filtered
  if (candidatePhotos.value.length > 0) {
    const filteredCount = filteredCandidatePhotos.value.length;
    console.log(
      `Showing ${filteredCount} of ${candidatePhotos.value.length} photos`
    );
  }
};

const onResultsChange = (results) => {
  // Reset cursor when filter changes to avoid pagination issues
  if (minResults.value !== results && candidatePhotos.value.length > 0) {
    lastCursor.value = null;
  }

  minResults.value = results;
  console.log("Min results filter set to:", minResults.value);
};

// Collection modal functions
const handleAddToCollection = () => {
  showCollectionModal.value = true;
};

const cancelCollectionModal = () => {
  showCollectionModal.value = false;
};

const handleCollectionAdded = (data) => {
  showCollectionModal.value = false;
};

// Lifecycle hooks
onMounted(() => {
  // Initialize warm-up
  ensureWarmUp("logic_gpu");

  // Register socket listeners when user is available
  if (userStore.user?.id) {
    registerSocketListeners();
  }
});

onUnmounted(() => {
  // Clean up socket listeners
  socket.off("curation-matches");
  socket.off("insights");
  socket.off("maxPageAttempts");
});

// Watch for user changes to register socket listeners
watch(
  () => userStore.user?.id,
  (userId) => {
    if (userId) {
      registerSocketListeners();
    }
  },
  { immediate: true }
);

// Query examples functionality
const searchType = ref("curation");

function handleCurationExampleClick(example, exampleText, searchType) {
  if (searchType === "curation") {
    searchQuery.value = exampleText;
    performSearch();
  }
}

const {
  exampleIndex,
  isSliding,
  currentExamples,
  currentExampleText,
  handleExampleClick,
} = useQueryExamples(searchType, ref("strict"), handleCurationExampleClick);
</script>

<style scoped>
.curation-container {
  display: flex;
  flex-direction: column;
}

.search-section {
  background-color: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  margin-bottom: var(--spacing-lg);
}

.search-input-row {
  display: flex;
  gap: var(--spacing-lg);
  align-items: flex-start;
}

.search-input {
  font-size: var(--font-size-md);
  flex: 1;
}

.search-actions {
  display: flex;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

.search-button {
  min-width: 140px;
  height: 40px;
}

.clear-button {
  min-width: 80px;
  height: 40px;
}

.curation-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-2xl);
  min-height: 0; /* Allow grid items to shrink */
}

.curation-area,
.selection-area {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.area-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-2xl);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-surface);
  min-height: 40px;
}

.filters-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xl);
}

.star-filter,
.results-filter {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.results-select {
  min-width: 60px;
}

.area-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.star-filter {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.filter-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
}

.star-rating {
  font-size: 16px;
}

.star-rating :deep(.n-rate__item) {
  margin-right: 2px;
}

.star-rating :deep(.n-rate__item .n-icon) {
  color: #fbbf24;
}

.star-buttons {
  display: flex;
  gap: var(--spacing-xs);
}

.area-stats {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.stats-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.clear-selection-button {
  font-size: var(--font-size-xs);
}

.photos-grid {
  flex: 1;
  display: grid !important;
  grid-template-columns: repeat(3, 1fr) !important;
  grid-auto-rows: max-content !important;
  gap: var(--spacing-lg) !important;
  padding: 12px;
  overflow-y: auto;
  align-content: start;
  place-items: start;
  background-color: var(--bg-container);
}

.photos-grid > * {
  width: 100%;
  box-sizing: border-box;
}

.empty-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl);
  text-align: center;
}

.empty-text {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin: var(--spacing-md) 0 0 0;
}

.empty-subtitle {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin: var(--spacing-xs) 0 0 0;
}

.area-actions {
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-surface);
  display: flex;
  justify-content: center;
  gap: 24px;
}

.search-more-button {
  min-width: 160px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-6xl);
}

.empty-content {
  text-align: center;
  max-width: 600px;
}

.empty-icon {
  margin-bottom: var(--spacing-lg);
}

.empty-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 0 0;
}

.empty-description {
  font-size: var(--font-size-md);
  color: var(--text-primary);
  margin-top: 10px;
  margin-bottom: 5px;
  line-height: var(--line-height-relaxed);
}

.instructions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  /* background-color: rgba(107, 114, 128, 0.05); */
  border-radius: var(--radius-md);
  /* border: 1px solid rgba(107, 114, 128, 0.1); */
  margin-bottom: var(--spacing-lg);
  align-content: center;
  justify-content: center;
  align-items: center;
}

.instruction-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.photo-skeleton {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-surface);
}

.usage-limit-warning {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.warning-icon {
  color: #f59e0b;
  flex-shrink: 0;
}

.warning-text {
  color: #f59e0b;
  white-space: nowrap;
}

.info-icon {
  color: #f59e0b;
  opacity: 0.8;
  cursor: help;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .curation-main {
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
  }

  .photos-grid {
    grid-template-columns: repeat(3, 1fr) !important;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
  }
}

@media (max-width: 768px) {
  .curation-container {
    padding: var(--spacing-lg);
  }

  .search-section {
    padding: var(--spacing-lg);
    margin-bottom: var(--spacing-lg);
  }

  .search-input-row {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .search-actions {
    width: 100%;
  }

  .search-button {
    flex: 1;
  }

  .area-header {
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    padding: var(--spacing-md);
  }

  .area-actions {
    padding: var(--spacing-md) var(--spacing-lg);
  }
}

@media (max-width: 480px) {
  .curation-container {
    padding: var(--spacing-md);
  }

  .search-section {
    padding: var(--spacing-md);
  }

  .area-header {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .filters-row {
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .results-filter {
    flex-direction: column;
    align-items: flex-end;
    gap: var(--spacing-xs);
  }

  .star-filter {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }

  .area-stats {
    justify-content: space-between;
  }

  .photos-grid {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
  }

  .empty-area {
    padding: var(--spacing-2xl);
  }

  .loading-content {
    padding: var(--spacing-2xl);
    margin: var(--spacing-md);
  }
}

/* Search Examples Styles */
.search-examples {
  text-align: left;
  margin-top: var(--spacing-xl);
}

.examples-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-lg) 0;
  text-align: center;
}

.examples-carousel {
  /* display: flex
; */
  justify-content: center;
  /* width: 100%; */
  padding: var(--spacing-sm) 0;
  background-color: rgba(107, 114, 128, 0.05);
  border-radius: var(--radius-md);
  border: 1px solid rgba(107, 114, 128, 0.1);
  padding: var(--spacing-lg);
  align-content: center;
  align-items: center;
}

.carousel-container {
  width: 100%;
  max-width: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-item {
  width: 100%;
  opacity: 1;
  transform: translateX(0);
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.carousel-item.sliding {
  opacity: 0;
  transform: translateX(-80px);
}

.example-card {
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
}

.example-card:hover .example-text {
  color: #2563eb;
  transform: scale(1.02);
}

.example-text {
  font-size: 16px;
  color: var(--text-primary);
  line-height: 1.4;
  text-align: center;
  font-style: italic;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
