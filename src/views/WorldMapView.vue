<template>
  <div class="world-map-view">
    <n-button
      v-if="photosWithGps.length > 0 && !isAiLocationButtonDisabled"
      class="ai-location-button"
      type="info"
      @click="openAiLocationDialog"
    >
      <template #icon>
        <n-icon :component="SparklesOutline" />
      </template>
      AI locate
    </n-button>

    <!-- No GPS photos message -->
    <div v-if="!hasLoadedInitialPhotos" class="map-loading-state" />

    <div
      v-else-if="photosWithGps.length === 0 && !isAiLocationRunning"
      class="no-gps-message"
    >
      <div class="no-gps-content">
        <n-icon
          :size="64"
          color="#6b7280"
          class="no-gps-icon"
          :component="EarthOutline"
        />
        <h2 class="no-gps-title">Your map is empty</h2>
        <p class="no-gps-description">
          Upload photos with GPS metadata and watch your map come to life.
        </p>
        <div class="no-gps-instructions">
          <div class="no-gps-instruction-item">
            <n-icon><CameraOutline /></n-icon>
            <span
              >Enable <strong>location services</strong> on your camera or phone
              before shooting.</span
            >
          </div>
          <div class="no-gps-instruction-item">
            <n-icon><NavigateOutline /></n-icon>
            <span
              >Photos with <strong>EXIF GPS data</strong> are automatically
              placed on the map.</span
            >
          </div>
          <!-- <div class="no-gps-instruction-item">
            <n-icon><ImagesOutline /></n-icon>
            <span
              >Explore <strong>clusters and patterns</strong> to discover where
              you shoot the most.</span
            >
          </div> -->
        </div>

        <div class="no-gps-ai-cta">
          <p class="no-gps-ai-label">
            Already uploaded photos? Let AI find where they were taken.
          </p>
          <n-button
            type="info"
            :disabled="isAiLocationButtonDisabled"
            :loading="isAiLocationRunning"
            @click="openAiLocationDialog"
          >
            <template #icon>
              <n-icon :component="SparklesOutline" />
            </template>
            AI locate photos
          </n-button>
        </div>
      </div>
    </div>

    <!-- Map container -->
    <div
      v-else
      ref="mapContainer"
      :class="[
        'map-container',
        { 'map-container--pending': !isMapViewportReady },
        { 'map-container--rect-selecting': isRectSelecting },
      ]"
    >
      <!-- Rect-select capture layer: blocks Leaflet events when Ctrl/Cmd is held -->
      <div
        class="map-rect-select-layer"
        :class="{ 'map-rect-select-layer--active': ctrlKeyHeld }"
        @mousedown.prevent="handleRectLayerMouseDown"
      />

      <!-- Rect-select visual overlay -->
      <div
        v-if="isRectSelecting"
        class="map-rect-select-overlay"
        :style="rectSelectStyle"
      />

      <l-map
        ref="map"
        :bounds="initialMapBounds || undefined"
        :center="initialMapBounds ? undefined : [20, 0]"
        :zoom="initialMapBounds ? undefined : 2"
        :options="{ zoomControl: false }"
        @ready="onMapReady"
        style="height: 100%; width: 100%"
      >
        <!-- Layer control -->
        <LControlLayers position="bottomleft" />

        <!-- Base layer: OpenStreetMap -->
        <LTileLayer
          name="OpenStreetMap"
          layer-type="base"
          :visible="false"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
          :maxZoom="18"
        />

        <!-- Base layer: Esri Satellite -->
        <LTileLayer
          name="Satélite (Esri)"
          layer-type="base"
          :visible="true"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="© Esri, Maxar, Earthstar Geographics"
          :maxZoom="18"
        />
      </l-map>
    </div>

    <!-- Map config panel (Filters) -->
    <WorldMapConfigPanel
      v-if="photosWithGps.length > 0"
      v-model:confidence-filter="confidenceFilter"
      v-model:granularity-filter="granularityFilter"
      v-model:selected-visual-aspects="selectedVisualAspects"
      v-model:artistic-score-filters="artisticScoreFilters"
      v-model:time-range-filter="timeRangeFilter"
      :processed-photos="photosWithGps"
    />

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      @change-photo="selectedDialogPhoto = $event"
    />

    <PhotosDialog
      v-model="showLocationPhotosDialog"
      title="Photos at this location"
      selection-only
      show-info-button
      :display-search="false"
      :suggested-photos="locationDialogPhotos"
      suggested-photos-singular-label="photo"
      suggested-photos-plural-label="photos"
      @selection-change="handleLocationSelectionChange"
      @photo-info="handleLocationPhotoInfo"
    />

    <!-- Floating Action Bar for map-location selections -->
    <FloatingActionBar
      :selected-ids="locationSelectedIds"
      :top-position="20"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :show-send-to-chat="true"
      :is-downloading="isDownloading"
      @clear-selection="locationClearAllSelections"
      @download="handleLocationDownload"
      @add-to-collection="handleLocationAddToCollection"
      @move-to-tool="openToolSelector"
      @send-to-chat="handleLocationSendToChat"
    />

    <CollectionModal
      :show="showLocationCollectionModal"
      :photo-count="locationSelectedIds.length"
      :photo-ids="locationSelectedIds"
      @add-to-collection="handleLocationCollectionAdded"
      @add-to-series="handleLocationCollectionAdded"
      @cancel="showLocationCollectionModal = false"
    />

    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="locationSelectedIds.length"
      :is-processing="isProcessingTool"
      @tool-selected="handleLocationToolSelected"
      @close="closeToolSelector"
    />

    <AiLocationModal
      v-model:show="showAiLocationDialog"
      :photos-without-location="backendPhotosWithoutLocation"
      :estimated-credits="estimatedAiLocationCredits"
      :status="aiLocationStatus"
      :is-starting="isStartingAiLocation"
      :forecast="aiLocationForecast"
      @start="startAiLocationInference"
    />

    <!-- Single-marker hover tooltip -->
    <div
      v-if="hoveredMapPhoto"
      class="map-photo-tooltip"
      :style="{
        left: mapTooltipPosition.x + 'px',
        top: mapTooltipPosition.y + 'px',
      }"
    >
      <img
        v-if="getPhotoThumbnail(hoveredMapPhoto)"
        :src="getPhotoThumbnail(hoveredMapPhoto)"
        class="map-tooltip-image"
        alt=""
      />
      <div v-if="getPhotoAddress(hoveredMapPhoto)" class="map-tooltip-footer">
        {{ getPhotoAddress(hoveredMapPhoto) }}
      </div>
    </div>

    <!-- Location correction popup -->
    <LocationCorrectionPopup
      v-model:show="showCorrectionPopup"
      :photo-id="correctionPhoto?.id ?? null"
      :photo-name="correctionPhoto ? getPhotoTitle(correctionPhoto) : ''"
      :photo-thumbnail="
        correctionPhoto ? getPhotoThumbnail(correctionPhoto) : null
      "
      :current-address="
        correctionPhoto ? getPhotoAddress(correctionPhoto) : null
      "
      @confirmed="handleCorrectionConfirmed"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
} from "vue";
import { usePhotosStore } from "@/stores/photos";
import { useUserStore } from "@/stores/userStore";
import { api } from "@/utils/axios";
import { useMessage } from "naive-ui";
import {
  EarthOutline,
  CameraOutline,
  NavigateOutline,
  SparklesOutline,
} from "@vicons/ionicons5";
import WorldMapConfigPanel from "@/components/world-map/WorldMapConfigPanel.vue";
import { visualAspectsOptions } from "@/stores/searchStore.js";
import LocationCorrectionPopup from "@/components/world-map/LocationCorrectionPopup.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import PhotosDialog from "@/components/PhotosDialog.vue";
import AiLocationModal from "@/components/world-map/AiLocationModal.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import type {
  AiLocationJobStatus,
  GeolocatabilityForecast,
} from "@/components/world-map/AiLocationModal.vue";
import { LMap, LTileLayer, LControlLayers } from "@vue-leaflet/vue-leaflet";
import { useIsMobile } from "@/composables/useIsMobile.js";

import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

type GpsCoordinates = [number, number];
const MAX_SPIDERFY_MARKERS_PER_POINT = 42;
const VISIBLE_PHOTOS_PER_OVERFLOW_POINT = MAX_SPIDERFY_MARKERS_PER_POINT - 1;

interface PhotoWithGps {
  id: string | number;
  coordinates: GpsCoordinates;
  descriptions?: any;
  filename?: string;
  name?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  url?: string;
  [key: string]: any;
}

type PhotoMarker = L.Marker & {
  photo: PhotoWithGps;
  photoCount?: number;
};

type PhotoOverflowMarker = L.Marker & {
  photos: PhotoWithGps[];
  photoCount: number;
};

type MapPhotoMarker = PhotoMarker | PhotoOverflowMarker;

const photosStore = usePhotosStore();
const userStore = useUserStore();
const message = useMessage();
const mapContainer = ref<HTMLElement | null>(null);
const map = ref<any>(null);
const markerClusterLayer = shallowRef<L.MarkerClusterGroup | null>(null);
// Keeps live marker instances so filter changes can diff instead of clear+rebuild,
// preventing thumbnail <img> DOM elements from being destroyed and reloaded.
const photoMarkerMap = new Map<string | number, PhotoMarker>();
const overflowMarkerMap = new Map<string, PhotoOverflowMarker>(); // key = coordKey
const hasLoadedInitialPhotos = ref(false);
const initialMapBounds = ref<GpsCoordinates[] | null>(null);
const isMapViewportReady = ref(false);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref<any>(null);
const showLocationPhotosDialog = ref(false);
const locationDialogPhotos = ref<PhotoWithGps[]>([]);
const showAiLocationDialog = ref(false);
const showLocationCollectionModal = ref(false);

// Local photo selection for map-location dialog
const {
  selectedPhotoIds: locationSelectedIds,
  selectAllPhotos: locationSelectAllPhotos,
  clearAllSelections: locationClearAllSelections,
} = useLocalPhotoSelection();

// Download composable
const { downloadPhotosZip, isDownloading } = usePhotoDownload();

// Tool selection composable
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  takeToChat,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();
const isFinalizingAiLocation = ref(false);
const isStartingAiLocation = ref(false);
const aiLocationStatus = ref<AiLocationJobStatus | null>(null);
const aiLocationSummaryCount = ref<number | null>(null);
const aiLocationEstimatedCredits = ref<number | null>(null);
const aiLocationForecast = ref<GeolocatabilityForecast | null>(null);
let resizeObserver: ResizeObserver | null = null;
let aiLocationPollTimer: ReturnType<typeof window.setInterval> | null = null;
const { isMobile } = useIsMobile();

// Photo IDs that were newly geo-inferred in the last completed AI location job.
// Cleared when a filter is applied or on the next visit (component remount).
const newlyLocatedPhotoIds = ref<Set<string | number>>(new Set());
// Photo IDs whose location was manually corrected (triggers a brief pulse animation).
const correctedPhotoIds = ref<Set<string | number>>(new Set());
const hoveredMapPhoto = ref<PhotoWithGps | null>(null);
const mapTooltipPosition = ref({ x: 0, y: 0 });

// Location correction popup state
const showCorrectionPopup = ref(false);
const correctionPhoto = ref<PhotoWithGps | null>(null);

// Rect-select state (Ctrl/Cmd + drag over the map)
const ctrlKeyHeld = ref(false);
const isRectSelecting = ref(false);
const rectSelectStart = ref({ x: 0, y: 0 });
const rectSelectEnd = ref({ x: 0, y: 0 });

const rectSelectStyle = computed(() => {
  const x1 = Math.min(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y1 = Math.min(rectSelectStart.value.y, rectSelectEnd.value.y);
  const x2 = Math.max(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y2 = Math.max(rectSelectStart.value.y, rectSelectEnd.value.y);
  return {
    left: x1 + "px",
    top: y1 + "px",
    width: x2 - x1 + "px",
    height: y2 - y1 + "px",
  };
});

function handleRectKeyDown(e: KeyboardEvent) {
  if (e.key === "Control" || e.key === "Meta") ctrlKeyHeld.value = true;
}

function handleRectKeyUp(e: KeyboardEvent) {
  if (e.key === "Control" || e.key === "Meta") {
    ctrlKeyHeld.value = false;
    if (isRectSelecting.value) {
      isRectSelecting.value = false;
    }
  }
}

function handleRectLayerMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  const rect = mapContainer.value?.getBoundingClientRect();
  if (!rect) return;
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  isRectSelecting.value = true;
  rectSelectStart.value = { x, y };
  rectSelectEnd.value = { x, y };
  window.addEventListener("mousemove", handleRectWindowMouseMove);
  window.addEventListener("mouseup", handleRectWindowMouseUp);
}

function handleRectWindowMouseMove(e: MouseEvent) {
  if (!isRectSelecting.value) return;
  const rect = mapContainer.value?.getBoundingClientRect();
  if (!rect) return;
  rectSelectEnd.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function handleRectWindowMouseUp() {
  window.removeEventListener("mousemove", handleRectWindowMouseMove);
  window.removeEventListener("mouseup", handleRectWindowMouseUp);
  if (isRectSelecting.value) {
    commitMapRectSelection();
    isRectSelecting.value = false;
  }
}

function commitMapRectSelection() {
  const leafletMap = getLeafletMap();
  if (!leafletMap) return;

  const x1s = Math.min(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y1s = Math.min(rectSelectStart.value.y, rectSelectEnd.value.y);
  const x2s = Math.max(rectSelectStart.value.x, rectSelectEnd.value.x);
  const y2s = Math.max(rectSelectStart.value.y, rectSelectEnd.value.y);

  // Ignore accidental tiny rects
  if (x2s - x1s < 5 && y2s - y1s < 5) return;

  // Convert screen corners to geographic coordinates
  const topLeft = leafletMap.containerPointToLatLng(L.point(x1s, y1s));
  const bottomRight = leafletMap.containerPointToLatLng(L.point(x2s, y2s));

  const latMin = Math.min(topLeft.lat, bottomRight.lat);
  const latMax = Math.max(topLeft.lat, bottomRight.lat);
  const lngMin = Math.min(topLeft.lng, bottomRight.lng);
  const lngMax = Math.max(topLeft.lng, bottomRight.lng);

  const selectedIds = filteredPhotosWithGps.value
    .filter((photo) => {
      const [lat, lng] = photo.coordinates;
      return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
    })
    .map((photo) => photo.id);

  if (selectedIds.length === 0) return;

  locationClearAllSelections();
  locationSelectAllPhotos(selectedIds);
  nextTick(() => updateMarkerSelectionState());
}

// Map filter panel state
type ConfidenceLevel = "gps" | "very_likely" | "likely" | "uncertain";
type GranularityLevel = "place" | "city" | "region" | "country";
type ConfidenceFilter = ConfidenceLevel[];
type GranularityFilter = GranularityLevel[];
const confidenceFilter = ref<ConfidenceFilter>([
  "gps",
  "very_likely",
  "likely",
]);
const granularityFilter = ref<GranularityFilter>(["place", "city"]);

// Search filters (visual aspects, artistic scores, time range)
const selectedVisualAspects = ref<string[]>([]);
const artisticScoreFilters = ref<Record<string, any>>({});
const timeRangeFilter = ref<[number, number] | null>(null);

// Visual aspects category map for fast lookup during filtering
const visualAspectCategoryMap = (() => {
  const map = new Map<string, string>();
  visualAspectsOptions.forEach((group: any) => {
    group.children.forEach((child: any) => {
      map.set(child.value, group.key);
    });
  });
  return map;
})();

// Function to convert GPS array format to decimal degrees
function convertGpsArrayToDecimal(gpsArray: number[]): number {
  if (!gpsArray || gpsArray.length !== 3) return 0;
  const [degrees, minutes, seconds] = gpsArray;
  return degrees + minutes / 60 + seconds / 3600;
}

function applyGpsReference(value: number, reference?: string): number {
  if (reference === "S" || reference === "W") {
    return -Math.abs(value);
  }

  return value;
}

// Function to extract GPS coordinates from photo
function extractGpsCoordinates(photo: any): GpsCoordinates | null {
  const exif = photo.descriptions?.EXIF;
  if (!exif) return null;

  let lat: number | null = null;
  let lng: number | null = null;

  // Format 1: Direct decimal coordinates
  if (exif.gpsLatitude !== undefined && exif.gpsLongitude !== undefined) {
    lat = applyGpsReference(exif.gpsLatitude, exif.gpsLatitudeRef);
    lng = applyGpsReference(exif.gpsLongitude, exif.gpsLongitudeRef);
  }
  // Format 2: gps compact object {lat, lng} — values are already signed decimals
  // (produced by getCompactExifSummary). convertGpsArrayToDecimal must NOT be
  // called here; those values are numbers, not DMS arrays.
  else if (exif.gps?.lat != null && exif.gps?.lng != null) {
    const rawLat = Array.isArray(exif.gps.lat)
      ? convertGpsArrayToDecimal(exif.gps.lat)
      : Number(exif.gps.lat);
    const rawLng = Array.isArray(exif.gps.lng)
      ? convertGpsArrayToDecimal(exif.gps.lng)
      : Number(exif.gps.lng);
    // Apply ref only when explicitly present (legacy array-format gps objects)
    lat = exif.gps.latRef ? applyGpsReference(rawLat, exif.gps.latRef) : rawLat;
    lng = exif.gps.lngRef ? applyGpsReference(rawLng, exif.gps.lngRef) : rawLng;
  }

  // Validate coordinates
  if (
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return [lat, lng];
  }

  return null;
}

// Computed: Photos with GPS coordinates
const photosWithGps = computed<PhotoWithGps[]>(() => {
  const allPhotos: any[] = photosStore.allPhotos || [];
  return allPhotos
    .map((photo: any): PhotoWithGps | null => {
      const coordinates = extractGpsCoordinates(photo);
      if (coordinates) {
        return {
          ...photo,
          coordinates,
        };
      }
      return null;
    })
    .filter((photo): photo is PhotoWithGps => photo !== null);
});

const photosWithoutGps = computed(() => {
  const allPhotos: any[] = photosStore.allPhotos || [];
  return allPhotos.filter((photo) => !extractGpsCoordinates(photo));
});

// Filtered view of photosWithGps based on confidence + granularity filters
const filteredPhotosWithGps = computed<PhotoWithGps[]>(() => {
  return photosWithGps.value.filter((photo) => {
    const exif = (photo.descriptions?.EXIF ?? {}) as Record<string, any>;
    const aiInference = exif.aiLocationInference ?? null;
    const isRealGps = !aiInference;
    const reliability: string | null = aiInference?.reliability ?? null;
    const granularity: string | null = aiInference?.geocodeGranularity ?? null;

    // --- Confidence filter (multi-select: photo passes if it matches any selected tier) ---
    if (isRealGps) {
      if (!confidenceFilter.value.includes("gps")) return false;
    } else {
      const matchesConfidence =
        (reliability === "very_likely" &&
          confidenceFilter.value.includes("very_likely")) ||
        (reliability === "likely" &&
          confidenceFilter.value.includes("likely")) ||
        (reliability === "uncertain" &&
          confidenceFilter.value.includes("uncertain"));
      if (!matchesConfidence) return false;
    }

    // --- Granularity filter (real GPS and proximity-located photos always pass) ---
    if (!isRealGps && granularity !== null) {
      const matchesGranularity = granularityFilter.value.includes(
        granularity as GranularityLevel,
      );
      if (!matchesGranularity) return false;
    }

    // --- Visual aspects filter ---
    if (selectedVisualAspects.value.length > 0) {
      const visualAspects = photo.descriptions?.visual_aspects;
      if (!visualAspects) return false;
      if (Array.isArray(visualAspects)) {
        if (!selectedVisualAspects.value.some((a) => visualAspects.includes(a)))
          return false;
      } else if (typeof visualAspects === "object") {
        const selectedByCategory = new Map<string, string[]>();
        selectedVisualAspects.value.forEach((aspect) => {
          const category = visualAspectCategoryMap.get(aspect);
          if (!category) return;
          if (!selectedByCategory.has(category))
            selectedByCategory.set(category, []);
          selectedByCategory.get(category)!.push(aspect);
        });
        if (selectedByCategory.size === 0) return false;
        const passes = Array.from(selectedByCategory.entries()).every(
          ([category, aspects]) => {
            const photoAspects = (visualAspects as any)[category];
            return (
              Array.isArray(photoAspects) &&
              aspects.some((a) => photoAspects.includes(a))
            );
          },
        );
        if (!passes) return false;
      } else {
        return false;
      }
    }

    // --- Artistic score filters ---
    if (Object.keys(artisticScoreFilters.value).length > 0) {
      const scores = (photo.descriptions?.artistic_scores ?? {}) as Record<
        string,
        number
      >;
      const passes = Object.entries(artisticScoreFilters.value).every(
        ([key, filterVal]: [string, any]) => {
          const score = scores[key];
          if (score === undefined) return false;
          const value =
            typeof filterVal === "object" ? filterVal.value : filterVal;
          const operator =
            typeof filterVal === "object" ? (filterVal.operator ?? ">=") : ">=";
          return operator === ">=" ? score >= value : score <= value;
        },
      );
      if (!passes) return false;
    }

    // --- Time range filter ---
    if (timeRangeFilter.value !== null) {
      const [minDate, maxDate] = timeRangeFilter.value;
      const ts = new Date(
        photo.descriptions?.EXIF?.dateTaken ?? (photo as any).dateTaken,
      ).getTime();
      if (isNaN(ts) || ts < minDate || ts > maxDate) return false;
    }

    return true;
  });
});

const activeFiltersCount = computed(
  () => confidenceFilter.value.length + granularityFilter.value.length,
);

const backendPhotosWithoutLocation = computed(
  () => aiLocationSummaryCount.value ?? photosWithoutGps.value.length,
);

const estimatedAiLocationCredits = computed(
  () =>
    aiLocationEstimatedCredits.value ??
    Math.max(1, backendPhotosWithoutLocation.value),
);

const isAiLocationRunning = computed(
  () =>
    aiLocationStatus.value?.status === "running" ||
    isFinalizingAiLocation.value,
);

const isAiLocationButtonDisabled = computed(
  () => import.meta.env.VITE_AI_LOCATION_DISABLED === "true",
);

async function refreshAiLocationSummary() {
  const previousJob = aiLocationStatus.value;
  const wasRunning = previousJob?.status === "running";
  const params = previousJob?.jobId ? { jobId: previousJob.jobId } : undefined;

  try {
    const { data } = await api.get("/api/location-inference/summary", {
      params,
    });
    aiLocationSummaryCount.value = data.photosWithoutLocation ?? null;
    aiLocationEstimatedCredits.value = data.estimatedCredits ?? null;

    // Fetch forecast in parallel only when opening idle modal (not during polling)
    if (!wasRunning && data.job?.status !== "running") {
      api
        .get("/api/location-inference/assess")
        .then(({ data: f }) => {
          aiLocationForecast.value = f ?? null;
        })
        .catch(() => {
          aiLocationForecast.value = null;
        });
    }

    const newJob: AiLocationJobStatus | null = data.job ?? null;

    if (newJob?.status === "running") {
      const wasAlreadyRunning = aiLocationStatus.value?.status === "running";
      aiLocationStatus.value = newJob;
      startAiLocationPolling();
      // Re-open the progress modal when returning to the view mid-job
      if (!wasAlreadyRunning) {
        showAiLocationDialog.value = true;
      }
      return;
    }

    stopAiLocationPolling();

    // Helper: refresh photos, highlight new markers, show results modal
    async function finalizeCompletedJob(resolvedJob: AiLocationJobStatus) {
      isFinalizingAiLocation.value = true;
      try {
        const previousGpsIds = new Set(photosWithGps.value.map((p) => p.id));
        await photosStore.getOrFetch(true);
        const newIds = new Set<string | number>();
        photosWithGps.value.forEach((p) => {
          if (!previousGpsIds.has(p.id)) newIds.add(p.id);
        });
        newlyLocatedPhotoIds.value = newIds;
        await userStore.fetchUsage();
        await nextTick();
        refreshPhotoMarkers(true);
        getLeafletMap()?.invalidateSize();
        aiLocationStatus.value = resolvedJob;
        showAiLocationDialog.value = true;
        // Mark this job as handled so we don't show the modal again on re-visit
        sessionStorage.setItem("ai-location-handled-job", resolvedJob.jobId);
      } finally {
        isFinalizingAiLocation.value = false;
      }
    }

    if (wasRunning) {
      const resolvedJob: AiLocationJobStatus = newJob ?? {
        ...previousJob,
        status: "completed",
        processed: previousJob.total,
      };
      await finalizeCompletedJob(resolvedJob);
      return;
    }

    // Returning to the view after job completed while the user was away
    if (newJob?.status === "completed" && newJob.jobId) {
      const lastHandled = sessionStorage.getItem("ai-location-handled-job");
      if (lastHandled !== newJob.jobId) {
        await finalizeCompletedJob(newJob);
        return;
      }
    }

    aiLocationStatus.value = null;
  } catch (error) {
    console.warn("Error fetching AI location summary:", error);
  }
}

function startAiLocationPolling() {
  if (aiLocationPollTimer) return;
  aiLocationPollTimer = window.setInterval(refreshAiLocationSummary, 5000);
}

function stopAiLocationPolling() {
  if (!aiLocationPollTimer) return;
  window.clearInterval(aiLocationPollTimer);
  aiLocationPollTimer = null;
}

async function openAiLocationDialog() {
  if (aiLocationStatus.value?.status !== "running") {
    aiLocationStatus.value = null;
  }
  showAiLocationDialog.value = true;
  await refreshAiLocationSummary();
}

async function startAiLocationInference() {
  isStartingAiLocation.value = true;
  isFinalizingAiLocation.value = false;
  try {
    const { data } = await api.post("/api/location-inference/start");
    aiLocationStatus.value = data.job;
    await userStore.fetchUsage();
    startAiLocationPolling();
  } catch (error) {
    await refreshAiLocationSummary();
  } finally {
    isStartingAiLocation.value = false;
  }
}

function getLeafletMap(): L.Map | null {
  return map.value?.leafletObject ?? null;
}

function updateInitialMapBounds() {
  initialMapBounds.value = filteredPhotosWithGps.value.length
    ? filteredPhotosWithGps.value.map((photo) => photo.coordinates)
    : null;
  isMapViewportReady.value = photosWithGps.value.length === 0;
}

function getPhotoThumbnail(photo: PhotoWithGps): string {
  return (
    photo.thumbnailUrl ||
    photo.previewUrl ||
    photo.smallUrl ||
    photo.originalUrl ||
    photo.url ||
    ""
  );
}

function getPhotoTitle(photo: PhotoWithGps): string {
  return photo.title || photo.name || photo.filename || "Photo";
}

function getPhotoAddress(photo: PhotoWithGps): string | null {
  return (
    (photo.descriptions?.EXIF as any)?.aiLocationInference?.geocodeQuery ??
    (photo.descriptions?.EXIF as any)?.aiLocationInference?.formattedAddress ??
    null
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });
}

function createPhotoImageMarkup(photo: PhotoWithGps): string {
  const thumbnailUrl = getPhotoThumbnail(photo);

  if (!thumbnailUrl) {
    return '<span class="photo-map-fallback"></span>';
  }

  return `<img src="${escapeHtml(thumbnailUrl)}" alt="" loading="lazy" />`;
}

function getGranularityMarkerClass(photo: PhotoWithGps): string {
  const exif = (photo.descriptions?.EXIF ?? {}) as Record<string, any>;
  const granularity: string | null =
    exif.aiLocationInference?.geocodeGranularity ?? null;
  if (granularity === "place") return "photo-single-marker--place";
  if (granularity === "city") return "photo-single-marker--city";
  if (granularity === "region") return "photo-single-marker--region";
  if (granularity === "country") return "photo-single-marker--country";
  return "";
}

function createPhotoMarkerIcon(photo: PhotoWithGps): L.DivIcon {
  const isNew = newlyLocatedPhotoIds.value.has(photo.id);
  const isCorrected = correctedPhotoIds.value.has(photo.id);
  const granularityClass = getGranularityMarkerClass(photo);
  const classes = [
    "photo-single-marker",
    granularityClass,
    isNew ? "photo-single-marker--new" : "",
    isCorrected ? "photo-single-marker--corrected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return L.divIcon({
    className: "photo-map-div-icon photo-single-div-icon",
    html: `<div class="${classes}" aria-label="${escapeHtml(
      getPhotoTitle(photo),
    )}">${createPhotoImageMarkup(photo)}${isAiLocatedPhoto(photo) ? '<button class="photo-marker-correct-btn" title="Correct location" aria-label="Correct location"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg></button>' : ""}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createPhotoOverflowMarkerIcon(
  hiddenCount: number,
  totalCount: number,
): L.DivIcon {
  return L.divIcon({
    className: "photo-map-div-icon photo-overflow-div-icon",
    html: `<div class="photo-overflow-marker" aria-label="Open ${totalCount} photos at this location"><span>+</span><small>${hiddenCount}</small></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function getClusterIconSize(count: number): number {
  if (count >= 100) return 74;
  if (count >= 10) return 66;
  return 58;
}

function getMarkerPreviewPhoto(marker: MapPhotoMarker): PhotoWithGps | null {
  if ("photo" in marker) return marker.photo;
  return marker.photos[0] ?? null;
}

function getMarkerPhotoCount(marker: MapPhotoMarker): number {
  return marker.photoCount ?? 1;
}

function isNewMarker(marker: MapPhotoMarker): boolean {
  if ("photo" in marker) {
    return newlyLocatedPhotoIds.value.has(marker.photo.id);
  }

  return marker.photos.some((photo) =>
    newlyLocatedPhotoIds.value.has(photo.id),
  );
}

function isSelectedMarker(marker: MapPhotoMarker): boolean {
  const selectedIds = new Set(locationSelectedIds.value);
  if ("photo" in marker) {
    return selectedIds.has(marker.photo.id);
  }
  return marker.photos.some((photo) => selectedIds.has(photo.id));
}

function createClusterTileMarkup(markers: MapPhotoMarker[]): string {
  const photos = markers
    .slice(0, 4)
    .map(getMarkerPreviewPhoto)
    .filter((photo): photo is PhotoWithGps => photo !== null);
  const tileCount = Math.max(1, photos.length);

  return photos
    .map(
      (photo) =>
        `<span class="photo-cluster-tile tile-count-${tileCount}">${createPhotoImageMarkup(
          photo,
        )}</span>`,
    )
    .join("");
}

function createPhotoClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const markers = cluster.getAllChildMarkers() as MapPhotoMarker[];
  const count = markers.reduce(
    (total, marker) => total + getMarkerPhotoCount(marker),
    0,
  );
  const size = getClusterIconSize(count);
  const hasNew = markers.some(isNewMarker);
  const hasSelected = markers.some(isSelectedMarker);
  const badgeClass = [
    "photo-cluster-count",
    hasNew ? "photo-cluster-count--new" : "",
    hasSelected ? "photo-cluster-count--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mosaicClass = [
    "photo-cluster-mosaic",
    hasNew ? "photo-cluster-mosaic--new" : "",
    hasSelected ? "photo-cluster-mosaic--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return L.divIcon({
    className: "photo-map-div-icon photo-cluster-div-icon",
    html: `
      <div class="photo-cluster-marker" aria-label="${count} photos">
        <div class="${mosaicClass}">
          ${createClusterTileMarkup(markers)}
          ${hasSelected ? '<div class="photo-cluster-selection-overlay"></div>' : ""}
        </div>
        <span class="${badgeClass}">${count}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function getCoordinateKey(coordinates: GpsCoordinates): string {
  return `${coordinates[0].toFixed(6)},${coordinates[1].toFixed(6)}`;
}

function groupPhotosByCoordinate(photos: PhotoWithGps[]): PhotoWithGps[][] {
  const photosByCoordinate = new Map<string, PhotoWithGps[]>();

  photos.forEach((photo) => {
    const coordinateKey = getCoordinateKey(photo.coordinates);
    const coordinatePhotos = photosByCoordinate.get(coordinateKey) ?? [];
    coordinatePhotos.push(photo);
    photosByCoordinate.set(coordinateKey, coordinatePhotos);
  });

  return Array.from(photosByCoordinate.values());
}

function getClusterRadius(zoom: number): number {
  if (zoom >= 17) return 8;
  if (zoom >= 15) return 16;
  if (zoom >= 12) return 28;
  if (zoom >= 8) return 42;
  return 58;
}

function ensureMarkerClusterLayer(): L.MarkerClusterGroup | null {
  const leafletMap = getLeafletMap();
  if (!leafletMap) return null;

  if (!markerClusterLayer.value) {
    markerClusterLayer.value = L.markerClusterGroup({
      chunkedLoading: true,
      iconCreateFunction: createPhotoClusterIcon,
      maxClusterRadius: getClusterRadius,
      showCoverageOnHover: false,
      spiderLegPolylineOptions: {
        color: "#5a3a8a",
        opacity: 0.35,
        weight: 1.5,
      },
      spiderfyDistanceMultiplier: 1.3,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
    });

    leafletMap.addLayer(markerClusterLayer.value as unknown as L.Layer);
  }

  return markerClusterLayer.value;
}

function clearMarkerMaps() {
  photoMarkerMap.clear();
  overflowMarkerMap.clear();
}

/**
 * Toggle the --selected class on marker DOM elements to reflect the current
 * locationSelectedIds set without recreating any DOM or reloading images.
 * Cluster icons are refreshed via markerClusterGroup.refreshClusters() so
 * createPhotoClusterIcon can re-evaluate isSelectedMarker for each cluster.
 */
function updateMarkerSelectionState() {
  const selectedIds = new Set(locationSelectedIds.value);

  // Individual photo markers — direct DOM class toggle.
  photoMarkerMap.forEach((marker, id) => {
    const iconEl = (marker as any)._icon?.querySelector(
      ".photo-single-marker",
    ) as HTMLElement | null;
    if (!iconEl) return;
    iconEl.classList.toggle(
      "photo-single-marker--selected",
      selectedIds.has(id),
    );
  });

  // Overflow markers — toggle if any of their photos are selected.
  overflowMarkerMap.forEach((marker) => {
    const iconEl = (marker as any)._icon?.querySelector(
      ".photo-overflow-marker",
    ) as HTMLElement | null;
    if (!iconEl) return;
    const hasSelected = marker.photos.some((p) => selectedIds.has(p.id));
    iconEl.classList.toggle("photo-overflow-marker--selected", hasSelected);
  });

  // Cluster markers — force icon recreation so createPhotoClusterIcon can
  // read the updated selection state via isSelectedMarker.
  if (markerClusterLayer.value) {
    (markerClusterLayer.value as any).refreshClusters?.();
  }
}

/**
 * Update CSS classes on already-rendered marker elements to reflect the current
 * newlyLocatedPhotoIds / correctedPhotoIds state WITHOUT recreating any DOM or
 * reloading any image.  Only touches markers that are currently attached to the DOM.
 */
function updateExistingMarkerIcons() {
  photoMarkerMap.forEach((marker, id) => {
    const iconEl = (marker as any)._icon?.querySelector(
      ".photo-single-marker",
    ) as HTMLElement | null;
    if (!iconEl) return;
    const isNew = newlyLocatedPhotoIds.value.has(id);
    const isCorrected = correctedPhotoIds.value.has(id);
    iconEl.classList.toggle("photo-single-marker--new", isNew);
    iconEl.classList.toggle("photo-single-marker--corrected", isCorrected);
  });
}

function refreshPhotoMarkers(fullReset = false) {
  const clusterLayer = ensureMarkerClusterLayer();
  if (!clusterLayer) return;

  if (fullReset) {
    clusterLayer.clearLayers();
    clearMarkerMaps();
  }

  // Build the desired set of markers from the current filtered photos.
  const wantedPhotoIds = new Set<string | number>();
  const wantedOverflowKeys = new Set<string>();
  const wantedOverflowData = new Map<
    string,
    { photos: PhotoWithGps[]; hiddenCount: number }
  >();
  const photoById = new Map<string | number, PhotoWithGps>();
  filteredPhotosWithGps.value.forEach((p) => photoById.set(p.id, p));

  groupPhotosByCoordinate(filteredPhotosWithGps.value).forEach(
    (coordinatePhotos) => {
      const coordKey = getCoordinateKey(coordinatePhotos[0].coordinates);
      if (coordinatePhotos.length > MAX_SPIDERFY_MARKERS_PER_POINT) {
        const visiblePhotos = coordinatePhotos.slice(
          0,
          VISIBLE_PHOTOS_PER_OVERFLOW_POINT,
        );
        const hiddenCount = coordinatePhotos.length - visiblePhotos.length;
        visiblePhotos.forEach((p) => wantedPhotoIds.add(p.id));
        wantedOverflowKeys.add(coordKey);
        wantedOverflowData.set(coordKey, {
          photos: coordinatePhotos,
          hiddenCount,
        });
      } else {
        coordinatePhotos.forEach((p) => wantedPhotoIds.add(p.id));
      }
    },
  );

  const toRemove: L.Marker[] = [];
  const toAdd: L.Marker[] = [];

  // Remove photo markers that are no longer in the filtered set.
  photoMarkerMap.forEach((marker, id) => {
    if (!wantedPhotoIds.has(id)) {
      toRemove.push(marker);
      photoMarkerMap.delete(id);
    }
  });

  // Remove overflow markers that are no longer needed.
  overflowMarkerMap.forEach((marker, key) => {
    if (!wantedOverflowKeys.has(key)) {
      toRemove.push(marker);
      overflowMarkerMap.delete(key);
    }
  });

  // Create markers only for photos not already tracked (keeps existing DOM alive).
  wantedPhotoIds.forEach((id) => {
    if (!photoMarkerMap.has(id)) {
      const photo = photoById.get(id)!;
      const marker = createPhotoMarker(photo);
      photoMarkerMap.set(id, marker);
      toAdd.push(marker);
    }
  });

  // Create overflow markers only for coordinate groups not already tracked.
  wantedOverflowKeys.forEach((key) => {
    if (!overflowMarkerMap.has(key)) {
      const { photos, hiddenCount } = wantedOverflowData.get(key)!;
      const marker = createPhotoOverflowMarker(
        photos,
        hiddenCount,
      ) as PhotoOverflowMarker;
      overflowMarkerMap.set(key, marker);
      toAdd.push(marker);
    }
  });

  if (toRemove.length > 0) clusterLayer.removeLayers(toRemove);
  if (toAdd.length > 0) clusterLayer.addLayers(toAdd);
}

function createPhotoMarker(photo: PhotoWithGps): PhotoMarker {
  const marker = L.marker(photo.coordinates, {
    autoPanOnFocus: false,
    icon: createPhotoMarkerIcon(photo),
    keyboard: true,
  }) as PhotoMarker;

  marker.photo = photo;
  marker.on("click", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      openCorrectionPopup(photo);
      return;
    }
    handleMarkerClick(photo);
  });
  marker.on("mouseover", (e: L.LeafletMouseEvent) => {
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      hoveredMapPhoto.value = null;
      return;
    }
    hoveredMapPhoto.value = photo;
    mapTooltipPosition.value = {
      x: e.originalEvent.clientX + 16,
      y: e.originalEvent.clientY + 16,
    };
  });
  marker.on("mousemove", (e: L.LeafletMouseEvent) => {
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      hoveredMapPhoto.value = null;
      return;
    }
    mapTooltipPosition.value = {
      x: e.originalEvent.clientX + 16,
      y: e.originalEvent.clientY + 16,
    };
  });
  marker.on("mouseout", () => {
    hoveredMapPhoto.value = null;
  });

  return marker;
}

function createPhotoOverflowMarker(
  photos: PhotoWithGps[],
  hiddenCount: number,
): PhotoOverflowMarker {
  const marker = L.marker(photos[0].coordinates, {
    autoPanOnFocus: false,
    icon: createPhotoOverflowMarkerIcon(hiddenCount, photos.length),
    keyboard: true,
    title: `${photos.length} photos at this location`,
  }) as PhotoOverflowMarker;

  marker.photos = photos;
  marker.photoCount = hiddenCount;
  marker.on("click", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    openLocationPhotosDialog(photos);
  });
  marker.on("mouseover", () => {
    hoveredMapPhoto.value = null;
  });

  return marker;
}

function openLocationPhotosDialog(photos: PhotoWithGps[]) {
  locationDialogPhotos.value = photos;
  hoveredMapPhoto.value = null;
  showLocationPhotosDialog.value = true;
}

// Clear FAB selection when the location dialog is closed
watch(showLocationPhotosDialog, (open) => {
  if (!open) locationClearAllSelections();
});

function handleLocationSelectionChange(photoIds: (string | number)[]) {
  locationClearAllSelections();
  if (photoIds.length > 0) locationSelectAllPhotos(photoIds);
}

async function handleLocationDownload() {
  const photos = locationSelectedIds.value
    .map((id: number) => photosStore.photos?.find((p: any) => p.id == id))
    .filter(Boolean);
  await downloadPhotosZip(photos);
  locationClearAllSelections();
}

function handleLocationAddToCollection() {
  showLocationCollectionModal.value = true;
}

function handleLocationCollectionAdded() {
  showLocationCollectionModal.value = false;
  locationClearAllSelections();
}

async function handleLocationSendToChat() {
  await takeToChat(locationSelectedIds.value, locationClearAllSelections);
}

async function handleLocationToolSelected(
  toolId: string,
  canvasId: string | null = null,
) {
  await takeToTool(
    toolId,
    locationSelectedIds.value,
    locationClearAllSelections,
    canvasId,
  );
  closeToolSelector();
}

function removeMarkerClusterLayer() {
  const leafletMap = getLeafletMap();

  if (markerClusterLayer.value) {
    markerClusterLayer.value.clearLayers();
    const clusterLayer = markerClusterLayer.value as unknown as L.Layer;

    if (leafletMap?.hasLayer(clusterLayer)) {
      leafletMap.removeLayer(clusterLayer);
    }
  }

  markerClusterLayer.value = null;
  clearMarkerMaps();
}

// Handle marker click - fetch full photo data and open dialog
const handleMarkerClick = async (photo: any) => {
  try {
    // Fetch full photo details from API
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    selectedDialogPhoto.value = fullPhoto || photo;
    showPhotoInfoDialog.value = true;
  } catch (error) {
    console.error("Error fetching photo details:", error);
  }
};

async function handleLocationPhotoInfo(photo: any) {
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    selectedDialogPhoto.value = fullPhoto || photo;
    showPhotoInfoDialog.value = true;
  } catch (error) {
    console.error("Error fetching photo details:", error);
  }
}

// Map ready handler
const onMapReady = () => {
  const leafletMap = getLeafletMap();
  if (leafletMap) {
    L.control.zoom({ position: "bottomright" }).addTo(leafletMap);
    if (filteredPhotosWithGps.value.length > 1) {
      leafletMap.fitBounds(
        filteredPhotosWithGps.value.map((photo) => photo.coordinates),
        {
          animate: false,
          maxZoom: 13,
          padding: isMobile.value ? [0, 0] : [56, 56],
        },
      );
    }
  }
  initialMapBounds.value = null;
  refreshPhotoMarkers();
  isMapViewportReady.value = true;
};

// Watch only the stable identity of each marker (id + coords).
// This prevents a spurious map-pan when fetchPhoto updates photo metadata
// but does not add, remove, or move any marker.
const photosWithGpsKey = computed<string>(() =>
  photosWithGps.value
    .map(
      (p) =>
        `${p.id}:${p.coordinates[0].toFixed(6)},${p.coordinates[1].toFixed(6)}`,
    )
    .join("|"),
);

/** Returns true when a photo's location was assigned by AI inference (not real GPS). */
function isAiLocatedPhoto(photo: PhotoWithGps): boolean {
  return !!(photo.descriptions?.EXIF as any)?.aiLocationInference;
}

function openCorrectionPopup(photo: PhotoWithGps) {
  hoveredMapPhoto.value = null;
  correctionPhoto.value = photo;
  showCorrectionPopup.value = true;
}

interface CorrectionPayload {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string | null;
  granularity: string | null;
}

function handleCorrectionConfirmed(payload: CorrectionPayload) {
  const photo = correctionPhoto.value;
  if (!photo) return;

  // Optimistic store update so the marker relocates immediately
  const storePhoto = photosStore.allPhotos.find(
    (p: any) => String(p.id) === String(photo.id),
  );
  if (storePhoto) {
    const existingExif = (storePhoto.descriptions?.EXIF ?? {}) as Record<
      string,
      any
    >;
    const existingInference = existingExif.aiLocationInference ?? null;
    photosStore.updatePhoto(storePhoto.id, {
      descriptions: {
        ...(storePhoto.descriptions ?? {}),
        EXIF: {
          ...existingExif,
          gpsLatitude: payload.lat,
          gpsLongitude: payload.lng,
          gpsLatitudeRef: payload.lat < 0 ? "S" : "N",
          gpsLongitudeRef: payload.lng < 0 ? "W" : "E",
          aiLocationInference: existingInference
            ? {
                ...existingInference,
                formattedAddress: payload.formattedAddress,
                geocodeQuery: payload.formattedAddress,
                placeId: payload.placeId ?? existingInference.placeId,
                geocodeGranularity:
                  payload.granularity ?? existingInference.geocodeGranularity,
                correctedByUser: true,
              }
            : undefined,
        },
      },
    });
  }

  // Mark as corrected so the refreshed marker gets the pulse animation
  correctedPhotoIds.value = new Set([...correctedPhotoIds.value, photo.id]);
  message.success("Location updated");
}

watch(locationSelectedIds, () => {
  updateMarkerSelectionState();
});

watch(
  [
    confidenceFilter,
    granularityFilter,
    selectedVisualAspects,
    artisticScoreFilters,
    timeRangeFilter,
  ],
  () => {
    if (!hasLoadedInitialPhotos.value) return;
    newlyLocatedPhotoIds.value = new Set();
    refreshPhotoMarkers();
    // Update CSS classes on existing marker elements to clear the --new
    // highlight without recreating DOM nodes or reloading thumbnail images.
    updateExistingMarkerIcons();
  },
  { deep: true },
);

watch(photosWithGpsKey, async () => {
  if (!hasLoadedInitialPhotos.value) return;

  await nextTick();

  if (photosWithGps.value.length === 0) {
    initialMapBounds.value = null;
    isMapViewportReady.value = true;
    removeMarkerClusterLayer();
    return;
  }

  if (!map.value) {
    updateInitialMapBounds();
  }

  // Full reset: photo set or coordinates changed (e.g. location correction or AI job).
  refreshPhotoMarkers(true);
});

// Load photos on mount
onMounted(async () => {
  await photosStore.getOrFetch(false);
  updateInitialMapBounds();
  hasLoadedInitialPhotos.value = true;
  await nextTick();
  refreshPhotoMarkers();
  void refreshAiLocationSummary();

  if (mapContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      getLeafletMap()?.invalidateSize();
    });
    resizeObserver.observe(mapContainer.value);
  }

  window.addEventListener("keydown", handleRectKeyDown);
  window.addEventListener("keyup", handleRectKeyUp);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleRectKeyDown);
  window.removeEventListener("keyup", handleRectKeyUp);
  window.removeEventListener("mousemove", handleRectWindowMouseMove);
  window.removeEventListener("mouseup", handleRectWindowMouseUp);
  resizeObserver?.disconnect();
  resizeObserver = null;
  stopAiLocationPolling();
  removeMarkerClusterLayer();
});
</script>

<style scoped>
.world-map-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Ensure the location-selection FAB renders above the PhotosDialog overlay */
:deep(.floating-action-bar) {
  z-index: 3000 !important;
}

.gps-photos-label {
  display: none;
}

.map-loading-state {
  width: 100%;
  height: 100%;
}

.ai-location-button {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  box-shadow: 0 2px 12px rgba(18, 24, 38, 0.16);
}

.no-gps-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 24px;
  pointer-events: none;
}

.no-gps-content {
  text-align: center;
  max-width: 550px;
  pointer-events: auto;
}

.no-gps-icon {
  margin-bottom: var(--spacing-lg);
}

.no-gps-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: 0 0 0 0;
}

.no-gps-description {
  font-size: var(--font-size-md);
  color: var(--text-secondary);
  margin-top: 10px;
  margin-bottom: 5px;
  line-height: var(--line-height-relaxed);
}

.no-gps-instructions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-lg);
  align-items: center;
  justify-content: center;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 12px rgba(18, 24, 38, 0.1);
}

.no-gps-instruction-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 14px;
  color: var(--text-secondary);
}

.no-gps-ai-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

.no-gps-ai-label {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.map-container {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  opacity: 1;
  transition: opacity 0.18s ease;
}

/* Rect-select: capture layer that blocks Leaflet when Ctrl/Cmd is held */
.map-rect-select-layer {
  position: absolute;
  inset: 0;
  z-index: 800;
  pointer-events: none;
  cursor: default;
}

.map-rect-select-layer--active {
  pointer-events: all;
  cursor: crosshair;
}

/* Rect-select: visual rectangle drawn while dragging */
.map-rect-select-overlay {
  position: absolute;
  z-index: 801;
  pointer-events: none;
  border: 2px solid rgba(99, 102, 241, 0.85);
  background: rgba(99, 102, 241, 0.12);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.map-container--pending {
  opacity: 0;
}

:deep(.photo-map-div-icon) {
  background: transparent;
  border: 0;
}

:deep(.photo-single-marker) {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: visible;
  background: #e7e9ee;
  border: 3px solid #fff;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px rgba(18, 24, 38, 0.08);
  cursor: pointer;
  transition:
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

/* Clip the photo thumbnail to the circle without clipping the correction button */
:deep(.photo-single-marker > img),
:deep(.photo-single-marker > .photo-map-fallback) {
  border-radius: 50%;
  overflow: hidden;
  display: block;
  width: 100%;
  height: 100%;
}

:deep(.photo-single-marker:hover) {
  transform: scale(1.12);
  box-shadow:
    0 7px 20px rgba(18, 24, 38, 0.34),
    0 0 0 1px rgba(18, 24, 38, 0.12);
}

:deep(.photo-single-marker--new) {
  border-color: var(--accent-color);
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px var(--accent-color);
}

:deep(.photo-single-marker--new:hover) {
  box-shadow:
    0 7px 20px rgba(18, 24, 38, 0.34),
    0 0 0 1px var(--accent-color);
}

/* Granularity-based border colors for individual photo markers */
/* place → green (precise) | city → blue (medium) | region/country → amber (approximate) */
:deep(.photo-single-marker--place) {
  border-color: #4ade80;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px #4ade80;
}

:deep(.photo-single-marker--city) {
  border-color: #60a5fa;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px #60a5fa;
}

:deep(.photo-single-marker--region) {
  border-color: #fbbf24;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px #fbbf24;
}

:deep(.photo-single-marker--country) {
  border-color: #c084fc;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px #c084fc;
}

/* --new always wins over granularity colors */
:deep(.photo-single-marker--new.photo-single-marker--place),
:deep(.photo-single-marker--new.photo-single-marker--city),
:deep(.photo-single-marker--new.photo-single-marker--region),
:deep(.photo-single-marker--new.photo-single-marker--country) {
  border-color: var(--accent-color);
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px var(--accent-color);
}

:deep(.photo-overflow-marker) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: var(--primary-color);
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 1px rgba(18, 24, 38, 0.08);
  color: var(--text-on-primary);
  cursor: pointer;
  transition:
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

:deep(.photo-overflow-marker:hover) {
  transform: scale(1.12);
  box-shadow:
    0 7px 20px rgba(18, 24, 38, 0.34),
    0 0 0 1px rgba(18, 24, 38, 0.12);
}

:deep(.photo-overflow-marker span) {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

:deep(.photo-overflow-marker small) {
  position: absolute;
  right: -6px;
  bottom: -5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border: 1px solid var(--bg-container);
  border-radius: 999px;
  background: var(--accent-color);
  color: var(--text-on-accent);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

:deep(.photo-single-marker img),
:deep(.photo-cluster-tile img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

:deep(.photo-map-fallback) {
  display: block;
  width: 100%;
  height: 100%;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.38), transparent), #b7c0cc;
}

:deep(.photo-cluster-marker) {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
  transition: transform 0.18s ease;
}

:deep(.photo-cluster-marker:hover) {
  transform: scale(1.06);
}

:deep(.photo-cluster-mosaic) {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #e7e9ee;
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow:
    0 7px 22px rgba(18, 24, 38, 0.32),
    0 0 0 1px rgba(18, 24, 38, 0.1);
}

:deep(.photo-cluster-tile) {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

:deep(.photo-cluster-tile.tile-count-1) {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
}

:deep(.photo-cluster-tile.tile-count-2) {
  grid-row: 1 / -1;
}

:deep(.photo-cluster-tile.tile-count-3:first-child) {
  grid-row: 1 / -1;
}

:deep(.photo-cluster-count) {
  position: absolute;
  top: -7px;
  right: -7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  border: 1px solid var(--bg-container);
  border-radius: 999px;
  background: var(--primary-color);
  box-shadow: 0 3px 10px rgba(18, 24, 38, 0.28);
  color: var(--text-on-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

:deep(.photo-cluster-count--new) {
  background: var(--accent-color);
  color: var(--text-on-accent);
}

:deep(.photo-cluster-mosaic--new) {
  border-color: var(--accent-color);
  box-shadow:
    0 7px 22px rgba(18, 24, 38, 0.32),
    0 0 0 1px var(--accent-color);
}

/* ── Single-marker hover tooltip ────────────────────────────────────────── */

.map-photo-tooltip {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  max-width: 220px;
  padding: 8px;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  animation: mapTooltipFadeIn 0.15s ease-out;
}

@keyframes mapTooltipFadeIn {
  from {
    opacity: 0;
    transform: translate(-4px, -4px);
  }
  to {
    opacity: 1;
    transform: translate(0, 0);
  }
}

.map-tooltip-image {
  display: block;
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 4px;
}

.map-tooltip-footer {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Pencil correction button inside AI-inferred markers ─────────────────── */

:deep(.photo-marker-correct-btn) {
  position: absolute;
  bottom: -4px;
  left: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1.5px solid #fff;
  border-radius: 50%;
  background: var(--secondary-color, #3b82f6);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.7);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  z-index: 1;
}

:deep(.photo-marker-correct-btn svg) {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
}

:deep(.photo-single-marker:hover .photo-marker-correct-btn) {
  opacity: 1;
  transform: scale(1);
}

/* Corrected-marker pulse animation */
:deep(.photo-single-marker--corrected) {
  animation: markerCorrectPulse 0.7s ease-out forwards;
}

/* ── Selection overlay — shared accent ring + fill, identical across all marker types ── */

/* Individual photo markers */
:deep(.photo-single-marker--selected) {
  border-color: var(--accent-color) !important;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 3px var(--accent-color) !important;
}

:deep(.photo-single-marker--selected::after) {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--accent-color);
  opacity: 0.32;
  pointer-events: none;
  z-index: 1;
}

/* Overflow (+N) markers */
:deep(.photo-overflow-marker--selected) {
  border-color: var(--accent-color) !important;
  box-shadow:
    0 4px 14px rgba(18, 24, 38, 0.28),
    0 0 0 3px var(--accent-color) !important;
}

:deep(.photo-overflow-marker--selected::after) {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--accent-color);
  opacity: 0.32;
  pointer-events: none;
}

/* Cluster markers — ring on mosaic border */
:deep(.photo-cluster-mosaic--selected) {
  border-color: var(--accent-color);
  box-shadow:
    0 7px 22px rgba(18, 24, 38, 0.32),
    0 0 0 3px var(--accent-color);
}

/* Cluster overlay div injected inside mosaic (clipped to circle by overflow:hidden) */
:deep(.photo-cluster-selection-overlay) {
  position: absolute;
  inset: 0;
  background: var(--accent-color);
  opacity: 0.32;
  pointer-events: none;
  z-index: 1;
}

/* Cluster count badge */
:deep(.photo-cluster-count--selected) {
  background: var(--accent-color);
  color: var(--text-on-accent);
}

@keyframes markerCorrectPulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(99, 179, 237, 0.8);
  }
  40% {
    transform: scale(1.22);
    box-shadow: 0 0 0 8px rgba(99, 179, 237, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(99, 179, 237, 0);
  }
}

/* ── Leaflet controls: zoom & layers ─────────────────────────────────────── */

:deep(.leaflet-bar) {
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 2px 12px rgba(18, 24, 38, 0.14);
  /* border-radius: 10px; */
  overflow: hidden;
}

:deep(.leaflet-bar a) {
  background-color: var(--bg-container);
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  width: 32px;
  height: 32px;
  line-height: 30px;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

:deep(.leaflet-bar a:last-child) {
  border-bottom: none;
}

:deep(.leaflet-bar a:hover) {
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

:deep(.leaflet-bar a.leaflet-disabled) {
  color: var(--text-secondary);
  background-color: var(--bg-container);
  cursor: default;
}

/* Layers control toggle button */
:deep(.leaflet-control-layers) {
  border: 1px solid var(--border-color) !important;
  box-shadow: 0 2px 12px rgba(18, 24, 38, 0.14);
  border-radius: 10px;
  background: var(--bg-container);
}

:deep(.leaflet-control-layers-toggle) {
  border-radius: 10px;
}

/* Expanded layers panel */
:deep(.leaflet-control-layers-expanded) {
  background: var(--bg-container);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
}

:deep(.leaflet-control-layers label) {
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.leaflet-control-layers-separator) {
  border-top: 1px solid var(--border-color);
  margin: 4px 0;
}
</style>

<!-- Unscoped: Leaflet icon inversion for dark theme -->
<style>
[data-theme="dark"] .leaflet-control-layers-toggle {
  filter: brightness(0) invert(1);
}
</style>
