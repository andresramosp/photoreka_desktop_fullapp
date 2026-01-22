<template>
  <div class="world-map-view">
    <!-- Top-left label showing photos with GPS -->
    <div class="gps-photos-label">
      <n-tag :bordered="false" type="info" size="large">
        <template #icon>
          <n-icon :component="LocationOutline" />
        </template>
        {{ photosWithGps.length }} photos with location
      </n-tag>
    </div>

    <!-- No GPS photos message -->
    <div v-if="photosWithGps.length === 0" class="no-gps-message">
      <n-empty description="No photos with GPS data" style="margin-top: 60px">
        <template #icon>
          <n-icon size="80" :component="LocationOutline" />
        </template>
      </n-empty>
      <div
        style="
          text-align: center;
          margin-top: 20px;
          color: var(--text-secondary);
        "
      >
        <p>Upload photos with GPS information to see them on the map</p>
      </div>
    </div>

    <!-- Map container -->
    <div v-else ref="mapContainer" class="map-container">
      <l-map
        ref="map"
        :zoom="2"
        :center="[20, 0]"
        :options="{ zoomControl: true }"
        @ready="onMapReady"
        style="height: 100%; width: 100%"
      >
        <!-- ArcGIS Terrain Layer -->
        <l-tile-layer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
          :attribution="'&copy; <a href=&quot;https://www.esri.com&quot;>Esri</a>'"
          :max-zoom="18"
        />

        <!-- Photo markers -->
        <l-marker
          v-for="photo in photosWithGps"
          :key="photo.id"
          :lat-lng="photo.coordinates"
          @click="handleMarkerClick(photo)"
        >
          <l-icon :icon-size="[32, 32]">
            <div class="custom-marker">
              <img :src="photo.thumbnailUrl" alt="Photo" />
            </div>
          </l-icon>
        </l-marker>
      </l-map>
    </div>

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { usePhotosStore } from "@/stores/photos";
import { LocationOutline } from "@vicons/ionicons5";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import { LMap, LTileLayer, LMarker, LIcon } from "@vue-leaflet/vue-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL(
    "leaflet/dist/images/marker-icon-2x.png",
    import.meta.url,
  ).href,
  iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
  shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url)
    .href,
});

const photosStore = usePhotosStore();
const mapContainer = ref<HTMLElement | null>(null);
const map = ref<any>(null);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref<any>(null);

// Function to convert GPS array format to decimal degrees
function convertGpsArrayToDecimal(gpsArray: number[]): number {
  if (!gpsArray || gpsArray.length !== 3) return 0;
  const [degrees, minutes, seconds] = gpsArray;
  return degrees + minutes / 60 + seconds / 3600;
}

// Function to extract GPS coordinates from photo
function extractGpsCoordinates(photo: any): [number, number] | null {
  const exif = photo.descriptions?.EXIF;
  if (!exif) return null;

  let lat: number | null = null;
  let lng: number | null = null;

  // Format 1: Direct decimal coordinates
  if (exif.gpsLatitude !== undefined && exif.gpsLongitude !== undefined) {
    lat = exif.gpsLatitude;
    lng = exif.gpsLongitude;
  }
  // Format 2: Array format [degrees, minutes, seconds]
  else if (exif.gps?.lat && exif.gps?.lng) {
    lat = convertGpsArrayToDecimal(exif.gps.lat);
    lng = convertGpsArrayToDecimal(exif.gps.lng);
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
const photosWithGps = computed(() => {
  const allPhotos = photosStore.allPhotos || [];
  return allPhotos
    .map((photo) => {
      const coordinates = extractGpsCoordinates(photo);
      if (coordinates) {
        return {
          ...photo,
          coordinates,
        };
      }
      return null;
    })
    .filter((photo): photo is NonNullable<typeof photo> => photo !== null);
});

// Handle marker click - fetch full photo data and open dialog
const handleMarkerClick = async (photo: any) => {
  try {
    // Fetch full photo details from API
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    selectedDialogPhoto.value = fullPhoto;
    showPhotoInfoDialog.value = true;
  } catch (error) {
    console.error("Error fetching photo details:", error);
  }
};

// Map ready handler
const onMapReady = () => {
  // Fit map bounds to show all markers if there are photos
  if (photosWithGps.value.length > 0 && map.value?.leafletObject) {
    const bounds = photosWithGps.value.map((photo) => photo.coordinates);
    map.value.leafletObject.fitBounds(bounds, { padding: [50, 50] });
  }
};

// Load photos on mount
onMounted(async () => {
  await photosStore.getOrFetch(false);
});
</script>

<style scoped>
.world-map-view {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.gps-photos-label {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.no-gps-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  text-align: center;
}

.map-container {
  width: 100%;
  height: 100%;
}

.custom-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.custom-marker:hover {
  transform: scale(1.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.custom-marker img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
