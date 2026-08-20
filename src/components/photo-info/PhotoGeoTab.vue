<template>
  <div class="geo-tab">
    <!-- No location placeholder -->
    <div v-if="!coordinates" class="geo-no-location">
      <n-icon size="44" class="geo-placeholder-icon">
        <GlobeOutline />
      </n-icon>
      <p class="geo-placeholder-title">No location found</p>
      <p class="geo-placeholder-subtitle">
        This photo doesn't have GPS data or an AI-inferred location.
      </p>
      <n-button type="primary" @click="navigateToWorldMap()">
        <template #icon>
          <n-icon><SparklesOutline /></n-icon>
        </template>
        Try Geo-Inference
      </n-button>
    </div>

    <!-- Mini map -->
    <div v-else class="geo-map-section">
      <div class="geo-map-footer">
        <div v-if="displayAddress" class="geo-address">
          <n-icon size="13" style="flex-shrink: 0">
            <LocationOutline />
          </n-icon>
          <span>{{ displayAddress }}</span>
        </div>
      </div>
      <div class="geo-map-wrap">
        <div ref="mapEl" class="geo-map-container"></div>
        <n-button
          v-if="!isWorldMapRoute"
          class="geo-map-floating-btn"
          size="small"
          type="primary"
          @click="handleViewInWorldMap"
        >
          View in World Map
        </n-button>
      </div>
    </div>

    <!-- Location correction popup -->
    <LocationCorrectionPopup
      :show="showCorrectionPopup"
      :photoThumbnail="photo?.thumbnailUrl ?? null"
      :currentAddress="displayAddress"
      :suggestions="correctionSuggestions"
      :isSearching="correctionSearching"
      :isSaving="correctionSaving"
      :sessionLimitReached="correctionLimitReached"
      @update:show="showCorrectionPopup = $event"
      @search="handleCorrectionSearch"
      @confirmed="handleCorrectionConfirmed"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NIcon, NButton, useMessage } from "naive-ui";
import {
  GlobeOutline,
  SparklesOutline,
  LocationOutline,
} from "@vicons/ionicons5";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import LocationCorrectionPopup, {
  type LocationSuggestion,
} from "../world-map/LocationCorrectionPopup.vue";
import { api } from "@/utils/axios.js";
import { usePhotosStore } from "@/stores/photos.js";

const props = defineProps<{
  photo: any;
}>();

const emit = defineEmits(["request-close"]);

const router = useRouter();
const route = useRoute();
const message = useMessage();
const photosStore = usePhotosStore();

const isWorldMapRoute = computed(() => {
  return route.name === "world-map" || route.path.startsWith("/worldmap");
});

function navigateToWorldMap(
  query: Record<string, string | number | undefined> = {},
) {
  emit("request-close");
  void router.push({
    name: "world-map",
    query,
  });
}

function handleViewInWorldMap() {
  if (!activeCoordinates.value) return;

  navigateToWorldMap({
    lat: activeCoordinates.value[0],
    lng: activeCoordinates.value[1],
    photoId: props.photo?.id,
  });
}

// ─── Location extraction (same logic as WorldMapView) ─────────────────────────

function convertGpsArrayToDecimal(gpsArray: number[]): number {
  if (!gpsArray || gpsArray.length !== 3) return 0;
  const [degrees, minutes, seconds] = gpsArray;
  return degrees + minutes / 60 + seconds / 3600;
}

function applyGpsReference(value: number, reference?: string): number {
  if (reference === "S" || reference === "W") return -Math.abs(value);
  return value;
}

function extractCoordinates(photo: any): [number, number] | null {
  if (
    photo?.inferredLocation?.lat != null &&
    photo?.inferredLocation?.lng != null
  ) {
    const lat = Number(photo.inferredLocation.lat);
    const lng = Number(photo.inferredLocation.lng);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return [lat, lng];
  }

  const exif = photo?.descriptions?.EXIF;
  if (!exif) return null;

  let lat: number | null = null;
  let lng: number | null = null;

  if (exif.gpsLatitude !== undefined && exif.gpsLongitude !== undefined) {
    lat = applyGpsReference(exif.gpsLatitude, exif.gpsLatitudeRef);
    lng = applyGpsReference(exif.gpsLongitude, exif.gpsLongitudeRef);
  } else if (exif.gps?.lat != null && exif.gps?.lng != null) {
    const rawLat = Array.isArray(exif.gps.lat)
      ? convertGpsArrayToDecimal(exif.gps.lat)
      : Number(exif.gps.lat);
    const rawLng = Array.isArray(exif.gps.lng)
      ? convertGpsArrayToDecimal(exif.gps.lng)
      : Number(exif.gps.lng);
    lat = exif.gps.latRef ? applyGpsReference(rawLat, exif.gps.latRef) : rawLat;
    lng = exif.gps.lngRef ? applyGpsReference(rawLng, exif.gps.lngRef) : rawLng;
  }

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

const coordinates = computed(() => extractCoordinates(props.photo));

// Overrides stale prop-derived coordinates after a successful correction
const correctedCoords = ref<[number, number] | null>(null);
const activeCoordinates = computed(
  () => correctedCoords.value ?? coordinates.value,
);

const isAiLocated = computed(() => props.photo?.inferredLocation?.lat != null);

function formatAddressToTitleCase(address: string): string {
  const smallWords = new Set([
    "and",
    "or",
    "but",
    "nor",
    "yet",
    "a",
    "an",
    "the",
    "in",
    "on",
    "at",
    "by",
    "to",
    "from",
    "of",
    "with",
    "for",
    "as",
    "is",
    "be",
    "&",
  ]);
  return address
    .split(", ")
    .map((part) => {
      const words = part.split(" ");
      return words
        .map((word, index) => {
          if (
            index === 0 ||
            index === words.length - 1 ||
            !smallWords.has(word.toLowerCase())
          ) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          }
          return word.toLowerCase();
        })
        .join(" ");
    })
    .join(", ");
}

const displayAddress = computed(() => {
  if (props.photo?.inferredLocation?.queryNormalized) {
    return formatAddressToTitleCase(
      props.photo.inferredLocation.queryNormalized,
    );
  }
  return null;
});

function getGranularityClass(): string {
  const exif = (props.photo?.descriptions?.EXIF ?? {}) as Record<string, any>;
  const granularity: string | null =
    props.photo?.inferredLocation?.granularity ??
    exif.aiLocationInference?.geocodeGranularity ??
    null;
  if (granularity === "place") return "photo-single-marker--place";
  if (granularity === "city") return "photo-single-marker--city";
  if (granularity === "region") return "photo-single-marker--region";
  if (granularity === "country") return "photo-single-marker--country";
  return "";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c];
  });
}

function buildMarkerIcon(): L.DivIcon {
  const granularityClass = getGranularityClass();
  const classes = ["photo-single-marker", granularityClass]
    .filter(Boolean)
    .join(" ");

  const thumbnailUrl = props.photo?.thumbnailUrl ?? "";
  const imgHtml = thumbnailUrl
    ? `<img src="${escapeHtml(thumbnailUrl)}" alt="" />`
    : '<span class="photo-map-fallback"></span>';

  const pencilHtml = isAiLocated.value
    ? `<button class="photo-marker-correct-btn" title="Correct location" aria-label="Correct location">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>
      </button>`
    : "";

  return L.divIcon({
    className: "photo-map-div-icon photo-single-div-icon",
    html: `<div class="${classes}" aria-label="${escapeHtml(props.photo?.originalFileName ?? "Photo")}">${imgHtml}${pencilHtml}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

// ─── Map initialisation ───────────────────────────────────────────────────────

const mapEl = ref<HTMLElement | null>(null);
let mapInstance: L.Map | null = null;
let markerInstance: L.Marker | null = null;

function initMap() {
  if (!mapEl.value || !coordinates.value) return;

  mapInstance = L.map(mapEl.value, {
    center: coordinates.value,
    zoom: 5,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    keyboard: false,
    zoomControl: false,
    attributionControl: true,
    boxZoom: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapInstance);

  markerInstance = L.marker(coordinates.value, {
    icon: buildMarkerIcon(),
    interactive: true,
  }).addTo(mapInstance);

  markerInstance.on("click", (e: L.LeafletMouseEvent) => {
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      openCorrectionPopup();
    }
  });
}

function destroyMap() {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
    markerInstance = null;
  }
}

function refreshMarker() {
  if (markerInstance && coordinates.value) {
    markerInstance.setLatLng(coordinates.value);
    markerInstance.setIcon(buildMarkerIcon());
  }
  if (mapInstance && coordinates.value) {
    mapInstance.setView(coordinates.value, mapInstance.getZoom());
  }
}

onMounted(async () => {
  if (coordinates.value) {
    await nextTick();
    initMap();
  }
});

onUnmounted(() => {
  destroyMap();
});

// Reposition the map when the photo changes.
// En el dialogo de info este componente vive dentro del scroll y ya no se
// desmonta al cambiar de pestaña, asi que este watch salta en cada flecha:
// reconstruir Leaflet entero costaria un parpadeo y una tanda de tiles nueva
// por foto. Se reutiliza la instancia y solo se recoloca la vista.
watch(
  () => props.photo?.id,
  async () => {
    correctedCoords.value = null;
    if (!coordinates.value) {
      destroyMap();
      return;
    }
    if (mapInstance) {
      refreshMarker();
      return;
    }
    await nextTick();
    initMap();
  },
);

// Refresh marker when coordinates update (e.g. after correction)
watch(coordinates, (newCoords) => {
  if (!newCoords) {
    destroyMap();
    return;
  }
  if (!mapInstance) {
    nextTick().then(initMap);
    return;
  }
  refreshMarker();
});

// ─── Location correction popup ────────────────────────────────────────────────

const showCorrectionPopup = ref(false);
const correctionSuggestions = ref<LocationSuggestion[]>([]);
const correctionSearching = ref(false);
const correctionSaving = ref(false);
const correctionLimitReached = ref(false);

function openCorrectionPopup() {
  correctionSuggestions.value = [];
  correctionSearching.value = false;
  correctionSaving.value = false;
  correctionLimitReached.value = false;
  showCorrectionPopup.value = true;
}

async function handleCorrectionSearch(payload: {
  query: string;
  sessionToken: string;
}) {
  correctionSearching.value = true;
  try {
    const { data } = await api.post("/api/geocoding/suggest", {
      query: payload.query,
      session_token: payload.sessionToken,
    });
    correctionSuggestions.value = data.suggestions ?? [];
  } catch (error: any) {
    correctionSuggestions.value = [];
  } finally {
    correctionSearching.value = false;
  }
}

async function handleCorrectionConfirmed(payload: {
  mapboxId: string;
  sessionToken: string;
  displayAddress: string;
}) {
  if (!props.photo?.id) return;
  correctionSaving.value = true;
  try {
    const { data } = await api.post("/api/geocoding/retrieve", {
      mapbox_id: payload.mapboxId,
      session_token: payload.sessionToken,
    });
    if (!data || data.lat == null || data.lng == null)
      throw new Error("Could not retrieve coordinates");

    await api.patch(`/api/photos/${props.photo.id}/location`, {
      geocodeCacheId: data.geocodeCacheId,
    });

    // Optimistic store update
    const storePhoto = photosStore.allPhotos.find(
      (p: any) => String(p.id) === String(props.photo.id),
    );
    if (storePhoto) {
      const existingExif = (storePhoto.descriptions?.EXIF ?? {}) as Record<
        string,
        any
      >;
      const existingInference = existingExif.aiLocationInference ?? null;
      photosStore.updatePhoto(storePhoto.id, {
        inferredLocation: (storePhoto as any).inferredLocation
          ? {
              ...(storePhoto as any).inferredLocation,
              lat: data.lat,
              lng: data.lng,
              formattedAddress: data.formattedAddress ?? payload.displayAddress,
              queryNormalized: data.formattedAddress ?? payload.displayAddress,
              granularity:
                data.granularity ??
                (storePhoto as any).inferredLocation?.granularity,
            }
          : (storePhoto as any).inferredLocation,
        descriptions: {
          ...(storePhoto.descriptions ?? {}),
          EXIF: {
            ...existingExif,
            aiLocationInference: existingInference
              ? {
                  reliability: existingInference.reliability,
                  inferredAt: existingInference.inferredAt,
                  proximityLocated: existingInference.proximityLocated,
                  proximitySourcePhotoId:
                    existingInference.proximitySourcePhotoId,
                  correctedByUser: true,
                }
              : undefined,
          },
        },
      });
    }

    showCorrectionPopup.value = false;

    // Directly refresh the map with the new coordinates from the API response,
    // because props.photo may not update reactively when the store changes.
    const newCoords: [number, number] = [data.lat, data.lng];
    correctedCoords.value = newCoords;
    if (mapInstance && markerInstance) {
      markerInstance.setLatLng(newCoords);
      markerInstance.setIcon(buildMarkerIcon());
      mapInstance.setView(newCoords, mapInstance.getZoom());
    }

    message.success("Location updated");
  } catch (error: any) {
    if (error?.response?.status === 429) {
      correctionLimitReached.value = true;
    } else {
      message.error("Failed to update location");
    }
  } finally {
    correctionSaving.value = false;
  }
}
</script>

<style scoped>
.geo-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── No-location placeholder ───────────────────────────────────────────────── */

.geo-no-location {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  /* Es un vacio, no contenido: no debe pesar tanto en la columna como el mapa
     de una foto que si tiene ubicacion. */
  min-height: 190px;
  text-align: center;
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-color);
}

.geo-placeholder-icon {
  color: var(--text-tertiary);
  opacity: 0.5;
}

.geo-placeholder-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.geo-placeholder-subtitle {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  max-width: 260px;
  line-height: 1.5;
}

/* ── Map section ───────────────────────────────────────────────────────────── */

.geo-map-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  overflow: hidden;
}

.geo-map-wrap {
  position: relative;
}

.geo-map-container {
  width: 100%;
  height: 255px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.geo-map-floating-btn {
  position: absolute;
  bottom: 25px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 401;
  white-space: nowrap;
}

.geo-map-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-xs);
}

.geo-address {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  overflow: hidden;
}

.geo-address span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Marker styles (Leaflet creates DOM outside Vue scope, use :deep) ──────── */

:deep(.photo-map-div-icon) {
  background: transparent;
  border: 0;
}

:deep(.photo-map-div-icon:hover) {
  z-index: 10000 !important;
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

:deep(.photo-single-marker > img),
:deep(.photo-single-marker > .photo-map-fallback) {
  border-radius: 50%;
  overflow: hidden;
  display: block;
  width: 100%;
  height: 100%;
}

:deep(.photo-single-marker img) {
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

:deep(.photo-single-marker:hover) {
  transform: scale(1.12);
  box-shadow:
    0 7px 20px rgba(18, 24, 38, 0.34),
    0 0 0 1px rgba(18, 24, 38, 0.12);
}

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
</style>
