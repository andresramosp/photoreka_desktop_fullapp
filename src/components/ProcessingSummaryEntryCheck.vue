<template>
  <ProcessingSummaryModal :show="showModal" :job="job" @close="handleClose" />
</template>

<script setup>
import { ref, onMounted } from "vue";
import { api } from "@/utils/axios";
import ProcessingSummaryModal from "@/components/import-area/ProcessingSummaryModal.vue";
import { usePhotosStore } from "@/stores/photos";

const photosStore = usePhotosStore();

const API_URL = "/api/analyzer-process";
const PENDING_SUMMARY_MODALS_KEY = "pendingSummaryModals";
const SHOWN_SUMMARY_MODALS_KEY = "shownSummaryModals";
const SEEN_PROCESS_IDS_KEY = "seenProcessIds";

function getPendingSummaryModals() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_SUMMARY_MODALS_KEY)) || [];
  } catch {
    return [];
  }
}
function getShownSummaryModals() {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_SUMMARY_MODALS_KEY)) || [];
  } catch {
    return [];
  }
}
function getSeenProcessIds() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_PROCESS_IDS_KEY)) || [];
  } catch {
    return [];
  }
}
function addSeenProcessId(jobId) {
  const seen = getSeenProcessIds();
  if (!seen.includes(jobId)) {
    seen.push(jobId);
    localStorage.setItem(SEEN_PROCESS_IDS_KEY, JSON.stringify(seen));
  }
}
function addPendingSummaryModal(jobId) {
  const pending = getPendingSummaryModals();
  if (!pending.includes(jobId)) {
    pending.push(jobId);
    localStorage.setItem(PENDING_SUMMARY_MODALS_KEY, JSON.stringify(pending));
  }
}
function markSummaryModalAsShown(jobId) {
  const pending = getPendingSummaryModals().filter((id) => id !== jobId);
  localStorage.setItem(PENDING_SUMMARY_MODALS_KEY, JSON.stringify(pending));
  const shown = getShownSummaryModals();
  if (!shown.includes(jobId)) {
    shown.push(jobId);
    localStorage.setItem(SHOWN_SUMMARY_MODALS_KEY, JSON.stringify(shown));
  }
}

const showModal = ref(false);
const job = ref(null);

function handleClose() {
  if (job.value) {
    markSummaryModalAsShown(job.value.id);
  }
  showModal.value = false;
  job.value = null;
}

// Single check, run once when the app is entered. This component lives
// outside <router-view>, so SPA navigation between routes never remounts
// it — it only fires again on a full page load/refresh. Mirrors, on
// purpose byte-for-byte, the detection logic ProcessingPhotos.vue already
// runs while the user is sitting on Import Area's Processing tab, using
// the same localStorage bookkeeping (pendingSummaryModals /
// shownSummaryModals / seenProcessIds), so a finished analysis is
// surfaced even if the user never visits that tab.
async function checkOnce() {
  try {
    const response = await api.get(API_URL);
    const jobs = response.data
      .filter((proc) => !proc.isPreprocess)
      .map((proc) => ({
        id: proc.id,
        createdAt: proc.createdAt,
        status: proc.currentStage === "finished" ? "finished" : "processing",
        photos: proc.photos,
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    const seenIds = getSeenProcessIds();
    for (const j of jobs) {
      if (!seenIds.includes(j.id)) {
        if (j.status === "processing") {
          addPendingSummaryModal(j.id);
        }
        addSeenProcessId(j.id);
      }
    }

    const currentPending = getPendingSummaryModals();
    const finishedPendingJobs = jobs.filter(
      (j) => currentPending.includes(j.id) && j.status === "finished",
    );

    if (finishedPendingJobs.length > 0 && !showModal.value) {
      await photosStore.getOrFetch(true);
      job.value = finishedPendingJobs[0];
      showModal.value = true;
    }
  } catch (error) {
    console.error(
      "[ProcessingSummaryEntryCheck] Error checking processes:",
      error,
    );
  }
}

onMounted(() => {
  checkOnce();
});
</script>
