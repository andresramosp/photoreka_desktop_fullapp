<script setup lang="ts">
/**
 * GeoRecoveryView — anonymous, paid one-shot "recover GPS for my photos"
 * product. UI inspired by WorldMapView: a fullscreen Leaflet map is always
 * the canvas; the wizard panels float on top.
 *
 * Step 0: welcome / privacy   → create anonymous session
 * Step 1: upload              → drag photos, resize+upload thumbs, save originals locally
 * Step 2: pay                 → mock payment for now
 * Step 3: processing          → poll backend job (markers stream in as they're located)
 * Step 4: results             → review, correct, download
 */

import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import {
  NAlert,
  NButton,
  NCheckbox,
  NIcon,
  NProgress,
  NSpace,
  NSpin,
  NStatistic,
  NTag,
  NText,
  NUpload,
  NUploadDragger,
  type UploadCustomRequestOptions,
  useMessage,
} from "naive-ui";
import {
  CloudUploadOutline,
  DownloadOutline,
  LockClosedOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import pLimit from "p-limit";

import {
  createSession,
  mockPay,
  pollJob,
  startJob,
} from "@/utils/geoRecovery/api";
import {
  getPhoto,
  isPaid,
  listPhotos,
  loadResults,
  loadSession,
  putPhoto,
  requestPersistentStorage,
  saveResults,
  saveSession,
  setPaid,
  wipeAll,
} from "@/utils/geoRecovery/db";
import {
  createPhotoClusterIcon,
  createPhotoMarkerIcon,
  escapeHtml,
  getClusterRadius,
  getMarkerThumbUrl,
  revokeAllThumbUrls,
  type GeoPhotoMarkerData,
  type PhotoMarker,
} from "@/utils/geoRecovery/markers";
import { uploadFiles, type UploadProgress } from "@/utils/geoRecovery/upload";
import { buildZip, type ZipProgress } from "@/utils/geoRecovery/zip";
import type {
  GeoRecoveryJobState,
  GeoRecoveryResult,
  GeoRecoveryResultsMap,
  LocalPhotoRecord,
  SessionInfo,
} from "@/utils/geoRecovery/types";

import GeoRecoveryCorrectionPopup from "@/components/geoRecovery/GeoRecoveryCorrectionPopup.vue";

const message = useMessage();

// ── State ──────────────────────────────────────────────────────────────────

const stepIndex = ref<number>(0); // 0 welcome | 1 upload | 2 pay | 3 processing | 4 results
const session = ref<SessionInfo | null>(null);
const photos = ref<LocalPhotoRecord[]>([]);
const paid = ref(false);
const acceptedPrivacy = ref(false);

const pendingFiles = ref<File[]>([]);
const uploadProgress = ref<UploadProgress | null>(null);
const uploading = ref(false);

const job = ref<GeoRecoveryJobState | null>(null);
const results = ref<GeoRecoveryResultsMap>({});
const polling = ref(false);
let pollHandle: ReturnType<typeof setInterval> | null = null;

const zipBusy = ref(false);
const zipProgress = ref<ZipProgress | null>(null);
const includeUnlocated = ref(false);

// Leaflet
const mapEl = ref<HTMLElement | null>(null);
const mapInstance = shallowRef<L.Map | null>(null);
const markerCluster = shallowRef<L.MarkerClusterGroup | null>(null);
const markerById = new Map<string, PhotoMarker>();

// Hover tooltip — same UX as WorldMapView
const hoveredMarkerData = ref<GeoPhotoMarkerData | null>(null);
const tooltipPosition = ref<{ x: number; y: number }>({ x: 0, y: 0 });

// Correction popup
const correctionShow = ref(false);
const correctionPhotoId = ref<string | null>(null);
const correctionThumb = ref<string | null>(null);
const correctionAddress = ref<string | null>(null);

// ── Computed ───────────────────────────────────────────────────────────────

const photoCount = computed(() => photos.value.length);
const hasResults = computed(() =>
  Object.values(results.value).some((r) => r?.status === "located"),
);
const locatedCount = computed(
  () =>
    Object.values(results.value).filter((r) => r?.status === "located").length,
);
const unknownCount = computed(
  () =>
    Object.values(results.value).filter((r) => r && r.status !== "located")
      .length,
);

const jobStageLabel = computed(() => {
  if (!job.value) return "Waiting…";
  switch (job.value.progressStage) {
    case "preparing":
      return "Preparing batches…";
    case "inferring":
      return "Inferring locations with AI…";
    case "placing":
      return "Geocoding and placing on map…";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "Working…";
  }
});

const showWizardBackdrop = computed(() => stepIndex.value <= 2);
const showMapInteractiveOverlay = computed(() => stepIndex.value >= 3);

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(async () => {
  await nextTick();
  ensureMap();
  await restoreState();
});

onUnmounted(() => {
  stopPolling();
  destroyMap();
  revokeAllThumbUrls();
});

watch(results, async () => {
  await refreshMarkers();
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function restoreState() {
  const existing = await loadSession();
  if (!existing) return;
  session.value = existing;
  photos.value = await listPhotos();
  results.value = await loadResults();
  paid.value = await isPaid();

  // Resume at the most relevant step.
  if (Object.keys(results.value).length > 0) {
    stepIndex.value = 4;
    await refreshMarkers();
  } else if (paid.value && photos.value.length > 0) {
    stepIndex.value = 3;
    kickOffPolling();
  } else if (photos.value.length > 0) {
    stepIndex.value = 1;
  } else {
    stepIndex.value = 0;
  }
}

async function handleAcceptAndStart() {
  if (!acceptedPrivacy.value) {
    message.warning("Please confirm the privacy notice to continue.");
    return;
  }
  try {
    const info = await createSession();
    session.value = info;
    await saveSession(info);
    await requestPersistentStorage();
    stepIndex.value = 1;
  } catch (error: any) {
    message.error(error?.message ?? "Could not start a session");
  }
}

// ── Upload ────────────────────────────────────────────────────────────────

function onFileChange(options: { fileList: any[] }) {
  pendingFiles.value = options.fileList
    .map((f) => f.file as File | undefined)
    .filter((f): f is File => Boolean(f));
}

function customRequest(options: UploadCustomRequestOptions) {
  options.onFinish();
}

async function startUpload() {
  if (!session.value) return;
  if (pendingFiles.value.length === 0) {
    message.warning("Add some photos first");
    return;
  }
  uploading.value = true;
  uploadProgress.value = {
    total: pendingFiles.value.length,
    done: 0,
    failed: 0,
    current: null,
  };
  try {
    const result = await uploadFiles({
      token: session.value.sessionToken,
      files: pendingFiles.value,
      onProgress: (p) => (uploadProgress.value = p),
    });
    photos.value = await listPhotos();

    if (result.failed.length > 0) {
      message.warning(
        `${result.failed.length} photo${
          result.failed.length === 1 ? "" : "s"
        } could not be uploaded. ${result.registered.length} succeeded.`,
      );
    } else {
      message.success(`Uploaded ${result.registered.length} photos`);
    }
    pendingFiles.value = [];
    if (result.registered.length > 0) stepIndex.value = 2;
  } catch (error: any) {
    message.error(error?.message ?? "Upload failed");
  } finally {
    uploading.value = false;
  }
}

// ── Payment ───────────────────────────────────────────────────────────────

const payBusy = ref(false);
async function handlePay() {
  if (!session.value) return;
  payBusy.value = true;
  try {
    await mockPay(session.value.sessionToken);
    paid.value = true;
    await setPaid(true);
    message.success("Payment confirmed");
    await handleStart();
  } catch (error: any) {
    message.error(error?.message ?? "Payment failed");
  } finally {
    payBusy.value = false;
  }
}

// ── Job ───────────────────────────────────────────────────────────────────

async function handleStart() {
  if (!session.value) return;
  try {
    job.value = await startJob(session.value.sessionToken);
    stepIndex.value = 3;
    kickOffPolling();
  } catch (error: any) {
    message.error(error?.message ?? "Could not start analysis");
  }
}

function kickOffPolling() {
  if (!session.value || pollHandle) return;
  polling.value = true;
  const tick = async () => {
    if (!session.value) return;
    try {
      const { job: latestJob, results: latestResults } = await pollJob(
        session.value.sessionToken,
      );
      job.value = latestJob;
      if (latestResults && Object.keys(latestResults).length > 0) {
        results.value = latestResults;
        await saveResults(latestResults);
      }
      if (latestJob?.status === "completed") {
        stopPolling();
        polling.value = false;
        stepIndex.value = 4;
        await fitMapToResults();
      } else if (latestJob?.status === "failed") {
        stopPolling();
        polling.value = false;
        message.error(latestJob.error ?? "Analysis failed");
      }
    } catch (error: any) {
      console.error("[GeoRecovery] poll error:", error);
    }
  };
  tick();
  pollHandle = setInterval(tick, 2500);
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

// ── Map ───────────────────────────────────────────────────────────────────

function ensureMap() {
  if (!mapEl.value || mapInstance.value) return;
  const map = L.map(mapEl.value, {
    center: [20, 0],
    zoom: 2,
    worldCopyJump: true,
    zoomControl: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>, © <a href='https://carto.com/attributions'>CARTO</a>",
    maxZoom: 19,
  }).addTo(map);

  const cluster = (L as any).markerClusterGroup({
    chunkedLoading: true,
    iconCreateFunction: createPhotoClusterIcon,
    maxClusterRadius: getClusterRadius,
    showCoverageOnHover: false,
    spiderfyDistanceMultiplier: 1.3,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
  });
  map.addLayer(cluster);
  mapInstance.value = map;
  markerCluster.value = cluster;

  map.on("click", () => (hoveredMarkerData.value = null));
}

function destroyMap() {
  if (mapInstance.value) {
    mapInstance.value.remove();
    mapInstance.value = null;
    markerCluster.value = null;
    markerById.clear();
  }
}

function getEffectiveCoords(
  photo: LocalPhotoRecord,
  result: GeoRecoveryResult,
): { lat: number; lng: number } | null {
  if (
    typeof photo.manualLat === "number" &&
    typeof photo.manualLng === "number"
  ) {
    return { lat: photo.manualLat, lng: photo.manualLng };
  }
  if (result.status === "located") {
    return { lat: result.lat, lng: result.lng };
  }
  return null;
}

function getResultAddress(result: GeoRecoveryResult): string {
  if (result.status !== "located") return "Unknown";
  return (
    [result.place, result.city, result.region, result.country]
      .filter(Boolean)
      .join(", ") || "Located"
  );
}

let _refreshMarkersRunning = false;
async function refreshMarkers() {
  if (_refreshMarkersRunning) return;
  _refreshMarkersRunning = true;
  try {
    const map = mapInstance.value;
    const cluster = markerCluster.value;
    if (!map || !cluster) return;

    cluster.clearLayers();
    markerById.clear();

    // Throttle marker thumb generation so we never decode thousands of full
    // originals into memory at once.
    const limit = pLimit(4);
    const tasks: Promise<PhotoMarker | null>[] = [];

    for (const photo of photos.value) {
      const r = results.value[photo.clientPhotoId];
      if (!r) continue;
      const coords = getEffectiveCoords(photo, r);
      if (!coords) continue;
      tasks.push(limit(() => createMarkerForPhoto(photo, r, coords)));
    }

    const built = await Promise.all(tasks);
    built.forEach((m) => {
      if (m) {
        cluster.addLayer(m);
        markerById.set(m.photoData.photo.clientPhotoId, m);
      }
    });
  } finally {
    _refreshMarkersRunning = false;
  }
}

async function createMarkerForPhoto(
  photo: LocalPhotoRecord,
  result: GeoRecoveryResult,
  coords: { lat: number; lng: number },
): Promise<PhotoMarker | null> {
  const thumbUrl = await getMarkerThumbUrl(photo);
  const granularity =
    result.status === "located" ? (result.granularity ?? null) : null;
  const hasManual =
    typeof photo.manualLat === "number" && typeof photo.manualLng === "number";

  const data: GeoPhotoMarkerData = {
    photo,
    result,
    lat: coords.lat,
    lng: coords.lng,
    granularity,
    hasManual,
    thumbUrl,
  };

  const marker = L.marker([coords.lat, coords.lng], {
    icon: createPhotoMarkerIcon(data),
    autoPanOnFocus: false,
    keyboard: true,
  }) as PhotoMarker;
  marker.photoData = data;

  marker.on("click", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      openCorrectionPopup(data);
      return;
    }
    // Center on photo
    map().setView([coords.lat, coords.lng], Math.max(map().getZoom(), 10));
  });
  marker.on("mouseover", (e: L.LeafletMouseEvent) => {
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      hoveredMarkerData.value = null;
      return;
    }
    hoveredMarkerData.value = data;
    tooltipPosition.value = {
      x: e.originalEvent.clientX + 16,
      y: e.originalEvent.clientY + 16,
    };
  });
  marker.on("mousemove", (e: L.LeafletMouseEvent) => {
    const target = e.originalEvent?.target as HTMLElement | null;
    if (target?.closest(".photo-marker-correct-btn")) {
      hoveredMarkerData.value = null;
      return;
    }
    tooltipPosition.value = {
      x: e.originalEvent.clientX + 16,
      y: e.originalEvent.clientY + 16,
    };
  });
  marker.on("mouseout", () => {
    hoveredMarkerData.value = null;
  });

  return marker;
}

function map(): L.Map {
  return mapInstance.value!;
}

async function fitMapToResults() {
  await nextTick();
  const m = mapInstance.value;
  if (!m) return;
  const points: L.LatLng[] = [];
  for (const photo of photos.value) {
    const r = results.value[photo.clientPhotoId];
    if (!r) continue;
    const coords = getEffectiveCoords(photo, r);
    if (coords) points.push(L.latLng(coords.lat, coords.lng));
  }
  if (points.length > 0) m.fitBounds(L.latLngBounds(points).pad(0.2));
}

// ── Correction popup ──────────────────────────────────────────────────────

function openCorrectionPopup(data: GeoPhotoMarkerData) {
  correctionPhotoId.value = data.photo.clientPhotoId;
  correctionThumb.value = data.thumbUrl;
  correctionAddress.value = getResultAddress(data.result);
  correctionShow.value = true;
}

async function onCorrectionConfirmed(payload: {
  photoId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}) {
  const record = await getPhoto(payload.photoId);
  if (!record) return;
  record.manualLat = payload.lat;
  record.manualLng = payload.lng;
  await putPhoto(record);
  photos.value = await listPhotos();

  // Reflect the new address in the stored result so tooltips show the corrected
  // place name.
  const current = results.value[payload.photoId];
  const updated: GeoRecoveryResult = {
    status: "located",
    source: "llm",
    reliability: "very_likely",
    granularity: "place",
    lat: payload.lat,
    lng: payload.lng,
    place: payload.formattedAddress,
    city:
      current && current.status === "located" ? (current.city ?? null) : null,
    region:
      current && current.status === "located" ? (current.region ?? null) : null,
    country:
      current && current.status === "located"
        ? (current.country ?? null)
        : null,
  };
  results.value = { ...results.value, [payload.photoId]: updated };
  await saveResults(results.value);
  message.success("Location updated");
}

// ── Download ──────────────────────────────────────────────────────────────

async function handleDownload() {
  zipBusy.value = true;
  zipProgress.value = null;
  try {
    const summary = await buildZip(
      { includeUnlocated: includeUnlocated.value },
      (p) => (zipProgress.value = p),
    );
    const url = URL.createObjectURL(summary.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photoreka-geo-recovery-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    message.success(
      `ZIP ready — ${summary.includedWithGps} with GPS, ` +
        `${summary.includedWithoutGps} without, ${summary.skipped} skipped.`,
    );
  } catch (error: any) {
    message.error(error?.message ?? "Failed to build ZIP");
  } finally {
    zipBusy.value = false;
    zipProgress.value = null;
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────

async function handleStartOver() {
  if (
    !window.confirm(
      "This will delete the current session, uploaded thumbs metadata, and the original photos kept in this browser. Continue?",
    )
  ) {
    return;
  }
  stopPolling();
  await wipeAll();
  revokeAllThumbUrls();
  session.value = null;
  photos.value = [];
  results.value = {};
  paid.value = false;
  acceptedPrivacy.value = false;
  job.value = null;
  stepIndex.value = 0;
  await refreshMarkers();
}

// ── Tooltip helpers ───────────────────────────────────────────────────────

const hoveredTooltipAddress = computed(() => {
  if (!hoveredMarkerData.value) return "";
  return getResultAddress(hoveredMarkerData.value.result);
});
</script>

<template>
  <div class="geo-recovery-fullscreen">
    <!-- Always-on fullscreen map -->
    <div ref="mapEl" class="geo-recovery-map" />

    <!-- Top-left brand chip — always visible -->
    <div class="geo-brand">
      <NIcon size="22" class="geo-brand-icon">
        <svg viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
          />
        </svg>
      </NIcon>
      <div class="geo-brand-text">
        <span class="geo-brand-title">Geo Recovery</span>
        <span class="geo-brand-subtitle">Add GPS to your photos</span>
      </div>
    </div>

    <!-- Stats badge (visible from step 3) -->
    <div
      v-if="showMapInteractiveOverlay && photoCount > 0"
      class="geo-stats-pill"
    >
      <NTag :bordered="false" size="small" type="success">
        {{ locatedCount }} located
      </NTag>
      <NTag :bordered="false" size="small"> {{ unknownCount }} unknown </NTag>
      <NTag :bordered="false" size="small" type="info">
        {{ photoCount }} total
      </NTag>
    </div>

    <!-- Wizard backdrop dim (steps 0–2 only) -->
    <div v-if="showWizardBackdrop" class="geo-backdrop" />

    <!-- Step 0: Welcome -->
    <div v-if="stepIndex === 0" class="geo-modal">
      <div class="geo-modal-card">
        <h2>Recover the GPS for your photos</h2>
        <ol class="how">
          <li>
            Your <strong>original photos never leave this browser</strong>.
            They're stored locally and survive reloads.
          </li>
          <li>
            We send only a downscaled <strong>thumbnail</strong> per photo to
            our server, used exclusively by the AI to recognize what it depicts.
          </li>
          <li>Our model proposes a location (city / place) for each photo.</li>
          <li>
            You download a ZIP with your <strong>original files</strong>, now
            with GPS coordinates written into their EXIF.
          </li>
        </ol>
        <NAlert type="info" :show-icon="true" style="margin: 12px 0">
          <template #header>Privacy</template>
          Originals stay on your device. Thumbnails on our servers are deleted
          automatically after 7 days. No account or email required.
        </NAlert>
        <NCheckbox v-model:checked="acceptedPrivacy" style="margin: 4px 0 12px">
          I understand that originals stay in this browser and only thumbnails
          are uploaded.
        </NCheckbox>
        <NButton
          type="primary"
          size="large"
          block
          :disabled="!acceptedPrivacy"
          @click="handleAcceptAndStart"
        >
          Start
        </NButton>
      </div>
    </div>

    <!-- Step 1: Upload -->
    <div v-else-if="stepIndex === 1" class="geo-modal">
      <div class="geo-modal-card">
        <h2>Add your photos</h2>
        <NUpload
          multiple
          :default-upload="false"
          :custom-request="customRequest"
          :show-file-list="true"
          accept="image/jpeg,image/png"
          @change="onFileChange"
        >
          <NUploadDragger>
            <NIcon size="44" :component="CloudUploadOutline" />
            <NText style="font-size: 15px"> Click or drag photos here </NText>
            <NText depth="3" style="margin-top: 4px">
              JPEG or PNG · up to {{ session?.maxPhotos ?? 5000 }} files
            </NText>
          </NUploadDragger>
        </NUpload>

        <div v-if="uploadProgress" class="progress-block">
          <NProgress
            :percentage="
              Math.round(
                ((uploadProgress.done + uploadProgress.failed) /
                  Math.max(uploadProgress.total, 1)) *
                  100,
              )
            "
            :status="uploadProgress.failed > 0 ? 'warning' : 'default'"
          />
          <NText depth="3" style="font-size: 12px">
            {{ uploadProgress.done }} / {{ uploadProgress.total }} uploaded
            <span v-if="uploadProgress.failed > 0"
              >· {{ uploadProgress.failed }} failed</span
            >
            <span v-if="uploadProgress.current">
              · {{ uploadProgress.current }}</span
            >
          </NText>
        </div>

        <NSpace v-if="photoCount > 0" align="center" style="margin: 10px 0 4px">
          <NTag type="success">{{ photoCount }} photo(s) ready</NTag>
        </NSpace>

        <NSpace>
          <NButton
            type="primary"
            :loading="uploading"
            :disabled="pendingFiles.length === 0"
            @click="startUpload"
          >
            Upload {{ pendingFiles.length || "" }} photo(s)
          </NButton>
          <NButton
            type="default"
            :disabled="photoCount === 0"
            @click="stepIndex = 2"
          >
            Continue ({{ photoCount }})
          </NButton>
        </NSpace>
      </div>
    </div>

    <!-- Step 2: Pay -->
    <div v-else-if="stepIndex === 2" class="geo-modal">
      <div class="geo-modal-card">
        <h2>One-time payment</h2>
        <p class="muted">
          Your {{ photoCount }} photo(s) are ready to be analyzed. Pay once,
          analyze once.
        </p>
        <NAlert type="warning" :show-icon="true" style="margin-bottom: 14px">
          Payment is currently mocked. A real Stripe checkout will live here
          before launch.
        </NAlert>
        <NSpace>
          <NButton :disabled="payBusy" @click="stepIndex = 1">Back</NButton>
          <NButton
            type="primary"
            size="large"
            :loading="payBusy"
            @click="handlePay"
          >
            <template #icon>
              <NIcon :component="LockClosedOutline" />
            </template>
            Pay &amp; analyze
          </NButton>
        </NSpace>
      </div>
    </div>

    <!-- Step 3: Processing — floating top-right card, map remains visible/interactive -->
    <div v-else-if="stepIndex === 3" class="geo-processing-card">
      <div class="geo-processing-head">
        <NSpin size="small" />
        <h3>Analyzing your photos</h3>
      </div>
      <p class="muted small">{{ jobStageLabel }}</p>
      <NProgress
        type="line"
        :percentage="job?.progressPercent ?? 0"
        :status="job?.status === 'failed' ? 'error' : 'default'"
        style="margin: 8px 0"
      />
      <NSpace :size="16" class="processing-stats">
        <NStatistic label="Processed" :value="job?.processed ?? 0">
          <template #suffix>/ {{ job?.total ?? photoCount }}</template>
        </NStatistic>
        <NStatistic label="Located" :value="job?.located ?? 0" />
        <NStatistic label="Unknown" :value="job?.unknown ?? 0" />
      </NSpace>
    </div>

    <!-- Step 4: Results — floating bottom action bar -->
    <div v-else-if="stepIndex === 4" class="geo-actions-bar">
      <NCheckbox v-model:checked="includeUnlocated">
        Include photos without a guessed location
      </NCheckbox>
      <NButton
        type="primary"
        :loading="zipBusy"
        :disabled="!hasResults && !includeUnlocated"
        @click="handleDownload"
      >
        <template #icon>
          <NIcon :component="DownloadOutline" />
        </template>
        Download ZIP
      </NButton>
      <span v-if="zipProgress" class="muted small">
        Packing {{ zipProgress.done }} / {{ zipProgress.total }}…
      </span>
    </div>

    <!-- Start-over (always visible if a session exists) -->
    <button
      v-if="session"
      class="geo-startover"
      @click="handleStartOver"
      title="Start a new session"
    >
      <NIcon :component="TrashOutline" size="14" />
      <span>Start new</span>
    </button>

    <!-- Hover tooltip (mirrors WorldMapView) -->
    <Transition name="map-tooltip">
      <div
        v-if="hoveredMarkerData"
        class="map-photo-tooltip"
        :style="{
          left: tooltipPosition.x + 'px',
          top: tooltipPosition.y + 'px',
        }"
      >
        <img
          v-if="hoveredMarkerData.thumbUrl"
          :src="hoveredMarkerData.thumbUrl"
          class="map-tooltip-image"
          alt=""
        />
        <div
          class="map-tooltip-footer"
          v-html="escapeHtml(hoveredTooltipAddress)"
        />
      </div>
    </Transition>

    <!-- Correction popup -->
    <GeoRecoveryCorrectionPopup
      v-model:show="correctionShow"
      :api-token="session?.sessionToken ?? null"
      :photo-id="correctionPhotoId"
      :photo-thumbnail="correctionThumb"
      :current-address="correctionAddress"
      @confirmed="onCorrectionConfirmed"
    />
  </div>
</template>

<style scoped>
.geo-recovery-fullscreen {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #0d1117;
  --geo-card-bg: rgba(20, 22, 28, 0.96);
  --geo-card-border: rgba(255, 255, 255, 0.08);
  --accent-color: #60a5fa;
  --primary-color: #3b82f6;
  --text-on-primary: #fff;
  --text-on-accent: #fff;
}

.geo-recovery-map {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #0d1117;
}

/* ── Brand chip (top-left) ───────────────────────────────────────────────── */

.geo-brand {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  color: #fff;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
}
.geo-brand-icon {
  color: var(--accent-color);
}
.geo-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.geo-brand-title {
  font-weight: 700;
  font-size: 14px;
}
.geo-brand-subtitle {
  font-size: 11px;
  opacity: 0.7;
}

/* ── Stats pill (top-right) ──────────────────────────────────────────────── */

.geo-stats-pill {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
}

/* ── Start-over button (bottom-left) ─────────────────────────────────────── */

.geo-startover {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition:
    color 0.18s ease,
    background 0.18s ease;
}
.geo-startover:hover {
  color: #ff6b6b;
  background: rgba(40, 30, 30, 0.96);
}

/* ── Wizard backdrop + centered modal (steps 0–2) ────────────────────────── */

.geo-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  z-index: 500;
}
.geo-modal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 600;
  pointer-events: none;
}
.geo-modal-card {
  pointer-events: auto;
  width: min(580px, 92vw);
  max-height: 86vh;
  overflow-y: auto;
  padding: 22px 24px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 14px;
  color: #fff;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
}
.geo-modal-card h2 {
  margin: 0 0 12px;
  font-size: 20px;
}
.how {
  padding-left: 22px;
  line-height: 1.65;
  margin: 8px 0 12px;
  font-size: 14px;
}
.muted {
  color: rgba(255, 255, 255, 0.6);
}
.small {
  font-size: 12px;
}
.progress-block {
  margin: 14px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Processing floating card (top-right, step 3) ────────────────────────── */

.geo-processing-card {
  position: absolute;
  top: 70px;
  right: 16px;
  z-index: 900;
  width: min(360px, 92vw);
  padding: 14px 16px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}
.geo-processing-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.geo-processing-head h3 {
  margin: 0;
  font-size: 15px;
}
.processing-stats {
  margin-top: 4px;
}

/* ── Results action bar (bottom-center, step 4) ──────────────────────────── */

.geo-actions-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: var(--geo-card-bg);
  border: 1px solid var(--geo-card-border);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Marker styles — duplicated from WorldMapView to keep visual parity.        */
/* ────────────────────────────────────────────────────────────────────────── */

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
:deep(.photo-single-marker--corrected) {
  animation: markerCorrectPulse 0.7s ease-out forwards;
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

/* ── Cluster mosaic ──────────────────────────────────────────────────────── */

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
  border: 1px solid rgba(0, 0, 0, 0.4);
  border-radius: 999px;
  background: var(--primary-color);
  box-shadow: 0 3px 10px rgba(18, 24, 38, 0.28);
  color: var(--text-on-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

/* ── Pencil correction button ────────────────────────────────────────────── */

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
  background: var(--accent-color);
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

/* ── Hover photo tooltip ─────────────────────────────────────────────────── */

.map-photo-tooltip {
  position: fixed;
  z-index: 10000;
  pointer-events: none;
  max-width: 220px;
  padding: 8px;
  background: rgba(20, 22, 28, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
  color: #fff;
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
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.map-tooltip-enter-active,
.map-tooltip-leave-active {
  transition: opacity 0.15s ease;
}
.map-tooltip-enter-from,
.map-tooltip-leave-to {
  opacity: 0;
}
</style>
