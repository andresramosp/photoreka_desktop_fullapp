<template>
  <div class="world-map-view">
    <!-- Top-right label showing photos with GPS -->
    <div class="gps-photos-label">
      <n-icon :component="LocationOutline" class="gps-label-icon" />
      <span class="gps-label-count">{{ photosWithGps.length }}</span>
      <span class="gps-label-text">photos with location</span>
    </div>

    <!-- No GPS photos message -->
    <div v-if="photosWithGps.length === 0" class="no-gps-message">
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
      </div>
    </div>

    <!-- Map container -->
    <div v-else ref="mapContainer" class="map-container">
      <l-map
        ref="map"
        :zoom="2"
        :center="[20, 0]"
        :options="{ zoomControl: false }"
        @ready="onMapReady"
        style="height: 100%; width: 100%"
      >
        <!-- Layer control -->
        <LControlLayers position="topright" />

        <!-- Base layer: OpenStreetMap -->
        <LTileLayer
          name="OpenStreetMap"
          layer-type="base"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
          :maxZoom="19"
        />

        <!-- Base layer: Esri Satellite -->
        <LTileLayer
          name="Satélite (Esri)"
          layer-type="base"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="© Esri, Maxar, Earthstar Geographics"
          :maxZoom="19"
        />
      </l-map>
    </div>

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      @change-photo="selectedDialogPhoto = $event"
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
import {
  LocationOutline,
  EarthOutline,
  CameraOutline,
  NavigateOutline,
  ImagesOutline,
} from "@vicons/ionicons5";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import { LMap, LTileLayer, LControlLayers } from "@vue-leaflet/vue-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

type GpsCoordinates = [number, number];

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

type PhotoMarker = L.Marker & { photo: PhotoWithGps };

const photosStore = usePhotosStore();
const mapContainer = ref<HTMLElement | null>(null);
const map = ref<any>(null);
const markerClusterLayer = shallowRef<L.MarkerClusterGroup | null>(null);
const hasFittedInitialBounds = ref(false);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref<any>(null);
let resizeObserver: ResizeObserver | null = null;

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
  // Format 2: Array format [degrees, minutes, seconds]
  else if (exif.gps?.lat && exif.gps?.lng) {
    lat = applyGpsReference(
      convertGpsArrayToDecimal(exif.gps.lat),
      exif.gps.latRef,
    );
    lng = applyGpsReference(
      convertGpsArrayToDecimal(exif.gps.lng),
      exif.gps.lngRef,
    );
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

function getLeafletMap(): L.Map | null {
  return map.value?.leafletObject ?? null;
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

function createPhotoMarkerIcon(photo: PhotoWithGps): L.DivIcon {
  return L.divIcon({
    className: "photo-map-div-icon photo-single-div-icon",
    html: `<div class="photo-single-marker" aria-label="${escapeHtml(
      getPhotoTitle(photo),
    )}">${createPhotoImageMarkup(photo)}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function getClusterIconSize(count: number): number {
  if (count >= 100) return 74;
  if (count >= 10) return 66;
  return 58;
}

function createClusterTileMarkup(markers: PhotoMarker[]): string {
  const photos = markers.slice(0, 4).map((marker) => marker.photo);
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
  const markers = cluster.getAllChildMarkers() as PhotoMarker[];
  const count = cluster.getChildCount();
  const size = getClusterIconSize(count);

  return L.divIcon({
    className: "photo-map-div-icon photo-cluster-div-icon",
    html: `
      <div class="photo-cluster-marker" aria-label="${count} photos">
        <div class="photo-cluster-mosaic">
          ${createClusterTileMarkup(markers)}
        </div>
        <span class="photo-cluster-count">${count}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
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

function fitInitialBounds() {
  const leafletMap = getLeafletMap();
  if (
    !leafletMap ||
    hasFittedInitialBounds.value ||
    photosWithGps.value.length === 0
  ) {
    return;
  }

  const bounds = L.latLngBounds(
    photosWithGps.value.map((photo) => photo.coordinates),
  );

  if (!bounds.isValid()) return;

  if (photosWithGps.value.length === 1) {
    leafletMap.setView(bounds.getCenter(), 12, { animate: false });
  } else {
    leafletMap.fitBounds(bounds, { maxZoom: 13, padding: [56, 56] });
  }

  hasFittedInitialBounds.value = true;
}

function refreshPhotoMarkers() {
  const clusterLayer = ensureMarkerClusterLayer();
  if (!clusterLayer) return;

  clusterLayer.clearLayers();

  const markers = photosWithGps.value.map((photo) => {
    const marker = L.marker(photo.coordinates, {
      icon: createPhotoMarkerIcon(photo),
      keyboard: true,
      title: getPhotoTitle(photo),
    }) as PhotoMarker;

    marker.photo = photo;
    marker.on("click", (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      handleMarkerClick(photo);
    });

    return marker;
  });

  clusterLayer.addLayers(markers);
  fitInitialBounds();
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

// Map ready handler
const onMapReady = () => {
  const leafletMap = getLeafletMap();
  if (leafletMap) {
    L.control.zoom({ position: "bottomright" }).addTo(leafletMap);
  }
  refreshPhotoMarkers();
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

watch(photosWithGpsKey, async () => {
  await nextTick();

  if (photosWithGps.value.length === 0) {
    hasFittedInitialBounds.value = false;
    removeMarkerClusterLayer();
    return;
  }

  refreshPhotoMarkers();
});

// Load photos on mount
onMounted(async () => {
  await photosStore.getOrFetch(false);
  await nextTick();
  refreshPhotoMarkers();

  if (mapContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      getLeafletMap()?.invalidateSize();
    });
    resizeObserver.observe(mapContainer.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
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

.gps-photos-label {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px 7px 10px;
  background: var(--bg-container);
  border-radius: var(--radius-md);
  /* box-shadow:
    0 2px 12px rgba(18, 24, 38, 0.14),
    0 0 0 1px var(--border-color); */
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  pointer-events: none;
  user-select: none;
}

.gps-label-icon {
  font-size: 16px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.gps-label-count {
  font-weight: 700;
  color: var(--primary-color);
}

.gps-label-text {
  color: var(--text-secondary);
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

.map-container {
  width: 100%;
  height: 100%;
}

:deep(.photo-map-div-icon) {
  background: transparent;
  border: 0;
}

:deep(.photo-single-marker) {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
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

:deep(.photo-single-marker:hover) {
  transform: scale(1.12);
  box-shadow:
    0 7px 20px rgba(18, 24, 38, 0.34),
    0 0 0 1px rgba(18, 24, 38, 0.12);
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
  border: 2px solid var(--bg-container);
  border-radius: 999px;
  background: var(--primary-color);
  box-shadow: 0 3px 10px rgba(18, 24, 38, 0.28);
  color: var(--text-on-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
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
